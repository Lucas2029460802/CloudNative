# syntax=docker/dockerfile:1
# Backend API image. Build context: repository root (see compose.yaml).

# ---- Build stage: install workspace dependencies and bundle the API ----
FROM oven/bun:1.4.2-alpine AS build
WORKDIR /app

# Copy manifests first so the dependency layer stays cached until they change.
# All workspace manifests are needed for the lockfile to match (--frozen-lockfile).
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
RUN bun install --frozen-lockfile --filter @venue/api

COPY packages/contracts/ packages/contracts/
COPY apps/api/ apps/api/
# tsup bundles the API and all of its dependencies into dist/server.js.
RUN bun run --cwd apps/api build

# ---- Runtime stage: Node.js with only the bundle and the SQL migrations ----
FROM node:24.22.0-alpine3.24 AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    MIGRATIONS_DIR=/app/drizzle
WORKDIR /app

COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/drizzle ./drizzle

# Database settings (DATABASE_URL etc.) come from the environment at run time.
# The official Node.js image provides the unprivileged "node" user.
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
