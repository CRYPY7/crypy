CREATE TABLE "health_checks" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "health_checks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"check" text NOT NULL,
	"status" text NOT NULL,
	"ms" integer,
	"detail" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "health_checks_checked_at_idx" ON "health_checks" USING btree ("checked_at");