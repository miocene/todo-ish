// Linux CI exercises the actual image against a disposable, migrated database.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";
import { runMigrations } from "../src/migrations.mjs";
const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString || process.platform !== "linux")
  throw new Error(
    "Run on Linux with a disposable TEST_DATABASE_URL and Docker",
  );
const suffix = randomUUID().replaceAll("-", "");
const database = `todo_image_${suffix}`;
const role = `todo_image_runtime_${suffix}`;
const container = `todo-api-test-${suffix}`;
const directory = await mkdtemp(join(tmpdir(), "todo-api-image-"));
await chmod(directory, 0o755); // Disposable CI secrets must be readable by the image's node user.
const admin = new Client({ connectionString });
const url = new URL(connectionString);
url.pathname = `/${database}`;
const installer = new Client({ connectionString: url.toString() });
const docker = (...args) =>
  execFileSync("docker", args, { stdio: "pipe" }).toString().trim();
await admin.connect();
try {
  await admin.query(`CREATE ROLE "${role}" NOLOGIN`);
  await admin.query(`CREATE DATABASE "${database}"`);
  await installer.connect();
  await runMigrations(
    installer,
    new URL("../../database/migrations/", import.meta.url),
    { runtimeRole: role },
  );
  await writeFile(
    join(directory, "password"),
    decodeURIComponent(url.password),
    { mode: 0o444 },
  );
  await writeFile(
    join(directory, "bootstrap"),
    "disposable-bootstrap-token-for-ci-only",
    { mode: 0o444 },
  );
  docker(
    "run",
    "-d",
    "--name",
    container,
    "--network",
    "host",
    "-v",
    `${directory}:/run/test-secrets:ro`,
    "-e",
    "PORT=35481",
    "-e",
    `PGHOST=${url.hostname}`,
    "-e",
    `PGPORT=${url.port || 5432}`,
    "-e",
    `PGDATABASE=${database}`,
    "-e",
    `PGUSER=${decodeURIComponent(url.username)}`,
    "-e",
    "PGPASSWORD_FILE=/run/test-secrets/password",
    "-e",
    "AUTH_BOOTSTRAP_TOKEN_FILE=/run/test-secrets/bootstrap",
    "-e",
    "AUTH_ORIGIN=https://todo-ish.today",
    "-e",
    "AUTH_RP_ID=todo-ish.today",
    "done-ish-api:ci",
  );
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      if ((await fetch("http://127.0.0.1:35481/healthz")).ok) {
        ready = true;
        break;
      }
    } catch {
      /* Wait for startup. */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.ok(ready, "API image must start and connect to the migrated database");
  const session = await fetch("http://127.0.0.1:35481/api/auth/session");
  assert.equal(session.status, 200);
  assert.equal((await session.json()).authenticated, false);
  assert.equal((await fetch("http://127.0.0.1:35481/api/data")).status, 401);
  console.log("API image health and authentication smoke checks passed");
} catch (error) {
  try {
    console.error(docker("logs", container));
  } catch {
    /* Container may not exist yet. */
  }
  throw error;
} finally {
  try {
    docker("rm", "-f", container);
  } catch {
    /* Nothing to remove before startup. */
  }
  await installer.end();
  await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  await admin.query(`DROP ROLE IF EXISTS "${role}"`);
  await admin.end();
  await rm(directory, { recursive: true, force: true });
}
