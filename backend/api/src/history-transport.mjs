import { APP_DATA_LIMITS } from "./app-data-contract.mjs";
import {
  AppDataValidationError,
  validateAppDataResource,
} from "./app-data-validation.mjs";

export const HISTORY_RESOURCES = Object.freeze([
  "work-tasks",
  "chores",
  "todos",
  "shopping",
  "printing",
  "cross-stitch",
]);
export const historyKey = (resource, item) =>
  resource === "chores" ? `${item.id}:${item.nextDue}` : item.id;
export function splitHistory(resource, value) {
  if (resource === "work-tasks")
    return {
      active: value.filter((item) => !item.archived),
      history: value.filter((item) => item.archived),
    };
  const { history = [], ...active } = value;
  delete active.replaceHistory;
  return { active, history };
}
export function joinHistory(resource, active, history) {
  return resource === "work-tasks"
    ? [...active, ...history]
    : { ...active, ...(history.length && { history }) };
}
export function historyDelta(resource, previous, next) {
  const before = new Map(
    splitHistory(resource, previous).history.map((item) => [
      historyKey(resource, item),
      item,
    ]),
  );
  const { active, history } = splitHistory(resource, next);
  const after = new Map(
    history.map((item) => [historyKey(resource, item), item]),
  );
  const completedActive = (value) =>
    resource === "chores"
      ? value.tasks.filter((item) => item.completedAt)
      : resource === "todos"
        ? value.lists.flatMap((list) =>
            list.tasks.filter((item) => item.completedAt),
          )
        : [];
  const removable = new Set([
    ...before.keys(),
    ...completedActive(previous).map((item) => historyKey(resource, item)),
  ]);
  const retained = new Set([
    ...after.keys(),
    ...completedActive(next).map((item) => historyKey(resource, item)),
  ]);
  return {
    value: active,
    history: {
      upsert: history.filter(
        (item) =>
          JSON.stringify(before.get(historyKey(resource, item))) !==
          JSON.stringify(item),
      ),
      remove: [...removable].filter((key) => !retained.has(key)),
    },
  };
}

export function applyHistoryDelta(resource, previous, patch) {
  const history = new Map(
    splitHistory(resource, previous).history.map((item) => [
      historyKey(resource, item),
      item,
    ]),
  );
  for (const key of patch.history.remove) history.delete(key);
  for (const item of patch.history.upsert)
    history.set(historyKey(resource, item), item);
  return joinHistory(resource, patch.value, [...history.values()]);
}
export function validateHistoryDelta(resource, patch) {
  if (
    !HISTORY_RESOURCES.includes(resource) ||
    !patch ||
    typeof patch !== "object" ||
    !patch.history ||
    !Array.isArray(patch.history.upsert) ||
    !Array.isArray(patch.history.remove)
  )
    throw new AppDataValidationError(
      "Expected active data and a history patch.",
    );
  if (
    patch.history.upsert.length + patch.history.remove.length >
    APP_DATA_LIMITS.historyChanges
  )
    throw new AppDataValidationError(
      `Change at most ${APP_DATA_LIMITS.historyChanges} history entries per save. Your draft is retained for export.`,
    );
  if (
    patch.history.remove.some(
      (key) => typeof key !== "string" || !key || key.length > 211,
    )
  )
    throw new AppDataValidationError("Invalid history removal key.");
  const normalized = validateAppDataResource(
    resource,
    joinHistory(resource, patch.value, patch.history.upsert),
  );
  const { active, history } = splitHistory(resource, normalized);
  if (
    history.length !== patch.history.upsert.length ||
    history.some((item) =>
      patch.history.remove.includes(historyKey(resource, item)),
    )
  )
    throw new AppDataValidationError(
      "History changes must have distinct completed entries.",
    );
  return {
    value: active,
    history: { upsert: history, remove: [...new Set(patch.history.remove)] },
  };
}
export function serializeWrite(value) {
  const body = JSON.stringify(value);
  if (new TextEncoder().encode(body).length > APP_DATA_LIMITS.bodyBytes)
    throw new AppDataValidationError(
      "This edit exceeds the 8 MiB save limit. Reduce active items or export the retained draft.",
    );
  return body;
}
