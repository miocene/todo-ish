/**
 * Shared browser/API contracts. This module has no Node or browser dependencies.
 * `Task` is the UI model; the work API retains `checkedAt` for existing clients.
 * Runtime validation remains in app-data-validation.mjs.
 *
 * @typedef {{ id: string, title: string, completed: boolean, completedAt?: string }} Task
 * @typedef {Task & { date: string | null, archived?: boolean }} WorkTask
 * @typedef {{ id: string, title: string, date: string | null, checkedAt?: string, archived?: boolean }} WorkTaskPayload
 * @typedef {{ frequency: "day" | "week" | "month", interval: number, startDate: string, weekdays: number[], monthDays: number[] }} ChoreSchedule
 * @typedef {Task & { details: string, nextDue: string, schedule?: ChoreSchedule | null }} Chore
 * @typedef {{ id: string, title: string, color?: number, tasks: Task[] }} TodoList
 * @typedef {{ id: string, catalogId: string, label: string, weightGrams: number | "" }} FilamentUsage
 * @typedef {Task & { filaments: FilamentUsage[] }} PrintingTask
 * @typedef {Task & { flossId: string, requiredSkeins: number, crosses: number, crossesDone: number }} StitchTask
 * @typedef {Task & { productLink?: string, source?: string, filamentId?: string, flossId?: string, quantity?: number }} ShoppingTask
 */

/** @template T
 * @typedef {{ id: string, title: string, color: number, description: string, tasks: T[] }} Project
 */

/**
 * @typedef {Object} ResourceValues
 * @property {WorkTaskPayload[]} work-tasks
 * @property {Record<string, string>} work-statuses
 * @property {Record<string, number>} colors
 * @property {{ tasks: Chore[], occurrenceOrder: string[], history?: Chore[] }} chores
 * @property {{ lists: TodoList[], history?: Task[], replaceHistory?: boolean }} todos
 * @property {{ tasks: ShoppingTask[], history?: ShoppingTask[] }} shopping
 * @property {{ projects: Project<PrintingTask>[], history?: (Task & { context?: string })[] }} printing
 * @property {{ projects: (Project<StitchTask> & { totalCrosses?: number })[], history?: (Task & { context?: string })[] }} cross-stitch
 * @property {Record<string, number>} filament-inventory
 * @property {Record<string, number>} floss-inventory
 * @property {{ hiddenNavigation: string[] }} preferences
 */

export const APP_DATA_RESOURCES = Object.freeze([
  "work-tasks",
  "work-statuses",
  "colors",
  "chores",
  "todos",
  "shopping",
  "printing",
  "cross-stitch",
  "filament-inventory",
  "floss-inventory",
  "preferences",
]);

// Wire names and browser migration keys live here; callers never infer them from URLs.
export const RESOURCE_METADATA = Object.freeze({
  "work-tasks": { path: ["workTasks"], empty: [], legacyKey: "done-ish.work-tasks.v1" },
  "work-statuses": { path: ["workStatuses"], empty: {}, legacyKey: "done-ish.work-statuses.v1" },
  colors: { path: ["colors"], empty: {}, legacyKey: "done-ish.colors.v1" },
  chores: {
    path: ["pages", "chores"],
    empty: { tasks: [], occurrenceOrder: [] },
    legacyKey: "done-ish.page-tasks.v1.chores",
  },
  todos: { path: ["pages", "todos"], empty: { lists: [] }, legacyKey: "done-ish.page-tasks.v1.todos" },
  shopping: { path: ["pages", "shopping"], empty: { tasks: [] }, legacyKey: "done-ish.page-tasks.v1.shopping" },
  printing: { path: ["pages", "printing"], empty: { projects: [] }, legacyKey: "done-ish.page-tasks.v1.printing" },
  "cross-stitch": {
    path: ["pages", "crossStitch"],
    empty: { projects: [] },
    legacyKey: "done-ish.page-tasks.v1.crossStitch",
  },
  "filament-inventory": { path: ["inventories", "filament"], empty: {}, legacyKey: "done-ish.filament-inventory.v1" },
  "floss-inventory": { path: ["inventories", "floss"], empty: {}, legacyKey: "done-ish.floss-inventory.v1" },
  preferences: { path: ["preferences"], empty: { hiddenNavigation: [] }, legacyKey: "done-ish.hidden-navigation.v1" },
});

export function emptyResource(resource) {
  return JSON.parse(JSON.stringify(RESOURCE_METADATA[resource].empty));
}

export function resourceFromState(state, resource) {
  return RESOURCE_METADATA[resource].path.reduce((value, key) => value?.[key], state);
}

export function setStateResource(state, resource, value) {
  const path = RESOURCE_METADATA[resource].path;
  let target = state;
  for (const key of path.slice(0, -1)) target = target[key] ??= {};
  target[path.at(-1)] = value;
}

export function pageResource(page) {
  return APP_DATA_RESOURCES.find(
    (resource) => RESOURCE_METADATA[resource].path[0] === "pages" && RESOURCE_METADATA[resource].path[1] === page,
  );
}

export const SHARED_APP_DATA_RESOURCES = Object.freeze(["chores", "shopping", "filament-inventory", "floss-inventory"]);
export const NAVIGATION_IDS = Object.freeze([
  "work",
  "chores",
  "todos",
  "shopping",
  "printing",
  "cross-stitch",
  "catalog",
]);

/** @param {string | Date | null | undefined} completedAt */
export function completionState(completedAt) {
  const value = completedAt instanceof Date ? completedAt.toISOString() : completedAt;
  return { completed: Boolean(value), ...(value && { completedAt: value }) };
}

/** @param {Task} task @param {boolean} completed @param {string} [completedAt] */
export function setTaskCompletion(task, completed, completedAt = new Date().toISOString()) {
  task.completed = completed;
  task.completedAt = completed ? completedAt : undefined;
}

/** @param {WorkTaskPayload} task @returns {WorkTask} */
export function workTaskFromApi(task) {
  return {
    id: task.id,
    title: task.title,
    date: task.date,
    ...(task.archived && { archived: true }),
    ...completionState(task.checkedAt),
  };
}

/** @param {WorkTask} task @returns {WorkTaskPayload} */
export function workTaskToApi(task) {
  return {
    id: task.id,
    title: task.title,
    date: task.date,
    ...(task.archived && { archived: true }),
    ...(task.completed && task.completedAt && { checkedAt: task.completedAt }),
  };
}

export const APP_DATA_LIMITS = Object.freeze({
  bodyBytes: 8 * 1024 * 1024,
  historyPage: 500,
  historyChanges: 2000,
  tasks: 2000,
  lists: 100,
  projects: 500,
  filaments: 100,
  title: 500,
  quantity: 10000000,
  skeins: 10000,
});
