import { apiFetch } from "./api.js";

export const filaments = [];
export const filamentsById = new Map();

export async function initializeFilamentCatalog() {
  const items = [];
  let offset = 0;
  let total;
  do {
    const response = await apiFetch(`/catalogs/filaments?limit=500&offset=${offset}`, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Filament catalogue request failed with status ${response.status}`);
    const page = await response.json();
    if (!Array.isArray(page.items) || !Number.isInteger(page.total)) {
      throw new Error("Filament catalogue response is invalid");
    }
    total = page.total;
    items.push(...page.items);
    offset += page.items.length;
    if (page.items.length === 0 && offset < total) throw new Error("Filament catalogue pagination did not advance");
  } while (offset < total);

  filaments.splice(0, filaments.length, ...items);
  filamentsById.clear();
  for (const filament of filaments) filamentsById.set(filament.id, filament);
}

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
