-- Convert existing hex colors deterministically; preserve every card and its ownership.
ALTER TABLE "colors" DROP CONSTRAINT "colors_color_format";--> statement-breakpoint
ALTER TABLE "printing_projects" DROP CONSTRAINT "printing_projects_color_format";--> statement-breakpoint
ALTER TABLE "stitch_projects" DROP CONSTRAINT "stitch_projects_color_format";--> statement-breakpoint
ALTER TABLE "todo_lists" DROP CONSTRAINT "todo_lists_color_format";--> statement-breakpoint
ALTER TABLE "colors" ALTER COLUMN "color" SET DATA TYPE integer USING CASE WHEN "color" IS NULL THEN NULL ELSE (('x' || substr("color", 2))::bit(24)::integer % 42) + 1 END;--> statement-breakpoint
ALTER TABLE "printing_projects" ALTER COLUMN "color" SET DATA TYPE integer USING CASE WHEN "color" IS NULL THEN NULL ELSE (('x' || substr("color", 2))::bit(24)::integer % 42) + 1 END;--> statement-breakpoint
ALTER TABLE "stitch_projects" ALTER COLUMN "color" SET DATA TYPE integer USING CASE WHEN "color" IS NULL THEN NULL ELSE (('x' || substr("color", 2))::bit(24)::integer % 42) + 1 END;--> statement-breakpoint
ALTER TABLE "todo_lists" ALTER COLUMN "color" SET DATA TYPE integer USING CASE WHEN "color" IS NULL THEN NULL ELSE (('x' || substr("color", 2))::bit(24)::integer % 42) + 1 END;--> statement-breakpoint
ALTER TABLE "colors" ADD CONSTRAINT "colors_color_format" CHECK ("colors"."color" BETWEEN 1 AND 42);--> statement-breakpoint
ALTER TABLE "printing_projects" ADD CONSTRAINT "printing_projects_color_format" CHECK ("printing_projects"."color" BETWEEN 1 AND 42);--> statement-breakpoint
ALTER TABLE "stitch_projects" ADD CONSTRAINT "stitch_projects_color_format" CHECK ("stitch_projects"."color" BETWEEN 1 AND 42);--> statement-breakpoint
ALTER TABLE "todo_lists" ADD CONSTRAINT "todo_lists_color_format" CHECK ("todo_lists"."color" BETWEEN 1 AND 42);

-- Notify open clients that their card data changed.
UPDATE app_data_revisions SET revision = revision + 1, updated_at = now()
WHERE resource IN ('colors', 'todos', 'printing', 'cross-stitch');
