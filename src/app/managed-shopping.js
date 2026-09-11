import { cacheAppData } from "./app-data.js";
import { loadPageTasks } from "./page-tasks.js";

export function syncManagedShoppingTasks({
  createTask,
  resourceIdKey,
  shortages,
  source,
}) {
  const shopping = loadPageTasks("shopping");
  const existingTasks = new Map(
    shopping.tasks
      .filter((task) => task.source === source && !task.completed)
      .map((task) => [task[resourceIdKey], task]),
  );
  const unmanagedTasks = shopping.tasks.filter(
    (task) => task.source !== source || task.completed,
  );
  const managedTasks = shortages.map((shortage) =>
    createTask(shortage, existingTasks.get(shortage.catalogId)),
  );

  shopping.tasks = [...unmanagedTasks, ...managedTasks];
  // Unchecked shortages are derived; completed purchases persist alongside manual items.
  cacheAppData("shopping", shopping);
  return shopping;
}
