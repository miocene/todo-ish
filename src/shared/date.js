const pad = (value) => String(value).padStart(2, "0");

export function toIsoDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const todayIso = () => toIsoDate(new Date());

export function parseIsoDate(value) {
  return new Date(`${value}T12:00:00`);
}

export function dateKey(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : toIsoDate(date);
}

export function shiftIsoDate(value, amount) {
  const date = parseIsoDate(value);
  date.setDate(date.getDate() + amount);
  return toIsoDate(date);
}
