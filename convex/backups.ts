/**
 * Employee Backup System
 * Автоматические бэкапы данных сотрудников (каждые 6 часов)
 *
 * Tables referenced (from schema):
 *   users, employeeProfiles, leaveRequests, tasks, companyEvents,
 *   reviewCycles, reviewAssignments, reviewResponses, reviewRatings,
 *   kudos, kudosBadgeAwards, userPoints, pointTransactions,
 *   objectives, keyResults, goalCheckins, employeeDocuments,
 *   employeeNotes, performanceMetrics, timeTracking, supervisorRatings,
 *   payrollRecords, signatures, onboardingTasks, learningRecords
 */

import { mutation, query, internalMutation } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { v } from 'convex/values';
import { getAuthCaller } from './lib/getAuthCaller';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { DEFAULT_LIST_CAP, XLARGE_LIST_CAP } from './lib/limits';

const BACKUP_RETENTION_HOURS = 48;

/**
 * Создать бэкап для одного сотрудника
 */
export const createEmployeeBackup = mutation({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const expiresAt = now + BACKUP_RETENTION_HOURS * 60 * 60 * 1000;

    const user = await ctx.db.get(args.userId);
    if (!user) return { success: false, reason: 'user_not_found' };

    if (user.organizationId?.toString() !== args.organizationId.toString()) {
      return { success: false, reason: 'user_not_in_org' };
    }

    const org = await ctx.db.get(args.organizationId);
    if (!org) {
      return { success: false, reason: 'org_not_found' };
    }

    const snapshot = await buildEmployeeSnapshot(ctx, args.organizationId, args.userId);

    const snapshotStr = JSON.stringify(snapshot);
    const snapshotSize = new TextEncoder().encode(snapshotStr).length;

    await ctx.db.insert('employeeBackups', {
      organizationId: args.organizationId,
      userId: args.userId,
      userEmail: user.email,
      userName: user.name,
      snapshot: snapshotStr,
      snapshotSize,
      createdAt: now,
      expiresAt,
    });

    return { success: true, size: snapshotSize };
  },
});

/**
 * Internal mutation для scheduled jobs
 */
export const createEmployeeBackupInternal = internalMutation({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const expiresAt = now + BACKUP_RETENTION_HOURS * 60 * 60 * 1000;

    const user = await ctx.db.get(args.userId);
    if (!user) return;

    const org = await ctx.db.get(args.organizationId);
    if (!org) return;

    const snapshot = await buildEmployeeSnapshot(ctx, args.organizationId, args.userId);

    const snapshotStr = JSON.stringify(snapshot);
    const snapshotSize = new TextEncoder().encode(snapshotStr).length;

    await ctx.db.insert('employeeBackups', {
      organizationId: args.organizationId,
      userId: args.userId,
      userEmail: user.email,
      userName: user.name,
      snapshot: snapshotStr,
      snapshotSize,
      createdAt: now,
      expiresAt,
    });
  },
});

/**
 * Создать бэкапы для всех сотрудников организации
 */
export const createOrgBackups = mutation({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.organizationId);
    if (!org) {
      return { success: false, reason: 'org_not_found' };
    }

    const employees = await ctx.db
      .query('users')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex('by_org', (q: any) => q.eq('organizationId', args.organizationId))
      .take(DEFAULT_LIST_CAP);

    let backedUp = 0;
    let failed = 0;

    for (const employee of employees) {
      try {
        await ctx.scheduler.runAfter(0, internal.backups.createEmployeeBackupInternal, {
          organizationId: args.organizationId,
          userId: employee._id,
        });
        backedUp++;
      } catch {
        failed++;
      }
    }

    return { success: true, backedUp, failed, total: employees.length };
  },
});

/**
 * Получить список бэкапов для организации
 */
export const getOrgBackups = query({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const backups = await ctx.db
      .query('employeeBackups')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex('by_org', (q: any) => q.eq('organizationId', args.organizationId))
      .take(DEFAULT_LIST_CAP);

    const activeBackups = backups.filter((b) => b.expiresAt > now);

    const groupedByUser = new Map<string, typeof activeBackups>();
    for (const backup of activeBackups) {
      const key = backup.userId.toString();
      if (!groupedByUser.has(key)) {
        groupedByUser.set(key, []);
      }
      groupedByUser.get(key)!.push(backup);
    }

    const result = [];
    for (const [userId, userBackups] of groupedByUser.entries()) {
      const latest = userBackups.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));
      result.push({
        userId,
        userName: latest.userName,
        userEmail: latest.userEmail,
        backupCount: userBackups.length,
        latestBackup: latest.createdAt,
        latestSize: latest.snapshotSize,
      });
    }

    result.sort((a, b) => b.latestBackup - a.latestBackup);

    return result;
  },
});

/**
 * Получить бэкапы для конкретного сотрудника
 */
export const getUserBackups = query({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const backups = await ctx.db
      .query('employeeBackups')
      .withIndex('by_org_user', (q) =>
        q.eq('organizationId', args.organizationId).eq('userId', args.userId),
      )
      .take(DEFAULT_LIST_CAP);

    return backups
      .filter((b) => b.expiresAt > now)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((b) => ({
        id: b._id,
        createdAt: b.createdAt,
        expiresAt: b.expiresAt,
        snapshotSize: b.snapshotSize,
        userName: b.userName,
        userEmail: b.userEmail,
      }));
  },
});

/**
 * Получить детали конкретного бэкапа
 */
export const getBackupDetails = query({
  args: {
    backupId: v.id('employeeBackups'),
  },
  handler: async (ctx, args) => {
    const backup = await ctx.db.get(args.backupId);
    if (!backup) return null;

    return {
      _id: backup._id,
      organizationId: backup.organizationId,
      userId: backup.userId,
      userName: backup.userName,
      userEmail: backup.userEmail,
      snapshotSize: backup.snapshotSize,
      createdAt: backup.createdAt,
      expiresAt: backup.expiresAt,
      snapshot: JSON.parse(backup.snapshot),
    };
  },
});

/**
 * Восстановить данные сотрудника из бэкапа (только superadmin)
 */
export const restoreEmployeeBackup = mutation({
  args: {
    backupId: v.id('employeeBackups'),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error('Not authenticated');
    }

    const adminUser = await ctx.db
      .query('users')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex('by_email', (q: any) => q.eq('email', identity.email!.toLowerCase()))
      .unique();

    if (!adminUser || adminUser.role !== 'superadmin') {
      throw new Error('Only superadmins can restore backups');
    }

    const backup = await ctx.db.get(args.backupId);
    if (!backup) {
      throw new Error('Backup not found');
    }

    if (backup.expiresAt < Date.now()) {
      throw new Error('Backup has expired');
    }

    const snapshot = JSON.parse(backup.snapshot);

    await restoreEmployeeData(ctx, backup.userId, snapshot);

    return { success: true, restoredAt: Date.now() };
  },
});

/**
 * Удалить просроченные бэкапы (cleanup job)
 */
export const cleanupExpiredBackups = mutation({
  handler: async (ctx) => {
    const now = Date.now();

    const expiredBackups = await ctx.db
      .query('employeeBackups')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex('by_expires', (q: any) => q.lte('expiresAt', now))
      .take(DEFAULT_LIST_CAP);

    let deleted = 0;
    for (const backup of expiredBackups) {
      await ctx.db.delete(backup._id);
      deleted++;
    }

    return { deleted };
  },
});

/**
 * Internal: Backup all Enterprise organizations (cron job)
 */
export const backupAllEnterpriseOrgs = internalMutation({
  handler: async (ctx) => {
    const orgs = await ctx.db
      .query('organizations')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex('by_plan', (q: any) => q.eq('plan', 'enterprise'))
      .take(DEFAULT_LIST_CAP);

    let totalBackedUp = 0;
    let totalFailed = 0;

    for (const org of orgs) {
      try {
        const result = await ctx.scheduler.runAfter(0, internal.backups.createOrgBackupsInternal, {
          organizationId: org._id,
        });
        totalBackedUp++;
      } catch {
        totalFailed++;
      }
    }

    return { orgsProcessed: orgs.length, backedUp: totalBackedUp, failed: totalFailed };
  },
});

/**
 * Internal: Create backups for all employees in an org (cron job)
 */
export const createOrgBackupsInternal = internalMutation({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.organizationId);
    if (!org) return;

    const employees = await ctx.db
      .query('users')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex('by_org', (q: any) => q.eq('organizationId', args.organizationId))
      .take(DEFAULT_LIST_CAP);

    for (const employee of employees) {
      try {
        await ctx.scheduler.runAfter(0, internal.backups.createEmployeeBackupInternal, {
          organizationId: args.organizationId,
          userId: employee._id,
        });
      } catch {
        // Silently skip failed employees
      }
    }
  },
});

/**
 * Internal: Cleanup expired backups (cron job)
 */
export const cleanupExpiredBackupsInternal = internalMutation({
  handler: async (ctx) => {
    const now = Date.now();

    const expiredBackups = await ctx.db
      .query('employeeBackups')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex('by_expires', (q: any) => q.lte('expiresAt', now))
      .take(DEFAULT_LIST_CAP);

    let deleted = 0;
    for (const backup of expiredBackups) {
      await ctx.db.delete(backup._id);
      deleted++;
    }

    return { deleted };
  },
});

/**
 * Получить статистику бэкапов (superadmin)
 */
export const getBackupStats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { totalBackups: 0, totalSize: 0, orgsBackedUp: 0 };
    }

    const adminUser = await ctx.db
      .query('users')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex('by_email', (q: any) => q.eq('email', identity.email!.toLowerCase()))
      .unique();

    if (!adminUser || adminUser.role !== 'superadmin') {
      return { totalBackups: 0, totalSize: 0, orgsBackedUp: 0 };
    }

    const now = Date.now();
    // Admin-only superadmin dashboard: cap with XLARGE cap. Proper fix would
    // be to aggregate per-org counts via a materialized view.
    const allBackups = await ctx.db.query('employeeBackups').take(XLARGE_LIST_CAP);

    const activeBackups = allBackups.filter((b) => b.expiresAt > now);
    const totalSize = activeBackups.reduce((sum, b) => sum + b.snapshotSize, 0);
    const uniqueOrgs = new Set(activeBackups.map((b) => b.organizationId.toString())).size;

    return {
      totalBackups: activeBackups.length,
      totalSize,
      orgsBackedUp: uniqueOrgs,
    };
  },
});

/**
 * Проверить, есть ли у организации доступ к бэкапам
 */
export const hasBackupAccess = query({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.organizationId);
    return !!org;
  },
});

/* ═══════════════════════════════════════════════════════════════
   Internal helpers
   ═══════════════════════════════════════════════════════════════ */

async function buildEmployeeSnapshot(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  organizationId: Id<'organizations'>,
  userId: Id<'users'>,
) {
  const user = await ctx.db.get(userId);

  const employeeProfile = await ctx.db
    .query('employeeProfiles')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex('by_user', (q: any) => q.eq('userId', userId))
    .first();

  const leaves = await ctx.db
    .query('leaveRequests')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex('by_user', (q: any) => q.eq('userId', userId))
    .take(DEFAULT_LIST_CAP);

  const tasks = await ctx.db
    .query('tasks')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex('by_assigned_to', (q: any) => q.eq('assignedTo', userId))
    .take(DEFAULT_LIST_CAP);

  const createdTasks = await ctx.db
    .query('tasks')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex('by_assigned_by', (q: any) => q.eq('assignedBy', userId))
    .take(DEFAULT_LIST_CAP);

  // TODO: companyEvents has no by_creator index; currently scoped to org then
  // filtered in-memory. Acceptable for backup job — cap bounds memory usage.
  const events = await ctx.db
    .query('companyEvents')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex('by_org', (q: any) => q.eq('organizationId', organizationId))
    .take(DEFAULT_LIST_CAP)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .then((all: any[]) => all.filter((e) => e.createdBy === userId));

  const reviewCycles = await ctx.db
    .query('reviewCycles')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex('by_org', (q: any) => q.eq('organizationId', organizationId))
    .take(DEFAULT_LIST_CAP);

  const reviewAssignments = await ctx.db
    .query('reviewAssignments')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex('by_reviewer', (q: any) => q.eq('reviewerId', userId))
    .take(DEFAULT_LIST_CAP);

  // TODO: reviewResponses has no by_reviewee index; inline filter forces full
  // table scan. Add index when refactoring performance module.
  const reviewResponses = await ctx.db
    .query('reviewResponses')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((q: any) => q.eq(q.field('revieweeId'), userId))
    .take(DEFAULT_LIST_CAP);

  const kudos = await ctx.db
    .query('kudos')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex('by_receiver', (q: any) => q.eq('receiverId', userId))
    .take(DEFAULT_LIST_CAP);

  const sentKudos = await ctx.db
    .query('kudos')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex('by_sender', (q: any) => q.eq('senderId', userId))
    .take(DEFAULT_LIST_CAP);

  const userPoints = await ctx.db
    .query('userPoints')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex('by_user', (q: any) => q.eq('userId', userId))
    .first();

  const pointTransactions = await ctx.db
    .query('pointTransactions')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex('by_user', (q: any) => q.eq('userId', userId))
    .take(DEFAULT_LIST_CAP);

  const objectives = await ctx.db
    .query('objectives')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex('by_owner', (q: any) => q.eq('ownerId', userId))
    .take(DEFAULT_LIST_CAP);

  const documents = await ctx.db
    .query('employeeDocuments')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex('by_user', (q: any) => q.eq('userId', userId))
    .take(DEFAULT_LIST_CAP);

  const notes = await ctx.db
    .query('employeeNotes')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex('by_employee', (q: any) => q.eq('employeeId', userId))
    .take(DEFAULT_LIST_CAP);

  const performanceMetrics = await ctx.db
    .query('performanceMetrics')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex('by_user', (q: any) => q.eq('userId', userId))
    .take(DEFAULT_LIST_CAP);

  const timeTracking = await ctx.db
    .query('timeTracking')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex('by_user', (q: any) => q.eq('userId', userId))
    .take(DEFAULT_LIST_CAP);

  const ratings = await ctx.db
    .query('supervisorRatings')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex('by_employee', (q: any) => q.eq('employeeId', userId))
    .take(DEFAULT_LIST_CAP);

  const signatureDocs = await ctx.db
    .query('signatureDocuments')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex('by_creator', (q: any) => q.eq('createdBy', userId))
    .take(DEFAULT_LIST_CAP);

  const signatureRequests = await ctx.db
    .query('signatureRequests')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex('by_signer', (q: any) => q.eq('signerId', userId))
    .take(DEFAULT_LIST_CAP);

  const sanitizedUser = user
    ? {
        ...user,
        passwordHash: undefined,
        sessionToken: undefined,
        totpSecret: undefined,
        backupCodes: undefined,
        webauthnChallenge: undefined,
        faceDescriptor: undefined,
        faceImageUrl: undefined,
        resetPasswordToken: undefined,
        resetPasswordExpiry: undefined,
      }
    : null;

  return {
    user: sanitizedUser,
    employeeProfile,
    leaves,
    tasks,
    createdTasks,
    events,
    reviewCycles: reviewCycles.length,
    reviewAssignments,
    reviewResponses,
    kudos,
    sentKudos,
    userPoints,
    pointTransactions,
    objectives,
    documents,
    notes,
    performanceMetrics,
    timeTracking,
    ratings,
    signatureDocs,
    signatureRequests,
    snapshotTimestamp: Date.now(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function restoreEmployeeData(ctx: any, userId: Id<'users'>, snapshot: any) {
  const { user, employeeProfile, leaves, tasks, createdTasks, events, ...rest } = snapshot;

  if (user) {
    const existingUser = await ctx.db.get(userId);
    if (existingUser) {
      const { _id, _creationTime, ...updatableFields } = user;
      await ctx.db.patch(userId, updatableFields);
    }
  }

  if (employeeProfile) {
    const existing = await ctx.db
      .query('employeeProfiles')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex('by_user', (q: any) => q.eq('userId', userId))
      .first();

    if (existing) {
      const { _id, _creationTime, ...updatable } = employeeProfile;
      await ctx.db.patch(existing._id, updatable);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECURED: Create org backups — verified identity
// ═══════════════════════════════════════════════════════════════════════════════
export const secureCreateOrgBackups = mutation({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, { organizationId }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    if (caller.role !== 'superadmin' && caller.organizationId !== organizationId) {
      throw new Error('Access denied: cross-organization operation');
    }
    const org = await ctx.db.get(organizationId);
    if (!org) return { success: false };

    const employees = await ctx.db
      .query('users')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex('by_org', (q: any) => q.eq('organizationId', organizationId))
      .take(DEFAULT_LIST_CAP);

    for (const employee of employees) {
      await ctx.scheduler.runAfter(0, internal.backups.createEmployeeBackupInternal, {
        organizationId,
        userId: employee._id,
      });
    }
    return { success: true };
  },
});
