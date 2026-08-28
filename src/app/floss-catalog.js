import flossCatalog from "../../backend/catalogs/dmc-floss.snapshot.json";

export const floss = flossCatalog.entries.map((thread) => ({
  ...thread,
  id: `dmc${thread.number.toLocaleLowerCase()}`,
}));

export const flossById = new Map(floss.map((thread) => [thread.id, thread]));

export function flossLabel(thread) {
  return `DMC ${thread.number} · ${thread.colorName}`;
}

export function flossProductLink(thread) {
  return thread.link;
}
