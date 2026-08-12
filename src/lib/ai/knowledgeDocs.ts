/**
 * Authoritative HR-platform knowledge corpus for the assistant RAG.
 *
 * Each doc carries role metadata: retrieval is filtered by the caller's role,
 * so an employee never sees admin-only knowledge (billing, security ops…) and
 * a supervisor never sees superadmin-only knowledge. Bodies are intentionally
 * compact — they are injected into the system prompt verbatim.
 */

import type { UserRole } from '@/lib/aiAssistant';

export interface KnowledgeDoc {
  id: string;
  title: string;
  /** Roles allowed to retrieve this doc. */
  roles: UserRole[];
  /** Multilingual aliases (ru/en/hy + technical terms) folded into matching. */
  keywords: string;
  body: string;
}

/**
 * Every non-privileged role. `driver` is a self-service role like `employee`,
 * so it belongs here — leaving it out meant a driver retrieved zero documents
 * and the assistant answered them with no product knowledge at all.
 */
const ALL: UserRole[] = ['employee', 'driver', 'supervisor', 'admin', 'superadmin'];
const SUP_PLUS: UserRole[] = ['supervisor', 'admin', 'superadmin'];
const ADM_PLUS: UserRole[] = ['admin', 'superadmin'];
const SUP_ADM: UserRole[] = ['superadmin'];

export const KNOWLEDGE_DOCS: KnowledgeDoc[] = [
  {
    id: 'roles-permissions',
    title: 'Roles & permissions',
    roles: ALL,
    keywords:
      'роль role роли roles права rights права доступа permissions доступ access rbac разрешения кто может who can нет доступа не вижу не видно скрыт hidden запрещено forbidden недоступно superadmin суперадмин админ admin administrator supervisor супервайзер руководитель manager employee сотрудник работник driver водитель уровень level scope область видимости иерархия hierarchy подчинение подчиняется кому подчиняется линия подчинения reporting line глава организации руководитель организации директор ceo владелец head оргструктура org chart должность position դեր իրավունքներ',
    body: `The platform has exactly five roles: superadmin, admin, supervisor, employee, driver. A user has one role, stored on their user record and carried in the auth token. Self-signup can only produce employee or supervisor; admin, superadmin and driver are assigned by an existing admin/superadmin. Changing a role takes effect on the user's next request.

## Role matrix — матрица ролей, сравнение прав

| Role | Scope of data | Can change | Hidden from them |
| --- | --- | --- | --- |
| 🟢 employee | Own records only | Own leaves, tasks, profile, presence | Payroll, analytics, reports, talent, admin console |
| 🔵 driver | Own records + trips assigned to them | Same as employee, plus accept/decline/complete trips | Same as employee |
| 🟡 supervisor | Their own reports, at any depth | Approve/reject leave of their reports, assign tasks, team goals | Admin console, org settings, superadmin pages, people outside their subtree |
| 🟠 admin | Whole organization | Employees, org settings, holidays, leave balances, integrations, compliance | Other organizations, billing, platform ops |
| 🔴 superadmin | All organizations | Everything above plus orgs, plans, backups, security centre, impersonation | Nothing |

A role is a permission tier, not a rank and not a job title. Driver is employee + trip duty, at the same level as employee, not a step above it. Two people with the same role can still be senior to one another — that is the reporting line, not the role.

## Reporting line & head of the organization — линия подчинения, руководитель, CEO

Who you answer to is stored separately from what you may do: every person has one manager (\`supervisorId\`), and each organization declares its head (the CEO/owner) explicitly. The head is the root of the org chart and the last step of every approval chain; they must not report to anyone, and they are a normal employee otherwise — they hold a position, file attendance, accrue leave and are paid.
Because the line is separate from the role, an admin can report to another admin: in a company with three admins, the CEO is one of them and the other two report to him. Seniority is never read from the role.
People with no manager who are not the head are "not placed in the hierarchy": they show as separate roots on the org chart and the chart page lists them so someone can assign a manager. The chart is built from the line and labelled by position — never by role. Moving a person in the chart *is* changing their manager: the chart is configured through the reporting line, so the two can never disagree.
Performance ratings follow the same shape: a manager rates their own reports at any depth, HR/admins rate anyone in the organization, nobody rates themselves, and the head of the organization is rated by nobody — so the CEO rates HR, and HR rates everyone except the CEO.
Set the head and see the unplaced list on \`/org-chart\` (admin only).

## Employee — сотрудник, сотрудника, работник

Sections: \`/dashboard\`, \`/leaves\`, \`/attendance\`, \`/calendar\`, \`/tasks\`, \`/chat\`, \`/rooms\`, \`/documents\`, \`/learning\`, \`/recognition\`, \`/goals\`, \`/performance\`, \`/signatures\`, \`/surveys\`, \`/news\`, \`/events\`, \`/org-chart\`, \`/employees\` (directory), \`/profile\`, \`/settings\`, \`/help\`.
Can: submit leave requests, request cancellation of their own leave (the request goes to HR for approval — they cannot cancel it themselves), check in/out, update own tasks, book a meeting room, request a corporate driver, sign documents sent to them, enrol in courses, answer surveys, update own profile and presence.
Cannot: approve any leave (including their own), see other people's balances, salary or attendance detail, open payroll/analytics/reports, or reach any admin page. The employee directory shows colleagues but not their private data.

## Driver — водитель, водителя

Everything an employee can do, plus \`/drivers\` as their duty console: incoming trip requests (pickup, destination, purpose, time), accept/decline, the day's assigned trips, own availability status, and marking a trip completed so the requester can rate it. Approved leave automatically makes a driver unavailable for those dates.
Cannot: see other drivers' trip histories, other employees' personal data, or anything managerial.

## Supervisor — супервайзер, супервайзера, руководитель, руководителя, начальник

Everything an employee can do, plus their team: \`/team\`, \`/approvals\` for pending team leave requests, \`/analytics\` and \`/reports\`, \`/projects\`, \`/assets\`, \`/strategy\`, the talent group (\`/recruitment\`, \`/onboarding\`, \`/offboarding\`) and the finance group (\`/payroll\`, \`/compensation\`, \`/expenses\`).
Can: approve or reject leave for their own reports — anyone below them in the reporting line, at any depth — with a comment the requester sees; assign tasks, set team goals, read team attendance patterns and coverage conflicts, correct attendance, rate performance and set salary for their own reports.
Cannot: approve leave for someone who does not report to them, review their own request, rate themselves, set their own salary, touch the salary, attendance or rating of anyone outside their subtree, change organization settings, edit leave-type balances or holidays, manage users, or open the admin/superadmin consoles.

## Admin — админ, админа, администратор, администратора организации

Everything a supervisor can do, for the whole organization, plus the admin console: \`/admin\`, \`/admin/holidays\`, \`/admin/leave-settings\`, \`/admin/leave-balances\`, \`/admin/integrations\`, \`/admin/events\`, \`/admin/ai-governance\`, \`/join-requests\`, \`/org-requests\`, \`/compliance\`.
Can: create, edit and deactivate employees, assign roles and departments, set the head of the organization and everyone's manager, configure leave types/balances/accrual and the holiday calendar, approve join requests, set up integrations, publish news and broadcasts, review compliance and AI-governance logs, approve leave for anyone in the organization, and rate anyone's performance — HR authority is org-wide and does not depend on the reporting line.
Cannot: approve their own request, approve a request they filed on someone else's behalf, review the head of the organization's leave (it is auto-approved instead), rate the head of the organization or themselves, set their own salary, see or touch another organization, change subscription plans or billing, run platform backups, impersonate users, or use the AI site editor.

## Superadmin — суперадмин, суперадмина, владелец платформы

Everything an admin can do, across every organization, plus platform operations: \`/superadmin/organizations\`, \`/superadmin/users\`, \`/superadmin/create-org\`, \`/superadmin/subscriptions\`, \`/superadmin/stripe-dashboard\`, \`/superadmin/backups\`, \`/superadmin/security\`, \`/superadmin/support\`, \`/superadmin/automation\`, \`/superadmin/emergency\`, \`/superadmin/impersonate\`, \`/superadmin/access-tokens\`, \`/superadmin/bulk-actions\`, and \`/ai-site-editor\`.
Can: create/freeze/delete organizations, move users between organizations, manage plans and subscriptions, take and restore backups, work the security centre, grant temporary access tokens, run bulk operations, and impersonate any user (an exit-impersonation banner stays visible while doing so).

## Where permissions are enforced — почему раздел не виден, нет доступа

Three independent layers, which is why "the menu item is missing" and "the action is blocked" are different things:
1. Navigation visibility — the sidebar and the mobile menu filter every entry by role, so a role simply does not see sections it may not use.
2. Page guards — sensitive pages check the role again on open and show a "no access" state instead of content.
3. Server-side authorization — the Convex functions behind every mutation re-check the caller's role and organization. This is the layer that actually protects data; the first two are convenience.
Two rules cut across all three: nobody reviews their own leave request (or one they filed for someone else) and nobody sets their own salary; and a manager's reach is their own subtree — an admin's reach is the whole organization.
Edge middleware only checks that the user is signed in, not what their role is — never describe it as the permission boundary.
If a user says a section is missing or an action is blocked, the useful questions are: which role do they have, is the page in their role's list, is the record inside their organization, and — for approvals — is the requester below them in the reporting line.`,
  },
  {
    id: 'leave-policy',
    title: 'Leave policy & balances',
    roles: ALL,
    keywords:
      'отпуск leave vacation арձակուրդ leavepolicy баланс balance sick больничный family семейный doctor врач unpaid оплачиваемый paid days дни лимит limit approval согласование',
    body: `Leave types: paid (annual), unpaid, sick, family, doctor. Each type has its own annual balance configured per organization (leave settings); balances accrue monthly.
Workday: 09:00–18:00. A leave request needs start/end dates and a reason; it is created with status "pending" and routed to the requester's approver (the review comment is visible to the requester).
Who approves: the nearest manager above the requester in the reporting line, plus HR/admins, who may approve anyone in the organization. Nobody may approve their own request, or one they filed on someone else's behalf. The head of the organization has nobody above them, so their own leave is recorded as approved automatically with an audit note explaining why — HR does not review the head's leave.
Conflict rule: if more than 30% of a department is already on leave for the requested dates, the system raises a conflict alert and asks to pick other dates. The AI assistant checks conflicts BEFORE booking.
Requests can be edited while pending. Cancelling a leave (pending or approved) sends a request to HR, who approve or reject it — employees cannot cancel a leave directly. The team calendar shows all approved leaves. Balance warnings surface when remaining days are low.`,
  },
  {
    id: 'attendance',
    title: 'Attendance & time tracking',
    roles: ALL,
    keywords:
      'посещаемость attendance time tracking чекин check-in check-out опоздание late absence прогул присутствие график work schedule kehadiran',
    body: `Employees check in/out daily (check-in button on the dashboard or the attendance page). Each record stores date, check-in time, check-out time and status (present, late, absent).
Standard schedule is 09:00–18:00; late = check-in after 09:00. Work schedules and holidays are configured per organization.
Everybody files attendance, admins and the head of the organization included — only the platform superadmin is outside it. You clock yourself in; doing it for somebody else, or marking them absent, is a correction available to HR/admins org-wide and to a manager for their own reports.
Reading follows the same rule: your own history always, your reports' history if you manage them, everyone's if you are HR/admin. A colleague cannot read your attendance detail.
The attendance page shows personal history; supervisors/admins see team attendance, patterns and monthly summaries in analytics.`,
  },
  {
    id: 'drivers',
    title: 'Corporate drivers',
    roles: ALL,
    keywords:
      'водитель driver машина car поездка trip booking бронирование шофер маршрут from to пассажиры passengers рейтинг rating shift смена',
    body: `Organizations can employ corporate drivers. Employees book a driver for a time slot specifying from/to addresses, purpose and passenger count.
The AI assistant checks driver availability and conflicts (a driver double-booked for the same slot) before confirming. Drivers have shifts/schedules; passengers rate trips afterwards.
Booking flow: ask the assistant "book a driver tomorrow 10:00–12:00 from office to airport" → confirm the proposed action card.`,
  },
  {
    id: 'tasks-calendar',
    title: 'Tasks & calendar',
    roles: ALL,
    keywords:
      'задачи tasks calendar календарь дедлайн deadline приоритет priority recurring повторение напоминание reminder event событие',
    body: `Tasks have title, description, priority (low/medium/high), deadline and status (pending → in progress → done). They are assigned by managers or created by the user (also via AI assistant with conflict detection).
Recurring tasks repeat on a schedule. Task comments keep the discussion.
The team calendar aggregates approved leaves, company events and birthdays; it is the single place to see "who is out".`,
  },
  {
    id: 'documents',
    title: 'Documents & e-signatures',
    roles: ALL,
    keywords:
      'документы documents шаблон template blueprint подпис signature e-signature документооборот docx pdf view просмотр',
    body: `The documents module stores company files (docx/pdf) with view tracking. Document templates and blueprints let admins generate standard documents; the document builder composes bilingual documents from blocks.
E-signatures: documents can be sent for signature; signers draw/type a signature, the audit trail records who signed when.
Employees see shared documents on the Documents page; admins manage catalogs, templates and issued documents.`,
  },
  {
    id: 'learning',
    title: 'Learning & courses',
    roles: ALL,
    keywords:
      'обучение learning курсы courses уроки lessons квиз quiz сертификат certificate enrollment прогресс progress training',
    body: `The learning center hosts courses made of lessons (text/video). Employees enroll, track lesson progress, pass quizzes (attempts are recorded) and earn certificates on completion.
Admins create courses and assign them; progress is visible per employee.`,
  },
  {
    id: 'recognition',
    title: 'Recognition & kudos',
    roles: ALL,
    keywords:
      'kudos признание recognition бейджи badges очки points лидерборд leaderboard награда reward похвала благодарность',
    body: `Colleagues send kudos with badges (e.g. "Team player", "Innovation"). Kudos grant points; the leaderboard ranks employees by points.
Point transactions feed the rewards store (if enabled) where points can be exchanged for perks. Recognition is visible org-wide to build culture.`,
  },
  {
    id: 'goals',
    title: 'Goals & OKR',
    roles: ALL,
    keywords: 'цели goals okr key results check-in прогресс objectives квартал quarter',
    body: `Objectives with measurable key results (OKR). Owners post regular check-ins with progress percentages and notes.
Goals can be personal, team or company level; supervisors review check-ins. The goals page shows progress bars and alignment.`,
  },
  {
    id: 'messenger',
    title: 'Team messenger',
    roles: ALL,
    keywords:
      'мессенджер messenger чат chat сообщения messages звонки calls каналы channels unread непрочитанные smart reply',
    body: `Built-in team messenger: direct and group conversations, file/image messages, voice/video calls (with an incoming-call banner across the app), unread counters.
AI smart replies suggest quick answers in conversations. The messenger is on the Chat page; the global notifier plays a sound for new messages.`,
  },
  {
    id: 'help-desk',
    title: 'Help desk & tickets',
    roles: ALL,
    keywords:
      'тикет ticket поддержка support help desk sla заявка проблема инцидент incident приоритет',
    body: `Employees open support tickets (title, description, priority). Tickets move through statuses (open → in progress → resolved/closed) with comments.
SLA configs define response/resolution targets per priority; SLA metrics track compliance. Admins configure SLA and view the SLA dashboard.`,
  },
  {
    id: 'events-birthdays',
    title: 'Events & birthdays',
    roles: ALL,
    keywords:
      'события events дни рождения birthdays корпоратив праздник holiday meeting rooms переговорки бронирование комнат',
    body: `Company events (title, date, location) are shown on the calendar and in the events feed. Employee birthdays are celebrated automatically (birthday list + notifications).
Meeting rooms can be booked for time slots; double-booking is prevented. Holidays calendar is configured per organization (country-specific, including Armenian holidays).`,
  },
  {
    id: 'surveys',
    title: 'Surveys & engagement',
    roles: ALL,
    keywords: 'опрос survey анкета engagement вовлеченность вопросы answers анонимно anonymous',
    body: `HR runs surveys (multiple-choice or free-text questions, optional anonymous). Employees submit answers on the Surveys page; results aggregate per question.
Admins create surveys, schedule them and inspect response rates and breakdowns.`,
  },
  {
    id: 'team-management',
    title: 'Team & employee management',
    roles: SUP_PLUS,
    keywords:
      'сотрудники employees команда team отдел department должность position профиль profile presence присутствие approval согласование увольнения probation испытательный',
    body: `Supervisors/admins manage employees: profiles (extended data, notes, documents), departments and positions hierarchy, org chart.
Approvals hub collects pending leave requests and other approval items for the manager; approve/reject with a comment.
Probation periods are tracked per employee with end dates and review outcomes. User roles: employee < supervisor < admin < superadmin (RBAC enforced everywhere).`,
  },
  {
    id: 'performance',
    title: 'Performance reviews & KPI',
    roles: SUP_PLUS,
    keywords:
      'performance оценка review kpi рейтинг rating цикл cycle supervisor rating 360 отзыв feedback метрики',
    body: `Review cycles (e.g. quarterly) with assignments: self-review, supervisor rating, optional 360 responses. Review responses store scores and comments; performance metrics aggregate them.
Supervisor ratings feed promotion/salary decisions. The KPI agent in the AI assistant answers "who performs best / worst" style questions from this data.`,
  },
  {
    id: 'analytics-reports',
    title: 'Analytics & reports',
    roles: SUP_PLUS,
    keywords:
      'аналитика analytics отчеты reports статистика statistics дашборд dashboard headcount текучка turnover график chart export excel pdf',
    body: `Analytics dashboards: headcount, attendance trends, leave utilization, turnover, department load. Report builder lets admins compose custom reports and export to Excel/PDF.
The AI analytics agent (supervisor+) can answer natural-language questions about this data; it only reports what LIVE DATA contains — never invented numbers.`,
  },
  {
    id: 'recruitment',
    title: 'Recruitment pipeline',
    roles: ADM_PLUS,
    keywords:
      'найм recruitment вакансия vacancy кандидат candidate интервью interview резюме cv scorecard hiring packet приложение application',
    body: `Recruitment pipeline: vacancies (with AI-generated descriptions) → applications → candidate profiles → interviews with scorecards → hiring packet documents.
Each stage is tracked; interviewers fill scorecards (scores + comments). The recruitment agent in the AI assistant answers candidate/vacancy questions.
Admins create vacancies and move candidates through stages.`,
  },
  {
    id: 'onboarding-offboarding',
    title: 'Onboarding & offboarding',
    roles: ADM_PLUS,
    keywords:
      'онбординг onboarding оффбординг offboarding адаптация чеклист checklist увольнение exit newcomer новичок',
    body: `Onboarding programs: step-by-step checklists for newcomers (documents, accounts, introductions) with progress tracking.
Offboarding programs: exit checklists (asset return, access revocation, exit interview). Both are managed by admins; HR sees completion status per employee.`,
  },
  {
    id: 'payroll-expenses',
    title: 'Payroll & expenses',
    roles: ADM_PLUS,
    keywords:
      'зарплата payroll расчетный лист payslip расходы expenses отчет expense report налоги tax пенсия pension вычет deduction',
    body: `Payroll runs compute salaries per employee: base salary, allowances, deductions (income tax, pension), producing payslips. Payroll records store the computation details.
Expense reports: employees submit expenses (amount, category, receipt); admins approve and reimburse. Travel allowance is tracked per user.`,
  },
  {
    id: 'security-admin',
    title: 'Security & compliance',
    roles: ADM_PLUS,
    keywords:
      'безопасность security 2fa totp вход login audit аудит gdpr согласие consent пароль password brute force подозрительный',
    body: `Security features: password policies, login attempts tracking with brute-force detection, two-factor auth (TOTP), optional face login, device fingerprints.
GDPR: consent records and data-subject requests (export/delete). Audit logs record sensitive actions. Security settings are org-scoped; the security center shows alerts with severity levels.`,
  },
  {
    id: 'org-admin',
    title: 'Organization administration',
    roles: ADM_PLUS,
    keywords:
      'организация organization настройки settings leave settings отпуска holidays праздники sla integrations интеграции telegram slack',
    body: `Org admins configure: leave type balances and accrual rules, holidays calendar, SLA targets, notification preferences, integrations (Telegram/Slack-style bridges, webhooks), company news and broadcasts.
Organization has a plan (starter/professional/enterprise) controlling seat limits and feature gates. Frozen organizations lose all access until unfrozen.`,
  },
  {
    id: 'platform-billing',
    title: 'Plans & billing',
    roles: SUP_ADM,
    keywords:
      'тариф plan billing stripe подписка subscription mrr цена price trial пробный upgrade downgrade enterprise starter professional',
    body: `Subscription plans (Stripe): Starter $29/mo (up to 10 employees), Professional $79/mo (up to 50 employees), Enterprise $199/mo (unlimited seats).
Plans gate features (e.g. AI site editor limits per month: starter gets fewer edits than enterprise). Trials are supported; upgrades/downgrades prorate.
Superadmin billing dashboard shows MRR, active subscriptions, revenue charts; subscriptions can be managed manually when needed.`,
  },
  {
    id: 'platform-ops',
    title: 'Platform operations',
    roles: SUP_ADM,
    keywords:
      'superadmin организации organizations backup бэкап резервная копия restore impersonate ai governance guardrails ai site editor',
    body: `Superadmin-only: create/freeze/delete organizations, approve org creation requests, transfer users between orgs, impersonate any user (with a visible exit-mode banner).
Backups: org-wide and per-employee data snapshots with restore (the AI assistant can propose BACKUP_ORG / BACKUP_EMPLOYEE / RESTORE_BACKUP actions).
AI governance panel: request logs, agent health, guardrail toggles (input/output filtering, PII detection, rate limiting, human approval). AI site editor: superadmin-only natural-language site/code editing with monthly usage limits and rollback.`,
  },
];
