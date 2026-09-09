ALTER TABLE "chores" ADD COLUMN "schedule" jsonb;--> statement-breakpoint
ALTER TABLE "chores" ADD COLUMN "next_due_on" date;