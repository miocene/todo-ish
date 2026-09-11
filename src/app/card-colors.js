import { initializeAppDataResource, readAppData } from "./app-data.js";

import { CARD_COLOR_COUNT, cardColorNumber } from "../../backend/api/src/card-colors.mjs";

export const CARD_COLORS = Object.freeze(Array.from({ length: CARD_COLOR_COUNT }, (_, index) => index + 1));

export function randomCardColor() {
  return CARD_COLORS[Math.floor(Math.random() * CARD_COLORS.length)];
}

export function normalizeCardColor(value) {
  return cardColorNumber(value) ?? randomCardColor();
}

export function loadCardColors(keys) {
  const saved = readAppData("colors");
  const colors = { ...saved };
  for (const key of keys) colors[key] = normalizeCardColor(colors[key]);
  return initializeAppDataResource("colors", colors, {
    migrate: Boolean(saved) && JSON.stringify(saved) !== JSON.stringify(colors),
  });
}
