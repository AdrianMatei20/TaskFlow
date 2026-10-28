// Sends an inline GraphQL query as the perf admin and prints status, cost and errors. Handy for trying the limits:
//   node perf/scripts/graphql-query.mjs '{ projects { id issues(first: 100) { id } } }'
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3002';
const [query, variablesJson = '{}'] = process.argv.slice(2);

const login = await fetch(`${BASE_URL}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: process.env.PERF_EMAIL ?? 'perf.admin@perf.taskflow.test', password: process.env.PERF_PASSWORD ?? 'P@ssword123' }),
}).catch((error) => { console.error(`Can't reach ${BASE_URL}: ${error.cause?.code ?? error.message}`); process.exit(1); });
const cookie = login.headers.get('set-cookie').split(';')[0];

const response = await fetch(`${BASE_URL}/graphql`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({ query, variables: JSON.parse(variablesJson) }),
});
const body = await response.json();
console.log(`HTTP ${response.status}, SQL queries: ${response.headers.get('x-sql-query-count') ?? 'n/a'}, complexity: ${JSON.stringify(body.extensions?.complexity ?? body.errors?.[0]?.extensions?.complexity ?? 'n/a')}`);
for (const error of body.errors ?? []) {
  console.log(`  error [${error.extensions?.code}] ${error.message}${error.extensions?.originalError ? ' ' + JSON.stringify(error.extensions.originalError.message) : ''}`);
}
if (!body.errors) console.log(`  data: ${JSON.stringify(body.data).slice(0, 120)}...`);
