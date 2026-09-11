import assert from "node:assert/strict";
import test from "node:test";
import {
  completedTasksLast,
  createCompletionMoveScheduler,
  finishTaskDraft,
  moveItemForCompletion,
  nextEntityId,
  setTaskCompletion,
  serializableTasks,
} from "./task-list.js";

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
