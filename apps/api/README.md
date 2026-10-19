# @venue/api

Hono + oRPC REST API for the venue booking system, backed by PostgreSQL through Drizzle ORM.

- `src/server.ts` reads the environment, applies migrations, seeds demo venues and starts listening on `PORT` (3000).
- `src/app.ts` mounts the oRPC handler under `/api`, the health check, the API reference (`/api/docs`) and error handling.
- `src/routers/` implements the contract from `@venue/contracts`; booking rules live in `routers/reservations.ts`.
- `src/db/` holds the Drizzle schema, connection, migration runner and seed data; SQL migrations are in `drizzle/`.

See the [root README](../../README.md) for setup, configuration and the API reference.
