# syntax=docker/dockerfile:1
# Frontend image. Build context: repository root (see compose.yaml).

# ---- Build stage: compile the React app into static files ----
FROM oven/bun:1.4.4-alpine AS build
WORKDIR /app

# Copy manifests first so the dependency layer stays cached until they change.
# All workspace manifests are needed for the lockfile to match (--frozen-lockfile).
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
RUN bun install --frozen-lockfile --filter @venue/web

COPY packages/contracts/ packages/contracts/
COPY apps/web/ apps/web/
RUN bun run --cwd apps/web build

# ---- Runtime stage: unprivileged nginx serving the build and proxying /api ----
FROM nginxinc/nginx-unprivileged:1.31.7-alpine3.24 AS runtime
# API_UPSTREAM is substituted into the nginx config when the container starts.
ENV API_UPSTREAM=http://api:3000 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1

COPY deploy/web/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

# Runs as the image's unprivileged "nginx" user (uid 101).
EXPOSE 8080
