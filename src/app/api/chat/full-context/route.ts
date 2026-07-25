import { NextRequest, NextResponse } from 'next/server';
import { fetchQuery } from 'convex/nextjs';
import { api } from '../../../../../convex/_generated/api';
import { jwtVerify } from 'jose';
import { signConvexJWT, type JWTPayload } from '@/lib/jwt';
import type { Doc, Id } from '../../../../../convex/_generated/dataModel';

// Opt out of static generation — uses request.url
export const revalidate = 0;

type UserDoc = Doc<'users'> & {
  leaveBalance?: {
    paid: number;
    sick: number;
    family: number;
    unpaid: number;
  };
};
type LeaveDoc = Doc<'leaveRequests'> & {
  userName: string;
  userEmail: string;
  userDepartment: string;
  userEmployeeType: string;
  userAvatarUrl: string | undefined;
  reviewerName: string | undefined;
};
type AttendanceDoc = Doc<'timeTracking'> & {
  user: UserDoc & { avatarUrl: string | undefined };
};
type TaskDoc = Doc<'tasks'> & {
  assignedToUser: (UserDoc & { avatarUrl: string | undefined }) | null;
  assignedByUser: (UserDoc & { avatarUrl: string | undefined }) | null;
  comments: unknown[];
  commentCount: number;
};
type TicketDoc = Doc<'supportTickets'> & {
  creatorName: string;
  creatorEmail: string;
  creatorAvatar: string | undefined;
  assigneeName: string | null;
  assigneeAvatar: string | undefined;
  organizationName: string | null;
  commentCount: number;
  isOverdue: boolean;
  createdByUserId?: string;
};
type AutomationDoc = Doc<'automationWorkflows'>;
type SurveyDoc = Doc<'surveys'> & {
  creator: { name: string; avatarUrl: string | undefined } | null;
};
type EventDoc = {
  _id: string;
  _creationTime: number;
  name: string;
  description?: string;
  startDate: number | string;
  endDate: number | string;
  eventType: string;
  priority?: string;
  createdBy?: string;
  creatorName?: string;
  organizationId?: string;
  requiredDepartments?: string[];
};
type DriverDoc = Doc<'drivers'> & {
  userName: string;
  userAvatar: string | undefined;
  userPosition: string | undefined;
  vehicle?: string;
  status?: string;
};
type DriverRequestDoc = Doc<'driverRequests'> & {
  requesterName: string | undefined;
  requesterAvatar: string | undefined;
  requesterPosition: string | undefined;
  requesterPhone: string | undefined;
  pickupLocation?: string;
  dropoffLocation?: string;
  requesterId?: string;
  scheduledDate?: string;
  scheduledFor?: string;
};

interface AuthPayload {
  userId: string;
  role: string;
  email: string;
}

async function verifyAuth(req: NextRequest): Promise<AuthPayload | null> {
  try {
    const token = req.cookies.get('hr-auth-token') || req.cookies.get('oauth-session');
    if (!token) return null;

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) return null;

    const secret = new TextEncoder().encode(jwtSecret);
    const { payload } = await jwtVerify(token.value, secret);
    const userId = (payload.sub as string) || '';
    // Reject empty userId — Convex v.id('users') requires a valid ID
    if (!userId) return null;
    return {
      userId,
      role: (payload.role as string) || 'employee',
      email: (payload.email as string) || '',
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    // SECURITY: Require authentication
    const auth = await verifyAuth(req);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userId: requesterId, role: userRole } = auth;
    const isAdmin = userRole === 'admin' || userRole === 'superadmin';
    const isSupervisor = userRole === 'supervisor';

    // Forward a Convex auth token derived from the verified session identity
    const convexToken = await signConvexJWT({
      userId: requesterId,
      name: '',
      email: auth.email,
      role: userRole as JWTPayload['role'],
    });
    const convexAuth = { token: convexToken };

    // Fetch core system data first (needed to get orgId)
    const [users, leaves, todayAttendance, allTasks, allTickets, automationWorkflows] =
      await Promise.all([
        fetchQuery(api.users.queries.getAllUsers, {}, convexAuth),
        fetchQuery(api.leaves.getAllLeaves, {}, convexAuth),
        fetchQuery(api.timeTracking.getTodayAllAttendance, {
          adminId: requesterId as Id<'users'>,
        }),
        fetchQuery(api.tasks.getAllTasks, {}, convexAuth),
        fetchQuery(api.tickets.getAllTickets, {
          status: undefined,
          priority: undefined,
          organizationId: undefined,
          assignedTo: undefined,
          limit: undefined,
          cursor: undefined,
        }),
        fetchQuery(api.automation.getActiveWorkflows, {}),
      ]);

    const typedUsers = users as UserDoc[];
    const typedLeaves = leaves as LeaveDoc[];
    const typedAttendance = todayAttendance as AttendanceDoc[];
    const typedTasks = allTasks as TaskDoc[];
    const typedTickets = allTickets as TicketDoc[];
    const typedAutomation = automationWorkflows as AutomationDoc[];

    // Get organizationId from users list (first user with orgId)
    const firstUserWithOrg = typedUsers?.find((u) => u.organizationId);
    const orgId = firstUserWithOrg?.organizationId;

    // Fetch all surveys (no status filter to see all)
    let allSurveys: SurveyDoc[] = [];
    if (orgId) {
      try {
        allSurveys = await fetchQuery(api.surveys.listSurveys, {
          organizationId: orgId,
          limit: 20,
        });
      } catch {
        // Surveys fetch failed, continue without them
      }
    }

    // Fetch events if we have an organization
    let allEvents: EventDoc[] = [];
    if (orgId) {
      try {
        allEvents = await fetchQuery(api.events.getCompanyEvents, {
          organizationId: orgId,
        });
      } catch {
        // Events fetch failed, continue without them
      }
    }

    // Fetch driver data if we have organization
    let driverRequests: DriverRequestDoc[] = [];
    let availableDrivers: DriverDoc[] = [];
    if (orgId) {
      try {
        const driversResult = await fetchQuery(api.drivers.queries.getFilteredDrivers, {
          organizationId: orgId,
        });
        const typedDrivers = (driversResult ?? []) as DriverDoc[];
        if (typedDrivers.length > 0 && typedDrivers[0]) {
          const requestsResult = await fetchQuery(api.drivers.requests_queries.getDriverRequests, {
            driverId: typedDrivers[0]._id,
          });
          driverRequests = (requestsResult ?? []) as DriverRequestDoc[];
        }
        const availableResult = await fetchQuery(api.drivers.queries.getAvailableDrivers, {
          organizationId: orgId,
        });
        availableDrivers = (availableResult ?? []) as DriverDoc[];
      } catch {
        // Driver data fetch failed, continue without it
      }
    }

    // SECURITY: Filter employee data based on requester role
    // Non-admin users can only see their own data + limited team info
    const filteredUsers = typedUsers.filter((u) => u.role !== 'superadmin');

    const employeeData = filteredUsers.map((u) => {
      const isSelf = u._id === requesterId;
      const userLeaves = typedLeaves.filter((l) => l.userId === u._id);
      const todayRecord = typedAttendance.find((t) => t.userId === u._id);

      const approvedLeaves = userLeaves.filter((l) => l.status === 'approved');
      const pendingLeaves = userLeaves.filter((l) => l.status === 'pending');

      // Current/upcoming leaves
      const now = new Date().toISOString().split('T')[0] || '';
      const activeLeave = approvedLeaves.find((l) => l.startDate <= now && l.endDate >= now);
      const upcomingLeaves = approvedLeaves
        .filter((l) => l.startDate > now)
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
        .slice(0, 3);

      // SECURITY: For non-admin users, only return full data for themselves
      if (!isAdmin && !isSupervisor && !isSelf) {
        return {
          id: u._id,
          name: u.name,
          department: u.department,
          position: u.position,
          role: u.role,
          presenceStatus: u.presenceStatus ?? 'available',
          // Limited info only — no email, phone, leave details
          currentLeave: activeLeave
            ? {
                type: activeLeave.type,
                startDate: activeLeave.startDate,
                endDate: activeLeave.endDate,
              }
            : null,
          todayStatus: todayRecord ? { status: todayRecord.status } : null,
        };
      }

      return {
        id: u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        department: u.department,
        position: u.position,
        employeeType: u.employeeType,
        // Today's attendance
        todayStatus: todayRecord
          ? {
              status: todayRecord.status,
              checkIn: todayRecord.checkInTime
                ? new Date(todayRecord.checkInTime).toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : null,
              checkOut: todayRecord.checkOutTime
                ? new Date(todayRecord.checkOutTime).toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : null,
              isLate: todayRecord.isLate,
              lateMinutes: todayRecord.lateMinutes,
              workedHours: todayRecord.totalWorkedMinutes
                ? (todayRecord.totalWorkedMinutes / 60).toFixed(1)
                : null,
            }
          : null,
        // Leave balances
        leaveBalance: u.leaveBalance ?? {
          paid: u.paidLeaveBalance ?? 20,
          sick: u.sickLeaveBalance ?? 10,
          family: u.familyLeaveBalance ?? 5,
          unpaid: 30,
        },
        // Currently on leave — include real leaveId for edit/delete!
        currentLeave: activeLeave
          ? {
              leaveId: activeLeave._id,
              type: activeLeave.type,
              startDate: activeLeave.startDate,
              endDate: activeLeave.endDate,
              reason: activeLeave.reason,
              status: activeLeave.status,
            }
          : null,
        // Upcoming leaves — include real leaveId!
        upcomingLeaves: upcomingLeaves.map((l) => ({
          leaveId: l._id,
          type: l.type,
          startDate: l.startDate,
          endDate: l.endDate,
          days: l.days,
          status: l.status,
        })),
        // Pending requests — include real leaveId!
        pendingLeaves: pendingLeaves.map((l) => ({
          leaveId: l._id,
          type: l.type,
          startDate: l.startDate,
          endDate: l.endDate,
          days: l.days,
          status: l.status,
        })),
        // ALL leaves for this employee (for edit/delete)
        allLeaves: userLeaves.map((l) => ({
          leaveId: l._id,
          type: l.type,
          startDate: l.startDate,
          endDate: l.endDate,
          days: l.days,
          status: l.status,
          reason: l.reason,
        })),
        // Leave history summary
        totalLeavesTaken: approvedLeaves.reduce((sum, l) => sum + (l.days ?? 0), 0),
        // Supervisor
        supervisorName: u.supervisorId
          ? (typedUsers.find((s) => s._id === u.supervisorId)?.name ?? null)
          : null,
        // Presence status
        presenceStatus: u.presenceStatus ?? 'available',
        // Tasks
        tasks: typedTasks
          .filter((t) => t.assignedTo === u._id)
          .map((t) => ({
            taskId: t._id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            deadline: t.deadline ? new Date(t.deadline).toISOString().split('T')[0] : null,
            assignedBy: typedUsers.find((s) => s._id === t.assignedBy)?.name ?? 'Unknown',
          })),
      };
    });

    // Calendar events — all approved leaves next 90 days
    const nowStr = new Date().toISOString().split('T')[0] || '';
    const in90Days =
      new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] || '';
    const calendarEvents = typedLeaves
      .filter((l) => l.status === 'approved' && l.endDate >= nowStr && l.startDate <= in90Days)
      .map((l) => {
        const user = typedUsers.find((u) => u._id === l.userId);
        return {
          employee: user?.name ?? 'Unknown',
          department: user?.department ?? '',
          type: l.type,
          startDate: l.startDate,
          endDate: l.endDate,
          days: l.days,
        };
      })
      .sort((a, b) => a.startDate.localeCompare(b.startDate));

    // Today's attendance summary
    const presentToday = typedAttendance.map((t) => {
      const user = typedUsers.find((u) => u._id === t.userId);
      return {
        name: user?.name ?? 'Unknown',
        department: user?.department ?? '',
        status: t.status,
        checkIn: t.checkInTime
          ? new Date(t.checkInTime).toLocaleTimeString('en-GB', {
              hour: '2-digit',
              minute: '2-digit',
            })
          : null,
        checkOut: t.checkOutTime
          ? new Date(t.checkOutTime).toLocaleTimeString('en-GB', {
              hour: '2-digit',
              minute: '2-digit',
            })
          : null,
        isLate: t.isLate,
        lateMinutes: t.lateMinutes,
      };
    });

    return NextResponse.json({
      employees: employeeData,
      calendarEvents,
      todayAttendance: presentToday,
      totalEmployees: filteredUsers.length,
      currentlyAtWork: presentToday.filter((t) => t.status === 'checked_in').length,
      onLeaveToday: employeeData.filter((e) => e.currentLeave).length,
      // Tickets - filter based on role
      tickets: (() => {
        let filtered = typedTickets;
        if (!isAdmin && !isSupervisor) {
          filtered = typedTickets.filter(
            (t) => t.createdByUserId === requesterId || t.assignedTo === requesterId,
          );
        }
        return filtered.map((t) => ({
          ticketId: t._id,
          ticketNumber: t.ticketNumber,
          title: t.title,
          description: t.description,
          status: t.status,
          priority: t.priority,
          category: t.category,
          createdBy: t.creatorName ?? 'Unknown',
          assignedTo: t.assigneeName,
          createdAt: t.createdAt,
          isOverdue: t.isOverdue,
        }));
      })(),
      ticketStats: {
        total: typedTickets.length,
        open: typedTickets.filter((t) => t.status === 'open').length,
        inProgress: typedTickets.filter((t) => t.status === 'in_progress').length,
        resolved: typedTickets.filter((t) => t.status === 'resolved').length,
        closed: typedTickets.filter((t) => t.status === 'closed').length,
        critical: typedTickets.filter((t) => t.priority === 'critical' && t.status !== 'closed')
          .length,
      },
      // Events
      companyEvents: allEvents.map((e) => ({
        eventId: e._id,
        name: e.name,
        description: e.description ?? '',
        startDate:
          typeof e.startDate === 'number'
            ? new Date(e.startDate).toISOString().split('T')[0]
            : e.startDate,
        endDate:
          typeof e.endDate === 'number'
            ? new Date(e.endDate).toISOString().split('T')[0]
            : e.endDate,
        eventType: e.eventType,
        priority: e.priority ?? '',
        createdBy: e.creatorName ?? e.createdBy ?? '',
        requiredDepartments: e.requiredDepartments,
      })),
      // Automation
      automationWorkflows: typedAutomation.map((w) => ({
        workflowId: w._id,
        name: w.name,
        description: w.description,
        isActive: w.isActive,
        createdAt: w.createdAt,
      })),
      // Drivers
      driverRequests: driverRequests.map((r) => ({
        requestId: r._id,
        status: r.status,
        pickupLocation: r.pickupLocation ?? '',
        dropoffLocation: r.dropoffLocation ?? '',
        requestedBy: r.requesterId ?? '',
        scheduledFor: r.scheduledDate ?? r.scheduledFor ?? '',
      })),
      availableDrivers: availableDrivers.map((d) => ({
        driverId: d._id,
        name: d.userName,
        vehicle: d.vehicle ?? '',
        status: d.status ?? 'Available',
      })),
      // All Surveys
      surveys: allSurveys.map((s) => ({
        surveyId: s._id,
        title: s.title,
        description: s.description,
        status: s.status,
        isAnonymous: s.isAnonymous,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        createdBy: s.creator?.name || 'Unknown',
        responseCount: s.responseCount || 0,
      })),
      // Goals & OKR - disabled
      goals: [],
      myGoals: [],
      // Recognition & Kudos - disabled
      kudosFeed: [],
      leaderboard: [],
      // Corporate Policies - disabled
      corporateDocs: [],
      // Performance Reviews - disabled
      performanceReviews: [],
      // Unread counts - disabled
      unreadMessages: 0,
      unreadConversations: [],
      unreadNotifications: 0,
      unreadLeaveApprovals: 0,
    });
  } catch (error) {
    console.error('Full context error:', error);
    return NextResponse.json({
      employees: [],
      myProfile: null,
      error: 'Failed to fetch full context',
    });
  }
}
