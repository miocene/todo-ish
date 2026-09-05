import assert from "node:assert/strict";
import test from "node:test";
import { validateAppDataResource } from "../backend/api/src/app-data-validation.mjs";
import { serializableChores } from "../src/app/task-list.js";

test("blank chore drafts are omitted from both tasks and occurrence order", () => {
  const chore = { id: "one", title: "", details: "Weekly", completed: false, nextDue: "2026-09-05" };
  const chores = { tasks: [chore], occurrenceOrder: [chore.id] };
  const draftIds = new Set([chore.id]);
  assert.deepEqual(validateAppDataResource("chores", serializableChores(chores, draftIds)), {
    tasks: [],
    occurrenceOrder: [],
  });
  chore.title = "Water plants";
  const value = validateAppDataResource("chores", serializableChores(chores, draftIds));
  assert.deepEqual(value.occurrenceOrder, [chore.id]);
  assert.equal(value.tasks[0].title, chore.title);
});
