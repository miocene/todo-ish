import { APP_DATA_RESOURCES } from "./app-data-validation.mjs";

export class AppDataRevisionConflictError extends Error {
  constructor(resource, expectedRevision, currentRevision) {
    super(`The ${resource} data changed after revision ${expectedRevision}`);
    this.resource = resource;
    this.expectedRevision = expectedRevision;
    this.currentRevision = currentRevision;
  }
}

const timestamp = (value) => (value instanceof Date ? value.toISOString() : value || null);

function completion(completedAt) {
  const normalized = timestamp(completedAt);
  return {
    completed: Boolean(normalized),
    ...(normalized && { completedAt: normalized }),
  };
}

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
    const choreRows = await queryRows(
      client,
      `SELECT
         chores.id,
         chores.title,
         chores.schedule_description AS details,
         occurrence.due_on::text AS "nextDue",
         occurrence.completed_at AS "completedAt",
         occurrence.position AS "occurrencePosition"
       FROM chores
       LEFT JOIN LATERAL (
         SELECT due_on, completed_at, position
         FROM chore_occurrences
         WHERE chore_id = chores.id
         ORDER BY due_on DESC
         LIMIT 1
       ) AS occurrence ON true
       WHERE chores.enabled
       ORDER BY chores.position, chores.created_at, chores.id`,
    );
    const todoListRows = await queryRows(
      client,
      `SELECT id, title
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
      pages: {
        chores: {
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
              nextDue: row.nextDue,
              ...completion(row.completedAt),
            })),
        },
        todos: {
          lists: todoListRows.map((list) => ({
            id: list.id,
            title: list.title,
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

async function replaceWorkTasks(client, tasks) {
  for (const [position, task] of tasks.entries()) {
    await client.query({
      text: `INSERT INTO work_tasks (id, title, scheduled_for, completed_at, position)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (id) DO UPDATE SET
               title = EXCLUDED.title,
               scheduled_for = EXCLUDED.scheduled_for,
               completed_at = EXCLUDED.completed_at,
               position = EXCLUDED.position,
               updated_at = now()`,
      values: [task.id, task.title, task.date, task.checkedAt, position],
    });
  }
  await deleteMissing(
    client,
    "work_tasks",
    "id",
    tasks.map((task) => task.id),
  );
}

async function replaceWorkStatuses(client, statuses) {
  await client.query("DELETE FROM work_day_statuses");
  for (const [workDate, status] of Object.entries(statuses)) {
    await client.query({
      text: `INSERT INTO work_day_statuses (work_date, status)
             VALUES ($1, $2)`,
      values: [workDate, status],
    });
  }
}

async function replaceChores(client, data) {
  const occurrencePosition = new Map(data.occurrenceOrder.map((id, position) => [id, position]));
  for (const [position, chore] of data.tasks.entries()) {
    await client.query({
      text: `INSERT INTO chores (id, title, schedule_description, enabled, position)
             VALUES ($1, $2, $3, true, $4)
             ON CONFLICT (id) DO UPDATE SET
               title = EXCLUDED.title,
               schedule_description = EXCLUDED.schedule_description,
               enabled = true,
               position = EXCLUDED.position,
               updated_at = now()`,
      values: [chore.id, chore.title, chore.details, position],
    });
    await client.query({
      text: `INSERT INTO chore_occurrences (chore_id, due_on, completed_at, position)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (chore_id, due_on) DO UPDATE SET
               completed_at = EXCLUDED.completed_at,
               position = EXCLUDED.position`,
      values: [chore.id, chore.nextDue, chore.completedAt, occurrencePosition.get(chore.id) ?? position],
    });
  }
  await deleteMissing(
    client,
    "chores",
    "id",
    data.tasks.map((chore) => chore.id),
  );
}

async function replaceTodos(client, data) {
  const itemIds = [];
  for (const [listPosition, list] of data.lists.entries()) {
    await client.query({
      text: `INSERT INTO todo_lists (id, title, position)
             VALUES ($1, $2, $3)
             ON CONFLICT (id) DO UPDATE SET
               title = EXCLUDED.title,
               position = EXCLUDED.position,
               updated_at = now()`,
      values: [list.id, list.title, listPosition],
    });
    for (const [itemPosition, item] of list.tasks.entries()) {
      itemIds.push(item.id);
      await client.query({
        text: `INSERT INTO todo_items (id, list_id, title, completed_at, position)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (id) DO UPDATE SET
                 list_id = EXCLUDED.list_id,
                 title = EXCLUDED.title,
                 completed_at = EXCLUDED.completed_at,
                 position = EXCLUDED.position,
                 updated_at = now()`,
        values: [item.id, list.id, item.title, item.completedAt, itemPosition],
      });
    }
  }
  await deleteMissing(client, "todo_items", "id", itemIds);
  await deleteMissing(
    client,
    "todo_lists",
    "id",
    data.lists.map((list) => list.id),
  );
}

async function replaceShopping(client, data) {
  for (const [position, item] of data.tasks.entries()) {
    await client.query({
      text: `INSERT INTO manual_shopping_items (id, title, product_url, completed_at, position)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (id) DO UPDATE SET
               title = EXCLUDED.title,
               product_url = EXCLUDED.product_url,
               completed_at = EXCLUDED.completed_at,
               position = EXCLUDED.position,
               updated_at = now()`,
      values: [item.id, item.title, item.productLink, item.completedAt, position],
    });
  }
  await deleteMissing(
    client,
    "manual_shopping_items",
    "id",
    data.tasks.map((item) => item.id),
  );
}

async function replacePrinting(client, data) {
  const itemIds = [];
  const usageIds = [];
  for (const [projectPosition, project] of data.projects.entries()) {
    await client.query({
      text: `INSERT INTO printing_projects (id, title, color, description, position)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (id) DO UPDATE SET
               title = EXCLUDED.title,
               color = EXCLUDED.color,
               description = EXCLUDED.description,
               position = EXCLUDED.position,
               updated_at = now()`,
      values: [project.id, project.title, project.color, project.description, projectPosition],
    });
    for (const [itemPosition, item] of project.tasks.entries()) {
      itemIds.push(item.id);
      await client.query({
        text: `INSERT INTO printing_items (id, project_id, title, completed_at, position)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (id) DO UPDATE SET
                 project_id = EXCLUDED.project_id,
                 title = EXCLUDED.title,
                 completed_at = EXCLUDED.completed_at,
                 position = EXCLUDED.position,
                 updated_at = now()`,
        values: [item.id, project.id, item.title, item.completedAt, itemPosition],
      });
      for (const [usagePosition, usage] of item.filaments.entries()) {
        usageIds.push(usage.id);
        await client.query({
          text: `INSERT INTO printing_item_filaments
                   (id, printing_item_id, catalog_id, fallback_label, weight_grams, position)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (id) DO UPDATE SET
                   printing_item_id = EXCLUDED.printing_item_id,
                   catalog_id = EXCLUDED.catalog_id,
                   fallback_label = EXCLUDED.fallback_label,
                   weight_grams = EXCLUDED.weight_grams,
                   position = EXCLUDED.position`,
          values: [usage.id, item.id, usage.catalogId, usage.label, usage.weightGrams, usagePosition],
        });
      }
    }
  }
  await deleteMissing(client, "printing_item_filaments", "id", usageIds);
  await deleteMissing(client, "printing_items", "id", itemIds);
  await deleteMissing(
    client,
    "printing_projects",
    "id",
    data.projects.map((project) => project.id),
  );
}

async function replaceCrossStitch(client, data) {
  const threadIds = [];
  for (const [projectPosition, project] of data.projects.entries()) {
    await client.query({
      text: `INSERT INTO stitch_projects (id, title, color, description, position)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (id) DO UPDATE SET
               title = EXCLUDED.title,
               color = EXCLUDED.color,
               description = EXCLUDED.description,
               position = EXCLUDED.position,
               updated_at = now()`,
      values: [project.id, project.title, project.color, project.description, projectPosition],
    });
    for (const [threadPosition, thread] of project.tasks.entries()) {
      threadIds.push(thread.id);
      await client.query({
        text: `INSERT INTO stitch_project_threads
                 (id, project_id, floss_catalog_id, fallback_label, required_skeins, total_crosses,
                  completed_crosses, completed_at, position)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
               ON CONFLICT (id) DO UPDATE SET
                 project_id = EXCLUDED.project_id,
                 floss_catalog_id = EXCLUDED.floss_catalog_id,
                 fallback_label = EXCLUDED.fallback_label,
                 required_skeins = EXCLUDED.required_skeins,
                 total_crosses = EXCLUDED.total_crosses,
                 completed_crosses = EXCLUDED.completed_crosses,
                 completed_at = EXCLUDED.completed_at,
                 position = EXCLUDED.position,
                 updated_at = now()`,
        values: [
          thread.id,
          project.id,
          thread.flossId,
          thread.title,
          thread.requiredSkeins,
          thread.crosses,
          thread.crossesDone,
          thread.completedAt,
          threadPosition,
        ],
      });
    }
  }
  await deleteMissing(client, "stitch_project_threads", "id", threadIds);
  await deleteMissing(
    client,
    "stitch_projects",
    "id",
    data.projects.map((project) => project.id),
  );
}

async function replaceInventory(client, table, countColumn, inventory) {
  await client.query(`DELETE FROM ${table}`);
  for (const [catalogId, count] of Object.entries(inventory)) {
    await client.query({
      text: `INSERT INTO ${table} (catalog_id, ${countColumn}) VALUES ($1, $2)`,
      values: [catalogId, count],
    });
  }
}

const WRITERS = Object.freeze({
  "work-tasks": replaceWorkTasks,
  "work-statuses": replaceWorkStatuses,
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
