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
  "real custom-format backup, isolated restore, retention, permissions and corruption rejection",
  { skip: !mode && "Set TEST_PG_BIN or TEST_BACKUP_CONTAINER to enable the restore drill" },
  async (t) => {
    const admin = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    const suffix = randomUUID().replaceAll("-", "");
    const database = `todo_backup_${suffix}`;
    const role = `todo_backup_runtime_${suffix}`;
    const directory = await mkdtemp(join(tmpdir(), "todo-backup-"));
    const url = new URL(process.env.TEST_DATABASE_URL);
    url.pathname = `/${database}`;
    const installer = new Client({ connectionString: url.toString() });
    await admin.connect();
    t.after(async () => {
      await installer.end();
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
    for (let i = 0; i < 95; i++)
      await writeFile(join(directory, `todo-daily-20000101T000000Z-${String(i).padStart(3, "0")}.dump`), "old fixture");
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
    const run = (...args) => execute("sh", [backupScript, ...args], { env: environment });
    const result = await run("backup", directory);
    const dump = result.stdout.trim();
    assert.equal((await stat(dump)).mode & 0o777, 0o600);
    assert.equal((await stat(directory)).mode & 0o777, 0o700);
    const files = await readdir(directory);
    assert.equal(files.filter((file) => /^todo-daily-.*\.dump$/.test(file)).length, 90);
    assert.equal(files.filter((file) => /^todo-monthly-.*\.dump$/.test(file)).length, 1);
    const verified = await run("verify", dump);
    assert.match(verified.stdout, /auth_users=1/);
    assert.match(verified.stdout, /work_tasks=1/);
    assert.match(await readFile(dump + ".restore-check.txt", "utf8"), /SHA-256: [a-f0-9]{64}/);
    assert.equal(
      (
        await admin.query(
          "SELECT count(*)::integer AS count FROM pg_database WHERE datname LIKE 'todo_restore_check_%'",
        )
      ).rows[0].count,
      0,
    );
    await writeFile(dump, "corrupt");
    await assert.rejects(run("verify", dump), /checksum mismatch/);
  },
);
