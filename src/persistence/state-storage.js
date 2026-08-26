import { createInitialState } from "../data/initial-state.js";
import { normalizeState } from "./migrations.js";

export const STATE_VERSION = 3;
export const STORAGE_KEY = "done-ish-state";
export const LEGACY_STORAGE_KEYS = ["done-ish-v1", "meanwhile-prototype-v4"];
export const CORRUPT_BACKUP_KEY = `${STORAGE_KEY}.corrupt`;

function decode(raw) {
  const value = JSON.parse(raw);
  if (value?.version > STATE_VERSION) throw new Error(`Unsupported Done-ish state version ${value.version}`);
  return {
    state: normalizeState(value?.state ?? value),
    version: Number(value?.version) || 0,
  };
}

export function saveState(state, storage = globalThis.localStorage) {
  const payload = JSON.stringify({ version: STATE_VERSION, state: normalizeState(state) });
  storage.setItem(STORAGE_KEY, payload);
}

export function loadState(storage = globalThis.localStorage) {
  const keys = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS];
  for (const key of keys) {
    const raw = storage.getItem(key);
    if (!raw) continue;
    try {
      const { state, version } = decode(raw);
      if (key !== STORAGE_KEY || version !== STATE_VERSION) saveState(state, storage);
      return state;
    } catch (error) {
      if (!storage.getItem(CORRUPT_BACKUP_KEY)) storage.setItem(CORRUPT_BACKUP_KEY, raw);
      console.error(`Could not load ${key}; the original payload was preserved in ${CORRUPT_BACKUP_KEY}.`, error);
      return createInitialState();
    }
  }
  return createInitialState();
}
