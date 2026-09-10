CREATE TABLE "supply_purchase_receipts" (
	"user_id" text DEFAULT nullif(current_setting('app.user_id', true), '') NOT NULL,
	"id" text NOT NULL,
	"source" text NOT NULL,
	"catalog_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"reversed" boolean DEFAULT false NOT NULL,
	"reversed_quantity" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supply_purchase_receipts_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
ALTER TABLE "supply_purchase_receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "supply_purchase_receipts" ADD CONSTRAINT "supply_purchase_receipts_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "supply_purchase_receipts_user_access" ON "supply_purchase_receipts" AS PERMISSIVE FOR ALL TO public USING ("supply_purchase_receipts"."user_id" = nullif(current_setting('app.user_id', true), '')) WITH CHECK ("supply_purchase_receipts"."user_id" = nullif(current_setting('app.user_id', true), ''));
--> statement-breakpoint
INSERT INTO supply_purchase_receipts (user_id,id,source,catalog_id,quantity)
SELECT scope,id,source,catalog_id,quantity FROM manual_shopping_items WHERE source IS NOT NULL;
GRANT SELECT, INSERT, UPDATE ON supply_purchase_receipts TO "todo_runtime";
ALTER TABLE supply_purchase_receipts FORCE ROW LEVEL SECURITY;
