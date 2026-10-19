import type { Database } from "./client"
import { venues } from "./schema"

const demoVenues: (typeof venues.$inferInsert)[] = [
  {
    name: "Aurora Lecture Hall",
    location: "Teaching Building A, 1F",
    capacity: 180,
    openTime: "08:00",
    closeTime: "22:00",
    description:
      "Tiered seating with dual projectors, lecture capture and a wireless microphone kit.",
  },
  {
    name: "Seminar Room 305",
    location: "Teaching Building B, 3F",
    capacity: 32,
    openTime: "08:00",
    closeTime: "21:00",
    description:
      "Movable tables for workshops and group discussions, with a 75-inch display.",
  },
  {
    name: "Maple Meeting Room",
    location: "Library, 4F",
    capacity: 12,
    openTime: "09:00",
    closeTime: "18:00",
    description:
      "Quiet boardroom with a video-conferencing camera and whiteboard wall.",
  },
  {
    name: "Badminton Court 2",
    location: "Sports Center, Hall 1",
    capacity: 8,
    openTime: "07:00",
    closeTime: "22:00",
    description:
      "Full-size indoor court. Rackets can be borrowed at the front desk.",
  },
  {
    name: "Black Box Studio",
    location: "Arts Center, B1",
    capacity: 60,
    openTime: "10:00",
    closeTime: "22:00",
    description:
      "Flexible performance space with stage lighting, sound system and sprung floor.",
  },
  {
    name: "Rooftop Garden",
    location: "Student Center, Rooftop",
    capacity: 80,
    openTime: "09:00",
    closeTime: "20:00",
    status: "disabled",
    description: "Closed for waterproofing maintenance until further notice.",
  },
]

/**
 * Inserts the demo venues into an empty `venues` table. Running it again (for example on
 * every container start) is a no-op once any venue exists, so user data is never touched.
 */
export async function seedDemoVenues(db: Database) {
  if ((await db.$count(venues)) > 0) return 0
  await db.insert(venues).values(demoVenues)
  return demoVenues.length
}
