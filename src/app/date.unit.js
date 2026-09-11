import assert from "node:assert/strict";
import test from "node:test";
import { shiftIsoDate } from "./date.js";

test("calendar dates preserve their day and shift across month boundaries", () => {
  assert.equal(shiftIsoDate("2026-10-31", 1), "2026-11-01");
});
