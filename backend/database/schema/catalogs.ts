import { sql } from "drizzle-orm";
import { char, check, index, integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

const snapshotColumns = () => ({
  id: uuid("id").defaultRandom().primaryKey(),
  source: text("source").notNull(),
  contentSha256: char("content_sha256", { length: 64 }).notNull().unique(),
  entryCount: integer("entry_count").notNull(),
  importedAt: timestamp("imported_at", { withTimezone: true }).defaultNow().notNull(),
});

export const filamentCatalogSnapshots = pgTable("filament_catalog_snapshots", snapshotColumns(), (table) => [
  check("filament_catalog_snapshots_source_not_blank", sql`length(trim(${table.source})) > 0`),
  check("filament_catalog_snapshots_entry_count_positive", sql`${table.entryCount} > 0`),
  check("filament_catalog_snapshots_sha256_format", sql`${table.contentSha256} ~ '^[0-9a-f]{64}$'`),
  index("filament_catalog_snapshots_imported_at_idx").on(table.importedAt.desc()),
]);

export const filamentCatalogEntries = pgTable(
  "filament_catalog_entries",
  {
    snapshotId: uuid("snapshot_id")
      .notNull()
      .references(() => filamentCatalogSnapshots.id, { onDelete: "cascade" }),
    catalogId: text("catalog_id").notNull(),
    family: text("family").notNull(),
    colorName: text("color_name").notNull(),
    productCode: text("product_code"),
    swatch: text("swatch").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.snapshotId, table.catalogId] }),
    check("filament_catalog_entries_catalog_id_not_blank", sql`length(trim(${table.catalogId})) > 0`),
    check("filament_catalog_entries_family_not_blank", sql`length(trim(${table.family})) > 0`),
    check("filament_catalog_entries_color_name_not_blank", sql`length(trim(${table.colorName})) > 0`),
    check("filament_catalog_entries_swatch_not_blank", sql`length(trim(${table.swatch})) > 0`),
    index("filament_catalog_entries_catalog_id_idx").on(table.catalogId),
    index("filament_catalog_entries_family_idx").on(table.family),
  ],
);

export const flossCatalogSnapshots = pgTable("floss_catalog_snapshots", snapshotColumns(), (table) => [
  check("floss_catalog_snapshots_source_not_blank", sql`length(trim(${table.source})) > 0`),
  check("floss_catalog_snapshots_entry_count_positive", sql`${table.entryCount} > 0`),
  check("floss_catalog_snapshots_sha256_format", sql`${table.contentSha256} ~ '^[0-9a-f]{64}$'`),
  index("floss_catalog_snapshots_imported_at_idx").on(table.importedAt.desc()),
]);

export const flossCatalogEntries = pgTable(
  "floss_catalog_entries",
  {
    snapshotId: uuid("snapshot_id")
      .notNull()
      .references(() => flossCatalogSnapshots.id, { onDelete: "cascade" }),
    catalogId: text("catalog_id").notNull(),
    number: text("number").notNull(),
    colorName: text("color_name").notNull(),
    colorHex: char("color_hex", { length: 7 }).notNull(),
    purchaseUrl: text("purchase_url"),
  },
  (table) => [
    primaryKey({ columns: [table.snapshotId, table.catalogId] }),
    check("floss_catalog_entries_catalog_id_not_blank", sql`length(trim(${table.catalogId})) > 0`),
    check("floss_catalog_entries_number_not_blank", sql`length(trim(${table.number})) > 0`),
    check("floss_catalog_entries_color_name_not_blank", sql`length(trim(${table.colorName})) > 0`),
    check("floss_catalog_entries_color_hex_format", sql`${table.colorHex} ~ '^#[0-9A-F]{6}$'`),
    index("floss_catalog_entries_catalog_id_idx").on(table.catalogId),
    index("floss_catalog_entries_number_idx").on(table.number),
  ],
);
