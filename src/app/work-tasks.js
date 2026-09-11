import {
  workTaskFromApi,
  workTaskToApi,
} from "../../backend/api/src/app-data-contract.mjs";

import {
  initialAppData,
  initializeAppDataResource,
  readAppData,
  writeAppData,
  subscribeAppData,
} from "./app-data.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function isStoredTask(task) {
  return (
    task &&
    typeof task === "object" &&
    typeof task.id === "string" &&
    task.id.length > 0 &&
    typeof task.title === "string" &&
    (task.date === null ||
      (typeof task.date === "string" && ISO_DATE.test(task.date))) &&
    (task.checkedAt === undefined || typeof task.checkedAt === "string")
  );
}

function loadTasks() {
  const savedTasks = readAppData("work-tasks");
  const tasks =
    Array.isArray(savedTasks) && savedTasks.every(isStoredTask)
      ? savedTasks
      : initialAppData("work-tasks");
  return Object.freeze(
    initializeAppDataResource("work-tasks", tasks).map((task) =>
      Object.freeze(workTaskFromApi(task)),
    ),
  );
}

let allTasks = loadTasks();
subscribeAppData("work-tasks", () => {
  allTasks = loadTasks();
});

/** @returns {ReadonlyArray<import("../../backend/api/src/app-data-contract.mjs").WorkTask>} */
export function getAllWorkTasks() {
  return allTasks;
}

/** @param {import("../../backend/api/src/app-data-contract.mjs").WorkTask[]} tasks */
export function saveWorkTasks(tasks) {
  const savedTasks = tasks.map(workTaskToApi);
  allTasks = Object.freeze(
    savedTasks.map((task) => Object.freeze(workTaskFromApi(task))),
  );

  writeAppData("work-tasks", savedTasks);
}
