# Postman Collection

This folder contains a Postman collection covering every REST endpoint in the app, with both success and failure scenarios (validation errors, auth/role failures, not-found cases).

GraphQL endpoints are not included here — use the built-in GraphQL Playground at `/graphql` for those.

## Setup

1. Import `TaskFlow.postman_collection.json` into Postman.
2. Open the collection, go to its **Variables** tab, and fill in the "Current value" column for `adminEmail` / `adminPassword` / `defaultEmail` / `defaultPassword` with the seeded credentials from your local `.env` (`ADMIN_USER_EMAIL`, `DEFAULT_USER_EMAIL`, `DEFAULT_PASSWORD`). **Never commit real values into these fields** — they ship blank on purpose. Everything else the collection needs (base URL, seeded test emails, throwaway ids) is already filled in as collection variables, so no separate environment is required.
3. Start the app (`npm run start:dev`, or via `docker-compose up`), then run requests against `{{baseUrl}}` (defaults to `http://localhost:3001`, also editable in the Variables tab).

## Auth model: session cookies

This API uses session-cookie auth (`express-session` + Passport), not bearer tokens. Run one of the **Auth > Login** requests first — Postman's cookie jar automatically stores the `SESSION_ID` cookie and attaches it to subsequent requests against the same `baseUrl`.

Requests named `... - 401 not logged in` explicitly disable auth for that single request (`noauth` override), so they correctly exercise the unauthenticated path even if you're logged in from a previous request.

Switching between "as admin" and "as regular user" scenarios means re-running the corresponding **Login** request first, since logging in as a different user overwrites the session cookie.

## Seeded test data (deterministic)

`SeedService` assigns `@test.com` users to projects using a fixed `memberIndices` list per project in `test-data/projects.json`, so the same users end up owning/editing the same projects on every fresh seed — not random each time. This collection relies on that determinism for role-based scenarios that a freshly-created, empty project can't exercise on its own (a project you create via this collection only ever has one member: you, the owner):

- `testOwnerEmail` (`jamessmith@test.com`) is always the **OWNER** of the seeded **"Project Phoenix"** project.
- `testEditorEmail` (`patriciaperez@test.com`) is always an **EDITOR** (not owner) on that same project.
- `testDeletableUserEmail` (`sharoncollins@test.com`) is a seeded user not involved in Project Phoenix, used for the **Delete user** demo so it doesn't disturb the pairing above.

These are hardcoded, safe-to-commit collection variables — they're derived from the committed, non-secret `src/services/seed/test-data/users.json` / `projects.json`, so they're identical for anyone who clones the repo and seeds a fresh database. Only the shared password for these accounts (`DEFAULT_PASSWORD`, used for every seeded user including admin/default) is machine-specific, which is why `defaultPassword` (like `adminEmail`/`adminPassword`/`defaultEmail`) ships blank instead of committed.

Run **Auth > Login > "Login - success (seeded project editor)"** then **Project > "Resolve seeded project id (Project Phoenix)"** before the "insufficient project role" 403 requests — the resolver looks up the project by name and stores its (DB-generated, non-deterministic) id as `seededProjectId`.

Seeding also deterministically creates 4 labels (`bug`, `frontend`, `backend`, `urgent`) and 5 issues per project — see `SeedService.seedIssuesLabelsAndComments` for the exact templates/cycling logic. On Project Phoenix specifically, issue #2 ("Design initial database schema") always has one seeded comment. The **Issue** and **Label** folders each have a "Resolve seeded ... id" request (same pattern as the project one) that looks these up by title/name and stores `seededIssueId` / `seededLabelId`.

## Issue tracking: roles

- **Issue / Label**: creating or updating requires an OWNER, ADMIN, or EDITOR project role; deleting requires OWNER or ADMIN. A global admin bypasses project membership entirely.
- **Comment**: any project member — including VIEWER — may create one (reuses `IssueService`'s own "must be a project member" check, since that's exactly what commenting requires). Editing or deleting a comment is restricted to its own author or a project OWNER/ADMIN.
- Seeding only creates OWNER + EDITOR relationships, so no seeded account has a VIEWER role by default. That's enough for the "Delete issue/label - 403" requests (the seeded **editor** genuinely lacks delete rights), but the "Create/Update issue/label - 403" requests need a VIEWER specifically, since EDITOR *can* create/update — those requests' descriptions call this out and need a manually-assigned VIEWER to actually demonstrate.

## Validation (bad data) requests

Request bodies are validated by a global `ValidationPipe` using the `class-validator` rules on each DTO. A rejected body returns 400 with one message per invalid field:

```json
{ "statusCode": 400, "message": ["projectId must be a UUID", "title should not be empty"], "error": "Bad Request" }
```

Each folder has requests that send bad data on purpose: wrong types, malformed emails/UUIDs/dates/colors, unknown enum values, values longer than their database column, and `null` on fields that can't be cleared. Their test scripts check the exact `message` array, so the Tests tab shows which rule fired. A few requests show *where* validation happens in the request lifecycle:

- **Guards run before validation.** "Login - 401 malformed email" and "Update project - 403 invalid body on a project you can't edit" send invalid bodies but get 401/403, because the auth/role guard rejects the request before the pipe runs.
- **Validation runs before the handler.** "Update comment - 400 body too long (validated before lookup)" targets a comment that doesn't exist, yet returns 400, not 404: the body is rejected before the controller ever looks the comment up.
- **Unknown fields are stripped, not rejected.** "Create issue - unknown fields are stripped" sends `status: "DONE"` and a fake `createdAt`; both are dropped (`whitelist: true`), so the issue is created as `TODO`. Note that this one creates a real issue in Project Phoenix.

Validation failures are also written to the log table: run **Logger > "Get logs - filter by level"** (`WARN`) afterwards and look for the `ValidationPipe` context. Only the property and rule names are logged, never the submitted values.

## Other requests that need manual values

A few flows involve values that only exist outside the API response (e.g. sent via email, or requiring a fresh, non-duplicate email per run):

- **Register**: change `newUserEmail` between runs, or you'll hit the "already registered" (409) case instead of "success".
- **Verify user** / **Reset password (via emailed link)**: `verifyToken` / `resetToken` are emailed to the user (or, in local dev without a real email provider configured, logged to the console/log table). Copy the token from there into the collection variable before running these.

## Chaining

- "Create project - success (admin)" automatically sets the `projectId` collection variable from its response, so the ad-hoc CRUD lifecycle in the **Project** folder (get/update/delete your own freshly-created project) can chain off it. That folder is ordered so its "delete" success case runs last — running requests out of order (e.g. delete, then get) will correctly 403/404 for anything after the delete.
- "Resolve seeded project id (Project Phoenix)" and "Resolve seeded user id (Sharon Collins)" similarly set `seededProjectId` / `userId` for the seeded-data scenarios described above.
