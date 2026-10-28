// Logs in as a perf user, sends one GraphQL operation and prints its SQL query count, duration and result size.
//
//   node perf/scripts/run-operation.mjs <operation file> [variables as JSON]
//   node perf/scripts/run-operation.mjs perf/operations/projects-overview.graphql '{"first": 10}'
//
// The app must run with SQL_QUERY_COUNTER=true for the query count to appear.
import { readFileSync } from 'node:fs';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3001';
const EMAIL = process.env.PERF_EMAIL ?? 'perf.admin@perf.taskflow.test';
const PASSWORD = process.env.PERF_PASSWORD ?? 'P@ssword123';

const [operationFile, variablesJson = '{}'] = process.argv.slice(2);
if (!operationFile) {
  console.error('Usage: node perf/scripts/run-operation.mjs <operation file> [variables as JSON]');
  process.exit(1);
}

const login = await fetch(`${BASE_URL}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
}).catch((error) => {
  console.error(`Can't reach ${BASE_URL} (${error.cause?.code ?? error.message}). Start the app first, in another terminal:`);
  console.error('  npx cross-env PG_HOST=localhost REDIS_HOST=localhost SQL_QUERY_COUNTER=true npm run start');
  process.exit(1);
});
if (!login.ok) {
  console.error(`Login failed (${login.status}). Did you run "npm run seed:perf"?`);
  process.exit(1);
}
const cookie = login.headers.get('set-cookie').split(';')[0];

const startedAt = performance.now();
const response = await fetch(`${BASE_URL}/graphql`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({ query: readFileSync(operationFile, 'utf8'), variables: JSON.parse(variablesJson) }),
});
const body = await response.text();
const durationMs = performance.now() - startedAt;

const result = JSON.parse(body);
console.log(`HTTP ${response.status} in ${durationMs.toFixed(0)} ms, ${(body.length / 1024).toFixed(0)} KB`);
console.log(`SQL queries: ${response.headers.get('x-sql-query-count') ?? 'n/a (start the app with SQL_QUERY_COUNTER=true)'}`);
if (result.errors) {
  console.log('GraphQL errors:', JSON.stringify(result.errors, null, 2));
}
