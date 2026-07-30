interface FetchOptions {
  origin: string;
  cookieHeader: string;
  userId?: string;
  authOrgId: string;
  lastUserMessage: string;
  needsInsights: boolean;
  needsFullContext: boolean;
  needsConflictCheck: boolean;
  timeoutMs?: number;
}

interface ContextResult {
  userContext: string;
  aiInsights: string;
  fullContext: string;
  conflictCheckData: string;
  availableDriversInfo: string;
  userRole: string;
  userEmail: string;
  userName: string;
  userDepartment: string;
  userPosition: string;
  userOrgId: string;
}

interface ContextUser {
  name: string;
  role: string;
  department: string;
  position: string;
  email: string;
  organizationId: string;
}

interface ContextLeaveBalance {
  paid: number;
  sick: number;
  family: number;
  unpaid: number;
}

interface ContextStats {
  totalDaysTaken: number;
  pendingDays: number;
}

interface ContextLeaveEntry {
  type: string;
  startDate: string;
  endDate: string;
  status: string;
}

interface ContextTeamMember {
  userName: string;
  startDate: string;
  endDate: string;
}

interface ContextEmployee {
  name: string;
  department: string;
  presenceStatus: string;
  currentLeave?: ContextLeaveEntry | null;
  pendingLeaves?: ContextLeaveEntry[];
}

interface ContextCalendarEvent {
  employee: string;
  type: string;
  startDate: string;
  endDate: string;
}

interface ContextAttendanceEntry {
  name: string;
  status: string;
  checkIn?: string | null;
  isLate?: boolean;
  lateMinutes?: number;
}

interface ContextTicket {
  ticketNumber: string;
  title: string;
  status: string;
  isOverdue?: boolean;
}

interface ContextDriver {
  userName: string;
  vehicleInfo: { model: string };
}

interface ContextFullData {
  employees?: ContextEmployee[];
  calendarEvents?: ContextCalendarEvent[];
  todayAttendance?: ContextAttendanceEntry[];
  tickets?: ContextTicket[];
  availableDrivers?: ContextDriver[];
  totalEmployees?: number;
  currentlyAtWork?: number;
  onLeaveToday?: number;
  ticketStats?: { total: number };
}

interface ContextApiResponse {
  user: ContextUser;
  leaveBalances: ContextLeaveBalance;
  stats: ContextStats;
  recentLeaves?: ContextLeaveEntry[];
  teamAvailability?: ContextTeamMember[];
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function parseDateFromMessage(message: string): { day: number; month: number } | null {
  const dateMatch = message.match(
    /с (\d{1,2})[\/\.-](\d{1,2})|from (\d{1,2})[\/\.-](\d{1,2})|(\d{1,2})[\/\.-](\d{1,2})/i,
  );
  if (!dateMatch) return null;

  const dayStr = dateMatch[1] || dateMatch[3] || dateMatch[5];
  const monthStr = dateMatch[2] || dateMatch[4] || dateMatch[6];
  if (!dayStr || !monthStr) return null;

  const monthMap: Record<string, number> = {
    '1': 0,
    '2': 1,
    '3': 2,
    '4': 3,
    '5': 4,
    '6': 5,
    '7': 6,
    '8': 7,
    '9': 8,
    '10': 9,
    '11': 10,
    '12': 11,
  };

  return {
    day: parseInt(dayStr),
    month: monthMap[monthStr] ?? parseInt(monthStr) - 1,
  };
}

async function processUserContext(
  origin: string,
  authHeaders: Record<string, string>,
): Promise<{
  userContext: string;
  userRole: string;
  userEmail: string;
  userName: string;
  userDepartment: string;
  userPosition: string;
  userOrgId: string;
}> {
  const res = await fetchWithTimeout(`${origin}/api/chat/context`, { headers: authHeaders }, 5000);
  if (!res.ok) {
    return {
      userContext: '',
      userRole: 'employee',
      userEmail: '',
      userName: '',
      userDepartment: '',
      userPosition: '',
      userOrgId: '',
    };
  }

  const context = (await res.json()) as ContextApiResponse;
  return {
    userContext: `
USER: ${context.user.name} | Role: ${context.user.role} | Dept: ${context.user.department}
Leave balances: Paid=${context.leaveBalances.paid}d, Sick=${context.leaveBalances.sick}d, Family=${context.leaveBalances.family}d
Stats: Taken=${context.stats.totalDaysTaken}d, Pending=${context.stats.pendingDays}d
Recent leaves: ${
      context.recentLeaves
        ?.slice(0, 3)
        .map((l) => `${l.type} ${l.startDate}-${l.endDate} (${l.status})`)
        .join(', ') || 'none'
    }
Team on leave: ${
      context.teamAvailability
        ?.slice(0, 5)
        .map((l) => `${l.userName} (${l.startDate}-${l.endDate})`)
        .join(', ') || 'none'
    }
`.trim(),
    userRole: context.user.role,
    userEmail: context.user.email,
    userName: context.user.name,
    userDepartment: context.user.department,
    userPosition: context.user.position,
    userOrgId: context.user.organizationId,
  };
}

interface AIInsightsResponse {
  balanceWarning?: string;
  patterns?: string[];
  bestDates?: string[];
  teamConflicts?: string[];
}

async function processAIInsights(
  origin: string,
  authHeaders: Record<string, string>,
  userId: string,
  needsInsights: boolean,
): Promise<string> {
  if (!needsInsights || !userId) return '';

  try {
    const res = await fetchWithTimeout(
      `${origin}/api/chat/insights?userId=${userId}`,
      { headers: authHeaders },
      4000,
    );
    if (!res.ok) return '';

    const insights = (await res.json()) as AIInsightsResponse | undefined;
    if (!insights) return '';

    return [
      insights.balanceWarning && `⚠️ ${insights.balanceWarning}`,
      insights.patterns?.length && `Patterns: ${insights.patterns.slice(0, 3).join(', ')}`,
      insights.bestDates?.length && `Best dates: ${insights.bestDates.slice(0, 3).join(', ')}`,
      insights.teamConflicts?.length &&
        `Conflicts: ${insights.teamConflicts.slice(0, 3).join(', ')}`,
    ]
      .filter(Boolean)
      .join('\n');
  } catch {
    return '';
  }
}

interface ConflictCheckResponse {
  hasConflicts?: boolean;
  conflictCount?: number;
  aiMessage?: string;
}

async function processConflictCheck(
  origin: string,
  authHeaders: Record<string, string>,
  userId: string,
  authOrgId: string,
  lastUserMessage: string,
  needsConflictCheck: boolean,
): Promise<string> {
  if (!needsConflictCheck || !userId) return '';

  const dateInfo = parseDateFromMessage(lastUserMessage);
  if (!dateInfo) return '';

  const year = new Date().getFullYear();
  const startDate = new Date(year, dateInfo.month, dateInfo.day).getTime();
  const endDate = new Date(year, dateInfo.month, dateInfo.day + 7).getTime();
  const requestType = /водитель|driver/i.test(lastUserMessage) ? 'driver' : 'leave';

  try {
    const res = await fetchWithTimeout(
      `${origin}/api/chat/conflict-check?userId=${userId}&organizationId=${encodeURIComponent(authOrgId)}&requestType=${requestType}&startDate=${startDate}&endDate=${endDate}`,
      { headers: authHeaders },
      4000,
    );
    if (!res.ok) return '';

    const conflictData = (await res.json()) as ConflictCheckResponse;
    if (conflictData.hasConflicts) {
      return `⚠️ CONFLICTS: ${conflictData.conflictCount} found. ${conflictData.aiMessage || ''}`;
    }
    return '✅ No conflicts detected';
  } catch {
    return '';
  }
}

async function processFullContext(
  origin: string,
  authHeaders: Record<string, string>,
  needsFullContext: boolean,
  userOrgId: string,
): Promise<{ fullContext: string; availableDriversInfo: string }> {
  if (!needsFullContext) {
    return { fullContext: '', availableDriversInfo: '' };
  }

  try {
    const res = await fetchWithTimeout(
      `${origin}/api/chat/full-context?requesterId=`,
      { headers: authHeaders },
      6000,
    );
    if (!res.ok) return { fullContext: '', availableDriversInfo: '' };

    const data = (await res.json()) as ContextFullData;

    const employeesSummary = (data.employees ?? [])
      .slice(0, 15)
      .map((e) => {
        const status =
          e.presenceStatus === 'available'
            ? '🟢'
            : e.presenceStatus === 'in_meeting'
              ? '📅'
              : e.presenceStatus === 'in_call'
                ? '📞'
                : e.presenceStatus === 'out_of_office'
                  ? '🏠'
                  : '⛔';
        const leaveInfo = e.currentLeave
          ? ` | ON LEAVE: ${e.currentLeave.type} (${e.currentLeave.startDate}-${e.currentLeave.endDate})`
          : '';
        const pendingInfo = e.pendingLeaves?.length ? ` | Pending: ${e.pendingLeaves.length}` : '';
        return `${status} ${e.name} (${e.department})${leaveInfo}${pendingInfo}`;
      })
      .join('\n');

    const calendarSummary = (data.calendarEvents ?? [])
      .slice(0, 10)
      .map((ev) => `📅 ${ev.employee}: ${ev.type} ${ev.startDate}-${ev.endDate}`)
      .join('\n');

    const attendanceSummary = (data.todayAttendance ?? [])
      .slice(0, 10)
      .map(
        (t) =>
          `${t.status === 'checked_in' ? '🟢' : '🔴'} ${t.name}: ${t.checkIn || '—'}${t.isLate ? ` (LATE ${t.lateMinutes}min)` : ''}`,
      )
      .join('\n');

    const ticketsSummary = (data.tickets ?? [])
      .slice(0, 5)
      .map((t) => `🎫 ${t.ticketNumber}: ${t.title} [${t.status}] ${t.isOverdue ? '⚠️' : ''}`)
      .join('\n');

    const driversSummary = (data.availableDrivers ?? [])
      .slice(0, 5)
      .map((d) => `🚘 ${d.userName}: ${d.vehicleInfo?.model || 'No vehicle'} [Available]`)
      .join('\n');

    const fullContext = `
Company: ${data.totalEmployees ?? 0} employees, ${data.currentlyAtWork ?? 0} at work, ${data.onLeaveToday ?? 0} on leave

Employees:
${employeesSummary || 'No data'}

Calendar:
${calendarSummary || 'No upcoming leaves'}

Attendance:
${attendanceSummary || 'No data'}

Tickets (${data.ticketStats?.total || 0} total):
${ticketsSummary || 'No tickets'}

Drivers:
${driversSummary || 'No drivers'}
`.trim();

    let availableDriversInfo = '';
    if (!data.availableDrivers?.length && userOrgId) {
      try {
        const driversRes = await fetchWithTimeout(
          `${origin}/api/drivers/available?organizationId=${userOrgId}`,
          { headers: authHeaders },
          3000,
        );
        if (driversRes.ok) {
          const drivers = (await driversRes.json()) as ContextDriver[];
          if (drivers?.length) {
            availableDriversInfo = `Available drivers: ${drivers.map((d) => `${d.userName} (${d.vehicleInfo.model})`).join(', ')}`;
          }
        }
      } catch {
        /* ignore */
      }
    }

    return { fullContext, availableDriversInfo };
  } catch {
    return { fullContext: '', availableDriversInfo: '' };
  }
}

export async function fetchAllContexts(options: FetchOptions): Promise<ContextResult> {
  const {
    origin,
    cookieHeader,
    userId,
    authOrgId,
    lastUserMessage,
    needsInsights,
    needsFullContext,
    needsConflictCheck,
  } = options;

  const authHeaders = { cookie: cookieHeader };

  const [contextData, insightsData, conflictData, fullData] = await Promise.allSettled([
    processUserContext(origin, authHeaders),
    processAIInsights(origin, authHeaders, userId || '', needsInsights),
    processConflictCheck(
      origin,
      authHeaders,
      userId || '',
      authOrgId,
      lastUserMessage,
      needsConflictCheck,
    ),
    processFullContext(origin, authHeaders, needsFullContext, ''),
  ]);

  return {
    userContext: contextData.status === 'fulfilled' ? contextData.value.userContext : '',
    aiInsights: insightsData.status === 'fulfilled' ? insightsData.value : '',
    fullContext: fullData.status === 'fulfilled' ? fullData.value.fullContext : '',
    conflictCheckData: conflictData.status === 'fulfilled' ? conflictData.value : '',
    availableDriversInfo:
      fullData.status === 'fulfilled' ? fullData.value.availableDriversInfo : '',
    userRole: contextData.status === 'fulfilled' ? contextData.value.userRole : 'employee',
    userEmail: contextData.status === 'fulfilled' ? contextData.value.userEmail : '',
    userName: contextData.status === 'fulfilled' ? contextData.value.userName : '',
    userDepartment: contextData.status === 'fulfilled' ? contextData.value.userDepartment : '',
    userPosition: contextData.status === 'fulfilled' ? contextData.value.userPosition : '',
    userOrgId: contextData.status === 'fulfilled' ? contextData.value.userOrgId : '',
  };
}
