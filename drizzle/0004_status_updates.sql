CREATE TABLE "status_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"state" text NOT NULL,
	"component" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fixed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "status_updates_created_idx" ON "status_updates" USING btree ("created_at");