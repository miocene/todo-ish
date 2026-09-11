import { nextTick } from "vue";
import { APP_DATA_LIMITS } from "../../backend/api/src/app-data-contract.mjs";
import {
  createCompletionMoveScheduler,
  finishTaskDraft,
  moveItemForCompletion,
  serializableTasks,
} from "./task-list.js";

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
    add(tasks, task, { draft = true, index = tasks.length } = {}) {
      tasks.splice(index, 0, task);
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
        if (caretAtEnd)
          input.setSelectionRange(input.value.length, input.value.length);
      });
    },
    scheduleMove(task, completed, items, item = task) {
      moves.schedule(task.id, () => {
        const focused = globalThis.document?.activeElement;
        if (!moveItemForCompletion(items, item, completed)) return;
        save();
        afterRender(() => {
          if (
            focused?.isConnected &&
            globalThis.document.activeElement === globalThis.document.body
          )
            focused.focus({ preventScroll: true });
        });
      });
    },
    clear() {
      moves.clear();
      drafts.clear();
    },
  };
}

/** Keep blank edits recoverable while only valid titles enter saved snapshots. */
export function createTitleEditor(tasks) {
  const validTitles = new Map(tasks.map((task) => [task.id, task.title]));
  const title = (task) => task.title.trim() || validTitles.get(task.id) || "";
  return {
    title,
    remember(task) {
      validTitles.set(task.id, task.title);
    },
    forget(id) {
      validTitles.delete(id);
    },
    update(task, value) {
      if (task.title === value) return false;
      task.title = value.slice(0, APP_DATA_LIMITS.title);
      if (!task.title.trim()) return false;
      validTitles.set(task.id, task.title.trim());
      return true;
    },
    restore(task) {
      if (!task.title.trim()) task.title = title(task);
    },
    serialize(tasks, drafts) {
      return serializableTasks(tasks, drafts, title).map((task) => ({
        ...task,
        title: title(task),
      }));
    },
  };
}
