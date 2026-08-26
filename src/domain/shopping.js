import { stockOwned } from "./inventory.js";
import { filamentDemand } from "./printing.js";
import { stitchStatusFromThreads } from "./stitching.js";

function addRequirement(requirements, catalogId, amount, label) {
  if (!catalogId || amount <= 0) return;
  const current = requirements.get(catalogId) || { amount: 0, label };
  requirements.set(catalogId, { amount: current.amount + amount, label: current.label || label });
}

function threadShopping(state) {
  const requirements = new Map();
  for (const project of state.stitch) {
    if (["Completed", "Abandoned"].includes(stitchStatusFromThreads(project))) continue;
    for (const thread of project.threads)
      addRequirement(requirements, thread.catalogId, Number(thread.required) || 0, thread.label);
  }

  return [...requirements]
    .map(([catalogId, requirement]) => ({
      catalogId,
      label: requirement.label,
      shortage: Math.max(Number((requirement.amount - stockOwned(state.threadStock, catalogId)).toFixed(2)), 0),
    }))
    .filter((item) => item.shortage > 0)
    .map(({ catalogId, label, shortage }) => ({
      id: `shop-thread-${catalogId}`,
      title: label || catalogId,
      quantity: shortage,
      linked: true,
      sourceType: "thread",
      sourceId: catalogId,
    }));
}

function filamentShopping(state) {
  const labels = new Map();
  for (const part of state.printing.flatMap((project) => project.parts)) {
    if (part.filamentId && !labels.has(part.filamentId)) labels.set(part.filamentId, part.filamentLabel);
  }

  return [...labels]
    .map(([catalogId, label]) => {
      const requiredGrams = filamentDemand(state, catalogId);
      const required = requiredGrams ? Math.ceil(requiredGrams / 1000) : 0;
      return { catalogId, label, shortage: Math.max(required - stockOwned(state.filamentStock, catalogId), 0) };
    })
    .filter((item) => item.shortage > 0)
    .map(({ catalogId, label, shortage }) => ({
      id: `shop-filament-${catalogId}`,
      title: label || catalogId,
      quantity: shortage,
      linked: true,
      sourceType: "filament",
      sourceId: catalogId,
    }));
}

export function syncCatalogShopping(state) {
  const ordinary = state.shopping.filter((item) => !item.linked);
  state.shopping = [...ordinary, ...threadShopping(state), ...filamentShopping(state)];
  return state;
}
