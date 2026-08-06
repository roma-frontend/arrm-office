/**
 * One-off cleanup of residual QA test data in the ADB-ARRM organization.
 *
 * Removes:
 *   - leave requests whose reason starts with `QA Leave` / `QA Approve`
 *     (leftovers of the qa-leaves e2e spec — the tests clean up after
 *     themselves, but rate-limited runs left some pending requests behind)
 *   - audit logs authored by the e2e superadmin account test@test.com
 *     (QA operation history — excluded from the handover per request)
 *
 * ALWAYS dry-runs by default — pass {"dryRun": false} to actually delete.
 *
 * Run with:
 *   npx convex run scripts/cleanupQaResidual:default '{"dryRun": true}'    # count
 *   npx convex run scripts/cleanupQaResidual:default '{"dryRun": false}'   # delete
 */
import { v } from 'convex/values';
import { internalMutation } from '../_generated/server';
import { XLARGE_LIST_CAP } from '../lib/limits';

const QA_LEAVE_REASON = /^QA (Leave|Approve)\s/;

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

    // ── 1. QA leave requests ────────────────────────────────────────────────
    const leaves = await ctx.db
      .query('leaveRequests')
      .withIndex('by_org', (q) => q.eq('organizationId', orgId))
      .take(XLARGE_LIST_CAP);
    const qaLeaves = leaves.filter((l) => QA_LEAVE_REASON.test(l.reason ?? ''));
    if (doDelete) {
      for (const l of qaLeaves) await ctx.db.delete(l._id);
    }

    // ── 2. Audit logs authored by test@test.com ─────────────────────────────
    const testUser = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', 'test@test.com'))
      .unique();
    let testAuditLogs = 0;
    if (testUser) {
      const logs = await ctx.db
        .query('auditLogs')
        .filter((q) => q.eq(q.field('userId'), testUser._id))
        .take(XLARGE_LIST_CAP);
      testAuditLogs = logs.length;
      if (doDelete) {
        for (const log of logs) await ctx.db.delete(log._id);
      }
    }

    return {
      dryRun: !doDelete,
      organization: org.name,
      qaLeaveRequestsDeleted: qaLeaves.length,
      testUserAuditLogsDeleted: testAuditLogs,
    };
  },
});
