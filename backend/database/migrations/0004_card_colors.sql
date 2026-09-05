-- Date-specific keys (for example work-day:2026-09-05) keep each day's color stable.
-- Backlog uses its own key rather than sharing a work day's color.
CREATE TABLE "colors" (
	"id" text PRIMARY KEY NOT NULL,
	"color" text NOT NULL,
	CONSTRAINT "colors_id_not_blank" CHECK (length(trim("colors"."id")) > 0),
	CONSTRAINT "colors_color_format" CHECK ("colors"."color" ~ '^#[0-9A-Fa-f]{6}$')
);
--> statement-breakpoint
ALTER TABLE "app_data_revisions" DROP CONSTRAINT "app_data_revisions_resource_valid";--> statement-breakpoint
ALTER TABLE "todo_lists" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "app_data_revisions" ADD CONSTRAINT "app_data_revisions_resource_valid" CHECK ("app_data_revisions"."resource" IN ('work-tasks', 'work-statuses', 'colors', 'chores', 'todos', 'shopping', 'printing', 'cross-stitch', 'filament-inventory', 'floss-inventory'));--> statement-breakpoint
ALTER TABLE "todo_lists" ADD CONSTRAINT "todo_lists_color_format" CHECK ("todo_lists"."color" ~ '^#[0-9A-Fa-f]{6}$');--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "colors" FROM "todo_runtime";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "colors" TO "todo_runtime";
