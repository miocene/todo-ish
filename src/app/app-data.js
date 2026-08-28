import { apiFetch } from "./api.js";

const RESOURCES = Object.freeze([
  "work-tasks",
  "work-statuses",
  "chores",
  "todos",
  "shopping",
  "printing",
  "cross-stitch",
  "filament-inventory",
  "floss-inventory",
]);

const LEGACY_STORAGE_KEYS = Object.freeze({
  "work-tasks": "done-ish.work-tasks.v1",
  "work-statuses": "done-ish.work-statuses.v1",
  chores: "done-ish.page-tasks.v1.chores",
  todos: "done-ish.page-tasks.v1.todos",
  shopping: "done-ish.page-tasks.v1.shopping",
  printing: "done-ish.page-tasks.v1.printing",
  "cross-stitch": "done-ish.page-tasks.v1.crossStitch",
  "filament-inventory": "done-ish.filament-inventory.v1",
  "floss-inventory": "done-ish.floss-inventory.v1",
});

const cache = new Map();
const initializedResources = new Set();
const pendingWrites = new Map();
const revisions = Object.fromEntries(RESOURCES.map((resource) => [resource, 0]));
const writers = new Map();
const clone = (value) => JSON.parse(JSON.stringify(value));
let hydrated = false;

function remoteValue(state, resource) {
  const values = {
    "work-tasks": state.workTasks,
    "work-statuses": state.workStatuses,
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

function announceSyncError(resource, error) {
  window.dispatchEvent(
    new CustomEvent("done-ish:sync-error", {
      detail: {
        resource,
        message:
          error.name === "AppDataConflictError"
            ? "This data changed in another browser. Reload before editing it again."
            : "Changes could not be saved to the home server. The app will retry while this page stays open.",
      },
    }),
  );
}

async function writeResource(resource) {
  let retryDelay = 1_000;
  while (pendingWrites.has(resource)) {
    const value = pendingWrites.get(resource);
    pendingWrites.delete(resource);
    try {
      const response = await apiFetch(`/data/${resource}`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "if-match": `"${revisions[resource]}"`,
        },
        body: JSON.stringify(value),
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 409) {
        const error = new Error(result.error || "App data revision conflict");
        error.name = "AppDataConflictError";
        throw error;
      }
      if (!response.ok) throw new Error(result.error || `App data request failed with status ${response.status}`);
      revisions[resource] = result.revision;
      initializedResources.add(resource);
      clearLegacyValue(resource);
      retryDelay = 1_000;
    } catch (error) {
      announceSyncError(resource, error);
      if (error.name === "AppDataConflictError") return;
      if (!pendingWrites.has(resource)) pendingWrites.set(resource, value);
      await new Promise((resolve) => window.setTimeout(resolve, retryDelay));
      retryDelay = Math.min(retryDelay * 2, 30_000);
    }
  }
}

function queueWrite(resource, value) {
  cache.set(resource, clone(value));
  pendingWrites.set(resource, clone(value));
  if (!writers.has(resource)) {
    const writer = writeResource(resource).finally(() => {
      writers.delete(resource);
      if (pendingWrites.has(resource)) queueWrite(resource, pendingWrites.get(resource));
    });
    writers.set(resource, writer);
  }
}

export async function initializeAppData() {
  const response = await apiFetch("/data", { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`App data request failed with status ${response.status}`);
  const state = await response.json();
  if (!state || typeof state !== "object") throw new Error("App data response is invalid");

  for (const resource of RESOURCES) revisions[resource] = state.revisions?.[resource] ?? 0;
  for (const resource of state.initializedResources ?? []) {
    if (!RESOURCES.includes(resource)) continue;
    const value = remoteValue(state, resource);
    if (value === undefined) throw new Error(`App data response is missing ${resource}`);
    initializedResources.add(resource);
    cache.set(resource, value);
    clearLegacyValue(resource);
  }
  hydrated = true;
}

export function readAppData(resource) {
  if (!RESOURCES.includes(resource)) throw new Error(`Unknown app-data resource: ${resource}`);
  if (cache.has(resource)) return clone(cache.get(resource));
  const savedValue = legacyValue(resource);
  return savedValue === undefined ? undefined : clone(savedValue);
}

export function initializeAppDataResource(resource, value) {
  if (cache.has(resource)) return clone(cache.get(resource));
  cache.set(resource, clone(value));
  if (hydrated && !initializedResources.has(resource)) queueWrite(resource, value);
  return clone(value);
}

export function writeAppData(resource, value) {
  if (!RESOURCES.includes(resource)) throw new Error(`Unknown app-data resource: ${resource}`);
  queueWrite(resource, value);
  return true;
}
