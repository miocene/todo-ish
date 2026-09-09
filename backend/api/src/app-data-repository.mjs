import { APP_DATA_RESOURCES, completionState as completion } from "./app-data-contract.mjs";

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

async function transaction(pool, options, callback) {
  const client = await pool.connect();
  try {
    await client.query(`BEGIN${options ? ` ${options}` : ""}`);
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

async function readAppData(pool) {
  return transaction(pool, "ISOLATION LEVEL REPEATABLE READ READ ONLY", async (client) => {
    const revisionRows = await queryRows(
      client,
      `SELECT resource, revision
       FROM app_data_revisions
       ORDER BY resource`,
    );
    const workTaskRows = await queryRows(
      client,
      `SELECT id, title, scheduled_for::text AS date, completed_at AS "checkedAt"
       FROM work_tasks
       ORDER BY position, created_at, id`,
    );
    const workStatusRows = await queryRows(
      client,
      `SELECT work_date::text AS date, status
       FROM work_day_statuses
       ORDER BY work_date`,
    );
    const colorRows = await queryRows(client, "SELECT id, color FROM colors ORDER BY id");
    const choreRows = await queryRows(
      client,
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
    const choreHistoryRows = await queryRows(
      client,
      `SELECT chores.id, chores.title,
      chores.schedule_description AS details, occurrence.due_on::text AS "nextDue",
      occurrence.completed_at AS "completedAt"
      FROM chore_occurrences AS occurrence JOIN chores ON chores.id = occurrence.chore_id
      WHERE occurrence.completed_at IS NOT NULL
      ORDER BY occurrence.due_on, chores.id`,
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
    const todoListRows = await queryRows(
      client,
      `SELECT id, title, color
       FROM todo_lists
       ORDER BY position, created_at, id`,
    );
    const todoItemRows = await queryRows(
      client,
      `SELECT id, list_id AS "listId", title, completed_at AS "completedAt"
       FROM todo_items
       ORDER BY list_id, position, created_at, id`,
    );
    const shoppingRows = await queryRows(
      client,
      `SELECT id, title, product_url AS "productLink", completed_at AS "completedAt"
       FROM manual_shopping_items
       ORDER BY position, created_at, id`,
    );
    const printingProjectRows = await queryRows(
      client,
      `SELECT id, title, color, description
       FROM printing_projects
       ORDER BY position, created_at, id`,
    );
    const printingItemRows = await queryRows(
      client,
      `SELECT id, project_id AS "projectId", title, completed_at AS "completedAt"
       FROM printing_items
       ORDER BY project_id, position, created_at, id`,
    );
    const filamentUsageRows = await queryRows(
      client,
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
    const stitchProjectRows = await queryRows(
      client,
      `SELECT id, title, color, description
       FROM stitch_projects
       ORDER BY position, created_at, id`,
    );
    const stitchThreadRows = await queryRows(
      client,
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
    const filamentInventoryRows = await queryRows(
      client,
      `SELECT catalog_id AS "catalogId", spool_count AS count
       FROM filament_inventory
       WHERE spool_count > 0
       ORDER BY catalog_id`,
    );
    const flossInventoryRows = await queryRows(
      client,
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

    return {
      initializedResources: revisionRows.map((row) => row.resource),
      revisions,
      workTasks: workTaskRows.map((item) => ({
        id: item.id,
        title: item.title,
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
          lists: todoListRows.map((list) => ({
            id: list.id,
            title: list.title,
            color: list.color,
            tasks: todoItemsByList.get(list.id) ?? [],
          })),
        },
        shopping: {
          tasks: shoppingRows.map((item) => ({
            id: item.id,
            title: item.title,
            ...(item.productLink && { productLink: item.productLink }),
            ...completion(item.completedAt),
          })),
        },
        printing: {
          projects: printingProjectRows.map((project) => ({
            ...project,
            tasks: printingItemsByProject.get(project.id) ?? [],
          })),
        },
        crossStitch: {
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

async function upsertRows(client, table, columns, rows, { keys = ["id"], updatedAt = true, preserve = [] } = {}) {
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

async function replaceWorkTasks(client, tasks) {
  await upsertRows(
    client,
    "work_tasks",
    ["id", "title", "scheduled_for", "completed_at", "position"],
    tasks.map((task, position) => [task.id, task.title, task.date, task.checkedAt, position]),
  );
  await deleteMissing(
    client,
    "work_tasks",
    "id",
    tasks.map((task) => task.id),
  );
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
  await deleteMissing(
    client,
    "todo_items",
    "id",
    items.map((item) => item[0]),
  );
  await deleteMissing(
    client,
    "todo_lists",
    "id",
    data.lists.map((list) => list.id),
  );
}

async function replaceShopping(client, data) {
  await upsertRows(
    client,
    "manual_shopping_items",
    ["id", "title", "product_url", "completed_at", "position"],
    data.tasks.map((item, position) => [item.id, item.title, item.productLink, item.completedAt, position]),
  );
  await deleteMissing(
    client,
    "manual_shopping_items",
    "id",
    data.tasks.map((item) => item.id),
  );
}

async function replacePrinting(client, data) {
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

async function replaceCrossStitch(client, data) {
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

async function replaceResource(pool, resource, data, expectedRevision) {
  return transaction(pool, "", async (client) => {
    await client.query({
      text: `INSERT INTO app_data_revisions (resource, revision)
             VALUES ($1, 0)
             ON CONFLICT (resource) DO NOTHING`,
      values: [resource],
    });
    const revisionRows = await queryRows(
      client,
      `SELECT revision
       FROM app_data_revisions
       WHERE resource = $1
       FOR UPDATE`,
      [resource],
    );
    const currentRevision = revisionRows[0].revision;
    if (currentRevision !== expectedRevision) {
      throw new AppDataRevisionConflictError(resource, expectedRevision, currentRevision);
    }

    await WRITERS[resource](client, data);
    const updatedRows = await queryRows(
      client,
      `UPDATE app_data_revisions
       SET revision = revision + 1, updated_at = now()
       WHERE resource = $1
       RETURNING revision`,
      [resource],
    );
    return updatedRows[0].revision;
  });
}

export function createAppDataRepository(pool) {
  return {
    read: () => readAppData(pool),
    replace: (resource, data, expectedRevision) => replaceResource(pool, resource, data, expectedRevision),
  };
}
