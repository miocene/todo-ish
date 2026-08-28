import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
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
    resource: text("resource").primaryKey(),
    revision: integer("revision").default(0).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "app_data_revisions_resource_valid",
      sql`${table.resource} IN ('work-tasks', 'work-statuses', 'chores', 'todos', 'shopping', 'printing', 'cross-stitch', 'filament-inventory', 'floss-inventory')`,
    ),
    check("app_data_revisions_revision_non_negative", sql`${table.revision} >= 0`),
  ],
);

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

export const workTasks = pgTable(
  "work_tasks",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    scheduledFor: date("scheduled_for"),
    ...completionColumns(),
    ...orderedEntityColumns(),
  },
  (table) => [
    check("work_tasks_id_not_blank", sql`length(trim(${table.id})) > 0`),
    check("work_tasks_title_not_blank", sql`length(trim(${table.title})) > 0`),
    check("work_tasks_position_non_negative", sql`${table.position} >= 0`),
    index("work_tasks_scheduled_for_position_idx").on(table.scheduledFor, table.position),
    index("work_tasks_completed_at_idx").on(table.completedAt),
  ],
);

export const workDayStatuses = pgTable(
  "work_day_statuses",
  {
    workDate: date("work_date").primaryKey(),
    status: text("status").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "work_day_statuses_status_valid",
      sql`${table.status} IN ('work', 'pto', 'sick-leave', 'holiday', 'business-trip', 'weekend', 'conference')`,
    ),
  ],
);

export const todoLists = pgTable(
  "todo_lists",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    ...orderedEntityColumns(),
  },
  (table) => [
    check("todo_lists_id_not_blank", sql`length(trim(${table.id})) > 0`),
    check("todo_lists_title_not_blank", sql`length(trim(${table.title})) > 0`),
    check("todo_lists_position_non_negative", sql`${table.position} >= 0`),
  ],
);

export const todoItems = pgTable(
  "todo_items",
  {
    id: text("id").primaryKey(),
    listId: text("list_id")
      .notNull()
      .references(() => todoLists.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    ...completionColumns(),
    ...orderedEntityColumns(),
  },
  (table) => [
    check("todo_items_id_not_blank", sql`length(trim(${table.id})) > 0`),
    check("todo_items_title_not_blank", sql`length(trim(${table.title})) > 0`),
    check("todo_items_position_non_negative", sql`${table.position} >= 0`),
    index("todo_items_list_position_idx").on(table.listId, table.position),
    index("todo_items_completed_at_idx").on(table.completedAt),
  ],
);

export const chores = pgTable(
  "chores",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    scheduleDescription: text("schedule_description").notNull(),
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
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    productUrl: text("product_url"),
    ...completionColumns(),
    ...orderedEntityColumns(),
  },
  (table) => [
    check("manual_shopping_items_id_not_blank", sql`length(trim(${table.id})) > 0`),
    check("manual_shopping_items_title_not_blank", sql`length(trim(${table.title})) > 0`),
    check("manual_shopping_items_position_non_negative", sql`${table.position} >= 0`),
    index("manual_shopping_items_completed_at_idx").on(table.completedAt),
  ],
);

export const printingProjects = pgTable(
  "printing_projects",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    color: text("color").notNull(),
    description: text("description").default("").notNull(),
    ...orderedEntityColumns(),
  },
  (table) => [
    check("printing_projects_id_not_blank", sql`length(trim(${table.id})) > 0`),
    check("printing_projects_title_not_blank", sql`length(trim(${table.title})) > 0`),
    check("printing_projects_color_format", sql`${table.color} ~ '^#[0-9A-Fa-f]{6}$'`),
    check("printing_projects_position_non_negative", sql`${table.position} >= 0`),
  ],
);

export const printingItems = pgTable(
  "printing_items",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => printingProjects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    ...completionColumns(),
    ...orderedEntityColumns(),
  },
  (table) => [
    check("printing_items_id_not_blank", sql`length(trim(${table.id})) > 0`),
    check("printing_items_title_not_blank", sql`length(trim(${table.title})) > 0`),
    check("printing_items_position_non_negative", sql`${table.position} >= 0`),
    index("printing_items_project_position_idx").on(table.projectId, table.position),
    index("printing_items_completed_at_idx").on(table.completedAt),
  ],
);

export const printingItemFilaments = pgTable(
  "printing_item_filaments",
  {
    id: text("id").primaryKey(),
    printingItemId: text("printing_item_id")
      .notNull()
      .references(() => printingItems.id, { onDelete: "cascade" }),
    catalogId: text("catalog_id"),
    fallbackLabel: text("fallback_label"),
    weightGrams: numeric("weight_grams", { precision: 10, scale: 2, mode: "number" }),
    position: integer("position").notNull(),
  },
  (table) => [
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
);

export const stitchProjects = pgTable(
  "stitch_projects",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    color: text("color").notNull(),
    description: text("description").default("").notNull(),
    ...orderedEntityColumns(),
  },
  (table) => [
    check("stitch_projects_id_not_blank", sql`length(trim(${table.id})) > 0`),
    check("stitch_projects_title_not_blank", sql`length(trim(${table.title})) > 0`),
    check("stitch_projects_color_format", sql`${table.color} ~ '^#[0-9A-Fa-f]{6}$'`),
    check("stitch_projects_position_non_negative", sql`${table.position} >= 0`),
  ],
);

export const stitchProjectThreads = pgTable(
  "stitch_project_threads",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => stitchProjects.id, { onDelete: "cascade" }),
    flossCatalogId: text("floss_catalog_id"),
    fallbackLabel: text("fallback_label"),
    requiredSkeins: integer("required_skeins").default(1).notNull(),
    totalCrosses: integer("total_crosses").default(0).notNull(),
    completedCrosses: integer("completed_crosses").default(0).notNull(),
    ...completionColumns(),
    ...orderedEntityColumns(),
  },
  (table) => [
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
);

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
