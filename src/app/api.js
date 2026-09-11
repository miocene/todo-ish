let accountId;

export function setApiAccount(id) {
  accountId = id;
}

const apiOrigin =
  import.meta.env?.VITE_API_ORIGIN?.trim().replace(/\/$/, "") || "";

export function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers);
  if (accountId && path.startsWith("/data"))
    headers.set("x-app-user-id", accountId);
  return fetch(`${apiOrigin}/api${path}`, {
    credentials: "include",
    signal: AbortSignal.timeout(15_000),
    ...options,
    headers,
  });
}
