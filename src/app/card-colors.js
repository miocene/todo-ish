import { initializeAppDataResource, readAppData } from "./app-data.js";

export const CARD_COLORS = Object.freeze([
  "#633533",
  "#E9B6B4",
  "#8FB7B0",
  "#597380",
  "#3E5168",
  "#287271",
  "#8AB17D",
  "#E9C46A",
  "#F4A261",
  "#E76F51",
  "#36949D",
  "#1982C4",
  "#4267AC",
  "#565AA0",
  "#6A4C93",
]);

export function randomCardColor() {
  return CARD_COLORS[Math.floor(Math.random() * CARD_COLORS.length)];
}

export function normalizeCardColor(value) {
  const color = typeof value === "string" ? value.toUpperCase() : "";
  return CARD_COLORS.includes(color) ? color : randomCardColor();
}

export function loadCardColors(keys) {
  const saved = readAppData("colors");
  const colors = { ...saved };
  for (const key of keys) colors[key] = normalizeCardColor(colors[key]);
  return initializeAppDataResource("colors", colors, {
    migrate: Boolean(saved) && JSON.stringify(saved) !== JSON.stringify(colors),
  });
}
