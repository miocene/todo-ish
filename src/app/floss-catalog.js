import { createCatalog } from "./catalog-loader.js";

export const flossCatalog = createCatalog({ path: "/catalogs/floss", label: "floss catalog" });
export const floss = flossCatalog.items;
export const flossById = flossCatalog.byId;

export function flossLabel(thread) {
  return `DMC ${thread.number} · ${thread.colorName}`;
}

export function flossProductLink(thread) {
  return thread.link;
}
