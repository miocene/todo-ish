import { SHARED_APP_DATA_RESOURCES } from "../../backend/api/src/app-data-contract.mjs";
import { validateAppDataResource } from "../../backend/api/src/app-data-validation.mjs";
import { stableJson } from "./resource-sync.js";

const conflict = Symbol("conflict");
const equal = (a, b) => stableJson(a) === stableJson(b);

function merge(base, local, remote, field = "") {
  if (equal(local, remote) || equal(base, remote)) return local;
  if (equal(base, local)) return remote;
  if (field === "completedAt" && !base && local && remote)
    return local < remote ? local : remote;
  if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote)) {
    if (field === "occurrenceOrder") return [...new Set([...local, ...remote])];
    if (field === "hiddenNavigation") {
      return [...new Set([...base, ...local, ...remote])].filter((id) =>
        local.includes(id) === base.includes(id)
          ? remote.includes(id)
          : local.includes(id),
      );
    }
    if (
      ![...base, ...local, ...remote].every(
        (item) => item && typeof item.id === "string",
      )
    )
      return conflict;
    const key = (item) =>
      field === "history" && item.nextDue
        ? `${item.id}:${item.nextDue}`
        : item.id;
    const records = [base, local, remote].map(
      (items) => new Map(items.map((item) => [key(item), item])),
    );
    const result = [];
    for (const id of new Set([
      ...records[1].keys(),
      ...records[2].keys(),
      ...records[0].keys(),
    ])) {
      const item = merge(...records.map((items) => items.get(id)));
      if (item === conflict) return conflict;
      if (item !== undefined) result.push(item);
    }
    return result;
  }
  if (
    base &&
    local &&
    remote &&
    [base, local, remote].every(
      (value) => typeof value === "object" && !Array.isArray(value),
    )
  ) {
    const result = [];
    for (const key of new Set([
      ...Object.keys(base),
      ...Object.keys(local),
      ...Object.keys(remote),
    ])) {
      const value = merge(base[key], local[key], remote[key], key);
      if (value === conflict) return conflict;
      if (value !== undefined) result.push([key, value]);
    }
    return Object.fromEntries(result);
  }
  return conflict;
}

/** Combine independent edits; overlapping edits stay in the existing conflict-recovery flow. */
export function mergeSharedData(resource, base, local, remote) {
  if (
    !SHARED_APP_DATA_RESOURCES.includes(resource) &&
    resource !== "preferences"
  )
    return undefined;
  const values = [base, local, remote].map((value) => {
    const normalized = validateAppDataResource(resource, value);
    if (resource === "chores" || resource === "shopping")
      normalized.history ??= [];
    delete normalized.replaceHistory;
    return normalized;
  });
  const result = merge(...values);
  if (result === conflict) return undefined;
  if (result.tasks) {
    for (const item of [...result.tasks, ...result.history])
      item.completed = Boolean(item.completedAt);
    if (result.occurrenceOrder) {
      const ids = new Set(result.tasks.map((item) => item.id));
      result.occurrenceOrder = [
        ...new Set([...result.occurrenceOrder, ...ids]),
      ].filter((id) => ids.has(id));
    }
  }
  validateAppDataResource(resource, result);
  return result;
}
