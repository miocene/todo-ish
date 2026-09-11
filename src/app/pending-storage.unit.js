import assert from "node:assert/strict";
import test from "node:test";
import { createPendingStorage } from "./pending-storage.js";

test("corrupt records remain exportable without hiding valid drafts or another account", () => {
  const draft = { id: "good", resource: "todos", value: { lists: [] } };
  const data = new Map([
    ["owner:broken", "{"],
    ["owner:good", JSON.stringify(draft)],
    ["second:private", "private"],
  ]);
  const store = {
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i],
    getItem: (k) => data.get(k),
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
  };
  let corrupt;
  const storage = createPendingStorage({
    storage: () => store,
    prefix: () => "owner:",
    legacyPrefix: () => null,
    resources: ["todos"],
    onCorrupt: (value) => (corrupt = value),
  });
  assert.deepEqual(storage.load(), [draft]);
  assert.deepEqual(corrupt, [{ storageKey: "owner:broken", raw: "{" }]);
  storage.remove("good");
  assert.equal(data.get("owner:broken"), "{");
  assert.equal(data.get("second:private"), "private");
  assert.deepEqual(storage.load(), []);
  storage.save(draft);
  assert.deepEqual(storage.load(), [draft]);
});

test("unavailable storage reports failure to the sync durability handler", () => {
  const storage = createPendingStorage({
    storage: () => {
      throw new Error("unavailable");
    },
    prefix: () => "owner:",
    legacyPrefix: () => null,
    resources: [],
  });
  assert.throws(() => storage.load(), /unavailable/);
});

test("baseline snapshots are reused while each title edit stays durable, including quota failures", () => {
  const data = new Map();
  let writes = [];
  let rejectHead = false;
  let corrupt = [];
  const store = {
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i],
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      if (rejectHead && key === "owner:draft") throw new Error("quota");
      data.set(key, value);
      writes.push(key);
    },
    removeItem: (key) => data.delete(key),
  };
  const options = {
    storage: () => store,
    prefix: () => "owner:",
    legacyPrefix: () => null,
    resources: ["todos"],
    onCorrupt: (value) => {
      corrupt = value;
    },
  };
  const storage = createPendingStorage(options);
  const draft = {
    id: "draft",
    resource: "todos",
    revision: 1,
    base: '{"lists":[]}',
    baseValue: { lists: [] },
    value: { lists: [], history: [] },
  };
  storage.save(draft);
  assert.equal(writes.length, 2);
  writes = [];
  draft.value = {
    lists: [{ id: "general", title: "Latest title", tasks: [] }],
  };
  storage.save(draft);
  assert.deepEqual(writes, ["owner:draft"]);
  assert.deepEqual(createPendingStorage(options).load(), [draft]);
  const original = [...data];
  rejectHead = true;
  assert.throws(
    () => storage.save({ ...draft, revision: 2, base: "new baseline" }),
    /quota/,
  );
  assert.deepEqual([...data], original);
  rejectHead = false;
  const head = JSON.parse(data.get("owner:draft"));
  data.set(head.baseRef, "{");
  assert.deepEqual(storage.load(), []);
  assert.equal(corrupt.length, 2);
  data.set(
    head.baseRef,
    JSON.stringify({ base: draft.base, baseValue: draft.baseValue }),
  );
  storage.remove("draft");
  assert.equal(data.size, 0);
});

test("pending snapshot references cannot read another account", () => {
  const data = new Map([
    [
      "owner:draft",
      JSON.stringify({
        id: "draft",
        resource: "todos",
        value: { lists: [] },
        storageVersion: 3,
        baseRef: "second:blob:private",
      }),
    ],
    ["second:blob:private", '{"base":"private"}'],
  ]);
  const storage = createPendingStorage({
    storage: () => ({
      get length() {
        return data.size;
      },
      key: (i) => [...data.keys()][i],
      getItem: (key) => data.get(key) ?? null,
    }),
    prefix: () => "owner:",
    legacyPrefix: () => null,
    resources: ["todos"],
  });
  assert.deepEqual(storage.load(), []);
});
