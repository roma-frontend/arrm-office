import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';
import { cookies } from 'next/headers';
import { getServerTranslation } from '@/lib/i18n/server-translation';
import { getServerConvexAuth } from '@/lib/server-convex-auth';

// Opt out of static generation — uses request.url
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const locale = cookieStore.get('i18nextLng')?.value || 'en';
    const { t } = await getServerTranslation('common', locale);

    const auth = await getServerConvexAuth();
    if (!auth) return NextResponse.json(null);

    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    convex.setAuth(auth.token);

    const userId = req.nextUrl.searchParams.get('userId');
    if (!userId) return NextResponse.json(null);

    const [user, userLeaves, allLeaves, timeHistory] = await Promise.all([
      convex.query(api.users.queries.getUserById, { userId: userId as Id<'users'> }),
      convex.query(api.leaves.getUserLeaves, { userId: userId as Id<'users'> }),
      convex.query(api.leaves.getAllLeaves, {}),
      convex.query(api.timeTracking.getUserHistory, { userId: userId as Id<'users'>, limit: 60 }),
    ]);

    if (!user) return NextResponse.json(null);

    const today = new Date();
    const endOfYear = new Date(today.getFullYear(), 11, 31);
    const daysToEndOfYear = Math.ceil(
      (endOfYear.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );

    // ── 1. Balance Warning ────────────────────────────────────────────────
    let balanceWarning = '';
    const paidBalance = user.paidLeaveBalance ?? 0;
    const sickBalance = user.sickLeaveBalance ?? 0;

    if (paidBalance > 0 && paidBalance <= 5 && daysToEndOfYear <= 90) {
      balanceWarning = `You only have ${paidBalance} paid leave days left and they expire on Dec 31! Consider booking them soon.`;
    } else if (paidBalance > 10 && daysToEndOfYear <= 60) {
      balanceWarning = `You have ${paidBalance} unused paid leave days that expire Dec 31 (${daysToEndOfYear} days away). Book your vacation soon!`;
    } else if (paidBalance === 0) {
      balanceWarning = `Your paid leave balance is 0. You can still request unpaid leave or sick leave (${sickBalance} days remaining).`;
    }

    // ── 2. Attendance Patterns ────────────────────────────────────────────
    const patterns: string[] = [];

    if (timeHistory && timeHistory.length > 0) {
      // Count late arrivals
      const lateRecords = timeHistory.filter((r) => r.isLate);
      if (lateRecords.length >= 3) {
        // Check if late on specific days
        const dayNames = [
          'Sunday',
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
        ];
        const lateDayCounts: Record<number, number> = {};
        lateRecords.forEach((r) => {
          const day = new Date(r.checkInTime).getDay();
          lateDayCounts[day] = (lateDayCounts[day] || 0) + 1;
        });
        const mostLateDay = Object.entries(lateDayCounts).sort((a, b) => b[1] - a[1])[0];
        if (mostLateDay && Number(mostLateDay[1]) >= 2) {
          patterns.push(
            `Frequent late arrivals on ${dayNames[Number(mostLateDay[0])]}s (${mostLateDay[1]} times recently)`,
          );
        } else {
          patterns.push(`${lateRecords.length} late arrivals in the past 2 months`);
        }
      }

      // Check early leave pattern
      const earlyLeaves = timeHistory.filter((r) => r.isEarlyLeave);
      if (earlyLeaves.length >= 3) {
        patterns.push(`${earlyLeaves.length} early departures recorded recently`);
      }
    }

    // Check sick leave pattern
    const sickLeaves = userLeaves.filter((l) => l.type === 'sick');
    if (sickLeaves.length >= 3) {
      // Check if sick leaves cluster around specific days
      const sickDayCounts: Record<number, number> = {};
      sickLeaves.forEach((l) => {
        const day = new Date(l.startDate).getDay();
        sickDayCounts[day] = (sickDayCounts[day] || 0) + 1;
      });
      const dayNames = [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ];
      const mostSickDay = Object.entries(sickDayCounts).sort((a, b) => b[1] - a[1])[0];
      if (mostSickDay && Number(mostSickDay[1]) >= 2) {
        patterns.push(
          `Sick leaves often start on ${dayNames[Number(mostSickDay[0])]}s — consider scheduling preventive check-ups`,
        );
      }
    }

    // ── 3. Team Conflicts (next 60 days) ─────────────────────────────────
    const teamConflicts: string[] = [];
    const next60Days = new Date(today);
    next60Days.setDate(next60Days.getDate() + 60);
    const todayStr = today.toISOString().split('T')[0] || '';
    const next60Str = next60Days.toISOString().split('T')[0] || '';

    const upcomingTeamLeaves = allLeaves.filter((l) => {
      return (
        l.userId !== userId &&
        l.status === 'approved' &&
        l.endDate >= todayStr &&
        l.startDate <= next60Str
      );
    });

    // Group by date range
    upcomingTeamLeaves.slice(0, 5).forEach((l) => {
      teamConflicts.push(
        `${l.userName} (${l.userDepartment || 'Unknown dept'}) is on ${l.type} leave: ${l.startDate} → ${l.endDate}`,
      );
    });

    // ── 4. Best Dates (find weeks with no team conflicts) ─────────────────
    const bestDates: string[] = [];
    const checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() + 7); // Start from next week

    let foundGoodWeeks = 0;
    for (let i = 0; i < 90 && foundGoodWeeks < 4; i++) {
      const dateStr = checkDate.toISOString().split('T')[0] || '';
      const dayOfWeek = checkDate.getDay();

      // Only suggest Monday starts
      if (dayOfWeek === 1) {
        const weekEnd = new Date(checkDate);
        weekEnd.setDate(weekEnd.getDate() + 4); // Friday
        const weekEndStr = weekEnd.toISOString().split('T')[0] || '';

        // Check if anyone from team is on leave that week
        const conflict = upcomingTeamLeaves.some((l) => {
          return l.startDate <= weekEndStr && l.endDate >= dateStr;
        });

        if (!conflict) {
          const localeMap: Record<string, string> = { en: 'en', ru: 'ru', hy: 'hy', de: 'de' };
          const month = checkDate.toLocaleString(localeMap[locale] || 'en', { month: 'long' });
          const day = checkDate.getDate();
          const endDay = weekEnd.getDate();
          bestDates.push(
            `${month} ${day}–${endDay} (${t('aiRecommendations.fullWeekNoConflicts')})`,
          );
          foundGoodWeeks++;
        }
      }

      checkDate.setDate(checkDate.getDate() + 1);
    }

    return NextResponse.json({
      balanceWarning: balanceWarning || null,
      patterns: patterns.length > 0 ? patterns : null,
      teamConflicts: teamConflicts.length > 0 ? teamConflicts : null,
      bestDates: bestDates.length > 0 ? bestDates : null,
    });
  } catch (error) {
    console.error('Insights error:', error);
    return NextResponse.json(null);
  }
}
