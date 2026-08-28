export function apiUrl(path) {
  const configuredOrigin = import.meta.env.VITE_API_ORIGIN?.trim().replace(/\/$/, "");
  return `${configuredOrigin || ""}/api${path}`;
}

export function apiFetch(path, options = {}) {
  return fetch(apiUrl(path), { credentials: "include", ...options });
}
