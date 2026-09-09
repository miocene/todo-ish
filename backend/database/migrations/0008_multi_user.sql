-- Keep existing personal data with the first registered account; shared rows retain their IDs.
CREATE TABLE "auth_setup_codes" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" text PRIMARY KEY DEFAULT nullif(current_setting('app.user_id', true), '') NOT NULL,
	"hidden_navigation" text[] DEFAULT '{}'::text[] NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app_data_revisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "colors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "completed_project_tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "manual_shopping_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "printing_item_filaments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "printing_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "printing_projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stitch_project_threads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stitch_projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "todo_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "todo_lists" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "work_day_statuses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "work_tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app_data_revisions" DROP CONSTRAINT "app_data_revisions_resource_valid";--> statement-breakpoint
ALTER TABLE "printing_item_filaments" DROP CONSTRAINT "printing_item_filaments_printing_item_id_printing_items_id_fk";
--> statement-breakpoint
ALTER TABLE "printing_items" DROP CONSTRAINT "printing_items_project_id_printing_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "stitch_project_threads" DROP CONSTRAINT "stitch_project_threads_project_id_stitch_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "todo_items" DROP CONSTRAINT "todo_items_list_id_todo_lists_id_fk";
--> statement-breakpoint
ALTER TABLE "completed_project_tasks" DROP CONSTRAINT "completed_project_tasks_resource_id_pk";--> statement-breakpoint
ALTER TABLE "app_data_revisions" DROP CONSTRAINT "app_data_revisions_pkey";--> statement-breakpoint
ALTER TABLE "colors" DROP CONSTRAINT "colors_pkey";--> statement-breakpoint
ALTER TABLE "manual_shopping_items" DROP CONSTRAINT "manual_shopping_items_pkey";--> statement-breakpoint
ALTER TABLE "printing_item_filaments" DROP CONSTRAINT "printing_item_filaments_pkey";--> statement-breakpoint
ALTER TABLE "printing_items" DROP CONSTRAINT "printing_items_pkey";--> statement-breakpoint
ALTER TABLE "printing_projects" DROP CONSTRAINT "printing_projects_pkey";--> statement-breakpoint
ALTER TABLE "stitch_project_threads" DROP CONSTRAINT "stitch_project_threads_pkey";--> statement-breakpoint
ALTER TABLE "stitch_projects" DROP CONSTRAINT "stitch_projects_pkey";--> statement-breakpoint
ALTER TABLE "todo_items" DROP CONSTRAINT "todo_items_pkey";--> statement-breakpoint
ALTER TABLE "todo_lists" DROP CONSTRAINT "todo_lists_pkey";--> statement-breakpoint
ALTER TABLE "work_day_statuses" DROP CONSTRAINT "work_day_statuses_pkey";--> statement-breakpoint
ALTER TABLE "work_tasks" DROP CONSTRAINT "work_tasks_pkey";--> statement-breakpoint
ALTER TABLE "app_data_revisions" ADD COLUMN "scope" text;
UPDATE "app_data_revisions" SET scope = CASE WHEN resource IN ('chores', 'shopping', 'filament-inventory', 'floss-inventory') THEN '' ELSE (SELECT id FROM auth_users ORDER BY created_at, id LIMIT 1) END;
ALTER TABLE "app_data_revisions" ALTER COLUMN "scope" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_challenges" ADD COLUMN "setup_code_hash" text;--> statement-breakpoint
ALTER TABLE "colors" ADD COLUMN "user_id" text;
UPDATE "colors" SET user_id = (SELECT id FROM auth_users ORDER BY created_at, id LIMIT 1);
ALTER TABLE "colors" ALTER COLUMN "user_id" SET DEFAULT nullif(current_setting('app.user_id', true), '');
ALTER TABLE "colors" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "completed_project_tasks" ADD COLUMN "user_id" text;
UPDATE "completed_project_tasks" SET user_id = (SELECT id FROM auth_users ORDER BY created_at, id LIMIT 1);
ALTER TABLE "completed_project_tasks" ALTER COLUMN "user_id" SET DEFAULT nullif(current_setting('app.user_id', true), '');
ALTER TABLE "completed_project_tasks" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "manual_shopping_items" ADD COLUMN "scope" text;
UPDATE "manual_shopping_items" SET scope = CASE WHEN source IS NULL THEN '' ELSE (SELECT id FROM auth_users ORDER BY created_at, id LIMIT 1) END;
ALTER TABLE "manual_shopping_items" ALTER COLUMN "scope" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "printing_item_filaments" ADD COLUMN "user_id" text;
UPDATE "printing_item_filaments" SET user_id = (SELECT id FROM auth_users ORDER BY created_at, id LIMIT 1);
ALTER TABLE "printing_item_filaments" ALTER COLUMN "user_id" SET DEFAULT nullif(current_setting('app.user_id', true), '');
ALTER TABLE "printing_item_filaments" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "printing_items" ADD COLUMN "user_id" text;
UPDATE "printing_items" SET user_id = (SELECT id FROM auth_users ORDER BY created_at, id LIMIT 1);
ALTER TABLE "printing_items" ALTER COLUMN "user_id" SET DEFAULT nullif(current_setting('app.user_id', true), '');
ALTER TABLE "printing_items" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "printing_projects" ADD COLUMN "user_id" text;
UPDATE "printing_projects" SET user_id = (SELECT id FROM auth_users ORDER BY created_at, id LIMIT 1);
ALTER TABLE "printing_projects" ALTER COLUMN "user_id" SET DEFAULT nullif(current_setting('app.user_id', true), '');
ALTER TABLE "printing_projects" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "stitch_project_threads" ADD COLUMN "user_id" text;
UPDATE "stitch_project_threads" SET user_id = (SELECT id FROM auth_users ORDER BY created_at, id LIMIT 1);
ALTER TABLE "stitch_project_threads" ALTER COLUMN "user_id" SET DEFAULT nullif(current_setting('app.user_id', true), '');
ALTER TABLE "stitch_project_threads" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "stitch_projects" ADD COLUMN "user_id" text;
UPDATE "stitch_projects" SET user_id = (SELECT id FROM auth_users ORDER BY created_at, id LIMIT 1);
ALTER TABLE "stitch_projects" ALTER COLUMN "user_id" SET DEFAULT nullif(current_setting('app.user_id', true), '');
ALTER TABLE "stitch_projects" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "todo_items" ADD COLUMN "user_id" text;
UPDATE "todo_items" SET user_id = (SELECT id FROM auth_users ORDER BY created_at, id LIMIT 1);
ALTER TABLE "todo_items" ALTER COLUMN "user_id" SET DEFAULT nullif(current_setting('app.user_id', true), '');
ALTER TABLE "todo_items" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "todo_lists" ADD COLUMN "user_id" text;
UPDATE "todo_lists" SET user_id = (SELECT id FROM auth_users ORDER BY created_at, id LIMIT 1);
ALTER TABLE "todo_lists" ALTER COLUMN "user_id" SET DEFAULT nullif(current_setting('app.user_id', true), '');
ALTER TABLE "todo_lists" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "work_day_statuses" ADD COLUMN "user_id" text;
UPDATE "work_day_statuses" SET user_id = (SELECT id FROM auth_users ORDER BY created_at, id LIMIT 1);
ALTER TABLE "work_day_statuses" ALTER COLUMN "user_id" SET DEFAULT nullif(current_setting('app.user_id', true), '');
ALTER TABLE "work_day_statuses" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "work_tasks" ADD COLUMN "user_id" text;
UPDATE "work_tasks" SET user_id = (SELECT id FROM auth_users ORDER BY created_at, id LIMIT 1);
ALTER TABLE "work_tasks" ALTER COLUMN "user_id" SET DEFAULT nullif(current_setting('app.user_id', true), '');
ALTER TABLE "work_tasks" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "app_data_revisions" ADD CONSTRAINT "app_data_revisions_scope_resource_pk" PRIMARY KEY("scope","resource");
ALTER TABLE "colors" ADD CONSTRAINT "colors_user_id_id_pk" PRIMARY KEY("user_id","id");
ALTER TABLE "completed_project_tasks" ADD CONSTRAINT "completed_project_tasks_user_id_resource_id_pk" PRIMARY KEY("user_id","resource","id");
ALTER TABLE "manual_shopping_items" ADD CONSTRAINT "manual_shopping_items_scope_id_pk" PRIMARY KEY("scope","id");
ALTER TABLE "printing_item_filaments" ADD CONSTRAINT "printing_item_filaments_user_id_id_pk" PRIMARY KEY("user_id","id");
ALTER TABLE "printing_items" ADD CONSTRAINT "printing_items_user_id_id_pk" PRIMARY KEY("user_id","id");
ALTER TABLE "printing_projects" ADD CONSTRAINT "printing_projects_user_id_id_pk" PRIMARY KEY("user_id","id");
ALTER TABLE "stitch_project_threads" ADD CONSTRAINT "stitch_project_threads_user_id_id_pk" PRIMARY KEY("user_id","id");
ALTER TABLE "stitch_projects" ADD CONSTRAINT "stitch_projects_user_id_id_pk" PRIMARY KEY("user_id","id");
ALTER TABLE "todo_items" ADD CONSTRAINT "todo_items_user_id_id_pk" PRIMARY KEY("user_id","id");
ALTER TABLE "todo_lists" ADD CONSTRAINT "todo_lists_user_id_id_pk" PRIMARY KEY("user_id","id");
ALTER TABLE "work_day_statuses" ADD CONSTRAINT "work_day_statuses_user_id_work_date_pk" PRIMARY KEY("user_id","work_date");
ALTER TABLE "work_tasks" ADD CONSTRAINT "work_tasks_user_id_id_pk" PRIMARY KEY("user_id","id");
--> statement-breakpoint
ALTER TABLE "auth_setup_codes" ADD CONSTRAINT "auth_setup_codes_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colors" ADD CONSTRAINT "colors_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "completed_project_tasks" ADD CONSTRAINT "completed_project_tasks_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "printing_item_filaments" ADD CONSTRAINT "printing_item_filaments_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "printing_item_filaments" ADD CONSTRAINT "printing_item_filaments_user_id_printing_item_id_printing_items_user_id_id_fk" FOREIGN KEY ("user_id","printing_item_id") REFERENCES "public"."printing_items"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "printing_items" ADD CONSTRAINT "printing_items_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "printing_items" ADD CONSTRAINT "printing_items_user_id_project_id_printing_projects_user_id_id_fk" FOREIGN KEY ("user_id","project_id") REFERENCES "public"."printing_projects"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "printing_projects" ADD CONSTRAINT "printing_projects_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stitch_project_threads" ADD CONSTRAINT "stitch_project_threads_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stitch_project_threads" ADD CONSTRAINT "stitch_project_threads_user_id_project_id_stitch_projects_user_id_id_fk" FOREIGN KEY ("user_id","project_id") REFERENCES "public"."stitch_projects"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stitch_projects" ADD CONSTRAINT "stitch_projects_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_items" ADD CONSTRAINT "todo_items_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_items" ADD CONSTRAINT "todo_items_user_id_list_id_todo_lists_user_id_id_fk" FOREIGN KEY ("user_id","list_id") REFERENCES "public"."todo_lists"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_lists" ADD CONSTRAINT "todo_lists_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_day_statuses" ADD CONSTRAINT "work_day_statuses_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_tasks" ADD CONSTRAINT "work_tasks_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_data_revisions" ADD CONSTRAINT "app_data_revisions_scope_valid" CHECK (("app_data_revisions"."resource" IN ('chores', 'shopping', 'filament-inventory', 'floss-inventory') AND "app_data_revisions"."scope" = '') OR ("app_data_revisions"."resource" NOT IN ('chores', 'shopping', 'filament-inventory', 'floss-inventory') AND "app_data_revisions"."scope" <> ''));--> statement-breakpoint
ALTER TABLE "app_data_revisions" ADD CONSTRAINT "app_data_revisions_resource_valid" CHECK ("app_data_revisions"."resource" IN ('work-tasks', 'work-statuses', 'colors', 'chores', 'todos', 'shopping', 'printing', 'cross-stitch', 'filament-inventory', 'floss-inventory', 'preferences'));--> statement-breakpoint
ALTER TABLE "manual_shopping_items" ADD CONSTRAINT "shopping_scope_source_valid" CHECK (("manual_shopping_items"."source" IS NULL AND "manual_shopping_items"."scope" = '') OR ("manual_shopping_items"."source" IS NOT NULL AND "manual_shopping_items"."scope" <> ''));--> statement-breakpoint
CREATE POLICY "revisions_access" ON "app_data_revisions" AS PERMISSIVE FOR ALL TO public USING ("app_data_revisions"."scope" = '' OR "app_data_revisions"."scope" = nullif(current_setting('app.user_id', true), '')) WITH CHECK ("app_data_revisions"."scope" = '' OR "app_data_revisions"."scope" = nullif(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "colors_user_access" ON "colors" AS PERMISSIVE FOR ALL TO public USING ("colors"."user_id" = nullif(current_setting('app.user_id', true), '')) WITH CHECK ("colors"."user_id" = nullif(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "completed_project_tasks_user_access" ON "completed_project_tasks" AS PERMISSIVE FOR ALL TO public USING ("completed_project_tasks"."user_id" = nullif(current_setting('app.user_id', true), '')) WITH CHECK ("completed_project_tasks"."user_id" = nullif(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "shopping_access" ON "manual_shopping_items" AS PERMISSIVE FOR ALL TO public USING ("manual_shopping_items"."scope" = '' OR "manual_shopping_items"."scope" = nullif(current_setting('app.user_id', true), '')) WITH CHECK ("manual_shopping_items"."scope" = '' OR "manual_shopping_items"."scope" = nullif(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "printing_item_filaments_user_access" ON "printing_item_filaments" AS PERMISSIVE FOR ALL TO public USING ("printing_item_filaments"."user_id" = nullif(current_setting('app.user_id', true), '')) WITH CHECK ("printing_item_filaments"."user_id" = nullif(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "printing_items_user_access" ON "printing_items" AS PERMISSIVE FOR ALL TO public USING ("printing_items"."user_id" = nullif(current_setting('app.user_id', true), '')) WITH CHECK ("printing_items"."user_id" = nullif(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "printing_projects_user_access" ON "printing_projects" AS PERMISSIVE FOR ALL TO public USING ("printing_projects"."user_id" = nullif(current_setting('app.user_id', true), '')) WITH CHECK ("printing_projects"."user_id" = nullif(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "stitch_project_threads_user_access" ON "stitch_project_threads" AS PERMISSIVE FOR ALL TO public USING ("stitch_project_threads"."user_id" = nullif(current_setting('app.user_id', true), '')) WITH CHECK ("stitch_project_threads"."user_id" = nullif(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "stitch_projects_user_access" ON "stitch_projects" AS PERMISSIVE FOR ALL TO public USING ("stitch_projects"."user_id" = nullif(current_setting('app.user_id', true), '')) WITH CHECK ("stitch_projects"."user_id" = nullif(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "todo_items_user_access" ON "todo_items" AS PERMISSIVE FOR ALL TO public USING ("todo_items"."user_id" = nullif(current_setting('app.user_id', true), '')) WITH CHECK ("todo_items"."user_id" = nullif(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "todo_lists_user_access" ON "todo_lists" AS PERMISSIVE FOR ALL TO public USING ("todo_lists"."user_id" = nullif(current_setting('app.user_id', true), '')) WITH CHECK ("todo_lists"."user_id" = nullif(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "work_day_statuses_user_access" ON "work_day_statuses" AS PERMISSIVE FOR ALL TO public USING ("work_day_statuses"."user_id" = nullif(current_setting('app.user_id', true), '')) WITH CHECK ("work_day_statuses"."user_id" = nullif(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "work_tasks_user_access" ON "work_tasks" AS PERMISSIVE FOR ALL TO public USING ("work_tasks"."user_id" = nullif(current_setting('app.user_id', true), '')) WITH CHECK ("work_tasks"."user_id" = nullif(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "user_preferences_user_access" ON "user_preferences" AS PERMISSIVE FOR ALL TO public USING ("user_preferences"."user_id" = nullif(current_setting('app.user_id', true), '')) WITH CHECK ("user_preferences"."user_id" = nullif(current_setting('app.user_id', true), ''));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "auth_setup_codes", "user_preferences" TO "todo_runtime";
ALTER TABLE "user_preferences" FORCE ROW LEVEL SECURITY;
ALTER TABLE "app_data_revisions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "colors" FORCE ROW LEVEL SECURITY;
ALTER TABLE "completed_project_tasks" FORCE ROW LEVEL SECURITY;
ALTER TABLE "manual_shopping_items" FORCE ROW LEVEL SECURITY;
ALTER TABLE "printing_item_filaments" FORCE ROW LEVEL SECURITY;
ALTER TABLE "printing_items" FORCE ROW LEVEL SECURITY;
ALTER TABLE "printing_projects" FORCE ROW LEVEL SECURITY;
ALTER TABLE "stitch_project_threads" FORCE ROW LEVEL SECURITY;
ALTER TABLE "stitch_projects" FORCE ROW LEVEL SECURITY;
ALTER TABLE "todo_items" FORCE ROW LEVEL SECURITY;
ALTER TABLE "todo_lists" FORCE ROW LEVEL SECURITY;
ALTER TABLE "work_day_statuses" FORCE ROW LEVEL SECURITY;
ALTER TABLE "work_tasks" FORCE ROW LEVEL SECURITY;
