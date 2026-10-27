import { AsyncLocalStorage } from 'async_hooks';
import { Logger } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { AdvancedConsoleLogger, LoggerOptions, QueryRunner } from 'typeorm';

/**
 * Per-request SQL query counter, used to measure N+1 problems.
 *
 * How it works:
 * 1. The middleware opens an AsyncLocalStorage context for each HTTP request. Node carries that context through every
 *    `await` that follows, so code deep inside a resolver can find "the current request" without it being passed around.
 * 2. TypeORM calls `logger.logQuery()` before every SQL statement it sends (even with logging disabled; the default
 *    logger just returns early). QueryCountingLogger increments the counter of the current request.
 * 3. Right before the response headers are sent, the middleware adds an `X-SQL-Query-Count` header (k6 reads it), and
 *    once the response is finished it logs one summary line, plus the statements that ran 5+ times (likely N+1).
 *
 * Enabled with SQL_QUERY_COUNTER=true. It exposes internal details, so keep it off in production.
 */

interface QueryCounterStore {
  count: number;
  statements: Map<string, number>;
}

const requestContext = new AsyncLocalStorage<QueryCounterStore>();
const REPEATED_STATEMENT_THRESHOLD = 5;
const logger = new Logger('SqlQueryCounter');

export const SQL_QUERY_COUNT_HEADER = 'X-SQL-Query-Count';

export function isSqlQueryCounterEnabled(): boolean {
  return process.env.SQL_QUERY_COUNTER === 'true';
}

// Keeps TypeORM's default console logging behaviour and adds the counting on top.
export class QueryCountingLogger extends AdvancedConsoleLogger {

  constructor(options?: LoggerOptions) {
    super(options);
  }

  logQuery(query: string, parameters?: unknown[], queryRunner?: QueryRunner) {
    const store = requestContext.getStore();
    if (store) {
      store.count++;
      store.statements.set(query, (store.statements.get(query) ?? 0) + 1);
    }
    super.logQuery(query, parameters, queryRunner);
  }

}

// Register before any other middleware, so queries made by session/passport middleware are counted too.
export function sqlQueryCounterMiddleware(request: Request, response: Response, next: NextFunction) {
  const store: QueryCounterStore = { count: 0, statements: new Map() };
  const startedAt = process.hrtime.bigint();

  // Node calls writeHead() right before the headers go out (also implicitly from res.end()), so this is the last
  // moment a header can be added. By then GraphQL has resolved every field, so the count is final.
  const writeHead = response.writeHead;
  response.writeHead = function (this: Response, ...args: Parameters<Response['writeHead']>) {
    if (!response.headersSent) {
      response.setHeader(SQL_QUERY_COUNT_HEADER, String(store.count));
    }
    return writeHead.apply(this, args);
  } as Response['writeHead'];

  response.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const operation = request.body?.operationName ? ` (${request.body.operationName})` : '';
    logger.log(`${request.method} ${request.originalUrl}${operation}: ${store.count} SQL queries in ${durationMs.toFixed(0)} ms`);

    const repeated = [...store.statements.entries()]
      .filter(([, times]) => times >= REPEATED_STATEMENT_THRESHOLD)
      .sort(([, a], [, b]) => b - a);
    for (const [statement, times] of repeated) {
      logger.warn(`  ${times}x (possible N+1): ${statement.replace(/\s+/g, ' ').slice(0, 220)}`);
    }
  });

  requestContext.run(store, next);
}
