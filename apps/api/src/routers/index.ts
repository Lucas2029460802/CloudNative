import { os } from "./base"
import { reservationsRouter } from "./reservations"
import { venuesRouter } from "./venues"

export const router = os.router({
  venues: venuesRouter,
  reservations: reservationsRouter,
})
