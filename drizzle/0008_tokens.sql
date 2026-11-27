CREATE TABLE "tokens" (
	"chain" text NOT NULL,
	"address" text NOT NULL,
	"name" text,
	"symbol" text,
	"decimals" smallint,
	"unreadable" boolean DEFAULT false NOT NULL,
	"source" text NOT NULL,
	"details_at" timestamp with time zone NOT NULL,
	"spam" boolean,
	"spam_reason" text,
	"spam_at" timestamp with time zone,
	"price_usd" text,
	"price_at" timestamp with time zone,
	"used_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "tokens_key_idx" ON "tokens" USING btree ("chain","address");--> statement-breakpoint
CREATE INDEX "tokens_used_idx" ON "tokens" USING btree ("used_at");