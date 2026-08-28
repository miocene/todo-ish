CREATE TABLE "app_data_revisions" (
	"resource" text PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_data_revisions_resource_valid" CHECK ("app_data_revisions"."resource" IN ('work-tasks', 'work-statuses', 'chores', 'todos', 'shopping', 'printing', 'cross-stitch', 'filament-inventory', 'floss-inventory')),
	CONSTRAINT "app_data_revisions_revision_non_negative" CHECK ("app_data_revisions"."revision" >= 0)
);--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "app_data_revisions" FROM "todo_runtime";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "app_data_revisions" TO "todo_runtime";
