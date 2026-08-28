import { flossById, flossLabel, flossProductLink } from "./floss-catalog.js";
import { syncManagedShoppingTasks } from "./managed-shopping.js";
import { loadFlossInventory, loadPageTasks } from "./page-tasks.js";

const SHOPPING_SOURCE = "floss-shortage";

export function flossSupplyStatus(projects, inventory) {
  const supplyById = new Map();

  for (const project of projects) {
    for (const task of project.tasks) {
      if (task.completed || !task.flossId) continue;
      const thread = flossById.get(task.flossId);
      const current = supplyById.get(task.flossId) ?? {
        catalogId: task.flossId,
        label: thread ? flossLabel(thread) : task.title || task.flossId,
        requiredSkeins: 0,
      };
      current.requiredSkeins += typeof task.requiredSkeins === "number" ? task.requiredSkeins : 0;
      supplyById.set(task.flossId, current);
    }
  }

  for (const supply of supplyById.values()) {
    const thread = flossById.get(supply.catalogId);
    supply.ownedSkeins = inventory[supply.catalogId] ?? 0;
    supply.missingSkeins = Math.max(0, supply.requiredSkeins - supply.ownedSkeins);
    supply.productLink = thread ? flossProductLink(thread) : "";
  }

  return supplyById;
}

export function syncFlossShoppingList(projects, inventory = loadFlossInventory()) {
  const stitchingProjects = projects ?? loadPageTasks("crossStitch").projects;
  const shortages = [...flossSupplyStatus(stitchingProjects, inventory).values()].filter(
    (supply) => supply.missingSkeins > 0,
  );
  return syncManagedShoppingTasks({
    source: SHOPPING_SOURCE,
    resourceIdKey: "flossId",
    shortages,
    createTask: (supply, existingTask) => ({
      id: existingTask?.id ?? `shopping-floss-${supply.catalogId}`,
      title: `${supply.label} floss · ${supply.missingSkeins} ${supply.missingSkeins === 1 ? "skein" : "skeins"}`,
      completed: existingTask?.completed ?? false,
      ...(existingTask?.completedAt && { completedAt: existingTask.completedAt }),
      source: SHOPPING_SOURCE,
      flossId: supply.catalogId,
      productLink: supply.productLink,
      quantity: supply.missingSkeins,
    }),
  });
}
