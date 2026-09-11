import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, cp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";
import { runMigrations } from "../src/migrations.mjs";
import { createCatalogRepository } from "../src/catalog-repository.mjs";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("Set TEST_DATABASE_URL to a disposable PostgreSQL instance");
test("actual migration runner: fresh, rerun, upgrade, concurrent, rollback and checksum protection", async (t) => {
  const suffix = randomUUID().replaceAll("-", "");
  const database = `todo_migrations_${suffix}`;
  const runtimeRole = `todo_runtime_${suffix}`;
  const admin = new Client({ connectionString });
  await admin.connect();
  const directory = await mkdtemp(join(tmpdir(), "todo-migrations-"));
  const clients = [];
  t.after(async () => {
    await Promise.all(clients.map((client) => client.end()));
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.query(`DROP ROLE IF EXISTS "${runtimeRole}"`);
    await admin.end();
    await rm(directory, { recursive: true, force: true });
  });
  await admin.query(`CREATE ROLE "${runtimeRole}" NOLOGIN`);
  await admin.query(`CREATE DATABASE "${database}"`);
  const url = new URL(connectionString);
  url.pathname = `/${database}`;
  const connect = async () => {
    const client = new Client({ connectionString: url.toString() });
    await client.connect();
    clients.push(client);
    return client;
  };
  const client = await connect();
  await cp(new URL("../../database/migrations/", import.meta.url), directory, { recursive: true });
  const options = { runtimeRole, log: () => {} };
  const paletteMigration = join(directory, "0013_numbered_card_colors.sql");
  const paletteSql = await readFile(paletteMigration, "utf8");
  await rm(paletteMigration);
  await runMigrations(client, directory, options);
  await client.query("INSERT INTO auth_users(id, username, display_name) VALUES ('palette', 'palette', 'Palette')");
  await client.query("INSERT INTO colors(user_id,id,color) VALUES ('palette','backlog','#2765EC')");
  for (const table of ["todo_lists", "printing_projects", "stitch_projects"])
    await client.query(
      `INSERT INTO ${table}(user_id,id,title,color,position) VALUES ('palette','kept','Kept','#2765EC',0)`,
    );
  await client.query("INSERT INTO todo_lists(user_id,id,title,position) VALUES ('palette','uncolored','Uncolored',1)");
  await writeFile(paletteMigration, paletteSql);
  const first = await runMigrations(client, directory, options);
  for (const table of ["colors", "todo_lists", "printing_projects", "stitch_projects"]) {
    const result = await client.query(`SELECT color FROM ${table} WHERE color IS NOT NULL`);
    assert.equal(result.rows[0].color, (parseInt("2765EC", 16) % 42) + 1);
    await assert.rejects(client.query(`UPDATE ${table} SET color=43`), /check constraint/);
  }
  assert.equal((await client.query("SELECT color FROM todo_lists WHERE id='uncolored'")).rows[0].color, null);

  assert.ok(first.length >= 11);
  assert.deepEqual(await runMigrations(client, directory, options), first);
  await client.query(`SET ROLE "${runtimeRole}"`);
  const catalog = await createCatalogRepository(client).floss({ query: "", limit: 500, offset: 0 });
  assert.equal(catalog.total, 489);
  for (let number = 1; number <= 35; number++) {
    const id = `dmc${String(number).padStart(2, "0")}`;
    assert.ok(
      catalog.items.some((item) => item.id === id && item.link),
      `Missing purchasable ${id}`,
    );
  }
  assert.ok(
    catalog.items.some((item) => item.id === "dmc310"),
    "existing project references remain valid",
  );
  await client.query("RESET ROLE");
  const extra = join(directory, "9998_upgrade.sql");
  await writeFile(extra, "CREATE TABLE runner_upgrade(id integer); SELECT pg_sleep(0.1);");
  await Promise.all([runMigrations(client, directory, options), runMigrations(await connect(), directory, options)]);
  assert.equal(
    (await client.query("SELECT count(*)::integer AS count FROM schema_migrations WHERE filename='9998_upgrade.sql'"))
      .rows[0].count,
    1,
  );
  await writeFile(
    join(directory, "9999_failure.sql"),
    "CREATE TABLE rolled_back(id integer); SELECT does_not_exist();",
  );
  await assert.rejects(runMigrations(client, directory, options), /does_not_exist/);
  assert.equal((await client.query("SELECT to_regclass('rolled_back') AS value")).rows[0].value, null);
  await rm(join(directory, "9999_failure.sql"));
  const source = await readFile(extra, "utf8");
  await writeFile(extra, source + "\n-- edited after deployment");
  await assert.rejects(runMigrations(client, directory, options), /checksum changed/);
  await writeFile(extra, source);
  await client.query("UPDATE schema_migrations SET checksum=NULL");
  await assert.rejects(runMigrations(client, directory, options), /MIGRATION_ADOPT_LEGACY_CHECKSUMS/);
  await runMigrations(client, directory, { ...options, adoptLegacy: true });
  assert.equal(
    (await client.query("SELECT count(*)::integer AS count FROM schema_migrations WHERE checksum IS NULL")).rows[0]
      .count,
    0,
  );
  await rm(extra);
  await assert.rejects(runMigrations(client, directory, options), /Applied migration is missing/);
});
