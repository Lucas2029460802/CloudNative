CREATE TYPE "public"."report_status" AS ENUM('pending', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."report_trigger" AS ENUM('manual', 'scheduled');--> statement-breakpoint
CREATE TABLE "reports" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "reports_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"trigger" "report_trigger" NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"status" "report_status" DEFAULT 'pending' NOT NULL,
	"job_name" varchar(63),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error" text,
	"results" jsonb,
	CONSTRAINT "reports_job_name_unique" UNIQUE("job_name"),
	CONSTRAINT "reports_date_range_valid" CHECK ("reports"."to_date" >= "reports"."from_date" and "reports"."to_date" - "reports"."from_date" < 366)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "reports_scheduled_period_idx" ON "reports" USING btree ("from_date","to_date") WHERE "reports"."trigger" = 'scheduled';