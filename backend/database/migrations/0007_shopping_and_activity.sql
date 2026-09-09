CREATE TABLE "completed_project_tasks" (
	"resource" text NOT NULL,
	"id" text NOT NULL,
	"title" text NOT NULL,
	"context" text DEFAULT '' NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "completed_project_tasks_resource_id_pk" PRIMARY KEY("resource","id"),
	CONSTRAINT "completed_project_tasks_resource_valid" CHECK ("completed_project_tasks"."resource" IN ('printing', 'cross-stitch'))
);
--> statement-breakpoint
ALTER TABLE "manual_shopping_items" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "manual_shopping_items" ADD COLUMN "catalog_id" text;--> statement-breakpoint
ALTER TABLE "manual_shopping_items" ADD COLUMN "quantity" integer;--> statement-breakpoint
ALTER TABLE "manual_shopping_items" ADD COLUMN "archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "work_tasks" ADD COLUMN "archived" boolean DEFAULT false NOT NULL;