import { apiFetch } from "./api.js";

export const floss = [];

export const flossById = new Map();

export async function initializeFlossCatalog() {
  const items = [];
  let offset = 0;
  let total;
  do {
    const response = await apiFetch(`/catalogs/floss?limit=500&offset=${offset}`, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Floss catalogue request failed with status ${response.status}`);
    const page = await response.json();
    if (!Array.isArray(page.items) || !Number.isInteger(page.total)) {
      throw new Error("Floss catalogue response is invalid");
    }
    total = page.total;
    items.push(...page.items);
    offset += page.items.length;
    if (page.items.length === 0 && offset < total) throw new Error("Floss catalogue pagination did not advance");
  } while (offset < total);

  floss.splice(0, floss.length, ...items);
  flossById.clear();
  for (const thread of floss) flossById.set(thread.id, thread);
}

export function flossLabel(thread) {
  return `DMC ${thread.number} · ${thread.colorName}`;
}

export function flossProductLink(thread) {
  return thread.link;
}
