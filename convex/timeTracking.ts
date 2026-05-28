import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { Id } from './_generated/dataModel';
import { isSuperadmin } from './lib/auth';
import { DEFAULT_LIST_CAP, XLARGE_LIST_CAP } from './lib/limits';
import { getProfile } from './lib/userProfile';
import { withAuth } from './lib/withAuth';

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
    userId: v.id('users'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const now = Date.now();
    const today = getTodayDate();

    // Check if already checked in today
    const existing = await ctx.db
      .query('timeTracking')
      .withIndex('by_user_date', (q) => q.eq('userId', args.userId).eq('date', today))
      .first();

    if (existing && existing.status === 'checked_in') {
      throw new Error('Already checked in today');
    }

    // Get work schedule (default 9:00-18:00)
    const schedule = await ctx.db
      .query('workSchedule')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
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
        userId: args.userId,
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

    // Award attendance points (+1)
    const user = (await ctx.db.get(args.userId)) as any;
    if (user?.organizationId) {
      const orgId = user.organizationId;
      const todayObj = new Date();
      todayObj.setHours(0, 0, 0, 0);
      const todayStart = todayObj.getTime();
      const existingPointsToday = await ctx.db
        .query('pointTransactions')
        .withIndex('by_org_user_created', (q) =>
          q.eq('organizationId', orgId).eq('userId', args.userId).gte('createdAt', todayStart),
        )
        .filter((q: any) => q.eq(q.field('type'), 'earned_attendance'))
        .first();

      if (!existingPointsToday) {
        const userPointsRecord = await ctx.db
          .query('userPoints')
          .withIndex('by_org_user', (q) => q.eq('organizationId', orgId).eq('userId', args.userId))
          .first();

        if (userPointsRecord) {
          await ctx.db.patch(userPointsRecord._id, {
            balance: userPointsRecord.balance + 1,
            totalEarned: userPointsRecord.totalEarned + 1,
            updatedAt: now,
          });
        } else {
          await ctx.db.insert('userPoints', {
            organizationId: orgId,
            userId: args.userId,
            balance: 1,
            totalEarned: 1,
            totalSpent: 0,
            updatedAt: now,
          });
        }

        await ctx.db.insert('pointTransactions', {
          organizationId: orgId,
          userId: args.userId,
          amount: 1,
          type: 'earned_attendance',
          description: 'Daily attendance',
          createdAt: now,
        });
      }
    }

    return recordId;
  }),
});

// ── Check Out (Employee leaves work) ─────────────────────────────────────
export const checkOut = mutation({
  args: {
    userId: v.id('users'),
    notes: v.optional(v.string()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const now = Date.now();
    const today = getTodayDate();

    // Find today's check-in record
    const record = await ctx.db
      .query('timeTracking')
      .withIndex('by_user_date', (q) => q.eq('userId', args.userId).eq('date', today))
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
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .first();
    const endTime = scheduleForOut?.endTime || '18:00';
    const startTime = scheduleForOut?.startTime || '09:00';
    const { scheduledStart: freshStart, scheduledEnd: freshEnd } = getScheduledTimestamps(
      today,
      startTime,
      endTime,
    );

    // Patch the record with correct scheduled times (fixes old stale values)
    await ctx.db.patch(record._id, {
      scheduledStartTime: freshStart,
      scheduledEndTime: freshEnd,
    });

    // Calculate worked time
    const totalWorkedMinutes = Math.floor((now - record.checkInTime) / 1000 / 60);

    // Calculate if early leave (compare against fresh correct scheduledEnd)
    const isEarlyLeave = now < freshEnd;
    const earlyLeaveMinutes = isEarlyLeave ? Math.floor((freshEnd - now) / 1000 / 60) : 0;

    // Calculate overtime
    const overtimeMinutes = now > freshEnd ? Math.floor((now - freshEnd) / 1000 / 60) : 0;

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

    return record._id;
  }),
});

// ── Get Today's Status ───────────────────────────────────────────────────
export const getTodayStatus = query({
  args: {
    userId: v.id('users'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const today = getTodayDate();

    const record = await ctx.db
      .query('timeTracking')
      .withIndex('by_user_date', (q) => q.eq('userId', args.userId).eq('date', today))
      .first();

    return record || null;
  }),
});

// ── Get User's Time Tracking History ─────────────────────────────────────
export const getUserHistory = query({
  args: {
    userId: v.id('users'),
    limit: v.optional(v.number()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const records = await ctx.db
      .query('timeTracking')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .order('desc')
      .take(args.limit || 30);

    return records;
  }),
});

// ── Get All Employees Currently At Work ──────────────────────────────────
export const getCurrentlyAtWork = query({
  args: {
    adminId: v.id('users'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const admin = (await ctx.db.get(args.adminId)) as any;
    if (!admin || (admin.role !== 'admin' && admin.role !== 'supervisor' && !isSuperadmin(admin))) {
      throw new Error('Only admins/supervisors can view attendance');
    }

    const today = getTodayDate();
    const records = await ctx.db
      .query('timeTracking')
      .withIndex('by_date', (q) => q.eq('date', today))
      .take(DEFAULT_LIST_CAP);

    const atWork = records.filter((r: any) => r.status === 'checked_in');

    // Filter by organization if admin (not superadmin)
    const callerIsSuperadmin = isSuperadmin(admin);
    const orgToFilter = callerIsSuperadmin ? null : admin.organizationId;

    const withUsers = await Promise.all(
      atWork.map(async (record) => {
        const user = (await ctx.db.get(record.userId)) as any;
        if (!user) return null;

        // Skip if org doesn't match
        if (orgToFilter && user.organizationId !== orgToFilter) return null;

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
  }),
});

// ── Get Recent Attendance for a user (last N days) ───────────────────────
export const getRecentAttendance = query({
  args: { userId: v.id('users'), limit: v.optional(v.number()) },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const limit = args.limit ?? 7;
    const records = await ctx.db
      .query('timeTracking')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .order('desc')
      .take(limit);
    return records;
  }),
});

// ── Get Today's Full Attendance (all who checked in/out) ─────────────────
export const getTodayAllAttendance = query({
  args: {
    adminId: v.id('users'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const admin = (await ctx.db.get(args.adminId)) as any;
    if (!admin || (admin.role !== 'admin' && admin.role !== 'supervisor' && !isSuperadmin(admin))) {
      throw new Error('Only admins/supervisors can view attendance');
    }

    const today = getTodayDate();
    const records = await ctx.db
      .query('timeTracking')
      .withIndex('by_date', (q) => q.eq('date', today))
      .take(DEFAULT_LIST_CAP);

    // Filter by organization if admin (not superadmin)
    const callerIsSuperadmin = isSuperadmin(admin);
    const orgToFilter = callerIsSuperadmin ? null : admin.organizationId;

    const withUsers = await Promise.all(
      records.map(async (record) => {
        const user = (await ctx.db.get(record.userId)) as any;
        if (!user) return null;

        // Skip if org doesn't match
        if (orgToFilter && user.organizationId !== orgToFilter) return null;

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

    const filtered = withUsers.filter(Boolean);
    // Sort: checked_in first, then checked_out, then absent
    return filtered.sort((a, b) => {
      const order = { checked_in: 0, checked_out: 1, absent: 2 };
      return order[a!.status] - order[b!.status];
    });
  }),
});

// ── Get Today's Attendance Summary ───────────────────────────────────────
export const getTodayAttendanceSummary = query({
  args: {
    adminId: v.id('users'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const admin = (await ctx.db.get(args.adminId)) as any;
    if (!admin || (admin.role !== 'admin' && admin.role !== 'supervisor' && !isSuperadmin(admin))) {
      throw new Error('Only admins/supervisors can view attendance');
    }

    const today = getTodayDate();
    const records = await ctx.db
      .query('timeTracking')
      .withIndex('by_date', (q) => q.eq('date', today))
      .take(DEFAULT_LIST_CAP);

    // Filter by organization if admin (not superadmin)
    const callerIsSuperadmin = isSuperadmin(admin);
    const orgToFilter = callerIsSuperadmin ? null : admin.organizationId;

    // Scope user list by org when possible; else capped full-table read.
    const totalEmployees = orgToFilter
      ? await ctx.db
          .query('users')
          .withIndex('by_org', (q) => q.eq('organizationId', orgToFilter))
          .take(DEFAULT_LIST_CAP)
      : await ctx.db.query('users').take(XLARGE_LIST_CAP);
    // Exclude superadmins from employee counts
    let activeEmployees = totalEmployees.filter((u: any) => u.isActive && u.role !== 'superadmin');

    // Filter by org if admin
    if (orgToFilter) {
      activeEmployees = activeEmployees.filter((u: any) => u.organizationId === orgToFilter);
    }

    // Filter records by org if admin
    let filteredRecords = records;
    if (orgToFilter) {
      const filteredUserIds = activeEmployees.map((u: any) => u._id);
      filteredRecords = records.filter((r: any) => filteredUserIds.includes(r.userId));
    }

    const checkedIn = filteredRecords.filter((r: any) => r.status === 'checked_in').length;
    const checkedOut = filteredRecords.filter((r: any) => r.status === 'checked_out').length;
    const late = filteredRecords.filter((r: any) => r.isLate).length;
    const earlyLeave = filteredRecords.filter((r: any) => r.isEarlyLeave).length;
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
  }),
});

// ── Get Monthly Attendance Stats for User ────────────────────────────────
export const getMonthlyStats = query({
  args: {
    userId: v.id('users'),
    month: v.string(), // "2026-02"
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const records = await ctx.db
      .query('timeTracking')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .take(DEFAULT_LIST_CAP);

    // Filter by month
    const monthRecords = records.filter((r: any) => r.date.startsWith(args.month));

    const totalDays = monthRecords.length;
    const lateDays = monthRecords.filter((r: any) => r.isLate).length;
    const earlyLeaveDays = monthRecords.filter((r: any) => r.isEarlyLeave).length;
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
  }),
});

// ── Admin: Get all employees with attendance for a date range ─────────────
export const getAllEmployeesAttendanceOverview = query({
  args: {
    adminId: v.id('users'),
    month: v.string(), // "2026-02"
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const admin = (await ctx.db.get(args.adminId)) as any;
    if (!admin || (admin.role !== 'admin' && admin.role !== 'supervisor' && !isSuperadmin(admin))) {
      throw new Error('Only admins/supervisors can view attendance');
    }

    const callerIsSuperadmin = isSuperadmin(admin);
    const orgToFilter = callerIsSuperadmin ? null : admin.organizationId;

    const users = orgToFilter
      ? await ctx.db
          .query('users')
          .withIndex('by_org', (q) => q.eq('organizationId', orgToFilter))
          .take(DEFAULT_LIST_CAP)
      : await ctx.db.query('users').take(XLARGE_LIST_CAP);
    // Only include regular employees (not admins, superadmins, supervisors)
    let activeUsers = users.filter((u: any) => u.isActive && u.role === 'employee');

    // Filter by organization if admin
    if (orgToFilter) {
      activeUsers = activeUsers.filter((u: any) => u.organizationId === orgToFilter);
    }

    const results = await Promise.all(
      activeUsers.map(async (user) => {
        const records = await ctx.db
          .query('timeTracking')
          .withIndex('by_user', (q) => q.eq('userId', user._id))
          .take(DEFAULT_LIST_CAP);

        const monthRecords = records.filter((r: any) => r.date.startsWith(args.month));
        const totalDays = monthRecords.length;
        const lateDays = monthRecords.filter((r: any) => r.isLate).length;
        const absentDays = monthRecords.filter((r: any) => r.status === 'absent').length;
        const totalWorkedMinutes = monthRecords.reduce(
          (s, r) => s + (r.totalWorkedMinutes ?? 0),
          0,
        );
        const punctualityRate =
          totalDays > 0 ? (((totalDays - lateDays) / totalDays) * 100).toFixed(0) : '100';

        const profile = await getProfile(ctx, user._id);

        // Get supervisor
        const supervisorId = profile?.supervisorId ?? user.supervisorId;
        const supervisor = supervisorId ? ((await ctx.db.get(supervisorId)) as any) : null;

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
  }),
});

// ── Admin: Get attendance history for one employee ────────────────────────
export const getEmployeeAttendanceHistory = query({
  args: {
    userId: v.id('users'),
    month: v.string(), // "2026-02"
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const records = await ctx.db
      .query('timeTracking')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .take(DEFAULT_LIST_CAP);

    return records
      .filter((r: any) => r.date.startsWith(args.month))
      .sort((a, b) => b.date.localeCompare(a.date));
  }),
});

// ── Admin: Mark Employee as Absent ───────────────────────────────────────
export const markAbsent = mutation({
  args: {
    userId: v.id('users'),
    date: v.string(),
    notes: v.optional(v.string()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    // Check if record already exists
    const existing = await ctx.db
      .query('timeTracking')
      .withIndex('by_user_date', (q) => q.eq('userId', args.userId).eq('date', args.date))
      .first();

    if (existing) {
      throw new Error('Record already exists for this date');
    }

    // Get schedule
    const schedule = await ctx.db
      .query('workSchedule')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .first();

    const startTime = schedule?.startTime || '09:00';
    const endTime = schedule?.endTime || '18:00';

    // Create scheduled times in Armenia timezone
    const { scheduledStart, scheduledEnd } = getScheduledTimestamps(args.date, startTime, endTime);

    // Create absent record
    const id = await ctx.db.insert('timeTracking', {
      userId: args.userId,
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
  }),
});
