import {
  calendarDate,
  shiftCalendarDays,
  isIsoDate,
  toIsoDate as isoDate,
} from "./date.js";
export { calendarDate, isIsoDate, isoDate };

const PAST_DAY_LIMIT = 3;
const FUTURE_DAY_LIMIT = 14;
const WEEKDAY_FORMATTER = new Intl.DateTimeFormat("en", { weekday: "short" });
const DATE_FORMATTER = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function requestedDate(value, fallback = new Date(), bounds) {
  let date = isIsoDate(value) ? calendarDate(value) : calendarDate(fallback);
  if (bounds?.firstDate && date < bounds.firstDate) date = bounds.firstDate;
  if (bounds?.lastDate && date > bounds.lastDate) date = bounds.lastDate;
  return date;
}

export function getCalendarDay(value, todayIso) {
  const date = calendarDate(value);
  const iso = isoDate(date);
  return {
    iso,
    weekday: WEEKDAY_FORMATTER.format(date),
    dateLabel: DATE_FORMATTER.format(date),
    today: iso === todayIso,
  };
}

export function getWorkDateBounds(today, tasks = []) {
  const firstAssignableDate = shiftCalendarDays(today, -PAST_DAY_LIMIT);
  let firstDateIso = isoDate(firstAssignableDate);
  for (const task of tasks) {
    if (task.completedAt && task.date && task.date < firstDateIso)
      firstDateIso = task.date;
  }
  return {
    firstDate: calendarDate(firstDateIso),
    firstAssignableDate,
    lastDate: shiftCalendarDays(today, FUTURE_DAY_LIMIT),
  };
}
