// k6 load test for the GraphQL API.
//
// One operation per run (OPERATION=project-issues | projects-overview), so throughput and latency belong to that
// operation alone. k6 runs in a container on the app's Docker network (see perf/docker-compose.perf.yml):
//
//   docker run --rm --network taskflow_default -v "${PWD}/perf:/perf" -e OPERATION=project-issues -e RUN_LABEL=baseline grafana/k6:1.0.0 run /perf/k6/graphql-load.js
//
// Design choices:
// - constant-arrival-rate: k6 starts N requests per second regardless of how fast the server answers. With a
//   fixed number of virtual users instead (closed model), a slow server would simply receive fewer requests and
//   look better than it is. If the server can't keep up, k6 reports `dropped_iterations`.
// - Checks look at the GraphQL `errors` field, not only the HTTP status: GraphQL returns 200 even when a resolver fails.
// - The app's `X-SQL-Query-Count` header (SQL_QUERY_COUNTER=true) is recorded as a custom metric: queries per request.
// - Warm-up: setup() sends a few requests first (tagged `warmup`, excluded from the measured latency). A freshly started
//   Node process runs unoptimized code and has cold pools and caches; without this, the first run after a restart
//   showed a p95 3.6x higher than the same run repeated.
import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://nestjs-app:3001'; // the app's name on the Docker network
const EMAIL = __ENV.PERF_EMAIL || 'perf.admin@perf.taskflow.test';
const PASSWORD = __ENV.PERF_PASSWORD || 'P@ssword123';
const OPERATION = __ENV.OPERATION || 'project-issues';
const RUN_LABEL = __ENV.RUN_LABEL || 'run';

// Same load before and after each change, so results are comparable. The biggest seeded project (1,037 issues) is
// used on purpose: it's the worst case, and a fixed id keeps runs repeatable.
const OPERATIONS = {
  'project-issues': {
    name: 'ProjectIssues',
    file: '../operations/project-issues.graphql',
    variables: { id: __ENV.PROJECT_ID || 'db800e65-f372-481f-821d-07a614e5bd65', first: 50 },
    rate: 10, timeUnit: '1s', duration: '60s',
    p95Ms: 250,
  },
  'projects-overview': {
    name: 'ProjectsOverview',
    file: '../operations/projects-overview.graphql',
    variables: { first: 10 },
    rate: 1, timeUnit: '2s', duration: '60s', // one request every 2 s; a single baseline request takes ~3 s
    p95Ms: 1000,
  },
};

const operation = OPERATIONS[OPERATION];
if (!operation) {
  throw new Error(`Unknown OPERATION "${OPERATION}". Use one of: ${Object.keys(OPERATIONS).join(', ')}`);
}
const query = open(operation.file);
const rate = Number(__ENV.RATE || operation.rate);
const duration = __ENV.DURATION || operation.duration; // in seconds, e.g. "60s"

const sqlQueries = new Trend('sql_queries_per_request');
const graphqlErrors = new Rate('graphql_errors');

const tagged = (metric) => `${metric}{name:${operation.name}}`; // excludes the login and warm-up requests made in setup()
const WARMUP_REQUESTS = Number(__ENV.WARMUP_REQUESTS || 5);

export const options = {
  scenarios: {
    [OPERATION]: {
      executor: 'constant-arrival-rate',
      rate,
      timeUnit: operation.timeUnit,
      duration,
      preAllocatedVUs: 10,
      maxVUs: 50,
    },
  },
  thresholds: {
    [tagged('http_req_duration')]: [`p(95)<${operation.p95Ms}`],
    graphql_errors: ['rate==0'],
    checks: ['rate>0.99'],
  },
  summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)', 'max'],
};

export function setup() {
  const login = http.post(`${BASE_URL}/auth/login`, JSON.stringify({ email: EMAIL, password: PASSWORD }), {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'login' },
  });
  if (login.status !== 201) {
    throw new Error(`Login failed with ${login.status}. Is the app running and seeded (npm run seed:perf)?`);
  }
  const cookie = `SESSION_ID=${login.cookies.SESSION_ID[0].value}`;

  for (let i = 0; i < WARMUP_REQUESTS; i++) {
    http.post(`${BASE_URL}/graphql`, JSON.stringify({ query, variables: operation.variables }), {
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      tags: { name: 'warmup' },
      timeout: '120s',
    });
  }
  return { cookie };
}

export default function (data) {
  const response = http.post(`${BASE_URL}/graphql`, JSON.stringify({ query, variables: operation.variables }), {
    headers: { 'Content-Type': 'application/json', Cookie: data.cookie },
    tags: { name: operation.name },
    timeout: '120s',
  });

  const body = response.json();
  const hasErrors = !body || Array.isArray(body.errors);
  graphqlErrors.add(hasErrors);
  check(response, {
    'status is 200': (r) => r.status === 200,
    'no GraphQL errors': () => !hasErrors,
    'data returned': () => Boolean(body && body.data),
  });

  const queryCount = response.headers['X-Sql-Query-Count'];
  if (queryCount !== undefined) {
    sqlQueries.add(Number(queryCount));
  }
}

// Prints a compact result table and saves the full summary as JSON, so runs can be compared later.
export function handleSummary(data) {
  const metric = (key) => (data.metrics[key] ? data.metrics[key].values : {});
  const latency = metric(tagged('http_req_duration'));
  const iterations = metric('iterations');
  const dropped = metric('dropped_iterations');
  const queries = metric('sql_queries_per_request');
  const fmt = (value, unit = '') => (value === undefined ? 'n/a' : `${value.toFixed(value < 10 ? 2 : 0)}${unit}`);

  const lines = [
    `${operation.name} | ${RUN_LABEL} | target ${rate} req per ${operation.timeUnit}`,
    `  latency      p50 ${fmt(latency.med, ' ms')}   p95 ${fmt(latency['p(95)'], ' ms')}   p99 ${fmt(latency['p(99)'], ' ms')}   max ${fmt(latency.max, ' ms')}`,
    // Completed requests over the load window (iterations.rate would also count the wait for in-flight requests at the end).
    `  throughput   ${fmt((iterations.count || 0) / parseInt(duration, 10), ' req/s')} completed (${iterations.count || 0} requests in ${duration}), ${dropped.count || 0} dropped`,
    `  SQL queries  ${fmt(queries.avg)} per request on average (max ${fmt(queries.max)})`,
    `  errors       GraphQL error rate ${fmt((metric('graphql_errors').rate || 0) * 100, '%')}, checks passed ${fmt((metric('checks').rate || 0) * 100, '%')}`,
    `  thresholds   ${Object.entries(data.metrics).filter(([, m]) => m.thresholds).map(([key, m]) => `${key}: ${Object.values(m.thresholds).every(t => t.ok) ? 'PASS' : 'FAIL'}`).join(', ')}`,
  ];

  return {
    stdout: `\n${lines.join('\n')}\n\n`,
    // Timestamped, so a repeated run never overwrites an earlier one
    [`/perf/results/${OPERATION}-${RUN_LABEL}-${new Date().toISOString().slice(0, 19).replace(/:/g, '')}.json`]: JSON.stringify(data, null, 2),
  };
}
