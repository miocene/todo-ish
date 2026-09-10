import { computed } from "vue";
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

export const filamentOptions = computed(() =>
  filaments.map((filament) => ({ value: filament.id, text: filamentLabel(filament), swatch: filament.swatch })),
);

const filamentOrder = new Intl.Collator();
export const filamentSearchIndex = computed(() =>
  filaments
    .map((item) => ({
      ...item,
      title: filamentLabel(item),
      href: filamentProductLink(item),
      searchText: [item.id, item.family, item.color, item.productCode].filter(Boolean).join(" ").toLocaleLowerCase(),
    }))
    .sort((a, b) => filamentOrder.compare(a.family, b.family) || filamentOrder.compare(a.color, b.color)),
);
