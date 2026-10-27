<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

<h1 align="center">TaskFlow</h1>

<p align="center">A Jira-like project-tracking backend built with NestJS, showcasing a broad slice of the framework: REST + GraphQL side by side, session auth with role-based access control, an issue tracker with its own permission model, Redis caching, structured logging, and Prometheus/Grafana observability.</p>

## Overview

This is the backend for a small, Jira-like project tracker. Users register, get organized into **projects**, and each project has its own **members** with per-project roles (`OWNER`, `ADMIN`, `EDITOR`, `VIEWER`) independent of a user's **global role** (`REGULAR_USER` / `ADMIN`). Within a project, work is tracked as **issues** (tasks/bugs/stories/epics) that move through a status workflow, can be assigned, tagged with **labels**, and discussed via **comments**.

Everything here is deliberately built end-to-end rather than stubbed: real guards and permission checks (not just route decorators), structured logging to a queryable `logs` table, Redis-backed caching with graceful fallback, Prometheus metrics wired into Grafana, and a deterministic seed script that reproduces the same demo dataset on every run — not random each time.

## Features

- **Auth**: session-cookie auth (`express-session` + Passport local strategy), registration with email verification, forgot/reset password flows with time-limited tokens, account deletion.
- **Authorization**: two independent role layers — a user's global role (regular user vs. admin) and their per-project role (owner/admin/editor/viewer) — enforced via guards (`AuthenticatedGuard`, `GlobalAdminGuard`, `ProjectRoleGuard`) and service-level checks.
- **Projects**: CRUD with ownership and membership, exposed over both REST and GraphQL.
- **Validation**: a global `ValidationPipe` (registered as an `APP_PIPE` provider, so it covers REST, GraphQL and e2e tests) with `whitelist` + `transform`. DTOs use `class-validator` rules that mirror the database columns (lengths, UUIDs, enums, `#rrggbb` colors, dates converted via `class-transformer`), `PartialType` reuses create rules for updates, and a custom `@IsOptionalNonNullable()` rejects explicit `null` on non-nullable fields. Failures return one readable message per field and are logged to the `logs` table (property and rule names only, never submitted values).
- **Error handling**: a global `@Catch()` exception filter (`AllExceptionsFilter`, registered as an `APP_FILTER` provider for both REST and GraphQL) is the single place unexpected errors are handled. Services only catch the failures they can act on (a cache miss falls back to the database, an email that can't be sent becomes a 503); everything else propagates and the filter logs it once to the `logs` table (with the route pattern or GraphQL operation and the user) and returns a generic 500, so internal details like database error messages never reach the client. Deliberate `HttpException`s pass through unchanged.
- **Issue tracking**: `Issue` / `Label` / `Comment` resources with a type/status/priority workflow, assignment (restricted to project members), many-to-many labels, and a permission model where creating/editing issues and labels needs an OWNER/ADMIN/EDITOR project role, deleting needs OWNER/ADMIN, and commenting is open to any project member (including VIEWER).
- **Caching**: Redis-backed cache (`cache-manager-ioredis-yet`) on hot read paths, with reads falling back to the database on a cache miss or cache-layer error rather than failing the request.
- **Logging**: every significant service action (success, validation failure, not-found, forbidden, unexpected error) is written to a `logs` table with level/context/metadata, queryable via `GET /logger` with level/date/sort filters.
- **Observability**: Prometheus metrics (`/metrics`) and a `docker-compose` stack wiring up Grafana + a Postgres exporter.
- **Health checks**: Terminus-based `GET /health`, pinging the database connection.
- **Seed data**: a deterministic seed script (`SeedService`) creates an admin account, a default account, ~50 demo users, ~50 projects with fixed ownership/membership, and matching labels/issues/comments — the same dataset every time, so manual testing and the Postman collection have stable data to work against.
- **Dual API surface**: the same business logic is reachable over REST (with Swagger docs) and GraphQL (with a Playground), via `ProjectResolver` sitting alongside `ProjectController`.

## Tech stack

NestJS 10 · TypeScript · TypeORM (PostgreSQL, SQLite for tests) · GraphQL (Apollo) · Passport (session-based local auth) · Redis (`ioredis`) · Prometheus + Grafana · Jest (unit + e2e) · Docker Compose

## Getting started

### Prerequisites

- Node.js 22 LTS
- Docker (for Postgres/Redis/Prometheus/Grafana via `docker-compose`), or your own local Postgres + Redis instances

### Setup

```bash
# install dependencies
npm install

# copy the env template and fill in your own values
cp .env.example .env
```

See [.env.example](.env.example) for every variable the app reads (database, Redis, outgoing email, and the seed data accounts). At minimum, set `SECRET`, `DB_TYPE`/`PG_*`, and `REDIS_*` to get the app running; the `EMAIL_JS_*` and seed-account variables can be left blank (registration emails will just fail silently in dev, and seeding that part is skipped).

### Running

**Option A: everything in Docker**

```bash
docker compose up -d --build
```

This builds the app image and starts the full stack: `nestjs-app`, `postgres`, `redis`, `prometheus`, `grafana`, and `postgres_exporter`. Database/Redis connection details are already wired for container networking in `docker-compose.yml`; everything else (`SECRET`, `EMAIL_JS_*`, the seed-account variables) is read from your `.env` via `env_file`, so you still need to complete the [Setup](#setup) step first.

- App: `http://localhost:3001`
- Grafana: `http://localhost:3000`
- Prometheus: `http://localhost:9090`

After pulling changes or editing source, rebuild the app's image before restarting it:

```bash
docker compose up -d --build nestjs-app
```

To stop everything: `docker compose down` (add `-v` to also wipe the Postgres/Redis/Grafana volumes and start fully fresh next time).

**Option B: app on your machine, infra in Docker**

```bash
# bring up Postgres, Redis, Prometheus and Grafana
docker-compose up -d postgres redis prometheus grafana

# development (watch mode)
npm run start:dev

# production mode
npm run build
npm run start:prod
```

The app listens on `http://localhost:3001` by default (override with `PORT`/`HOST`).

### Testing

```bash
npm run test       # unit tests
npm run test:e2e   # e2e tests (REST + GraphQL), run against an in-memory SQLite DB
npm run test:cov   # coverage report
```

## Exploring the API

- **Swagger**: `http://localhost:3001/api`
- **GraphQL Playground**: `http://localhost:3001/graphql`
- **Performance**: [PERFORMANCE.md](PERFORMANCE.md): a GraphQL performance assessment with realistic seed data, a per-request SQL query counter, k6 load tests, DataLoader, `EXPLAIN ANALYZE` with an index migration, and query depth/complexity/page-size limits. Tooling lives in [perf/](perf/).
- **Postman collection**: [postman/](postman/) — every REST endpoint with both success and failure scenarios (validation errors, auth/role failures, not-found cases), wired up to use the deterministic seed data. See [postman/README.md](postman/README.md) for setup.

## Seed data

On startup, `SeedService` seeds (idempotently — it checks what already exists and skips re-seeding):

- An **admin** account (`ADMIN_USER_EMAIL`) and a **default** account (`DEFAULT_USER_EMAIL`), both using `DEFAULT_PASSWORD`.
- ~50 `@test.com` demo users and ~50 projects, with ownership and membership assigned from a fixed table in `test-data/projects.json` (`memberIndices`) — the same users end up owning/editing the same projects on every fresh seed, not randomly.
- 4 labels and 5 issues per project, cycling through fixed templates by project/issue index (see `seedIssuesLabelsAndComments` in [seed.service.ts](src/services/seed/seed.service.ts)), plus a handful of comments.
- A small set of deliberately-invalid requests (duplicate email, bad UUID, missing fields, etc.) run through the real code paths (the global `ValidationPipe` for body validation, the service methods for everything else), so the `logs` table also has realistic `WARN` entries to query, not just `INFO`.

## Project structure

```
src/
  auth/                 session auth, local strategy, guards, password reset
  resources/
    user/                user CRUD, roles
    project/              project CRUD, membership, project-role guard
    issue/                issue CRUD, status workflow, assignment
    label/                label CRUD (project-scoped)
    comment/              comment CRUD (issue-scoped)
  graphql/               GraphQL resolvers (mirrors selected REST resources)
  logger/                structured logging service + queryable log entity
  cache/                 Redis-backed cache service
  metrics/               Prometheus metrics
  health/                Terminus health checks
  services/
    seed/                 deterministic demo data
    email/                 outgoing email (EmailJS)
    token/                 JWT-based verification/reset tokens
  shared/
    validation/           global ValidationPipe provider + custom validators
    exceptions/           global exception filter (REST + GraphQL)
test/
  e2e-tests/             REST + GraphQL end-to-end tests
  data/                  shared test fixtures
postman/                 Postman collection + its own README
```

## License

Private/unlicensed portfolio project.
