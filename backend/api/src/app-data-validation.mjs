import { CARD_COLOR_COUNT, cardColorNumber } from "./card-colors.mjs";
import {
  APP_DATA_RESOURCES,
  NAVIGATION_IDS,
  APP_DATA_LIMITS,
} from "./app-data-contract.mjs";
export { APP_DATA_RESOURCES };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const RESOURCE_LIMIT = APP_DATA_LIMITS.tasks;
const TEXT_LIMIT = APP_DATA_LIMITS.title;
const DESCRIPTION_LIMIT = 5_000;
const URL_LIMIT = 2_000;

const RESOURCE_SET = new Set(APP_DATA_RESOURCES);
const WORK_STATUS_SET = new Set([
  "work",
  "pto",
  "sick-leave",
  "holiday",
  "business-trip",
  "weekend",
  "conference",
]);

export class AppDataValidationError extends Error {
  name = "AppDataValidationError";
}

function fail(path, message) {
  throw new AppDataValidationError(`${path} ${message}`);
}

function object(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(path, "must be an object");
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
  if (normalized.length > maximum)
    fail(path, `must be at most ${maximum} characters`);
  return normalized;
}

function optionalText(value, path, options) {
  return value === undefined || value === null || value === ""
    ? null
    : text(value, path, options);
}

function productLink(value, path) {
  const link = optionalText(value, path, { maximum: URL_LIMIT });
  if (!link) return link;
  try {
    const url = new URL(link);
    if (url.protocol === "https:" || url.protocol === "http:") return link;
  } catch {
    // Malformed URLs receive the same field error as unsupported schemes.
  }
  fail(path, "must be an absolute HTTP or HTTPS URL");
}

function id(value, path) {
  return text(value, path, { maximum: 200 });
}

function integer(value, path, { maximum = APP_DATA_LIMITS.quantity } = {}) {
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    fail(path, `must be an integer between 0 and ${maximum}`);
  }
  return value;
}

function number(value, path, { maximum = APP_DATA_LIMITS.quantity } = {}) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > maximum
  ) {
    fail(path, `must be a number between 0 and ${maximum}`);
  }
  return Math.round(value * 100) / 100;
}

function date(value, path, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !ISO_DATE.test(value))
    fail(path, "must be an ISO date");
  const parsed = new Date(`${value}T12:00:00Z`);
  if (
    Number.isNaN(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    fail(path, "must be a valid date");
  return value;
}

function timestamp(value, path) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)))
    fail(path, "must be an ISO timestamp");
  return new Date(value).toISOString();
}

function color(value, path) {
  const normalized = cardColorNumber(value);
  if (normalized === null)
    fail(path, `must be a color number between 1 and ${CARD_COLOR_COUNT}`);
  return normalized;
}

function completedAt(item, path, field = "completedAt") {
  const value = timestamp(item[field], `${path}.${field}`);
  if (item.completed === true && !value)
    fail(`${path}.${field}`, "is required when the item is completed");
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
  array(
    array(value, "work-tasks", 100_000).filter((item) => !item?.archived),
    "work-tasks",
  );
  return uniqueIds(
    value.map((entry, index) => {
      const source = object(entry, `work-tasks[${index}]`);
      return {
        id: id(source.id, `work-tasks[${index}].id`),
        title: text(source.title, `work-tasks[${index}].title`),
        date: date(source.date, `work-tasks[${index}].date`, {
          nullable: true,
        }),
        checkedAt: timestamp(
          source.checkedAt,
          `work-tasks[${index}].checkedAt`,
        ),
        ...(source.archived === true && source.checkedAt && { archived: true }),
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
      if (!WORK_STATUS_SET.has(status))
        fail(`work-statuses.${workDate}`, "has an unknown status");
      return [workDate, status];
    }),
  );
}

function choreSchedule(value, path) {
  const source = object(value, path);
  if (!["day", "week", "month"].includes(source.frequency))
    fail(`${path}.frequency`, "must be day, week, or month");
  const interval = integer(source.interval, `${path}.interval`, {
    maximum: 999,
  });
  if (!interval) fail(`${path}.interval`, "must be at least 1");
  const days = (values, field, min, max) => {
    const selected = array(values, `${path}.${field}`, max - min + 1).map(
      (day, index) => {
        const result = integer(day, `${path}.${field}[${index}]`, {
          maximum: max,
        });
        if (result < min)
          fail(`${path}.${field}[${index}]`, `must be at least ${min}`);
        return result;
      },
    );
    if (!selected.length || new Set(selected).size !== selected.length)
      fail(`${path}.${field}`, "must contain unique selected days");
    return selected.sort((a, b) => a - b);
  };
  return {
    frequency: source.frequency,
    interval,
    startDate: date(source.startDate, `${path}.startDate`),
    weekdays: days(source.weekdays, "weekdays", 0, 6),
    monthDays: days(source.monthDays, "monthDays", 1, 31),
  };
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
        ...(entry.schedule != null && {
          schedule: choreSchedule(
            entry.schedule,
            `chores.tasks[${index}].schedule`,
          ),
        }),
      };
    }),
    "chores.tasks",
  );
  const taskIds = new Set(tasks.map((item) => item.id));
  const occurrenceOrder = array(
    source.occurrenceOrder,
    "chores.occurrenceOrder",
  ).map((entry, index) => {
    const taskId = id(entry, `chores.occurrenceOrder[${index}]`);
    if (!taskIds.has(taskId))
      fail(`chores.occurrenceOrder[${index}]`, "must reference a chore");
    return taskId;
  });
  if (new Set(occurrenceOrder).size !== occurrenceOrder.length)
    fail("chores.occurrenceOrder", "must be unique");
  const history =
    source.history === undefined
      ? []
      : array(source.history, "chores.history", 100_000).map((entry, index) => {
          const path = `chores.history[${index}]`;
          const item = task(entry, path);
          if (!item.completedAt) fail(path, "must be a completed occurrence");
          return {
            ...item,
            details: text(entry.details, `${path}.details`),
            nextDue: date(entry.nextDue, `${path}.nextDue`),
          };
        });
  const keys = history.map((item) => `${item.id}:${item.nextDue}`);
  if (new Set(keys).size !== keys.length)
    fail("chores.history", "must contain unique occurrences");
  if (source.replaceHistory === true && source.history === undefined)
    fail("chores.history", "is required");
  return {
    occurrenceOrder,
    tasks,
    ...(source.history !== undefined && { history }),
    ...(source.replaceHistory === true && { replaceHistory: true }),
  };
}

function todos(value) {
  const source = object(value, "todos");
  const lists = uniqueIds(
    array(source.lists, "todos.lists", APP_DATA_LIMITS.lists).map(
      (entry, listIndex) => {
        const list = object(entry, `todos.lists[${listIndex}]`);
        return {
          id: id(list.id, `todos.lists[${listIndex}].id`),
          title: text(list.title, `todos.lists[${listIndex}].title`),
          color:
            list.color == null
              ? null
              : color(list.color, `todos.lists[${listIndex}].color`),
          tasks: uniqueIds(
            array(list.tasks, `todos.lists[${listIndex}].tasks`).map(
              (item, itemIndex) =>
                task(item, `todos.lists[${listIndex}].tasks[${itemIndex}]`),
            ),
            `todos.lists[${listIndex}].tasks`,
          ),
        };
      },
    ),
    "todos.lists",
  );
  const itemIds = lists.flatMap((list) => list.tasks.map((item) => item.id));
  if (new Set(itemIds).size !== itemIds.length)
    fail("todos", "task IDs must be unique across lists");
  const history =
    source.history === undefined
      ? []
      : uniqueIds(
          array(source.history, "todos.history", 100_000).map(
            (entry, index) => {
              const item = task(entry, `todos.history[${index}]`);
              if (!item.completedAt)
                fail(`todos.history[${index}]`, "must be completed");
              return item;
            },
          ),
          "todos.history",
        );
  if (
    source.replaceHistory !== undefined &&
    typeof source.replaceHistory !== "boolean"
  )
    fail("todos.replaceHistory", "must be a boolean");
  if (source.replaceHistory === true && source.history === undefined)
    fail("todos.history", "is required when replacing history");
  return {
    lists,
    ...(source.history !== undefined && { history }),
    ...(source.replaceHistory === true && { replaceHistory: true }),
  };
}

function retainedHistory(value, path) {
  return uniqueIds(
    array(value ?? [], path, 100_000).map((entry, index) => {
      const item = task(entry, `${path}[${index}]`);
      if (!item.completedAt) fail(path, "must contain completed tasks");
      let event;
      if (entry.event !== undefined) {
        const value = object(entry.event, `${path}.event`);
        if (!["created", "stitches"].includes(value.type))
          fail(path, "unknown project activity type");
        event = { type: value.type, projectId: id(value.projectId, path) };
        if (value.type === "stitches") {
          if (
            !Number.isSafeInteger(value.stitches) ||
            Math.abs(value.stitches) > APP_DATA_LIMITS.quantity
          )
            fail(path, "invalid stitch count");
          event.stitches = value.stitches;
        }
      }
      return {
        ...item,
        ...(entry.context && { context: text(entry.context, path) }),
        ...(event && { event }),
      };
    }),
    path,
  );
}

function shoppingTask(entry, path) {
  const item = task(entry, path);
  if (!entry.source)
    return {
      ...item,
      productLink: productLink(entry.productLink, `${path}.productLink`),
    };
  if (!["filament-shortage", "floss-shortage"].includes(entry.source))
    fail(path, "unknown shopping source");
  if (!item.completedAt) fail(path, "purchases must be completed");
  const key = entry.source === "filament-shortage" ? "filamentId" : "flossId";
  const quantity = integer(entry.quantity, `${path}.quantity`);
  if (!quantity) fail(path, "purchase quantity must be positive");
  return {
    ...item,
    source: entry.source,
    [key]: id(entry[key], path),
    quantity,
    productLink: productLink(entry.productLink, `${path}.productLink`),
  };
}

function shopping(value) {
  const source = object(value, "shopping");
  const entries = array(source.tasks, "shopping.tasks", 100_000);
  const saved = entries.filter((entry) => !entry?.source || entry.completedAt);
  array(
    saved.filter((entry) => !entry?.source),
    "shopping.tasks",
  );
  const tasks = uniqueIds(
    saved.map((entry, index) =>
      shoppingTask(entry, `shopping.tasks[${index}]`),
    ),
    "shopping.tasks",
  );
  const history = uniqueIds(
    array(source.history ?? [], "shopping.history", 100_000).map(
      (entry, index) => {
        const item = shoppingTask(entry, `shopping.history[${index}]`);
        if (!item.completedAt) fail("shopping.history", "must be completed");
        return item;
      },
    ),
    "shopping.history",
  );
  const ids = [...tasks, ...history].map((item) => item.id);
  if (new Set(ids).size !== ids.length)
    fail("shopping", "task and history IDs must be distinct");
  return { tasks, ...(source.history !== undefined && { history }) };
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
    array(source.projects, "printing.projects", APP_DATA_LIMITS.projects).map(
      (entry, projectIndex) => {
        const item = project(entry, `printing.projects[${projectIndex}]`);
        return {
          ...item,
          tasks: uniqueIds(
            array(entry.tasks, `printing.projects[${projectIndex}].tasks`).map(
              (taskEntry, taskIndex) => {
                const taskPath = `printing.projects[${projectIndex}].tasks[${taskIndex}]`;
                const taskItem = task(taskEntry, taskPath);
                return {
                  ...taskItem,
                  filaments: uniqueIds(
                    array(
                      taskEntry.filaments,
                      `${taskPath}.filaments`,
                      APP_DATA_LIMITS.filaments,
                    ).map((filamentEntry, filamentIndex) => {
                      const filamentPath = `${taskPath}.filaments[${filamentIndex}]`;
                      const filament = object(filamentEntry, filamentPath);
                      return {
                        id: id(filament.id, `${filamentPath}.id`),
                        catalogId: optionalText(
                          filament.catalogId,
                          `${filamentPath}.catalogId`,
                          { maximum: 200 },
                        ),
                        label: optionalText(
                          filament.label,
                          `${filamentPath}.label`,
                        ),
                        weightGrams:
                          filament.weightGrams === "" ||
                          filament.weightGrams === undefined
                            ? null
                            : number(
                                filament.weightGrams,
                                `${filamentPath}.weightGrams`,
                              ),
                      };
                    }),
                    `${taskPath}.filaments`,
                  ),
                };
              },
            ),
            `printing.projects[${projectIndex}].tasks`,
          ),
        };
      },
    ),
    "printing.projects",
  );
  const taskIds = projects.flatMap((entry) =>
    entry.tasks.map((item) => item.id),
  );
  if (new Set(taskIds).size !== taskIds.length)
    fail("printing", "item IDs must be unique across projects");
  const usageIds = projects.flatMap((entry) =>
    entry.tasks.flatMap((item) => item.filaments.map((usage) => usage.id)),
  );
  if (new Set(usageIds).size !== usageIds.length)
    fail("printing", "filament usage IDs must be unique across projects");
  return {
    projects,
    ...(source.history !== undefined && {
      history: retainedHistory(source.history, "projects.history"),
    }),
  };
}

function crossStitch(value) {
  const source = object(value, "cross-stitch");
  const projects = uniqueIds(
    array(
      source.projects,
      "cross-stitch.projects",
      APP_DATA_LIMITS.projects,
    ).map((entry, projectIndex) => {
      const item = project(entry, `cross-stitch.projects[${projectIndex}]`);
      return {
        ...item,
        tasks: uniqueIds(
          array(
            entry.tasks,
            `cross-stitch.projects[${projectIndex}].tasks`,
          ).map((taskEntry, taskIndex) => {
            const taskPath = `cross-stitch.projects[${projectIndex}].tasks[${taskIndex}]`;
            const sourceTask = object(taskEntry, taskPath);
            const totalCrosses = integer(
              sourceTask.crosses,
              `${taskPath}.crosses`,
            );
            const completedCrosses = integer(
              sourceTask.crossesDone,
              `${taskPath}.crossesDone`,
            );
            if (completedCrosses > totalCrosses)
              fail(`${taskPath}.crossesDone`, "must not exceed crosses");
            const isCompleted =
              totalCrosses > 0 && completedCrosses === totalCrosses;
            const taskCompletedAt = timestamp(
              sourceTask.completedAt,
              `${taskPath}.completedAt`,
            );
            if (isCompleted && !taskCompletedAt)
              fail(
                `${taskPath}.completedAt`,
                "is required when all crosses are done",
              );
            return {
              id: id(sourceTask.id, `${taskPath}.id`),
              title: text(sourceTask.title, `${taskPath}.title`),
              flossId: optionalText(sourceTask.flossId, `${taskPath}.flossId`, {
                maximum: 200,
              }),
              requiredSkeins: integer(
                sourceTask.requiredSkeins,
                `${taskPath}.requiredSkeins`,
                {
                  maximum: APP_DATA_LIMITS.skeins,
                },
              ),
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
  const taskIds = projects.flatMap((entry) =>
    entry.tasks.map((item) => item.id),
  );
  if (new Set(taskIds).size !== taskIds.length)
    fail("cross-stitch", "thread IDs must be unique across projects");
  return {
    projects,
    ...(source.history !== undefined && {
      history: retainedHistory(source.history, "projects.history"),
    }),
  };
}

function inventory(value, resource) {
  const source = object(value, resource);
  if (Object.keys(source).length > RESOURCE_LIMIT)
    fail(resource, `must contain at most ${RESOURCE_LIMIT} entries`);
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
  preferences: (value) => {
    const source = object(value, "preferences");
    const hiddenNavigation = array(
      source.hiddenNavigation,
      "preferences.hiddenNavigation",
      7,
    );
    if (hiddenNavigation.some((name) => !NAVIGATION_IDS.includes(name)))
      fail(
        "preferences.hiddenNavigation",
        "must contain known navigation items",
      );
    return { hiddenNavigation: [...new Set(hiddenNavigation)] };
  },
  "work-tasks": workTasks,
  "work-statuses": workStatuses,
  colors: (value) => {
    const source = object(value, "colors");
    if (Object.keys(source).length > RESOURCE_LIMIT)
      fail("colors", `must contain at most ${RESOURCE_LIMIT} entries`);
    return Object.fromEntries(
      Object.entries(source).map(([key, value]) => {
        if (!["backlog", "chores-today", "chores-all"].includes(key)) {
          if (!key.startsWith("work-day:"))
            fail(
              `colors.${key}`,
              "must identify a work date, backlog, or chores card",
            );
          date(key.slice("work-day:".length), `colors.${key}`);
        }
        return [key, color(value, `colors.${key}`)];
      }),
    );
  },
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
  if (!validate)
    throw new AppDataValidationError(`Unknown app-data resource: ${resource}`);
  return validate(value);
}
