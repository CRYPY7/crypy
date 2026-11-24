CREATE TABLE "saved_results" (
	"kind" text NOT NULL,
	"subject" text NOT NULL,
	"chain" text NOT NULL,
	"data" jsonb NOT NULL,
	"quality" smallint DEFAULT 2 NOT NULL,
	"saved_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "saved_results_key_idx" ON "saved_results" USING btree ("kind","subject","chain");--> statement-breakpoint
CREATE INDEX "saved_results_used_idx" ON "saved_results" USING btree ("used_at");