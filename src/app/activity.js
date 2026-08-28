import { loadPageTasks } from "./page-tasks.js";
import { getAllWorkTasks } from "./work-tasks.mock.js";

const DAY_FORMATTER = new Intl.DateTimeFormat("en", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const MONTH_FORMATTER = new Intl.DateTimeFormat("en", { month: "short" });

function isoDate(value) {
  const pad = (part) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function localDateFromTimestamp(timestamp) {
  if (typeof timestamp !== "string" || !timestamp) return undefined;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? undefined : isoDate(date);
}

function activityItem(task, source, context, route) {
  const completedAt = task.completedAt ?? task.checkedAt;
  const date = localDateFromTimestamp(completedAt);
  if (!date || !task.title?.trim()) return undefined;
  return {
    id: `${source}-${task.id}`,
    title: task.title.trim(),
    source,
    context,
    route,
    completedAt,
    date,
  };
}

export function collectCompletedActivity() {
  const items = [];
  const add = (item) => {
    if (item) items.push(item);
  };

  for (const task of getAllWorkTasks()) {
    add(activityItem(task, "Work", task.date ? "Scheduled work" : "Backlog", { name: "work" }));
  }

  const chores = loadPageTasks("chores");
  for (const task of chores.tasks) add(activityItem(task, "Chores", task.details, { name: "chores" }));

  const todos = loadPageTasks("todos");
  for (const list of todos.lists) {
    for (const task of list.tasks) {
      add(activityItem(task, "Todo lists", list.title, { name: "todos", query: { list: list.id } }));
    }
  }

  const shopping = loadPageTasks("shopping");
  for (const task of shopping.tasks) {
    add(activityItem(task, "Shopping cart", "Shopping cart", { name: "shopping" }));
  }

  const printing = loadPageTasks("printing");
  for (const project of printing.projects) {
    for (const task of project.tasks) {
      add(activityItem(task, "3D printing", project.title, { name: "printing" }));
    }
  }

  const crossStitch = loadPageTasks("crossStitch");
  for (const project of crossStitch.projects) {
    for (const task of project.tasks) {
      add(activityItem(task, "Cross stitch", project.title, { name: "cross-stitch" }));
    }
  }

  return items.sort((first, second) => second.completedAt.localeCompare(first.completedAt));
}

export function groupActivityByDay(items, year) {
  const groups = new Map();
  for (const item of items) {
    if (Number(item.date.slice(0, 4)) !== year) continue;
    const group = groups.get(item.date) ?? [];
    group.push(item);
    groups.set(item.date, group);
  }
  return [...groups.entries()]
    .sort(([first], [second]) => second.localeCompare(first))
    .map(([date, dayItems]) => ({
      date,
      label: DAY_FORMATTER.format(new Date(`${date}T12:00:00`)),
      items: dayItems,
    }));
}

export function activityYears(items, currentYear = new Date().getFullYear(), minimumYears = 5) {
  const itemYears = items.map((item) => Number(item.date.slice(0, 4))).filter(Number.isInteger);
  const earliestYear = Math.min(currentYear, ...itemYears);
  const yearCount = Math.max(minimumYears, currentYear - earliestYear + 1);
  return Array.from({ length: yearCount }, (_, index) => currentYear - index);
}

export function buildActivityCalendar(year, groups) {
  const countByDate = new Map(groups.map((group) => [group.date, group.items.length]));
  const firstDay = new Date(year, 0, 1, 12);
  const lastDay = new Date(year, 11, 31, 12);
  const gridStart = new Date(firstDay);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  const gridEnd = new Date(lastDay);
  gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));

  const days = [];
  for (const cursor = new Date(gridStart); cursor <= gridEnd; cursor.setDate(cursor.getDate() + 1)) {
    const date = isoDate(cursor);
    const count = cursor.getFullYear() === year ? (countByDate.get(date) ?? 0) : undefined;
    days.push({
      date,
      count,
      label: DAY_FORMATTER.format(cursor),
      level: count === undefined || count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : count <= 4 ? 3 : 4,
    });
  }

  const weekCount = days.length / 7;
  const months = Array.from({ length: 12 }, (_, month) => {
    const firstOfMonth = new Date(year, month, 1, 12);
    const dayOffset = Math.round((firstOfMonth - gridStart) / 86_400_000);
    return { label: MONTH_FORMATTER.format(firstOfMonth), column: Math.floor(dayOffset / 7) + 1 };
  });

  return { days, months, weekCount };
}
