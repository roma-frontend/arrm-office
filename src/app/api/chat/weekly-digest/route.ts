import { NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../../convex/_generated/api';
import { groq } from '@ai-sdk/groq';
import { generateText } from 'ai';

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// GET /api/chat/weekly-digest?adminId=xxx
// Returns AI-generated weekly digest for admin
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const adminId = searchParams.get('adminId');
    if (!adminId) return NextResponse.json({ error: 'adminId required' }, { status: 400 });

    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6); // Sunday
    const weekStartStr = weekStart.toISOString().split('T')[0];
    const weekEndStr = weekEnd.toISOString().split('T')[0];

    // Fetch all data in parallel
    const [allLeaves, allUsers, attendanceSummary] = await Promise.all([
      convex.query(api.leaves.getAllLeaves, { requesterId: adminId as any }),
      convex.query(api.users.getAllUsers, { requesterId: adminId as any }),
      convex.query(api.timeTracking.getTodayAttendanceSummary, { adminId: adminId as any }),
    ]);

    const activeEmployees = allUsers.filter((u: any) => u.isActive && u.role === 'employee');
    const pendingLeaves = allLeaves.filter((l: any) => l.status === 'pending');

    // Who is on leave this week
    const onLeaveThisWeek = allLeaves.filter((l: any) =>
      l.status === 'approved' &&
      l.startDate <= weekEndStr &&
      l.endDate >= weekStartStr
    );

    // Late arrivals this week (from time tracking)
    const monthStr = today.toISOString().slice(0, 7);
    const lateThisMonth: any[] = [];
    for (const emp of activeEmployees.slice(0, 20)) {
      try {
        const history = await convex.query(api.timeTracking.getUserHistory, { userId: emp._id, limit: 30 });
        const lateCount = history.filter((r: any) => {
          return r.isLate && r.date >= weekStartStr && r.date <= weekEndStr;
        }).length;
        if (lateCount > 0) {
          lateThisMonth.push({ name: emp.name, lateCount });
        }
      } catch { /* skip */ }
    }

    // Build context for AI
    const context = `
Today: ${today.toLocaleDateString('en', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
Week: ${weekStartStr} to ${weekEndStr}

TEAM SIZE: ${activeEmployees.length} active employees

ON LEAVE THIS WEEK (${onLeaveThisWeek.length}):
${onLeaveThisWeek.slice(0, 10).map((l: any) => `- ${l.userName}: ${l.type} leave (${l.startDate} → ${l.endDate})`).join('\n') || 'None'}

PENDING APPROVAL (${pendingLeaves.length}):
${pendingLeaves.slice(0, 5).map((l: any) => `- ${l.userName}: ${l.days} day(s) ${l.type} leave (${l.startDate} → ${l.endDate})`).join('\n') || 'None'}

LATE ARRIVALS THIS WEEK:
${lateThisMonth.length > 0 ? lateThisMonth.map((e) => `- ${e.name}: ${e.lateCount} late arrival(s)`).join('\n') : 'None recorded'}

TODAY'S ATTENDANCE:
- At work: ${attendanceSummary.checkedIn}
- Checked out: ${attendanceSummary.checkedOut}
- Absent: ${attendanceSummary.absent}
- Late today: ${attendanceSummary.late}
- Attendance rate: ${attendanceSummary.attendanceRate}%
`;

    const { text } = await generateText({
      model: groq('llama-3.3-70b-versatile'),
      prompt: `You are an HR AI assistant. Generate a concise, professional weekly HR digest for the admin.
Use emojis to make it visually organized. Format it nicely with sections.
Keep it under 400 words. Include:
1. 📋 Quick Summary
2. 🏖 Who's on Leave This Week  
3. ⏳ Pending Approvals (urgent if any)
4. ⚠️ Attendance Alerts
5. 💡 AI Recommendation (one smart insight)

Data:
${context}`,
    });

    return NextResponse.json({
      digest: text,
      generatedAt: new Date().toISOString(),
      stats: {
        onLeave: onLeaveThisWeek.length,
        pending: pendingLeaves.length,
        lateToday: attendanceSummary.late,
        attendanceRate: attendanceSummary.attendanceRate,
      },
    });
  } catch (error) {
    console.error('Weekly digest error:', error);
    return NextResponse.json({ error: 'Failed to generate digest' }, { status: 500 });
  }
}
