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
  const rule = description.replace(/^repeats?\s+/, "").trim();
  const intervalMatch = /^(?:every\s+)?(\d+)\s+(days?|weeks?|months?)(?:\s+on\s+(.+))?$/.exec(rule);
  const weeklyDays = /^(?:every(?:\s+other)?(?:\s+week)?(?:\s+on)?\s+)(.+)$/.exec(rule);
  const dayNames = (value) =>
    value?.split(/,\s*|\s+and\s+/).map((name) => WEEKDAYS.findIndex((day) => day.toLowerCase() === name.trim()));
  let frequency;
  if (/^(daily|every day)$/.test(rule)) frequency = "day";
  else if (/^(weekly|every week)$/.test(rule)) frequency = "week";
  else if (/^(monthly|every month)$/.test(rule)) frequency = "month";
  else if (intervalMatch) frequency = intervalMatch[2].replace(/s$/, "");
  else if (weeklyDays && dayNames(weeklyDays[1]).every((day) => day >= 0)) frequency = "week";
  else return null;
  const schedule = defaultChoreSchedule(startDate, frequency);
  if (intervalMatch) {
    schedule.interval = Number(intervalMatch[1]);
    if (schedule.interval < 1 || schedule.interval > 999) return null;
    if (intervalMatch[3]) {
      if (frequency !== "week") return null;
      const days = dayNames(intervalMatch[3]);
      if (days.some((day) => day < 0)) return null;
      schedule.weekdays = [...new Set(days)].sort((a, b) => a - b);
    }
  } else if (weeklyDays && frequency === "week" && !/^(weekly|every week)$/.test(rule)) {
    schedule.weekdays = [...new Set(dayNames(weeklyDays[1]))].sort((a, b) => a - b);
    if (/^every other /.test(rule)) schedule.interval = 2;
  }
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

export function sameChoreSchedule(first, second) {
  if (!first || !second) return first === second;
  if (
    first.frequency !== second.frequency ||
    first.interval !== second.interval ||
    first.startDate !== second.startDate
  )
    return false;
  const field = first.frequency === "week" ? "weekdays" : first.frequency === "month" ? "monthDays" : null;
  return (
    !field || (first[field].length === second[field].length && first[field].every((day) => second[field].includes(day)))
  );
}

export function choreDescription(task) {
  return task.schedule ? choreScheduleLabel(task.schedule) : task.details;
}

export function retainChoreCompletion(chores, task) {
  if (!task.completedAt) return;
  chores.history ??= [];
  if (chores.history.some((item) => item.id === task.id && item.nextDue === task.nextDue)) return;
  chores.history.push({
    id: task.id,
    title: task.title,
    details: choreDescription(task),
    nextDue: task.nextDue,
    completed: true,
    completedAt: task.completedAt,
  });
}

export function completedChoreOccurrences(chores) {
  const entries = new Map((chores.history ?? []).map((item) => [`${item.id}:${item.nextDue}`, item]));
  for (const task of chores.tasks) {
    const key = `${task.id}:${task.nextDue}`;
    if (task.completedAt) entries.set(key, { ...task, details: choreDescription(task) });
    else entries.delete(key);
  }
  return [...entries.values()].map((item) => ({ ...item, id: `${item.id}:${item.nextDue}` }));
}
