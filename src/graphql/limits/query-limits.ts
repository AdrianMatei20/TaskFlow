/**
 * Limits that protect the GraphQL API from queries that are too expensive to run. A client chooses the shape and size
 * of every response, so without limits a single request can ask for an arbitrary amount of work.
 *
 * 1. Page size (validated per field): Project.issues(first) accepts 1..MAX_PAGE_SIZE.
 * 2. Depth (validated before execution): rejects deeply nested queries. Today's schema has no cycles (the deepest
 *    legitimate query is projects -> issues -> assignee -> field = 4), so this guards against future relations such as
 *    Issue.project or Comment.issue, which would allow project.issues.project.issues... loops.
 * 3. Complexity (computed before execution, with the request's variables): estimates the number of fields the query
 *    will resolve, multiplying list fields by their page size, and rejects it above MAX_QUERY_COMPLEXITY. This is what
 *    catches wide queries: a large `first`, or the same expensive field repeated under 50 aliases.
 */

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const MAX_QUERY_DEPTH = 6;

// Every field costs 1; a list field costs (expected number of items) x (cost of one item).
// Sized from the measured operations: ProjectsOverview (all projects, 10 issues each) costs ~7,700 and takes ~400 ms;
// ProjectIssues (50 issues) costs ~560. Anything above 10,000 is rejected.
export const MAX_QUERY_COMPLEXITY = 10_000;

// Lists without pagination arguments (projects, userProjects) have no size the estimator can read, so it assumes this
// many items. The admin `projects` list actually has 350 items with the perf seed: the estimate is only as good as this
// guess, which is why unpaginated lists should get `first`/`after` arguments (see PERFORMANCE.md).
export const UNPAGINATED_LIST_ESTIMATE = 100;
