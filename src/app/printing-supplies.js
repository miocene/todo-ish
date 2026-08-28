import { filamentLabel, filamentProductLink, filamentSearchLink, filamentsById } from "./filament-catalog.js";
import { syncManagedShoppingTasks } from "./managed-shopping.js";
import { loadFilamentInventory, loadPageTasks } from "./page-tasks.js";

const SHOPPING_SOURCE = "filament-shortage";

export function filamentSupplyStatus(projects, inventory) {
  const supplyById = new Map();

  for (const project of projects) {
    for (const task of project.tasks) {
      if (task.completed) continue;
      for (const usage of task.filaments ?? []) {
        if (!usage.catalogId) continue;
        const current = supplyById.get(usage.catalogId) ?? {
          catalogId: usage.catalogId,
          label: usage.label || usage.catalogId,
          requiredGrams: 0,
        };
        current.requiredGrams += typeof usage.weightGrams === "number" ? usage.weightGrams : 0;
        if (!current.label || current.label === current.catalogId) {
          const catalogFilament = filamentsById.get(usage.catalogId);
          current.label = catalogFilament ? filamentLabel(catalogFilament) : usage.label || usage.catalogId;
        }
        supplyById.set(usage.catalogId, current);
      }
    }
  }

  for (const supply of supplyById.values()) {
    const catalogFilament = filamentsById.get(supply.catalogId);
    supply.requiredSpools = Math.ceil(supply.requiredGrams / 1000);
    supply.ownedSpools = inventory[supply.catalogId] ?? 0;
    supply.missingSpools = Math.max(0, supply.requiredSpools - supply.ownedSpools);
    supply.productLink = catalogFilament
      ? filamentProductLink(catalogFilament)
      : filamentSearchLink(supply.label || supply.catalogId);
  }

  return supplyById;
}

export function syncFilamentShoppingList(projects, inventory = loadFilamentInventory()) {
  const printingProjects = projects ?? loadPageTasks("printing").projects;
  const shortages = [...filamentSupplyStatus(printingProjects, inventory).values()].filter(
    (supply) => supply.missingSpools > 0,
  );
  return syncManagedShoppingTasks({
    source: SHOPPING_SOURCE,
    resourceIdKey: "filamentId",
    shortages,
    createTask: (supply, existingTask) => ({
      id: existingTask?.id ?? `shopping-filament-${supply.catalogId}`,
      title: `${supply.label} filament · ${supply.missingSpools} ${supply.missingSpools === 1 ? "spool" : "spools"}`,
      completed: existingTask?.completed ?? false,
      source: SHOPPING_SOURCE,
      filamentId: supply.catalogId,
      productLink: supply.productLink,
      quantity: supply.missingSpools,
    }),
  });
}
