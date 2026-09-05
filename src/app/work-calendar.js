import { calendarDate, shiftCalendarDays, isIsoDate, toIsoDate as isoDate } from "../shared/date.js";
export { calendarDate, shiftCalendarDays, isIsoDate, isoDate };
import { getWorkStatus } from "./work-status.js";
import { getAllWorkTasks, getWorkTasks } from "./work-tasks.js";

const FUTURE_DAY_LIMIT = 14;
const WEEKDAY_FORMATTER = new Intl.DateTimeFormat("en", { weekday: "short" });
const DAY_FORMATTER = new Intl.DateTimeFormat("en", { day: "numeric" });
const MONTH_FORMATTER = new Intl.DateTimeFormat("en", { month: "short" });
const DATE_FORMATTER = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "long",
  year: "numeric",
});
const LABEL_FORMATTER = new Intl.DateTimeFormat("en", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function requestedDate(value, fallback = new Date()) {
  return isIsoDate(value) ? calendarDate(value) : calendarDate(fallback);
}

export function getCalendarDay(value, todayIso) {
  const date = calendarDate(value);
  const iso = isoDate(date);
  return {
    iso,
    weekday: WEEKDAY_FORMATTER.format(date),
    day: DAY_FORMATTER.format(date),
    month: MONTH_FORMATTER.format(date),
    dateLabel: DATE_FORMATTER.format(date),
    label: LABEL_FORMATTER.format(date),
    statusValue: getWorkStatus(iso).value,
    tasks: getWorkTasks(iso),
    today: iso === todayIso,
  };
}

export function getWorkDateBounds(today, tasks = getAllWorkTasks()) {
  const firstCheckedTaskDate = tasks
    .filter((task) => task.checkedAt && task.date)
    .map((task) => task.date)
    .sort()[0];
  return {
    firstDate: firstCheckedTaskDate ? calendarDate(firstCheckedTaskDate) : undefined,
    lastDate: shiftCalendarDays(today, FUTURE_DAY_LIMIT),
  };
}
