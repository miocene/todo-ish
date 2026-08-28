CREATE TABLE "auth_challenges" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"challenge" text NOT NULL,
	"ceremony" text NOT NULL,
	"user_handle" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_challenges_token_hash_not_blank" CHECK (length(trim("auth_challenges"."token_hash")) > 0),
	CONSTRAINT "auth_challenges_challenge_not_blank" CHECK (length(trim("auth_challenges"."challenge")) > 0),
	CONSTRAINT "auth_challenges_ceremony_valid" CHECK ("auth_challenges"."ceremony" IN ('registration', 'authentication'))
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_sessions_token_hash_not_blank" CHECK (length(trim("auth_sessions"."token_hash")) > 0)
);
--> statement-breakpoint
CREATE TABLE "auth_users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_users_id_not_blank" CHECK (length(trim("auth_users"."id")) > 0),
	CONSTRAINT "auth_users_username_not_blank" CHECK (length(trim("auth_users"."username")) > 0),
	CONSTRAINT "auth_users_display_name_not_blank" CHECK (length(trim("auth_users"."display_name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "passkey_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"public_key" text NOT NULL,
	"counter" bigint DEFAULT 0 NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean DEFAULT false NOT NULL,
	"transports" text[] NOT NULL,
	"aaguid" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "passkey_credentials_id_not_blank" CHECK (length(trim("passkey_credentials"."id")) > 0),
	CONSTRAINT "passkey_credentials_public_key_not_blank" CHECK (length(trim("passkey_credentials"."public_key")) > 0),
	CONSTRAINT "passkey_credentials_device_type_valid" CHECK ("passkey_credentials"."device_type" IN ('singleDevice', 'multiDevice')),
	CONSTRAINT "passkey_credentials_counter_non_negative" CHECK ("passkey_credentials"."counter" >= 0)
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkey_credentials" ADD CONSTRAINT "passkey_credentials_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_challenges_expires_at_idx" ON "auth_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_users_username_unique" ON "auth_users" USING btree ("username");--> statement-breakpoint
CREATE INDEX "passkey_credentials_user_id_idx" ON "passkey_credentials" USING btree ("user_id");