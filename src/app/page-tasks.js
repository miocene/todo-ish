import { scheduleFromChore } from "./chore-schedule.js";
import { todayIso } from "./date.js";
import { initialAppData, initializeAppDataResource, readAppData, writeAppData } from "./app-data.js";
import { normalizeCardColor } from "./card-colors.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const clone = structuredClone;

function normalizeInventory(value, fallback) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return clone(fallback);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, count]) => Number.isInteger(count) && count >= 0)
      .map(([catalogId, count]) => [catalogId, count]),
  );
}

function isTask(task) {
  return (
    task &&
    typeof task === "object" &&
    typeof task.id === "string" &&
    typeof task.title === "string" &&
    typeof task.completed === "boolean" &&
    (task.completedAt === undefined || typeof task.completedAt === "string")
  );
}

function isTaskList(value) {
  return Array.isArray(value) && value.every(isTask);
}

function isProjectData(data) {
  return (
    Array.isArray(data.projects) &&
    data.projects.every(
      (project) =>
        project &&
        typeof project.id === "string" &&
        typeof project.title === "string" &&
        typeof project.description === "string" &&
        isTaskList(project.tasks),
    )
  );
}

function normalizePrinting(data) {
  if (!data || typeof data !== "object" || !isProjectData(data)) return undefined;
  return {
    ...data,
    projects: data.projects.map((project) => ({
      ...project,
      color: normalizeCardColor(project.color),
      tasks: project.tasks.map((task) => {
        const { filamentId, filamentLabel, weightGrams, ...taskData } = task;
        const savedFilaments = Array.isArray(task.filaments) ? task.filaments : [];
        const legacyFilaments =
          typeof filamentId === "string" || typeof weightGrams === "number"
            ? [{ catalogId: filamentId, label: filamentLabel, weightGrams }]
            : [];
        const sourceFilaments = savedFilaments.length > 0 ? savedFilaments : legacyFilaments;
        return {
          ...taskData,
          filaments: sourceFilaments.map((filament, filamentIndex) => ({
            id:
              typeof filament.id === "string" && filament.id ? filament.id : `${task.id}-filament-${filamentIndex + 1}`,
            catalogId: typeof filament.catalogId === "string" ? filament.catalogId : "",
            label: typeof filament.label === "string" ? filament.label : "",
            weightGrams:
              typeof filament.weightGrams === "number" && filament.weightGrams >= 0 ? filament.weightGrams : "",
          })),
        };
      }),
    })),
  };
}

function normalizeCrossStitch(data) {
  if (!data || typeof data !== "object" || !isProjectData(data)) return undefined;
  return {
    ...data,
    projects: data.projects.map((project) => ({
      ...project,
      color: normalizeCardColor(project.color),
      totalCrosses: project.tasks.reduce((total, task) => total + (Number(task.crosses) || 0), 0),
      tasks: project.tasks.map((task) => {
        const crosses = Number.isFinite(task.crosses) && task.crosses >= 0 ? Math.floor(task.crosses) : 0;
        const crossesDone =
          Number.isFinite(task.crossesDone) && task.crossesDone >= 0 ? Math.floor(task.crossesDone) : 0;
        return {
          ...task,
          flossId: typeof task.flossId === "string" ? task.flossId : "",
          requiredSkeins:
            Number.isFinite(task.requiredSkeins) && task.requiredSkeins >= 0 ? Math.floor(task.requiredSkeins) : 1,
          crosses,
          crossesDone: Math.min(crossesDone, crosses),
          completed: crosses > 0 && crossesDone >= crosses,
          completedAt: crosses > 0 && crossesDone >= crosses ? task.completedAt : undefined,
        };
      }),
    })),
  };
}

function normalizeChores(data) {
  if (!data || typeof data !== "object" || !isTaskList(data.tasks)) return undefined;
  if (!data.tasks.every((task) => typeof task.details === "string")) return undefined;
  const tasks = data.tasks.map((task) => ({
    ...task,
    nextDue: ISO_DATE.test(task.nextDue) ? task.nextDue : todayIso(),
    schedule: scheduleFromChore(task, todayIso()),
  }));
  const taskIds = new Set(tasks.map((task) => task.id));
  const defaultOrder = [...tasks.filter((task) => !task.completed), ...tasks.filter((task) => task.completed)].map(
    (task) => task.id,
  );
  const savedOrder = Array.isArray(data.occurrenceOrder)
    ? data.occurrenceOrder.filter((taskId) => taskIds.has(taskId))
    : defaultOrder;
  const occurrenceOrder = [...new Set([...savedOrder, ...defaultOrder])];
  return {
    ...data,
    occurrenceOrder,
    tasks,
  };
}

function normalizeShopping(data) {
  return data && typeof data === "object" && isTaskList(data.tasks) ? data : undefined;
}

function normalizeTodos(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.lists)) return undefined;
  return data.lists.every(
    (list) => list && typeof list.id === "string" && typeof list.title === "string" && isTaskList(list.tasks),
  )
    ? { ...data, lists: data.lists.map((list) => ({ ...list, color: normalizeCardColor(list.color) })) }
    : undefined;
}

const PAGE_NORMALIZERS = Object.freeze({
  chores: normalizeChores,
  crossStitch: normalizeCrossStitch,
  printing: normalizePrinting,
  shopping: normalizeShopping,
  todos: normalizeTodos,
});

export function loadPageTasks(page) {
  const resource = page === "crossStitch" ? "cross-stitch" : page;
  const defaultData = initialAppData(resource);
  const normalize = PAGE_NORMALIZERS[page];
  if (!defaultData || !normalize) throw new Error(`Unknown task page: ${page}`);

  const saved = readAppData(resource);
  const normalized = normalize(saved);
  const data = normalized ?? normalize(defaultData);
  const collection = data.projects ? "projects" : data.lists ? "lists" : "";
  const migrate =
    Boolean(normalized && collection) &&
    data[collection].some((item, index) => item.color !== saved[collection][index].color);
  const value = migrate
    ? {
        ...saved,
        [collection]: saved[collection].map((item, index) => ({ ...item, color: data[collection][index].color })),
      }
    : data;
  initializeAppDataResource(resource, value, { migrate });
  // Existing resources keep their cached value; the page still needs normalized fields.
  return data;
}

export function savePageTasks(page, data) {
  for (const item of data.projects ?? data.lists ?? []) item.color = normalizeCardColor(item.color);
  writeAppData(page === "crossStitch" ? "cross-stitch" : page, data);
}

export function loadFilamentInventory() {
  const inventory = normalizeInventory(readAppData("filament-inventory"), initialAppData("filament-inventory"));
  return initializeAppDataResource("filament-inventory", inventory);
}

export function saveFilamentInventory(inventory) {
  writeAppData("filament-inventory", inventory);
}

export function loadFlossInventory() {
  const inventory = normalizeInventory(readAppData("floss-inventory"), initialAppData("floss-inventory"));
  return initializeAppDataResource("floss-inventory", inventory);
}

export function saveFlossInventory(inventory) {
  writeAppData("floss-inventory", inventory);
}
