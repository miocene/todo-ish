import { cacheAppData } from "./app-data.js";
import { loadPageTasks } from "./page-tasks.js";

export function syncManagedShoppingTasks({ createTask, resourceIdKey, shortages, source }) {
  const shopping = loadPageTasks("shopping");
  const existingTasks = new Map(
    shopping.tasks.filter((task) => task.source === source).map((task) => [task[resourceIdKey], task]),
  );
  const unmanagedTasks = shopping.tasks.filter((task) => task.source !== source);
  const managedTasks = shortages.map((shortage) => createTask(shortage, existingTasks.get(shortage.catalogId)));

  shopping.tasks = [...unmanagedTasks, ...managedTasks];
  // Shortages are derived from projects and inventory; only manual items are saved by the API.
  cacheAppData("shopping", shopping);
  return shopping;
}
