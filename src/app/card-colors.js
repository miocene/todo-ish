import { initializeAppDataResource, readAppData } from "./app-data.js";

export const CARD_COLORS = Object.freeze([
  "#2765EC",
  "#FF8A34",
  "#B9E532",
  "#F65CC0",
  "#18A76B",
  "#FFD43B",
  "#7C3AED",
  "#FF5C70",
  "#20C4E8",
  "#008F95",
  "#FFB184",
  "#CD1D99",
  "#E73535",
  "#9592FF",
  "#20CFB0",
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
