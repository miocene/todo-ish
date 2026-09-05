import assert from "node:assert/strict";
import test from "node:test";
import {
  completionState,
  setTaskCompletion,
  workTaskFromApi,
  workTaskToApi,
} from "../backend/api/src/app-data-contract.mjs";
import { validateAppDataResource } from "../backend/api/src/app-data-validation.mjs";

test("work tasks use the common UI completion fields while retaining the existing API format", () => {
  const original = { id: "one", title: "Task", date: "2026-09-05", checkedAt: "2026-09-05T12:00:00.000Z" };
  const task = workTaskFromApi(original);
  assert.equal(task.completed, true);
  assert.equal(task.completedAt, original.checkedAt);
  assert.equal("checkedAt" in task, false);
  assert.deepEqual(workTaskToApi(task), original);
  setTaskCompletion(task, false);
  const payload = workTaskToApi(task);
  assert.equal("checkedAt" in payload, false);
  assert.equal("completed" in payload, false);
  assert.doesNotThrow(() => validateAppDataResource("work-tasks", [payload]));
  setTaskCompletion(task, true, original.checkedAt);
  assert.deepEqual(workTaskToApi(task), original);
});

test("database timestamps and API timestamps produce the same completion state", () => {
  const value = "2026-09-05T12:00:00.000Z";
  assert.deepEqual(completionState(new Date(value)), completionState(value));
  assert.deepEqual(completionState(null), { completed: false });
});
