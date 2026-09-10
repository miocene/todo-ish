import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export async function runMigrations(
  client,
  directory,
  { adoptLegacy = false, runtimeRole = "todo_runtime", log = console.log } = {},
) {
  if (!/^[a-z_][a-z0-9_]*$/.test(runtimeRole)) throw new Error("Unsafe migration runtime role");
  const names = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  if (!names.length || names.some((name) => !/^\d{4}_[A-Za-z0-9_.-]+\.sql$/.test(name)))
    throw new Error("Missing or unsafe migration files");
  const migrations = await Promise.all(
    names.map(async (filename) => {
      const sql = await readFile(join(directory, filename), "utf8");
      return { filename, sql, checksum: createHash("sha256").update(sql).digest("hex") };
    }),
  );
  await client.query("SET lock_timeout = '30s'");
  await client.query("SELECT pg_advisory_lock(73730, 1)");
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now(), checksum text
    )`);
    await client.query("ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum text");
    await client.query(`REVOKE ALL ON schema_migrations FROM "${runtimeRole}"`);
    let applied = (await client.query("SELECT filename, checksum FROM schema_migrations ORDER BY filename")).rows;
    if (!applied.length) {
      const result = await client.query(
        "SELECT count(*)::integer AS count FROM pg_tables WHERE schemaname='public' AND tablename = ANY($1::text[])",
        [
          [
            "filament_catalog_entries",
            "filament_catalog_snapshots",
            "floss_catalog_entries",
            "floss_catalog_snapshots",
          ],
        ],
      );
      if (result.rows[0].count) {
        if (result.rows[0].count !== 4) throw new Error("The catalog schema is incomplete");
        if (!adoptLegacy) throw new Error("Review the existing catalog schema, then explicitly adopt legacy checksums");
        applied = [{ filename: "0000_catalogs.sql", checksum: null }];
      }
    }
    // Check every existing file before applying any new migration.
    for (const row of applied) {
      const source = migrations.find((item) => item.filename === row.filename);
      if (!source) throw new Error(`Applied migration is missing: ${row.filename}`);
      if (row.checksum && row.checksum !== source.checksum)
        throw new Error(`Applied migration checksum changed: ${row.filename}`);
      if (!row.checksum && !adoptLegacy)
        throw new Error(`Review existing migrations and set MIGRATION_ADOPT_LEGACY_CHECKSUMS=1 once: ${row.filename}`);
    }
    const existing = new Map(applied.map((item) => [item.filename, item]));
    for (const migration of migrations) {
      const row = existing.get(migration.filename);
      if (row?.checksum) {
        log(`Already applied: ${migration.filename}`);
        continue;
      }
      await client.query("BEGIN");
      try {
        if (row) log(`Adopting reviewed legacy checksum: ${migration.filename}`);
        else {
          log(`Applying: ${migration.filename}`);
          await client.query(migration.sql.replaceAll('"todo_runtime"', `"${runtimeRole}"`));
        }
        await client.query(
          "INSERT INTO schema_migrations(filename,checksum) VALUES ($1,$2) ON CONFLICT(filename) DO UPDATE SET checksum=EXCLUDED.checksum",
          [migration.filename, migration.checksum],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    return migrations.map(({ filename, checksum }) => ({ filename, checksum }));
  } finally {
    await client.query("SELECT pg_advisory_unlock(73730, 1)");
  }
}
