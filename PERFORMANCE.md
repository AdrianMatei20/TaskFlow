# GraphQL performance assessment

A step-by-step performance assessment of TaskFlow's GraphQL API (NestJS, Apollo code-first, PostgreSQL, TypeORM, Redis): realistic data, a per-request SQL query counter, k6 load tests, DataLoader, query plan analysis and query cost limits.

## Summary

| | Before | After | Change |
|---|---|---|---|
| SQL queries per request, ProjectIssues (1 project, 50 issues) | 95 | 3.5 avg (max 5) | **-96%** |
| SQL queries per request, ProjectsOverview (350 projects × 10 issues) | 3,044 | 4 | **-99.9%** |
| ProjectIssues @ 10 req/s: p50 / p95 / p99 | 42 / 1,783 / 2,064 ms | 16 / 28 / 34 ms | p95 **64× lower** |
| ProjectsOverview @ 0.5 req/s: p50 / p95 / p99 | 10,386 / 14,585 / 14,665 ms | 412 / 574 / 883 ms | p95 **25× lower** |
| ProjectIssues sustained throughput (one Node process) | < 10 req/s | ~100 req/s | **~10×** |
| Heaviest SQL query (issue pages for all projects) | 24.6 ms | 5.0 ms | **5× lower** |
| Unbounded queries | `first: 0` returned every row; no limits | page size 1-100, depth 6, complexity 10,000 | |

Both operations now meet their p95 targets (250 ms and 1 s). After these fixes the bottleneck is the CPU of the single Node.js process (~1 core saturated while Postgres sits at ~20%), not the database.

## Setup and methodology

**Data.** `npm run seed:perf` ([perf/seed/seed-perf.ts](perf/seed/seed-perf.ts)) loads 2,000 users, 300 projects, 3,942 memberships, 1,800 labels, 10,000 issues, 15,105 issue-label links and 30,140 comments. It is deterministic (seeded PRNG, so every run produces the same data and the same ids) and deliberately skewed: issue counts per project follow a long tail (biggest 1,037, median 16, smallest 9), because the big projects are where N+1 problems show. It ends with `ANALYZE`, so the planner has fresh statistics.

**Operations** ([perf/operations/](perf/operations/)):
- `ProjectIssues`: one project (the biggest, 1,037 issues) with its 50 latest issues and each issue's assignee and reporter.
- `ProjectsOverview`: the admin list of all 350 projects (300 seeded + 50 from the regular seed), each with its owner and 10 latest issues with assignees.

**Load** ([perf/k6/graphql-load.js](perf/k6/graphql-load.js)), k6 1.0.0 in Docker:
- `constant-arrival-rate`: k6 starts N requests per second however slowly the server answers, so a slow server can't look good by receiving fewer requests (overload shows as dropped iterations). The same rate is used before and after every change.
- Checks the GraphQL `errors` field, not only the HTTP status (GraphQL returns 200 when a resolver fails).
- Records the app's `X-SQL-Query-Count` header as a metric: queries per request.
- Thresholds: p95 < 250 ms (ProjectIssues) and < 1 s (ProjectsOverview), GraphQL error rate 0, checks > 99%.
- 5 warm-up requests in `setup()`, excluded from the results (added in step 6, see "Methodology lessons").

**Query counter** ([sql-query-counter.ts](src/shared/query-counter/sql-query-counter.ts), enabled with `SQL_QUERY_COUNTER=true`): an `AsyncLocalStorage` context per HTTP request plus a TypeORM logger that counts every statement. TypeORM calls `logQuery()` for every query even when logging is off. Each request logs its count and the statements that ran 5+ times (likely N+1), and returns the count in a response header.

**Environment.** App, Postgres 12, Redis 7 and k6 all in Docker on the same network (Docker Desktop, Windows, 8 CPUs), via [perf/docker-compose.perf.yml](perf/docker-compose.perf.yml). See "Methodology lessons" for why the app must not run on the host.

## Results by step

### ProjectIssues @ 10 req/s (60 s; final run 120 s)

| Step | SQL / request | p50 | p95 | p99 | Completed | Dropped |
|---|---|---|---|---|---|---|
| Baseline: nested field resolvers, N+1 | 94 | 42 ms | 1,783 ms | 2,064 ms | 9.88 req/s | 8 |
| DataLoader | 3.5 | 19 ms | 43 ms | 57 ms | 10 req/s | 0 |
| + index and LATERAL query | 3.5 | 20 ms | 38 ms | 47 ms | 10 req/s | 0 |
| + query limits (final, with warm-up) | 3.5 | 16 ms | 28 ms | 34 ms | 10 req/s | 0 |

### ProjectsOverview @ 0.5 req/s (60 s; final run 300 s)

| Step | SQL / request | p50 | p95 | p99 | Completed |
|---|---|---|---|---|---|
| Baseline | 3,044 | 10,386 ms | 14,585 ms | 14,665 ms | 0.52 req/s |
| DataLoader | 4 | 667 ms | 1,000 ms | 1,125 ms | 0.52 req/s |
| + index and LATERAL query | 4 | 409 ms | 538 ms | 613 ms | 0.52 req/s |
| + query limits (final, 151 requests, with warm-up) | 4 | 412 ms | 574 ms | 883 ms | 0.50 req/s |

A single baseline overview request takes ~2.9 s on its own. Under load, requests overlap and each makes ~3,000 sequential queries, so they compete for the 10 database connections and the event loop. That's why the baseline p50 is 10 s.

### Capacity: ProjectIssues at higher rates (30 s)

| Step | Target | Completed | Dropped | p50 | p95 |
|---|---|---|---|---|---|
| Baseline | 10 req/s | 9.88 req/s | 8 | 42 ms | 1,783 ms |
| DataLoader | 100 req/s | 80 req/s | 602 | 509 ms | 752 ms |
| + index and LATERAL | 100 req/s | 97 req/s | 97 | 10 ms | 505 ms |
| Final | 100 req/s | 100 req/s | 4 | 11 ms | 34 ms |
| Final | 150 req/s | 87 req/s | 1,901 | 520 ms | 734 ms |

Above ~100 req/s the app container runs at 115-150% CPU (one core saturated by the JavaScript thread, plus GC and I/O threads) while Postgres stays around 20%: the limit is now the single Node.js process. Past saturation, completed throughput *drops* (87 req/s at 150 vs 100 at 100), because queued requests time out or overlap.

### The heaviest query: issue pages (median of 25 `EXPLAIN ANALYZE` runs)

| Query | One project, 50 issues | 350 projects, 10 issues each |
|---|---|---|
| `ROW_NUMBER()` window function, no index (step 4) | 7.02 ms | 24.61 ms |
| Window function + index | 4.18 ms | 22.09 ms |
| LATERAL + `LIMIT`, no index | 3.19 ms | 486.88 ms |
| **LATERAL + `LIMIT` + index (final)** | **0.67 ms** | **5.00 ms** |

Plans are saved in [perf/explain/](perf/explain/) (`*.before.txt`, `*.after-index.txt`, `*.after-lateral.txt`).

## What changed

1. **Seed with realistic volume.** See "Setup and methodology".
2. **Query counter and nested resolvers.** `Project.issues(first)` and `Issue.assignee` / `Issue.reporter` became `@ResolveField`s: one issue query per project, one user query per issue. `@RelationId` gives the resolvers the foreign key ids without loading the relations; for many-to-one relations TypeORM reads them from the row's own column, with no extra query and no schema change.
   - Pitfall found: TypeORM's `find({ where: { project: { id } }, take })` costs two queries (relation filter → join → "join + take" → `SELECT DISTINCT` of ids first). Filtering on the foreign key column makes it a single `LIMIT` query.
3. **DataLoader** ([graphql-loaders.ts](src/graphql/loaders/graphql-loaders.ts)). New loaders are created for every request in the GraphQL context factory (`GraphQLModule.forRootAsync`), not as request-scoped providers:
   - The cache lives exactly as long as the request, so users never see each other's data or stale data.
   - Nest doesn't re-create resolvers per request.
   - All `load(id)` calls made while a list resolves end up in one `WHERE id IN (...)` query, and each user is loaded once per request.
   - The user batch selects only `id, firstname, lastname`; the per-issue lookups it replaced loaded every column, including the password hash.
4. **Index and query rewrite.**
   - **Index:** `IDX_issue_project_created_at` on `issue("projectId", "createdAt")`, added by a migration ([1793145600000-AddIssueProjectCreatedAtIndex.ts](src/database/migrations/1793145600000-AddIssueProjectCreatedAtIndex.ts)) with `CREATE INDEX CONCURRENTLY`, which doesn't block writes.
   - **Migration setup:** the migration opts out of transactions (`CONCURRENTLY` can't run in one), which needs `migrationsTransactionMode: 'each'`. It's also declared with `@Index` on the entity, because `synchronize: true` drops indexes it doesn't know about; I checked that the index's OID is unchanged after a restart. Migrations run before `synchronize`, so on deploy the index is built concurrently first.
   - **Query:** the issue-page query became a `LATERAL` join. Each project walks the index backwards and stops after N rows. The window function had to number every issue of each project (Postgres 12 can't stop it early) and then re-scanned the table to fetch the rows.
   - **Lesson:** the index and the query shape only work together: LATERAL without the index is 20× *slower*.
   - **Portability:** SQLite (used by the e2e tests) has no LATERAL, so the window version is kept for it. I verified that both return identical rows in identical order for `first` = 0, 1, 10, 50 and 2000.
5. **Query limits** ([query-limits.ts](src/graphql/limits/query-limits.ts)):
   - **Page size:** `Project.issues(first)` accepts 1-100. It's an `@ArgsType` validated by the global ValidationPipe.
   - **Depth:** 6. It's a custom validation rule ([depth-limit.rule.ts](src/graphql/limits/depth-limit.rule.ts)) that ignores introspection and handles fragments. The schema has no cycles today (the deepest legal query is 4), so it guards future relations.
   - **Complexity:** 10,000, enforced by an Apollo plugin ([complexity.plugin.ts](src/graphql/limits/complexity.plugin.ts), `graphql-query-complexity`). It's a plugin because cost depends on variables, which validation rules don't see.
     - **Cost model:** each field costs 1; `Project.issues` costs `first ×` the cost of one issue.
     - **Rejection:** over-budget queries get HTTP 400 `QUERY_TOO_COMPLEX` before any resolver runs. ProjectsOverview costs 7,600 and ProjectIssues 553; the cost is returned in `extensions.complexity`.
     - **Clamp:** a negative `first` is counted as 1. Otherwise one alias with `first: -1000000` would cancel the cost of other, expensive aliases. That alias would fail validation, but GraphQL errors are per field, so the expensive ones would still run.

**Tests added:**
- **e2e:** batching (each batch query runs once for several projects), the per-project limit, the page size, a complexity rejection with no issue loading, and the cost in `extensions`.
- **Unit:** the depth rule (with a cyclic test schema) and the cost formula.
- **Checking the checks:** each new test was confirmed to fail when the code it protects is removed.

## Open findings, prioritised

1. **P1: `userProjects` takes 2.2-2.5 s for a user in 7 projects (589-byte response).** `ProjectService.findAllByUserId` loads the whole `user_project_role` table (4,228 rows) with every project and all its members, then filters in JavaScript, so it gets slower as the whole database grows. Fix: filter by `userId` in SQL and add an index on `user_project_role("userId")`.
2. **P1 (bug): deleting a label that is attached to an issue (or a project containing one) fails with a 500 on Postgres.** The join table's foreign key to `label` is `ON DELETE NO ACTION`: TypeORM applied `onDelete: 'CASCADE'` only to the owning (issue) side. Fix: cascade on the inverse side plus a migration that alters the foreign key. The e2e tests missed it because SQLite doesn't enforce foreign keys by default.
3. **P1: one Node process is the throughput ceiling (~100 req/s for ProjectIssues).** Scaling out needs more than one process, but sessions use express-session's default in-memory store: lost on restart, not shared between instances, and not meant for production. Fix: a Redis session store (Redis is already there), then several instances (or Node cluster) behind a load balancer.
4. **P2: unpaginated lists.**
   - **Affected:** `projects`, `userProjects` and the top-level `issues(projectId)` return everything.
   - **Measured:** `issues(projectId)` on the biggest project takes 1.0-1.2 s. Its `ISSUE_RELATIONS` join repeats every issue for every project member: 11,046 rows for 1,037 issues (10.6×).
   - **Complexity gap:** these lists also defeat the complexity limit. `issues(projectId)` is estimated at cost 5, and `projects` is assumed to have 100 items when it has 350.
   - **Fix:** cursor pagination (`first`/`after`) and dropping the members join from issue lists.
5. **P2: missing foreign key indexes:** `comment.issueId`, `label.projectId`, `user_project_role.projectId` and `.userId`, and `issue.assigneeId` / `.reporterId`. Postgres doesn't create them automatically, and cascading deletes scan whole tables: the perf seed's cleanup takes 20-40 s, almost all in cascades.
6. **P2: e2e tests run on SQLite.** They missed finding 2, and the Postgres-only LATERAL path is checked only by the row comparison above. Fix: run the e2e suite against Postgres (e.g. Testcontainers, or a Postgres service in CI).
7. **P3: ordering has no tie-breaker.** `ORDER BY "createdAt" DESC` isn't deterministic when two issues share a timestamp (none do in the seed). Fix: `ORDER BY "createdAt" DESC, id DESC` with an index on `("projectId", "createdAt", id)`, which cursor pagination needs anyway.
8. **P3: `synchronize: true` in production** can drop columns and indexes when entities change. The migration setup added here makes it possible to switch to migrations only.
9. **P3: every authenticated request reloads the full user row** (session deserialization, including the password hash): one query per request. The session could store the few fields the guards need.

## Methodology lessons

- **Measure on a production-like network path.** My first baseline ran the app on Windows against Postgres in Docker. Through Docker Desktop's port forwarding, a parameterized query took **50 ms**; inside the Docker network it took **0.38 ms**. Queries without parameters took under 1 ms in both places, which points to the port forwarding's handling of the extended protocol's multi-message round trips. N+1 cost is roughly queries × round-trip time, so this inflated exactly what was being measured (ProjectsOverview p50 22 s instead of 10 s). Those runs are kept as `perf/results/host-network-*.json` and not used in the tables.
- **Warm up.** The first k6 run after a container restart showed ProjectsOverview p95 1,943 ms against 533 ms when repeated: unoptimized (not yet JIT-compiled) code, plus empty pools and caches. The k6 script now sends warm-up requests first. The baseline and DataLoader runs were made before this was added; their latency is dominated by thousands of queries per request, so a cold start doesn't change their conclusions.
- **Runs vary; tails vary most.** A second set of runs with the same code and load (`perf/results/*-repeat-run.json`) gave:

  | Run | Same run in the tables | Repeat run |
  |---|---|---|
  | ProjectIssues baseline @ 10 req/s, p50 / p95 | 42 / 1,783 ms | 3,159 / 10,809 ms (144 dropped) |
  | ProjectsOverview baseline, p50 / p95 | 10,386 / 14,585 ms | 9,688 / 32,881 ms |
  | ProjectIssues DataLoader @ 10 req/s, p50 / p95 | 19 / 43 ms | 51 / 99 ms |
  | ProjectsOverview DataLoader, p50 / p95 | 667 / 1,000 ms | 698 / 967 ms |

  The before/after conclusions hold in both sets, by one to two orders of magnitude, but individual p95 values near saturation can differ by several times. Small differences between steps (e.g. ProjectIssues p95 43 → 38 ms) are within noise. Most configurations were run once; the final runs are longer (120 s and 300 s) for more stable percentiles, since 30 requests give a p95 that is effectively the second-slowest request. Result files are now timestamped, so runs never overwrite each other.
- **Count queries, not only time.** The query count is deterministic (the same in every environment and run), so it's the most reliable N+1 signal. Latency is what users feel, but it depends on the environment.

## Reproduce

```bash
# Postgres + Redis, perf data, migration
docker compose up -d postgres redis
npx cross-env PG_HOST=localhost npm run seed:perf
npx cross-env PG_HOST=localhost npm run migration:run

# App inside the Docker network with the query counter (port 3002)
docker compose -f docker-compose.yml -f perf/docker-compose.perf.yml up -d --build nestjs-app

# One request: SQL query count and time
BASE_URL=http://localhost:3002 node perf/scripts/run-operation.mjs perf/operations/projects-overview.graphql '{"first": 10}'

# Load tests (k6 joins the Docker network; in PowerShell use ${PWD} the same way)
docker run --rm --network taskflow_default -v "${PWD}/perf:/perf" -e OPERATION=project-issues -e RUN_LABEL=final -e DURATION=120s grafana/k6:1.0.0 run /perf/k6/graphql-load.js
docker run --rm --network taskflow_default -v "${PWD}/perf:/perf" -e OPERATION=projects-overview -e RUN_LABEL=final -e DURATION=300s grafana/k6:1.0.0 run /perf/k6/graphql-load.js

# Query plans
docker exec -i postgres psql -U postgres < perf/explain/issue-pages-all-projects.lateral.sql
```
