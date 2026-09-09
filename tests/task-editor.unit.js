import assert from "node:assert/strict";
import test from "node:test";
import { createTaskEditor } from "../src/app/task-editor.js";

test("Enter respects composition and focuses the next task or creates one", () => {
  const editor = createTaskEditor({ save() {} });
  const tasks = [{ id: "a" }, { id: "b" }];
  const actions = [];
  const event = { preventDefault: () => actions.push("prevent") };
  const callbacks = { focus: (task) => actions.push(task.id), create: () => actions.push("new") };
  editor.enter(tasks, tasks[0], { ...event, isComposing: true }, callbacks);
  assert.deepEqual(actions, []);
  editor.enter(tasks, tasks[0], event, callbacks);
  editor.enter(tasks, tasks[1], event, callbacks);
  assert.deepEqual(actions, ["prevent", "b", "prevent", "new"]);
});

test("discarding a blank draft removes its related ordering before saving", () => {
  const tasks = [];
  const order = ["draft"];
  const snapshots = [];
  const editor = createTaskEditor({ save: () => snapshots.push({ tasks: [...tasks], order: [...order] }) });
  const draft = editor.add(tasks, { id: "draft", title: "" });
  editor.finish(tasks, draft, () => order.splice(0, 1));
  assert.deepEqual(snapshots.at(-1), { tasks: [], order: [] });
  const existing = { id: "existing", title: "" };
  tasks.push(existing);
  assert.equal(editor.finish(tasks, existing), false);
});

test("focus waits for rendering and unmount cancels delayed movement", () => {
  const renders = [];
  const timers = new Map();
  let focused = false;
  let selection;
  const input = {
    value: "Title",
    focus: () => {
      focused = true;
    },
    setSelectionRange: (...range) => {
      selection = range;
    },
  };
  const editor = createTaskEditor({
    save() {},
    afterRender: (callback) => renders.push(callback),
    findInput: () => input,
    clock: {
      setTimeout: (callback) => {
        timers.set(1, callback);
        return 1;
      },
      clearTimeout: (id) => timers.delete(id),
    },
  });
  editor.focus("title", { caretAtEnd: true });
  assert.equal(focused, false);
  renders[0]();
  assert.deepEqual(selection, [5, 5]);
  const tasks = [{ id: "a" }, { id: "b" }];
  editor.scheduleMove(tasks[0], true, tasks);
  assert.equal(timers.size, 1);
  editor.clear();
  assert.equal(timers.size, 0);
  assert.equal(tasks[0].id, "a");
});

test("completion ordering waits, reverses on uncheck, and cancels stale moves", () => {
  const callbacks = new Map();
  let timer = 0;
  let saves = 0;
  const editor = createTaskEditor({
    save: () => saves++,
    clock: {
      setTimeout(callback, delay) {
        assert.equal(delay, 500);
        callbacks.set(++timer, callback);
        return timer;
      },
      clearTimeout: (id) => callbacks.delete(id),
    },
  });
  const flush = () => {
    const pending = [...callbacks.values()];
    callbacks.clear();
    pending.forEach((callback) => callback());
  };
  const first = { id: "a" };
  const tasks = [first, { id: "b" }, { id: "c" }];
  editor.scheduleMove(first, true, tasks);
  assert.equal(tasks[0], first);
  flush();
  assert.equal(tasks.at(-1), first);
  editor.scheduleMove(first, false, tasks);
  assert.equal(tasks.at(-1), first);
  flush();
  assert.equal(tasks[0], first);
  assert.equal(saves, 2);

  editor.scheduleMove(first, true, tasks);
  editor.scheduleMove(first, false, tasks);
  assert.equal(callbacks.size, 1);
  flush();
  assert.equal(tasks[0], first);
  assert.equal(saves, 2);

  editor.scheduleMove(first, true, tasks);
  tasks.splice(0, 1);
  flush();
  assert.deepEqual(
    tasks.map((task) => task.id),
    ["b", "c"],
  );
  assert.equal(saves, 2);

  const order = ["a", "b"];
  editor.scheduleMove(first, true, order, first.id);
  flush();
  assert.deepEqual(order, ["b", "a"]);
  editor.scheduleMove(first, false, order, first.id);
  flush();
  assert.deepEqual(order, ["a", "b"]);
});
