/**
 * Migrations for fixing duplicate users
 */

import { mutation, internalMutation } from './_generated/server';
import { XLARGE_LIST_CAP } from './lib/limits';
import { backfillAssetActContent } from '../src/lib/assetActContent';

// ─────────────────────────────────────────────────────────────────────────────
// Fix duplicate users — merge users with same email
// ─────────────────────────────────────────────────────────────────────────────
export const fixDuplicateUsers = mutation({
  args: {},
  handler: async (ctx) => {
    const allUsers = await ctx.db.query('users').take(XLARGE_LIST_CAP);

    // Group by email
    const emailMap = new Map<string, typeof allUsers>();

    for (const user of allUsers) {
      const email = user.email.toLowerCase();
      const existing = emailMap.get(email) || [];
      existing.push(user);
      emailMap.set(email, existing);
    }

    let fixedCount = 0;

    for (const [_email, users] of emailMap.entries()) {
      if (users.length <= 1) continue;

      // Find the approved user (prefer approved over non-approved)
      const approvedUser = users.find((u) => u.isApproved);
      const nonApprovedUsers = users.filter((u) => u !== approvedUser);

      if (approvedUser && nonApprovedUsers.length > 0) {
        // Delete non-approved duplicates
        for (const dupUser of nonApprovedUsers) {
          await ctx.db.delete(dupUser._id);
          fixedCount++;
        }
      } else {
        // No approved user — keep the one with organizationId
        const userWithOrg = users.find((u) => u.organizationId);
        const usersWithoutOrg = users.filter((u) => u !== userWithOrg);

        if (userWithOrg && usersWithoutOrg.length > 0) {
          for (const dupUser of usersWithoutOrg) {
            await ctx.db.delete(dupUser._id);
            fixedCount++;
          }
        }
      }
    }

    return { fixed: fixedCount };
  },
});

// ── Migration: add new balance fields to existing users ─────────────────────
export const migrateNewBalanceFields = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query('users').take(XLARGE_LIST_CAP);
    let updated = 0;

    for (const user of users) {
      const patch: Record<string, number> = {};
      if (user.dayOffBalance === undefined) patch.dayOffBalance = 6;
      if (user.maternityLeaveBalance === undefined) patch.maternityLeaveBalance = 0;
      if (user.studyLeaveBalance === undefined) patch.studyLeaveBalance = 5;

      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(user._id, patch);
        updated++;
      }

      // Also update userProfiles if exists
      const profile = await ctx.db
        .query('userProfiles')
        .withIndex('by_user', (q) => q.eq('userId', user._id))
        .first();
      if (profile) {
        const profilePatch: Record<string, number> = {};
        if (profile.dayOffBalance === undefined) profilePatch.dayOffBalance = 6;
        if (profile.maternityLeaveBalance === undefined) profilePatch.maternityLeaveBalance = 0;
        if (profile.studyLeaveBalance === undefined) profilePatch.studyLeaveBalance = 5;
        if (Object.keys(profilePatch).length > 0) {
          await ctx.db.patch(profile._id, profilePatch);
        }
      }
    }

    return { updated, total: users.length };
  },
});

// ── Migration: copy preferences from users to userSettings ─────────────────
export const migratePreferencesToUserSettings = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query('users').take(XLARGE_LIST_CAP);
    let migrated = 0;

    for (const user of users) {
      // Skip if already migrated
      const existing = await ctx.db
        .query('userSettings')
        .withIndex('by_user', (q) => q.eq('userId', user._id))
        .first();
      if (existing) continue;

      // Only create if user has any preference set
      const hasPrefs =
        user.language ||
        user.timezone ||
        user.theme ||
        user.dateFormat ||
        user.timeFormat ||
        user.firstDayOfWeek ||
        user.notificationsEnabled !== undefined ||
        user.focusModeEnabled !== undefined;
      if (!hasPrefs) continue;

      await ctx.db.insert('userSettings', {
        userId: user._id,
        language: user.language,
        timezone: user.timezone,
        dateFormat: user.dateFormat,
        timeFormat: user.timeFormat,
        firstDayOfWeek: user.firstDayOfWeek,
        theme: user.theme,
        compactMode: user.compactMode,
        defaultView: user.defaultView,
        dataRefreshRate: user.dataRefreshRate,
        dashboardWidgets: user.dashboardWidgets,
        notificationsEnabled: user.notificationsEnabled,
        emailNotifications: user.emailNotifications,
        pushNotifications: user.pushNotifications,
        focusModeEnabled: user.focusModeEnabled,
        workHoursStart: user.workHoursStart,
        workHoursEnd: user.workHoursEnd,
        breakRemindersEnabled: user.breakRemindersEnabled,
        breakInterval: user.breakInterval,
        dailyTaskGoal: user.dailyTaskGoal,
      });
      migrated++;
    }

    return { migrated, total: users.length };
  },
});

// ── Migration: copy profile fields from users to userProfiles ──────────────
export const migrateProfilesToUserProfiles = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query('users').take(XLARGE_LIST_CAP);
    let migrated = 0;

    for (const user of users) {
      const existing = await ctx.db
        .query('userProfiles')
        .withIndex('by_user', (q) => q.eq('userId', user._id))
        .first();
      if (existing) continue;

      await ctx.db.insert('userProfiles', {
        userId: user._id,
        employeeType: user.employeeType,
        department: user.department,
        departmentId: user.departmentId,
        position: user.position,
        positionId: user.positionId,
        supervisorId: user.supervisorId,
        phone: user.phone,
        location: user.location,
        avatarUrl: user.avatarUrl,
        dateOfBirth: user.dateOfBirth,
        presenceStatus: user.presenceStatus,
        travelAllowance: user.travelAllowance,
        paidLeaveBalance: user.paidLeaveBalance,
        sickLeaveBalance: user.sickLeaveBalance,
        familyLeaveBalance: user.familyLeaveBalance,
        dayOffBalance: user.dayOffBalance ?? 6,
        maternityLeaveBalance: user.maternityLeaveBalance ?? 0,
        studyLeaveBalance: user.studyLeaveBalance ?? 5,
      });
      migrated++;
    }

    return { migrated, total: users.length };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Backfill asset handover / return acts ("Акт приёма-передачи")
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Upgrade historical acts to the current storage format so they render in the
 * reader's language.
 *
 * Acts created before this migration stored the date as pre-formatted English
 * text (and the oldest ones stored the whole body as English markdown), so a
 * Russian/Armenian/German reader still saw "August 1, 2026". Here we add the
 * canonical `dateTs`, convert legacy markdown bodies to JSON, and fill the
 * asset/party details that were not captured at creation time.
 *
 * Idempotent: only missing values are written. Run from the Convex dashboard
 * (Functions → migrations:backfillAssetActMetadata → Run) or via
 * `npx convex run migrations:backfillAssetActMetadata`.
 */
export const backfillAssetActMetadata = internalMutation({
  args: {},
  handler: async (ctx) => {
    const documents = await ctx.db.query('signatureDocuments').take(XLARGE_LIST_CAP);
    const acts = documents.filter((d) => typeof d.content === 'string' && d.content.length > 0);
    if (acts.length === 0) return { updated: 0, totalDocuments: documents.length };

    // No index maps a signature document back to its assignment, so build the
    // reverse lookup in a single pass instead of scanning per document.
    const assignments = await ctx.db.query('assetAssignments').take(XLARGE_LIST_CAP);
    const assignmentByDocId = new Map<string, (typeof assignments)[number]>();
    for (const assignment of assignments) {
      if (assignment.movementFormDocId) {
        assignmentByDocId.set(assignment.movementFormDocId, assignment);
      }
      if (assignment.returnFormDocId) {
        assignmentByDocId.set(assignment.returnFormDocId, assignment);
      }
    }

    let updated = 0;

    for (const doc of acts) {
      const assignment = assignmentByDocId.get(doc._id);
      const asset = assignment ? await ctx.db.get(assignment.assetId) : null;
      const assignee = assignment ? await ctx.db.get(assignment.assignedTo) : null;
      const assigner = assignment ? await ctx.db.get(assignment.assignedBy) : null;

      const next = backfillAssetActContent(doc.content, {
        createdAt: doc.createdAt,
        asset: asset
          ? {
              serialNumber: asset.serialNumber,
              assetTag: asset.assetTag,
              category: asset.category,
              brand: asset.brand,
              model: asset.model,
              location: asset.location,
              condition: asset.condition,
            }
          : null,
        assignee: assignee ? { email: assignee.email, position: assignee.position } : null,
        assigner: assigner ? { position: assigner.position } : null,
      });

      // `null` means the document is not an act, or is already up to date.
      if (next === null || next === doc.content) continue;
      await ctx.db.patch(doc._id, { content: next });
      updated++;
    }

    return { updated, totalDocuments: documents.length };
  },
});
