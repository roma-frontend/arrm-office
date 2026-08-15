/**
 * Domain AI Agents — specialized system prompts for 4 domains.
 *
 * Instead of one massive prompt with all knowledge, each agent has deep
 * expertise in its domain. The AgentRouter selects the right agent based
 * on the user's message intent.
 */

import type { UserRole, UserContext } from '@/lib/aiAssistant';

// ── Agent Types ──────────────────────────────────────────────────────────────

export type AgentType = 'recruitment' | 'policy' | 'analytics' | 'kpi' | 'general';

export interface AgentDefinition {
  id: AgentType;
  name: string;
  shortName: string;
  icon: string; // emoji
  description: string;
  color: string; // Tailwind gradient
}

export const AGENTS: AgentDefinition[] = [
  {
    id: 'recruitment',
    name: 'Recruitment Agent',
    shortName: 'Recruitment',
    icon: '🎯',
    description: 'Специалист по рекрутингу и найму',
    color: 'from-(--brand) to-(--cyan)',
  },
  {
    id: 'policy',
    name: 'Policy Agent',
    shortName: 'Policy',
    icon: '📜',
    description: 'Эксперт по политикам и документам компании',
    color: 'from-(--warning-solid) to-(--warning-solid)',
  },
  {
    id: 'analytics',
    name: 'Analytics Agent',
    shortName: 'Analytics',
    icon: '📊',
    description: 'Аналитик данных и отчётов',
    color: 'from-(--success-solid) to-(--success-solid)',
  },
  {
    id: 'kpi',
    name: 'KPI Agent',
    shortName: 'KPI',
    icon: '🎯',
    description: 'Специалист по OKR, KPI и стратегии',
    color: 'from-(--purple) to-(--purple)',
  },
  {
    id: 'general',
    name: 'Strata AI',
    shortName: 'General',
    icon: '🤖',
    description: 'Общий ассистент по всем вопросам',
    color: 'from-(--surface-3) to-(--surface-3)',
  },
];

// ── Agent Keyword Routing ────────────────────────────────────────────────────

const AGENT_KEYWORDS: Record<AgentType, string[]> = {
  recruitment: [
    // Russian
    'ваканс',
    'кандидат',
    'резюме',
    'найм',
    'рекрутинг',
    'собеседование',
    'hiring',
    'hire',
    'вакансия',
    'позиция',
    'трудоустройство',
    'карьер',
    'собеседование',
    'интервью',
    'оффер',
    'предложение работы',
    'скрининг',
    // English
    'vacancy',
    'candidate',
    'resume',
    'recruit',
    'interview',
    'job opening',
    'job posting',
    'application',
    'applicant',
    'onboarding pipeline',
    'recruitment pipeline',
    'hiring funnel',
    'position',
    'job offer',
    // Armenian
    'թափուր',
    'աշխատանքի',
    'հարցազրույց',
    'ռեզյումե',
    'հավաքագրում',
    'աշխատանքի առաջարկ',
  ],
  policy: [
    // Russian
    'политик',
    'правил',
    'документ',
    'инструкци',
    'регламент',
    'норма',
    'gdpr',
    'персональные данные',
    'конфиденциальность',
    'согласие',
    'политика компании',
    'hr политика',
    'трудовой кодекс',
    'кодекс поведения',
    'закон',
    'комплаенс',
    'аудит',
    'доступ к данным',
    'безопасность данных',
    // English
    'policy',
    'policies',
    'rule',
    'regulation',
    'compliance',
    'gdpr',
    'privacy',
    'data protection',
    'company policy',
    'hr policy',
    'employee handbook',
    'code of conduct',
    'consent',
    'audit log',
    'data access',
    'document',
    'mandatory document',
    'acknowledgment',
    // Armenian
    'քաղաքականություն',
    'կանոն',
    'կարգավորում',
    'փաստաթուղթ',
    'համապատասխանություն',
    'գաղտնիություն',
  ],
  analytics: [
    // Russian
    'аналитик',
    'отчёт',
    'статистик',
    'график',
    'тренд',
    'показател',
    'метрик',
    'дашборд',
    'отчет',
    'анализ',
    'сравнение',
    'динамик',
    'диаграмм',
    'данные',
    'цифр',
    'показатель',
    'эффективность',
    'производительность',
    'посещаемост',
    'прогул',
    'опоздан',
    // English
    'analytics',
    'report',
    'statistics',
    'chart',
    'graph',
    'trend',
    'metric',
    'dashboard',
    'analysis',
    'compare',
    'data',
    'number',
    'attendance rate',
    'leave trend',
    'headcount',
    'turnover',
    'productivity',
    'efficiency',
    'benchmark',
    'insight',
    // Armenian
    'վերլուծություն',
    'հաշվետվություն',
    'վիճակագրություն',
    'գրաֆիկ',
    'տվյալ',
    'թրենդ',
    'ցուցանիշ',
    'արդյունավետություն',
  ],
  kpi: [
    // Russian
    'okr',
    'kpi',
    'цель',
    'цели',
    'цел',
    'задач',
    'стратеги',
    'план',
    'результат',
    'ключевой результат',
    'достижение',
    'прогресс',
    'этап',
    'вех',
    'balanced scorecard',
    'bsc',
    'стратегическая карта',
    'north star',
    'performance review',
    'оценк',
    'эффективность',
    'рейтинг',
    'показател',
    'показатель',
    'performance',
    'review',
    '360',
    'обратная связь',
    'goal',
    'objective',
    'ключевой показатель',
    'метрика',
    'достиг',
    // English
    'goal',
    'objective',
    'key result',
    'progress',
    'strategy',
    'balanced scorecard',
    'bsc',
    'performance review',
    'kpi',
    'okr',
    'north star',
    'strategic',
    'alignment',
    'cascade',
    'metric',
    'target',
    'deadline',
    'milestone',
    'check-in',
    'confidence',
    'on track',
    'at risk',
    'behind',
    'completion',
    // Armenian
    'նպատակ',
    'արդյունք',
    'հիմնական արդյունք',
    'առաջընթաց',
    'ռազմավարություն',
    'կատարողական',
    'գնահատում',
    'ցուցանիշ',
  ],
  general: [], // fallback — matched when nothing else fits
};

// ── Build Agent Prompt ───────────────────────────────────────────────────────

/**
 * Build a domain-specific system prompt for the selected agent.
 * Much smaller and more focused than the full buildRoleBasedPrompt.
 */
export function buildAgentPrompt(
  agent: AgentType,
  userContext: UserContext,
  liveData?: string,
): string {
  const basePrompt = buildBaseRolePrompt(userContext);

  switch (agent) {
    case 'recruitment':
      return buildRecruitmentPrompt(userContext, basePrompt, liveData);
    case 'policy':
      return buildPolicyPrompt(userContext, basePrompt, liveData);
    case 'analytics':
      return buildAnalyticsPrompt(userContext, basePrompt, liveData);
    case 'kpi':
      return buildKpiPrompt(userContext, basePrompt, liveData);
    case 'general':
      return basePrompt; // general just returns the base role prompt
  }
}

function buildBaseRolePrompt(userContext: UserContext): string {
  return `You are **Strata AI** — the intelligent assistant built into the Strata platform.

PERSONALITY:
- Warm, professional, and approachable — like a brilliant HR colleague
- Use bullet points, bold text, and emojis 🎯📊📅✅⚠️ for readability
- Be **proactive**: mention important things the user should know
- ALWAYS respond in the SAME LANGUAGE as the user's message (Russian, English, or Armenian)
- When you don't have enough data, say so honestly

CURRENT USER:
👤 Name: ${userContext.name}
🔑 Role: ${userContext.role.toUpperCase()}
🏢 Department: ${userContext.department || 'Not specified'}
`;
}

function buildRecruitmentPrompt(userContext: UserContext, base: string, liveData?: string): string {
  return `${base}

═══ RECRUITMENT AGENT ═══
You are a **Recruitment & Talent Acquisition Specialist**. Your expertise:

📋 **Vacancies & Positions**
- Track open, paused, closed vacancies
- Vacancy details: title, department, location, employment type, description, requirements
- Salary ranges (min/max/currency)
- Employment types: Full-time, Part-time, Contract, Internship

👤 **Candidate Pipeline**
- Pipeline stages: Applied → Screening → Interview → Offer → Hired → Rejected
- Candidate details: name, email, phone, source, resume
- Scorecards and interview feedback
- Source tracking: Manual, Referral, LinkedIn, Career Page

📅 **Interviews**
- Schedule and manage interviews
- Interview types: Phone, Video, On-site, Technical, HR
- Interview feedback and recommendations (Strong Yes → Strong No)
- Upcoming interviews calendar

📈 **Recruitment Analytics**
- Time-to-hire, source effectiveness
- Pipeline conversion rates
- Open vs filled positions
- Department hiring needs

${liveData ? `\nLIVE DATA:\n${liveData}` : ''}

FORMAT RULES:
- Use markdown for clarity
- NEVER fabricate data — use ONLY information from LIVE DATA
- If LIVE DATA is empty, say "I don't have recruitment data right now"
`;
}

function buildPolicyPrompt(userContext: UserContext, base: string, liveData?: string): string {
  return `${base}

═══ POLICY AGENT ═══
You are a **Policy & Compliance Expert**. Your expertise:

📜 **Company Policies**
- HR policies, employee handbook, code of conduct
- Leave policies (paid 20d, sick 10d, family 5d, unpaid 30d)
- Work hours (09:00-18:00, 1h lunch), late arrival rules
- Attendance and time tracking policies

🔒 **Compliance & GDPR**
- GDPR request types: Data Access, Deletion, Rectification, Portability
- Consent management and withdrawal
- Data access logs and audit trails
- Policy management (Data Retention, Privacy, Security, Access Control)

📄 **Documents**
- Document categories: Policy, Contract, Report, Template, Form, Certificate
- Mandatory document acknowledgment workflow
- Document publishing and expiration
- View tracking and acknowledgment rate

⚖️ **Rules & Regulations**
- Leave approval workflow (advance notice except sick leave)
- Department conflict checking (>30% on leave → recommend alternatives)
- Employee data privacy rules
- Role-based access control

${liveData ? `\nLIVE DATA:\n${liveData}` : ''}

FORMAT RULES:
- Be precise about policies — quote specific rules when possible
- NEVER fabricate policy details — use ONLY live data
- If unsure, direct user to the Documents page (/documents)
`;
}

function buildAnalyticsPrompt(userContext: UserContext, base: string, liveData?: string): string {
  return `${base}

═══ ANALYTICS AGENT ═══
You are a **Data Analytics & Insights Specialist**. Your expertise:

📊 **HR Analytics & Metrics**
- Leave usage trends by department and time period
- Attendance rates, late arrival patterns, punctuality scores
- Headcount, turnover, hiring metrics
- Employee engagement and satisfaction data

📈 **Reports & Dashboards**
- Leave summary reports (filterable by department, date, employee)
- Attendance reports with work hours calculation
- Monthly/quarterly/year-over-year comparisons
- Department breakdowns and benchmarking

🎯 **Key Metrics**
- Total employees, pending requests, on leave today
- Leave balance utilization
- Average leave duration by type
- Department coverage and conflict rates
- Productivity trends (Pomodoro, focus sessions)

📉 **Trends & Insights**
- Month-over-month and year-over-year trends
- Seasonal patterns in leave and attendance
- Anomaly detection (unusual patterns)
- Predictive insights (forecast leave demand)

${liveData ? `\nLIVE DATA:\n${liveData}` : ''}

FORMAT RULES:
- Present data visually: use tables, percentages, and trends
- Compare current vs previous periods when possible
- NEVER invent numbers — ONLY use data from LIVE DATA section
- If data is empty, suggest checking the Analytics page (/analytics)
`;
}

function buildKpiPrompt(userContext: UserContext, base: string, liveData?: string): string {
  return `${base}

═══ KPI & STRATEGY AGENT ═══
You are a **Strategy & Performance Management Specialist**. Your expertise:

🎯 **OKR & Goals**
- Objectives and Key Results (OKR) framework
- Objective levels: Company → Team → Individual
- Key Result types: Percentage, Number, Currency, Boolean
- Progress tracking (0-100%), confidence scoring (High/Medium/Low)
- Weekly check-ins and progress updates

📊 **Balanced Scorecard**
- 4 perspectives: Financial, Customer, Internal Process, Learning & Growth
- North Star metric — the single most important KPI
- Perspective scores with grades (Excellent/Good/Fair/Poor)
- Strategy heat map for visual health assessment
- Trend tracking across periods

🔄 **Strategy Cascade**
- Company objectives cascade to teams
- Team objectives align with company goals
- Individual objectives support team goals
- Parent-child objective relationships
- Alignment visualization and health indicators

📈 **Performance Reviews**
- Performance review cycles and 360° feedback
- Competency evaluation and scoring
- Self, manager, peer, and direct report reviews
- Review history and development plans

🏆 **Recognition & Rewards**
- Kudos system, points, and leaderboard
- Categories: Teamwork, Innovation, Leadership, etc.
- Recognition tied to goal achievement
- Performance-based rewards

${liveData ? `\nLIVE DATA:\n${liveData}` : ''}

FORMAT RULES:
- Use clear structure with objective → key result breakdowns
- Highlight health status: 🟢 On Track, 🟡 At Risk, 🔴 Behind
- When discussing goals, suggest next check-in dates
- NEVER fabricate data — use ONLY LIVE DATA
`;
}

// ── Agent Router ─────────────────────────────────────────────────────────────

/**
 * Route a user message to the most relevant agent.
 * Uses keyword matching + role-based restrictions.
 *
 * Some agents require specific roles:
 * - 'analytics' requires at least 'supervisor' (org-wide data access)
 * - All other agents available to all roles
 */
export function routeToAgent(message: string, userRole: UserRole): AgentType {
  const normalized = message.toLowerCase().trim();

  // Score each agent by keyword matches
  const scores: Record<AgentType, number> = {
    recruitment: 0,
    policy: 0,
    analytics: 0,
    kpi: 0,
    general: 0,
  };

  for (const [agent, keywords] of Object.entries(AGENT_KEYWORDS)) {
    if (agent === 'general') continue;
    for (const keyword of keywords) {
      if (normalized.includes(keyword.toLowerCase())) {
        scores[agent as AgentType] += keyword.length;
      }
    }
  }

  // Find the best match
  let bestAgent: AgentType = 'general';
  let bestScore = 0;

  for (const [agent, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestAgent = agent as AgentType;
    }
  }

  // Threshold: if score is too low, use general
  if (bestScore < 3) {
    return 'general';
  }

  // Role-based restrictions:
  // 'analytics' agent requires supervisor+ (org-wide data)
  const restrictedAgents: Partial<Record<AgentType, UserRole[]>> = {
    analytics: ['supervisor', 'admin', 'superadmin'],
    // Add more restrictions here as needed
  };

  const allowedRoles = restrictedAgents[bestAgent];
  if (allowedRoles && !allowedRoles.includes(userRole)) {
    return 'general';
  }

  return bestAgent;
}

/**
 * Format agent routing info for the system prompt.
 */
export function getAgentSystemInstruction(agent: AgentType): string {
  const agentDef = AGENTS.find((a) => a.id === agent);
  if (!agentDef || agent === 'general') return '';

  return `\n\nYou are in **${agentDef.name}** mode. Focus on ${agentDef.description.toLowerCase()} topics only. If the question is outside your domain, politely redirect to the general assistant.\n`;
}
