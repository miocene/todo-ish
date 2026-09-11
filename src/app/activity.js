import { toIsoDate as isoDate } from "./date.js";
import { completedChoreOccurrences } from "./chore-schedule.js";
import { initialAppData, readAppData } from "./app-data.js";
import { workTaskFromApi } from "../../backend/api/src/app-data-contract.mjs";

const DAY_FORMATTER = new Intl.DateTimeFormat("en", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const MONTH_FORMATTER = new Intl.DateTimeFormat("en", { month: "short" });

export function activityLevel(count) {
  if (!Number.isFinite(count) || count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  return count <= 4 ? 3 : 4;
}

function localDateFromTimestamp(timestamp) {
  if (typeof timestamp !== "string" || !timestamp) return undefined;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? undefined : isoDate(date);
}

function activityItem(task, source, context, route) {
  const completedAt = task.completedAt;
  const date =
    completedAt && source === "Work" && task.date
      ? task.date
      : localDateFromTimestamp(completedAt);
  if (!date || !task.title?.trim()) return undefined;
  return {
    id: `${source}-${task.id}`,
    title: task.title.trim(),
    source,
    icon: {
      work: "work",
      chores: "chores",
      todos: "todo",
      shopping: "shopping",
      printing: "printer",
      "cross-stitch": "yarn",
    }[route.name],
    ...(task.event && { event: task.event }),
    context,
    route,
    completedAt,
    date,
  };
}

export function collectCompletedActivity(
  read = (resource) => readAppData(resource) ?? initialAppData(resource),
) {
  const items = [];
  const add = (item) => {
    if (item) items.push(item);
  };

  for (const task of read("work-tasks").map(workTaskFromApi)) {
    add(
      activityItem(task, "Work", task.date ? "Scheduled work" : "Backlog", {
        name: "work",
        query: task.date ? { date: task.date } : {},
      }),
    );
  }

  const chores = read("chores");
  for (const task of completedChoreOccurrences(chores))
    add(activityItem(task, "Chores", task.details, { name: "chores" }));

  const todos = read("todos");
  const todoActivity = new Map(
    (todos.history ?? []).map((task) => [task.id, task]),
  );
  for (const list of todos.lists) {
    for (const task of list.tasks) {
      if (task.completedAt) todoActivity.set(task.id, task);
      else todoActivity.delete(task.id);
    }
  }
  for (const task of todoActivity.values())
    add(activityItem(task, "Todo lists", "", { name: "todos" }));

  const shopping = read("shopping");
  for (const task of [...shopping.tasks, ...(shopping.history ?? [])]) {
    add(
      activityItem(task, "Shopping cart", "Shopping cart", {
        name: "shopping",
      }),
    );
  }

  const printing = read("printing");
  for (const task of printing.history ?? [])
    add(
      activityItem(task, "3D printing", task.context || "", {
        name: "printing",
      }),
    );
  for (const project of printing.projects) {
    for (const task of project.tasks) {
      add(
        activityItem(task, "3D printing", project.title, { name: "printing" }),
      );
    }
  }

  const crossStitch = read("cross-stitch");
  for (const task of crossStitch.history ?? []) {
    if (task.event)
      add(activityItem(task, "Cross stitch", "", { name: "cross-stitch" }));
  }

  const stitchDays = new Map();
  const activity = [];
  for (const item of items) {
    if (item.event?.type === "created") {
      item.title = `Created project: ${item.title}`;
    }
    if (item.event?.type !== "stitches") {
      activity.push(item);
      continue;
    }
    const key = `${item.event.projectId}:${item.date}`;
    const group = stitchDays.get(key);
    if (group) group.stitches += item.event.stitches;
    else
      stitchDays.set(key, { ...item, id: key, stitches: item.event.stitches });
  }
  for (const item of stitchDays.values()) {
    if (!item.stitches) continue;
    item.title = `${item.title} - ${item.stitches} ${item.stitches === 1 ? "stitch" : "stitches"}`;
    activity.push(item);
  }

  return activity.sort((first, second) =>
    second.completedAt.localeCompare(first.completedAt),
  );
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
      stitches: dayItems.reduce(
        (total, item) => total + (item.stitches ?? 0),
        0,
      ),
    }));
}

export function activityYears(
  items,
  currentYear = new Date().getFullYear(),
  minimumYears = 5,
) {
  let earliestYear = currentYear;
  for (const item of items) {
    const year = Number(item.date.slice(0, 4));
    if (Number.isInteger(year)) earliestYear = Math.min(earliestYear, year);
  }
  const yearCount = Math.max(minimumYears, currentYear - earliestYear + 1);
  return Array.from({ length: yearCount }, (_, index) => currentYear - index);
}

export function buildActivityCalendar(year, groups) {
  const countByDate = new Map(
    groups.map((group) => [
      group.date,
      group.items.reduce(
        (total, item) =>
          total +
          (item.stitches === undefined ? 1 : Math.max(0, item.stitches)),
        0,
      ),
    ]),
  );
  const firstDay = new Date(year, 0, 1, 12);
  const lastDay = new Date(year, 11, 31, 12);
  const gridStart = new Date(firstDay);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  const gridEnd = new Date(lastDay);
  gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));

  const days = [];
  for (
    const cursor = new Date(gridStart);
    cursor <= gridEnd;
    cursor.setDate(cursor.getDate() + 1)
  ) {
    const date = isoDate(cursor);
    const count =
      cursor.getFullYear() === year ? (countByDate.get(date) ?? 0) : undefined;
    const label = DAY_FORMATTER.format(cursor);
    days.push({
      date,
      count,
      description:
        count > 0
          ? `${count} activity ${count === 1 ? "contribution" : "contributions"} on ${label}`
          : `No activity on ${label}`,
      level: activityLevel(count),
    });
  }

  const months = Array.from({ length: 12 }, (_, month) => {
    const firstOfMonth = new Date(year, month, 1, 12);
    const dayOffset = Math.round((firstOfMonth - gridStart) / 86_400_000);
    return {
      label: MONTH_FORMATTER.format(firstOfMonth),
      column: Math.floor(dayOffset / 7) + 1,
    };
  });

  return { days, months };
}
