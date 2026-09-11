import { computed } from "vue";
import { createCatalog } from "./catalog-loader.js";

export const flossCatalog = createCatalog({
  path: "/catalogs/floss",
  label: "floss catalog",
});
export const floss = flossCatalog.items;
export const flossById = flossCatalog.byId;

export function flossLabel(thread) {
  return `DMC ${thread.number} · ${thread.colorName}`;
}

export function flossProductLink(thread) {
  return thread.link;
}

export const flossOptions = computed(() =>
  floss.map((thread) => ({ value: thread.id, text: flossLabel(thread) })),
);

const flossOrder = new Intl.Collator(undefined, { numeric: true });
export const flossSearchIndex = computed(() =>
  floss
    .map((item) => ({
      ...item,
      title: flossLabel(item),
      href: flossProductLink(item),
      swatch: item.color,
      searchText: [item.id, item.number, item.colorName]
        .join(" ")
        .toLocaleLowerCase(),
    }))
    .sort((a, b) => flossOrder.compare(a.number, b.number)),
);
