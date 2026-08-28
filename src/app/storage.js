export function readStoredJson(key, fallback = null) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function writeStoredJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function normalizeInventory(value, fallback) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return structuredClone(fallback);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, count]) => Number.isInteger(count) && count >= 0)
      .map(([catalogId, count]) => [catalogId, count]),
  );
}
