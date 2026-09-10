import {
  HISTORY_RESOURCES,
  historyDelta,
  joinHistory,
  serializeWrite,
  splitHistory,
} from "../../backend/api/src/history-transport.mjs";
import { setStateResource } from "../../backend/api/src/app-data-contract.mjs";
import { createPendingStorage } from "./pending-storage.js";
import { reactive } from "vue";
import { apiFetch, setApiAccount } from "./api.js";
import { APP_DATA_RESOURCES, validateAppDataResource } from "../../backend/api/src/app-data-validation.mjs";
import {
  NAVIGATION_IDS,
  RESOURCE_METADATA,
  emptyResource,
  resourceFromState as remoteValue,
} from "../../backend/api/src/app-data-contract.mjs";
import { createResourceSync } from "./resource-sync.js";
import { mergeSharedData } from "./shared-data-merge.js";

const RESOURCES = APP_DATA_RESOURCES;

const LEGACY_STORAGE_KEYS = Object.fromEntries(
  Object.entries(RESOURCE_METADATA).map(([resource, meta]) => [resource, meta.legacyKey]),
);
let demoData = {};
export async function initializeDemoData() {
  if (import.meta.env.DEV && import.meta.env.VITE_DEMO_DATA === "true") {
    demoData = (await import("../dev/demo-data.js")).demoData;
  }
}
export function initialAppData(resource) {
  return clone(demoData[resource] ?? emptyResource(resource));
}

const cache = new Map();
const initializedResources = new Set();
const clone = (value) => JSON.parse(JSON.stringify(value));
const MOCK_COLORS_STORAGE_KEY = "done-ish.mock-colors.v1";
const COLOR_COLLECTIONS = Object.freeze({ todos: "lists", printing: "projects", "cross-stitch": "projects" });
let historyTransport = false;
let revisionTransport = false;
let refreshNow;
export const retryAppDataRefresh = () => refreshNow?.();
let hydrated = false;
let mockColors = false;
let accountId;
let legacyOwner = false;
const subscribers = new Map();

export function subscribeAppData(resource, callback) {
  if (!subscribers.has(resource)) subscribers.set(resource, new Set());
  subscribers.get(resource).add(callback);
  return () => subscribers.get(resource).delete(callback);
}

function receiveAppData(resource, value) {
  value = projectPendingStock(resource, value);
  cache.set(resource, clone(value));
  for (const callback of subscribers.get(resource) ?? []) callback(clone(value));
}

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

function legacyValue(resource) {
  if (!legacyOwner || !LEGACY_STORAGE_KEYS[resource]) return undefined;
  try {
    const value = localStorage.getItem(LEGACY_STORAGE_KEYS[resource]);
    if (value === null) return undefined;
    const parsed = JSON.parse(value);
    return resource === "preferences" ? { hiddenNavigation: parsed } : parsed;
  } catch {
    return undefined;
  }
}

function clearLegacyValue(resource) {
  if (!legacyOwner || !LEGACY_STORAGE_KEYS[resource]) return;
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEYS[resource]);
  } catch {
    // The database remains authoritative when browser storage is unavailable.
  }
}

const PENDING_PREFIX = "done-ish.pending-write.v1:";
const pendingPrefix = () => `done-ish.pending-write.v2:${accountId}:`;
export const syncState = reactive({
  state: "saved",
  message: "",
  pending: 0,
  durable: true,
  corrupt: [],
  refreshMessage: "",
});

const occurrenceKey = (item) => `${item.id}:${item.nextDue}`;

async function fetchJson(path) {
  const response = await apiFetch(path, { headers: { accept: "application/json" } });
  if (!response.ok)
    throw Object.assign(new Error(`Could not load saved data (${response.status}).`), { status: response.status });
  const state = await response.json();
  if (state.userId !== accountId)
    throw Object.assign(new Error("Your account changed. Reload before saving."), { status: 401 });
  return state;
}

async function fetchRemoteState(resources = RESOURCES) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const state = await fetchJson(`/data?history=omit&resources=${resources.join(",")}`);
    historyTransport = state.historyTransport === 1;
    revisionTransport = state.revisionTransport === 1;
    if (!historyTransport) return state;
    let changed = false;
    for (const resource of resources.filter((resource) => HISTORY_RESOURCES.includes(resource))) {
      const history = [];
      let offset = 0;
      do {
        const page = await fetchJson(`/data/history/${resource}?offset=${offset}`);
        if (page.revision !== state.revisions[resource]) {
          changed = true;
          break;
        }
        history.push(...page.items);
        offset = page.nextOffset;
      } while (offset !== null);
      if (changed) break;
      setStateResource(
        state,
        resource,
        joinHistory(resource, splitHistory(resource, remoteValue(state, resource)).active, history),
      );
    }
    if (!changed) return state;
  }
  throw new Error("Saved data changed while loading history. Please retry.");
}

const sync = createResourceSync({
  delay: 250,
  storage: createPendingStorage({
    storage: () => localStorage,
    prefix: pendingPrefix,
    legacyPrefix: () => (legacyOwner ? PENDING_PREFIX : null),
    resources: RESOURCES,
    onCorrupt: (records) => {
      syncState.corrupt = records;
    },
  }),
  normalize(resource, value) {
    const normalized = validateAppDataResource(resource, value);
    // The older development API discards these mock-only fields. Exclude them from revision comparisons.
    if (mockColors && COLOR_COLLECTIONS[resource]) {
      for (const item of normalized[COLOR_COLLECTIONS[resource]]) delete item.color;
    }
    if (resource === "chores" && normalized.history) {
      // Labels are derived from archived definitions; compare occurrence identity and completion only.
      normalized.history = normalized.history
        .map(({ id, nextDue, completedAt }) => ({ id, nextDue, completedAt }))
        .sort((a, b) => occurrenceKey(a).localeCompare(occurrenceKey(b)));
    }
    if (["chores", "todos", "shopping", "printing", "cross-stitch"].includes(resource) && normalized.history) {
      if (normalized.history.length) normalized.history.sort((a, b) => a.id.localeCompare(b.id));
      else delete normalized.history; // Reads omit empty history; compare equivalent snapshots.
    }
    return normalized;
  },
  remoteValue,
  readRemote: fetchRemoteState,
  async send(resource, value, revision) {
    const submitted =
      resource === "chores" && value.history !== undefined
        ? { ...value, replaceHistory: true }
        : resource === "shopping"
          ? { ...value, tasks: value.tasks.filter((task) => !task.source || task.completedAt) }
          : resource === "todos" && value.history !== undefined
            ? { ...value, replaceHistory: true }
            : value;
    const patch = historyTransport && HISTORY_RESOURCES.includes(resource);
    const payload = patch
      ? historyDelta(resource, sync.savedValue(resource) ?? emptyResource(resource), submitted)
      : submitted;
    const body = serializeWrite(payload);
    const response = await apiFetch(`/data/${resource}`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "if-match": `"${revision}"`,
        ...(resource === "shopping" && { "x-shopping-stock": "atomic-v1" }),
        ...(patch && { "x-history-mode": "patch-v1" }),
      },
      body,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok)
      throw Object.assign(new Error(result.error || "Changes could not be saved."), { status: response.status });
    if (!Number.isInteger(result.revision)) throw new Error("The save response did not include a revision.");
    if (resource === "shopping") {
      const state = await fetchRemoteState();
      result.stockState = state;
    }
    return result;
  },
  onChange: (state) => Object.assign(syncState, state),
  onUpdate: receiveAppData,
  // Keep the editor and its revision together until the user finishes a field/modal.
  canRefresh: () =>
    !document.querySelector('dialog[open], main textarea:focus, main input:not([type="checkbox"]):focus'),
  merge: mergeSharedData,
  onSaved(resource, _snapshot, result) {
    if (result?.stockState) sync.refresh(result.stockState, ["filament-inventory", "floss-inventory"]);
    initializedResources.add(resource);
    clearLegacyValue(resource);
    if (resource === "preferences" && legacyOwner) {
      try {
        localStorage.removeItem("done-ish.hidden-navigation.v1");
      } catch {
        /* The saved account preferences are authoritative. */
      }
    }
  },
});

function projectPendingStock(resource, value) {
  if (!["filament-inventory", "floss-inventory"].includes(resource)) return value;
  const pending = sync.value("shopping");
  if (!pending) return value;
  const purchases = (data) =>
    new Map(
      [...(data?.tasks ?? []), ...(data?.history ?? [])]
        .filter((item) => item.source && item.completedAt)
        .map((item) => [item.id, item]),
    );
  const before = purchases(sync.savedValue("shopping"));
  const after = purchases(pending);
  const inventory = { ...value };
  const apply = (item, direction) => {
    if ((item.source === "filament-shortage" ? "filament-inventory" : "floss-inventory") !== resource) return;
    const id = item.filamentId ?? item.flossId;
    inventory[id] = Math.max(0, (inventory[id] ?? 0) + direction * item.quantity);
  };
  for (const item of before.values()) if (!after.has(item.id)) apply(item, -1);
  for (const item of after.values()) if (!before.has(item.id)) apply(item, 1);
  return inventory;
}

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
  const url = URL.createObjectURL(
    new Blob([JSON.stringify([...sync.pending(), ...syncState.corrupt], null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "done-ish-local-edits.json";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function initializeAppData(user) {
  if (!user?.id) throw new Error("The session did not include an account ID.");
  accountId = user.id;
  setApiAccount(accountId);
  const state = await fetchRemoteState();
  if (!state || typeof state !== "object") throw new Error("App data response is invalid");
  legacyOwner = state.legacyOwner === true;

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
  for (const resource of ["filament-inventory", "floss-inventory"]) {
    if (!sync.value(resource)) cache.set(resource, projectPendingStock(resource, remoteValue(state, resource) ?? {}));
  }
  hydrated = true;
  if (legacyOwner && !initializedResources.has("preferences") && !sync.value("preferences")) {
    try {
      const hiddenNavigation = JSON.parse(localStorage.getItem("done-ish.hidden-navigation.v1"));
      if (Array.isArray(hiddenNavigation))
        writeAppData("preferences", { hiddenNavigation: hiddenNavigation.filter((id) => NAVIGATION_IDS.includes(id)) });
    } catch {
      // Unavailable legacy preferences leave the account defaults intact.
    }
  }
}

export function startAppDataRefresh() {
  let busy = false;
  let stopped = false;
  let failures = 0;
  const refresh = async () => {
    if (busy || stopped || document.visibilityState === "hidden") return;
    busy = true;
    try {
      let resources = RESOURCES.filter((resource) => !mockColors || resource !== "colors");
      if (revisionTransport) {
        const state = await fetchJson("/data/revisions");
        resources = resources.filter((resource) => state.revisions[resource] !== sync.revision(resource));
      }
      if (resources.length) {
        const state = await fetchRemoteState(resources);
        if (!stopped) sync.refresh(state, resources);
      }
      failures = 0;
      syncState.refreshMessage = "";
    } catch (error) {
      failures++;
      if (error.status === 401) Object.assign(syncState, { state: "auth", message: error.message });
      else if (failures >= 3)
        syncState.refreshMessage = "Saved data could not be refreshed. Other users’ changes may be missing.";
    } finally {
      busy = false;
    }
  };
  refreshNow = refresh;
  const timer = window.setInterval(refresh, 5000);
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", refresh);
  return () => {
    stopped = true;
    if (refreshNow === refresh) refreshNow = undefined;
    window.clearInterval(timer);
    window.removeEventListener("focus", refresh);
    document.removeEventListener("visibilitychange", refresh);
  };
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
