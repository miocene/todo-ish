import { nextTick } from "vue";
import { createCompletionMoveScheduler, finishTaskDraft, moveItemForCompletion } from "./task-list.js";

/** Shared draft, focus, keyboard, and delayed-order behavior; pages retain their domain-specific edits. */
export function createTaskEditor({
  save,
  afterRender = nextTick,
  findInput = (id) => document.getElementById(id),
  clock = globalThis,
}) {
  const drafts = new Set();
  const moves = createCompletionMoveScheduler(undefined, clock);
  return {
    drafts,
    moves,
    add(tasks, task, { draft = true } = {}) {
      tasks.push(task);
      if (draft) drafts.add(task.id);
      save();
      return task;
    },
    finish(tasks, task, removed = () => {}) {
      if (!finishTaskDraft(tasks, task, drafts)) return false;
      moves.cancel(task.id);
      removed(task);
      save();
      return true;
    },
    enter(tasks, task, event, { create, focus }) {
      if (event.isComposing) return;
      event.preventDefault();
      const index = tasks.findIndex((item) => item.id === task.id);
      if (index === -1) return;
      const next = tasks[index + 1];
      if (next) focus(next);
      else create();
    },
    focus(inputId, { caretAtEnd = false } = {}) {
      afterRender(() => {
        const input = findInput(inputId);
        if (!input) return;
        input.focus();
        if (caretAtEnd) input.setSelectionRange(input.value.length, input.value.length);
      });
    },
    scheduleMove(task, completed, items, item = task) {
      moves.schedule(task.id, () => {
        if (moveItemForCompletion(items, item, completed)) save();
      });
    },
    clear() {
      moves.clear();
      drafts.clear();
    },
  };
}
