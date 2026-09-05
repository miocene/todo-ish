import { reactive } from "vue";
import { apiFetch } from "./api.js";
import { APP_DATA_RESOURCES, validateAppDataResource } from "../../backend/api/src/app-data-validation.mjs";
import { createResourceSync } from "./resource-sync.js";

const RESOURCES = APP_DATA_RESOURCES;

const LEGACY_STORAGE_KEYS = Object.freeze({
  "work-tasks": "done-ish.work-tasks.v1",
  "work-statuses": "done-ish.work-statuses.v1",
  colors: "done-ish.colors.v1",
  chores: "done-ish.page-tasks.v1.chores",
  todos: "done-ish.page-tasks.v1.todos",
  shopping: "done-ish.page-tasks.v1.shopping",
  printing: "done-ish.page-tasks.v1.printing",
  "cross-stitch": "done-ish.page-tasks.v1.crossStitch",
  "filament-inventory": "done-ish.filament-inventory.v1",
  "floss-inventory": "done-ish.floss-inventory.v1",
});

const emptyData = Object.freeze({
  "work-tasks": [],
  "work-statuses": {},
  colors: {},
  chores: { tasks: [], occurrenceOrder: [] },
  todos: { lists: [] },
  shopping: { tasks: [] },
  printing: { projects: [] },
  "cross-stitch": { projects: [] },
  "filament-inventory": {},
  "floss-inventory": {},
});
let demoData = {};
export async function initializeDemoData() {
  if (import.meta.env.DEV && import.meta.env.VITE_DEMO_DATA === "true") {
    demoData = (await import("../dev/demo-data.js")).demoData;
  }
}
export function initialAppData(resource) {
  return clone(demoData[resource] ?? emptyData[resource]);
}

const cache = new Map();
const initializedResources = new Set();
const clone = (value) => JSON.parse(JSON.stringify(value));
const MOCK_COLORS_STORAGE_KEY = "done-ish.mock-colors.v1";
const COLOR_COLLECTIONS = Object.freeze({ todos: "lists", printing: "projects", "cross-stitch": "projects" });
let hydrated = false;
let mockColors = false;

function readMockColors() {
  try {
    const value = JSON.parse(localStorage.getItem(MOCK_COLORS_STORAGE_KEY));
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function saveMockColors(resource, value) {
  const colors = resource === "colors" ? clone(value) : clone(cache.get("colors") ?? {});
  for (const item of value[COLOR_COLLECTIONS[resource]] ?? []) {
    colors[`${resource}:${item.id}`] = item.color;
  }
  cache.set("colors", colors);
  try {
    localStorage.setItem(MOCK_COLORS_STORAGE_KEY, JSON.stringify(colors));
  } catch {
    // Keep the development mock in memory when browser storage is unavailable.
  }
}

function withMockColors(resource, value) {
  if (!mockColors || !value || !COLOR_COLLECTIONS[resource]) return value;
  const colors = cache.get("colors") ?? {};
  for (const item of value[COLOR_COLLECTIONS[resource]] ?? []) {
    if (colors[`${resource}:${item.id}`]) item.color = colors[`${resource}:${item.id}`];
  }
  return value;
}

function remoteValue(state, resource) {
  const values = {
    "work-tasks": state.workTasks,
    "work-statuses": state.workStatuses,
    colors: state.colors,
    chores: state.pages?.chores,
    todos: state.pages?.todos,
    shopping: state.pages?.shopping,
    printing: state.pages?.printing,
    "cross-stitch": state.pages?.crossStitch,
    "filament-inventory": state.inventories?.filament,
    "floss-inventory": state.inventories?.floss,
  };
  return values[resource];
}

function legacyValue(resource) {
  try {
    const value = localStorage.getItem(LEGACY_STORAGE_KEYS[resource]);
    return value === null ? undefined : JSON.parse(value);
  } catch {
    return undefined;
  }
}

function clearLegacyValue(resource) {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEYS[resource]);
  } catch {
    // The database remains authoritative when browser storage is unavailable.
  }
}

const PENDING_PREFIX = "done-ish.pending-write.v1:";
export const syncState = reactive({ state: "saved", message: "", pending: 0, durable: true });

async function fetchRemoteState() {
  const response = await apiFetch("/data", { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw Object.assign(new Error(`Could not load saved data (${response.status}).`), { status: response.status });
  }
  return response.json();
}

const sync = createResourceSync({
  delay: 250,
  storage: {
    load() {
      const entries = [];
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (!key?.startsWith(PENDING_PREFIX)) continue;
        const entry = JSON.parse(localStorage.getItem(key));
        if (entry && typeof entry.id === "string" && RESOURCES.includes(entry.resource) && entry.value !== undefined)
          entries.push(entry);
      }
      return entries;
    },
    save: (entry) => localStorage.setItem(`${PENDING_PREFIX}${entry.id}`, JSON.stringify(entry)),
    remove: (id) => localStorage.removeItem(`${PENDING_PREFIX}${id}`),
  },
  normalize(resource, value) {
    const normalized = validateAppDataResource(resource, value);
    // The older development API discards these mock-only fields. Exclude them from revision comparisons.
    if (mockColors && COLOR_COLLECTIONS[resource]) {
      for (const item of normalized[COLOR_COLLECTIONS[resource]]) delete item.color;
    }
    return normalized;
  },
  remoteValue,
  readRemote: fetchRemoteState,
  async send(resource, value, revision) {
    const response = await apiFetch(`/data/${resource}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": `"${revision}"` },
      body: JSON.stringify(value),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok)
      throw Object.assign(new Error(result.error || "Changes could not be saved."), { status: response.status });
    if (!Number.isInteger(result.revision)) throw new Error("The save response did not include a revision.");
    return result;
  },
  onChange: (state) => Object.assign(syncState, state),
  onSaved(resource) {
    initializedResources.add(resource);
    clearLegacyValue(resource);
  },
});

function queueWrite(resource, value) {
  cache.set(resource, clone(value));
  if (mockColors && (resource === "colors" || COLOR_COLLECTIONS[resource])) {
    saveMockColors(resource, value);
    if (resource === "colors") return;
  }
  sync.write(resource, value);
}

export const retryPendingWrites = () => sync.retry();
export const discardPendingWrites = () => sync.discard();
export function downloadPendingWrites() {
  const url = URL.createObjectURL(new Blob([JSON.stringify(sync.pending(), null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "done-ish-local-edits.json";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function initializeAppData() {
  const state = await fetchRemoteState();
  if (!state || typeof state !== "object") throw new Error("App data response is invalid");

  mockColors = Boolean(import.meta.env.DEV && !Object.hasOwn(state.revisions ?? {}, "colors"));
  if (mockColors) cache.set("colors", readMockColors());

  for (const resource of state.initializedResources ?? []) {
    if (!RESOURCES.includes(resource)) continue;
    if (mockColors && resource === "colors") continue;
    const value = remoteValue(state, resource);
    if (value === undefined) throw new Error(`App data response is missing ${resource}`);
    initializedResources.add(resource);
    cache.set(resource, value);
    clearLegacyValue(resource);
  }
  const resources = RESOURCES.filter((resource) => !mockColors || resource !== "colors");
  sync.hydrate(state, resources);
  for (const resource of resources) {
    const pending = sync.value(resource);
    if (pending !== undefined) cache.set(resource, pending);
  }
  hydrated = true;
}

/**
 * @template {keyof import("../../backend/api/src/app-data-contract.mjs").ResourceValues} K
 * @param {K} resource
 * @returns {import("../../backend/api/src/app-data-contract.mjs").ResourceValues[K] | undefined}
 */
export function readAppData(resource) {
  if (!RESOURCES.includes(resource)) throw new Error(`Unknown app-data resource: ${resource}`);
  if (cache.has(resource)) return withMockColors(resource, clone(cache.get(resource)));
  const savedValue = legacyValue(resource);
  return savedValue === undefined ? undefined : withMockColors(resource, clone(savedValue));
}

export function initializeAppDataResource(resource, value, { migrate = false } = {}) {
  if (cache.has(resource) && !migrate) return readAppData(resource);
  cache.set(resource, clone(value));
  if (mockColors && migrate && COLOR_COLLECTIONS[resource]) {
    saveMockColors(resource, value);
    return clone(value);
  }
  if (hydrated && (migrate || !initializedResources.has(resource))) queueWrite(resource, value);
  return clone(value);
}

export function writeAppData(resource, value) {
  if (!RESOURCES.includes(resource)) throw new Error(`Unknown app-data resource: ${resource}`);
  queueWrite(resource, value);
  return true;
}

export function cacheAppData(resource, value) {
  if (!RESOURCES.includes(resource)) throw new Error(`Unknown app-data resource: ${resource}`);
  cache.set(resource, clone(value));
}
