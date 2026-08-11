/**
 * Attrition (flight) risk analysis — org-wide scan for supervisors/admins.
 *
 * Aggregates attendance, leave patterns, performance trend and manager notes
 * per employee, then runs the deterministic scorer from lib/attritionScoring.
 * The result is explainable: every flagged employee carries the exact factors
 * (and their point weights) that raised the risk.
 */

import { query } from './_generated/server';
import { v } from 'convex/values';
import { resolveOrgStaff } from './lib/orgAccess';
import { DEFAULT_LIST_CAP } from './lib/limits';
import { scoreAttritionRisk, type AttritionSignals } from './lib/attritionScoring';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Scan window for attendance/sick signals. */
const WINDOW_DAYS = 60;
/** Bounded employee scan size (keeps the query well under Convex read caps). */
const EMPLOYEE_CAP = 60;

export const getAttritionRisks = query({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, args) => {
    const scope = await resolveOrgStaff(ctx, args.organizationId);
    if (!scope) return null;

    const now = Date.now();
    const windowStart = now - WINDOW_DAYS * DAY_MS;

    const employees = await ctx.db
      .query('users')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .take(DEFAULT_LIST_CAP);

    const active = employees.filter((u) => u.isActive !== false).slice(0, EMPLOYEE_CAP);

    const results = await Promise.all(
      active.map(async (user) => {
        // ── Attendance (last ~60 days) ──────────────────────────────
        const records = await ctx.db
          .query('timeTracking')
          .withIndex('by_user', (q) => q.eq('userId', user._id))
          .order('desc')
          .take(WINDOW_DAYS + 10);
        const windowRecords = records.filter((r) => r.createdAt >= windowStart);
        const totalDays = windowRecords.length;
        const late = windowRecords.filter((r) => r.isLate).length;
        const absent = windowRecords.filter((r) => r.status === 'absent').length;
        const early = windowRecords.filter((r) => r.isEarlyLeave).length;

        // ── Leave patterns ───────────────────────────────────────────
        const leaves = await ctx.db
          .query('leaveRequests')
          .withIndex('by_user', (q) => q.eq('userId', user._id))
          .take(DEFAULT_LIST_CAP);
        const approved = leaves.filter((l) => l.status === 'approved');
        let daysSinceLastLeave: number | null = null;
        if (approved.length > 0) {
          const lastEnd = approved
            .map((l) => new Date(l.endDate).getTime())
            .reduce((a, b) => Math.max(a, b), 0);
          daysSinceLastLeave = Math.max(0, Math.floor((now - lastEnd) / DAY_MS));
        }
        const sickCount60d = leaves.filter(
          (l) => l.type === 'sick' && l.createdAt >= windowStart,
        ).length;
        const hasRecentUnpaid = leaves.some(
          (l) => l.type === 'unpaid' && l.createdAt >= now - 90 * DAY_MS,
        );

        // ── Performance trend ────────────────────────────────────────
        const metrics = await ctx.db
          .query('performanceMetrics')
          .withIndex('by_user', (q) => q.eq('userId', user._id))
          .order('desc')
          .first();
        const ratings = await ctx.db
          .query('supervisorRatings')
          .withIndex('by_employee', (q) => q.eq('employeeId', user._id))
          .order('desc')
          .take(2);
        let ratingDecline: number | null = null;
        if (ratings.length === 2) {
          const latest = ratings[0]!.overallRating;
          const previous = ratings[1]!.overallRating;
          if (latest < previous) ratingDecline = previous - latest;
        }

        // ── Manager notes (90 days) ──────────────────────────────────
        const notes = await ctx.db
          .query('employeeNotes')
          .withIndex('by_employee', (q) => q.eq('employeeId', user._id))
          .order('desc')
          .take(100);
        const negativeNotes = notes.filter(
          (n) => n.sentiment === 'negative' && n.createdAt >= now - 90 * DAY_MS,
        ).length;

        const signals: AttritionSignals = {
          totalDays,
          lateRate: totalDays > 0 ? late / totalDays : 0,
          absenceRate: totalDays > 0 ? absent / totalDays : 0,
          earlyLeaveRate: totalDays > 0 ? early / totalDays : 0,
          daysSinceLastLeave,
          sickCount60d,
          hasRecentUnpaid,
          kpiScore: metrics ? metrics.kpiScore : null,
          deadlineAdherence: metrics ? metrics.deadlineAdherence : null,
          ratingDecline,
          negativeNotes,
        };

        const scored = scoreAttritionRisk(signals);
        return {
          userId: user._id,
          name: user.name,
          email: user.email,
          department: user.department ?? null,
          position: user.position ?? null,
          ...scored,
        };
      }),
    );

    const sorted = results.sort((a, b) => b.riskScore - a.riskScore);
    const summary = {
      total: sorted.length,
      high: sorted.filter((r) => r.riskLevel === 'high').length,
      medium: sorted.filter((r) => r.riskLevel === 'medium').length,
      low: sorted.filter((r) => r.riskLevel === 'low').length,
    };

    return { employees: sorted, summary, generatedAt: now };
  },
});
