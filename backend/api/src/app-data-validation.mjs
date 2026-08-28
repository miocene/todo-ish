const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HEX_COLOR = /^#[\dA-F]{6}$/i;
const RESOURCE_LIMIT = 2_000;
const TEXT_LIMIT = 500;
const DESCRIPTION_LIMIT = 5_000;
const URL_LIMIT = 2_000;

export const APP_DATA_RESOURCES = Object.freeze([
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

const RESOURCE_SET = new Set(APP_DATA_RESOURCES);
const WORK_STATUS_SET = new Set(["work", "pto", "sick-leave", "holiday", "business-trip", "weekend", "conference"]);

export class AppDataValidationError extends Error {}

function fail(path, message) {
  throw new AppDataValidationError(`${path} ${message}`);
}

function object(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "must be an object");
  return value;
}

function array(value, path, limit = RESOURCE_LIMIT) {
  if (!Array.isArray(value)) fail(path, "must be an array");
  if (value.length > limit) fail(path, `must contain at most ${limit} entries`);
  return value;
}

function text(value, path, { allowBlank = false, maximum = TEXT_LIMIT } = {}) {
  if (typeof value !== "string") fail(path, "must be a string");
  const normalized = value.trim();
  if (!allowBlank && !normalized) fail(path, "must not be blank");
  if (normalized.length > maximum) fail(path, `must be at most ${maximum} characters`);
  return normalized;
}

function optionalText(value, path, options) {
  return value === undefined || value === null || value === "" ? null : text(value, path, options);
}

function id(value, path) {
  return text(value, path, { maximum: 200 });
}

function integer(value, path, { maximum = 10_000_000 } = {}) {
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    fail(path, `must be an integer between 0 and ${maximum}`);
  }
  return value;
}

function number(value, path, { maximum = 10_000_000 } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > maximum) {
    fail(path, `must be a number between 0 and ${maximum}`);
  }
  return Math.round(value * 100) / 100;
}

function date(value, path, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !ISO_DATE.test(value)) fail(path, "must be an ISO date");
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) fail(path, "must be a valid date");
  return value;
}

function timestamp(value, path) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) fail(path, "must be an ISO timestamp");
  return new Date(value).toISOString();
}

function color(value, path) {
  const normalized = text(value, path);
  if (!HEX_COLOR.test(normalized)) fail(path, "must be a six-digit hex color");
  return normalized;
}

function completedAt(item, path, field = "completedAt") {
  const value = timestamp(item[field], `${path}.${field}`);
  if (item.completed === true && !value) fail(`${path}.${field}`, "is required when the item is completed");
  return value;
}

function uniqueIds(items, path) {
  const ids = new Set();
  for (const [index, item] of items.entries()) {
    if (ids.has(item.id)) fail(`${path}[${index}].id`, "must be unique");
    ids.add(item.id);
  }
  return items;
}

function task(value, path) {
  const source = object(value, path);
  return {
    id: id(source.id, `${path}.id`),
    title: text(source.title, `${path}.title`),
    completedAt: completedAt(source, path),
  };
}

function workTasks(value) {
  return uniqueIds(
    array(value, "work-tasks").map((entry, index) => {
      const source = object(entry, `work-tasks[${index}]`);
      return {
        id: id(source.id, `work-tasks[${index}].id`),
        title: text(source.title, `work-tasks[${index}].title`),
        date: date(source.date, `work-tasks[${index}].date`, { nullable: true }),
        checkedAt: timestamp(source.checkedAt, `work-tasks[${index}].checkedAt`),
      };
    }),
    "work-tasks",
  );
}

function workStatuses(value) {
  const statuses = object(value, "work-statuses");
  if (Object.keys(statuses).length > RESOURCE_LIMIT)
    fail("work-statuses", `must contain at most ${RESOURCE_LIMIT} entries`);
  return Object.fromEntries(
    Object.entries(statuses).map(([workDate, status]) => {
      date(workDate, `work-statuses.${workDate}`);
      if (!WORK_STATUS_SET.has(status)) fail(`work-statuses.${workDate}`, "has an unknown status");
      return [workDate, status];
    }),
  );
}

function chores(value) {
  const source = object(value, "chores");
  const tasks = uniqueIds(
    array(source.tasks, "chores.tasks").map((entry, index) => {
      const item = task(entry, `chores.tasks[${index}]`);
      return {
        ...item,
        details: text(entry.details, `chores.tasks[${index}].details`),
        nextDue: date(entry.nextDue, `chores.tasks[${index}].nextDue`),
      };
    }),
    "chores.tasks",
  );
  const taskIds = new Set(tasks.map((item) => item.id));
  const occurrenceOrder = array(source.occurrenceOrder, "chores.occurrenceOrder").map((entry, index) => {
    const taskId = id(entry, `chores.occurrenceOrder[${index}]`);
    if (!taskIds.has(taskId)) fail(`chores.occurrenceOrder[${index}]`, "must reference a chore");
    return taskId;
  });
  if (new Set(occurrenceOrder).size !== occurrenceOrder.length) fail("chores.occurrenceOrder", "must be unique");
  return { occurrenceOrder, tasks };
}

function todos(value) {
  const source = object(value, "todos");
  const lists = uniqueIds(
    array(source.lists, "todos.lists", 100).map((entry, listIndex) => {
      const list = object(entry, `todos.lists[${listIndex}]`);
      return {
        id: id(list.id, `todos.lists[${listIndex}].id`),
        title: text(list.title, `todos.lists[${listIndex}].title`),
        tasks: uniqueIds(
          array(list.tasks, `todos.lists[${listIndex}].tasks`).map((item, itemIndex) =>
            task(item, `todos.lists[${listIndex}].tasks[${itemIndex}]`),
          ),
          `todos.lists[${listIndex}].tasks`,
        ),
      };
    }),
    "todos.lists",
  );
  const itemIds = lists.flatMap((list) => list.tasks.map((item) => item.id));
  if (new Set(itemIds).size !== itemIds.length) fail("todos", "task IDs must be unique across lists");
  return { lists };
}

function shopping(value) {
  const source = object(value, "shopping");
  const manualTasks = array(source.tasks, "shopping.tasks").filter((entry) => !entry?.source);
  return {
    tasks: uniqueIds(
      manualTasks.map((entry, index) => {
        const item = task(entry, `shopping.tasks[${index}]`);
        return {
          ...item,
          productLink: optionalText(entry.productLink, `shopping.tasks[${index}].productLink`, { maximum: URL_LIMIT }),
        };
      }),
      "shopping.tasks",
    ),
  };
}

function project(value, path) {
  const source = object(value, path);
  return {
    id: id(source.id, `${path}.id`),
    title: text(source.title, `${path}.title`),
    color: color(source.color, `${path}.color`),
    description: text(source.description ?? "", `${path}.description`, {
      allowBlank: true,
      maximum: DESCRIPTION_LIMIT,
    }),
  };
}

function printing(value) {
  const source = object(value, "printing");
  const projects = uniqueIds(
    array(source.projects, "printing.projects", 500).map((entry, projectIndex) => {
      const item = project(entry, `printing.projects[${projectIndex}]`);
      return {
        ...item,
        tasks: uniqueIds(
          array(entry.tasks, `printing.projects[${projectIndex}].tasks`).map((taskEntry, taskIndex) => {
            const taskPath = `printing.projects[${projectIndex}].tasks[${taskIndex}]`;
            const taskItem = task(taskEntry, taskPath);
            return {
              ...taskItem,
              filaments: uniqueIds(
                array(taskEntry.filaments, `${taskPath}.filaments`, 100).map((filamentEntry, filamentIndex) => {
                  const filamentPath = `${taskPath}.filaments[${filamentIndex}]`;
                  const filament = object(filamentEntry, filamentPath);
                  return {
                    id: id(filament.id, `${filamentPath}.id`),
                    catalogId: optionalText(filament.catalogId, `${filamentPath}.catalogId`, { maximum: 200 }),
                    label: optionalText(filament.label, `${filamentPath}.label`),
                    weightGrams:
                      filament.weightGrams === "" || filament.weightGrams === undefined
                        ? null
                        : number(filament.weightGrams, `${filamentPath}.weightGrams`),
                  };
                }),
                `${taskPath}.filaments`,
              ),
            };
          }),
          `printing.projects[${projectIndex}].tasks`,
        ),
      };
    }),
    "printing.projects",
  );
  const taskIds = projects.flatMap((entry) => entry.tasks.map((item) => item.id));
  if (new Set(taskIds).size !== taskIds.length) fail("printing", "item IDs must be unique across projects");
  const usageIds = projects.flatMap((entry) => entry.tasks.flatMap((item) => item.filaments.map((usage) => usage.id)));
  if (new Set(usageIds).size !== usageIds.length) fail("printing", "filament usage IDs must be unique across projects");
  return { projects };
}

function crossStitch(value) {
  const source = object(value, "cross-stitch");
  const projects = uniqueIds(
    array(source.projects, "cross-stitch.projects", 500).map((entry, projectIndex) => {
      const item = project(entry, `cross-stitch.projects[${projectIndex}]`);
      return {
        ...item,
        tasks: uniqueIds(
          array(entry.tasks, `cross-stitch.projects[${projectIndex}].tasks`).map((taskEntry, taskIndex) => {
            const taskPath = `cross-stitch.projects[${projectIndex}].tasks[${taskIndex}]`;
            const sourceTask = object(taskEntry, taskPath);
            const totalCrosses = integer(sourceTask.crosses, `${taskPath}.crosses`);
            const completedCrosses = integer(sourceTask.crossesDone, `${taskPath}.crossesDone`);
            if (completedCrosses > totalCrosses) fail(`${taskPath}.crossesDone`, "must not exceed crosses");
            const isCompleted = totalCrosses > 0 && completedCrosses === totalCrosses;
            const taskCompletedAt = timestamp(sourceTask.completedAt, `${taskPath}.completedAt`);
            if (isCompleted && !taskCompletedAt)
              fail(`${taskPath}.completedAt`, "is required when all crosses are done");
            return {
              id: id(sourceTask.id, `${taskPath}.id`),
              title: text(sourceTask.title, `${taskPath}.title`),
              flossId: optionalText(sourceTask.flossId, `${taskPath}.flossId`, { maximum: 200 }),
              requiredSkeins: integer(sourceTask.requiredSkeins, `${taskPath}.requiredSkeins`, { maximum: 10_000 }),
              crosses: totalCrosses,
              crossesDone: completedCrosses,
              completedAt: isCompleted ? taskCompletedAt : null,
            };
          }),
          `cross-stitch.projects[${projectIndex}].tasks`,
        ),
      };
    }),
    "cross-stitch.projects",
  );
  const taskIds = projects.flatMap((entry) => entry.tasks.map((item) => item.id));
  if (new Set(taskIds).size !== taskIds.length) fail("cross-stitch", "thread IDs must be unique across projects");
  return { projects };
}

function inventory(value, resource) {
  const source = object(value, resource);
  if (Object.keys(source).length > RESOURCE_LIMIT) fail(resource, `must contain at most ${RESOURCE_LIMIT} entries`);
  return Object.fromEntries(
    Object.entries(source)
      .map(([catalogId, count]) => [
        id(catalogId, `${resource}.${catalogId}`),
        integer(count, `${resource}.${catalogId}`),
      ])
      .filter(([, count]) => count > 0),
  );
}

const VALIDATORS = Object.freeze({
  "work-tasks": workTasks,
  "work-statuses": workStatuses,
  chores,
  todos,
  shopping,
  printing,
  "cross-stitch": crossStitch,
  "filament-inventory": (value) => inventory(value, "filament-inventory"),
  "floss-inventory": (value) => inventory(value, "floss-inventory"),
});

export function isAppDataResource(value) {
  return RESOURCE_SET.has(value);
}

export function validateAppDataResource(resource, value) {
  const validate = VALIDATORS[resource];
  if (!validate) throw new AppDataValidationError(`Unknown app-data resource: ${resource}`);
  return validate(value);
}
