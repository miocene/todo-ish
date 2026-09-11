import assert from "node:assert/strict";
import test from "node:test";
import { mergeSharedData } from "../src/app/shared-data-merge.js";
const item = (id, title = id) => ({ id, title });
const list = (...tasks) => ({ tasks });

test("independent shopping additions, edits and removals merge without losing either user's work", () => {
  const result = mergeSharedData(
    "shopping",
    list(item("milk"), item("soap")),
    list(item("milk", "Oat milk"), item("soap"), item("bread")),
    list(item("milk"), item("eggs")),
  );
  assert.deepEqual(
    result.tasks.map(({ id, title }) => [id, title]),
    [
      ["milk", "Oat milk"],
      ["bread", "bread"],
      ["eggs", "eggs"],
    ],
  );
});

test("overlapping edits and edit-versus-delete stay recoverable conflicts", () => {
  assert.equal(
    mergeSharedData(
      "shopping",
      list(item("milk")),
      list(item("milk", "Oat")),
      list(item("milk", "Soy")),
    ),
    undefined,
  );
  assert.equal(
    mergeSharedData(
      "shopping",
      list(item("milk")),
      list(),
      list(item("milk", "Soy")),
    ),
    undefined,
  );
});

test("independent chore completion and additions retain complete ordering", () => {
  const chore = { ...item("plants"), details: "Daily", nextDue: "2026-09-09" };
  const second = { ...chore, id: "kitchen" };
  const base = { tasks: [chore], occurrenceOrder: [chore.id] };
  const local = {
    tasks: [{ ...chore, completedAt: "2026-09-09T12:00:00.000Z" }],
    occurrenceOrder: [chore.id],
  };
  const remote = {
    tasks: [chore, second],
    occurrenceOrder: [chore.id, second.id],
  };
  const result = mergeSharedData("chores", base, local, remote);
  assert.equal(result.tasks[0].completed, true);
  assert.deepEqual(result.occurrenceOrder, ["plants", "kitchen"]);
});

test("navigation preferences merge independent toggles and inventory merges different products", () => {
  assert.deepEqual(
    mergeSharedData(
      "preferences",
      { hiddenNavigation: [] },
      { hiddenNavigation: ["work"] },
      { hiddenNavigation: ["printing"] },
    ).hiddenNavigation,
    ["work", "printing"],
  );
  assert.deepEqual(
    mergeSharedData(
      "filament-inventory",
      { pla: 1 },
      { pla: 2 },
      { pla: 1, petg: 3 },
    ),
    {
      pla: 2,
      petg: 3,
    },
  );
  assert.equal(
    mergeSharedData("filament-inventory", { pla: 1 }, { pla: 2 }, { pla: 3 }),
    undefined,
  );
});

test("two users checking the same item retain one completion", () => {
  const base = list(item("milk"));
  const local = list({
    ...item("milk"),
    completedAt: "2026-09-09T12:00:01.000Z",
  });
  const remote = list({
    ...item("milk"),
    completedAt: "2026-09-09T12:00:00.000Z",
  });
  assert.equal(
    mergeSharedData("shopping", base, local, remote).tasks[0].completedAt,
    remote.tasks[0].completedAt,
  );
});
