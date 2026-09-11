import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CARD_COLOR_COUNT,
  cardColorNumber,
} from "../backend/api/src/card-colors.mjs";

test("every persisted card color has one CSS token", () => {
  const css = readFileSync(
    new URL("../styles/card-colors.css", import.meta.url),
    "utf8",
  );
  const tokens = [...css.matchAll(/--color-(\d+):\s*(#[\da-f]{6});/gi)];
  assert.deepEqual(
    tokens.map((token) => Number(token[1])),
    Array.from({ length: CARD_COLOR_COUNT }, (_, i) => i + 1),
  );
  assert.equal(new Set(tokens.map((token) => token[2])).size, CARD_COLOR_COUNT);
  for (let number = 1; number <= CARD_COLOR_COUNT; number++)
    assert.equal(cardColorNumber(number), number);
  assert.equal(cardColorNumber("#2765ec"), cardColorNumber("#2765EC"));
  for (const invalid of [0, 43, -1, 1.5, "1", "red", null, undefined])
    assert.equal(cardColorNumber(invalid), null);
});
