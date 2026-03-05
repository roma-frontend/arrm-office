import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL!;

async function convexQuery(name: string, args: Record<string, unknown>) {
  const res = await fetch(`${CONVEX_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: name, args }),
  });
  const data = await res.json();
  if (data.status === 'error') throw new Error(data.errorMessage ?? 'Convex error');
  return data.value;
}

export async function GET() {
  try {
    // Get session from cookie
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('hr-session-token')?.value;

    if (!sessionToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get user session
    const session = await convexQuery('auth:getSession', { sessionToken });
    
    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    // Get user data
    const userId = session.userId;
    
    // Fetch user's leave data
    const userLeaves = await convexQuery('leaves:getUserLeaves', { userId });
    const analytics = await convexQuery('analytics:getUserAnalytics', { userId });
    const teamCalendar = await convexQuery('analytics:getTeamCalendar', { requesterId: userId });

    // Build context for AI
    const context = {
      user: {
        name: session.name,
        email: session.email,
        role: session.role,
        department: session.department,
      },
      leaveBalances: {
        paid: analytics.balances.paid,
        sick: analytics.balances.sick,
        family: analytics.balances.family,
      },
      stats: {
        totalDaysTaken: analytics.totalDaysTaken,
        pendingDays: analytics.pendingDays,
      },
      recentLeaves: analytics.userLeaves.slice(0, 5).map((l: any) => ({
        type: l.type,
        startDate: l.startDate,
        endDate: l.endDate,
        status: l.status,
        days: l.days,
      })),
      teamAvailability: teamCalendar.slice(0, 10).map((l: any) => ({
        userName: l.userName,
        department: l.userDepartment,
        startDate: l.startDate,
        endDate: l.endDate,
      })),
    };

    return NextResponse.json(context);
  } catch (error) {
    console.error('Context error:', error);
    return NextResponse.json({ error: 'Failed to get context' }, { status: 500 });
  }
}
