/**
 * Performance seed: loads a realistic volume of data so GraphQL measurements aren't "fast because the tables are empty".
 *
 *   npm run seed:perf
 *
 * - Deterministic: a seeded PRNG drives every choice (and the UUIDs), so every run produces the same dataset and
 *   before/after measurements compare like with like.
 * - Idempotent: perf data is recognisable by its email domain; each run deletes the previous perf data first
 *   (projects cascade to issues, labels, comments and memberships), then reinserts it in one transaction.
 * - Skewed on purpose: issue counts per project follow a long-tail curve, so a few projects are big (hundreds of
 *   issues) and most are small. Real workloads look like this, and it's the big ones that expose N+1 problems.
 * - Fast: multi-row INSERTs in chunks instead of one INSERT per row, and one bcrypt hash shared by every user.
 * - Finishes with ANALYZE so the Postgres planner has fresh statistics before anyone runs EXPLAIN.
 */
import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { hash } from 'bcrypt';
import { DataSource, EntityManager, EntityTarget, ObjectLiteral } from 'typeorm';

import { User } from 'src/resources/user/entities/user.entity';
import { Project } from 'src/resources/project/entities/project.entity';
import { UserProjectRole } from 'src/resources/project/entities/user-project-role.entity';
import { Issue } from 'src/resources/issue/entities/issue.entity';
import { Label } from 'src/resources/label/entities/label.entity';
import { Comment } from 'src/resources/comment/entities/comment.entity';
import { Log } from 'src/logger/entities/log.entity';
import { ResetPassword } from 'src/auth/reset-password/reset-password.entity';
import { GlobalRole } from 'src/resources/user/enums/global-role';
import { ProjectRole } from 'src/resources/project/enums/project-role';
import { IssueType } from 'src/resources/issue/enums/issue-type';
import { IssueStatus } from 'src/resources/issue/enums/issue-status';
import { IssuePriority } from 'src/resources/issue/enums/issue-priority';

dotenv.config();

export const PERF_EMAIL_DOMAIN = 'perf.taskflow.test';
export const PERF_PASSWORD = 'P@ssword123';
export const PERF_ADMIN_EMAIL = `perf.admin@${PERF_EMAIL_DOMAIN}`;

const VOLUME = {
  users: 2000,
  projects: 300,
  issues: 10000,
  labelsPerProject: 6,
  membersPerProject: { min: 4, max: 20 },
  commentsPerIssue: { min: 0, max: 6 },
  labelsPerIssue: { min: 0, max: 3 },
};
const INSERT_CHUNK_SIZE = 1000;
const NOW = new Date('2026-10-01T00:00:00.000Z').getTime(); // fixed, so dates are reproducible too
const DAY = 24 * 60 * 60 * 1000;

// ---------- deterministic randomness ----------

// mulberry32: tiny, fast, seedable PRNG (Math.random can't be seeded).
function createRandom(seed: number) {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)];
  const weighted = <T>(options: [T, number][]): T => {
    let roll = next() * options.reduce((sum, [, weight]) => sum + weight, 0);
    for (const [value, weight] of options) {
      if ((roll -= weight) < 0) return value;
    }
    return options[options.length - 1][0];
  };
  const sample = <T>(items: readonly T[], count: number): T[] => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, count);
  };
  const uuid = (): string => {
    const bytes = Array.from({ length: 16 }, () => Math.floor(next() * 256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
    const hex = bytes.map(b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
  const dateBetween = (fromMs: number, toMs: number): Date => new Date(fromMs + Math.floor(next() * (toMs - fromMs)));
  return { next, int, pick, weighted, sample, uuid, dateBetween };
}

const random = createRandom(20261027);

// ---------- text ----------

const FIRST_NAMES = ['Ana', 'Mihai', 'Elena', 'Andrei', 'Ioana', 'David', 'Maria', 'Luca', 'Sofia', 'Matei', 'Emma', 'Noah', 'Olivia', 'Liam', 'Ava', 'Lucas', 'Mia', 'Ethan', 'Chloe', 'Daniel'];
const LAST_NAMES = ['Popescu', 'Ionescu', 'Smith', 'Johnson', 'Brown', 'Garcia', 'Miller', 'Davis', 'Wilson', 'Moore', 'Taylor', 'Anderson', 'Thomas', 'Martin', 'Lee', 'Walker', 'Hall', 'Young', 'King', 'Wright'];
const PROJECT_AREAS = ['Billing', 'Search', 'Mobile', 'Checkout', 'Onboarding', 'Analytics', 'Payments', 'Auth', 'Inventory', 'Reporting', 'Messaging', 'Admin'];
const PROJECT_KINDS = ['Revamp', 'Platform', 'API', 'Portal', 'Migration', 'Service'];
const ISSUE_VERBS = ['Fix', 'Add', 'Refactor', 'Investigate', 'Improve', 'Remove', 'Document', 'Optimise', 'Migrate', 'Test'];
const ISSUE_SUBJECTS = ['login redirect', 'invoice PDF export', 'search pagination', 'push notifications', 'session timeout', 'CSV import', 'rate limiting', 'dark mode', 'audit log', 'webhook retries', 'password reset email', 'dashboard filters', 'image upload', 'cache invalidation', 'timezone handling'];
const SENTENCES = [
  'Steps to reproduce are in the linked ticket.',
  'This only happens for users with more than one active project.',
  'Customer support reported this three times this week.',
  'We should add a regression test once this is fixed.',
  'The current behaviour is confusing on mobile.',
  'Needs a quick sync with the design team before starting.',
  'Logs show the request times out after 30 seconds.',
  'Low risk change, but touches a shared module.',
];
const LABELS: [string, string][] = [['bug', '#ef4444'], ['frontend', '#3b82f6'], ['backend', '#10b981'], ['ux', '#a855f7'], ['tech-debt', '#f59e0b'], ['security', '#111827']];

const paragraph = (minSentences: number, maxSentences: number): string =>
  Array.from({ length: random.int(minSentences, maxSentences) }, () => random.pick(SENTENCES)).join(' ');

// ---------- generation ----------

async function generate() {
  const passwordHash = await hash(PERF_PASSWORD, 12);

  const users: Partial<User>[] = Array.from({ length: VOLUME.users }, (_, i) => {
    const firstname = random.pick(FIRST_NAMES);
    const lastname = random.pick(LAST_NAMES);
    return {
      id: random.uuid(),
      firstname,
      lastname,
      email: i === 0 ? PERF_ADMIN_EMAIL : `${firstname}.${lastname}.${i}@${PERF_EMAIL_DOMAIN}`.toLowerCase(),
      password: passwordHash,
      emailVerified: true,
      globalRole: i === 0 ? GlobalRole.ADMIN : GlobalRole.REGULAR_USER,
      createdAt: random.dateBetween(NOW - 900 * DAY, NOW - 400 * DAY),
    };
  });

  const projects: Partial<Project>[] = [];
  const memberships: object[] = [];
  const membersByProject = new Map<string, string[]>();
  for (let i = 0; i < VOLUME.projects; i++) {
    const id = random.uuid();
    projects.push({
      id,
      name: `${random.pick(PROJECT_AREAS)} ${random.pick(PROJECT_KINDS)} ${i + 1}`.slice(0, 25),
      description: paragraph(1, 4),
      createdAt: random.dateBetween(NOW - 400 * DAY, NOW - 30 * DAY),
    });

    // Skip the admin (index 0) so it sees projects through its global role, not membership.
    const members = random.sample(users.slice(1), random.int(VOLUME.membersPerProject.min, VOLUME.membersPerProject.max) + 1);
    members.forEach((member, index) => memberships.push({
      id: random.uuid(),
      user: { id: member.id },
      project: { id },
      projectRole: index === 0 ? ProjectRole.OWNER : random.weighted([[ProjectRole.ADMIN, 1], [ProjectRole.EDITOR, 5], [ProjectRole.VIEWER, 3]]),
      createdAt: random.dateBetween(NOW - 400 * DAY, NOW - 30 * DAY),
    }));
    membersByProject.set(id, members.map(member => member.id));
  }

  const labels: object[] = [];
  const labelsByProject = new Map<string, string[]>();
  for (const project of projects) {
    const projectLabels = LABELS.slice(0, VOLUME.labelsPerProject).map(([name, color]) => ({
      id: random.uuid(), name, color, project: { id: project.id }, createdAt: project.createdAt,
    }));
    labels.push(...projectLabels);
    labelsByProject.set(project.id, projectLabels.map(label => label.id));
  }

  // Long tail: project i gets a share proportional to 1 / (i + 1)^0.8, then rounding leftovers go to the first project.
  const weights = projects.map((_, i) => 1 / Math.pow(i + 1, 0.8));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const issueCounts = weights.map(weight => Math.max(1, Math.floor((weight / totalWeight) * VOLUME.issues)));
  issueCounts[0] += VOLUME.issues - issueCounts.reduce((sum, count) => sum + count, 0);

  const issues: object[] = [];
  const issueLabels: { issueId: string; labelId: string }[] = [];
  const comments: object[] = [];
  projects.forEach((project, projectIndex) => {
    const members = membersByProject.get(project.id);
    for (let n = 0; n < issueCounts[projectIndex]; n++) {
      const id = random.uuid();
      const createdAt = random.dateBetween(project.createdAt.getTime(), NOW);
      issues.push({
        id,
        title: `${random.pick(ISSUE_VERBS)} ${random.pick(ISSUE_SUBJECTS)}`,
        description: paragraph(1, 6),
        type: random.weighted([[IssueType.TASK, 55], [IssueType.BUG, 25], [IssueType.STORY, 15], [IssueType.EPIC, 5]]),
        status: random.weighted([[IssueStatus.DONE, 45], [IssueStatus.TODO, 25], [IssueStatus.IN_PROGRESS, 20], [IssueStatus.IN_REVIEW, 10]]),
        priority: random.weighted([[IssuePriority.MEDIUM, 50], [IssuePriority.HIGH, 22], [IssuePriority.LOW, 20], [IssuePriority.CRITICAL, 8]]),
        project: { id: project.id },
        reporter: { id: random.pick(members) },
        assignee: random.next() < 0.15 ? null : { id: random.pick(members) },
        dueDate: random.next() < 0.4 ? random.dateBetween(createdAt.getTime(), createdAt.getTime() + 60 * DAY) : null,
        createdAt,
        updatedAt: random.dateBetween(createdAt.getTime(), NOW),
      });

      for (const labelId of random.sample(labelsByProject.get(project.id), random.int(VOLUME.labelsPerIssue.min, VOLUME.labelsPerIssue.max))) {
        issueLabels.push({ issueId: id, labelId });
      }

      for (let c = random.int(VOLUME.commentsPerIssue.min, VOLUME.commentsPerIssue.max); c > 0; c--) {
        comments.push({
          id: random.uuid(),
          body: paragraph(1, 3),
          issue: { id },
          author: { id: random.pick(members) },
          createdAt: random.dateBetween(createdAt.getTime(), NOW),
        });
      }
    }
  });

  return { users, projects, memberships, labels, issues, issueLabels, comments, biggestProjectId: projects[0].id };
}

// ---------- persistence ----------

async function main() {
  const startedAt = Date.now();
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.PG_HOST,
    port: parseInt(process.env.PG_PORT),
    username: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DB,
    entities: [User, Project, UserProjectRole, Issue, Label, Comment, Log, ResetPassword],
    synchronize: true, // same as the app, so the script also works on a fresh database
  });
  await dataSource.initialize();

  const data = await generate();
  const issueLabelsTable = dataSource.getMetadata(Issue).manyToManyRelations.find(relation => relation.propertyName === 'labels').junctionEntityMetadata.tableName;
  const table = (entity: EntityTarget<ObjectLiteral>) => `"${dataSource.getMetadata(entity).tableName}"`;

  await dataSource.transaction(async (manager) => {
    // Remove the previous perf dataset. Issues go first: their deletion cascades to comments and issue-label links.
    // (Deleting a project directly fails while its labels are linked to issues, because the join table's label foreign
    // key is ON DELETE NO ACTION. See the note in PERFORMANCE.md.) Deleting the projects then cascades to labels and memberships.
    const perfProjectIds = `
      SELECT upr."projectId" FROM ${table(UserProjectRole)} upr
      JOIN ${table(User)} u ON u.id = upr."userId"
      WHERE u.email LIKE $1 AND upr."projectRole" = $2`;
    const perfOwner = [`%@${PERF_EMAIL_DOMAIN}`, ProjectRole.OWNER];
    await manager.query(`DELETE FROM ${table(Issue)} WHERE "projectId" IN (${perfProjectIds})`, perfOwner);
    await manager.query(`DELETE FROM ${table(Project)} WHERE id IN (${perfProjectIds})`, perfOwner);
    await manager.query(`DELETE FROM ${table(User)} WHERE email LIKE $1`, [`%@${PERF_EMAIL_DOMAIN}`]);

    const insert = (target: EntityTarget<ObjectLiteral> | string, rows: object[]) => insertInChunks(manager, target, rows);
    await insert(User, data.users);
    await insert(Project, data.projects);
    await insert(UserProjectRole, data.memberships);
    await insert(Label, data.labels);
    await insert(Issue, data.issues);
    await insert(issueLabelsTable, data.issueLabels);
    await insert(Comment, data.comments);
  });

  // Fresh planner statistics: without them EXPLAIN shows plans based on stale or default row estimates.
  await dataSource.query('ANALYZE');

  const counts = await dataSource.query(`
    SELECT
      (SELECT count(*) FROM ${table(User)}) AS users,
      (SELECT count(*) FROM ${table(Project)}) AS projects,
      (SELECT count(*) FROM ${table(UserProjectRole)}) AS memberships,
      (SELECT count(*) FROM ${table(Issue)}) AS issues,
      (SELECT count(*) FROM ${table(Label)}) AS labels,
      (SELECT count(*) FROM "${issueLabelsTable}") AS issue_labels,
      (SELECT count(*) FROM ${table(Comment)}) AS comments`);
  await dataSource.destroy();

  console.log(`Perf seed done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s. Table totals (including non-perf rows):`);
  console.table(counts[0]);
  console.log(`Inserted: ${data.users.length} users, ${data.projects.length} projects, ${data.memberships.length} memberships, ${data.labels.length} labels, ${data.issues.length} issues, ${data.issueLabels.length} issue-label links, ${data.comments.length} comments.`);
  console.log(`Log in as ${PERF_ADMIN_EMAIL} / ${PERF_PASSWORD} (global admin). Every perf user has the same password.`);
  console.log(`Biggest project: ${data.biggestProjectId}`);
}

// Multi-row INSERTs, 1,000 rows per statement (Postgres allows at most 65,535 bind parameters per statement).
async function insertInChunks(manager: EntityManager, target: EntityTarget<ObjectLiteral> | string, rows: object[]) {
  for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
    await manager.createQueryBuilder()
      .insert()
      .into(target)
      .values(rows.slice(i, i + INSERT_CHUNK_SIZE))
      .updateEntity(false) // skip RETURNING: we generate the ids ourselves
      .execute();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
