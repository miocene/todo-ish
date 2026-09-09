const pad = (value) => String(value).padStart(2, "0");

export function toIsoDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const todayIso = () => toIsoDate(new Date());

export function parseIsoDate(value) {
  return new Date(`${value}T12:00:00`);
}

export function shiftIsoDate(value, amount) {
  const date = parseIsoDate(value);
  date.setDate(date.getDate() + amount);
  return toIsoDate(date);
}

export function calendarDate(value = new Date()) {
  if (typeof value === "string") return parseIsoDate(value);
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12);
}

export function shiftCalendarDays(value, amount) {
  const date = calendarDate(value);
  date.setDate(date.getDate() + amount);
  return date;
}

export function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = parseIsoDate(value);
  return !Number.isNaN(date.valueOf()) && toIsoDate(date) === value;
}
