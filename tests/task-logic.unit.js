import assert from "node:assert/strict";
import test from "node:test";
import {
  activityLevel,
  activityYears,
  buildActivityCalendar,
  collectCompletedActivity,
  groupActivityByDay,
} from "../src/app/activity.js";
import { filamentSupplyStatus } from "../src/app/printing-supplies.js";
import { flossSupplyStatus } from "../src/app/stitching-supplies.js";
import { shiftIsoDate } from "../src/app/date.js";
import {
  completedTasksLast,
  createCompletionMoveScheduler,
  finishTaskDraft,
  moveItemForCompletion,
  nextEntityId,
  setTaskCompletion,
  serializableTasks,
} from "../src/app/task-list.js";

test("calendar dates preserve their day and shift across month boundaries", () => {
  assert.equal(shiftIsoDate("2026-10-31", 1), "2026-11-01");
});

test("task list helpers preserve order and remove abandoned drafts", () => {
  const tasks = [
    { id: "task-1", title: "First", completed: true },
    { id: "task-2", title: "Second", completed: false },
    { id: "task-3", title: "", completed: false },
  ];
  const drafts = new Set(["task-3"]);

  assert.deepEqual(
    completedTasksLast(tasks).map((task) => task.id),
    ["task-2", "task-3", "task-1"],
  );
  assert.deepEqual(
    serializableTasks(tasks, drafts).map((task) => task.id),
    ["task-1", "task-2"],
  );
  assert.equal(finishTaskDraft(tasks, tasks[2], drafts), true);
  assert.deepEqual(
    tasks.map((task) => task.id),
    ["task-1", "task-2"],
  );
  assert.equal(nextEntityId(tasks, "task"), "task-3");
  assert.equal(moveItemForCompletion(tasks, tasks[0], true), true);
  assert.deepEqual(
    tasks.map((task) => task.id),
    ["task-2", "task-1"],
  );
});

test("task completion records and clears its timestamp", () => {
  const task = { id: "task-1", title: "Finish profile", completed: false };
  setTaskCompletion(task, true, "2026-08-28T12:00:00.000Z");
  assert.equal(task.completed, true);
  assert.equal(task.completedAt, "2026-08-28T12:00:00.000Z");

  setTaskCompletion(task, false);
  assert.equal(task.completed, false);
  assert.equal(task.completedAt, undefined);
});

test("activity helpers group completed items and build a complete calendar year", () => {
  const items = [
    { id: "one", date: "2026-08-28", completedAt: "2026-08-28T09:00:00.000Z" },
    { id: "two", date: "2026-08-28", completedAt: "2026-08-28T10:00:00.000Z" },
    { id: "old", date: "2024-02-01", completedAt: "2024-02-01T10:00:00.000Z" },
  ];
  const groups = groupActivityByDay(items, 2026);
  const calendar = buildActivityCalendar(2026, groups);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 2);
  assert.equal(calendar.days.filter((day) => day.count !== undefined).length, 365);
  assert.equal(calendar.days.find((day) => day.date === "2026-08-28").level, 2);
  assert.deepEqual(activityYears(items, 2026), [2026, 2025, 2024, 2023, 2022]);
});

test("activity levels use one shared productivity scale", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(activityLevel), [0, 1, 2, 3, 3, 4]);
});

test("completion moves are cancellable and use one timer per task", () => {
  const callbacks = new Map();
  let nextTimer = 1;
  const clock = {
    clearTimeout(timer) {
      callbacks.delete(timer);
    },
    setTimeout(callback) {
      const timer = nextTimer++;
      callbacks.set(timer, callback);
      return timer;
    },
  };
  const scheduler = createCompletionMoveScheduler(500, clock);
  let moves = 0;

  scheduler.schedule("task-1", () => moves++);
  scheduler.cancel("task-1");
  assert.equal(callbacks.size, 0);
  scheduler.schedule("task-1", () => moves++);
  callbacks.values().next().value();
  assert.equal(moves, 1);
  scheduler.clear();
});

test("filament requirements aggregate unfinished usages into whole spools", () => {
  const projects = [
    {
      tasks: [
        {
          completed: false,
          filaments: [
            { catalogId: "bambu-pla-basic-filament-10101", label: "PLA Basic · Black", weightGrams: 1002 },
            { catalogId: "bambu-pla-basic-filament-10101", label: "PLA Basic · Black", weightGrams: 8 },
          ],
        },
        {
          completed: true,
          filaments: [{ catalogId: "bambu-pla-basic-filament-10101", weightGrams: 5000 }],
        },
      ],
    },
  ];
  const supply = filamentSupplyStatus(projects, { "bambu-pla-basic-filament-10101": 1 }).get(
    "bambu-pla-basic-filament-10101",
  );

  assert.equal(supply.requiredGrams, 1010);
  assert.equal(supply.requiredSpools, 2);
  assert.equal(supply.missingSpools, 1);
});

test("floss requirements aggregate skeins and compare them with inventory", () => {
  const projects = [
    {
      tasks: [
        { completed: false, flossId: "dmc3347", requiredSkeins: 2, title: "DMC 3347" },
        { completed: false, flossId: "dmc3347", requiredSkeins: 1, title: "DMC 3347" },
        { completed: true, flossId: "dmc3347", requiredSkeins: 10, title: "DMC 3347" },
      ],
    },
  ];
  const supply = flossSupplyStatus(projects, { dmc3347: 1 }).get("dmc3347");

  assert.equal(supply.requiredSkeins, 3);
  assert.equal(supply.ownedSkeins, 1);
  assert.equal(supply.missingSkeins, 2);
});

test("todo history replacement requires an explicit complete snapshot", async () => {
  const { validateAppDataResource } = await import("../backend/api/src/app-data-validation.mjs");
  assert.throws(() => validateAppDataResource("todos", { lists: [], replaceHistory: true }), /history/);
  assert.deepEqual(validateAppDataResource("todos", { lists: [], history: [], replaceHistory: true }), {
    lists: [],
    history: [],
    replaceHistory: true,
  });
  assert.deepEqual(validateAppDataResource("todos", { lists: [] }), { lists: [] });
});

test("shopping validation saves purchases and history but excludes unfinished shortages", async () => {
  const { validateAppDataResource } = await import("../backend/api/src/app-data-validation.mjs");
  const purchase = {
    id: "purchase",
    title: "Two spools",
    completedAt: "2026-09-09T10:00:00Z",
    source: "filament-shortage",
    filamentId: "pla",
    quantity: 2,
  };
  const value = validateAppDataResource("shopping", {
    tasks: [purchase, ...Array.from({ length: 2001 }, (_, i) => ({ id: `derived-${i}`, source: "filament-shortage" }))],
    history: [{ id: "milk", title: "Milk", completedAt: purchase.completedAt }],
  });
  assert.equal(value.tasks.length, 1);
  assert.equal(value.tasks[0].quantity, 2);
  assert.equal(value.history[0].title, "Milk");
  assert.throws(() => validateAppDataResource("shopping", { tasks: [{ ...purchase, quantity: 0 }] }), /quantity/);
  assert.throws(() => validateAppDataResource("shopping", { tasks: [purchase], history: [purchase] }), /distinct/);
});

test("Activity accepts large histories without spreading function arguments", () => {
  const items = Array.from({ length: 200_000 }, () => ({ date: "2020-02-01" }));
  assert.deepEqual(activityYears(items, 2026), [2026, 2025, 2024, 2023, 2022, 2021, 2020]);
});

test("Activity reads completed records without changing its snapshot", () => {
  const data = {
    "work-tasks": [{ id: "work", title: "Done", date: "2026-09-01", checkedAt: "2026-09-03T12:00:00Z" }],
    chores: { tasks: [], history: [] },
    todos: { lists: [], history: [{ id: "retained", title: "Deleted", completedAt: "2026-09-02T12:00:00Z" }] },
    shopping: { tasks: [] },
    printing: { projects: [] },
    "cross-stitch": { projects: [] },
  };
  const before = structuredClone(data);
  const reads = [];
  const items = collectCompletedActivity((resource) => {
    reads.push(resource);
    return data[resource];
  });
  assert.equal(items.length, 2);
  assert.equal(items.find((item) => item.source === "Work").date, "2026-09-01");
  assert.deepEqual(data, before);
  assert.deepEqual(reads, Object.keys(data));
});
