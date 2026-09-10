import { AppDataValidationError } from "./app-data-validation.mjs";
import { splitHistory } from "./history-transport.mjs";
import { resourceFromState, setStateResource } from "./app-data-contract.mjs";
import { adjustShoppingStock } from "./shopping-stock.mjs";
import { APP_DATA_RESOURCES, SHARED_APP_DATA_RESOURCES, completionState as completion } from "./app-data-contract.mjs";

export class AppDataRevisionConflictError extends Error {
  constructor(resource, expectedRevision, currentRevision) {
    super(`The ${resource} data changed after revision ${expectedRevision}`);
    this.resource = resource;
    this.expectedRevision = expectedRevision;
    this.currentRevision = currentRevision;
  }
}

const timestamp = (value) => (value instanceof Date ? value.toISOString() : value || null);

async function queryRows(executor, text, values = []) {
  return (await executor.query({ text, values })).rows;
}

async function transaction(pool, options, userId, callback) {
  if (typeof userId !== "string" || !userId) throw new Error("An authenticated user ID is required");
  const client = await pool.connect();
  try {
    await client.query(`BEGIN${options ? ` ${options}` : ""}`);
    await client.query({ text: "SELECT set_config('app.user_id', $1, true)", values: [userId] });
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function deleteMissing(executor, table, column, ids) {
  if (ids.length === 0) {
    await executor.query(`DELETE FROM ${table}`);
    return;
  }
  await executor.query({
    text: `DELETE FROM ${table} WHERE NOT (${column} = ANY($1::text[]))`,
    values: [ids],
  });
}

async function readAppData(
  pool,
  userId,
  { resources = APP_DATA_RESOURCES, history = "all", offset = 0, limit = 500 } = {},
) {
  return transaction(pool, "ISOLATION LEVEL REPEATABLE READ READ ONLY", userId, async (client) => {
    const onlyHistory = history === "page";
    const page = onlyHistory ? ` LIMIT ${limit} OFFSET ${offset}` : "";
    const rows = (resource, sql, values = [], historyQuery = false) =>
      resources.includes(resource) && (!onlyHistory || historyQuery) && (history !== "omit" || !historyQuery)
        ? queryRows(client, sql, values)
        : [];
    const mixedRows = (resource, sql) => (resources.includes(resource) ? queryRows(client, sql) : []);
    const ownerRows = await queryRows(client, "SELECT id FROM auth_users ORDER BY created_at, id LIMIT 1");
    const preferences = await rows(
      "preferences",
      'SELECT hidden_navigation AS "hiddenNavigation" FROM user_preferences',
    );
    const revisionRows = await queryRows(
      client,
      `SELECT resource, revision
       FROM app_data_revisions
       ORDER BY resource`,
    );
    const workTaskRows = await mixedRows(
      "work-tasks",
      `SELECT id, title, archived, scheduled_for::text AS date, completed_at AS "checkedAt"
       FROM work_tasks
       ${onlyHistory ? "WHERE archived" : history === "omit" ? "WHERE NOT archived" : ""}
       ORDER BY position, created_at, id${page}`,
    );
    const workStatusRows = await rows(
      "work-statuses",
      `SELECT work_date::text AS date, status
       FROM work_day_statuses
       ORDER BY work_date`,
    );
    const colorRows = await rows("colors", "SELECT id, color FROM colors ORDER BY id");
    const choreRows = await rows(
      "chores",
      `SELECT
         chores.id,
         chores.title,
         chores.schedule_description AS details,
         chores.schedule,
         occurrence.due_on::text AS "nextDue",
         occurrence.completed_at AS "completedAt",
         occurrence.position AS "occurrencePosition"
       FROM chores
       LEFT JOIN LATERAL (
         SELECT due_on, completed_at, position
         FROM chore_occurrences
         WHERE chore_id = chores.id
           AND (chores.next_due_on IS NULL OR due_on = chores.next_due_on)
         ORDER BY due_on DESC
         LIMIT 1
       ) AS occurrence ON true
       WHERE chores.enabled
       ORDER BY chores.position, chores.created_at, chores.id`,
    );
    const choreHistoryRows = await rows(
      "chores",
      `SELECT chores.id, chores.title,
      chores.schedule_description AS details, occurrence.due_on::text AS "nextDue",
      occurrence.completed_at AS "completedAt"
      FROM chore_occurrences AS occurrence JOIN chores ON chores.id = occurrence.chore_id
      WHERE occurrence.completed_at IS NOT NULL
      AND NOT (chores.enabled AND occurrence.due_on IS NOT DISTINCT FROM chores.next_due_on)
      ORDER BY occurrence.due_on, chores.id${page}`,
      [],
      true,
    );
    const currentChores = new Set(choreRows.map((row) => `${row.id}:${row.nextDue}`));
    const choreHistory = choreHistoryRows
      .filter((row) => !currentChores.has(`${row.id}:${row.nextDue}`))
      .map((row) => ({
        id: row.id,
        title: row.title,
        details: row.details,
        nextDue: row.nextDue,
        ...completion(row.completedAt),
      }));
    const todoListRows = await rows(
      "todos",
      `SELECT id, title, color
       FROM todo_lists
       ORDER BY position, created_at, id`,
    );
    const todoItemRows = await mixedRows(
      "todos",
      `SELECT id, list_id AS "listId", title, completed_at AS "completedAt"
       FROM todo_items
       ${onlyHistory ? "WHERE list_id IS NULL" : history === "omit" ? "WHERE list_id IS NOT NULL" : ""}
       ORDER BY list_id, position, created_at, id${page}`,
    );
    const shoppingRows = await mixedRows(
      "shopping",
      `SELECT id, title, source, catalog_id AS "catalogId", quantity, archived, product_url AS "productLink", completed_at AS "completedAt"
       FROM manual_shopping_items
       ${onlyHistory ? "WHERE archived" : history === "omit" ? "WHERE NOT archived" : ""}
       ORDER BY position, created_at, id${page}`,
    );
    const projectHistory =
      history === "omit"
        ? []
        : await queryRows(
            client,
            `SELECT resource, id, title, context, completed_at AS "completedAt" FROM completed_project_tasks WHERE resource = ANY($1::text[]) ORDER BY resource, id${page}`,
            [resources.filter((resource) => ["printing", "cross-stitch"].includes(resource))],
          );
    const historyFor = (resource) =>
      projectHistory
        .filter((row) => row.resource === resource)
        .map(({ resource: _resource, ...row }) => ({ ...row, ...completion(row.completedAt) }));
    const shoppingTask = (item) => ({
      id: item.id,
      title: item.title,
      ...(item.productLink && { productLink: item.productLink }),
      ...(item.source && {
        source: item.source,
        quantity: item.quantity,
        [item.source === "filament-shortage" ? "filamentId" : "flossId"]: item.catalogId,
      }),
      ...completion(item.completedAt),
    });
    const printingProjectRows = await rows(
      "printing",
      `SELECT id, title, color, description
       FROM printing_projects
       ORDER BY position, created_at, id`,
    );
    const printingItemRows = await rows(
      "printing",
      `SELECT id, project_id AS "projectId", title, completed_at AS "completedAt"
       FROM printing_items
       ORDER BY project_id, position, created_at, id`,
    );
    const filamentUsageRows = await rows(
      "printing",
      `SELECT
         usages.id,
         usages.printing_item_id AS "itemId",
         usages.catalog_id AS "catalogId",
         coalesce(catalog.family || ' · ' || catalog.color_name, usages.fallback_label, '') AS label,
         usages.weight_grams AS "weightGrams"
       FROM printing_item_filaments AS usages
       LEFT JOIN current_filament_catalog AS catalog ON catalog.catalog_id = usages.catalog_id
       ORDER BY usages.printing_item_id, usages.position, usages.id`,
    );
    const stitchProjectRows = await rows(
      "cross-stitch",
      `SELECT id, title, color, description
       FROM stitch_projects
       ORDER BY position, created_at, id`,
    );
    const stitchThreadRows = await rows(
      "cross-stitch",
      `SELECT
         threads.id,
         threads.project_id AS "projectId",
         coalesce('DMC ' || catalog.number || ' · ' || catalog.color_name, threads.fallback_label, 'Choose a thread color') AS title,
         threads.floss_catalog_id AS "flossId",
         threads.required_skeins AS "requiredSkeins",
         threads.total_crosses AS crosses,
         threads.completed_crosses AS "crossesDone",
         threads.completed_at AS "completedAt"
       FROM stitch_project_threads AS threads
       LEFT JOIN current_floss_catalog AS catalog ON catalog.catalog_id = threads.floss_catalog_id
       ORDER BY threads.project_id, threads.position, threads.created_at, threads.id`,
    );
    const filamentInventoryRows = await rows(
      "filament-inventory",
      `SELECT catalog_id AS "catalogId", spool_count AS count
       FROM filament_inventory
       WHERE spool_count > 0
       ORDER BY catalog_id`,
    );
    const flossInventoryRows = await rows(
      "floss-inventory",
      `SELECT catalog_id AS "catalogId", skein_count AS count
       FROM floss_inventory
       WHERE skein_count > 0
       ORDER BY catalog_id`,
    );

    const revisions = Object.fromEntries(APP_DATA_RESOURCES.map((resource) => [resource, 0]));
    for (const row of revisionRows) revisions[row.resource] = row.revision;

    const todoItemsByList = new Map(todoListRows.map((list) => [list.id, []]));
    for (const item of todoItemRows) {
      todoItemsByList.get(item.listId)?.push({ id: item.id, title: item.title, ...completion(item.completedAt) });
    }

    const filamentUsagesByItem = new Map(printingItemRows.map((item) => [item.id, []]));
    for (const usage of filamentUsageRows) {
      filamentUsagesByItem.get(usage.itemId)?.push({
        id: usage.id,
        catalogId: usage.catalogId || "",
        label: usage.label,
        weightGrams: usage.weightGrams === null ? "" : Number(usage.weightGrams),
      });
    }
    const printingItemsByProject = new Map(printingProjectRows.map((project) => [project.id, []]));
    for (const item of printingItemRows) {
      printingItemsByProject.get(item.projectId)?.push({
        id: item.id,
        title: item.title,
        ...completion(item.completedAt),
        filaments: filamentUsagesByItem.get(item.id) ?? [],
      });
    }

    const stitchThreadsByProject = new Map(stitchProjectRows.map((project) => [project.id, []]));
    for (const thread of stitchThreadRows) {
      stitchThreadsByProject.get(thread.projectId)?.push({
        id: thread.id,
        title: thread.title,
        flossId: thread.flossId || "",
        requiredSkeins: thread.requiredSkeins,
        crosses: thread.crosses,
        crossesDone: thread.crossesDone,
        ...completion(thread.completedAt),
      });
    }

    const state = {
      userId,
      legacyOwner: ownerRows[0]?.id === userId,
      preferences: preferences[0] ?? { hiddenNavigation: [] },
      initializedResources: revisionRows.map((row) => row.resource),
      revisions,
      workTasks: workTaskRows.map((item) => ({
        id: item.id,
        title: item.title,
        ...(item.archived && { archived: true }),
        date: item.date,
        ...(item.checkedAt && { checkedAt: timestamp(item.checkedAt) }),
      })),
      workStatuses: Object.fromEntries(workStatusRows.map((row) => [row.date, row.status])),
      colors: Object.fromEntries(colorRows.map((row) => [row.id, row.color])),
      pages: {
        chores: {
          ...(choreHistory.length && { history: choreHistory }),
          occurrenceOrder: choreRows
            .filter((row) => row.nextDue)
            .sort((first, second) => first.occurrencePosition - second.occurrencePosition)
            .map((row) => row.id),
          tasks: choreRows
            .filter((row) => row.nextDue)
            .map((row) => ({
              id: row.id,
              title: row.title,
              details: row.details,
              ...(row.schedule && { schedule: row.schedule }),
              nextDue: row.nextDue,
              ...completion(row.completedAt),
            })),
        },
        todos: {
          ...(todoItemRows.some((item) => !item.listId && item.completedAt) && {
            history: todoItemRows
              .filter((item) => !item.listId && item.completedAt)
              .map((item) => ({ id: item.id, title: item.title, ...completion(item.completedAt) })),
          }),
          lists: todoListRows.map((list) => ({
            id: list.id,
            title: list.title,
            color: list.color,
            tasks: todoItemsByList.get(list.id) ?? [],
          })),
        },
        shopping: {
          tasks: shoppingRows.filter((item) => !item.archived).map(shoppingTask),
          ...(shoppingRows.some((item) => item.archived) && {
            history: shoppingRows.filter((item) => item.archived).map(shoppingTask),
          }),
        },
        printing: {
          ...(historyFor("printing").length && { history: historyFor("printing") }),
          projects: printingProjectRows.map((project) => ({
            ...project,
            tasks: printingItemsByProject.get(project.id) ?? [],
          })),
        },
        crossStitch: {
          ...(historyFor("cross-stitch").length && { history: historyFor("cross-stitch") }),
          projects: stitchProjectRows.map((project) => {
            const tasks = stitchThreadsByProject.get(project.id) ?? [];
            return {
              ...project,
              totalCrosses: tasks.reduce((total, item) => total + item.crosses, 0),
              tasks,
            };
          }),
        },
      },
      inventories: {
        filament: Object.fromEntries(filamentInventoryRows.map((row) => [row.catalogId, row.count])),
        floss: Object.fromEntries(flossInventoryRows.map((row) => [row.catalogId, row.count])),
      },
    };
    if (onlyHistory) {
      const resource = resources[0];
      const items = splitHistory(resource, resourceFromState(state, resource)).history;
      return {
        userId,
        resource,
        revision: revisions[resource],
        items,
        nextOffset: items.length === limit ? offset + limit : null,
      };
    }
    if (history === "omit") state.historyTransport = 1;
    state.includedResources = resources;
    for (const resource of APP_DATA_RESOURCES)
      if (!resources.includes(resource)) setStateResource(state, resource, undefined);
    return state;
  });
}

// Table and column names below are application constants. Row values always use bind parameters.
async function insertRows(client, table, columns, rows, conflict = "") {
  const batchSize = 500;
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const placeholders = batch.map(
      (row, index) => `(${row.map((_, column) => `$${index * columns.length + column + 1}`).join(", ")})`,
    );
    await client.query({
      text: `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${placeholders.join(", ")} ${conflict}`,
      values: batch.flat(),
    });
  }
}

const PERSONAL_TABLES = new Set([
  "work_tasks",
  "work_day_statuses",
  "colors",
  "todo_lists",
  "todo_items",
  "printing_projects",
  "printing_items",
  "printing_item_filaments",
  "stitch_projects",
  "stitch_project_threads",
  "completed_project_tasks",
]);

async function upsertRows(client, table, columns, rows, { keys = ["id"], updatedAt = true, preserve = [] } = {}) {
  if (PERSONAL_TABLES.has(table)) keys = ["user_id", ...keys];
  const updates = columns
    .filter((column) => !keys.includes(column))
    .map(
      (column) =>
        `${column} = ${preserve.includes(column) ? `coalesce(EXCLUDED.${column}, ${table}.${column})` : `EXCLUDED.${column}`}`,
    );
  if (updatedAt) updates.push("updated_at = now()");
  await insertRows(
    client,
    table,
    columns,
    rows,
    `ON CONFLICT (${keys.join(", ")}) DO UPDATE SET ${updates.join(", ")}`,
  );
}

async function replaceWorkTasks(client, tasks, _userId, patch = false) {
  await upsertRows(
    client,
    "work_tasks",
    ["id", "title", "scheduled_for", "completed_at", "position", "archived"],
    tasks.map((task, position) => [task.id, task.title, task.date, task.checkedAt, position, task.archived ?? false]),
  );
  await client.query({
    text: "DELETE FROM work_tasks WHERE NOT (id = ANY($1::text[])) AND (NOT archived OR $2)",
    values: [tasks.map((task) => task.id), !patch],
  });
}

async function replaceWorkStatuses(client, statuses) {
  await client.query("DELETE FROM work_day_statuses");
  await insertRows(client, "work_day_statuses", ["work_date", "status"], Object.entries(statuses));
}

async function replaceChores(client, data) {
  const occurrencePosition = new Map(data.occurrenceOrder.map((id, position) => [id, position]));
  await upsertRows(
    client,
    "chores",
    ["id", "title", "schedule_description", "schedule", "next_due_on", "enabled", "position"],
    data.tasks.map((chore, position) => [
      chore.id,
      chore.title,
      chore.details,
      chore.schedule ? JSON.stringify(chore.schedule) : null,
      chore.nextDue,
      true,
      position,
    ]),
    { preserve: ["schedule"] },
  );
  await upsertRows(
    client,
    "chore_occurrences",
    ["chore_id", "due_on", "completed_at", "position"],
    data.tasks.map((chore, position) => [
      chore.id,
      chore.nextDue,
      chore.completedAt,
      occurrencePosition.get(chore.id) ?? position,
    ]),
    { keys: ["chore_id", "due_on"], updatedAt: false },
  );
  // Deleted chores remain as archived definitions so their occurrences survive.
  await client.query({
    text: "UPDATE chores SET enabled = false, updated_at = now() WHERE enabled AND NOT (id = ANY($1::text[]))",
    values: [data.tasks.map((task) => task.id)],
  });
  // A completed chore may have been created and removed while offline.
  const history = data.history ?? [];
  const definitions = [...new Map(history.map((item) => [item.id, item])).values()];
  await insertRows(
    client,
    "chores",
    ["id", "title", "schedule_description", "enabled", "position"],
    definitions.map((item) => [item.id, item.title, item.details, false, 0]),
    "ON CONFLICT (id) DO NOTHING",
  );
  await insertRows(
    client,
    "chore_occurrences",
    ["chore_id", "due_on", "completed_at", "position"],
    history.map((item) => [item.id, item.nextDue, item.completedAt, 0]),
    "ON CONFLICT (chore_id, due_on) DO NOTHING",
  );
  if (data.replaceHistory === true) {
    const retained = [...history, ...data.tasks]
      .filter((item) => item.completedAt)
      .map((item) => `${item.id}:${item.nextDue}`);
    await client.query({
      text: "DELETE FROM chore_occurrences WHERE completed_at IS NOT NULL AND NOT ((chore_id || ':' || due_on::text) = ANY($1::text[]))",
      values: [retained],
    });
  }
}

async function replaceTodos(client, data) {
  const items = data.lists.flatMap((list) =>
    list.tasks.map((item, position) => [item.id, list.id, item.title, item.completedAt, position]),
  );
  await upsertRows(
    client,
    "todo_lists",
    ["id", "title", "color", "position"],
    data.lists.map((list, position) => [list.id, list.title, list.color, position]),
    { preserve: ["color"] },
  );
  await upsertRows(client, "todo_items", ["id", "list_id", "title", "completed_at", "position"], items);
  const listIds = data.lists.map((list) => list.id);
  await client.query({
    text: `UPDATE todo_items SET list_id = NULL WHERE completed_at IS NOT NULL
      AND list_id = ANY($1::text[]) AND NOT (id = ANY($2::text[]))`,
    values: [listIds, items.map((item) => item[0])],
  });
  await client.query({
    text: `DELETE FROM todo_items WHERE list_id IS NOT NULL AND NOT (id = ANY($1::text[]))
      AND (list_id = ANY($2::text[]) OR (list_id <> 'general' AND completed_at IS NULL))`,
    values: [items.map((item) => item[0]), listIds],
  });
  // Detach completed items before cascading deletion of their list. General is never removed.
  await client.query({
    text: "UPDATE todo_items SET list_id = NULL WHERE completed_at IS NOT NULL AND list_id <> 'general' AND NOT (list_id = ANY($1::text[]))",
    values: [listIds],
  });
  await client.query({
    text: "DELETE FROM todo_lists WHERE id <> 'general' AND NOT (id = ANY($1::text[]))",
    values: [listIds],
  });
  await insertRows(
    client,
    "todo_items",
    ["id", "list_id", "title", "completed_at", "position"],
    (data.history ?? []).map((item) => [item.id, null, item.title, item.completedAt, 0]),
    "ON CONFLICT (user_id, id) DO UPDATE SET title = EXCLUDED.title, completed_at = EXCLUDED.completed_at WHERE todo_items.list_id IS NULL",
  );
  // Replace only when explicitly requested; older clients submit history additions.
  if (data.replaceHistory === true) {
    await client.query({
      text: "DELETE FROM todo_items WHERE list_id IS NULL AND NOT (id = ANY($1::text[]))",
      values: [data.history.map((item) => item.id)],
    });
  }
}

async function replaceShopping(client, data, userId, patch = false) {
  const tasks = [
    ...data.tasks.map((item) => ({ ...item, archived: false })),
    ...(data.history ?? []).map((item) => ({ ...item, archived: true })),
  ];
  await upsertRows(
    client,
    "manual_shopping_items",
    ["id", "title", "product_url", "completed_at", "position", "source", "catalog_id", "quantity", "archived", "scope"],
    tasks.map((item, position) => [
      item.id,
      item.title,
      item.productLink,
      item.completedAt,
      position,
      item.source,
      item.filamentId ?? item.flossId,
      item.quantity,
      item.archived,
      item.source ? userId : "",
    ]),
    { keys: ["scope", "id"] },
  );
  // Legacy callers do not know retained history.
  await client.query({
    text: "DELETE FROM manual_shopping_items WHERE NOT (id = ANY($1::text[])) AND (NOT archived OR $2)",
    values: [tasks.map((item) => item.id), data.history !== undefined && !patch],
  });
}

async function replaceProjectHistory(client, resource, data, patch) {
  if (data.history === undefined) return;
  if (!patch)
    await client.query({ text: "DELETE FROM completed_project_tasks WHERE resource = $1", values: [resource] });
  await insertRows(
    client,
    "completed_project_tasks",
    ["resource", "id", "title", "context", "completed_at"],
    data.history.map((item) => [resource, item.id, item.title, item.context ?? "", item.completedAt]),
    "ON CONFLICT (user_id, resource, id) DO UPDATE SET title = EXCLUDED.title, context = EXCLUDED.context, completed_at = EXCLUDED.completed_at",
  );
}

async function replacePrinting(client, data, _userId, patch = false) {
  await replaceProjectHistory(client, "printing", data, patch);
  const items = [];
  const usages = [];
  for (const project of data.projects) {
    for (const [position, item] of project.tasks.entries()) {
      items.push([item.id, project.id, item.title, item.completedAt, position]);
      for (const [usagePosition, usage] of item.filaments.entries()) {
        usages.push([usage.id, item.id, usage.catalogId, usage.label, usage.weightGrams, usagePosition]);
      }
    }
  }
  await upsertRows(
    client,
    "printing_projects",
    ["id", "title", "color", "description", "position"],
    data.projects.map((project, position) => [project.id, project.title, project.color, project.description, position]),
  );
  await upsertRows(client, "printing_items", ["id", "project_id", "title", "completed_at", "position"], items);
  await upsertRows(
    client,
    "printing_item_filaments",
    ["id", "printing_item_id", "catalog_id", "fallback_label", "weight_grams", "position"],
    usages,
    { updatedAt: false },
  );
  await deleteMissing(
    client,
    "printing_item_filaments",
    "id",
    usages.map((usage) => usage[0]),
  );
  await deleteMissing(
    client,
    "printing_items",
    "id",
    items.map((item) => item[0]),
  );
  await deleteMissing(
    client,
    "printing_projects",
    "id",
    data.projects.map((project) => project.id),
  );
}

async function replaceCrossStitch(client, data, _userId, patch = false) {
  await replaceProjectHistory(client, "cross-stitch", data, patch);
  const threads = data.projects.flatMap((project) =>
    project.tasks.map((thread, position) => [
      thread.id,
      project.id,
      thread.flossId,
      thread.title,
      thread.requiredSkeins,
      thread.crosses,
      thread.crossesDone,
      thread.completedAt,
      position,
    ]),
  );
  await upsertRows(
    client,
    "stitch_projects",
    ["id", "title", "color", "description", "position"],
    data.projects.map((project, position) => [project.id, project.title, project.color, project.description, position]),
  );
  await upsertRows(
    client,
    "stitch_project_threads",
    [
      "id",
      "project_id",
      "floss_catalog_id",
      "fallback_label",
      "required_skeins",
      "total_crosses",
      "completed_crosses",
      "completed_at",
      "position",
    ],
    threads,
  );
  await deleteMissing(
    client,
    "stitch_project_threads",
    "id",
    threads.map((thread) => thread[0]),
  );
  await deleteMissing(
    client,
    "stitch_projects",
    "id",
    data.projects.map((project) => project.id),
  );
}

async function replaceInventory(client, table, countColumn, inventory) {
  await client.query(`DELETE FROM ${table}`);
  await insertRows(client, table, ["catalog_id", countColumn], Object.entries(inventory));
}

const WRITERS = Object.freeze({
  preferences: (client, data) =>
    upsertRows(client, "user_preferences", ["hidden_navigation"], [[data.hiddenNavigation]], {
      keys: ["user_id"],
      updatedAt: false,
    }),
  "work-tasks": replaceWorkTasks,
  "work-statuses": replaceWorkStatuses,
  colors: (client, colors) =>
    upsertRows(client, "colors", ["id", "color"], Object.entries(colors), { updatedAt: false }),
  chores: replaceChores,
  todos: replaceTodos,
  shopping: replaceShopping,
  printing: replacePrinting,
  "cross-stitch": replaceCrossStitch,
  "filament-inventory": (client, data) => replaceInventory(client, "filament_inventory", "spool_count", data),
  "floss-inventory": (client, data) => replaceInventory(client, "floss_inventory", "skein_count", data),
});

const HISTORY_TABLES = {
  "work-tasks": ["work_tasks", "id", "archived"],
  chores: ["chore_occurrences", "(chore_id || ':' || due_on::text)", "completed_at IS NOT NULL"],
  todos: ["todo_items", "id", "list_id IS NULL"],
  shopping: ["manual_shopping_items", "id", "archived"],
  printing: ["completed_project_tasks", "id", "resource = 'printing'"],
  "cross-stitch": ["completed_project_tasks", "id", "resource = 'cross-stitch'"],
};

async function removeHistory(client, resource, keys) {
  const [table, key, predicate] = HISTORY_TABLES[resource];
  await client.query({ text: `DELETE FROM ${table} WHERE ${predicate} AND ${key} = ANY($1::text[])`, values: [keys] });
}

async function replaceResource(pool, resource, data, expectedRevision, userId, historyPatch) {
  const scope = SHARED_APP_DATA_RESOURCES.includes(resource) ? "" : userId;
  return transaction(pool, "", userId, async (client) => {
    if (resource === "shopping") {
      for (const inventory of ["filament-inventory", "floss-inventory"]) {
        await client.query({
          text: "INSERT INTO app_data_revisions (scope, resource, revision) VALUES ('', $1, 0) ON CONFLICT DO NOTHING",
          values: [inventory],
        });
        await client.query({
          text: "SELECT revision FROM app_data_revisions WHERE scope = '' AND resource = $1 FOR UPDATE",
          values: [inventory],
        });
      }
    }
    await client.query({
      text: `INSERT INTO app_data_revisions (resource, scope, revision)
             VALUES ($1, $2, 0)
             ON CONFLICT (scope, resource) DO NOTHING`,
      values: [resource, scope],
    });
    const revisionRows = await queryRows(
      client,
      `SELECT revision
       FROM app_data_revisions
       WHERE resource = $1 AND scope = $2
       FOR UPDATE`,
      [resource, scope],
    );
    const currentRevision = revisionRows[0].revision;
    if (currentRevision !== expectedRevision) {
      throw new AppDataRevisionConflictError(resource, expectedRevision, currentRevision);
    }

    if (resource === "shopping") await adjustShoppingStock(client, data, userId, historyPatch);
    await WRITERS[resource](client, data, userId, Boolean(historyPatch));
    if (historyPatch?.remove.length) await removeHistory(client, resource, historyPatch.remove);
    if (historyPatch) {
      const [table, , predicate] = HISTORY_TABLES[resource];
      const count = await queryRows(
        client,
        `SELECT count(*)::integer AS count FROM ${table} WHERE ${resource === "work-tasks" ? "true" : predicate}`,
      );
      if (count[0].count > 100_000)
        throw new AppDataValidationError(
          "This resource has reached its 100,000-entry history limit. Export history before removing entries.",
        );
    }
    const updatedRows = await queryRows(
      client,
      `UPDATE app_data_revisions
       SET revision = revision + 1, updated_at = now()
       WHERE resource = $1 AND scope = $2
       RETURNING revision`,
      [resource, scope],
    );
    return updatedRows[0].revision;
  });
}

export function createAppDataRepository(pool) {
  return {
    read: (userId, options) => readAppData(pool, userId, options),
    history: (resource, userId, offset, limit) =>
      readAppData(pool, userId, { resources: [resource], history: "page", offset, limit }),
    patch: (resource, patch, expectedRevision, userId) =>
      replaceResource(
        pool,
        resource,
        resource === "work-tasks"
          ? [...patch.value, ...patch.history.upsert]
          : { ...patch.value, history: patch.history.upsert },
        expectedRevision,
        userId,
        patch.history,
      ),
    replace: (resource, data, expectedRevision, userId) =>
      replaceResource(pool, resource, data, expectedRevision, userId),
  };
}
