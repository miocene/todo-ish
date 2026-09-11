import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Client, Pool } from "pg";
import { chromium, expect } from "@playwright/test";
import { createServer as createViteServer } from "vite";
import vue from "@vitejs/plugin-vue";
import { runMigrations } from "../src/migrations.mjs";
import { createAppDataRepository } from "../src/app-data-repository.mjs";
import { createCatalogRepository } from "../src/catalog-repository.mjs";
import { createHttpServer } from "../src/http-server.mjs";
import { createAuthRepository } from "../src/auth-repository.mjs";
import { createAuthService } from "../src/auth-service.mjs";
const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString)
  throw new Error("Set TEST_DATABASE_URL to a disposable PostgreSQL instance");
async function browserDatabase(t, { authenticated = true } = {}) {
  const suffix = randomUUID().replaceAll("-", "");
  const database = `todo_legacy_${suffix}`;
  const role = `todo_legacy_runtime_${suffix}`;
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
  });
  await admin.query(`CREATE ROLE "${role}" NOLOGIN`);
  await admin.query(`CREATE DATABASE "${database}"`);
  await installer.connect();
  await installer.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${role}"`,
  );
  await runMigrations(
    installer,
    new URL("../../database/migrations/", import.meta.url),
    {
      runtimeRole: role,
      log: () => {},
    },
  );
  const user = {
    id: "legacy-owner",
    username: "legacy-owner",
    displayName: "Legacy Owner",
  };
  await installer.query(
    "INSERT INTO auth_users(id,username,display_name) VALUES ($1,$2,$3)",
    [user.id, user.username, user.displayName],
  );
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
  const authRepository = createAuthRepository(scoped);
  const setupCode = randomUUID();
  await authRepository.provisionUser({
    user,
    setupCode: {
      tokenHash: createHash("sha256").update(setupCode).digest("base64url"),
      expiresAt: new Date(Date.now() + 600_000),
    },
  });
  const authConfig = {
    rpID: "localhost",
    rpName: "Done-ish test",
    secureCookies: false,
    challengeTtlSeconds: 300,
    sessionTtlSeconds: 3600,
  };
  api = createHttpServer(
    { ...repository, ...createCatalogRepository(scoped) },
    authenticated
      ? {
          session: async () => ({ authenticated: true, user }),
          requireUser: async () => user,
        }
      : createAuthService(authRepository, authConfig),
    { authenticationBypass: authenticated },
  );
  await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
  vite = await createViteServer({
    root: fileURLToPath(new URL("../../../", import.meta.url)),
    configFile: false,
    envFile: false,
    logLevel: "error",
    plugins: [vue()],
    define: {
      "import.meta.env.VITE_API_ORIGIN": '""',
      "import.meta.env.VITE_DEMO_DATA": '"false"',
    },
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
  page.setDefaultTimeout(10_000);
  page.setDefaultNavigationTimeout(15_000);
  page.on("pageerror", (error) => t.diagnostic(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400)
      t.diagnostic(`${response.status()} ${response.url()}`);
  });
  const origin = `http://localhost:${vite.httpServer.address().port}`;
  authConfig.origin = origin;
  return { page, repository, user, setupCode, origin };
}

test("real browser legacy storage imports into PostgreSQL and retains its originals", async (t) => {
  const { page, repository, user, origin } = await browserDatabase(t);
  const legacy = {
    "done-ish.filament-inventory.v1": { "old-filament": 2 },
    "done-ish.floss-inventory.v1": { "old-floss": 3 },
    "done-ish.work-tasks.v1": [
      { id: "legacy-work", title: "Legacy work", date: null },
    ],
    "done-ish.page-tasks.v1.todos": {
      lists: [
        {
          id: "legacy-list",
          title: "Legacy list",
          color: "#8FB7B0",
          tasks: [
            { id: "legacy-todo", title: "Legacy todo", completed: false },
          ],
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
        {
          id: "legacy-chore",
          title: "Legacy chore",
          details: "Every day",
          nextDue: "2026-09-10",
          completed: false,
        },
      ],
    },
  };
  await page.addInitScript((data) => {
    for (const [key, value] of Object.entries(data))
      if (localStorage.getItem(key) === null)
        localStorage.setItem(key, JSON.stringify(value));
  }, legacy);
  for (const route of ["work", "todos", "printing", "chores"]) {
    await page.goto(`${origin}/${route}`);
    const resource = {
      work: "work-tasks",
      todos: "todos",
      printing: "printing",
      chores: "chores",
    }[route];
    try {
      await expect
        .poll(
          async () =>
            (await repository.read(user.id)).initializedResources.includes(
              resource,
            ),
          { message: route },
        )
        .toBe(true);
    } catch (error) {
      t.diagnostic(await page.locator("body").innerText());
      throw error;
    }
  }
  const state = await repository.read(user.id);
  assert.equal(state.workTasks[0].title, "Legacy work");
  assert.equal(
    state.pages.todos.lists.find((list) => list.id === "legacy-list").tasks[0]
      .title,
    "Legacy todo",
  );
  assert.equal(
    state.pages.printing.projects[0].tasks[0].filaments[0].catalogId,
    "old-filament",
  );
  assert.equal(state.pages.chores.tasks[0].schedule.frequency, "day");
  assert.deepEqual(state.inventories.filament, { "old-filament": 2 });
  assert.deepEqual(state.inventories.floss, { "old-floss": 3 });
  for (const [key, value] of Object.entries(legacy))
    assert.equal(
      await page.evaluate((key) => localStorage.getItem(key), key),
      JSON.stringify(value),
    );
  await page.goto(`${origin}/profile`);
  await expect(
    page.getByRole("button", { name: /Download .*data/ }),
  ).toHaveCount(0);
});

test("native passkey setup and sign-in persist a browser edit in PostgreSQL", async (t) => {
  const { page, repository, user, setupCode, origin } = await browserDatabase(
    t,
    { authenticated: false },
  );
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  const anonymous = await page.request.get(`${origin}/api/data`);
  assert.equal(anonymous.status(), 401);
  await page.goto(`${origin}/todos`);
  await page.getByRole("button", { name: "I have a setup code" }).click();
  await page.getByLabel("One-time setup code").fill(setupCode);
  await page
    .getByRole("button", { name: "Create passkey", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "New list", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add task to General", exact: true })
    .click();
  const title = page
    .locator("#todo-list-general")
    .getByRole("textbox", { name: "Task title", exact: true })
    .last();
  await title.fill("Persist through real authentication");
  await title.press("Tab");
  await expect
    .poll(
      async () =>
        (await repository.read(user.id)).pages.todos.lists
          .find((list) => list.id === "general")
          ?.tasks.at(-1)?.title,
    )
    .toBe("Persist through real authentication");
  await page.reload();
  await expect(
    page
      .locator("#todo-list-general")
      .getByRole("textbox", { name: "Task title", exact: true })
      .last(),
  ).toHaveValue("Persist through real authentication");
  await page.context().clearCookies();
  await page.reload();
  await page
    .getByRole("button", { name: "Sign in with passkey", exact: true })
    .click();
  await expect(
    page
      .locator("#todo-list-general")
      .getByRole("textbox", { name: "Task title", exact: true })
      .last(),
  ).toHaveValue("Persist through real authentication");
  const session = await page.request.get(`${origin}/api/auth/session`);
  assert.equal((await session.json()).user.id, user.id);
});
