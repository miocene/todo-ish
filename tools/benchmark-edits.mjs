import assert from "node:assert/strict";
import { createResourceSync } from "../src/app/resource-sync.js";
import { createPendingStorage } from "../src/app/pending-storage.js";
import { validateAppDataResource } from "../backend/api/src/app-data-validation.mjs";
const rows = new Map();
let bytes = 0;
let writes = 0;
const local = {
  get length() {
    return rows.size;
  },
  key: (i) => [...rows.keys()][i],
  getItem: (key) => rows.get(key) ?? null,
  setItem: (key, value) => {
    bytes += Buffer.byteLength(value);
    writes++;
    rows.set(key, value);
  },
  removeItem: (key) => rows.delete(key),
};
const value = {
  lists: [
    {
      id: "general",
      title: "General",
      color: "#2765EC",
      tasks: Array.from({ length: 100 }, (_, i) => ({
        id: `active-${i}`,
        title: `Task ${i}`,
      })),
    },
  ],
  history: Array.from({ length: 5000 }, (_, i) => ({
    id: `old-${i}`,
    title: `Historical task ${i}`,
    completedAt: "2026-09-10T12:00:00.000Z",
  })),
};
const state = { revisions: { todos: 1 }, todos: value };
const sync = createResourceSync({
  storage: createPendingStorage({
    storage: () => local,
    prefix: () => "bench:",
    legacyPrefix: () => null,
    resources: ["todos"],
  }),
  normalize: validateAppDataResource,
  onChange: (state) => assert.equal(state.durable, true),
  remoteValue: (state, key) => state[key],
  readRemote: async () => state,
  send: async () => ({ revision: 2 }),
  clock: { setTimeout: () => 0, clearTimeout: () => {} },
});
sync.hydrate(state, ["todos"]);
const started = performance.now();
for (let i = 0; i < 50; i++) {
  value.lists[0].tasks[0].title = `Edited title ${i}`;
  sync.write("todos", value);
}
console.log(
  JSON.stringify({
    historyRows: 5000,
    activeRows: 100,
    edits: 50,
    millisecondsPerEdit: (performance.now() - started) / 50,
    bytesWrittenPerEdit: Math.round(bytes / 50),
    storageWrites: writes,
    storedBytes: [...rows.values()].reduce(
      (n, value) => n + Buffer.byteLength(value),
      0,
    ),
  }),
);
