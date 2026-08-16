/**
 * Superadmin GDPR Data Toolkit.
 *
 * The "right to be forgotten" toolbox: locate a data subject, preview the blast
 * radius of their records across every table that references them, export the
 * full payload as JSON, anonymize PII in place, or erase the data subject
 * entirely (soft-delete + cascade purge of their owned records).
 *
 * A subject is identified by exact email/name match — a superadmin looking for
 * a data subject usually has the address from a support ticket or an export
 * request, and exact match avoids nuking the wrong person in a sweep.
 */

import { v } from 'convex/values';
import { query, mutation } from '../_generated/server';
import type { QueryCtx, MutationCtx } from '../_generated/server';
import type { Doc, Id, TableNames } from '../_generated/dataModel';
import { getAuthCaller } from '../lib/getAuthCaller';

// ── Registry: every table that can hold a data subject's records ────────────
// `field` is the column holding the users id; `module` groups tables in the UI.
// Kept explicit so a rename in schema fails loudly here instead of silently
// missing data in an export.
const USER_DATA_COLLECTIONS: { table: TableNames; field: string; module: string }[] = [
  // Account
  { table: 'userProfiles', field: 'userId', module: 'account' },
  { table: 'userSettings', field: 'userId', module: 'account' },
  { table: 'notifications', field: 'userId', module: 'account' },
  // HR / employment
  { table: 'employeeProfiles', field: 'userId', module: 'hr' },
  { table: 'employeeDocuments', field: 'userId', module: 'hr' },
  { table: 'employeeNotes', field: 'employeeId', module: 'hr' },
  { table: 'timeTracking', field: 'userId', module: 'hr' },
  { table: 'performanceMetrics', field: 'userId', module: 'hr' },
  { table: 'leaveRequests', field: 'userId', module: 'hr' },
  { table: 'compensationRecords', field: 'userId', module: 'hr' },
  { table: 'payrollRecords', field: 'userId', module: 'hr' },
  { table: 'payslips', field: 'userId', module: 'hr' },
  { table: 'documents', field: 'userId', module: 'hr' },
  // Finance
  { table: 'expenses', field: 'userId', module: 'finance' },
  // Goals
  { table: 'objectives', field: 'ownerId', module: 'goals' },
  { table: 'keyResults', field: 'ownerId', module: 'goals' },
  { table: 'goalCheckins', field: 'userId', module: 'goals' },
  // Learning
  { table: 'enrollments', field: 'userId', module: 'learning' },
  { table: 'lessonProgress', field: 'userId', module: 'learning' },
  { table: 'quizAttempts', field: 'userId', module: 'learning' },
  { table: 'certificates', field: 'userId', module: 'learning' },
  // Communication
  { table: 'chatMessages', field: 'senderId', module: 'communication' },
  { table: 'chatSavedMessages', field: 'userId', module: 'communication' },
  { table: 'announcementReactions', field: 'userId', module: 'communication' },
  { table: 'announcementComments', field: 'authorId', module: 'communication' },
  { table: 'announcementViews', field: 'userId', module: 'communication' },
  // Fleet
  { table: 'drivers', field: 'userId', module: 'fleet' },
  { table: 'driverShifts', field: 'userId', module: 'fleet' },
  { table: 'driverSchedules', field: 'userId', module: 'fleet' },
  { table: 'driverRequests', field: 'requesterId', module: 'fleet' },
  { table: 'favoriteDrivers', field: 'userId', module: 'fleet' },
  // Meetings
  { table: 'roomBookingAttendees', field: 'userId', module: 'meetings' },
  // Productivity
  { table: 'workSchedule', field: 'userId', module: 'productivity' },
  { table: 'userPreferences', field: 'userId', module: 'productivity' },
  { table: 'pomodoroSessions', field: 'userId', module: 'productivity' },
  // Recognition
  { table: 'userPoints', field: 'userId', module: 'recognition' },
  { table: 'pointTransactions', field: 'userId', module: 'recognition' },
  { table: 'kudosBadgeAwards', field: 'userId', module: 'recognition' },
  { table: 'rewardVouchers', field: 'userId', module: 'recognition' },
  // Security
  { table: 'loginAttempts', field: 'userId', module: 'security' },
  { table: 'deviceFingerprints', field: 'userId', module: 'security' },
  // Compliance
  { table: 'gdprRequests', field: 'userId', module: 'compliance' },
  { table: 'consentRecords', field: 'userId', module: 'compliance' },
  { table: 'dataAccessLogs', field: 'userId', module: 'compliance' },
];

// auditLogs keeps the operator's own trail — it is intentionally NOT part of
// the erasure sweep. Removing it would destroy the evidence of the erasure.
const MAX_ROWS_PER_TABLE = 200;

async function requireSuperadmin(ctx: QueryCtx | MutationCtx) {
  const caller = await getAuthCaller(ctx);
  if (!caller) throw new Error('Not authenticated');
  if (caller.role !== 'superadmin') throw new Error('Superadmin only');
  return caller;
}

async function getUserOrThrow(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
): Promise<Doc<'users'>> {
  const user = await ctx.db.get(userId);
  if (!user) throw new Error('User not found');
  return user;
}

/** Count and sample a data subject's records in one table. */
async function collectCollection(
  ctx: QueryCtx | MutationCtx,
  table: TableNames,
  field: string,
  userId: string,
) {
  // Dynamic table iteration: the registry maps table names to the column that
  // holds the subject id. One narrow cast here keeps the sweep table-agnostic.
  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return -- dynamic table query */
  const rows = await (ctx.db.query(table) as any)
    .filter((q: any) => q.eq(q.field(field), userId))
    .take(MAX_ROWS_PER_TABLE);
  const result = {
    table,
    field,
    count: (rows as unknown[]).length,
    truncated: (rows as unknown[]).length >= MAX_ROWS_PER_TABLE,
    rows: rows as Record<string, unknown>[],
  };
  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
  return result;
}

function stripIdFields(row: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(row)) {
    if (k === '_id' || k === '_creationTime') continue;
    out[k] = val;
  }
  return out;
}

// ── Queries ──────────────────────────────────────────────────────────────────

/**
 * Find a data subject by exact email or name, with per-table record counts so
 * the operator sees the blast radius before touching anything.
 */
export const searchDataSubjects = query({
  args: { query: v.string() },
  handler: async (ctx, { query: q }) => {
    await requireSuperadmin(ctx);
    if (!q.trim()) return [];

    const needle = q.trim().toLowerCase();
    const users = await ctx.db
      .query('users')
      .filter((f) => f.or(f.eq(f.field('email'), needle), f.eq(f.field('name'), q.trim())))
      .take(50);

    return Promise.all(
      users.map(async (user) => {
        const org = user.organizationId ? await ctx.db.get(user.organizationId) : null;
        const counts: Record<string, number> = {};
        let total = 0;
        for (const c of USER_DATA_COLLECTIONS) {
          const { count } = await collectCollection(ctx, c.table, c.field, user._id);
          if (count > 0) {
            counts[c.table] = count;
            total += count;
          }
        }
        return {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
          organizationId: user.organizationId ?? null,
          organizationName: org?.name ?? null,
          recordCount: total,
          perTable: counts,
        };
      }),
    );
  },
});

/**
 * Full export payload for a data subject — grouped by module/table, with the
 * account, profile and organization envelope. Rows are capped at 200 per table.
 */
export const exportUserData = query({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    await requireSuperadmin(ctx);
    const user = await getUserOrThrow(ctx, userId);
    const profile = await ctx.db
      .query('userProfiles')
      .withIndex('by_user', (f) => f.eq('userId', userId))
      .first();
    const org = user.organizationId
      ? ((await ctx.db.get(user.organizationId)) as Doc<'organizations'> | null)
      : null;

    const collections: {
      module: string;
      table: string;
      count: number;
      truncated: boolean;
      rows: Record<string, unknown>[];
    }[] = [];
    for (const c of USER_DATA_COLLECTIONS) {
      const col = await collectCollection(ctx, c.table, c.field, userId);
      if (col.count > 0) {
        collections.push({
          module: c.module,
          table: c.table,
          count: col.count,
          truncated: col.truncated,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument -- dynamic rows
          rows: col.rows.map((r: any) => stripIdFields(r)),
        });
      }
    }

    return {
      exportedAt: Date.now(),
      exportedBy: 'superadmin',
      subject: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      profile: profile ? stripIdFields(profile as unknown as Record<string, unknown>) : null,
      organization: org ? { name: org.name, slug: org.slug, createdAt: org.createdAt } : null,
      collections,
    };
  },
});

// ── Mutations ────────────────────────────────────────────────────────────────

/**
 * Erase the data subject: wipe every PII field on the account and profiles,
 * leaving a shell with an unidentifiable email so referential integrity holds.
 * Logs the action to the audit trail.
 */
export const anonymizeUser = mutation({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const caller = await requireSuperadmin(ctx);
    const user = await getUserOrThrow(ctx, userId);
    const stamp = Date.now();

    const anonEmail = `anon-${user._id.slice(-8)}@erased.local`;
    await ctx.db.patch(userId, {
      name: 'Anonymous User',
      email: anonEmail,
      phone: undefined,
      avatarUrl: undefined,
      location: undefined,
      position: undefined,
      department: undefined,
      employeeType: 'staff',
      dataAnonymizedAt: stamp,
    });

    const profile = await ctx.db
      .query('userProfiles')
      .withIndex('by_user', (f) => f.eq('userId', userId))
      .first();
    if (profile) {
      await ctx.db.patch(profile._id, {
        phone: undefined,
        avatarUrl: undefined,
        location: undefined,
        dateOfBirth: undefined,
        birthYear: undefined,
        dataAnonymizedAt: stamp,
      });
    }

    const employeeProfile = await ctx.db
      .query('employeeProfiles')
      .withIndex('by_user', (f) => f.eq('userId', userId))
      .first();
    if (employeeProfile) {
      await ctx.db.patch(employeeProfile._id, {
        address: undefined,
        emergencyContactName: undefined,
        emergencyContactPhone: undefined,
        emergencyContactRelation: undefined,
        passportNumber: undefined,
        passportIssuedBy: undefined,
        passportIssueDate: undefined,
        passportExpiryDate: undefined,
        socialCardNumber: undefined,
        nationality: undefined,
        biography: undefined,
        socialLinks: undefined,
        structuredWorkHistory: undefined,
        dataAnonymizedAt: stamp,
      });
    }

    await ctx.db.insert('auditLogs', {
      organizationId: user.organizationId ?? undefined,
      userId: caller._id,
      action: 'superadmin.gdpr.anonymize',
      target: userId,
      details: `Anonymized data subject ${user.email ?? userId}`,
      createdAt: stamp,
    } as never);

    return { success: true, anonEmail };
  },
});

/**
 * Full erasure: delete every owned record across the registry tables, then
 * anonymize and soft-delete the account. Requires the subject's email (or the
 * literal `ERASE`) typed in to confirm — this is irreversible.
 */
export const eraseUserData = mutation({
  args: { userId: v.id('users'), confirm: v.string() },
  handler: async (ctx, { userId, confirm }) => {
    const caller = await requireSuperadmin(ctx);
    const user = await getUserOrThrow(ctx, userId);

    const ok =
      confirm.trim() === 'ERASE' ||
      confirm.trim().toLowerCase() === (user.email ?? '').toLowerCase();
    if (!ok) {
      throw new Error('Confirmation mismatch — type the user email or ERASE to confirm erasure');
    }

    // 1. Cascade-delete owned records (auditLogs intentionally excluded).
    for (const c of USER_DATA_COLLECTIONS) {
      if (c.table === 'dataAccessLogs') continue;
      /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return -- dynamic table query */
      const rows = await (ctx.db.query(c.table) as any)
        .filter((f: any) => f.eq(f.field(c.field), userId))
        .take(MAX_ROWS_PER_TABLE * 4);
      const rowIds = (rows as { _id: string }[]).map((row) => row._id);
      for (const id of rowIds) {
        await ctx.db.delete(id as never);
      }
      /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
    }

    // 2. Anonymize + soft-delete the account.
    await ctx.db.patch(userId, {
      name: 'Erased User',
      email: `erased-${user._id.slice(-8)}@erased.local`,
      phone: undefined,
      avatarUrl: undefined,
      location: undefined,
      position: undefined,
      department: undefined,
      isActive: false,
      dataErasedAt: Date.now(),
    });

    await ctx.db.insert('auditLogs', {
      organizationId: user.organizationId ?? undefined,
      userId: caller._id,
      action: 'superadmin.gdpr.erase',
      target: userId,
      details: `Erased data subject ${user.email ?? userId} (right to be forgotten)`,
      createdAt: Date.now(),
    } as never);

    return { success: true };
  },
});
