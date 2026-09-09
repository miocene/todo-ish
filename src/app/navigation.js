import { reactive } from "vue";

const STORAGE_KEY = "done-ish.hidden-navigation.v1";

function readHiddenItems() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

const hiddenItems = readHiddenItems();

export const navigationItems = reactive(
  [
    { icon: "work", label: "Work", to: { name: "work" } },
    { icon: "chores", label: "Chores", to: { name: "chores" } },
    { icon: "todo", label: "Todo lists", to: { name: "todos" } },
    { icon: "shopping", label: "Shopping cart", to: { name: "shopping" } },
    { icon: "printer", label: "3D printing", to: { name: "printing" } },
    { icon: "yarn", label: "Cross stitch", to: { name: "cross-stitch" } },
    { icon: "catalog", label: "Catalog", to: { name: "catalog" } },
  ].map((item) => ({ ...item, visible: !hiddenItems.includes(item.to.name) })),
);

export function toggleNavigationItem(item) {
  item.visible = !item.visible;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(navigationItems.filter((entry) => !entry.visible).map((entry) => entry.to.name)),
    );
  } catch {
    // Keep preferences in memory when browser storage is unavailable.
  }
}
