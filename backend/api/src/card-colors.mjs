// Values live in styles/card-colors.css. Numbers are the persisted palette IDs.
export const CARD_COLOR_COUNT = 36;

export function cardColorNumber(value) {
  if (Number.isInteger(value) && value >= 1 && value <= CARD_COLOR_COUNT)
    return value;
  // Accept old exports and clients during the transition; always persist a number.
  if (typeof value === "string" && /^#[\da-f]{6}$/i.test(value))
    return (parseInt(value.slice(1), 16) % CARD_COLOR_COUNT) + 1;
  return null;
}
