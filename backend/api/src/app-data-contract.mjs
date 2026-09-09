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
 * @typedef {{ id: string, title: string, color?: string, tasks: Task[] }} TodoList
 * @typedef {{ id: string, catalogId: string, label: string, weightGrams: number | "" }} FilamentUsage
 * @typedef {Task & { filaments: FilamentUsage[] }} PrintingTask
 * @typedef {Task & { flossId: string, requiredSkeins: number, crosses: number, crossesDone: number }} StitchTask
 * @typedef {Task & { productLink?: string, source?: string, filamentId?: string, flossId?: string, quantity?: number }} ShoppingTask
 */

/** @template T
 * @typedef {{ id: string, title: string, color: string, description: string, tasks: T[] }} Project
 */

/**
 * @typedef {Object} ResourceValues
 * @property {WorkTaskPayload[]} work-tasks
 * @property {Record<string, string>} work-statuses
 * @property {Record<string, string>} colors
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
