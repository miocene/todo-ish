import assert from "node:assert/strict";
import test from "node:test";
import { createAuthRequestLimit } from "../src/auth-request-limit.mjs";
test("authentication concurrency, throughput and client cardinality are bounded; retries recover", () => {
  let time = 0;
  const limiter = createAuthRequestLimit({
    now: () => time,
    burst: 3,
    concurrent: 2,
    perMinute: 60,
    maxClients: 2,
  });
  const first = limiter.acquire("one");
  const second = limiter.acquire("one");
  assert.throws(
    () => limiter.acquire("one"),
    (error) => error.statusCode === 429 && error.retryAfter >= 1,
  );
  first();
  first();
  second();
  limiter.acquire("two")();
  assert.throws(() => limiter.acquire("one"), /Too many/);
  assert.throws(() => limiter.acquire("three"), /Too many/);
  time = 1000;
  limiter.acquire("one")();
  time = 121_001;
  limiter.acquire("three")();
});
