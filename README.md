# Venue Booking System

[English](README.md) | [简体中文](README.zh.md)

A full-stack venue booking system developed for *CS30074 Cloud-Native Software Technology, Lab 1*, at Fudan University.

This project explores containerized web application development using modern TypeScript tooling, PostgreSQL, and Docker Compose.

## Tech Stack

| Layer | Technologies |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 8 |
| Routing & Data | TanStack Router, TanStack Query, TanStack Form |
| UI & Styling | shadcn/ui, Base UI, Tailwind CSS v4 |
| Internationalization | i18next, react-i18next |
| Backend | Node.js, Hono, oRPC, Zod |
| Database | PostgreSQL 18, Drizzle ORM |
| Package Management | Bun Workspaces |
| Code Quality | Oxlint, Oxfmt, Knip |
| Testing | Vitest, Playwright, axe-core, Lighthouse CI |
| Infrastructure | Docker, Docker Compose, Nginx |

## Repository Structure

```text
.
├── apps/
│   ├── web/               # React frontend
│   └── api/               # Node.js backend
├── packages/              # Shared libraries/contracts
├── deploy/                # Docker and deployment configurations
├── tests/                 # Shared test suites
├── docs/                  # Project documentation
├── package.json           # Bun workspace configuration
└── bun.lock               # Dependency lockfile
```

## Getting Started

### Prerequisites

- Bun
- Node.js
- Git
- Docker Desktop

### Install Dependencies

Clone the repository and navigate to its root directory.

```bash
bun install
```

Bun installs dependencies for all registered workspaces using the root lockfile.

### Run the Frontend

```bash
bun run --filter '@venue/web' dev
```

### Run the Backend

In another terminal:

```bash
bun run --filter '@venue/api' dev
```

### Build

```bash
bun run --filter '@venue/web' build
bun run --filter '@venue/api' build
```

## Development

```bash
bunx playwright install chromium
```
