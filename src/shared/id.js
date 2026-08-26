export function uid(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}
