import { calendarDate, isIsoDate, toIsoDate, shiftIsoDate } from "./date.js";

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const dateNumber = (value) => {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86400000;
};
const weekStart = (value) => dateNumber(value) - ((calendarDate(value).getDay() + 6) % 7);

export function defaultChoreSchedule(date, frequency = "week") {
  const day = calendarDate(date);
  return { frequency, interval: 1, startDate: date, weekdays: [(day.getDay() + 6) % 7], monthDays: [day.getDate()] };
}

export function scheduleFromChore(task, today) {
  if (task.schedule) return structuredClone(task.schedule);
  const startDate = isIsoDate(task.nextDue) ? task.nextDue : today;
  const description = task.details?.toLowerCase() || "";
  const frequency = /\b(?:daily|days?)\b/.test(description)
    ? "day"
    : /\b(?:monthly|months?)\b/.test(description)
      ? "month"
      : "week";
  const schedule = defaultChoreSchedule(startDate, frequency);
  const interval = /every\s+(\d+)\s+(?:days?|weeks?|months?)/.exec(description);
  if (interval) schedule.interval = Math.max(1, Math.min(999, Number(interval[1])));
  const weekdays = WEEKDAYS.flatMap((day, index) => (description.includes(day.toLowerCase()) ? [index] : []));
  if (weekdays.length) schedule.weekdays = weekdays;
  return schedule;
}

export function choreScheduleLabel(schedule) {
  const { frequency, interval, weekdays, monthDays } = schedule;
  const every = `Every ${interval === 1 ? "" : `${interval} `}${frequency}${interval === 1 ? "" : "s"}`;
  if (frequency === "week") return `${every} on ${weekdays.map((day) => WEEKDAYS[day].slice(0, 3)).join(", ")}`;
  if (frequency === "month") return `${every} on ${monthDays.join(", ")}`;
  return every;
}

// Find a scheduled date on or after `from`, anchored to the original schedule.
// Monthly day selections clamp to month-end and naturally coalesce duplicates.
export function nextChoreDate(schedule, from) {
  const start = calendarDate(schedule.startDate);
  let candidate = calendarDate(from < schedule.startDate ? schedule.startDate : from);
  for (let step = 0; step < 366 * 100; step++) {
    const iso = toIsoDate(candidate);
    let matches;
    if (schedule.frequency === "day") {
      matches = (dateNumber(iso) - dateNumber(schedule.startDate)) % schedule.interval === 0;
    } else if (schedule.frequency === "week") {
      matches =
        ((weekStart(iso) - weekStart(schedule.startDate)) / 7) % schedule.interval === 0 &&
        schedule.weekdays.includes((candidate.getDay() + 6) % 7);
    } else {
      const monthOffset =
        (candidate.getFullYear() - start.getFullYear()) * 12 + candidate.getMonth() - start.getMonth();
      const lastDay = new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0, 12).getDate();
      matches =
        monthOffset % schedule.interval === 0 &&
        schedule.monthDays.some((day) => Math.min(day, lastDay) === candidate.getDate());
    }
    if (matches) return iso;
    candidate.setDate(candidate.getDate() + 1);
  }
  throw new Error("No chore occurrence found within 100 years");
}

export function advanceCompletedChore(task, today) {
  if (!task.completed || !task.completedAt || !task.schedule) return false;
  const completedDate = toIsoDate(new Date(task.completedAt));
  if (completedDate >= today) return false;
  const after = completedDate > task.nextDue ? completedDate : task.nextDue;
  task.nextDue = nextChoreDate(task.schedule, shiftIsoDate(after, 1));
  task.completed = false;
  delete task.completedAt;
  return true;
}
