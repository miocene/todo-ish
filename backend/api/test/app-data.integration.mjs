import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import pg from "pg";
import { createAppDataRepository, AppDataRevisionConflictError } from "../src/app-data-repository.mjs";
import { validateAppDataResource } from "../src/app-data-validation.mjs";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString)
  throw new Error(
    "Set TEST_DATABASE_URL to a disposable PostgreSQL instance with permission to create databases and roles.",
  );

const completedAt = "2026-09-05T22:30:00.000Z";
const values = {
  "work-tasks": [
    { id: "work-1", title: "Completed work", date: "2026-09-05", checkedAt: completedAt },
    { id: "work-2", title: "Backlog", date: null },
  ],
  "work-statuses": { "2026-09-05": "pto" },
  colors: { backlog: "#633533", "work-day:2026-09-05": "#E9B6B4" },
  chores: {
    occurrenceOrder: ["chore-2", "chore-1"],
    tasks: [
      {
        id: "chore-1",
        title: "Plants",
        details: "Weekly",
        nextDue: "2026-09-05",
        completed: false,
        schedule: { frequency: "week", interval: 2, startDate: "2026-09-05", weekdays: [0, 5], monthDays: [5] },
      },
      { id: "chore-2", title: "Kitchen", details: "Daily", nextDue: "2026-09-04", completed: true, completedAt },
    ],
  },
  todos: {
    lists: [
      {
        id: "list-1",
        title: "Home",
        color: "#8FB7B0",
        tasks: [
          { id: "todo-1", title: "Done", completed: true, completedAt },
          { id: "todo-2", title: "Next", completed: false },
        ],
      },
    ],
  },
  shopping: {
    tasks: [
      { id: "shop-1", title: "Milk", completed: false },
      { id: "shop-2", title: "Soap", productLink: "https://example.com/product", completed: true, completedAt },
      { id: "derived", title: "Derived shortage", source: "filament-shortage", completed: false },
    ],
  },
  printing: {
    projects: [
      {
        id: "project-1",
        title: "Print",
        description: "A print",
        color: "#597380",
        tasks: [
          {
            id: "print-1",
            title: "Part",
            completed: true,
            completedAt,
            filaments: [
              { id: "usage-1", catalogId: "retired-filament", label: "Fallback filament", weightGrams: 12.5 },
              { id: "usage-2", catalogId: "", label: "", weightGrams: "" },
            ],
          },
        ],
      },
    ],
  },
  "cross-stitch": {
    projects: [
      {
        id: "stitch-1",
        title: "Sampler",
        description: "",
        color: "#3E5168",
        totalCrosses: 20,
        tasks: [
          {
            id: "thread-1",
            title: "Fallback thread",
            flossId: "retired-floss",
            requiredSkeins: 2,
            crosses: 20,
            crossesDone: 20,
            completed: true,
            completedAt,
          },
        ],
      },
    ],
  },
  "filament-inventory": { "retired-filament": 3, empty: 0 },
  "floss-inventory": { "retired-floss": 2, empty: 0 },
};
const select = (state) => ({
  "work-tasks": state.workTasks,
  "work-statuses": state.workStatuses,
  colors: state.colors,
  chores: state.pages.chores,
  todos: state.pages.todos,
  shopping: state.pages.shopping,
  printing: state.pages.printing,
  "cross-stitch": state.pages.crossStitch,
  "filament-inventory": state.inventories.filament,
  "floss-inventory": state.inventories.floss,
});

// Only the randomly named database and role created here are modified or removed.
test("PostgreSQL application-data contract", async (t) => {
  const suffix = randomUUID().replaceAll("-", "");
  const database = `todo_test_${suffix}`;
  const role = `todo_test_runtime_${suffix}`;
  const admin = new pg.Client({ connectionString });
  let installer;
  let pool;
  let createdDatabase = false;
  let createdRole = false;
  await admin.connect();
  t.after(async () => {
    await pool?.end();
    await installer?.end();
    try {
      if (createdDatabase) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
      if (createdRole) await admin.query(`DROP ROLE "${role}"`);
    } finally {
      await admin.end();
    }
  });
  await admin.query(`CREATE ROLE "${role}" NOLOGIN`);
  createdRole = true;
  await admin.query(`CREATE DATABASE "${database}"`);
  createdDatabase = true;
  const url = new URL(connectionString);
  url.pathname = `/${database}`;
  installer = new pg.Client({ connectionString: url.toString() });
  await installer.connect();
  const migrationRoot = new URL("../../database/migrations/", import.meta.url);
  for (const filename of (await readdir(migrationRoot)).filter((name) => name.endsWith(".sql")).sort()) {
    const sql = (await readFile(new URL(filename, migrationRoot), "utf8")).replaceAll('"todo_runtime"', `"${role}"`);
    await installer.query("BEGIN");
    try {
      await installer.query(sql);
      await installer.query("COMMIT");
    } catch (error) {
      await installer.query("ROLLBACK");
      throw error;
    }
  }
  pool = new pg.Pool({ connectionString: url.toString(), max: 4 });
  const repository = createAppDataRepository({
    async connect() {
      const client = await pool.connect();
      try {
        await client.query(`SET ROLE "${role}"`);
        await client.query("SET TIME ZONE 'Pacific/Auckland'");
        return client;
      } catch (error) {
        client.release();
        throw error;
      }
    },
  });

  await t.test("every resource survives validation, storage, and reconstruction", async () => {
    for (const [resource, value] of Object.entries(values)) {
      assert.equal(await repository.replace(resource, validateAppDataResource(resource, value), 0), 1);
    }
    const state = await repository.read();
    const stored = select(state);
    for (const [resource, value] of Object.entries(values)) {
      assert.deepEqual(
        validateAppDataResource(resource, stored[resource]),
        validateAppDataResource(resource, value),
        resource,
      );
      assert.equal(state.revisions[resource], 1);
    }
    assert.equal(state.workTasks[0].date, "2026-09-05");
    assert.equal(state.pages.chores.tasks[0].nextDue, "2026-09-05");
    assert.equal(
      state.pages.shopping.tasks.some((task) => task.id === "derived"),
      false,
    );
    assert.equal(state.pages.crossStitch.projects[0].totalCrosses, 20);
  });

  await t.test("chore schedules can move earlier and retain completed occurrences", async () => {
    const updated = structuredClone(values.chores);
    updated.tasks[0].nextDue = "2026-10-05";
    updated.tasks[0].completed = true;
    updated.tasks[0].completedAt = completedAt;
    await repository.replace("chores", validateAppDataResource("chores", updated), 1);
    updated.tasks[0].nextDue = "2026-09-07";
    updated.tasks[0].completed = false;
    delete updated.tasks[0].completedAt;
    updated.tasks[0].schedule.weekdays = [0];
    await repository.replace("chores", validateAppDataResource("chores", updated), 2);
    const state = await repository.read();
    assert.equal(state.pages.chores.tasks[0].nextDue, "2026-09-07");
    assert.deepEqual(state.pages.chores.tasks[0].schedule, updated.tasks[0].schedule);
    const history = await pool.query("SELECT completed_at FROM chore_occurrences WHERE chore_id = $1 AND due_on = $2", [
      "chore-1",
      "2026-10-05",
    ]);
    assert.equal(history.rows[0].completed_at.toISOString(), completedAt);
  });

  await t.test("only one simultaneous write can win a revision", async () => {
    const results = await Promise.allSettled(
      ["First", "Second"].map((title) =>
        repository.replace(
          "work-tasks",
          validateAppDataResource("work-tasks", [{ id: "winner", title, date: null }]),
          1,
        ),
      ),
    );
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.ok(results.find((result) => result.status === "rejected").reason instanceof AppDataRevisionConflictError);
    const state = await repository.read();
    assert.equal(state.revisions["work-tasks"], 2);
    assert.equal(state.workTasks.length, 1);
  });

  await t.test("a failed child batch rolls back parent changes and its revision", async () => {
    const before = await repository.read();
    const data = validateAppDataResource("printing", values.printing);
    data.projects[0].title = "Must roll back";
    data.projects[0].tasks[0].title = ""; // Intentionally bypass validation to exercise the database constraint.
    await assert.rejects(repository.replace("printing", data, 1), /constraint/);
    const after = await repository.read();
    assert.deepEqual(after.pages.printing, before.pages.printing);
    assert.equal(after.revisions.printing, 1);
  });

  await t.test("batched updates move children between parents and remove deleted data", async () => {
    const todos = {
      lists: [{ id: "list-2", title: "New list", color: "#287271", tasks: [...values.todos.lists[0].tasks].reverse() }],
    };
    await repository.replace("todos", validateAppDataResource("todos", todos), 1);
    assert.deepEqual((await repository.read()).pages.todos, todos);
    await repository.replace("todos", { lists: [] }, 2);
    await repository.replace("printing", { projects: [] }, 1);
    const state = await repository.read();
    assert.deepEqual(state.pages.todos, { lists: [] });
    assert.deepEqual(state.pages.printing, { projects: [] });
  });
});
