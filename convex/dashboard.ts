import { v } from 'convex/values';
import { query } from './_generated/server';
import { getAuthCaller } from './lib/getAuthCaller';
import { getProfile, type UserProfile } from './lib/userProfile';
import { isSuperadmin } from './lib/auth';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP } from './lib/limits';
import type { Id, Doc } from './_generated/dataModel';

// ─────────────────────────────────────────────────────────────────────────────
// Employee Dashboard widgets
//   • getMyTasks          — the signed-in user's active tasks, soonest first
//   • getUpcomingBirthdays — org colleagues whose birthday falls within N days
//   • getOutOfOffice       — colleagues on approved leave now / in the next week
// ─────────────────────────────────────────────────────────────────────────────

// ── My Tasks ────────────────────────────────────────────────────────────────
// Active tasks (not completed/cancelled) assigned to the caller, ordered by the
// nearest deadline. Tasks without a deadline sort after dated ones.
// The caller is always the authenticated user; the userId arg is NOT accepted
// from the client to prevent data leakage across the org.
export const getMyTasks = query({
  args: {},
  handler: async (ctx, _args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];
    const userId = caller._id as Id<'users'>;

    // Pull the user's most recent tasks via the compound index, then keep the
    // ones that still need attention.
    const [pending, inProgress, review] = await Promise.all([
      ctx.db
        .query('tasks')
        .withIndex('by_assigned_status', (q) => q.eq('assignedTo', userId).eq('status', 'pending'))
        .take(SMALL_LIST_CAP),
      ctx.db
        .query('tasks')
        .withIndex('by_assigned_status', (q) =>
          q.eq('assignedTo', userId).eq('status', 'in_progress'),
        )
        .take(SMALL_LIST_CAP),
      ctx.db
        .query('tasks')
        .withIndex('by_assigned_status', (q) => q.eq('assignedTo', userId).eq('status', 'review'))
        .take(SMALL_LIST_CAP),
    ]);

    const active = [...pending, ...inProgress, ...review];

    // Scope to the caller's organization (superadmin sees everything).
    const scoped = isSuperadmin(caller)
      ? active
      : active.filter((t) => !caller.organizationId || t.organizationId === caller.organizationId);

    // Sort by soonest deadline; undated tasks go last, tie-break on creation.
    scoped.sort((a, b) => {
      if (a.deadline == null && b.deadline == null) return b.createdAt - a.createdAt;
      if (a.deadline == null) return 1;
      if (b.deadline == null) return -1;
      return a.deadline - b.deadline;
    });

    return scoped.map((t) => ({
      _id: t._id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      deadline: t.deadline,
      createdAt: t.createdAt,
    }));
  },
});

// ── Upcoming Birthdays ────────────────────────────────────────────────────────
// Colleagues in the caller's organization whose birthday lands within the next
// `withinDays` days (today inclusive). dateOfBirth is stored as ISO yyyy-mm-dd.
export const getUpcomingBirthdays = query({
  args: { withinDays: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller || !caller.organizationId) return [];

    const withinDays = args.withinDays ?? 30;

    const users = await ctx.db
      .query('users')
      .withIndex('by_org_active', (q) =>
        q.eq('organizationId', caller.organizationId).eq('isActive', true),
      )
      .take(DEFAULT_LIST_CAP);

    // Fall back to the profile's dateOfBirth when the user doc doesn't carry it.
    const profiles = await Promise.all(users.map((u) => getProfile(ctx, u._id)));

    const now = new Date();
    // Work in UTC date parts to stay deterministic and TZ-agnostic.
    const todayMonth = now.getUTCMonth(); // 0-11
    const todayDay = now.getUTCDate();

    const results: Array<{
      _id: Id<'users'>;
      name: string;
      avatarUrl?: string;
      department?: string;
      dateOfBirth: string;
      month: number; // 1-12
      day: number; // 1-31
      daysUntil: number;
      isToday: boolean;
    }> = [];

    users.forEach((u, i) => {
      const dob = u.dateOfBirth ?? profiles[i]?.dateOfBirth;
      if (!dob) return;

      // Expect yyyy-mm-dd; be lenient about separators.
      const parts = dob.split(/[-/.]/).map((p) => parseInt(p, 10));
      if (parts.length < 3) return;
      // Detect ordering: ISO (yyyy first) vs dd-mm-yyyy.
      let month: number;
      let day: number;
      if (parts[0]! > 31) {
        month = parts[1]!;
        day = parts[2]!;
      } else {
        // Assume dd-mm-yyyy
        day = parts[0]!;
        month = parts[1]!;
      }
      if (!month || !day || month < 1 || month > 12 || day < 1 || day > 31) return;

      // Days until the next occurrence of this month/day.
      const birthdayThisYear = new Date(Date.UTC(now.getUTCFullYear(), month - 1, day));
      const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), todayMonth, todayDay));
      let diff = Math.round((birthdayThisYear.getTime() - todayUtc.getTime()) / 86400000);
      if (diff < 0) {
        // Already passed this year — roll to next year.
        const birthdayNextYear = new Date(Date.UTC(now.getUTCFullYear() + 1, month - 1, day));
        diff = Math.round((birthdayNextYear.getTime() - todayUtc.getTime()) / 86400000);
      }

      if (diff <= withinDays) {
        const profile = profiles[i];
        results.push({
          _id: u._id,
          name: u.name,
          avatarUrl: profile?.avatarUrl ?? u.avatarUrl ?? u.faceImageUrl,
          department: profile?.department ?? u.department,
          dateOfBirth: dob,
          month,
          day,
          daysUntil: diff,
          isToday: month - 1 === todayMonth && day === todayDay,
        });
      }
    });

    // Soonest birthday first.
    results.sort((a, b) => a.daysUntil - b.daysUntil);
    return results;
  },
});

// ── Reporting Line ────────────────────────────────────────────────────────────
// The signed-in user's place in the org hierarchy: the upward chain of managers
// (supervisor → their supervisor → …) and the user's own direct reports. Kept
// read-only; assigning a supervisor happens in the employee profile UI.
export const getReportingLine = query({
  args: { userId: v.optional(v.id('users')) },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return null;

    // Default to the caller; allow inspecting another user only within the org.
    const targetId = args.userId ?? (caller._id as Id<'users'>);
    const me = await ctx.db.get(targetId);
    if (!me) return null;
    if (
      !isSuperadmin(caller) &&
      caller.organizationId &&
      me.organizationId !== caller.organizationId
    ) {
      return null;
    }

    const shape = (u: Doc<'users'> | null, profile: UserProfile | null) =>
      u
        ? {
            _id: u._id,
            name: u.name,
            avatarUrl: profile?.avatarUrl ?? u.avatarUrl ?? u.faceImageUrl,
            position: profile?.position ?? u.position,
            department: profile?.department ?? u.department,
          }
        : null;

    // Walk up the supervisor chain (bounded, cycle-safe).
    const managers: NonNullable<ReturnType<typeof shape>>[] = [];
    const seen = new Set<string>([targetId]);
    const myProfile = await getProfile(ctx, targetId);
    let supervisorId = myProfile?.supervisorId ?? me.supervisorId;
    for (let hops = 0; hops < 10 && supervisorId; hops++) {
      if (seen.has(supervisorId)) break;
      seen.add(supervisorId);
      const mgr = await ctx.db.get(supervisorId);
      if (!mgr) break;
      const mgrProfile = await getProfile(ctx, supervisorId);
      const s = shape(mgr, mgrProfile);
      if (s) managers.push(s);
      supervisorId = mgrProfile?.supervisorId ?? mgr.supervisorId;
    }

    // Direct reports: everyone whose supervisor is this user.
    const reportDocs = await ctx.db
      .query('users')
      .withIndex('by_supervisor', (q) => q.eq('supervisorId', targetId))
      .take(DEFAULT_LIST_CAP);
    const activeReports = reportDocs.filter((u) => u.isActive !== false);
    const reportProfiles = await Promise.all(activeReports.map((u) => getProfile(ctx, u._id)));
    const directReports = activeReports
      .map((u, i) => shape(u, reportProfiles[i] ?? null))
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      self: shape(me, myProfile),
      // Nearest manager first.
      managers,
      directReports,
    };
  },
});

// ── Out of Office ─────────────────────────────────────────────────────────────
// Colleagues whose approved leave overlaps the window [today, today+withinDays].
export const getOutOfOffice = query({
  args: { withinDays: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller || !caller.organizationId) return [];

    const withinDays = args.withinDays ?? 7;

    const approved = await ctx.db
      .query('leaveRequests')
      .withIndex('by_org_status', (q) =>
        q.eq('organizationId', caller.organizationId).eq('status', 'approved'),
      )
      .take(DEFAULT_LIST_CAP);

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const windowEnd = new Date(today.getTime() + withinDays * 86400000).toISOString().slice(0, 10);

    // Overlap test on ISO date strings (lexicographic == chronological for ISO).
    const relevant = approved.filter((l) => l.startDate <= windowEnd && l.endDate >= todayStr);

    // Enrich with the person's name / avatar / department.
    const userIds = [...new Set(relevant.map((l) => l.userId))];
    const [users, profiles] = await Promise.all([
      Promise.all(userIds.map((id) => ctx.db.get(id))),
      Promise.all(userIds.map((id) => getProfile(ctx, id))),
    ]);
    const userMap = new Map(users.map((u) => [u?._id, u]));
    const profileMap = new Map(userIds.map((id, i) => [id, profiles[i]]));

    return relevant
      .map((l) => {
        const u = userMap.get(l.userId);
        const profile = profileMap.get(l.userId);
        return {
          _id: l._id,
          userId: l.userId,
          name: u?.name ?? 'Unknown',
          avatarUrl: profile?.avatarUrl ?? u?.avatarUrl ?? u?.faceImageUrl,
          department: profile?.department ?? u?.department,
          type: l.type,
          startDate: l.startDate,
          endDate: l.endDate,
          isOutToday: l.startDate <= todayStr && l.endDate >= todayStr,
        };
      })
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  },
});
