import { flossById, flossLabel, flossProductLink } from "./floss-catalog.js";
import { loadFlossInventory, loadPageTasks, savePageTasks } from "./page-tasks.js";

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
  const shopping = loadPageTasks("shopping");
  const existingManagedTasks = new Map(
    shopping.tasks.filter((task) => task.source === SHOPPING_SOURCE).map((task) => [task.flossId, task]),
  );
  const regularTasks = shopping.tasks.filter((task) => task.source !== SHOPPING_SOURCE);
  const managedTasks = shortages.map((supply) => ({
    id: existingManagedTasks.get(supply.catalogId)?.id ?? `shopping-floss-${supply.catalogId}`,
    title: `${supply.label} floss · ${supply.missingSkeins} ${supply.missingSkeins === 1 ? "skein" : "skeins"}`,
    completed: existingManagedTasks.get(supply.catalogId)?.completed ?? false,
    source: SHOPPING_SOURCE,
    flossId: supply.catalogId,
    productLink: supply.productLink,
    quantity: supply.missingSkeins,
  }));

  shopping.tasks = [...regularTasks, ...managedTasks];
  savePageTasks("shopping", shopping);
  return shopping;
}
