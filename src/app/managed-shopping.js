import { loadPageTasks, savePageTasks } from "./page-tasks.js";

export function syncManagedShoppingTasks({ createTask, resourceIdKey, shortages, source }) {
  const shopping = loadPageTasks("shopping");
  const existingTasks = new Map(
    shopping.tasks.filter((task) => task.source === source).map((task) => [task[resourceIdKey], task]),
  );
  const unmanagedTasks = shopping.tasks.filter((task) => task.source !== source);
  const managedTasks = shortages.map((shortage) => createTask(shortage, existingTasks.get(shortage.catalogId)));

  shopping.tasks = [...unmanagedTasks, ...managedTasks];
  savePageTasks("shopping", shopping);
  return shopping;
}
