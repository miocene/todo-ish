import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const dollarTag = "$catalog_rows$";

function readSnapshot(name) {
  const path = new URL(`catalogs/${name}`, root);
  const contents = readFileSync(path);
  const snapshot = JSON.parse(contents.toString("utf8"));

  return {
    entries: snapshot.entries,
    sha256: createHash("sha256").update(contents).digest("hex"),
  };
}

function jsonRecordset(rows) {
  const json = JSON.stringify(rows);
  if (json.includes(dollarTag)) throw new Error(`Catalog data contains reserved SQL tag ${dollarTag}`);
  return `${dollarTag}${json}${dollarTag}::jsonb`;
}

function catalogImport({
  snapshotTable,
  entryTable,
  source,
  sha256,
  rows,
  recordColumns,
  selectColumns,
  updateColumns,
}) {
  const entryCount = rows.length;
  const updateSet = updateColumns.map((column) => `  ${column} = EXCLUDED.${column}`).join(",\n");

  return `WITH target_snapshot AS (
  INSERT INTO ${snapshotTable} (source, content_sha256, entry_count)
  VALUES ('${source}', '${sha256}', ${entryCount})
  ON CONFLICT (content_sha256) DO UPDATE
  SET source = EXCLUDED.source,
      entry_count = EXCLUDED.entry_count
  RETURNING id
)
INSERT INTO ${entryTable} (snapshot_id, ${selectColumns.join(", ")})
SELECT target_snapshot.id, ${selectColumns.map((column) => `entry.${column}`).join(", ")}
FROM target_snapshot
CROSS JOIN jsonb_to_recordset(${jsonRecordset(rows)}) AS entry(
  ${recordColumns.join(",\n  ")}
)
ON CONFLICT (snapshot_id, catalog_id) DO UPDATE
SET
${updateSet};`;
}

function countCheck({ label, snapshotTable, entryTable, sha256, expected }) {
  return `DO $verify$
DECLARE
  stored_count integer;
BEGIN
  SELECT count(*)::integer
  INTO stored_count
  FROM ${entryTable} AS entries
  JOIN ${snapshotTable} AS snapshots ON snapshots.id = entries.snapshot_id
  WHERE snapshots.content_sha256 = '${sha256}';

  IF stored_count <> ${expected} THEN
    RAISE EXCEPTION '${label} catalog import count mismatch: expected ${expected}, got %', stored_count;
  END IF;
END
$verify$;`;
}

export function catalogSeedData() {
  const filament = readSnapshot("bambu-filaments.snapshot.json");
  const floss = readSnapshot("dmc-floss.snapshot.json");

  return {
    filament: {
      sha256: filament.sha256,
      rows: filament.entries.map((entry) => ({
        catalog_id: entry.id,
        family: entry.family,
        color_name: entry.color,
        product_code: entry.productCode || null,
        swatch: entry.swatch,
      })),
    },
    floss: {
      sha256: floss.sha256,
      rows: floss.entries.map((entry) => ({
        catalog_id: `dmc${entry.number.toLowerCase()}`,
        number: entry.number,
        color_name: entry.colorName,
        color_hex: entry.color,
        purchase_url: entry.link || null,
      })),
    },
  };
}

export function buildCatalogSeed() {
  const { filament, floss } = catalogSeedData();
  const filamentCount = filament.rows.length;
  const flossCount = floss.rows.length;

  const filamentImport = catalogImport({
    snapshotTable: "filament_catalog_snapshots",
    entryTable: "filament_catalog_entries",
    source: "Bambu Lab EU catalog snapshot",
    sha256: filament.sha256,
    rows: filament.rows,
    recordColumns: ["catalog_id text", "family text", "color_name text", "product_code text", "swatch text"],
    selectColumns: ["catalog_id", "family", "color_name", "product_code", "swatch"],
    updateColumns: ["family", "color_name", "product_code", "swatch"],
  });

  const flossImport = catalogImport({
    snapshotTable: "floss_catalog_snapshots",
    entryTable: "floss_catalog_entries",
    source: "Threadcolors and Breibrink DMC snapshot",
    sha256: floss.sha256,
    rows: floss.rows,
    recordColumns: ["catalog_id text", "number text", "color_name text", "color_hex char(7)", "purchase_url text"],
    selectColumns: ["catalog_id", "number", "color_name", "color_hex", "purchase_url"],
    updateColumns: ["number", "color_name", "color_hex", "purchase_url"],
  });

  return `\\set ON_ERROR_STOP on
BEGIN;
SET ROLE todo_owner;

${filamentImport}

${flossImport}

${countCheck({
  label: "Filament",
  snapshotTable: "filament_catalog_snapshots",
  entryTable: "filament_catalog_entries",
  sha256: filament.sha256,
  expected: filamentCount,
})}

${countCheck({
  label: "Floss",
  snapshotTable: "floss_catalog_snapshots",
  entryTable: "floss_catalog_entries",
  sha256: floss.sha256,
  expected: flossCount,
})}

COMMIT;

SELECT 'filament' AS catalog, snapshots.entry_count AS expected, count(entries.*)::integer AS stored
FROM filament_catalog_snapshots AS snapshots
JOIN filament_catalog_entries AS entries ON entries.snapshot_id = snapshots.id
WHERE snapshots.content_sha256 = '${filament.sha256}'
GROUP BY snapshots.entry_count
UNION ALL
SELECT 'floss' AS catalog, snapshots.entry_count AS expected, count(entries.*)::integer AS stored
FROM floss_catalog_snapshots AS snapshots
JOIN floss_catalog_entries AS entries ON entries.snapshot_id = snapshots.id
WHERE snapshots.content_sha256 = '${floss.sha256}'
GROUP BY snapshots.entry_count
ORDER BY catalog;
`;
}

export function writeCatalogSeed(outputPath) {
  const destination = resolve(outputPath);
  if (existsSync(destination)) throw new Error(`Refusing to overwrite existing file: ${destination}`);

  const sql = buildCatalogSeed();
  writeFileSync(destination, sql, { encoding: "utf8", flag: "wx", mode: 0o600 });

  return {
    bytes: Buffer.byteLength(sql),
    path: destination,
    sha256: createHash("sha256").update(sql).digest("hex"),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outputPath = process.argv[2];
  if (!outputPath) {
    console.error("Usage: node backend/scripts/build_catalog_seed.mjs <output.sql>");
    process.exitCode = 2;
  } else {
    const result = writeCatalogSeed(outputPath);
    console.log(`Created ${result.path} (${result.bytes} bytes)`);
    console.log(`SHA-256 ${result.sha256}`);
  }
}
