import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, readdir, stat, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { runMigrations } from "../src/migrations.mjs";
const execute = promisify(execFile);
const mode = process.env.TEST_BACKUP_CONTAINER ? "docker" : process.env.TEST_PG_BIN ? "local" : null;
test(
  "daily dump replaces only after success and restores the latest data",
  { skip: !mode && "Set TEST_PG_BIN or TEST_BACKUP_CONTAINER to test database backups" },
  async (t) => {
    const admin = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    const suffix = randomUUID().replaceAll("-", "");
    const database = `todo_backup_${suffix}`;
    const restoredDatabase = `todo_restore_${suffix}`;
    const role = `todo_backup_runtime_${suffix}`;
    const directory = await mkdtemp(join(tmpdir(), "todo-backup-"));
    const url = new URL(process.env.TEST_DATABASE_URL);
    url.pathname = `/${database}`;
    const installer = new Client({ connectionString: url.toString() });
    let restored;
    await admin.connect();
    t.after(async () => {
      await installer.end();
      await restored?.end();
      await admin.query(`DROP DATABASE IF EXISTS "${restoredDatabase}" WITH (FORCE)`);
      await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
      await admin.query(`DROP ROLE IF EXISTS "${role}"`);
      await admin.end();
      await rm(directory, { recursive: true, force: true });
    });
    await admin.query(`CREATE ROLE "${role}" NOLOGIN`);
    await admin.query(`CREATE DATABASE "${database}"`);
    await installer.connect();
    await runMigrations(installer, new URL("../../database/migrations/", import.meta.url), {
      runtimeRole: role,
      log: () => {},
    });
    await installer.query(
      "INSERT INTO auth_users(id,username,display_name) VALUES ('backup-user','backup-user','Backup'); INSERT INTO work_tasks(user_id,id,title,position) VALUES ('backup-user','backup-task','復元 🙂',0)",
    );
    const oldBackup = join(directory, "todo-daily-20000101T000000Z.dump");
    await writeFile(oldBackup, "previous backup");
    const environment = {
      ...process.env,
      PGTOOLS_MODE: mode,
      DB_NAME: database,
      DB_USER: decodeURIComponent(url.username),
      DB_CONTAINER: process.env.TEST_BACKUP_CONTAINER,
      DB_DATA_MOUNT: "/",
      PGHOST: url.hostname,
      PGPORT: url.port || "5432",
      PGPASSWORD: decodeURIComponent(url.password),
      PATH: `${process.env.TEST_PG_BIN || ""}:${process.env.PATH}`,
    };
    const backupScript = fileURLToPath(new URL("../../scripts/database_backup.sh", import.meta.url));
    const run = (overrides = {}) => execute("sh", [backupScript, directory], { env: { ...environment, ...overrides } });
    const result = await run();
    const dump = result.stdout.trim();
    assert.equal(dump, join(directory, "todo.dump"));
    assert.equal((await stat(dump)).mode & 0o777, 0o600);
    assert.equal((await stat(directory)).mode & 0o777, 0o700);
    const previous = await readFile(dump);
    await assert.rejects(run({ DB_NAME: `missing_${suffix}` }), /does not exist/);
    assert.deepEqual(await readFile(dump), previous, "a failed dump preserves the last good backup");
    await installer.query("UPDATE work_tasks SET title='Latest 復元 🙂' WHERE id='backup-task'");
    assert.equal((await run()).stdout.trim(), dump);
    assert.equal(await readFile(oldBackup, "utf8"), "previous backup", "older backups are never removed");
    assert.deepEqual((await readdir(directory)).sort(), [
      ".backup.lock",
      "todo-daily-20000101T000000Z.dump",
      "todo.dump",
    ]);

    await admin.query(`CREATE DATABASE "${restoredDatabase}" TEMPLATE template0`);
    const args = [
      "pg_restore",
      "-U",
      environment.DB_USER,
      "--dbname",
      restoredDatabase,
      "--no-owner",
      "--no-privileges",
      "--single-transaction",
      "--exit-on-error",
    ];
    const command = mode === "docker" ? ["docker", "exec", "-i", environment.DB_CONTAINER, ...args] : args;
    const restore = execute(command[0], command.slice(1), { env: environment });
    restore.child.stdin.end(await readFile(dump));
    await restore;
    url.pathname = `/${restoredDatabase}`;
    restored = new Client({ connectionString: url.toString() });
    await restored.connect();
    assert.equal(
      (await restored.query("SELECT title FROM work_tasks WHERE id='backup-task'")).rows[0].title,
      "Latest 復元 🙂",
    );
    assert.equal((await restored.query("SELECT count(*)::integer AS count FROM auth_users")).rows[0].count, 1);
  },
);
