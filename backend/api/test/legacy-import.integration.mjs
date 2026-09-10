import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Pool } from "pg";
import { chromium, expect } from "@playwright/test";
import { createServer as createViteServer } from "vite";
import vue from "@vitejs/plugin-vue";
import { runMigrations } from "../src/migrations.mjs";
import { createAppDataRepository } from "../src/app-data-repository.mjs";
import { createCatalogRepository } from "../src/catalog-repository.mjs";
import { createHttpServer } from "../src/http-server.mjs";
const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("Set TEST_DATABASE_URL to a disposable PostgreSQL instance");
test("real browser legacy storage imports into PostgreSQL and remains downloadable", async (t) => {
  const suffix = randomUUID().replaceAll("-", "");
  const database = `todo_legacy_${suffix}`;
  const role = `todo_legacy_runtime_${suffix}`;
  const directory = await mkdtemp(join(tmpdir(), "todo-transfer-"));
  const admin = new Client({ connectionString });
  await admin.connect();
  const url = new URL(connectionString);
  url.pathname = `/${database}`;
  const installer = new Client({ connectionString: url.toString() });
  let pool, api, vite, browser;
  t.after(async () => {
    await browser?.close();
    await vite?.close();
    if (api) await new Promise((resolve) => api.close(resolve));
    await pool?.end();
    await installer.end();
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.query(`DROP ROLE IF EXISTS "${role}"`);
    await admin.end();
    await rm(directory, { recursive: true, force: true });
  });
  await admin.query(`CREATE ROLE "${role}" NOLOGIN`);
  await admin.query(`CREATE DATABASE "${database}"`);
  await installer.connect();
  await installer.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${role}"`,
  );
  await runMigrations(installer, new URL("../../database/migrations/", import.meta.url), {
    runtimeRole: role,
    log: () => {},
  });
  const user = { id: "legacy-owner", username: "legacy-owner", displayName: "Legacy Owner" };
  await installer.query("INSERT INTO auth_users(id,username,display_name) VALUES ($1,$2,$3)", [
    user.id,
    user.username,
    user.displayName,
  ]);
  pool = new Pool({ connectionString: url.toString(), max: 4 });
  const scoped = {
    connect: async () => {
      const client = await pool.connect();
      await client.query(`SET ROLE "${role}"`);
      return client;
    },
  };
  scoped.query = async (...args) => {
    const client = await scoped.connect();
    try {
      return await client.query(...args);
    } finally {
      client.release();
    }
  };
  const repository = createAppDataRepository(scoped);
  api = createHttpServer(
    { ...repository, ...createCatalogRepository(scoped) },
    { session: async () => ({ authenticated: true, user }), requireUser: async () => user },
    { authenticationBypass: true },
  );
  await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
  vite = await createViteServer({
    root: fileURLToPath(new URL("../../../", import.meta.url)),
    configFile: false,
    envFile: false,
    logLevel: "error",
    plugins: [vue()],
    define: { "import.meta.env.VITE_API_ORIGIN": '""', "import.meta.env.VITE_DEMO_DATA": '"false"' },
    server: {
      host: "127.0.0.1",
      port: 0,
      hmr: false,
      proxy: { "/api": { target: `http://127.0.0.1:${api.address().port}` } },
    },
  });
  await vite.listen();
  browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("pageerror", (error) => t.diagnostic(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) t.diagnostic(`${response.status()} ${response.url()}`);
  });
  const legacy = {
    "done-ish.work-tasks.v1": [{ id: "legacy-work", title: "Legacy work", date: null }],
    "done-ish.page-tasks.v1.todos": {
      lists: [
        {
          id: "legacy-list",
          title: "Legacy list",
          color: "#8FB7B0",
          tasks: [{ id: "legacy-todo", title: "Legacy todo", completed: false }],
        },
      ],
    },
    "done-ish.page-tasks.v1.printing": {
      projects: [
        {
          id: "legacy-project",
          title: "Legacy print",
          description: "",
          color: "#597380",
          tasks: [
            {
              id: "legacy-part",
              title: "Part",
              completed: false,
              filamentId: "old-filament",
              filamentLabel: "Old filament",
              weightGrams: 12,
            },
          ],
        },
      ],
    },
    "done-ish.page-tasks.v1.chores": {
      tasks: [
        { id: "legacy-chore", title: "Legacy chore", details: "Every day", nextDue: "2026-09-10", completed: false },
      ],
    },
  };
  await page.addInitScript((data) => {
    for (const [key, value] of Object.entries(data))
      if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(value));
  }, legacy);
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  for (const route of ["work", "todos", "printing", "chores"]) {
    await page.goto(`${origin}/${route}`);
    const resource = { work: "work-tasks", todos: "todos", printing: "printing", chores: "chores" }[route];
    try {
      await expect
        .poll(async () => (await repository.read(user.id)).initializedResources.includes(resource), { message: route })
        .toBe(true);
    } catch (error) {
      t.diagnostic(await page.locator("body").innerText());
      throw error;
    }
  }
  const state = await repository.read(user.id);
  assert.equal(state.workTasks[0].title, "Legacy work");
  assert.equal(state.pages.todos.lists.find((list) => list.id === "legacy-list").tasks[0].title, "Legacy todo");
  assert.equal(state.pages.printing.projects[0].tasks[0].filaments[0].catalogId, "old-filament");
  assert.equal(state.pages.chores.tasks[0].schedule.frequency, "day");
  for (const [key, value] of Object.entries(legacy))
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), key), JSON.stringify(value));
  await page.goto(`${origin}/profile`);
  let downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download old browser data" }).click();
  const old = JSON.parse(await readFile(await (await downloaded).path(), "utf8"));
  assert.equal(old.originals.length, 4);
  downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download saved data", exact: true }).click();
  const data = JSON.parse(await readFile(await (await downloaded).path(), "utf8"));
  assert.equal(data.account.id, user.id);
  assert.equal(data.private["work-tasks"][0].title, "Legacy work");
  assert.equal(data.shared.chores.tasks[0].title, "Legacy chore");
  await browser.close();
  browser = undefined;
  // Exercise the operator entry point as well as the browser download and repository helpers.
  const secret = join(directory, "password");
  await writeFile(secret, decodeURIComponent(url.password) || "disposable-trust-auth", { mode: 0o600 });
  const env = {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGDATABASE: database,
    PGPASSWORD_FILE: secret,
    PGOPTIONS: "",
    DATA_RUNTIME_ROLE: role,
  };
  const script = fileURLToPath(new URL("../scripts/data-transfer.mjs", import.meta.url));
  const transfer = (command, args) =>
    promisify(execFile)(process.execPath, [script, command, "--username", user.username, ...args], { env });
  const exported = join(directory, "account.json");
  const plan = join(directory, "plan.json");
  await transfer("export", ["--file", exported]);
  assert.equal(JSON.parse(await readFile(exported, "utf8")).private["work-tasks"][0].title, "Legacy work");
  await transfer("preview", ["--file", exported, "--plan", plan]);
  await transfer("apply", ["--plan", plan]);
  assert.equal((await repository.read(user.id)).workTasks[0].title, "Legacy work");
  await assert.rejects(transfer("apply", ["--plan", plan]), /changed after revision/);
});
