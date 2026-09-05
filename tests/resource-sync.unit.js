import assert from "node:assert/strict";
import test from "node:test";
import { createResourceSync } from "../src/app/resource-sync.js";

const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture({ records = new Map(), send, remote = { revisions: { tasks: 0 }, tasks: [] }, delay = 0 } = {}) {
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
