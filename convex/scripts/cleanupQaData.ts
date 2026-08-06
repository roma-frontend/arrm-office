/**
 * One-off QA data cleanup for the ADB-ARRM organization.
 *
 * Removes the records created by the e2e QA suite:
 *   - departments named  `QA-Dept-*`
 *   - positions   named  `QA-Pos-*`
 *   - users       named  `QA Employee *`
 *   - tasks       titled `QA Task *`        (+ their comments)
 *   - objectives  titled `QA Goal *`        (+ their key results & check-ins)
 *
 * QA employees are hard-deleted together with their profile / notification /
 * leave / attendance / org-chart rows so nothing dangles. Audit logs are left
 * intact (immutable history). Runs against whatever deployment the CLI is
 * pointed at (see CONVEX_DEPLOYMENT in .env.local).
 *
 * ALWAYS dry-runs by default — pass {"dryRun": false} to actually delete.
 *
 * Run with:
 *   npx convex run scripts/cleanupQaData.ts --args '{"dryRun": true}'    # count
 *   npx convex run scripts/cleanupQaData.ts --args '{"dryRun": false}'   # delete
 */
import { v } from 'convex/values';
import { internalMutation, type MutationCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { XLARGE_LIST_CAP } from '../lib/limits';

const QA_DEPT_PREFIX = 'QA-Dept-';
const QA_POS_PREFIX = 'QA-Pos-';
const QA_EMPLOYEE_PREFIX = 'QA Employee ';
const QA_TASK_PREFIX = 'QA Task ';
const QA_GOAL_PREFIX = 'QA Goal ';

type PurgeTable =
  | 'userProfiles'
  | 'employeeProfiles'
  | 'notifications'
  | 'leaveRequests'
  | 'timeTracking'
  | 'performanceMetrics'
  | 'employeeNotes'
  | 'employeeDocuments'
  | 'supervisorRatings'
  | 'orgChartNodes';

/**
 * Deletes (or counts, in dry-run) every row of `table` referencing `userId`.
 * Uses a filter rather than a per-table index so the script stays correct even
 * if a table's indexes change — the org is small, so a scan is fine here.
 */
async function purgeRowsForUser(
  ctx: MutationCtx,
  table: PurgeTable,
  field: 'userId' | 'employeeId',
  userId: Id<'users'>,
  doDelete: boolean,
): Promise<number> {
  const rows = await ctx.db
    .query(table)
    .filter((q) => q.eq(q.field(field), userId))
    .take(XLARGE_LIST_CAP);
  if (doDelete) {
    for (const row of rows) await ctx.db.delete(row._id);
  }
  return rows.length;
}

export default internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { dryRun }) => {
    const doDelete = dryRun === false; // anything else is a dry run
    const org = await ctx.db
      .query('organizations')
      .filter((q) => q.eq(q.field('name'), 'ADB-ARRM'))
      .first();
    if (!org) return { error: 'Organization "ADB-ARRM" not found' };
    const orgId = org._id;

    const report: {
      dryRun: boolean;
      organization: string;
      tasks: number;
      goals: number;
      employees: number;
      positions: number;
      departments: number;
      relatedRows: number;
    } = {
      dryRun: !doDelete,
      organization: org.name,
      tasks: 0,
      goals: 0,
      employees: 0,
      positions: 0,
      departments: 0,
      relatedRows: 0,
    };

    // ── 1. QA tasks (+ comments) ───────────────────────────────────────────
    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_org', (q) => q.eq('organizationId', orgId))
      .take(XLARGE_LIST_CAP);
    const qaTasks = tasks.filter((t) => (t.title ?? '').startsWith(QA_TASK_PREFIX));
    for (const task of qaTasks) {
      const comments = await ctx.db
        .query('taskComments')
        .withIndex('by_task', (q) => q.eq('taskId', task._id))
        .take(XLARGE_LIST_CAP);
      if (doDelete) {
        for (const c of comments) await ctx.db.delete(c._id);
        await ctx.db.delete(task._id);
      }
      report.relatedRows += comments.length;
    }
    report.tasks = qaTasks.length;

    // ── 2. QA goals (objectives + key results + check-ins) ─────────────────
    const objectives = await ctx.db
      .query('objectives')
      .withIndex('by_org', (q) => q.eq('organizationId', orgId))
      .take(XLARGE_LIST_CAP);
    const qaObjectives = objectives.filter((o) => (o.title ?? '').startsWith(QA_GOAL_PREFIX));
    for (const objective of qaObjectives) {
      const krs = await ctx.db
        .query('keyResults')
        .withIndex('by_objective', (q) => q.eq('objectiveId', objective._id))
        .take(XLARGE_LIST_CAP);
      if (doDelete) {
        for (const kr of krs) {
          const checkins = await ctx.db
            .query('goalCheckins')
            .withIndex('by_kr', (q) => q.eq('keyResultId', kr._id))
            .take(XLARGE_LIST_CAP);
          for (const c of checkins) await ctx.db.delete(c._id);
          await ctx.db.delete(kr._id);
        }
        await ctx.db.delete(objective._id);
      }
      report.relatedRows += krs.length;
    }
    report.goals = qaObjectives.length;

    // ── 3. QA employees (hard delete + related rows) ───────────────────────
    const users = await ctx.db
      .query('users')
      .withIndex('by_org', (q) => q.eq('organizationId', orgId))
      .take(XLARGE_LIST_CAP);
    // Never touch privileged accounts, even if a name somehow matched.
    const qaUsers = users.filter(
      (u) =>
        u.role !== 'superadmin' &&
        u.role !== 'admin' &&
        (u.name ?? '').startsWith(QA_EMPLOYEE_PREFIX),
    );
    for (const user of qaUsers) {
      const related =
        (await purgeRowsForUser(ctx, 'userProfiles', 'userId', user._id, doDelete)) +
        (await purgeRowsForUser(ctx, 'employeeProfiles', 'userId', user._id, doDelete)) +
        (await purgeRowsForUser(ctx, 'notifications', 'userId', user._id, doDelete)) +
        (await purgeRowsForUser(ctx, 'leaveRequests', 'userId', user._id, doDelete)) +
        (await purgeRowsForUser(ctx, 'timeTracking', 'userId', user._id, doDelete)) +
        (await purgeRowsForUser(ctx, 'performanceMetrics', 'userId', user._id, doDelete)) +
        (await purgeRowsForUser(ctx, 'employeeNotes', 'employeeId', user._id, doDelete)) +
        (await purgeRowsForUser(ctx, 'employeeDocuments', 'userId', user._id, doDelete)) +
        (await purgeRowsForUser(ctx, 'supervisorRatings', 'employeeId', user._id, doDelete)) +
        (await purgeRowsForUser(ctx, 'orgChartNodes', 'userId', user._id, doDelete));
      report.relatedRows += related;
      if (doDelete) await ctx.db.delete(user._id);
    }
    report.employees = qaUsers.length;

    // ── 4. QA positions (users already gone — nothing references them) ─────
    const positions = await ctx.db
      .query('positions')
      .withIndex('by_org', (q) => q.eq('organizationId', orgId))
      .take(XLARGE_LIST_CAP);
    const qaPositions = positions.filter((p) => (p.title ?? '').startsWith(QA_POS_PREFIX));
    if (doDelete) {
      for (const p of qaPositions) await ctx.db.delete(p._id);
    }
    report.positions = qaPositions.length;

    // ── 5. QA departments (last — users and positions no longer reference) ─
    const departments = await ctx.db
      .query('departments')
      .withIndex('by_org', (q) => q.eq('organizationId', orgId))
      .take(XLARGE_LIST_CAP);
    const qaDepartments = departments.filter((d) => (d.name ?? '').startsWith(QA_DEPT_PREFIX));
    if (doDelete) {
      for (const d of qaDepartments) await ctx.db.delete(d._id);
    }
    report.departments = qaDepartments.length;

    return report;
  },
});
