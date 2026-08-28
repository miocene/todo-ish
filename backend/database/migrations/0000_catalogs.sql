CREATE TABLE "filament_catalog_entries" (
	"snapshot_id" uuid NOT NULL,
	"catalog_id" text NOT NULL,
	"family" text NOT NULL,
	"color_name" text NOT NULL,
	"product_code" text,
	"swatch" text NOT NULL,
	CONSTRAINT "filament_catalog_entries_snapshot_id_catalog_id_pk" PRIMARY KEY("snapshot_id","catalog_id"),
	CONSTRAINT "filament_catalog_entries_catalog_id_not_blank" CHECK (length(trim("filament_catalog_entries"."catalog_id")) > 0),
	CONSTRAINT "filament_catalog_entries_family_not_blank" CHECK (length(trim("filament_catalog_entries"."family")) > 0),
	CONSTRAINT "filament_catalog_entries_color_name_not_blank" CHECK (length(trim("filament_catalog_entries"."color_name")) > 0),
	CONSTRAINT "filament_catalog_entries_swatch_not_blank" CHECK (length(trim("filament_catalog_entries"."swatch")) > 0)
);
--> statement-breakpoint
CREATE TABLE "filament_catalog_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"content_sha256" char(64) NOT NULL,
	"entry_count" integer NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "filament_catalog_snapshots_content_sha256_unique" UNIQUE("content_sha256"),
	CONSTRAINT "filament_catalog_snapshots_source_not_blank" CHECK (length(trim("filament_catalog_snapshots"."source")) > 0),
	CONSTRAINT "filament_catalog_snapshots_entry_count_positive" CHECK ("filament_catalog_snapshots"."entry_count" > 0),
	CONSTRAINT "filament_catalog_snapshots_sha256_format" CHECK ("filament_catalog_snapshots"."content_sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "floss_catalog_entries" (
	"snapshot_id" uuid NOT NULL,
	"catalog_id" text NOT NULL,
	"number" text NOT NULL,
	"color_name" text NOT NULL,
	"color_hex" char(7) NOT NULL,
	"purchase_url" text,
	CONSTRAINT "floss_catalog_entries_snapshot_id_catalog_id_pk" PRIMARY KEY("snapshot_id","catalog_id"),
	CONSTRAINT "floss_catalog_entries_catalog_id_not_blank" CHECK (length(trim("floss_catalog_entries"."catalog_id")) > 0),
	CONSTRAINT "floss_catalog_entries_number_not_blank" CHECK (length(trim("floss_catalog_entries"."number")) > 0),
	CONSTRAINT "floss_catalog_entries_color_name_not_blank" CHECK (length(trim("floss_catalog_entries"."color_name")) > 0),
	CONSTRAINT "floss_catalog_entries_color_hex_format" CHECK ("floss_catalog_entries"."color_hex" ~ '^#[0-9A-F]{6}$')
);
--> statement-breakpoint
CREATE TABLE "floss_catalog_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"content_sha256" char(64) NOT NULL,
	"entry_count" integer NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "floss_catalog_snapshots_content_sha256_unique" UNIQUE("content_sha256"),
	CONSTRAINT "floss_catalog_snapshots_source_not_blank" CHECK (length(trim("floss_catalog_snapshots"."source")) > 0),
	CONSTRAINT "floss_catalog_snapshots_entry_count_positive" CHECK ("floss_catalog_snapshots"."entry_count" > 0),
	CONSTRAINT "floss_catalog_snapshots_sha256_format" CHECK ("floss_catalog_snapshots"."content_sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "filament_catalog_entries" ADD CONSTRAINT "filament_catalog_entries_snapshot_id_filament_catalog_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."filament_catalog_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floss_catalog_entries" ADD CONSTRAINT "floss_catalog_entries_snapshot_id_floss_catalog_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."floss_catalog_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "filament_catalog_entries_catalog_id_idx" ON "filament_catalog_entries" USING btree ("catalog_id");--> statement-breakpoint
CREATE INDEX "filament_catalog_entries_family_idx" ON "filament_catalog_entries" USING btree ("family");--> statement-breakpoint
CREATE INDEX "filament_catalog_snapshots_imported_at_idx" ON "filament_catalog_snapshots" USING btree ("imported_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "floss_catalog_entries_catalog_id_idx" ON "floss_catalog_entries" USING btree ("catalog_id");--> statement-breakpoint
CREATE INDEX "floss_catalog_entries_number_idx" ON "floss_catalog_entries" USING btree ("number");--> statement-breakpoint
CREATE INDEX "floss_catalog_snapshots_imported_at_idx" ON "floss_catalog_snapshots" USING btree ("imported_at" DESC NULLS LAST);--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "filament_catalog_snapshots", "filament_catalog_entries", "floss_catalog_snapshots", "floss_catalog_entries" FROM "todo_runtime";--> statement-breakpoint
GRANT SELECT ON TABLE "filament_catalog_snapshots", "filament_catalog_entries", "floss_catalog_snapshots", "floss_catalog_entries" TO "todo_runtime";
