import { v } from 'convex/values';
import { mutation, query, type QueryCtx, type MutationCtx } from './_generated/server';
import { Id } from './_generated/dataModel';
import { isSuperadmin } from './lib/auth';
import { DEFAULT_LIST_CAP, XLARGE_LIST_CAP } from './lib/limits';
import { getProfile } from './lib/userProfile';
import { creditBalance, resolveRecognitionSettings } from './lib/points';
import { getAuthCaller } from './lib/getAuthCaller';
import { hasCapability, hasOrgWideReach } from './lib/capabilities';
import { assertModuleAccess } from './lib/entitlements';
import { isAncestorOf, getSubordinateIds } from './lib/reportingLine';
import { canAccessUser } from './lib/rbac';
import { isSystemAccountEmail } from './lib/systemAccounts';

// ─────────────────────────────────────────────────────────────────────────────
// Whose attendance may the caller touch?
// ─────────────────────────────────────────────────────────────────────────────
// This module used to take `userId` from the client and act on it with no
// authentication at all — anyone signed in could clock in or out as anyone else,
// in any organization, and mark anyone absent. Attendance feeds statistics and
// the overtime hours that payroll pays for, so it is not a cosmetic record.
//
// Clocking yourself in is self-service. Doing it for somebody else is an HR
// correction (the employee forgot, or handed in a paper form), so it needs
// `attendance.manage`: org-wide for HR/admins, own subtree for a manager.

/**
 * @param selfAllowed `false` for actions nobody should perform on themselves,
 *   such as marking oneself absent.
 * @returns the id whose record may be written.
 */
async function assertMayRecordAttendance(
  ctx: MutationCtx,
  targetUserId: Id<'users'> | undefined,
  opts: { selfAllowed?: boolean } = {},
): Promise<Id<'users'>> {
  const { selfAllowed = true } = opts;
  const caller = await getAuthCaller(ctx);
  if (!caller) throw new Error('Not authenticated');

  const userId = targetUserId ?? caller._id;
  if (userId === caller._id) {
    if (!selfAllowed) throw new Error('You cannot record this for yourself');
    return userId;
  }

  const target = await ctx.db.get(userId);
  if (!target) throw new Error('User not found');
  if (isSuperadmin(caller)) return userId;

  if (!caller.organizationId || caller.organizationId !== target.organizationId) {
    throw new Error('Access denied: cross-organization operation');
  }

  // `getAuthCaller` already carries the role, so the capability decision needs no
  // second read of the caller's own document.
  if (!hasCapability(caller, 'attendance.manage')) {
    throw new Error('You can only record your own attendance');
  }
  if (!hasOrgWideReach(caller) && !(await isAncestorOf(ctx, caller._id, userId))) {
    throw new Error("Only a manager in this employee's reporting line may record their attendance");
  }
  return userId;
}

/**
 * May the caller read this person's attendance? Follows the same rule as every
 * other personal record: yourself, your subtree, or an org-wide reader.
 *
 * Queries degrade to empty data instead of throwing, per the convention in this
 * codebase — an error boundary on a dashboard widget is worse than a blank card.
 */
async function mayReadAttendance(ctx: QueryCtx, userId: Id<'users'>): Promise<boolean> {
  const caller = await getAuthCaller(ctx);
  if (!caller) return false;
  return canAccessUser(ctx, caller._id, userId);
}

/**
 * Who is looking at org-wide attendance? The role comes from the
 * *authenticated caller*, never from a client-supplied id — the old
 * `args.adminId` check read the role of whatever id the client sent, so any
 * employee could read the whole org's attendance by passing an admin's id.
 *
 * - admin → org-wide within their organization
 * - superadmin → everything
 * - supervisor → own reporting subtree only
 * - everyone else → null (no access; queries degrade to empty data)
 */
async function resolveAttendanceScope(
  ctx: QueryCtx,
): Promise<{ orgToFilter: Id<'organizations'> | null; subtreeIds: Id<'users'>[] | null } | null> {
  const caller = await getAuthCaller(ctx);
  if (!caller) return null;
  if (caller.role === 'admin' || isSuperadmin(caller)) {
    return {
      orgToFilter: isSuperadmin(caller) ? null : (caller.organizationId ?? null),
      subtreeIds: null,
    };
  }
  if (caller.role === 'supervisor' && caller.organizationId) {
    const subtree = await getSubordinateIds(ctx, caller._id, caller.organizationId);
    return { orgToFilter: caller.organizationId, subtreeIds: subtree };
  }
  return null;
}

// Armenia timezone offset: UTC+4
const ARMENIA_OFFSET_MS = 4 * 60 * 60 * 1000;

// Helper: get today's date string in Armenia timezone (UTC+4)
function getTodayDate() {
  const now = new Date();
  const armeniaTime = new Date(now.getTime() + ARMENIA_OFFSET_MS);
  return armeniaTime.toISOString().split('T')[0] || '';
}

// Helper: get scheduled start/end timestamps in Armenia timezone (UTC+4)
// Armenia is UTC+4, so Armenia 09:00 = UTC 05:00, Armenia 18:00 = UTC 14:00
// dateStr is "YYYY-MM-DD" in Armenia local date
function getScheduledTimestamps(dateStr: string, startTime: string, endTime: string) {
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);

  const [year, month, day] = dateStr.split('-').map(Number);

  // Armenia midnight in UTC = UTC midnight MINUS 4h (because Armenia is UTC+4, ahead of UTC)
  // Armenia 00:00 = UTC (previous day) 20:00
  // So: UTC timestamp of Armenia midnight = Date.UTC(year, month-1, day) - ARMENIA_OFFSET_MS
  // Then Armenia HH:MM = Armenia midnight + HH*60+MM minutes
  // But since Date.now() returns UTC, we compare directly:
  // Armenia 09:00 as UTC ms = Date.UTC(year, month-1, day) - ARMENIA_OFFSET_MS + 9*3600*1000

  const armeniaDayStartUTC = Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1) - ARMENIA_OFFSET_MS;

  const scheduledStart = armeniaDayStartUTC + ((startHour ?? 0) * 60 + (startMin ?? 0)) * 60 * 1000;
  const scheduledEnd = armeniaDayStartUTC + ((endHour ?? 0) * 60 + (endMin ?? 0)) * 60 * 1000;

  return { scheduledStart, scheduledEnd };
}

// ── Check In (Employee arrives at work) ──────────────────────────────────
export const checkIn = mutation({
  args: {
    // Optional: the caller's own id is used when omitted. Supplying somebody
    // else's id is an HR correction and needs `attendance.manage`.
    userId: v.optional(v.id('users')),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'attendance');
    const userId = await assertMayRecordAttendance(ctx, args.userId);
    const now = Date.now();
    const today = getTodayDate();

    // Check if already checked in today
    const existing = await ctx.db
      .query('timeTracking')
      .withIndex('by_user_date', (q) => q.eq('userId', userId).eq('date', today))
      .first();

    if (existing && existing.status === 'checked_in') {
      throw new Error('Already checked in today');
    }

    // Get work schedule (default 9:00-18:00)
    const schedule = await ctx.db
      .query('workSchedule')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .first();

    const startTime = schedule?.startTime || '09:00';
    const endTime = schedule?.endTime || '18:00';

    // Create scheduled times for today in Armenia timezone
    const { scheduledStart, scheduledEnd } = getScheduledTimestamps(today, startTime, endTime);

    // Calculate if late (after 9:00 AM Armenia time)
    const isLate = now > scheduledStart;
    const lateMinutes = isLate ? Math.floor((now - scheduledStart) / 1000 / 60) : 0;

    // Create or update time tracking record
    let recordId: Id<'timeTracking'>;
    if (existing) {
      // Update existing record
      await ctx.db.patch(existing._id, {
        checkInTime: now,
        status: 'checked_in',
        isLate,
        lateMinutes: lateMinutes > 0 ? lateMinutes : undefined,
        updatedAt: now,
      });
      recordId = existing._id;
    } else {
      // Create new record
      recordId = await ctx.db.insert('timeTracking', {
        userId,
        checkInTime: now,
        scheduledStartTime: scheduledStart,
        scheduledEndTime: scheduledEnd,
        isLate,
        lateMinutes: lateMinutes > 0 ? lateMinutes : undefined,
        isEarlyLeave: false,
        status: 'checked_in',
        date: today,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Attendance credit. The amount is per-organization policy now (0 switches
    // it off): once points buy real vouchers, paying for mere presence is a
    // choice a tenant makes, not a constant baked into check-in.
    const user = await ctx.db.get(userId);
    if (user?.organizationId) {
      const orgId = user.organizationId;
      const settings = await resolveRecognitionSettings(ctx, orgId);
      if (settings.attendanceReward > 0) {
        const todayObj = new Date();
        todayObj.setHours(0, 0, 0, 0);
        const todayStart = todayObj.getTime();
        const existingPointsToday = await ctx.db
          .query('pointTransactions')
          .withIndex('by_org_user_created', (q) =>
            q.eq('organizationId', orgId).eq('userId', userId).gte('createdAt', todayStart),
          )
          .filter((q) => q.eq(q.field('type'), 'earned_attendance'))
          .first();

        if (!existingPointsToday) {
          await creditBalance(ctx, {
            organizationId: orgId,
            userId,
            amount: settings.attendanceReward,
            type: 'earned_attendance',
            description: 'Daily attendance',
          });
        }
      }
    }

    return recordId;
  },
});

// ── Check Out (Employee leaves work) ─────────────────────────────────────
export const checkOut = mutation({
  args: {
    userId: v.optional(v.id('users')),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'attendance');
    const userId = await assertMayRecordAttendance(ctx, args.userId);
    const now = Date.now();
    const today = getTodayDate();

    // Find today's check-in record
    const record = await ctx.db
      .query('timeTracking')
      .withIndex('by_user_date', (q) => q.eq('userId', userId).eq('date', today))
      .first();

    if (!record) {
      throw new Error('No check-in record found for today');
    }

    if (record.status === 'checked_out') {
      throw new Error('Already checked out today');
    }

    // Recalculate scheduled end fresh (correct Armenia UTC+4 timezone)
    const scheduleForOut = await ctx.db
      .query('workSchedule')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .first();
    const endTime = scheduleForOut?.endTime || '18:00';
    const startTime = scheduleForOut?.startTime || '09:00';
    const { scheduledStart: freshStart, scheduledEnd: freshEnd } = getScheduledTimestamps(
      today,
      startTime,
      endTime,
    );

    // --- Overtime integration ---
    // Check if there's an approved overtime request for today.
    // If so, extend the scheduled end to the overtime end time.
    // This means the employee is allowed to stay until the approved overtime end.
    const approvedOvertime = await ctx.db
      .query('overtimeRequests')
      .withIndex('by_user_date', (q) => q.eq('userId', userId).eq('date', today))
      .filter((q) => q.eq(q.field('status'), 'approved'))
      .first();

    let effectiveEnd = freshEnd;
    let hasApprovedOvertime = false;
    if (approvedOvertime) {
      // Parse overtime end time and create a timestamp for it
      const [otEndH, otEndM] = approvedOvertime.endTime.split(':').map(Number);
      const armeniaDayStartUTC =
        Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()) -
        ARMENIA_OFFSET_MS;
      const otEndTimestamp = armeniaDayStartUTC + ((otEndH ?? 0) * 60 + (otEndM ?? 0)) * 60 * 1000;
      // Use the later of scheduled end and overtime end
      effectiveEnd = Math.max(freshEnd, otEndTimestamp);
      hasApprovedOvertime = true;
    }

    // Patch the record with correct scheduled times (fixes old stale values)
    await ctx.db.patch(record._id, {
      scheduledStartTime: freshStart,
      scheduledEndTime: freshEnd,
      // Store overtime info if applicable
      ...(hasApprovedOvertime ? { overtimeMinutes: undefined } : {}),
    });

    // Calculate worked time
    const totalWorkedMinutes = Math.floor((now - record.checkInTime) / 1000 / 60);

    // Calculate if early leave (compare against effective end - including overtime)
    const isEarlyLeave = now < effectiveEnd;
    const earlyLeaveMinutes = isEarlyLeave ? Math.floor((effectiveEnd - now) / 1000 / 60) : 0;

    // Calculate overtime: only counts if it exceeds the approved overtime end time
    // If no overtime was approved, any time past scheduled end is overtime
    // If overtime was approved, only time past the approved overtime end is extra overtime
    const overtimeMinutes = now > effectiveEnd ? Math.floor((now - effectiveEnd) / 1000 / 60) : 0;

    // Update record
    await ctx.db.patch(record._id, {
      checkOutTime: now,
      status: 'checked_out',
      totalWorkedMinutes,
      isEarlyLeave,
      earlyLeaveMinutes: earlyLeaveMinutes > 0 ? earlyLeaveMinutes : undefined,
      overtimeMinutes: overtimeMinutes > 0 ? overtimeMinutes : undefined,
      notes: args.notes,
      updatedAt: now,
    });

    // If approved overtime was used, link it to the timeTracking record
    if (hasApprovedOvertime && approvedOvertime) {
      await ctx.db.patch(approvedOvertime._id, {
        approvedTimeTrackingId: record._id,
      });
    }

    return record._id;
  },
});

// ── Get Today's Status ───────────────────────────────────────────────────
export const getTodayStatus = query({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    if (!(await mayReadAttendance(ctx, args.userId))) return null;
    const today = getTodayDate();

    const record = await ctx.db
      .query('timeTracking')
      .withIndex('by_user_date', (q) => q.eq('userId', args.userId).eq('date', today))
      .first();

    return record || null;
  },
});

// ── Get User's Time Tracking History ─────────────────────────────────────
export const getUserHistory = query({
  args: {
    userId: v.id('users'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!(await mayReadAttendance(ctx, args.userId))) return [];
    const records = await ctx.db
      .query('timeTracking')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .order('desc')
      .take(args.limit || 30);

    return records;
  },
});

// ── Get All Employees Currently At Work ──────────────────────────────────
export const getCurrentlyAtWork = query({
  args: {
    /** @deprecated kept for API compatibility — the caller's own identity is used. */
    adminId: v.id('users'),
  },
  handler: async (ctx, args) => {
    void args;
    const scope = await resolveAttendanceScope(ctx);
    if (!scope) return [];
    const { orgToFilter, subtreeIds } = scope;

    const today = getTodayDate();
    const records = await ctx.db
      .query('timeTracking')
      .withIndex('by_date', (q) => q.eq('date', today))
      .take(DEFAULT_LIST_CAP);

    const atWork = records.filter((r) => r.status === 'checked_in');

    const withUsers = await Promise.all(
      atWork.map(async (record) => {
        const user = await ctx.db.get(record.userId);
        if (!user) return null;

        // Skip if org doesn't match
        if (orgToFilter && user.organizationId !== orgToFilter) return null;

        // Supervisors see only their reporting subtree
        if (subtreeIds && !subtreeIds.includes(record.userId)) return null;

        // Skip superadmins - they should not appear in employee attendance lists
        if (user.role === 'superadmin') return null;

        const profile = await getProfile(ctx, record.userId);
        const userWithAvatar = {
          ...user,
          avatarUrl: profile?.avatarUrl ?? user.avatarUrl ?? user.faceImageUrl,
        };
        return { ...record, user: userWithAvatar };
      }),
    );

    return withUsers.filter(Boolean);
  },
});

// ── Get Recent Attendance for a user (last N days) ───────────────────────
export const getRecentAttendance = query({
  args: { userId: v.id('users'), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    if (!(await mayReadAttendance(ctx, args.userId))) return [];
    const limit = args.limit ?? 7;
    const records = await ctx.db
      .query('timeTracking')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .order('desc')
      .take(limit);
    return records;
  },
});

// ── Get Today's Full Attendance (all who checked in/out) ─────────────────
export const getTodayAllAttendance = query({
  args: {
    /** @deprecated kept for API compatibility — the caller's own identity is used. */
    adminId: v.id('users'),
  },
  handler: async (ctx, args) => {
    void args;
    const scope = await resolveAttendanceScope(ctx);
    if (!scope) return [];
    const { orgToFilter, subtreeIds } = scope;

    const today = getTodayDate();
    const records = await ctx.db
      .query('timeTracking')
      .withIndex('by_date', (q) => q.eq('date', today))
      .take(DEFAULT_LIST_CAP);

    const withUsers = await Promise.all(
      records.map(async (record) => {
        const user = await ctx.db.get(record.userId);
        if (!user) return null;

        // Skip if org doesn't match
        if (orgToFilter && user.organizationId !== orgToFilter) return null;

        // Supervisors see only their reporting subtree
        if (subtreeIds && !subtreeIds.includes(record.userId)) return null;

        // Skip superadmins - they should not appear in employee attendance lists
        if (user.role === 'superadmin') return null;

        const profile = await getProfile(ctx, record.userId);
        const supervisorId = profile?.supervisorId ?? user.supervisorId;
        const supervisor = supervisorId ? await ctx.db.get(supervisorId) : null;
        const userWithAvatar = {
          ...user,
          avatarUrl: profile?.avatarUrl ?? user.avatarUrl ?? user.faceImageUrl,
          supervisorName: supervisor?.name,
        };
        return { ...record, user: userWithAvatar };
      }),
    );

    const filtered = withUsers.filter(Boolean);
    // Sort: checked_in first, then checked_out, then absent
    return filtered.sort((a, b) => {
      const order = { checked_in: 0, checked_out: 1, absent: 2 };
      return order[a!.status] - order[b!.status];
    });
  },
});

// ── Get Today's Attendance Summary ───────────────────────────────────────
export const getTodayAttendanceSummary = query({
  args: {
    /** @deprecated kept for API compatibility — the caller's own identity is used. */
    adminId: v.id('users'),
  },
  handler: async (ctx, args) => {
    void args;
    const scope = await resolveAttendanceScope(ctx);
    if (!scope) {
      return {
        totalActive: 0,
        checkedIn: 0,
        checkedOut: 0,
        late: 0,
        earlyLeave: 0,
        absent: 0,
        attendanceRate: '0',
      };
    }
    const { orgToFilter, subtreeIds } = scope;

    const today = getTodayDate();
    const records = await ctx.db
      .query('timeTracking')
      .withIndex('by_date', (q) => q.eq('date', today))
      .take(DEFAULT_LIST_CAP);

    // Scope user list by org when possible; else capped full-table read.
    const totalEmployees = orgToFilter
      ? await ctx.db
          .query('users')
          .withIndex('by_org', (q) => q.eq('organizationId', orgToFilter))
          .take(DEFAULT_LIST_CAP)
      : await ctx.db.query('users').take(XLARGE_LIST_CAP);
    // Exclude superadmins and system bot accounts from employee counts
    let activeEmployees = totalEmployees.filter(
      (u) => u.isActive && u.role !== 'superadmin' && !isSystemAccountEmail(u.email),
    );

    // Filter by org if admin
    if (orgToFilter) {
      activeEmployees = activeEmployees.filter((u) => u.organizationId === orgToFilter);
    }

    // Supervisors only count their reporting subtree
    if (subtreeIds) {
      activeEmployees = activeEmployees.filter((u) => subtreeIds.includes(u._id));
    }

    // Filter records by org if admin
    let filteredRecords = records;
    if (orgToFilter) {
      const filteredUserIds = activeEmployees.map((u) => u._id);
      filteredRecords = records.filter((r) => filteredUserIds.includes(r.userId));
    }

    const checkedIn = filteredRecords.filter((r) => r.status === 'checked_in').length;
    const checkedOut = filteredRecords.filter((r) => r.status === 'checked_out').length;
    const late = filteredRecords.filter((r) => r.isLate).length;
    const earlyLeave = filteredRecords.filter((r) => r.isEarlyLeave).length;
    const absent = activeEmployees.length - filteredRecords.length;

    return {
      totalActive: activeEmployees.length,
      checkedIn,
      checkedOut,
      late,
      earlyLeave,
      absent,
      attendanceRate:
        activeEmployees.length > 0
          ? ((filteredRecords.length / activeEmployees.length) * 100).toFixed(1)
          : '0',
    };
  },
});

// ── Get Monthly Attendance Stats for User ────────────────────────────────
export const getMonthlyStats = query({
  args: {
    userId: v.id('users'),
    month: v.string(), // "2026-02"
  },
  handler: async (ctx, args) => {
    if (!(await mayReadAttendance(ctx, args.userId))) {
      return {
        totalDays: 0,
        lateDays: 0,
        earlyLeaveDays: 0,
        totalWorkedHours: '0',
        totalOvertimeHours: '0',
        averageWorkHours: '0',
        punctualityRate: '100',
      };
    }
    const records = await ctx.db
      .query('timeTracking')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .take(DEFAULT_LIST_CAP);

    // Filter by month
    const monthRecords = records.filter((r) => r.date.startsWith(args.month));

    const totalDays = monthRecords.length;
    const lateDays = monthRecords.filter((r) => r.isLate).length;
    const earlyLeaveDays = monthRecords.filter((r) => r.isEarlyLeave).length;
    const totalWorkedMinutes = monthRecords.reduce(
      (sum, r) => sum + (r.totalWorkedMinutes || 0),
      0,
    );
    const totalOvertimeMinutes = monthRecords.reduce((sum, r) => sum + (r.overtimeMinutes || 0), 0);

    return {
      totalDays,
      lateDays,
      earlyLeaveDays,
      totalWorkedHours: (totalWorkedMinutes / 60).toFixed(1),
      totalOvertimeHours: (totalOvertimeMinutes / 60).toFixed(1),
      averageWorkHours: totalDays > 0 ? (totalWorkedMinutes / 60 / totalDays).toFixed(1) : '0',
      punctualityRate:
        totalDays > 0 ? (((totalDays - lateDays) / totalDays) * 100).toFixed(1) : '100',
    };
  },
});

// ── Admin: Get all employees with attendance for a date range ─────────────
export const getAllEmployeesAttendanceOverview = query({
  args: {
    /** @deprecated kept for API compatibility — the caller's own identity is used. */
    adminId: v.id('users'),
    month: v.string(), // "2026-02"
  },
  handler: async (ctx, args) => {
    void args.adminId;
    const scope = await resolveAttendanceScope(ctx);
    if (!scope) return [];
    const { orgToFilter, subtreeIds } = scope;

    const users = orgToFilter
      ? await ctx.db
          .query('users')
          .withIndex('by_org', (q) => q.eq('organizationId', orgToFilter))
          .take(DEFAULT_LIST_CAP)
      : await ctx.db.query('users').take(XLARGE_LIST_CAP);
    // Only include regular employees (not admins, superadmins, supervisors)
    let activeUsers = users.filter((u) => u.isActive && u.role === 'employee');

    // Filter by organization if admin
    if (orgToFilter) {
      activeUsers = activeUsers.filter((u) => u.organizationId === orgToFilter);
    }

    // Supervisors see only their reporting subtree
    if (subtreeIds) {
      activeUsers = activeUsers.filter((u) => subtreeIds.includes(u._id));
    }

    const results = await Promise.all(
      activeUsers.map(async (user) => {
        const records = await ctx.db
          .query('timeTracking')
          .withIndex('by_user', (q) => q.eq('userId', user._id))
          .take(DEFAULT_LIST_CAP);

        const monthRecords = records.filter((r) => r.date.startsWith(args.month));
        const totalDays = monthRecords.length;
        const lateDays = monthRecords.filter((r) => r.isLate).length;
        const absentDays = monthRecords.filter((r) => r.status === 'absent').length;
        const totalWorkedMinutes = monthRecords.reduce(
          (s, r) => s + (r.totalWorkedMinutes ?? 0),
          0,
        );
        const punctualityRate =
          totalDays > 0 ? (((totalDays - lateDays) / totalDays) * 100).toFixed(0) : '100';

        const profile = await getProfile(ctx, user._id);

        // Get supervisor
        const supervisorId = profile?.supervisorId ?? user.supervisorId;
        const supervisor = supervisorId ? await ctx.db.get(supervisorId) : null;

        // Last check in
        const lastRecord = records.sort((a, b) => b.checkInTime - a.checkInTime)[0];

        return {
          user: {
            _id: user._id,
            name: user.name,
            position: profile?.position ?? user.position,
            department: profile?.department ?? user.department,
            avatarUrl: profile?.avatarUrl ?? user.avatarUrl ?? user.faceImageUrl,
            supervisorId,
          },
          supervisor: supervisor ? { _id: supervisor._id, name: supervisor.name } : null,
          stats: {
            totalDays,
            lateDays,
            absentDays,
            punctualityRate,
            totalWorkedHours: (totalWorkedMinutes / 60).toFixed(1),
          },
          lastRecord: lastRecord ?? null,
        };
      }),
    );

    return results.sort((a, b) => a.user.name.localeCompare(b.user.name));
  },
});

// ── Admin: Get attendance history for one employee ────────────────────────
export const getEmployeeAttendanceHistory = query({
  args: {
    userId: v.id('users'),
    month: v.string(), // "2026-02"
  },
  handler: async (ctx, args) => {
    if (!(await mayReadAttendance(ctx, args.userId))) return [];
    const records = await ctx.db
      .query('timeTracking')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .take(DEFAULT_LIST_CAP);

    return records
      .filter((r) => r.date.startsWith(args.month))
      .sort((a, b) => b.date.localeCompare(a.date));
  },
});

// ── Admin: Mark Employee as Absent ───────────────────────────────────────
export const markAbsent = mutation({
  args: {
    userId: v.id('users'),
    date: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'attendance');
    // Marking somebody absent is always an act about another person: it needs
    // `attendance.manage`, and nobody records it against themselves.
    const userId = await assertMayRecordAttendance(ctx, args.userId, { selfAllowed: false });

    // Check if record already exists
    const existing = await ctx.db
      .query('timeTracking')
      .withIndex('by_user_date', (q) => q.eq('userId', userId).eq('date', args.date))
      .first();

    if (existing) {
      throw new Error('Record already exists for this date');
    }

    // Get schedule
    const schedule = await ctx.db
      .query('workSchedule')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .first();

    const startTime = schedule?.startTime || '09:00';
    const endTime = schedule?.endTime || '18:00';

    // Create scheduled times in Armenia timezone
    const { scheduledStart, scheduledEnd } = getScheduledTimestamps(args.date, startTime, endTime);

    // Create absent record
    const id = await ctx.db.insert('timeTracking', {
      userId,
      checkInTime: 0, // no check-in
      scheduledStartTime: scheduledStart,
      scheduledEndTime: scheduledEnd,
      isLate: false,
      isEarlyLeave: false,
      status: 'absent',
      date: args.date,
      notes: args.notes,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return id;
  },
});
