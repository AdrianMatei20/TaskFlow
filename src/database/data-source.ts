import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';

/**
 * Data source for the TypeORM CLI (npm run migration:run / migration:revert / migration:show).
 * Uses the same .env settings as the app. From the host, override PG_HOST (the .env value is the Docker hostname):
 *
 *   npx cross-env PG_HOST=localhost npm run migration:run
 */
dotenv.config();

export default new DataSource({
  type: 'postgres',
  host: process.env.PG_HOST,
  port: parseInt(process.env.PG_PORT),
  username: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DB,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  // One transaction per migration (the default puts all of them in one), so a migration can opt out with
  // `transaction = false`, which CREATE INDEX CONCURRENTLY requires.
  migrationsTransactionMode: 'each',
});
