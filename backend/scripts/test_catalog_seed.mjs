import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildCatalogSeed, catalogSeedData } from "./build_catalog_seed.mjs";

const root = new URL("../", import.meta.url);
const snapshot = (name) => readFileSync(new URL(`catalogs/${name}`, root));
const digest = (contents) => createHash("sha256").update(contents).digest("hex");

test("catalog seed data maps the browser snapshots to database columns", () => {
  const data = catalogSeedData();
  const filamentSnapshot = JSON.parse(snapshot("bambu-filaments.snapshot.json"));
  const flossSnapshot = JSON.parse(snapshot("dmc-floss.snapshot.json"));

  assert.equal(data.filament.rows.length, filamentSnapshot.entries.length);
  assert.equal(data.floss.rows.length, flossSnapshot.entries.length);
  assert.equal(data.filament.sha256, digest(snapshot("bambu-filaments.snapshot.json")));
  assert.equal(data.floss.sha256, digest(snapshot("dmc-floss.snapshot.json")));

  const black = data.floss.rows.find((entry) => entry.number === "310");
  assert.equal(black.catalog_id, "dmc310");
  assert.equal(black.color_hex, "#000000");

  const listing = data.filament.rows.find((entry) => entry.color_name === "Catalog listing");
  assert.equal(listing.product_code, null);
});

test("catalog seed SQL is transactional, idempotent, role-scoped, and self-validating", () => {
  const sql = buildCatalogSeed();

  assert.match(sql, /^\\set ON_ERROR_STOP on\nBEGIN;\nSET ROLE todo_owner;/);
  assert.match(sql, /ON CONFLICT \(content_sha256\) DO UPDATE/g);
  assert.match(sql, /ON CONFLICT \(snapshot_id, catalog_id\) DO UPDATE/g);
  assert.equal(sql.match(/DO \$verify\$/g)?.length, 2);
  assert.match(sql, /COMMIT;\n\nSELECT 'filament'/);
  assert.doesNotMatch(sql, /password|localStorage/i);
  assert.equal(sql, buildCatalogSeed(), "The generated SQL must be deterministic");
});
