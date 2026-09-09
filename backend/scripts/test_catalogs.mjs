import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const root = new URL("../", import.meta.url);
const snapshot = (name) => JSON.parse(readFileSync(new URL(`catalogs/${name}`, root), "utf8"));
const bambuSnapshot = snapshot("bambu-filaments.snapshot.json");
const dmcSnapshot = snapshot("dmc-floss.snapshot.json");
const bambuFilamentCatalog = bambuSnapshot.entries;
const dmcFlossCatalog = dmcSnapshot.entries;
const keys = (rows) => [...new Set(rows.flatMap(Object.keys))].sort();
const duplicates = (values) => values.filter((value, index) => values.indexOf(value) !== index);

test("catalogue snapshots keep only the application data contract", () => {
  assert.deepEqual(Object.keys(bambuSnapshot), ["entries"]);
  assert.deepEqual(keys(bambuSnapshot.entries), ["color", "family", "id", "productCode", "swatch"]);
  assert.deepEqual(Object.keys(dmcSnapshot), ["entries"]);
  assert.deepEqual(keys(dmcSnapshot.entries), ["color", "colorName", "link", "number"]);
});

test("Bambu catalogue is complete, unique, and renderable", () => {
  assert.ok(bambuFilamentCatalog.length >= 250, "Expected the complete Bambu catalogue snapshot");
  assert.deepEqual(duplicates(bambuFilamentCatalog.map((item) => item.id)), []);

  for (const item of bambuFilamentCatalog) {
    assert.ok(item.id && item.family && item.color && item.swatch, `Incomplete Bambu row: ${item.id || "unknown"}`);
    assert.match(item.swatch, /^(?:https?:\/\/|#[0-9a-f]{3,8}$)/i, `Invalid Bambu swatch: ${item.id}`);
    if (!item.productCode) assert.equal(item.color, "Catalog listing", `Missing product code: ${item.id}`);
  }

  for (const family of [
    "Support for ABS",
    "Support for PA/PET",
    "TPU 95A HF",
    "TPU for AMS",
    "PA6-GF",
    "PA6-CF",
    "PLA-CF",
    "PLA Marble",
    "PLA Tough+",
  ]) {
    assert.ok(
      bambuFilamentCatalog.some((item) => item.family === family),
      `Missing Bambu family: ${family}`,
    );
  }
});

test("DMC catalogue keeps canonical Threadcolors data and Breibrink links", () => {
  assert.ok(dmcFlossCatalog.length >= 440, "Expected the complete Threadcolors DMC table");
  assert.deepEqual(duplicates(dmcFlossCatalog.map((item) => item.number)), []);

  for (const item of dmcFlossCatalog) {
    assert.ok(item.colorName, `Missing DMC colour name: ${item.number}`);
    assert.match(item.color, /^#[0-9A-F]{6}$/, `Invalid DMC colour: ${item.number}`);
  }

  assert.ok(dmcFlossCatalog.filter((item) => item.link).length >= 440, "Breibrink links should cover the DMC table");
  const black = dmcFlossCatalog.find((item) => item.number === "310");
  assert.equal(black.colorName, "Black");
  assert.equal(black.color, "#000000");
  assert.match(black.link, /^https:\/\/www\.breibrink\.nl\//);
});
