export class AuthRequestLimitError extends Error {
  statusCode = 429;
  constructor(retryAfter) {
    super("Too many sign-in attempts. Wait a moment and try again.");
    this.retryAfter = retryAfter;
  }
}

// Use the socket address only. Forwarded headers are untrusted; a household
// behind Caddy shares this allowance. Both the map and total work are bounded.
export function createAuthRequestLimit({
  now = Date.now,
  burst = 20,
  perMinute = 30,
  concurrent = 4,
  maxClients = 1024,
} = {}) {
  const clients = new Map();
  const global = { tokens: burst, at: now() };
  let active = 0;
  function refill(bucket, at) {
    bucket.tokens = Math.min(burst, bucket.tokens + (Math.max(0, at - bucket.at) * perMinute) / 60_000);
    bucket.at = at;
  }
  return {
    acquire(address) {
      const at = now();
      for (const [key, value] of clients) if (at - value.at > 120_000) clients.delete(key);
      let client = clients.get(address);
      if (!client) {
        if (clients.size >= maxClients) throw new AuthRequestLimitError(60);
        client = { tokens: burst, at };
        clients.set(address, client);
      }
      refill(global, at);
      refill(client, at);
      if (active >= concurrent || global.tokens < 1 || client.tokens < 1)
        throw new AuthRequestLimitError(
          Math.max(1, Math.ceil(((1 - Math.min(global.tokens, client.tokens)) * 60) / perMinute)),
        );
      global.tokens--;
      client.tokens--;
      active++;
      let released = false;
      return () => {
        if (!released) {
          released = true;
          active--;
        }
      };
    },
  };
}
