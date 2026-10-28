import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Index for "latest issues of a project": WHERE "projectId" = ... ORDER BY "createdAt" DESC.
 *
 * - Leading column projectId: finds one project's issues without scanning the whole table. It also serves as the
 *   foreign key index Postgres doesn't create on its own (used when a project delete cascades to its issues).
 * - Second column createdAt: the rows come out of the index already ordered, so the sort disappears. B-tree indexes
 *   can be read backwards, so an ascending index also serves ORDER BY "createdAt" DESC.
 * - CONCURRENTLY: builds the index without blocking writes to the issue table (a plain CREATE INDEX holds a lock that
 *   blocks INSERT/UPDATE/DELETE until it finishes). It can't run inside a transaction, hence `transaction = false`.
 *
 * The same index is declared with @Index on the Issue entity, so `synchronize` recognises it instead of dropping it.
 */
export class AddIssueProjectCreatedAtIndex1793145600000 implements MigrationInterface {
  name = 'AddIssueProjectCreatedAtIndex1793145600000';
  transaction = false as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_issue_project_created_at" ON "issue" ("projectId", "createdAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "IDX_issue_project_created_at"`);
  }
}
