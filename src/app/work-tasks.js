import { initialAppData, initializeAppDataResource, readAppData, writeAppData } from "./app-data.js";

const EMPTY_TASKS = Object.freeze([]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
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
  const savedTasks = readAppData("work-tasks");
  const tasks = Array.isArray(savedTasks) && savedTasks.every(isStoredTask) ? savedTasks : initialAppData("work-tasks");
  return Object.freeze(initializeAppDataResource("work-tasks", tasks).map((task) => Object.freeze({ ...task })));
}

let allTasks = loadTasks();

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

  writeAppData("work-tasks", savedTasks);
}
