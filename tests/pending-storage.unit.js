import assert from "node:assert/strict";
import test from "node:test";
import { createPendingStorage } from "../src/app/pending-storage.js";

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
