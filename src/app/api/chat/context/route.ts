import { NextRequest, NextResponse } from 'next/server';
import { fetchQuery } from 'convex/nextjs';
import { api } from '@/convex/_generated/api';
import { signConvexJWT, type JWTPayload } from '@/lib/jwt';

const _CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL!;

// Opt out of static generation — uses cookies
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const sessionToken = req.cookies.get('hr-session-token')?.value;

    if (!sessionToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get user session using Convex
    const session = await fetchQuery(api.auth.getSession, { sessionToken });

    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    // Get user data
    const userId = session.userId;
    if (!userId || userId === '') {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 401 });
    }

    // Fetch user's leave data
    const convexToken = await signConvexJWT({
      userId: String(userId),
      name: session.name,
      email: session.email,
      role: session.role as JWTPayload['role'],
      organizationId: session.organizationId,
    });
    const _userLeaves = await fetchQuery(api.leaves.getUserLeaves, { userId });
    const analytics = await fetchQuery(api.analytics.getUserAnalytics, { userId });
    const teamCalendar = await fetchQuery(
      api.analytics.getTeamCalendar,
      {},
      { token: convexToken },
    );

    // Build context for AI
    const context = {
      user: {
        id: userId,
        name: session.name,
        email: session.email,
        role: session.role,
        department: session.department,
        organizationId: session.organizationId,
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
      recentLeaves:
        analytics.userLeaves?.slice(0, 5).map((l) => ({
          type: l.type,
          startDate: l.startDate,
          endDate: l.endDate,
          status: l.status,
          days: l.days,
        })) || [],
      teamAvailability:
        teamCalendar?.slice(0, 10).map((l) => ({
          userName: l.userName,
          department: l.userDepartment,
          startDate: l.startDate,
          endDate: l.endDate,
        })) || [],
    };

    return NextResponse.json(context);
  } catch (error) {
    console.error('Context error:', error);
    return NextResponse.json({ error: 'Failed to get context' }, { status: 500 });
  }
}
