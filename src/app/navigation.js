import { reactive } from "vue";
import { readAppData, writeAppData, subscribeAppData } from "./app-data.js";

const hiddenItems = readAppData("preferences")?.hiddenNavigation ?? [];

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
  writeAppData("preferences", {
    hiddenNavigation: navigationItems.filter((entry) => !entry.visible).map((entry) => entry.to.name),
  });
}

subscribeAppData("preferences", (preferences) => {
  for (const item of navigationItems) item.visible = !preferences.hiddenNavigation.includes(item.to.name);
});
