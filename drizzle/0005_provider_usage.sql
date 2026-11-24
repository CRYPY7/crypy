CREATE TABLE "provider_usage" (
	"day" text NOT NULL,
	"provider" text NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	"units" bigint DEFAULT 0 NOT NULL,
	"background_units" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "provider_usage_day_provider_idx" ON "provider_usage" USING btree ("day","provider");