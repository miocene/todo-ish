import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  pgPolicy,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const orderedEntityColumns = () => ({
  position: integer("position").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

const completionColumns = () => ({
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const appDataRevisions = pgTable(
  "app_data_revisions",
  {
    scope: text("scope").notNull(),
    resource: text("resource").notNull(),
    revision: integer("revision").default(0).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.scope, table.resource] }),
    check(
      "app_data_revisions_scope_valid",
      sql`(${table.resource} IN ('chores', 'shopping', 'filament-inventory', 'floss-inventory') AND ${table.scope} = '') OR (${table.resource} NOT IN ('chores', 'shopping', 'filament-inventory', 'floss-inventory') AND ${table.scope} <> '')`,
    ),
    pgPolicy("revisions_access", {
      for: "all",
      using: sql`${table.scope} = '' OR ${table.scope} = nullif(current_setting('app.user_id', true), '')`,
      withCheck: sql`${table.scope} = '' OR ${table.scope} = nullif(current_setting('app.user_id', true), '')`,
    }),
    check(
      "app_data_revisions_resource_valid",
      sql`${table.resource} IN ('work-tasks', 'work-statuses', 'colors', 'chores', 'todos', 'shopping', 'printing', 'cross-stitch', 'filament-inventory', 'floss-inventory', 'preferences')`,
    ),
    check("app_data_revisions_revision_non_negative", sql`${table.revision} >= 0`),
  ],
).enableRLS();

export const colors = pgTable(
  "colors",
  {
    userId: userColumn(),
    id: text("id").notNull(),
    color: text("color").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.id] }),
    userPolicy("colors", table.userId),
    check("colors_id_not_blank", sql`length(trim(${table.id})) > 0`),
    check("colors_color_format", sql`${table.color} ~ '^#[0-9A-Fa-f]{6}$'`),
  ],
).enableRLS();

export const authUsers = pgTable(
  "auth_users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("auth_users_id_not_blank", sql`length(trim(${table.id})) > 0`),
    check("auth_users_username_not_blank", sql`length(trim(${table.username})) > 0`),
    check("auth_users_display_name_not_blank", sql`length(trim(${table.displayName})) > 0`),
    uniqueIndex("auth_users_username_unique").on(table.username),
  ],
);

export const passkeyCredentials = pgTable(
  "passkey_credentials",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    publicKey: text("public_key").notNull(),
    counter: bigint("counter", { mode: "number" }).default(0).notNull(),
    deviceType: text("device_type").notNull(),
    backedUp: boolean("backed_up").default(false).notNull(),
    transports: text("transports").array().notNull(),
    aaguid: text("aaguid").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (table) => [
    check("passkey_credentials_id_not_blank", sql`length(trim(${table.id})) > 0`),
    check("passkey_credentials_public_key_not_blank", sql`length(trim(${table.publicKey})) > 0`),
    check("passkey_credentials_device_type_valid", sql`${table.deviceType} IN ('singleDevice', 'multiDevice')`),
    check("passkey_credentials_counter_non_negative", sql`${table.counter} >= 0`),
    index("passkey_credentials_user_id_idx").on(table.userId),
  ],
);

export const authChallenges = pgTable(
  "auth_challenges",
  {
    tokenHash: text("token_hash").primaryKey(),
    challenge: text("challenge").notNull(),
    ceremony: text("ceremony").notNull(),
    userHandle: text("user_handle"),
    setupCodeHash: text("setup_code_hash"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("auth_challenges_token_hash_not_blank", sql`length(trim(${table.tokenHash})) > 0`),
    check("auth_challenges_challenge_not_blank", sql`length(trim(${table.challenge})) > 0`),
    check("auth_challenges_ceremony_valid", sql`${table.ceremony} IN ('registration', 'authentication')`),
    index("auth_challenges_expires_at_idx").on(table.expiresAt),
  ],
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("auth_sessions_token_hash_not_blank", sql`length(trim(${table.tokenHash})) > 0`),
    index("auth_sessions_user_id_idx").on(table.userId),
    index("auth_sessions_expires_at_idx").on(table.expiresAt),
  ],
);

function userColumn() {
  return text("user_id")
    .notNull()
    .default(sql`nullif(current_setting('app.user_id', true), '')`)
    .references(() => authUsers.id, { onDelete: "cascade" });
}
function userPolicy(name, column) {
  return pgPolicy(`${name}_user_access`, {
    for: "all",
    using: sql`${column} = nullif(current_setting('app.user_id', true), '')`,
    withCheck: sql`${column} = nullif(current_setting('app.user_id', true), '')`,
  });
}

export const userPreferences = pgTable(
  "user_preferences",
  {
    userId: userColumn().primaryKey(),
    hiddenNavigation: text("hidden_navigation")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
  },
  (table) => [userPolicy("user_preferences", table.userId)],
).enableRLS();

export const workTasks = pgTable(
  "work_tasks",
  {
    userId: userColumn(),
    id: text("id").notNull(),
    title: text("title").notNull(),
    scheduledFor: date("scheduled_for"),
    archived: boolean("archived").default(false).notNull(),
    ...completionColumns(),
    ...orderedEntityColumns(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.id] }),
    userPolicy("work_tasks", table.userId),
    check("work_tasks_id_not_blank", sql`length(trim(${table.id})) > 0`),
    check("work_tasks_title_not_blank", sql`length(trim(${table.title})) > 0`),
    check("work_tasks_position_non_negative", sql`${table.position} >= 0`),
    index("work_tasks_scheduled_for_position_idx").on(table.scheduledFor, table.position),
    index("work_tasks_completed_at_idx").on(table.completedAt),
  ],
).enableRLS();

export const workDayStatuses = pgTable(
  "work_day_statuses",
  {
    userId: userColumn(),
    workDate: date("work_date").notNull(),
    status: text("status").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.workDate] }),
    userPolicy("work_day_statuses", table.userId),
    check(
      "work_day_statuses_status_valid",
      sql`${table.status} IN ('work', 'pto', 'sick-leave', 'holiday', 'business-trip', 'weekend', 'conference')`,
    ),
  ],
).enableRLS();

export const todoLists = pgTable(
  "todo_lists",
  {
    userId: userColumn(),
    id: text("id").notNull(),
    title: text("title").notNull(),
    color: text("color"),
    ...orderedEntityColumns(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.id] }),
    userPolicy("todo_lists", table.userId),
    check("todo_lists_id_not_blank", sql`length(trim(${table.id})) > 0`),
    check("todo_lists_title_not_blank", sql`length(trim(${table.title})) > 0`),
    check("todo_lists_color_format", sql`${table.color} ~ '^#[0-9A-Fa-f]{6}$'`),
    check("todo_lists_position_non_negative", sql`${table.position} >= 0`),
  ],
).enableRLS();

export const todoItems = pgTable(
  "todo_items",
  {
    userId: userColumn(),
    id: text("id").notNull(),
    listId: text("list_id"),
    title: text("title").notNull(),
    ...completionColumns(),
    ...orderedEntityColumns(),
  },
  (table) => [
    foreignKey({ columns: [table.userId, table.listId], foreignColumns: [todoLists.userId, todoLists.id] }).onDelete(
      "cascade",
    ),
    primaryKey({ columns: [table.userId, table.id] }),
    userPolicy("todo_items", table.userId),
    check("todo_items_id_not_blank", sql`length(trim(${table.id})) > 0`),
    check("todo_items_title_not_blank", sql`length(trim(${table.title})) > 0`),
    check("todo_items_position_non_negative", sql`${table.position} >= 0`),
    index("todo_items_list_position_idx").on(table.listId, table.position),
    index("todo_items_completed_at_idx").on(table.completedAt),
  ],
).enableRLS();

export const chores = pgTable(
  "chores",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    scheduleDescription: text("schedule_description").notNull(),
    schedule: jsonb("schedule"),
    nextDueOn: date("next_due_on"),
    enabled: boolean("enabled").default(true).notNull(),
    ...orderedEntityColumns(),
  },
  (table) => [
    check("chores_id_not_blank", sql`length(trim(${table.id})) > 0`),
    check("chores_title_not_blank", sql`length(trim(${table.title})) > 0`),
    check("chores_schedule_not_blank", sql`length(trim(${table.scheduleDescription})) > 0`),
    check("chores_position_non_negative", sql`${table.position} >= 0`),
  ],
);

export const choreOccurrences = pgTable(
  "chore_occurrences",
  {
    choreId: text("chore_id")
      .notNull()
      .references(() => chores.id, { onDelete: "cascade" }),
    dueOn: date("due_on").notNull(),
    ...completionColumns(),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.choreId, table.dueOn] }),
    check("chore_occurrences_position_non_negative", sql`${table.position} >= 0`),
    index("chore_occurrences_due_position_idx").on(table.dueOn, table.position),
    index("chore_occurrences_completed_at_idx").on(table.completedAt),
  ],
);

export const manualShoppingItems = pgTable(
  "manual_shopping_items",
  {
    scope: text("scope").notNull(),
    id: text("id").notNull(),
    title: text("title").notNull(),
    productUrl: text("product_url"),
    source: text("source"),
    catalogId: text("catalog_id"),
    quantity: integer("quantity"),
    archived: boolean("archived").default(false).notNull(),
    ...completionColumns(),
    ...orderedEntityColumns(),
  },
  (table) => [
    primaryKey({ columns: [table.scope, table.id] }),
    check(
      "shopping_scope_source_valid",
      sql`(${table.source} IS NULL AND ${table.scope} = '') OR (${table.source} IS NOT NULL AND ${table.scope} <> '')`,
    ),
    pgPolicy("shopping_access", {
      for: "all",
      using: sql`${table.scope} = '' OR ${table.scope} = nullif(current_setting('app.user_id', true), '')`,
      withCheck: sql`${table.scope} = '' OR ${table.scope} = nullif(current_setting('app.user_id', true), '')`,
    }),
    check("manual_shopping_items_id_not_blank", sql`length(trim(${table.id})) > 0`),
    check("manual_shopping_items_title_not_blank", sql`length(trim(${table.title})) > 0`),
    check("manual_shopping_items_position_non_negative", sql`${table.position} >= 0`),
    index("manual_shopping_items_completed_at_idx").on(table.completedAt),
  ],
).enableRLS();

export const printingProjects = pgTable(
  "printing_projects",
  {
    userId: userColumn(),
    id: text("id").notNull(),
    title: text("title").notNull(),
    color: text("color").notNull(),
    description: text("description").default("").notNull(),
    ...orderedEntityColumns(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.id] }),
    userPolicy("printing_projects", table.userId),
    check("printing_projects_id_not_blank", sql`length(trim(${table.id})) > 0`),
    check("printing_projects_title_not_blank", sql`length(trim(${table.title})) > 0`),
    check("printing_projects_color_format", sql`${table.color} ~ '^#[0-9A-Fa-f]{6}$'`),
    check("printing_projects_position_non_negative", sql`${table.position} >= 0`),
  ],
).enableRLS();

export const printingItems = pgTable(
  "printing_items",
  {
    userId: userColumn(),
    id: text("id").notNull(),
    projectId: text("project_id").notNull(),
    title: text("title").notNull(),
    ...completionColumns(),
    ...orderedEntityColumns(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId, table.projectId],
      foreignColumns: [printingProjects.userId, printingProjects.id],
    }).onDelete("cascade"),
    primaryKey({ columns: [table.userId, table.id] }),
    userPolicy("printing_items", table.userId),
    check("printing_items_id_not_blank", sql`length(trim(${table.id})) > 0`),
    check("printing_items_title_not_blank", sql`length(trim(${table.title})) > 0`),
    check("printing_items_position_non_negative", sql`${table.position} >= 0`),
    index("printing_items_project_position_idx").on(table.projectId, table.position),
    index("printing_items_completed_at_idx").on(table.completedAt),
  ],
).enableRLS();

export const printingItemFilaments = pgTable(
  "printing_item_filaments",
  {
    userId: userColumn(),
    id: text("id").notNull(),
    printingItemId: text("printing_item_id").notNull(),
    catalogId: text("catalog_id"),
    fallbackLabel: text("fallback_label"),
    weightGrams: numeric("weight_grams", { precision: 10, scale: 2, mode: "number" }),
    position: integer("position").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId, table.printingItemId],
      foreignColumns: [printingItems.userId, printingItems.id],
    }).onDelete("cascade"),
    primaryKey({ columns: [table.userId, table.id] }),
    userPolicy("printing_item_filaments", table.userId),
    check("printing_item_filaments_id_not_blank", sql`length(trim(${table.id})) > 0`),
    check(
      "printing_item_filaments_catalog_id_not_blank",
      sql`${table.catalogId} IS NULL OR length(trim(${table.catalogId})) > 0`,
    ),
    check(
      "printing_item_filaments_weight_non_negative",
      sql`${table.weightGrams} IS NULL OR ${table.weightGrams} >= 0`,
    ),
    check("printing_item_filaments_position_non_negative", sql`${table.position} >= 0`),
    index("printing_item_filaments_item_position_idx").on(table.printingItemId, table.position),
    index("printing_item_filaments_catalog_id_idx").on(table.catalogId),
  ],
).enableRLS();

export const stitchProjects = pgTable(
  "stitch_projects",
  {
    userId: userColumn(),
    id: text("id").notNull(),
    title: text("title").notNull(),
    color: text("color").notNull(),
    description: text("description").default("").notNull(),
    ...orderedEntityColumns(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.id] }),
    userPolicy("stitch_projects", table.userId),
    check("stitch_projects_id_not_blank", sql`length(trim(${table.id})) > 0`),
    check("stitch_projects_title_not_blank", sql`length(trim(${table.title})) > 0`),
    check("stitch_projects_color_format", sql`${table.color} ~ '^#[0-9A-Fa-f]{6}$'`),
    check("stitch_projects_position_non_negative", sql`${table.position} >= 0`),
  ],
).enableRLS();

export const stitchProjectThreads = pgTable(
  "stitch_project_threads",
  {
    userId: userColumn(),
    id: text("id").notNull(),
    projectId: text("project_id").notNull(),
    flossCatalogId: text("floss_catalog_id"),
    fallbackLabel: text("fallback_label"),
    requiredSkeins: integer("required_skeins").default(1).notNull(),
    totalCrosses: integer("total_crosses").default(0).notNull(),
    completedCrosses: integer("completed_crosses").default(0).notNull(),
    ...completionColumns(),
    ...orderedEntityColumns(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId, table.projectId],
      foreignColumns: [stitchProjects.userId, stitchProjects.id],
    }).onDelete("cascade"),
    primaryKey({ columns: [table.userId, table.id] }),
    userPolicy("stitch_project_threads", table.userId),
    check("stitch_project_threads_id_not_blank", sql`length(trim(${table.id})) > 0`),
    check(
      "stitch_project_threads_floss_id_not_blank",
      sql`${table.flossCatalogId} IS NULL OR length(trim(${table.flossCatalogId})) > 0`,
    ),
    check("stitch_project_threads_required_skeins_non_negative", sql`${table.requiredSkeins} >= 0`),
    check("stitch_project_threads_total_crosses_non_negative", sql`${table.totalCrosses} >= 0`),
    check("stitch_project_threads_completed_crosses_non_negative", sql`${table.completedCrosses} >= 0`),
    check("stitch_project_threads_completed_crosses_bounded", sql`${table.completedCrosses} <= ${table.totalCrosses}`),
    check("stitch_project_threads_position_non_negative", sql`${table.position} >= 0`),
    index("stitch_project_threads_project_position_idx").on(table.projectId, table.position),
    index("stitch_project_threads_floss_catalog_id_idx").on(table.flossCatalogId),
    index("stitch_project_threads_completed_at_idx").on(table.completedAt),
  ],
).enableRLS();

export const filamentInventory = pgTable(
  "filament_inventory",
  {
    catalogId: text("catalog_id").primaryKey(),
    spoolCount: integer("spool_count").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("filament_inventory_catalog_id_not_blank", sql`length(trim(${table.catalogId})) > 0`),
    check("filament_inventory_spool_count_non_negative", sql`${table.spoolCount} >= 0`),
  ],
);

export const flossInventory = pgTable(
  "floss_inventory",
  {
    catalogId: text("catalog_id").primaryKey(),
    skeinCount: integer("skein_count").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("floss_inventory_catalog_id_not_blank", sql`length(trim(${table.catalogId})) > 0`),
    check("floss_inventory_skein_count_non_negative", sql`${table.skeinCount} >= 0`),
  ],
);

export const completedProjectTasks = pgTable(
  "completed_project_tasks",
  {
    userId: userColumn(),
    resource: text("resource").notNull(),
    id: text("id").notNull(),
    title: text("title").notNull(),
    context: text("context").default("").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.resource, table.id] }),
    userPolicy("completed_project_tasks", table.userId),
    check("completed_project_tasks_resource_valid", sql`${table.resource} IN ('printing', 'cross-stitch')`),
  ],
).enableRLS();

export const authSetupCodes = pgTable("auth_setup_codes", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
