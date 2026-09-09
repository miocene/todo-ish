import assert from "node:assert/strict";
import test from "node:test";
import { mergeSharedData } from "../src/app/shared-data-merge.js";
import { createResourceSync } from "../src/app/resource-sync.js";

const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture({
  records = new Map(),
  send,
  remote = { revisions: { tasks: 0 }, tasks: [] },
  delay = 0,
  merge,
  onUpdate,
} = {}) {
  const timers = new Map();
  const states = [];
  let nextId = 0;
  const writes = [];
  const sync = createResourceSync({
    storage: {
      load: () => [...records.values()],
      save: (entry) => records.set(entry.id, structuredClone(entry)),
      remove: (id) => records.delete(id),
    },
    normalize: (_resource, value) => {
      if (value.some((task) => !task.title.trim())) throw new Error("title must not be blank");
      return value;
    },
    remoteValue: (state, resource) => state[resource],
    readRemote: async () => remote,
    send: async (...args) => {
      writes.push(args);
      return send ? send(...args) : { revision: 1 };
    },
    onChange: (state) => states.push(state),
    merge,
    onUpdate,
    clock: {
      setTimeout: (fn, ms) => {
        const id = ++nextId;
        timers.set(id, { fn, ms });
        return id;
      },
      clearTimeout: (id) => timers.delete(id),
    },
    makeId: () => `draft-${++nextId}`,
    delay,
  });
  sync.hydrate(remote, ["tasks"]);
  return {
    sync,
    records,
    states,
    writes,
    remote,
    async advance() {
      const pending = [...timers.values()];
      timers.clear();
      for (const timer of pending) timer.fn();
      await tick();
    },
    timers,
  };
}
const task = (title) => [{ id: "one", title }];

test("pending edits survive reload and clear only after acknowledgement", async () => {
  const first = fixture();
  first.sync.write("tasks", task("Keep me"));
  assert.equal(first.records.size, 1);
  const reload = fixture({ records: first.records });
  assert.deepEqual(reload.sync.value("tasks"), task("Keep me"));
  await reload.advance();
  assert.equal(reload.records.size, 0);
  assert.equal(reload.states.at(-1).state, "saved");
});

test("invalid drafts are retained without retrying and resume when corrected", async () => {
  const f = fixture();
  f.sync.write("tasks", task(""));
  await f.advance();
  assert.equal(f.writes.length, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(f.states.at(-1).state, "invalid");
  assert.equal(f.records.size, 1);
  f.sync.write("tasks", task("Corrected"));
  await f.advance();
  assert.equal(f.writes.length, 1);
  assert.equal(f.states.at(-1).state, "saved");
});

test("a lost response reconciles the acknowledged version before saving newer edits", async () => {
  let count = 0;
  const remote = { revisions: { tasks: 0 }, tasks: [] };
  const f = fixture({
    remote,
    send: async (_resource, value, revision) => {
      count++;
      if (count === 1) {
        remote.tasks = value;
        remote.revisions.tasks = 1;
        throw new Error("response lost");
      }
      if (revision !== remote.revisions.tasks) throw Object.assign(new Error("conflict"), { status: 409 });
      remote.tasks = value;
      return { revision: ++remote.revisions.tasks };
    },
  });
  f.sync.write("tasks", task("First"));
  await f.advance();
  f.sync.write("tasks", task("Newer"));
  await f.advance();
  assert.deepEqual(remote.tasks, task("Newer"));
  assert.deepEqual(
    f.writes.map((args) => args[2]),
    [0, 1],
  );
  assert.equal(f.records.size, 0);
});

test("another browser's edits remain untouched and local drafts remain recoverable", async () => {
  const f = fixture({
    send: async () => {
      f.remote.tasks = task("Other browser");
      f.remote.revisions.tasks = 1;
      throw Object.assign(new Error("conflict"), { status: 409 });
    },
  });
  f.sync.write("tasks", task("Mine"));
  await f.advance();
  assert.equal(f.states.at(-1).state, "conflict");
  assert.equal(f.records.size, 1);
  f.sync.write("tasks", task("My newer edit"));
  await f.advance();
  assert.equal(f.writes.length, 1);
  assert.deepEqual(f.sync.pending()[0].value, task("My newer edit"));
});

test("authentication and permanent API errors do not retry in a loop", async () => {
  for (const status of [400, 401, 403, 404, 413]) {
    const f = fixture({
      send: async () => {
        throw Object.assign(new Error("rejected"), { status });
      },
    });
    f.sync.write("tasks", task("Keep me"));
    await f.advance();
    assert.equal(f.timers.size, 0);
    assert.equal(f.records.size, 1);
  }
});

test("multiple local drafts are preserved without choosing one to overwrite the server", async () => {
  const records = new Map([
    ["a", { id: "a", resource: "tasks", revision: 0, base: "[]", value: task("First tab") }],
    ["b", { id: "b", resource: "tasks", revision: 0, base: "[]", value: task("Second tab") }],
  ]);
  const f = fixture({ records });
  await f.advance();
  assert.equal(f.states.at(-1).state, "conflict");
  assert.equal(f.writes.length, 0);
  assert.equal(f.sync.pending().length, 2);
  await f.sync.retry();
  await f.advance();
  assert.equal(f.writes.length, 0);
  assert.equal(f.sync.pending().length, 2);
});

test("failed local storage is visible while successful server acknowledgement still clears the draft", async () => {
  const records = new Map();
  records.set = () => {
    throw new Error("storage full");
  };
  const f = fixture({ records });
  f.sync.write("tasks", task("Keep tab open"));
  assert.equal(f.states.at(-1).durable, false);
  assert.equal(f.sync.pending().length, 1);
  await f.advance();
  assert.equal(f.states.at(-1).state, "saved");
});

test("bursts debounce to the latest durable value and unchanged resources do not save again", async () => {
  const f = fixture({ delay: 250 });
  for (const title of ["T", "Ty", "Typing"]) f.sync.write("tasks", task(title));
  assert.equal(f.timers.size, 1);
  assert.equal(f.timers.values().next().value.ms, 250);
  assert.deepEqual([...f.records.values()][0].value, task("Typing"));
  assert.equal(f.writes.length, 0);
  await f.advance();
  assert.equal(f.writes.length, 1);
  f.sync.write("tasks", [{ title: "Typing", id: "one" }]);
  await f.advance();
  assert.equal(f.writes.length, 1);
  assert.equal(f.records.size, 0);
});

test("edits made during an in-flight save are sent with the acknowledged revision", async () => {
  let acknowledge;
  const f = fixture({
    send: (_resource, _value, revision) =>
      revision === 0
        ? new Promise((resolve) => {
            acknowledge = resolve;
          })
        : Promise.resolve({ revision: revision + 1 }),
  });
  f.sync.write("tasks", task("First"));
  await f.advance();
  f.sync.write("tasks", task("Second"));
  f.sync.write("tasks", task("Third"));
  acknowledge({ revision: 1 });
  await tick();
  assert.deepEqual(
    f.writes.map((args) => args[1][0].title),
    ["First", "Third"],
  );
  assert.deepEqual(
    f.writes.map((args) => args[2]),
    [0, 1],
  );
  assert.equal(f.records.size, 0);
});

test("duplicate drafts already saved remotely clear without another write", async () => {
  const value = task("Already saved");
  const records = new Map(["a", "b"].map((id) => [id, { id, resource: "tasks", revision: 0, base: "[]", value }]));
  const f = fixture({ records, remote: { revisions: { tasks: 1 }, tasks: value } });
  await f.advance();
  assert.equal(f.records.size, 0);
  assert.equal(f.writes.length, 0);
  assert.equal(f.states.at(-1).state, "saved");
});

test("identical unsaved drafts consolidate and save once", async () => {
  const records = new Map(
    ["a", "b"].map((id) => [id, { id, resource: "tasks", revision: 0, base: "[]", value: task("Same edit") }]),
  );
  const f = fixture({ records });
  assert.equal(f.sync.pending().length, 1);
  await f.advance();
  assert.equal(f.writes.length, 1);
  assert.deepEqual(f.writes[0][1], task("Same edit"));
  assert.equal(f.records.size, 0);
});

test("saved copies do not block the remaining newer draft", async () => {
  const old = task("Old");
  const records = new Map([
    ["a", { id: "a", resource: "tasks", revision: 0, base: "[]", value: old }],
    ["b", { id: "b", resource: "tasks", revision: 1, base: JSON.stringify(old), value: task("New") }],
  ]);
  const f = fixture({ records, remote: { revisions: { tasks: 1 }, tasks: old } });
  await f.advance();
  assert.deepEqual(f.writes[0][1], task("New"));
  assert.equal(f.records.size, 0);
});

test("Retry rechecks multiple drafts after the server acknowledges one", async () => {
  const first = task("First");
  const second = task("Second");
  const records = new Map([
    ["a", { id: "a", resource: "tasks", revision: 0, base: "[]", value: first }],
    ["b", { id: "b", resource: "tasks", revision: 0, base: "[]", value: second }],
  ]);
  const f = fixture({ records });
  assert.equal(f.states.at(-1).state, "conflict");
  f.remote.tasks = first;
  f.remote.revisions.tasks = 1;
  await f.sync.retry();
  await f.advance();
  assert.equal(f.sync.pending().length, 1);
  assert.deepEqual(f.sync.pending()[0].value, second);
  // A different edit still conflicts: it must not overwrite the saved first edit.
  assert.equal(f.states.at(-1).state, "conflict");
  assert.equal(f.writes.length, 0);
});

test("unchanged initialized data does not create a local draft", () => {
  const f = fixture({ remote: { revisions: { tasks: 1 }, tasks: task("Saved") } });
  f.sync.write("tasks", task("Saved"));
  assert.equal(f.records.size, 0);
  assert.equal(f.timers.size, 0);
});

test("Retry removes all pending entries when both drafts become acknowledged", async () => {
  const records = new Map([
    ["a", { id: "a", resource: "tasks", revision: 0, base: "[]", value: task("First") }],
    ["b", { id: "b", resource: "tasks", revision: 0, base: "[]", value: task("Second") }],
  ]);
  const f = fixture({ records });
  f.remote.tasks = task("First");
  await f.sync.retry();
  f.remote.tasks = task("Second");
  await f.sync.retry();
  assert.equal(f.sync.pending().length, 0);
  assert.equal(f.sync.value("tasks"), undefined);
  assert.equal(f.states.at(-1).state, "saved");
});

const mergeLists = (_resource, base, local, remote) =>
  mergeSharedData("shopping", { tasks: base }, { tasks: local }, { tasks: remote })?.tasks;

test("a revision conflict merges independent shared edits before retrying", async () => {
  const remote = { revisions: { tasks: 0 }, tasks: [{ id: "milk", title: "Milk" }] };
  let attempts = 0;
  const updates = [];
  const f = fixture({
    remote,
    merge: mergeLists,
    onUpdate: (_resource, value) => updates.push(value),
    send: async (_resource, value, revision) => {
      if (++attempts === 1) {
        remote.tasks.push({ id: "eggs", title: "Eggs" });
        remote.revisions.tasks++;
        throw Object.assign(new Error("conflict"), { status: 409 });
      }
      assert.equal(revision, 1);
      remote.tasks = value;
      return { revision: ++remote.revisions.tasks };
    },
  });
  f.sync.write("tasks", [...remote.tasks, { id: "bread", title: "Bread" }]);
  await f.advance();
  assert.deepEqual(
    remote.tasks.map((item) => item.id),
    ["milk", "bread", "eggs"],
  );
  assert.equal(updates.length, 1);
  assert.equal(f.sync.pending().length, 0);
});

test("background refresh updates saved lists and rebases pending edits", async () => {
  const remote = { revisions: { tasks: 0 }, tasks: [{ id: "milk", title: "Milk" }] };
  const updates = [];
  const f = fixture({ remote, merge: mergeLists, onUpdate: (_resource, value) => updates.push(value) });
  f.sync.write("tasks", [...remote.tasks, { id: "bread", title: "Bread" }]);
  remote.tasks.push({ id: "eggs", title: "Eggs" });
  remote.revisions.tasks++;
  f.sync.refresh(remote, ["tasks"]);
  assert.deepEqual(
    f.sync.value("tasks").map((item) => item.id),
    ["milk", "bread", "eggs"],
  );
  assert.equal(updates.length, 1);
});
