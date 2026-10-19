CREATE TYPE "public"."reservation_status" AS ENUM('confirmed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."venue_status" AS ENUM('open', 'disabled');--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "reservations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"venue_id" integer NOT NULL,
	"booker_name" varchar(100) NOT NULL,
	"attendee_count" integer NOT NULL,
	"reservation_date" date NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"purpose" varchar(500) NOT NULL,
	"status" "reservation_status" DEFAULT 'confirmed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "reservations_time_range_valid" CHECK ("reservations"."start_time" < "reservations"."end_time"),
	CONSTRAINT "reservations_attendee_count_positive" CHECK ("reservations"."attendee_count" > 0),
	CONSTRAINT "reservations_cancelled_at_matches_status" CHECK (("reservations"."status" = 'cancelled') = ("reservations"."cancelled_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "venues_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(100) NOT NULL,
	"location" varchar(200) NOT NULL,
	"capacity" integer NOT NULL,
	"open_time" time NOT NULL,
	"close_time" time NOT NULL,
	"status" "venue_status" DEFAULT 'open' NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venues_capacity_positive" CHECK ("venues"."capacity" > 0),
	CONSTRAINT "venues_opening_hours_valid" CHECK ("venues"."open_time" < "venues"."close_time")
);
--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reservations_venue_date_idx" ON "reservations" USING btree ("venue_id","reservation_date");