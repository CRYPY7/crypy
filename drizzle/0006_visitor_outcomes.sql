CREATE TABLE "visitor_outcomes" (
	"bucket" timestamp with time zone NOT NULL,
	"tool" text NOT NULL,
	"full" integer DEFAULT 0 NOT NULL,
	"partial" integer DEFAULT 0 NOT NULL,
	"errors" integer DEFAULT 0 NOT NULL,
	"slow" integer DEFAULT 0 NOT NULL,
	"total_ms" bigint DEFAULT 0 NOT NULL,
	"reasons" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "visitor_outcomes_bucket_tool_idx" ON "visitor_outcomes" USING btree ("bucket","tool");