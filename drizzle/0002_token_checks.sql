CREATE TABLE "token_checks" (
	"id" text PRIMARY KEY NOT NULL,
	"chain" text NOT NULL,
	"slug" text NOT NULL,
	"report" jsonb NOT NULL,
	"checked_at" timestamp with time zone NOT NULL
);
