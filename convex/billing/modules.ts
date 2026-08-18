/**
 * Billing module catalog — the single registry of every billable module.
 *
 * The superadmin editor renders its controls from `settingsSchema`, so adding
 * a module here (or marking one `status: 'coming'`) is all it takes to make it
 * configurable — no per-module hardcode anywhere.
 *
 * `featureToggleKey` links a module to the existing operator-console toggles:
 * a module that is globally toggled off stays off even on Enterprise
 * (enforcement checks the toggle first).
 */

export type ModuleStatus = 'active' | 'beta' | 'coming';

export interface ModuleOptionSchema {
  type: 'number' | 'boolean' | 'string';
  label?: string; // i18n key suffix; falls back to the option key
  unit?: string; // 'seats', 'devices', 'queries/mo'…
  min?: number;
  max?: number;
  step?: number;
}

export interface BillingModuleDef {
  key: string;
  name: string; // default EN name — UI translates via i18n `billing.modules.<key>`
  description?: string;
  icon?: string; // lucide icon key
  category: string;
  status: ModuleStatus;
  isCore: boolean;
  featureToggleKey?: string;
  settingsSchema?: Record<string, ModuleOptionSchema>;
  sortOrder: number;
}

export const BILLING_CATEGORIES = [
  'people',
  'time',
  'performance',
  'talent',
  'finance',
  'communication',
  'documents',
  'platform',
  'ai',
  'security',
  'future',
] as const;

export const BILLING_MODULES: BillingModuleDef[] = [
  // ── Core (always included, no limits) ────────────────────────────────────
  {
    key: 'dashboard',
    name: 'Dashboard',
    icon: 'LayoutDashboard',
    category: 'platform',
    status: 'active',
    isCore: true,
    sortOrder: 0,
  },
  {
    key: 'profile',
    name: 'Employee profile',
    icon: 'User',
    category: 'people',
    status: 'active',
    isCore: true,
    sortOrder: 1,
  },

  // ── People ───────────────────────────────────────────────────────────────
  {
    key: 'employees',
    name: 'Employees',
    icon: 'Users',
    category: 'people',
    status: 'active',
    isCore: false,
    settingsSchema: { seats: { type: 'number', unit: 'seats', min: 1 } },
    sortOrder: 10,
  },
  {
    key: 'departments',
    name: 'Departments',
    icon: 'Building2',
    category: 'people',
    status: 'active',
    isCore: false,
    sortOrder: 11,
  },
  {
    key: 'positions',
    name: 'Positions',
    icon: 'Briefcase',
    category: 'people',
    status: 'active',
    isCore: false,
    sortOrder: 12,
  },
  {
    key: 'orgchart',
    name: 'Org chart',
    icon: 'Network',
    category: 'people',
    status: 'active',
    isCore: false,
    sortOrder: 13,
  },
  {
    key: 'drivers',
    name: 'Drivers',
    icon: 'Car',
    category: 'people',
    status: 'active',
    isCore: false,
    featureToggleKey: 'drivers.module',
    settingsSchema: { drivers: { type: 'number', unit: 'drivers', min: 1 } },
    sortOrder: 14,
  },
  {
    key: 'probation',
    name: 'Probation',
    icon: 'Timer',
    category: 'people',
    status: 'active',
    isCore: false,
    sortOrder: 15,
  },

  // ── Time & attendance ────────────────────────────────────────────────────
  {
    key: 'attendance',
    name: 'Attendance',
    icon: 'Clock',
    category: 'time',
    status: 'active',
    isCore: false,
    settingsSchema: {
      faceKiosks: { type: 'number', unit: 'devices', min: 0 },
      biometric: { type: 'boolean' },
    },
    sortOrder: 20,
  },
  {
    key: 'timeTracking',
    name: 'Time tracking',
    icon: 'Timer',
    category: 'time',
    status: 'active',
    isCore: false,
    sortOrder: 21,
  },
  {
    key: 'leaves',
    name: 'Leaves',
    icon: 'CalendarOff',
    category: 'time',
    status: 'active',
    isCore: false,
    settingsSchema: { leaveTypes: { type: 'number', unit: 'types', min: 1 } },
    sortOrder: 22,
  },
  {
    key: 'calendar',
    name: 'Calendar',
    icon: 'CalendarDays',
    category: 'time',
    status: 'active',
    isCore: false,
    sortOrder: 23,
  },
  {
    key: 'meetingRooms',
    name: 'Meeting rooms',
    icon: 'DoorOpen',
    category: 'time',
    status: 'active',
    isCore: false,
    settingsSchema: { rooms: { type: 'number', unit: 'rooms', min: 0 } },
    sortOrder: 24,
  },
  {
    key: 'videoConferences',
    name: 'Video conferences',
    icon: 'Video',
    category: 'time',
    status: 'active',
    isCore: false,
    settingsSchema: {
      rooms: { type: 'number', unit: 'rooms/mo', min: 0 },
      recording: { type: 'boolean' },
      webinars: { type: 'boolean' },
    },
    sortOrder: 25,
  },
  {
    key: 'productivity',
    name: 'Productivity',
    icon: 'Activity',
    category: 'time',
    status: 'beta',
    isCore: false,
    sortOrder: 26,
  },

  // ── Performance ──────────────────────────────────────────────────────────
  {
    key: 'performance',
    name: 'Performance (OKR)',
    icon: 'Target',
    category: 'performance',
    status: 'active',
    isCore: false,
    sortOrder: 30,
  },
  {
    key: 'reviews',
    name: 'Reviews',
    icon: 'ClipboardCheck',
    category: 'performance',
    status: 'active',
    isCore: false,
    sortOrder: 31,
  },
  {
    key: 'goals',
    name: 'OKR & goals',
    icon: 'Crosshair',
    category: 'performance',
    status: 'active',
    isCore: false,
    sortOrder: 32,
  },
  {
    key: 'recognition',
    name: 'Recognition',
    icon: 'Heart',
    category: 'performance',
    status: 'active',
    isCore: false,
    sortOrder: 33,
  },
  {
    key: 'rewards',
    name: 'Rewards',
    icon: 'Gift',
    category: 'performance',
    status: 'active',
    isCore: false,
    sortOrder: 34,
  },
  {
    key: 'surveys',
    name: 'Surveys',
    icon: 'ClipboardList',
    category: 'performance',
    status: 'active',
    isCore: false,
    featureToggleKey: 'surveys.module',
    sortOrder: 35,
  },

  // ── Talent ───────────────────────────────────────────────────────────────
  {
    key: 'recruitment',
    name: 'Recruitment',
    icon: 'UserPlus',
    category: 'talent',
    status: 'active',
    isCore: false,
    featureToggleKey: 'recruitment.module',
    settingsSchema: { openRoles: { type: 'number', unit: 'roles', min: 0 } },
    sortOrder: 40,
  },
  {
    key: 'onboarding',
    name: 'Onboarding',
    icon: 'Rocket',
    category: 'talent',
    status: 'active',
    isCore: false,
    sortOrder: 41,
  },
  {
    key: 'offboarding',
    name: 'Offboarding',
    icon: 'UserMinus',
    category: 'talent',
    status: 'active',
    isCore: false,
    sortOrder: 42,
  },
  {
    key: 'learning',
    name: 'Learning',
    icon: 'GraduationCap',
    category: 'talent',
    status: 'active',
    isCore: false,
    sortOrder: 43,
  },
  {
    key: 'hiringPackets',
    name: 'Hiring packets',
    icon: 'FilePlus2',
    category: 'talent',
    status: 'active',
    isCore: false,
    sortOrder: 44,
  },

  // ── Finance ──────────────────────────────────────────────────────────────
  {
    key: 'payroll',
    name: 'Payroll',
    icon: 'Wallet',
    category: 'finance',
    status: 'active',
    isCore: false,
    settingsSchema: { runs: { type: 'number', unit: 'runs/mo', min: 0 } },
    sortOrder: 50,
  },
  {
    key: 'compensation',
    name: 'Compensation',
    icon: 'DollarSign',
    category: 'finance',
    status: 'active',
    isCore: false,
    featureToggleKey: 'compensation.module',
    sortOrder: 51,
  },
  {
    key: 'expenses',
    name: 'Expenses',
    icon: 'Receipt',
    category: 'finance',
    status: 'active',
    isCore: false,
    featureToggleKey: 'expenses.module',
    settingsSchema: { reports: { type: 'number', unit: 'reports/mo', min: 0 } },
    sortOrder: 52,
  },
  {
    key: 'assets',
    name: 'Assets',
    icon: 'Package',
    category: 'finance',
    status: 'active',
    isCore: false,
    sortOrder: 53,
  },
  {
    key: 'reports',
    name: 'Reports',
    icon: 'BarChart3',
    category: 'finance',
    status: 'active',
    isCore: false,
    sortOrder: 54,
  },
  {
    key: 'analytics',
    name: 'Analytics',
    icon: 'LineChart',
    category: 'finance',
    status: 'active',
    isCore: false,
    sortOrder: 55,
  },

  // ── Communication ────────────────────────────────────────────────────────
  {
    key: 'chat',
    name: 'Team chat',
    icon: 'MessageCircle',
    category: 'communication',
    status: 'active',
    isCore: false,
    featureToggleKey: 'chat.realtime',
    settingsSchema: { channels: { type: 'number', unit: 'channels', min: 0 } },
    sortOrder: 60,
  },
  {
    key: 'news',
    name: 'News',
    icon: 'Megaphone',
    category: 'communication',
    status: 'active',
    isCore: false,
    sortOrder: 61,
  },
  {
    key: 'approvals',
    name: 'Approvals',
    icon: 'UserCheck',
    category: 'communication',
    status: 'active',
    isCore: false,
    sortOrder: 62,
  },
  {
    key: 'newsletter',
    name: 'Newsletter',
    icon: 'Mail',
    category: 'communication',
    status: 'active',
    isCore: false,
    sortOrder: 63,
  },
  {
    key: 'supportTickets',
    name: 'Support tickets',
    icon: 'Ticket',
    category: 'communication',
    status: 'active',
    isCore: false,
    sortOrder: 64,
  },

  // ── Documents ────────────────────────────────────────────────────────────
  {
    key: 'documents',
    name: 'Documents',
    icon: 'FileText',
    category: 'documents',
    status: 'active',
    isCore: false,
    settingsSchema: {
      documents: { type: 'number', unit: 'docs', min: 0 },
      storageGB: { type: 'number', unit: 'GB', min: 1 },
    },
    sortOrder: 70,
  },
  {
    key: 'signatures',
    name: 'E-signatures',
    icon: 'PenTool',
    category: 'documents',
    status: 'active',
    isCore: false,
    settingsSchema: { envelopes: { type: 'number', unit: 'envelopes/mo', min: 0 } },
    sortOrder: 71,
  },
  {
    key: 'documentBuilder',
    name: 'Document builder',
    icon: 'FilePlus2',
    category: 'documents',
    status: 'active',
    isCore: false,
    sortOrder: 72,
  },
  {
    key: 'backups',
    name: 'Backups',
    icon: 'Database',
    category: 'platform',
    status: 'active',
    isCore: false,
    settingsSchema: { retentionDays: { type: 'number', unit: 'days', min: 1 } },
    sortOrder: 80,
  },
  {
    key: 'integrations',
    name: 'Integrations',
    icon: 'Globe',
    category: 'platform',
    status: 'active',
    isCore: false,
    sortOrder: 81,
  },
  {
    key: 'automation',
    name: 'Automation',
    icon: 'Cpu',
    category: 'platform',
    status: 'active',
    isCore: false,
    sortOrder: 82,
  },
  {
    key: 'tasks',
    name: 'Tasks & projects',
    icon: 'CheckSquare',
    category: 'platform',
    status: 'active',
    isCore: false,
    settingsSchema: { projects: { type: 'number', unit: 'projects', min: 0 } },
    sortOrder: 83,
  },

  // ── AI ───────────────────────────────────────────────────────────────────
  {
    key: 'aiAssistant',
    name: 'AI assistant',
    icon: 'Sparkles',
    category: 'ai',
    status: 'active',
    isCore: false,
    featureToggleKey: 'ai.assistant',
    settingsSchema: { queries: { type: 'number', unit: 'queries/mo', min: 0 } },
    sortOrder: 90,
  },
  {
    key: 'aiSiteEditor',
    name: 'AI site editor',
    icon: 'Wand2',
    category: 'ai',
    status: 'beta',
    isCore: false,
    sortOrder: 91,
  },

  // ── Security & compliance ────────────────────────────────────────────────
  {
    key: 'securityCenter',
    name: 'Security center',
    icon: 'ShieldCheck',
    category: 'security',
    status: 'active',
    isCore: false,
    sortOrder: 100,
  },
  {
    key: 'compliance',
    name: 'Compliance (GDPR)',
    icon: 'Shield',
    category: 'security',
    status: 'active',
    isCore: false,
    sortOrder: 101,
  },

  // ── Coming soon (configurable today, enforced after release) ─────────────
  {
    key: 'aiMeetingAgent',
    name: 'AI meeting agent',
    icon: 'Bot',
    category: 'future',
    status: 'coming',
    isCore: false,
    settingsSchema: { hours: { type: 'number', unit: 'h/mo', min: 0 } },
    sortOrder: 200,
  },
  {
    key: 'breakoutRooms',
    name: 'Breakout rooms',
    icon: 'Columns2',
    category: 'future',
    status: 'coming',
    isCore: false,
    sortOrder: 201,
  },
  {
    key: 'guestAccess',
    name: 'Guest access',
    icon: 'KeyRound',
    category: 'future',
    status: 'coming',
    isCore: false,
    settingsSchema: { guests: { type: 'number', unit: 'guests', min: 0 } },
    sortOrder: 202,
  },
  {
    key: 'mobileApp',
    name: 'Mobile app',
    icon: 'Smartphone',
    category: 'future',
    status: 'coming',
    isCore: false,
    sortOrder: 203,
  },
  {
    key: 'apiAccess',
    name: 'API access',
    icon: 'Code2',
    category: 'future',
    status: 'coming',
    isCore: false,
    settingsSchema: { apiCalls: { type: 'number', unit: 'calls/mo', min: 0 } },
    sortOrder: 204,
  },
];

export const BILLING_MODULE_MAP: Record<string, BillingModuleDef> = Object.fromEntries(
  BILLING_MODULES.map((m) => [m.key, m]),
);

/** Parse a stored settingsSchema JSON (safe: malformed → undefined). */
export function parseSettingsSchema(
  raw: string | null | undefined,
): Record<string, ModuleOptionSchema> | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, ModuleOptionSchema>;
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    /* ignore malformed schema */
  }
  return undefined;
}

/** Serialize a settingsSchema for storage. */
export function stringifySettingsSchema(
  schema: Record<string, ModuleOptionSchema> | undefined,
): string | undefined {
  if (!schema || Object.keys(schema).length === 0) return undefined;
  return JSON.stringify(schema);
}
