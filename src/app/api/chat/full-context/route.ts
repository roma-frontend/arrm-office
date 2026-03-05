import { NextResponse } from 'next/server';
import { fetchQuery } from 'convex/nextjs';
import { api } from '../../../../../convex/_generated/api';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const requesterId = searchParams.get('requesterId');
    if (!requesterId) return NextResponse.json({ error: 'requesterId required' }, { status: 400 });

    // Fetch ALL system data in parallel
    const [users, leaves, todayAttendance, allTasks] = await Promise.all([
      fetchQuery(api.users.getAllUsers, { requesterId: requesterId as any }),
      fetchQuery(api.leaves.getAllLeaves, { requesterId: requesterId as any }),
      fetchQuery(api.timeTracking.getTodayAllAttendance, { adminId: requesterId as any }),
      fetchQuery(api.tasks.getAllTasks, { requesterId: requesterId as any }),
    ]);

    // Build rich employee map with leave info
    const employeeData = (users as any[]).map((u: any) => {
      const userLeaves = (leaves as any[]).filter((l: any) => l.userId === u._id);
      const todayRecord = (todayAttendance as any[]).find((t: any) => t.userId === u._id);

      const approvedLeaves = userLeaves.filter((l: any) => l.status === 'approved');
      const pendingLeaves = userLeaves.filter((l: any) => l.status === 'pending');

      // Current/upcoming leaves
      const now = new Date().toISOString().split('T')[0];
      const activeLeave = approvedLeaves.find((l: any) => l.startDate <= now && l.endDate >= now);
      const upcomingLeaves = approvedLeaves
        .filter((l: any) => l.startDate > now)
        .sort((a: any, b: any) => a.startDate.localeCompare(b.startDate))
        .slice(0, 3);

      return {
        id: u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        department: u.department,
        position: u.position,
        employeeType: u.employeeType,
        // Today's attendance
        todayStatus: todayRecord ? {
          status: todayRecord.status,
          checkIn: todayRecord.checkInTime ? new Date(todayRecord.checkInTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null,
          checkOut: todayRecord.checkOutTime ? new Date(todayRecord.checkOutTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null,
          isLate: todayRecord.isLate,
          lateMinutes: todayRecord.lateMinutes,
          workedHours: todayRecord.totalWorkedMinutes ? (todayRecord.totalWorkedMinutes / 60).toFixed(1) : null,
        } : null,
        // Leave balances
        leaveBalance: u.leaveBalance ?? { paid: 20, sick: 10, family: 5, unpaid: 30 },
        // Currently on leave — include real leaveId for edit/delete!
        currentLeave: activeLeave ? {
          leaveId: activeLeave._id,
          type: activeLeave.type,
          startDate: activeLeave.startDate,
          endDate: activeLeave.endDate,
          reason: activeLeave.reason,
          status: activeLeave.status,
        } : null,
        // Upcoming leaves — include real leaveId!
        upcomingLeaves: upcomingLeaves.map((l: any) => ({
          leaveId: l._id,
          type: l.type,
          startDate: l.startDate,
          endDate: l.endDate,
          days: l.days,
          status: l.status,
        })),
        // Pending requests — include real leaveId!
        pendingLeaves: pendingLeaves.map((l: any) => ({
          leaveId: l._id,
          type: l.type,
          startDate: l.startDate,
          endDate: l.endDate,
          days: l.days,
          status: l.status,
        })),
        // ALL leaves for this employee (for edit/delete)
        allLeaves: userLeaves.map((l: any) => ({
          leaveId: l._id,
          type: l.type,
          startDate: l.startDate,
          endDate: l.endDate,
          days: l.days,
          status: l.status,
          reason: l.reason,
        })),
        // Leave history summary
        totalLeavesTaken: approvedLeaves.reduce((sum: number, l: any) => sum + (l.days ?? 0), 0),
        // Supervisor
        supervisorName: u.supervisorId ? (users as any[]).find((s: any) => s._id === u.supervisorId)?.name ?? null : null,
        // Presence status
        presenceStatus: u.presenceStatus ?? 'available',
        // Tasks
        tasks: (allTasks as any[])
          .filter((t: any) => t.assignedTo === u._id)
          .map((t: any) => ({
            taskId: t._id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            deadline: t.deadline ? new Date(t.deadline).toISOString().split('T')[0] : null,
            assignedBy: (users as any[]).find((s: any) => s._id === t.assignedBy)?.name ?? 'Unknown',
          })),
      };
    });

    // Calendar events — all approved leaves next 90 days
    const now = new Date().toISOString().split('T')[0];
    const in90Days = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const calendarEvents = (leaves as any[])
      .filter((l: any) => l.status === 'approved' && l.endDate >= now && l.startDate <= in90Days)
      .map((l: any) => {
        const user = (users as any[]).find((u: any) => u._id === l.userId);
        return {
          employee: user?.name ?? 'Unknown',
          department: user?.department ?? '',
          type: l.type,
          startDate: l.startDate,
          endDate: l.endDate,
          days: l.days,
        };
      })
      .sort((a: any, b: any) => a.startDate.localeCompare(b.startDate));

    // Today's attendance summary
    const presentToday = (todayAttendance as any[]).map((t: any) => {
      const user = (users as any[]).find((u: any) => u._id === t.userId);
      return {
        name: user?.name ?? 'Unknown',
        department: user?.department ?? '',
        status: t.status,
        checkIn: t.checkInTime ? new Date(t.checkInTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null,
        checkOut: t.checkOutTime ? new Date(t.checkOutTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null,
        isLate: t.isLate,
        lateMinutes: t.lateMinutes,
      };
    });

    return NextResponse.json({
      employees: employeeData,
      calendarEvents,
      todayAttendance: presentToday,
      totalEmployees: users.length,
      currentlyAtWork: presentToday.filter((t: any) => t.status === 'checked_in').length,
      onLeaveToday: employeeData.filter((e: any) => e.currentLeave).length,
    });
  } catch (error) {
    console.error('Full context error:', error);
    return NextResponse.json({ employees: [], calendarEvents: [], todayAttendance: [] });
  }
}
