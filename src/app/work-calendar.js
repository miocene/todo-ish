import { getWorkStatus } from "./work-status.js";
import { getFirstCheckedWorkTaskDate, getWorkTasks } from "./work-tasks.mock.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const FUTURE_DAY_LIMIT = 14;
export const RANGE_DAY_COUNT = 3;
const FOCUS_DAY_INDEX = 1;
const WEEKDAY_FORMATTER = new Intl.DateTimeFormat("en", { weekday: "short" });
const DAY_FORMATTER = new Intl.DateTimeFormat("en", { day: "numeric" });
const MONTH_FORMATTER = new Intl.DateTimeFormat("en", { month: "short" });
const LABEL_FORMATTER = new Intl.DateTimeFormat("en", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function calendarDate(value = new Date()) {
  if (typeof value === "string") return new Date(`${value}T12:00:00`);
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12);
}

export function shiftCalendarDays(value, amount) {
  const date = calendarDate(value);
  date.setDate(date.getDate() + amount);
  return date;
}

export function isoDate(value) {
  const date = calendarDate(value);
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isIsoDate(value) {
  if (!ISO_DATE.test(value)) return false;
  const date = calendarDate(value);
  return !Number.isNaN(date.valueOf()) && isoDate(date) === value;
}

export function requestedDate(value, fallback = new Date()) {
  return isIsoDate(value) ? calendarDate(value) : calendarDate(fallback);
}

export function getCalendarDays(focusDate, todayIso) {
  return Array.from({ length: RANGE_DAY_COUNT }, (_, index) => {
    const date = shiftCalendarDays(focusDate, index - FOCUS_DAY_INDEX);
    const iso = isoDate(date);
    return {
      iso,
      weekday: WEEKDAY_FORMATTER.format(date),
      day: DAY_FORMATTER.format(date),
      month: MONTH_FORMATTER.format(date),
      label: LABEL_FORMATTER.format(date),
      statusValue: getWorkStatus(iso).value,
      tasks: getWorkTasks(iso),
      today: iso === todayIso,
    };
  });
}

export function getWorkRangeBounds(today) {
  const firstCheckedTaskDate = getFirstCheckedWorkTaskDate();
  const lastDayOffset = FUTURE_DAY_LIMIT - (RANGE_DAY_COUNT - FOCUS_DAY_INDEX - 1);
  return {
    firstFocusDate: firstCheckedTaskDate
      ? shiftCalendarDays(calendarDate(firstCheckedTaskDate), FOCUS_DAY_INDEX)
      : undefined,
    lastFocusDate: shiftCalendarDays(today, lastDayOffset),
  };
}

export function canMoveWorkRange(focusDate, amount, { firstFocusDate, lastFocusDate }) {
  return amount < 0 ? !firstFocusDate || focusDate > firstFocusDate : focusDate < lastFocusDate;
}

export function moveWorkRange(focusDate, amount, { firstFocusDate, lastFocusDate }) {
  const requestedFocusDate = shiftCalendarDays(focusDate, amount * RANGE_DAY_COUNT);
  if (firstFocusDate && requestedFocusDate < firstFocusDate) return firstFocusDate;
  if (requestedFocusDate > lastFocusDate) return lastFocusDate;
  return requestedFocusDate;
}
