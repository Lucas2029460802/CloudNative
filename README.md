# Venue Booking System

[English](README.md) | [简体中文](README.zh.md)

A full-stack venue booking system developed for _CS30074 Cloud-Native Software Technology, Lab 1_, at Fudan University.

People pick a day, see when each campus venue is free, book a time slot, and get a reservation number they can use to look up or cancel the booking. The frontend, the Web API, and PostgreSQL each run in their own container under Docker Compose.

- Booking board: every venue's day on one time axis, with booked, closed, and past time marked
- Venue page: click a start and an end slot (or pick times), enter who is booking and why, and book
- Confirmation slip with the reservation number; cancellation with confirmation
- Reservation list with search by name or purpose and filters by status, venue, and date
- Add venues; disabled venues stay visible but cannot be booked
- English and Simplified Chinese, light and dark themes, works on phones

## Architecture

```text
Browser ──HTTP :8080──▶ frontend (nginx)          static React build
                          │  /api/* reverse proxy
                          ▼
                        api (Node.js :3000)        Hono + oRPC REST API, validation, business rules
                          │  SQL
                          ▼
                        database (PostgreSQL :5432) venues, reservations (named volume)
```

| Container  | Image                          | Responsibility                                                  | Networks                      | Published port |
| ---------- | ------------------------------ | --------------------------------------------------------------- | ----------------------------- | -------------- |
| `frontend` | `venue-booking/frontend:1.0.0` | Serves the UI and proxies `/api` to the API                     | `frontend-net`                | `8080` (host)  |
| `api`      | `venue-booking/api:1.0.0`      | REST API, validation, conflict checks, migrations and seed data | `frontend-net`, `backend-net` | none           |
| `database` | `postgres:18.6-alpine3.24`     | Persists venues and reservations in the `database-data` volume  | `backend-net`                 | none           |

The browser only talks to the frontend origin, so no CORS setup is needed and the API base URL needs no build-time configuration. The frontend container is not attached to `backend-net`: it cannot resolve or reach the database.

## Tech stack

| Layer                | Technologies                                   |
| -------------------- | ---------------------------------------------- |
| Frontend             | React 19, TypeScript, Vite 8                   |
| Routing & data       | TanStack Router, TanStack Query, TanStack Form |
| UI & styling         | shadcn/ui, Base UI, Tailwind CSS v4            |
| Internationalization | i18next, react-i18next                         |
| Backend              | Node.js, Hono, oRPC, Zod                       |
| Database             | PostgreSQL 18, Drizzle ORM                     |
| Package management   | Bun Workspaces                                 |
| Code quality         | Oxlint, Oxfmt, Knip                            |
| Testing              | Vitest, Playwright, axe-core, Lighthouse CI    |
| Infrastructure       | Docker, Docker Compose, Nginx                  |

## Repository structure

```text
.
├── apps/
│   ├── api/                  # Hono + oRPC backend
│   │   ├── drizzle/          # SQL migrations (generated + exclusion constraint)
│   │   └── src/
│   │       ├── db/           # Drizzle schema, connection, migrations, seed data
│   │       ├── routers/      # Endpoint handlers and business rules
│   │       ├── app.ts        # HTTP app: /api routes, health check, error handling
│   │       └── server.ts     # Entry point: config, migrate, seed, listen
│   └── web/                  # React frontend
│       └── src/
│           ├── routes/       # File-based routes (TanStack Router)
│           ├── features/     # Venue board, booking, reservations
│           ├── components/   # Shared UI (shadcn/ui components in ui/)
│           ├── locales/      # English and Simplified Chinese strings
│           └── lib/          # API client, time and format helpers, i18n
├── packages/contracts/       # API contract and Zod schemas shared by api and web
├── deploy/
│   ├── api/Dockerfile        # Multi-stage API image
│   └── web/                  # Multi-stage frontend image + nginx config template
├── tests/                    # unit/, integration/ (Vitest), e2e/ (Playwright)
├── compose.yaml              # frontend, api, database
├── compose.dev.yaml          # Development override: publishes PostgreSQL on 127.0.0.1
├── .env.example              # Configuration template
└── docs/lab-1.md             # Lab specification
```

## Run with Docker Compose

Prerequisites: Docker with Compose v2 (Docker Desktop on Windows and macOS).

```bash
cp .env.example .env
```

Edit `.env` and set your own `POSTGRES_PASSWORD` (letters, digits, `-`, `_`, `.` only, because it is embedded in the API's connection URL). Then build and start everything:

```bash
docker compose up --build -d
```

```bash
docker compose ps
```

All three services report `(healthy)` after about 20 seconds. Open <http://localhost:8080>.

- API base URL: <http://localhost:8080/api> (through the frontend's reverse proxy)
- Interactive API reference: <http://localhost:8080/api/docs> (OpenAPI document at `/api/openapi.json`)
- Health check: <http://localhost:8080/api/health> returns `{"status":"ok","database":"up"}`

On first start the API applies the database migrations and inserts six demo venues (one of them disabled). Later starts keep existing data and never insert the demo venues again.

Useful commands:

```bash
docker compose logs -f api
```

```bash
docker compose down
```

`docker compose down` keeps the `venue-booking_database-data` volume, so reservations survive. Add `-v` to delete the data as well.

### Configuration

Docker Compose reads `.env` from the repository root. `.env` is ignored by Git; `.env.example` lists every variable with example values.

| Variable             | Default (example)               | Used by             | Purpose                                                      |
| -------------------- | ------------------------------- | ------------------- | ------------------------------------------------------------ |
| `POSTGRES_DB`        | `venue_booking`                 | database, api       | Database name                                                |
| `POSTGRES_USER`      | `venue`                         | database, api       | Database user                                                |
| `POSTGRES_PASSWORD`  | `change-me-local-only`          | database, api       | Database password (required, URL-safe characters)            |
| `FRONTEND_PORT`      | `8080`                          | frontend            | Host port of the web UI                                      |
| `APP_TIME_ZONE`      | `Asia/Shanghai`                 | api                 | Time zone used to reject reservations that start in the past |
| `DB_SEED_ON_START`   | `true`                          | api                 | Insert demo venues when the venue table is empty             |
| `IMAGE_TAG`          | `1.0.0`                         | compose             | Tag of the locally built images                              |
| `POSTGRES_HOST_PORT` | `5432`                          | `compose.dev.yaml`  | Loopback port for PostgreSQL during local development        |
| `DATABASE_URL`       | `postgres://…@localhost:5432/…` | local `bun run dev` | Connection URL for the API outside Docker                    |

Inside Compose the API receives `DATABASE_URL=postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@database:5432/$POSTGRES_DB`, where `database` is the Compose service name. No password is stored in the source code or in an image.

### Images

Both Dockerfiles use the repository root as build context and a root `.dockerignore` that excludes `node_modules`, build output, `.env` files, Git data, tests, and docs.

- `deploy/api/Dockerfile`: stage one (`oven/bun:1.4.4-alpine`) installs only the API's workspace dependencies from the lockfile and bundles the API with `bun build` into a single `dist/server.js`. The runtime stage (`node:24.22.1-alpine3.24`) contains just that bundle and the SQL migrations: no source code, `node_modules`, or build tools. It runs as the unprivileged `node` user and listens on port 3000.
- `deploy/web/Dockerfile`: stage one builds the React app with Vite. The runtime stage (`nginxinc/nginx-unprivileged:1.30.6-alpine3.24`) serves the static files as uid 101 on port 8080, proxies `/api/` to `API_UPSTREAM` (default `http://api:3000`), and falls back to `index.html` for client-side routes. The proxy resolves the API host per request, so a recreated API container is found again.

To build an image on its own:

```bash
docker build -f deploy/api/Dockerfile -t venue-booking/api:1.0.0 .
```

```bash
docker build -f deploy/web/Dockerfile -t venue-booking/frontend:1.0.0 .
```

## Local development

Prerequisites: [Bun](https://bun.sh) 1.4, Node.js 24, Docker.

```bash
bun install
```

```bash
cp .env.example .env
```

Start only PostgreSQL, published on `127.0.0.1:5432` by the development override:

```bash
bun run dev:db
```

Start the API (<http://localhost:3000>) and the web app (<http://localhost:5173>) with hot reload:

```bash
bun run dev
```

The Vite dev server proxies `/api` to the API, just like nginx does in Docker. The API loads `.env` from the repository root and runs migrations and seeding on start, same as in the container. The development database is the same `database-data` volume the full stack uses.

| Command               | What it does                                                    |
| --------------------- | --------------------------------------------------------------- |
| `bun run build`       | Build the API bundle and the web app                            |
| `bun run typecheck`   | Type-check all workspaces and the tests                         |
| `bun run lint`        | Lint with Oxlint                                                |
| `bun run format`      | Format with Oxfmt (`format:check` to verify only)               |
| `bun run knip`        | Report unused files, exports, and dependencies                  |
| `bun run db:generate` | Generate a migration after changing `apps/api/src/db/schema.ts` |

## API

All endpoints use JSON and live under `/api`. The full schema is served at `/api/openapi.json` and browsable at `/api/docs`.

| Method | Path                            | Description                        | Success | Errors                        |
| ------ | ------------------------------- | ---------------------------------- | ------- | ----------------------------- |
| GET    | `/api/venues`                   | List venues                        | 200     |                               |
| GET    | `/api/venues/{id}`              | Venue details                      | 200     | 400, 404                      |
| POST   | `/api/venues`                   | Create a venue                     | 201     | 400                           |
| GET    | `/api/reservations`             | List reservations (filters below)  | 200     | 400                           |
| GET    | `/api/reservations/{id}`        | Reservation details                | 200     | 400, 404                      |
| POST   | `/api/reservations`             | Create a reservation               | 201     | 400, 404, 409                 |
| POST   | `/api/reservations/{id}/cancel` | Cancel a reservation               | 200     | 400, 404                      |
| GET    | `/api/health`                   | Liveness and database connectivity | 200     | 503 when the database is down |

`GET /api/reservations` accepts optional query parameters, combined with AND: `venueId`, `date` (exact day), `from` (on or after), `status` (`confirmed` or `cancelled`), and `q` (case-insensitive search in booker name and purpose). Results are sorted by date and start time.

Create a venue:

```json
{
  "name": "Seminar Room 210",
  "location": "Teaching Building B, 2F",
  "capacity": 30,
  "openTime": "08:00",
  "closeTime": "21:00",
  "status": "open",
  "description": "Optional"
}
```

Create a reservation (dates are `YYYY-MM-DD`, times are 24-hour `HH:mm`):

```json
{
  "venueId": 2,
  "bookerName": "Robotics Club",
  "attendeeCount": 12,
  "date": "2026-10-30",
  "startTime": "14:00",
  "endTime": "15:30",
  "purpose": "Weekly build session"
}
```

Errors share one JSON shape and never include stack traces. Unexpected failures are logged by the API and returned as a generic 500.

```json
{
  "code": "RESERVATION_CONFLICT",
  "status": 409,
  "message": "The requested time overlaps 1 existing reservation(s)",
  "data": {
    "conflicts": [{ "id": 7, "startTime": "14:00", "endTime": "15:00" }]
  }
}
```

| Code                    | Status | When                                                                      |
| ----------------------- | ------ | ------------------------------------------------------------------------- |
| `BAD_REQUEST`           | 400    | Malformed JSON or invalid fields; `data.issues` lists `{ path, message }` |
| `VENUE_DISABLED`        | 400    | The venue's status is `disabled`                                          |
| `OUTSIDE_OPENING_HOURS` | 400    | The time range is not within the venue's opening hours                    |
| `RESERVATION_IN_PAST`   | 400    | The reservation starts at or before the current time                      |
| `CAPACITY_EXCEEDED`     | 400    | `attendeeCount` is larger than the venue's capacity                       |
| `VENUE_NOT_FOUND`       | 404    | The venue does not exist                                                  |
| `RESERVATION_NOT_FOUND` | 404    | The reservation does not exist                                            |
| `NOT_FOUND`             | 404    | No such route                                                             |
| `RESERVATION_CONFLICT`  | 409    | The range overlaps a confirmed reservation of the same venue              |
| `INTERNAL_SERVER_ERROR` | 500    | Unexpected server error                                                   |

## Data model and booking rules

`venues`: `id` (identity primary key), `name`, `location`, `capacity` (> 0), `open_time` and `close_time` (`time`, open < close), `status` (`open` | `disabled`), `description`, `created_at`.

`reservations`: `id` (identity primary key), `venue_id` (foreign key to `venues.id`, `ON DELETE RESTRICT`), `booker_name`, `attendee_count` (> 0), `reservation_date` (`date`), `start_time` and `end_time` (`time`, start < end), `purpose`, `status` (`confirmed` | `cancelled`), `created_at`, `cancelled_at`. A check constraint keeps `cancelled_at` set exactly when the status is `cancelled`. An index on `(venue_id, reservation_date)` serves the schedule queries.

The schema lives in `apps/api/src/db/schema.ts`. Drizzle migrations in `apps/api/drizzle/` create it and are applied automatically when the API starts.

A reservation is accepted only if the venue exists and is open, the request is well-formed, the range lies within the opening hours, it starts in the future, and the attendees fit the venue's capacity. It must also not overlap any **confirmed** reservation of the same venue. Ranges are half-open, so 09:00 to 10:00 and 10:00 to 11:00 can both be booked.

The database prevents conflicts atomically, so concurrent requests cannot double-book:

1. The API validates the venue, time, and capacity, then inserts the reservation. If PostgreSQL rejects the insert with an exclusion violation (SQLSTATE `23P01`), the API returns a 409 that names the conflicting time ranges.
2. PostgreSQL enforces an exclusion constraint (`EXCLUDE USING gist (venue_id WITH =, tsrange(date + start, date + end) WITH &&) WHERE (status = 'confirmed')`, migration `0001`), which also rejects overlaps from writes that bypass the API.

Cancellation is logical: it sets `status = 'cancelled'` and `cancelled_at` but keeps the row as a record. The overlap check and the constraint ignore cancelled reservations, so the time slot can be booked again immediately. Cancelling an already cancelled reservation returns it unchanged (idempotent).

Dates and times are wall-clock values without a time zone. The API uses `APP_TIME_ZONE` (default `Asia/Shanghai`) to decide what "now" is, so the container's own UTC clock does not matter. The frontend validates input with the same Zod schemas as the API for immediate feedback, but the API makes the final decision on every rule.

## Tests

| Command                    | Scope                                                                                        | Needs                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `bun run test:unit`        | Schemas, time helpers, configuration parsing                                                 | nothing                                                                 |
| `bun run test:integration` | All endpoints against a real PostgreSQL, incl. conflicts, concurrency, DB constraint, errors | Docker (starts a throwaway PostgreSQL container) or `TEST_DATABASE_URL` |
| `bun run test`             | Unit and integration tests                                                                   | as above                                                                |
| `bun run test:e2e`         | Browser flows, accessibility (axe), API through the nginx proxy                              | a running stack and Chromium                                            |
| `bun run test:lighthouse`  | Lighthouse CI on three pages (accessibility ≥ 0.95, best practices ≥ 0.9)                    | a running stack and Chrome                                              |

End-to-end tests default to <http://localhost:8080>. They add a test venue and bookings, so point them at a disposable stack:

```bash
bunx playwright install chromium
```

```bash
FRONTEND_PORT=8081 docker compose -p venue-booking-e2e up -d --build --wait
```

```bash
E2E_BASE_URL=http://localhost:8081 bun run test:e2e
```

```bash
docker compose -p venue-booking-e2e down -v
```

## Lab 1 verification walkthrough

These commands reproduce the lab's acceptance checks (sections 8.1 to 8.3) against the running stack. In PowerShell, use `curl.exe` and escape the inner double quotes, or use the web UI instead.

### Containers (8.2)

```bash
docker compose up --build -d
```

```bash
docker compose ps
```

Expect `api`, `database`, and `frontend` to be `Up … (healthy)`, with only `0.0.0.0:8080->8080/tcp` published. `curl http://localhost:8080/api/health` returns `{"status":"ok","database":"up"}`, which proves the API reaches the database. `docker compose logs api` shows the migration and seed messages and one line per request, without recurring errors.

### Booking flow (8.1)

Replace the date in the request with a future day.

```bash
curl http://localhost:8080/api/venues
```

```bash
curl -i -X POST http://localhost:8080/api/reservations -H "content-type: application/json" -d '{"venueId":3,"bookerName":"Robotics Club","attendeeCount":8,"date":"2026-10-30","startTime":"14:00","endTime":"15:30","purpose":"Sprint planning"}'
```

The response is `201 Created` and contains the new reservation `id`. Using that id:

- `GET /api/reservations/{id}` returns the reservation.
- Posting 15:00 to 16:00 for the same venue and day returns `409 Conflict` with code `RESERVATION_CONFLICT`.
- `POST /api/reservations/{id}/cancel` returns `200` with `"status":"cancelled"`.
- Posting 15:00 to 16:00 again now returns `201 Created`, because cancelled reservations no longer block the slot.

### Persistence (8.3)

```bash
docker compose down
```

```bash
docker compose up -d
```

Request `GET /api/reservations/{id}` again. The reservation is still there because PostgreSQL stores its data in the named volume:

```bash
docker volume ls
```

The output lists `venue-booking_database-data`.

## Troubleshooting

- **Port 8080 is in use**: set `FRONTEND_PORT` in `.env`, for example `FRONTEND_PORT=8090`.
- **`set POSTGRES_PASSWORD in .env`**: copy `.env.example` to `.env` first.
- **API stays unhealthy**: check `docker compose logs api`. A password with characters such as `@` or `/` breaks the connection URL.
- **Start over with an empty database**: `docker compose down -v`, then `docker compose up -d`.
- **Port 5432 is in use during development**: set `POSTGRES_HOST_PORT` and the port in `DATABASE_URL` to a free port.
- **`format:check` fails on Windows for files you did not touch**: the checkout predates `.gitattributes`, so its files still have CRLF line endings. With no uncommitted changes, run `git rm -r --cached -q .` and then `git reset --hard` to check them out again with LF.
