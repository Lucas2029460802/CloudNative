-- Database-level guarantee that two confirmed reservations of the same venue never overlap,
-- even under concurrent requests. Ranges are half-open ([start, end)), so back-to-back
-- bookings such as 09:00-10:00 and 10:00-11:00 are allowed. Cancelled reservations are
-- excluded, which frees their time slot for new bookings.
-- btree_gist provides the GiST equality operator class needed for "venue_id WITH =".
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_no_overlap" EXCLUDE USING gist (
	"venue_id" WITH =,
	tsrange("reservation_date" + "start_time", "reservation_date" + "end_time", '[)') WITH &&
) WHERE ("status" = 'confirmed');
