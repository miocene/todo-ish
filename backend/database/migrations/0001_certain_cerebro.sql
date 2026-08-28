CREATE TABLE "chore_occurrences" (
	"chore_id" text NOT NULL,
	"due_on" date NOT NULL,
	"completed_at" timestamp with time zone,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chore_occurrences_chore_id_due_on_pk" PRIMARY KEY("chore_id","due_on"),
	CONSTRAINT "chore_occurrences_position_non_negative" CHECK ("chore_occurrences"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "chores" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"schedule_description" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chores_id_not_blank" CHECK (length(trim("chores"."id")) > 0),
	CONSTRAINT "chores_title_not_blank" CHECK (length(trim("chores"."title")) > 0),
	CONSTRAINT "chores_schedule_not_blank" CHECK (length(trim("chores"."schedule_description")) > 0),
	CONSTRAINT "chores_position_non_negative" CHECK ("chores"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "filament_inventory" (
	"catalog_id" text PRIMARY KEY NOT NULL,
	"spool_count" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "filament_inventory_catalog_id_not_blank" CHECK (length(trim("filament_inventory"."catalog_id")) > 0),
	CONSTRAINT "filament_inventory_spool_count_non_negative" CHECK ("filament_inventory"."spool_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "floss_inventory" (
	"catalog_id" text PRIMARY KEY NOT NULL,
	"skein_count" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "floss_inventory_catalog_id_not_blank" CHECK (length(trim("floss_inventory"."catalog_id")) > 0),
	CONSTRAINT "floss_inventory_skein_count_non_negative" CHECK ("floss_inventory"."skein_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "manual_shopping_items" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"product_url" text,
	"completed_at" timestamp with time zone,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manual_shopping_items_id_not_blank" CHECK (length(trim("manual_shopping_items"."id")) > 0),
	CONSTRAINT "manual_shopping_items_title_not_blank" CHECK (length(trim("manual_shopping_items"."title")) > 0),
	CONSTRAINT "manual_shopping_items_position_non_negative" CHECK ("manual_shopping_items"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "printing_item_filaments" (
	"id" text PRIMARY KEY NOT NULL,
	"printing_item_id" text NOT NULL,
	"catalog_id" text,
	"fallback_label" text,
	"weight_grams" numeric(10, 2),
	"position" integer NOT NULL,
	CONSTRAINT "printing_item_filaments_id_not_blank" CHECK (length(trim("printing_item_filaments"."id")) > 0),
	CONSTRAINT "printing_item_filaments_catalog_id_not_blank" CHECK ("printing_item_filaments"."catalog_id" IS NULL OR length(trim("printing_item_filaments"."catalog_id")) > 0),
	CONSTRAINT "printing_item_filaments_weight_non_negative" CHECK ("printing_item_filaments"."weight_grams" IS NULL OR "printing_item_filaments"."weight_grams" >= 0),
	CONSTRAINT "printing_item_filaments_position_non_negative" CHECK ("printing_item_filaments"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "printing_items" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"title" text NOT NULL,
	"completed_at" timestamp with time zone,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "printing_items_id_not_blank" CHECK (length(trim("printing_items"."id")) > 0),
	CONSTRAINT "printing_items_title_not_blank" CHECK (length(trim("printing_items"."title")) > 0),
	CONSTRAINT "printing_items_position_non_negative" CHECK ("printing_items"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "printing_projects" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"color" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "printing_projects_id_not_blank" CHECK (length(trim("printing_projects"."id")) > 0),
	CONSTRAINT "printing_projects_title_not_blank" CHECK (length(trim("printing_projects"."title")) > 0),
	CONSTRAINT "printing_projects_color_format" CHECK ("printing_projects"."color" ~ '^#[0-9A-Fa-f]{6}$'),
	CONSTRAINT "printing_projects_position_non_negative" CHECK ("printing_projects"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stitch_project_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"floss_catalog_id" text,
	"fallback_label" text,
	"required_skeins" integer DEFAULT 1 NOT NULL,
	"total_crosses" integer DEFAULT 0 NOT NULL,
	"completed_crosses" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stitch_project_threads_id_not_blank" CHECK (length(trim("stitch_project_threads"."id")) > 0),
	CONSTRAINT "stitch_project_threads_floss_id_not_blank" CHECK ("stitch_project_threads"."floss_catalog_id" IS NULL OR length(trim("stitch_project_threads"."floss_catalog_id")) > 0),
	CONSTRAINT "stitch_project_threads_required_skeins_non_negative" CHECK ("stitch_project_threads"."required_skeins" >= 0),
	CONSTRAINT "stitch_project_threads_total_crosses_non_negative" CHECK ("stitch_project_threads"."total_crosses" >= 0),
	CONSTRAINT "stitch_project_threads_completed_crosses_non_negative" CHECK ("stitch_project_threads"."completed_crosses" >= 0),
	CONSTRAINT "stitch_project_threads_completed_crosses_bounded" CHECK ("stitch_project_threads"."completed_crosses" <= "stitch_project_threads"."total_crosses"),
	CONSTRAINT "stitch_project_threads_position_non_negative" CHECK ("stitch_project_threads"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stitch_projects" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"color" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stitch_projects_id_not_blank" CHECK (length(trim("stitch_projects"."id")) > 0),
	CONSTRAINT "stitch_projects_title_not_blank" CHECK (length(trim("stitch_projects"."title")) > 0),
	CONSTRAINT "stitch_projects_color_format" CHECK ("stitch_projects"."color" ~ '^#[0-9A-Fa-f]{6}$'),
	CONSTRAINT "stitch_projects_position_non_negative" CHECK ("stitch_projects"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "todo_items" (
	"id" text PRIMARY KEY NOT NULL,
	"list_id" text NOT NULL,
	"title" text NOT NULL,
	"completed_at" timestamp with time zone,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "todo_items_id_not_blank" CHECK (length(trim("todo_items"."id")) > 0),
	CONSTRAINT "todo_items_title_not_blank" CHECK (length(trim("todo_items"."title")) > 0),
	CONSTRAINT "todo_items_position_non_negative" CHECK ("todo_items"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "todo_lists" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "todo_lists_id_not_blank" CHECK (length(trim("todo_lists"."id")) > 0),
	CONSTRAINT "todo_lists_title_not_blank" CHECK (length(trim("todo_lists"."title")) > 0),
	CONSTRAINT "todo_lists_position_non_negative" CHECK ("todo_lists"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "work_day_statuses" (
	"work_date" date PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_day_statuses_status_valid" CHECK ("work_day_statuses"."status" IN ('work', 'pto', 'sick-leave', 'holiday', 'business-trip', 'weekend', 'conference'))
);
--> statement-breakpoint
CREATE TABLE "work_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"scheduled_for" date,
	"completed_at" timestamp with time zone,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_tasks_id_not_blank" CHECK (length(trim("work_tasks"."id")) > 0),
	CONSTRAINT "work_tasks_title_not_blank" CHECK (length(trim("work_tasks"."title")) > 0),
	CONSTRAINT "work_tasks_position_non_negative" CHECK ("work_tasks"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "chore_occurrences" ADD CONSTRAINT "chore_occurrences_chore_id_chores_id_fk" FOREIGN KEY ("chore_id") REFERENCES "public"."chores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "printing_item_filaments" ADD CONSTRAINT "printing_item_filaments_printing_item_id_printing_items_id_fk" FOREIGN KEY ("printing_item_id") REFERENCES "public"."printing_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "printing_items" ADD CONSTRAINT "printing_items_project_id_printing_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."printing_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stitch_project_threads" ADD CONSTRAINT "stitch_project_threads_project_id_stitch_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."stitch_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_items" ADD CONSTRAINT "todo_items_list_id_todo_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."todo_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chore_occurrences_due_position_idx" ON "chore_occurrences" USING btree ("due_on","position");--> statement-breakpoint
CREATE INDEX "chore_occurrences_completed_at_idx" ON "chore_occurrences" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "manual_shopping_items_completed_at_idx" ON "manual_shopping_items" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "printing_item_filaments_item_position_idx" ON "printing_item_filaments" USING btree ("printing_item_id","position");--> statement-breakpoint
CREATE INDEX "printing_item_filaments_catalog_id_idx" ON "printing_item_filaments" USING btree ("catalog_id");--> statement-breakpoint
CREATE INDEX "printing_items_project_position_idx" ON "printing_items" USING btree ("project_id","position");--> statement-breakpoint
CREATE INDEX "printing_items_completed_at_idx" ON "printing_items" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "stitch_project_threads_project_position_idx" ON "stitch_project_threads" USING btree ("project_id","position");--> statement-breakpoint
CREATE INDEX "stitch_project_threads_floss_catalog_id_idx" ON "stitch_project_threads" USING btree ("floss_catalog_id");--> statement-breakpoint
CREATE INDEX "stitch_project_threads_completed_at_idx" ON "stitch_project_threads" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "todo_items_list_position_idx" ON "todo_items" USING btree ("list_id","position");--> statement-breakpoint
CREATE INDEX "todo_items_completed_at_idx" ON "todo_items" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "work_tasks_scheduled_for_position_idx" ON "work_tasks" USING btree ("scheduled_for","position");--> statement-breakpoint
CREATE INDEX "work_tasks_completed_at_idx" ON "work_tasks" USING btree ("completed_at");--> statement-breakpoint
CREATE VIEW "current_filament_catalog" AS
SELECT entries.catalog_id, entries.family, entries.color_name, entries.product_code, entries.swatch
FROM filament_catalog_entries AS entries
WHERE entries.snapshot_id = (
	SELECT id
	FROM filament_catalog_snapshots
	ORDER BY imported_at DESC, id DESC
	LIMIT 1
);--> statement-breakpoint
CREATE VIEW "current_floss_catalog" AS
SELECT entries.catalog_id, entries.number, entries.color_name, entries.color_hex, entries.purchase_url
FROM floss_catalog_entries AS entries
WHERE entries.snapshot_id = (
	SELECT id
	FROM floss_catalog_snapshots
	ORDER BY imported_at DESC, id DESC
	LIMIT 1
);--> statement-breakpoint
CREATE VIEW "filament_shortages" AS
WITH requirements AS (
	SELECT
		usages.catalog_id,
		max(nullif(trim(usages.fallback_label), '')) AS fallback_label,
		sum(coalesce(usages.weight_grams, 0)) AS required_grams
	FROM printing_item_filaments AS usages
	JOIN printing_items AS items ON items.id = usages.printing_item_id
	WHERE items.completed_at IS NULL AND usages.catalog_id IS NOT NULL
	GROUP BY usages.catalog_id
), totals AS (
	SELECT
		requirements.catalog_id,
		coalesce(catalog.family || ' · ' || catalog.color_name, requirements.fallback_label, requirements.catalog_id) AS label,
		requirements.required_grams,
		ceil(requirements.required_grams / 1000.0)::integer AS required_spools,
		coalesce(inventory.spool_count, 0) AS owned_spools
	FROM requirements
	LEFT JOIN filament_inventory AS inventory ON inventory.catalog_id = requirements.catalog_id
	LEFT JOIN current_filament_catalog AS catalog ON catalog.catalog_id = requirements.catalog_id
)
SELECT
	catalog_id,
	label,
	required_grams,
	required_spools,
	owned_spools,
	greatest(required_spools - owned_spools, 0)::integer AS missing_spools
FROM totals
WHERE required_spools > owned_spools;--> statement-breakpoint
CREATE VIEW "floss_shortages" AS
WITH requirements AS (
	SELECT
		threads.floss_catalog_id AS catalog_id,
		max(nullif(trim(threads.fallback_label), '')) AS fallback_label,
		sum(threads.required_skeins)::integer AS required_skeins
	FROM stitch_project_threads AS threads
	WHERE
		threads.floss_catalog_id IS NOT NULL
		AND NOT (threads.total_crosses > 0 AND threads.completed_crosses >= threads.total_crosses)
	GROUP BY threads.floss_catalog_id
), totals AS (
	SELECT
		requirements.catalog_id,
		coalesce('DMC ' || catalog.number || ' · ' || catalog.color_name, requirements.fallback_label, requirements.catalog_id) AS label,
		requirements.required_skeins,
		coalesce(inventory.skein_count, 0) AS owned_skeins
	FROM requirements
	LEFT JOIN floss_inventory AS inventory ON inventory.catalog_id = requirements.catalog_id
	LEFT JOIN current_floss_catalog AS catalog ON catalog.catalog_id = requirements.catalog_id
)
SELECT
	catalog_id,
	label,
	required_skeins,
	owned_skeins,
	greatest(required_skeins - owned_skeins, 0)::integer AS missing_skeins
FROM totals
WHERE required_skeins > owned_skeins;--> statement-breakpoint
CREATE VIEW "printing_project_progress" AS
SELECT
	projects.id AS project_id,
	count(items.id)::integer AS item_count,
	count(items.completed_at)::integer AS completed_item_count,
	CASE
		WHEN count(items.id) = 0 OR count(items.completed_at) = 0 THEN 'backlog'
		WHEN count(items.completed_at) = count(items.id) THEN 'finished'
		ELSE 'in-progress'
	END AS status,
	max(items.completed_at) FILTER (WHERE items.completed_at IS NOT NULL) AS last_completed_at
FROM printing_projects AS projects
LEFT JOIN printing_items AS items ON items.project_id = projects.id
GROUP BY projects.id;--> statement-breakpoint
CREATE VIEW "stitch_project_progress" AS
SELECT
	projects.id AS project_id,
	coalesce(sum(threads.completed_crosses), 0)::integer AS completed_crosses,
	coalesce(sum(threads.total_crosses), 0)::integer AS total_crosses,
	CASE
		WHEN count(threads.id) = 0 OR coalesce(sum(threads.completed_crosses), 0) = 0 THEN 'backlog'
		WHEN bool_and(threads.total_crosses > 0 AND threads.completed_crosses >= threads.total_crosses) THEN 'finished'
		ELSE 'in-progress'
	END AS status,
	max(threads.completed_at) FILTER (WHERE threads.completed_at IS NOT NULL) AS last_completed_at
FROM stitch_projects AS projects
LEFT JOIN stitch_project_threads AS threads ON threads.project_id = projects.id
GROUP BY projects.id;--> statement-breakpoint
CREATE VIEW "completed_activity" AS
SELECT 'work:' || id AS activity_id, 'Work'::text AS source, CASE WHEN scheduled_for IS NULL THEN 'Backlog' ELSE 'Scheduled work' END AS context, title, completed_at
FROM work_tasks
WHERE completed_at IS NOT NULL
UNION ALL
SELECT 'todo:' || items.id, 'Todo lists', lists.title, items.title, items.completed_at
FROM todo_items AS items
JOIN todo_lists AS lists ON lists.id = items.list_id
WHERE items.completed_at IS NOT NULL
UNION ALL
SELECT 'chore:' || occurrences.chore_id || ':' || occurrences.due_on, 'Chores', chores.schedule_description, chores.title, occurrences.completed_at
FROM chore_occurrences AS occurrences
JOIN chores ON chores.id = occurrences.chore_id
WHERE occurrences.completed_at IS NOT NULL
UNION ALL
SELECT 'shopping:' || id, 'Shopping cart', 'Shopping cart', title, completed_at
FROM manual_shopping_items
WHERE completed_at IS NOT NULL
UNION ALL
SELECT 'printing:' || items.id, '3D printing', projects.title, items.title, items.completed_at
FROM printing_items AS items
JOIN printing_projects AS projects ON projects.id = items.project_id
WHERE items.completed_at IS NOT NULL
UNION ALL
SELECT 'stitch:' || threads.id, 'Cross stitch', projects.title, coalesce(threads.fallback_label, threads.floss_catalog_id, 'Thread color'), threads.completed_at
FROM stitch_project_threads AS threads
JOIN stitch_projects AS projects ON projects.id = threads.project_id
WHERE threads.completed_at IS NOT NULL;--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE
	"work_tasks",
	"work_day_statuses",
	"todo_lists",
	"todo_items",
	"chores",
	"chore_occurrences",
	"manual_shopping_items",
	"printing_projects",
	"printing_items",
	"printing_item_filaments",
	"stitch_projects",
	"stitch_project_threads",
	"filament_inventory",
	"floss_inventory"
FROM "todo_runtime";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
	"work_tasks",
	"work_day_statuses",
	"todo_lists",
	"todo_items",
	"chores",
	"chore_occurrences",
	"manual_shopping_items",
	"printing_projects",
	"printing_items",
	"printing_item_filaments",
	"stitch_projects",
	"stitch_project_threads",
	"filament_inventory",
	"floss_inventory"
TO "todo_runtime";--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE
	"current_filament_catalog",
	"current_floss_catalog",
	"filament_shortages",
	"floss_shortages",
	"printing_project_progress",
	"stitch_project_progress",
	"completed_activity"
FROM "todo_runtime";--> statement-breakpoint
GRANT SELECT ON TABLE
	"current_filament_catalog",
	"current_floss_catalog",
	"filament_shortages",
	"floss_shortages",
	"printing_project_progress",
	"stitch_project_progress",
	"completed_activity"
TO "todo_runtime";
