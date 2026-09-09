ALTER TABLE "todo_items" DROP CONSTRAINT "todo_items_list_id_todo_lists_id_fk";
--> statement-breakpoint
ALTER TABLE "todo_items" ALTER COLUMN "list_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "todo_items" ADD CONSTRAINT "todo_items_list_id_todo_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."todo_lists"("id") ON DELETE set null ON UPDATE no action;