CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"item_id" uuid,
	"kind" text NOT NULL,
	"severity" text NOT NULL,
	"chain" text DEFAULT '' NOT NULL,
	"title" text NOT NULL,
	"details" jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "checker_cursors" (
	"chain" text PRIMARY KEY NOT NULL,
	"last_block" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolios" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_link_codes" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_chat_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_username" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_linked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "quiet_on" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "quiet_start" smallint DEFAULT 1380 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "quiet_end" smallint DEFAULT 420 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "time_zone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "watch_items" ADD COLUMN "muted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "watch_items" ADD COLUMN "state" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_item_id_watch_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."watch_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_link_codes" ADD CONSTRAINT "telegram_link_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_dedupe" ON "alerts" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "alerts_user_created_idx" ON "alerts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "alerts_status_idx" ON "alerts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "telegram_link_codes_user_idx" ON "telegram_link_codes" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_telegram_chat_id_unique" UNIQUE("telegram_chat_id");