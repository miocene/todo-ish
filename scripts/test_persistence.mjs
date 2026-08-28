import assert from "node:assert/strict";
import test from "node:test";
import { createInitialState } from "../src/data/initial-state.js";
import {
  CORRUPT_BACKUP_KEY,
  LEGACY_STORAGE_KEYS,
  STATE_VERSION,
  STORAGE_KEY,
  loadState,
  saveState,
} from "../src/persistence/state-storage.js";

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }
}

test("legacy prototype state migrates to the minimal versioned contract", () => {
  const storage = new MemoryStorage();
  storage.setItem(
    LEGACY_STORAGE_KEYS[0],
    JSON.stringify({
      auth: { signedIn: true },
      purchases: [{ id: "old-purchase" }],
      todos: [null, { id: "todo", title: "Keep me", notes: "Remove me", subtasks: [], dateMode: "none" }],
      completedTodos: [{ id: "done", title: "Already done" }],
      shopping: [
        { id: "milk", title: "Oat milk", linked: false, quantity: 2 },
        { id: "derived", title: "Derived item", linked: true },
      ],
      filaments: [
        {
          id: "f1",
          catalogId: "bambu-pla-basic-filament-10101",
          name: "PLA Basic · Black",
          owned: 1001,
          spoolSize: 1000,
          unit: "g",
        },
      ],
      threadCatalog: [{ id: "dmc310", owned: 1 }],
      printing: [
        { id: "p1", title: "Print", status: "active", parts: [{ id: "part", title: "Part", filamentId: "f1" }] },
      ],
      stitch: [],
    }),
  );

  const state = loadState(storage);

  assert.deepEqual(Object.keys(state), Object.keys(createInitialState()));
  assert.deepEqual(state.filamentStock, [{ catalogId: "bambu-pla-basic-filament-10101", owned: 2 }]);
  assert.equal(state.printing[0].parts[0].filamentId, "bambu-pla-basic-filament-10101");
  assert.equal(state.printing[0].parts[0].filamentLabel, "PLA Basic · Black");
  assert.match(state.printing[0].color, /^#[\da-f]{6}$/i);
  assert.equal(state.todos.find((item) => item.id === "done")?.done, true);
  assert.equal("notes" in state.todos[0], false);
  assert.deepEqual(state.shopping, [{ id: "milk", title: "Oat milk", done: false }]);

  const persisted = JSON.parse(storage.getItem(STORAGE_KEY));
  assert.equal(persisted.version, STATE_VERSION);
  assert.equal(JSON.stringify(persisted).includes("Remove me"), false);
});

test("saving strips derived shopping rows", () => {
  const storage = new MemoryStorage();
  const state = createInitialState();
  state.shopping = [
    { id: "ordinary", title: "Milk", done: false },
    { id: "derived", title: "PLA", linked: true, sourceType: "filament", sourceId: "pla", quantity: 1 },
  ];

  saveState(state, storage);

  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)).state.shopping, [
    { id: "ordinary", title: "Milk", done: false },
  ]);
});

test("invalid state is backed up before returning an empty state", () => {
  const storage = new MemoryStorage();
  storage.setItem(STORAGE_KEY, "not json");
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.deepEqual(loadState(storage), createInitialState());
  } finally {
    console.error = originalError;
  }
  assert.equal(storage.getItem(CORRUPT_BACKUP_KEY), "not json");
});
