import { action } from './_generated/server';
import { api } from './_generated/api';
import { v } from 'convex/values';

// Isolate API references at module level to avoid deep type instantiation in handler
const usersApi = api.users;
const leavesApi = api.leaves;

const GROQ_API_KEY = process.env.GROQ_API_KEY;

export const sendChatMessage = action({
  args: {
    messages: v.array(
      v.object({
        role: v.union(v.literal('user'), v.literal('assistant')),
        content: v.string(),
      }),
    ),
    lang: v.string(),
    userId: v.optional(v.string()),
    userRole: v.optional(v.string()),
    userName: v.optional(v.string()),
    userEmail: v.optional(v.string()),
  },
  handler: async (ctx, { messages, lang, userId, userRole, userName, userEmail }) => {
    if (!GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY not configured');
    }

    const isAdmin = userRole === 'admin' || userRole === 'supervisor';
    const _isEmployee = !isAdmin;

    // ── Fetch real data from Convex DB ──────────────────────────────────
    let userDataContext = '';
    let teamDataContext = '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let userProfile: any = null;

    try {
      if (userEmail) {
        // Get user profile via email (safe string lookup)
        userProfile = await ctx.runQuery(usersApi.queries.getUserByEmail, { email: userEmail });
        const resolvedUserId = userProfile?._id;

        // Get user's own leaves
        const userLeaves = resolvedUserId
          ? await ctx.runQuery(leavesApi.getUserLeaves, { userId: resolvedUserId })
          : [];
        const myLeaves = Array.isArray(userLeaves) ? userLeaves : [];

        const today = new Date().toISOString().split('T')[0] || '';
        const approved = myLeaves.filter((l) => l.status === 'approved');
        const pending = myLeaves.filter((l) => l.status === 'pending');
        const totalDaysUsed = approved.reduce((s, l) => s + (l.days ?? 0), 0);

        // Calendar: current + upcoming approved leaves
        const currentLeave = approved.find((l) => l.startDate <= today && l.endDate >= today);
        const upcomingLeaves = approved
          .filter((l) => l.startDate > today)
          .sort((a, b) => a.startDate.localeCompare(b.startDate));
        const pastLeaves = approved
          .filter((l) => l.endDate < today)
          .sort((a, b) => b.startDate.localeCompare(a.startDate));

        userDataContext = `
=== YOUR PROFILE ===
Name: ${userProfile?.name ?? userName}
Role: ${userProfile?.role ?? userRole}
Department: ${userProfile?.department ?? 'N/A'}
Position: ${userProfile?.position ?? 'N/A'}
User ID: ${userProfile?._id ?? userId}
Today's date: ${today}
Paid Leave Balance: ${userProfile?.leaveBalance?.paid ?? userProfile?.paidLeaveBalance ?? 20} days
Sick Leave Balance: ${userProfile?.leaveBalance?.sick ?? userProfile?.sickLeaveBalance ?? 10} days
Family Leave Balance: ${userProfile?.leaveBalance?.family ?? userProfile?.familyLeaveBalance ?? 5} days

=== YOUR PERSONAL CALENDAR / SCHEDULE ===
${
  currentLeave
    ? `🏖 CURRENTLY ON LEAVE: ${currentLeave.type} leave from ${currentLeave.startDate} to ${currentLeave.endDate} (${currentLeave.days} days) — "${currentLeave.reason ?? ''}"`
    : `✅ You are NOT currently on leave. Today (${today}) is a working day.`
}

UPCOMING APPROVED LEAVES (${upcomingLeaves.length}):
${
  upcomingLeaves
    .slice(0, 10)
    .map(
      (l) =>
        `  📅 ${l.type} leave: ${l.startDate} → ${l.endDate} (${l.days} days)${l.reason ? ` — "${l.reason}"` : ''}`,
    )
    .join('\n') || '  No upcoming approved leaves.'
}

PENDING REQUESTS (${pending.length}):
${
  pending
    .slice(0, 5)
    .map(
      (l) =>
        `  ⏳ ${l.type} leave: ${l.startDate} → ${l.endDate} (${l.days} days) — waiting for approval`,
    )
    .join('\n') || '  No pending requests.'
}

PAST LEAVES (last 5):
${
  pastLeaves
    .slice(0, 5)
    .map((l) => `  ✔ ${l.type} leave: ${l.startDate} → ${l.endDate} (${l.days} days)`)
    .join('\n') || '  No past leaves.'
}

=== YOUR LEAVE STATISTICS ===
Total Requests: ${myLeaves.length}
Approved: ${approved.length} (${totalDaysUsed} days used)
Pending: ${pending.length}
Rejected: ${myLeaves.filter((l) => l.status === 'rejected').length}

=== ALL YOUR LEAVES (with IDs for edit/delete actions) ===
${
  myLeaves
    .slice(0, 15)
    .map(
      (l) =>
        `- ID:${l._id} | ${l.type} | ${l.startDate}→${l.endDate} (${l.days}d) | ${l.status}${l.reason ? ` | "${l.reason}"` : ''}`,
    )
    .join('\n') || 'No leave requests yet.'
}`;
      }

      // All users get team calendar (who else is on leave)
      const _requesterId = userProfile?._id ?? userId;
      const organizationId = userProfile?.organizationId;
      // Identity is derived from auth on the server; pass org only as a fallback scope
      const allLeaves = organizationId
        ? await ctx.runQuery(leavesApi.getAllLeaves, { organizationId })
        : await ctx.runQuery(leavesApi.getAllLeaves, {});
      const allUsers = await ctx.runQuery(usersApi.queries.getAllUsers, {});

      const leavesArr = Array.isArray(allLeaves) ? allLeaves : [];
      const usersArr = Array.isArray(allUsers) ? allUsers : [];

      const todayStr = new Date().toISOString().split('T')[0] || '';
      const in90Days =
        new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] || '';
      const onLeaveToday = leavesArr.filter(
        (l) => l.status === 'approved' && l.startDate <= todayStr && l.endDate >= todayStr,
      );
      const upcomingTeamLeaves = leavesArr
        .filter((l) => l.status === 'approved' && l.startDate > todayStr && l.startDate <= in90Days)
        .sort((a, b) => a.startDate.localeCompare(b.startDate));

      teamDataContext = `
=== TEAM CALENDAR (Who's on leave) ===
ON LEAVE TODAY (${onLeaveToday.length}):
${
  onLeaveToday
    .slice(0, 15)
    .map((l) => {
      const u = usersArr.find((usr) => usr._id === l.userId);
      return `  🏖 ${l.userName ?? u?.name ?? 'Unknown'} (${u?.department ?? ''}) — ${l.type} leave until ${l.endDate}`;
    })
    .join('\n') || '  No one is on leave today.'
}

UPCOMING TEAM LEAVES (next 90 days — ${upcomingTeamLeaves.length}):
${
  upcomingTeamLeaves
    .slice(0, 20)
    .map((l) => {
      const u = usersArr.find((usr) => usr._id === l.userId);
      return `  📅 ${l.userName ?? u?.name ?? 'Unknown'} (${u?.department ?? ''}) — ${l.type} leave ${l.startDate} → ${l.endDate} (${l.days}d)`;
    })
    .join('\n') || '  No upcoming leaves.'
}
`;
    } catch (err) {
      console.error('Error fetching user/team data:', err);
      userDataContext = 'Error loading user data.';
      teamDataContext = 'Error loading team data.';
    }

    // ── System Prompt ────────────────────────────────────────────────────
    const systemPrompt =
      lang === 'ru'
        ? `Ты — профессиональный HR-ассистент с доступом к реальным данным компании. Отвечай на русском языке естественно и дружелюбно.

${userDataContext}

${teamDataContext}

=== ТВОИ ВОЗМОЖНОСТИ (ACTIONS) ===
Ты можешь выполнять следующие действия, используя тег <ACTION>...</ACTION>:

1. CREATE_LEAVE — создать отпускной запрос
<ACTION>{"type":"create_leave","params":{"userId":"<id>","userName":"<name>","type":"paid|sick|family|doctor|unpaid","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","days":<number>,"reason":"<reason>"}}</ACTION>

2. APPROVE_LEAVE — одобрить отпуск (только для админов/супервайзеров)
<ACTION>{"type":"approve_leave","params":{"leaveId":"<id>","comment":"<optional comment>"}}</ACTION>

3. REJECT_LEAVE — отклонить отпуск (только для админов/супервайзеров)
<ACTION>{"type":"reject_leave","params":{"leaveId":"<id>","comment":"<reason>"}}</ACTION>

4. UPDATE_LEAVE — обновить существующий отпускной запрос
<ACTION>{"type":"update_leave","params":{"leaveId":"<id>","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","days":<number>,"reason":"<reason>"}}</ACTION>

5. DELETE_LEAVE — удалить отпускной запрос
<ACTION>{"type":"delete_leave","params":{"leaveId":"<id>"}}</ACTION>

6. SHOW_CALENDAR — показать визуальный календарь отпусков (автоматически генерируется)
<CALENDAR>{"title":"Мои отпуска","current":{...},"upcoming":[...],"pending":[...],"balances":{...},"teamOnLeaveToday":[...]}</CALENDAR>

ПРАВИЛА:
- Используй ACTION только когда пользователь явно просит выполнить действие
- Всегда подтверждай детали перед созданием ACTION
- Для CALENDAR используй реальные данные из контекста выше
- Отвечай кратко и по делу
- Используй эмодзи умеренно`
        : `You are a professional HR assistant with access to real company data. Respond naturally and helpfully in English.

${userDataContext}

${teamDataContext}

=== YOUR CAPABILITIES (ACTIONS) ===
You can perform the following actions using <ACTION>...</ACTION> tags:

1. CREATE_LEAVE — create a leave request
<ACTION>{"type":"create_leave","params":{"userId":"<id>","userName":"<name>","type":"paid|sick|family|doctor|unpaid","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","days":<number>,"reason":"<reason>"}}</ACTION>

2. APPROVE_LEAVE — approve leave (admins/supervisors only)
<ACTION>{"type":"approve_leave","params":{"leaveId":"<id>","comment":"<optional comment>"}}</ACTION>

3. REJECT_LEAVE — reject leave (admins/supervisors only)
<ACTION>{"type":"reject_leave","params":{"leaveId":"<id>","comment":"<reason>"}}</ACTION>

4. UPDATE_LEAVE — update an existing leave request
<ACTION>{"type":"update_leave","params":{"leaveId":"<id>","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","days":<number>,"reason":"<reason>"}}</ACTION>

5. DELETE_LEAVE — delete a leave request
<ACTION>{"type":"delete_leave","params":{"leaveId":"<id>"}}</ACTION>

6. SHOW_CALENDAR — show visual leave calendar (auto-generated)
<CALENDAR>{"title":"My Leaves","current":{...},"upcoming":[...],"pending":[...],"balances":{...},"teamOnLeaveToday":[...]}</CALENDAR>

RULES:
- Only use ACTION when user explicitly requests an action
- Always confirm details before creating ACTION
- For CALENDAR use real data from context above
- Be concise and helpful
- Use emojis moderately`;

    // ── Call GROQ API ────────────────────────────────────────────────────
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
          temperature: 0.7,
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GROQ API error: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "Sorry, I couldn't process that.";

      return { content };
    } catch (error: any) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      console.error('GROQ API error:', error);
      throw new Error(`Failed to get AI response: ${error.message}`);
    }
  },
});
