import { readStoredJson, writeStoredJson } from "./storage.js";

const EMPTY_TASKS = Object.freeze([]);
const STORAGE_KEY = "done-ish.work-tasks.v1";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TODAY = new Date();
const TASK_GROUPS = [
  { dayOffset: -7, tasks: [{ checkedAt: "09:00:00", title: "Set up the work calendar" }] },
  {
    dayOffset: -1,
    tasks: [{ title: "Triage inbox" }, { title: "Prepare the quarterly planning notes" }],
  },
  {
    dayOffset: 0,
    tasks: [
      { title: "Daily stand-up" },
      { title: "Review pull requests" },
      { title: "Pair on calendar navigation" },
      { title: "Update the team roadmap" },
    ],
  },
  { dayOffset: 1, tasks: [{ title: "Document the release process and share it with the team" }] },
];

function isoDate(value) {
  const pad = (part) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function dateFromToday(dayOffset) {
  const date = new Date(TODAY);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  return isoDate(date);
}

const defaultTasksByDate = new Map(
  TASK_GROUPS.map(({ dayOffset, tasks: taskDefinitions }) => {
    const date = dateFromToday(dayOffset);
    const tasks = taskDefinitions.map(({ checkedAt, title }, index) =>
      Object.freeze({
        id: `${date}-${index}`,
        date,
        title,
        ...(checkedAt && { checkedAt: `${date}T${checkedAt}` }),
      }),
    );
    return [date, Object.freeze(tasks)];
  }),
);
const defaultTasks = Object.freeze([...defaultTasksByDate.values()].flat());

function isStoredTask(task) {
  return (
    task &&
    typeof task === "object" &&
    typeof task.id === "string" &&
    task.id.length > 0 &&
    typeof task.title === "string" &&
    (task.date === null || (typeof task.date === "string" && ISO_DATE.test(task.date))) &&
    (task.checkedAt === undefined || typeof task.checkedAt === "string")
  );
}

function loadTasks() {
  const savedTasks = readStoredJson(STORAGE_KEY);
  if (!Array.isArray(savedTasks) || !savedTasks.every(isStoredTask)) return defaultTasks;
  return Object.freeze(savedTasks.map((task) => Object.freeze({ ...task })));
}

let allTasks = loadTasks();

export function getFirstCheckedWorkTaskDate() {
  return allTasks
    .filter((task) => task.checkedAt)
    .sort((first, second) => first.checkedAt.localeCompare(second.checkedAt))[0]?.date;
}

export function getWorkTasks(date) {
  const tasks = allTasks.filter((task) => task.date === date);
  return tasks.length ? tasks : EMPTY_TASKS;
}

export function getAllWorkTasks() {
  return allTasks;
}

export function saveWorkTasks(tasks) {
  const savedTasks = tasks.map((task) => ({
    id: task.id,
    date: task.date,
    title: task.title,
    ...(task.checkedAt && { checkedAt: task.checkedAt }),
  }));
  allTasks = Object.freeze(savedTasks.map((task) => Object.freeze(task)));

  writeStoredJson(STORAGE_KEY, savedTasks);
}
