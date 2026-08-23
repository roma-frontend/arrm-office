import { query, mutation, internalMutation } from './_generated/server';
import { api } from './_generated/api';
import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { DEFAULT_LIST_CAP } from './lib/limits';
import { notify } from './lib/notify';
import { assertOrgScope, resolveOrgScope, scopeOwnsRecord, type OrgScope } from './lib/orgAccess';
import { resolveServiceAssignee } from './lib/resolveServiceAssignee';
import { assertModuleAccess } from './lib/entitlements';

// Statutory-flavoured defaults: a standard 3-month term, and a hard 6-month
// cap measured from the start date — extensions included. Organizations can
// pick a shorter initial term per hire, but never breach the cap.
export const DEFAULT_PROBATION_DAYS = 90;
export const MAX_PROBATION_DAYS = 180;
// Days-remaining thresholds at which HR gets a heads-up, exactly once each.
export const REMINDER_THRESHOLDS = [20, 15, 10, 5];

const DAY = 86400000;

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Probation decisions are staff work, but the HR owner of the org (a person
 * who may hold a plain `employee` role) must be able to extend terms from the
 * reminder link too — that is the whole point of the reminders.
 */
async function assertCanManageProbation(
  ctx: MutationCtx,
  orgId: Id<'organizations'>,
  employeeId: Id<'users'>,
): Promise<OrgScope> {
  const scope = await assertOrgScope(ctx, orgId);
  if (scope.isStaff) return scope;
  const hr = await resolveServiceAssignee(ctx, orgId, 'hr', employeeId);
  if (hr === scope.caller._id) return scope;
  throw new Error('Not authorized: staff or HR access required');
}

async function canReadProbation(
  ctx: QueryCtx,
  orgId: Id<'organizations'> | undefined,
  employeeId: Id<'users'>,
): Promise<boolean> {
  if (!orgId) return false;
  const scope = await resolveOrgScope(ctx, orgId);
  if (!scope) return false;
  if (scope.caller._id === employeeId) return true;
  if (!scopeOwnsRecord(scope, { organizationId: orgId })) return false;
  if (scope.isStaff) return true;
  const hr = await resolveServiceAssignee(ctx, orgId, 'hr', employeeId);
  return hr === scope.caller._id;
}

/** HR owner + the employee's manager + org admins + the employee, deduped. */
async function probationAudience(
  ctx: MutationCtx,
  orgId: Id<'organizations'>,
  employee: Doc<'users'>,
): Promise<Id<'users'>[]> {
  const audience = new Set<Id<'users'>>([employee._id]);
  const hr = await resolveServiceAssignee(ctx, orgId, 'hr', employee._id);
  if (hr) audience.add(hr);
  if (employee.supervisorId) audience.add(employee.supervisorId);
  const admins = await ctx.db
    .query('users')
    .withIndex('by_org_role', (q) => q.eq('organizationId', orgId).eq('role', 'admin'))
    .take(DEFAULT_LIST_CAP);
  for (const admin of admins) if (admin.isActive) audience.add(admin._id);
  return [...audience];
}

async function notifyAudience(
  ctx: MutationCtx,
  audience: Id<'users'>[],
  args: Omit<Parameters<typeof notify>[1], 'userId'>,
): Promise<void> {
  for (const userId of audience) {
    await notify(ctx, { ...args, userId });
  }
}

function profileRoute(employeeId: Id<'users'>, extend = false): string {
  return `/employees/${employeeId}${extend ? '?probation=extend' : ''}`;
}

// ─── Queries ─────────────────────────────────────────────────

export const getProbationForEmployee = query({
  args: { employeeId: v.id('users') },
  handler: async (ctx, args) => {
    const employee = await ctx.db.get(args.employeeId);
    if (!employee) return null;
    if (!(await canReadProbation(ctx, employee.organizationId, args.employeeId))) return null;

    const periods = await ctx.db
      .query('probationPeriods')
      .withIndex('by_employee', (q) => q.eq('employeeId', args.employeeId))
      .order('desc')
      .take(DEFAULT_LIST_CAP);

    const active = periods.find((p) => p.status === 'active');
    return active ?? periods[0] ?? null;
  },
});

export const listActiveProbations = query({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, args) => {
    const scope = await resolveOrgScope(ctx, args.organizationId);
    if (!scope || !scopeOwnsRecord(scope, { organizationId: args.organizationId })) return [];
    let allowed = scope.isStaff;
    if (!allowed) {
      const hr = await resolveServiceAssignee(ctx, args.organizationId, 'hr', scope.caller._id);
      allowed = hr === scope.caller._id;
    }
    if (!allowed) return [];

    const periods = await ctx.db
      .query('probationPeriods')
      .withIndex('by_org_status', (q) =>
        q.eq('organizationId', args.organizationId).eq('status', 'active'),
      )
      .take(DEFAULT_LIST_CAP);

    const employees = await Promise.all(periods.map((p) => ctx.db.get(p.employeeId)));

    return periods
      .map((period, i) => ({ period, employee: employees[i] ?? null }))
      .filter(
        (row): row is { period: Doc<'probationPeriods'>; employee: Doc<'users'> } => !!row.employee,
      )
      .sort((a, b) => a.period.endDate - b.period.endDate);
  },
});

// ─── Mutations ───────────────────────────────────────────────

export const startProbation = mutation({
  args: {
    organizationId: v.id('organizations'),
    employeeId: v.id('users'),
    startDate: v.optional(v.number()),
    durationDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'probation');
    const employee = await ctx.db.get(args.employeeId);
    if (!employee) throw new Error('Employee not found');
    if (employee.organizationId !== args.organizationId) {
      throw new Error('Employee belongs to a different organization');
    }
    const scope = await assertCanManageProbation(ctx, args.organizationId, args.employeeId);

    const durationDays = args.durationDays ?? DEFAULT_PROBATION_DAYS;
    if (!Number.isFinite(durationDays) || durationDays < 1 || durationDays > MAX_PROBATION_DAYS) {
      throw new Error(`Probation must be between 1 and ${MAX_PROBATION_DAYS} days`);
    }

    const existing = await ctx.db
      .query('probationPeriods')
      .withIndex('by_employee', (q) => q.eq('employeeId', args.employeeId))
      .filter((q) => q.eq(q.field('status'), 'active'))
      .first();
    if (existing) throw new Error('This employee already has an active probation period');

    const now = Date.now();
    const startDate = args.startDate ?? now;
    const endDate = startDate + durationDays * DAY;
    const periodId = await ctx.db.insert('probationPeriods', {
      organizationId: args.organizationId,
      employeeId: args.employeeId,
      startDate,
      endDate,
      originalEndDate: endDate,
      durationDays,
      status: 'active',
      remindersSent: [],
      extensions: [],
      createdBy: scope.caller._id,
      createdAt: now,
      updatedAt: now,
    });

    const audience = await probationAudience(ctx, args.organizationId, employee);
    await notifyAudience(ctx, audience, {
      organizationId: args.organizationId,
      type: 'probation_started',
      titleKey: 'notifications.titles.probationStarted',
      messageKey: 'notifications.messages.probationStarted',
      params: { employeeName: employee.name, days: durationDays },
      fallbackTitle: '📋 Probation period started',
      fallbackMessage: `${employee.name} started a ${durationDays}-day probation period.`,
      relatedId: periodId,
      route: profileRoute(args.employeeId),
      createdAt: now,
    });

    await ctx.db.insert('auditLogs', {
      organizationId: args.organizationId,
      userId: scope.caller._id,
      action: 'probation_started',
      target: args.employeeId,
      details: JSON.stringify({ periodId, durationDays, startDate }),
      createdAt: now,
    });

    return periodId;
  },
});

export const extendProbation = mutation({
  args: {
    probationId: v.id('probationPeriods'),
    additionalDays: v.number(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'probation');
    const period = await ctx.db.get(args.probationId);
    if (!period) throw new Error('Probation period not found');
    if (period.status !== 'active') throw new Error('This probation period is not active');

    const employee = await ctx.db.get(period.employeeId);
    if (!employee) throw new Error('Employee not found');
    const scope = await assertCanManageProbation(ctx, period.organizationId, period.employeeId);

    if (!Number.isFinite(args.additionalDays) || args.additionalDays < 1) {
      throw new Error('Extension must be at least 1 day');
    }
    const newEndDate = period.endDate + args.additionalDays * DAY;
    const totalDays = Math.round((newEndDate - period.startDate) / DAY);
    if (totalDays > MAX_PROBATION_DAYS) {
      throw new Error(
        `Extension would exceed the ${MAX_PROBATION_DAYS}-day statutory cap (would be ${totalDays} days)`,
      );
    }

    const now = Date.now();
    await ctx.db.patch(args.probationId, {
      endDate: newEndDate,
      extensions: [
        ...period.extensions,
        {
          extendedBy: scope.caller._id,
          extendedAt: now,
          previousEndDate: period.endDate,
          newEndDate,
          reason: args.reason,
        },
      ],
      updatedAt: now,
    });

    const audience = await probationAudience(ctx, period.organizationId, employee);
    await notifyAudience(ctx, audience, {
      organizationId: period.organizationId,
      type: 'probation_extended',
      titleKey: 'notifications.titles.probationExtended',
      messageKey: 'notifications.messages.probationExtended',
      params: { employeeName: employee.name, days: args.additionalDays },
      fallbackTitle: '⏳ Probation extended',
      fallbackMessage: `${employee.name}'s probation was extended by ${args.additionalDays} day(s).`,
      relatedId: period._id,
      route: profileRoute(period.employeeId),
      createdAt: now,
    });

    await ctx.db.insert('auditLogs', {
      organizationId: period.organizationId,
      userId: scope.caller._id,
      action: 'probation_extended',
      target: period.employeeId,
      details: JSON.stringify({
        periodId: period._id,
        additionalDays: args.additionalDays,
        newEndDate,
        reason: args.reason ?? null,
      }),
      createdAt: now,
    });

    return newEndDate;
  },
});

export const completeProbation = mutation({
  args: {
    probationId: v.id('probationPeriods'),
    outcome: v.union(v.literal('passed'), v.literal('failed')),
    note: v.optional(v.string()),
    // Optional companion for a failed decision: open the departure process
    // right away. Best-effort — a duplicate program or missing staff rights
    // must not roll back the probation decision itself.
    withOffboarding: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'probation');
    const period = await ctx.db.get(args.probationId);
    if (!period) throw new Error('Probation period not found');
    if (period.status !== 'active') throw new Error('This probation period is not active');

    const employee = await ctx.db.get(period.employeeId);
    if (!employee) throw new Error('Employee not found');
    const scope = await assertCanManageProbation(ctx, period.organizationId, period.employeeId);

    const now = Date.now();
    await ctx.db.patch(args.probationId, {
      status: args.outcome,
      outcomeNote: args.note,
      completedBy: scope.caller._id,
      completedAt: now,
      updatedAt: now,
    });

    const audience = await probationAudience(ctx, period.organizationId, employee);
    const passed = args.outcome === 'passed';
    await notifyAudience(ctx, audience, {
      organizationId: period.organizationId,
      type: passed ? 'probation_passed' : 'probation_failed',
      titleKey: passed
        ? 'notifications.titles.probationPassed'
        : 'notifications.titles.probationFailed',
      messageKey: passed
        ? 'notifications.messages.probationPassed'
        : 'notifications.messages.probationFailed',
      params: { employeeName: employee.name },
      fallbackTitle: passed ? '✅ Probation passed' : '⛔ Probation not passed',
      fallbackMessage: passed
        ? `${employee.name} has passed the probation period.`
        : `${employee.name} has not passed the probation period.`,
      relatedId: period._id,
      route: profileRoute(period.employeeId),
      createdAt: now,
    });

    await ctx.db.insert('auditLogs', {
      organizationId: period.organizationId,
      userId: scope.caller._id,
      action: `probation_${args.outcome}`,
      target: period.employeeId,
      details: JSON.stringify({ periodId: period._id, note: args.note ?? null }),
      createdAt: now,
    });

    if (args.outcome === 'failed' && args.withOffboarding) {
      try {
        await ctx.runMutation(api.offboarding.startOffboarding, {
          organizationId: period.organizationId,
          employeeId: period.employeeId,
          managerId: employee.supervisorId ?? scope.caller._id,
          lastDay: now + 14 * DAY,
          reason: 'termination',
          reasonNote: args.note ? `Probation not passed: ${args.note}` : 'Probation not passed',
        });
      } catch {
        // An active offboarding program already exists, or the caller lacks
        // staff rights (HR owner without a staff role): the decision stands,
        // the departure process is started manually from the offboarding page.
      }
    }
  },
});

// ─── Internal: auto-start on hire ────────────────────────────

/**
 * Scheduled by every hire/approval path. Deliberately defensive: a probation
 * record must never block the hire itself, and re-runs are harmless.
 */
export const autoStartProbation = internalMutation({
  args: {
    employeeId: v.id('users'),
    createdBy: v.optional(v.id('users')),
  },
  handler: async (ctx, args) => {
    const employee = await ctx.db.get(args.employeeId);
    if (!employee || !employee.organizationId) return;
    // Founders and platform accounts are not hires; probation applies to
    // employees, drivers and supervisors joining an organization.
    if (employee.role === 'admin' || employee.role === 'superadmin') return;
    if (!employee.isActive || !employee.isApproved) return;

    const existing = await ctx.db
      .query('probationPeriods')
      .withIndex('by_employee', (q) => q.eq('employeeId', args.employeeId))
      .filter((q) => q.eq(q.field('status'), 'active'))
      .first();
    if (existing) return;

    const now = Date.now();
    let createdBy = args.createdBy;
    if (!createdBy || !(await ctx.db.get(createdBy))) {
      createdBy =
        (await resolveServiceAssignee(ctx, employee.organizationId, 'hr', employee._id)) ??
        employee._id;
    }

    // Probation is calculated from the employee's registration date, not from
    // when the auto-start runs. If the admin backdated the hire, the probation
    // window is counted from that date: when the 90-day window has already
    // elapsed the period is skipped entirely, otherwise the remaining time is
    // used as the duration (at least 1 day).
    const hireDate = employee.createdAt ?? now;
    const probationEndDate = hireDate + DEFAULT_PROBATION_DAYS * DAY;
    const remainingMs = probationEndDate - now;
    const remainingDays = Math.ceil(remainingMs / DAY);

    // The hire date + standard period is in the past — probation has expired.
    if (remainingDays <= 0) return;

    const durationDays = Math.min(remainingDays, DEFAULT_PROBATION_DAYS);
    const startDate = now;
    const endDate = now + durationDays * DAY;

    const periodId = await ctx.db.insert('probationPeriods', {
      organizationId: employee.organizationId,
      employeeId: employee._id,
      startDate,
      endDate,
      originalEndDate: endDate,
      durationDays,
      status: 'active',
      remindersSent: [],
      extensions: [],
      createdBy,
      createdAt: now,
      updatedAt: now,
    });

    const audience = await probationAudience(ctx, employee.organizationId, employee);
    await notifyAudience(ctx, audience, {
      organizationId: employee.organizationId,
      type: 'probation_started',
      titleKey: 'notifications.titles.probationStarted',
      messageKey: 'notifications.messages.probationStarted',
      params: { employeeName: employee.name, days: durationDays },
      fallbackTitle: '📋 Probation period started',
      fallbackMessage: `${employee.name} started a ${durationDays}-day probation period.`,
      relatedId: periodId,
      route: profileRoute(employee._id),
      createdAt: now,
    });

    await ctx.db.insert('auditLogs', {
      organizationId: employee.organizationId,
      userId: createdBy,
      action: 'probation_started_auto',
      target: employee._id,
      details: JSON.stringify({ periodId, durationDays, hireDate, remainingDays }),
      createdAt: now,
    });
  },
});

// ─── Internal: daily reminders + auto-pass ───────────────────

/**
 * Daily sweep: at 20/15/10/5 days remaining HR, the manager and the employee
 * get one reminder per threshold (the link leads straight to the extend
 * dialog); once the end date passes with no decision, the period auto-passes
 * — continuing to employ someone past the term is acceptance.
 */
export const sendProbationReminders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const active = await ctx.db
      .query('probationPeriods')
      .withIndex('by_status_end', (q) => q.eq('status', 'active'))
      .take(DEFAULT_LIST_CAP);

    for (const period of active) {
      const employee = await ctx.db.get(period.employeeId);
      if (!employee) continue;

      const daysRemaining = Math.ceil((period.endDate - now) / DAY);

      if (daysRemaining < 0) {
        await ctx.db.patch(period._id, {
          status: 'passed',
          outcomeNote: 'probation.autoPassed.employmentContinued',
          completedAt: now,
          updatedAt: now,
        });
        const audience = await probationAudience(ctx, period.organizationId, employee);
        await notifyAudience(ctx, audience, {
          organizationId: period.organizationId,
          type: 'probation_passed',
          titleKey: 'notifications.titles.probationPassed',
          messageKey: 'notifications.messages.probationPassedAuto',
          params: { employeeName: employee.name },
          fallbackTitle: '✅ Probation passed',
          fallbackMessage: `${employee.name} has passed the probation period automatically.`,
          relatedId: period._id,
          route: profileRoute(period.employeeId),
          createdAt: now,
        });
        await ctx.db.insert('auditLogs', {
          organizationId: period.organizationId,
          userId: period.employeeId,
          action: 'probation_passed_auto',
          target: period.employeeId,
          details: JSON.stringify({ periodId: period._id }),
          createdAt: now,
        });
        continue;
      }

      if (
        REMINDER_THRESHOLDS.includes(daysRemaining) &&
        !period.remindersSent.includes(daysRemaining)
      ) {
        await ctx.db.patch(period._id, {
          remindersSent: [...period.remindersSent, daysRemaining],
          updatedAt: now,
        });
        const audience = await probationAudience(ctx, period.organizationId, employee);
        await notifyAudience(ctx, audience, {
          organizationId: period.organizationId,
          type: 'probation_ending_soon',
          titleKey: 'notifications.titles.probationEndingSoon',
          messageKey: 'notifications.messages.probationEndingSoon',
          params: { employeeName: employee.name, days: daysRemaining },
          fallbackTitle: '⏰ Probation ending soon',
          fallbackMessage: `${employee.name}'s probation ends in ${daysRemaining} day(s). Review and extend if needed.`,
          relatedId: period._id,
          route: profileRoute(period.employeeId, true),
          createdAt: now,
        });
      }
    }
  },
});
