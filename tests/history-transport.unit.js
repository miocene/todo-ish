import assert from "node:assert/strict";
import test from "node:test";
import {
  historyDelta,
  applyHistoryDelta,
  serializeWrite,
  validateHistoryDelta,
} from "../backend/api/src/history-transport.mjs";
import { validateAppDataResource } from "../backend/api/src/app-data-validation.mjs";
const completedAt = "2026-09-10T12:00:00.000Z";
test("large histories produce bounded edits and preserve multilingual titles", () => {
  const history = Array.from({ length: 100_000 }, (_, i) => ({ id: String(i), title: "旧".repeat(500), completedAt }));
  const previous = { projects: [], history };
  const next = { ...previous, history: [...history, { id: "new", title: "Готово", completedAt }].slice(1) };
  const delta = validateHistoryDelta("printing", historyDelta("printing", previous, next));
  assert.equal(delta.history.upsert.length, 1);
  assert.deepEqual(delta.history.remove, ["0"]);
  assert.ok(Buffer.byteLength(serializeWrite(delta)) < 500);
  assert.deepEqual(applyHistoryDelta("printing", previous, delta), next);
});
test("2000 maximum-length multilingual work titles fit the shared byte cap", () => {
  const work = Array.from({ length: 2000 }, (_, i) => ({ id: String(i), title: "界".repeat(500), date: null }));
  assert.doesNotThrow(() => serializeWrite(validateAppDataResource("work-tasks", work)));
  assert.throws(() => serializeWrite({ text: "界".repeat(3_000_000) }), /8 MiB/);
});
test("uncheck followed by deleting an active completion explicitly removes server-retained history", () => {
  const previous = { lists: [{ id: "list", title: "List", tasks: [{ id: "task", title: "Done", completedAt }] }] };
  const delta = historyDelta("todos", previous, { lists: [] });
  assert.deepEqual(delta.history.remove, ["task"]);
  assert.throws(
    () => validateHistoryDelta("todos", { ...delta, history: { upsert: [], remove: Array(2001).fill("task") } }),
    /2000/,
  );
});
