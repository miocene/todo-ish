import { createCatalog } from "./catalog-loader.js";

export const filamentCatalog = createCatalog({ path: "/catalogs/filaments", label: "filament catalog" });
export const filaments = filamentCatalog.items;
export const filamentsById = filamentCatalog.byId;

export function filamentLabel(filament) {
  return `${filament.family} · ${filament.color}`;
}

export function filamentProductLink(filament) {
  if (filament.link) return filament.link;
  const suffix = filament.productCode ? `-${filament.productCode}` : "";
  const handle = filament.id.startsWith("bambu-") ? filament.id.slice(6, suffix ? -suffix.length : undefined) : "";
  return handle ? `https://eu.store.bambulab.com/products/${handle}` : "";
}

export function filamentSearchLink(label) {
  return `https://eu.store.bambulab.com/search?q=${encodeURIComponent(label)}`;
}
