import assert from "node:assert/strict";
import test from "node:test";
import { activityYears, buildActivityCalendar, groupActivityByDay } from "../src/app/activity.js";
import { filamentSupplyStatus } from "../src/app/printing-supplies.js";
import { flossSupplyStatus } from "../src/app/stitching-supplies.js";
import {
  completedTasksLast,
  createCompletionMoveScheduler,
  finishTaskDraft,
  moveItemToEnd,
  nextEntityId,
  setTaskCompletion,
  serializableTasks,
} from "../src/app/task-list.js";

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
  assert.equal(moveItemToEnd(tasks, tasks[0]), true);
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

  scheduler.schedule("task-1", true, () => moves++);
  scheduler.schedule("task-1", false, () => moves++);
  assert.equal(callbacks.size, 0);
  scheduler.schedule("task-1", true, () => moves++);
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
