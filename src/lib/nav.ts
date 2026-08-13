/**
 * Navigation — the single source of truth for every in-app destination.
 *
 * This block used to live inside Sidebar.tsx as a module-level `const`, which
 * meant anything else that needed the app's route list had to duplicate it. The
 * command palette did exactly that and drifted: it shipped 15 hardcoded entries
 * while the sidebar had ~60, so several destinations were unreachable from
 * search and a few of its hrefs pointed at routes that no longer existed.
 *
 * Consumers: Sidebar, MobileSidebar, CommandPalette.
 *
 * `roles` encodes visibility. Children without their own `roles` inherit the
 * parent's. Client-side filtering here is cosmetic only — every Convex query
 * authorises independently via getAuthCaller.
 */
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  BarChart3,
  Briefcase,
  Building2,
  Calendar,
  CalendarCheck,
  CalendarDays,
  Car,
  CheckSquare,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Contact,
  Cpu,
  CreditCard,
  Crosshair,
  Database,
  DollarSign,
  DoorOpen,
  FileText,
  FolderKanban,
  Globe,
  GraduationCap,
  Heart,
  HelpCircle,
  Key,
  Layers,
  LayoutDashboard,
  Library,
  Megaphone,
  MessageCircle,
  Network,
  Package,
  PenTool,
  Receipt,
  Repeat,
  Rocket,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  Ticket,
  User,
  UserCheck,
  UserMinus,
  Users,
  Wallet,
} from 'lucide-react';

export type UserRole = 'superadmin' | 'admin' | 'supervisor' | 'employee' | 'driver';

export type NavItem = {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  roles: string[];
  badge?: string;
  children?: {
    href: string;
    labelKey: string;
    icon?: LucideIcon;
    roles?: string[];
  }[];
};

export type NavSeparator = { type: 'separator'; labelKey?: string };

export type NavEntry = NavItem | NavSeparator;

export const isSeparator = (entry: NavEntry): entry is NavSeparator =>
  'type' in entry && entry.type === 'separator';

export const navItems: NavEntry[] = [
  // ── Core (direct links, most used) ──
  {
    href: '/dashboard',
    labelKey: 'nav.dashboard',
    icon: LayoutDashboard,
    roles: ['superadmin', 'admin', 'supervisor', 'employee', 'driver'],
  },
  {
    href: '/employees',
    labelKey: 'nav.employees',
    icon: Users,
    roles: ['superadmin', 'admin', 'supervisor', 'employee', 'driver'],
    children: [
      { href: '/employees', labelKey: 'nav.employees.all', icon: Users },
      { href: '/team', labelKey: 'team.title', icon: Contact },
      { href: '/employees/departments', labelKey: 'nav.employees.departments', icon: Building2 },
      { href: '/employees/positions', labelKey: 'nav.employees.positions', icon: Briefcase },
    ],
  },
  {
    href: '/attendance',
    labelKey: 'nav.attendance',
    icon: Clock,
    roles: ['superadmin', 'admin', 'supervisor', 'employee', 'driver'],
  },
  {
    href: '/leaves',
    labelKey: 'nav.leaves',
    icon: ClipboardList,
    roles: ['superadmin', 'admin', 'supervisor', 'employee', 'driver'],
  },
  {
    href: '/calendar',
    labelKey: 'nav.calendar',
    icon: CalendarDays,
    roles: ['superadmin', 'admin', 'supervisor', 'employee', 'driver'],
  },
  {
    href: '/rooms',
    labelKey: 'nav.rooms',
    icon: DoorOpen,
    roles: ['superadmin', 'admin', 'supervisor', 'employee', 'driver'],
  },
  {
    href: '/tasks',
    labelKey: 'nav.tasks',
    icon: CheckSquare,
    roles: ['superadmin', 'admin', 'supervisor', 'employee', 'driver'],
    children: [
      { href: '/tasks', labelKey: 'nav.tasks', icon: CheckSquare },
      {
        href: '/tasks/recurring',
        labelKey: 'nav.recurringTasks',
        icon: Repeat,
        roles: ['superadmin', 'admin', 'supervisor', 'employee'],
      },
      {
        href: '/projects',
        labelKey: 'nav.projects',
        icon: FolderKanban,
        roles: ['superadmin', 'admin', 'supervisor', 'employee'],
      },
    ],
  },

  {
    href: '/chat',
    labelKey: 'nav.chat',
    icon: MessageCircle,
    roles: ['superadmin', 'admin', 'supervisor', 'employee', 'driver'],
    badge: 'CHAT',
  },

  // ── Performance ──
  { type: 'separator', labelKey: 'nav.groups.performance' },
  {
    href: '/performance',
    labelKey: 'nav.performance',
    icon: Target,
    roles: ['superadmin', 'admin', 'supervisor', 'employee', 'driver'],
    children: [
      { href: '/performance', labelKey: 'nav.performance', icon: Target },
      { href: '/goals', labelKey: 'nav.goals', icon: Crosshair },
      { href: '/strategy', labelKey: 'nav.strategyMap', icon: Layers },
      { href: '/signatures', labelKey: 'nav.signatures', icon: PenTool },
      { href: '/recognition', labelKey: 'nav.recognition', icon: Heart },
    ],
  },

  // ── Talent ──
  { type: 'separator', labelKey: 'nav.groups.talent' },
  {
    href: '/recruitment',
    labelKey: 'nav.talent',
    icon: Briefcase,
    roles: ['superadmin', 'admin', 'supervisor'],
    children: [
      { href: '/recruitment', labelKey: 'nav.recruitment', icon: Briefcase },
      { href: '/onboarding', labelKey: 'nav.onboarding', icon: Rocket },
      { href: '/offboarding', labelKey: 'nav.offboarding', icon: UserMinus },
      { href: '/learning', labelKey: 'nav.learning', icon: GraduationCap },
    ],
  },

  // ── Finance ──
  { type: 'separator', labelKey: 'nav.groups.finance' },
  {
    href: '/payroll',
    labelKey: 'nav.finance',
    icon: Wallet,
    roles: ['superadmin', 'admin', 'supervisor'],
    children: [
      { href: '/payroll', labelKey: 'nav.payroll', icon: Wallet },
      { href: '/compensation', labelKey: 'nav.compensation', icon: DollarSign },
      {
        href: '/expenses',
        labelKey: 'nav.expenses',
        icon: Receipt,
        roles: ['superadmin', 'admin', 'supervisor'],
      },
    ],
  },

  // ── Reports ──
  { type: 'separator', labelKey: 'nav.groups.reports' },
  {
    href: '/reports',
    labelKey: 'nav.reports',
    icon: BarChart3,
    roles: ['superadmin', 'admin', 'supervisor'],
    children: [
      { href: '/reports', labelKey: 'nav.reports', icon: FileText },
      { href: '/analytics', labelKey: 'nav.analytics', icon: BarChart3 },
      { href: '/analytics/reports', labelKey: 'nav.reportBuilder', icon: BarChart3 },
    ],
  },

  // ── Organization ──
  { type: 'separator', labelKey: 'nav.groups.organization' },
  {
    href: '/org-chart',
    labelKey: 'nav.organization',
    icon: Building2,
    roles: ['superadmin', 'admin', 'supervisor', 'employee', 'driver'],
    children: [
      { href: '/org-chart', labelKey: 'nav.orgChart', icon: Network },
      { href: '/documents', labelKey: 'nav.documents', icon: FileText },
      {
        href: '/documents/library',
        labelKey: 'nav.documentLibrary',
        icon: Library,
        roles: ['superadmin', 'admin'],
      },
      {
        href: '/assets',
        labelKey: 'nav.assets',
        icon: Package,
        roles: ['superadmin', 'admin', 'supervisor', 'employee'],
      },
      {
        href: '/admin/events',
        labelKey: 'nav.events',
        icon: Calendar,
        roles: ['superadmin', 'admin'],
      },
    ],
  },

  // ── People ──
  { type: 'separator', labelKey: 'nav.groups.people' },
  {
    href: '/drivers',
    labelKey: 'nav.people',
    icon: User,
    roles: ['superadmin', 'admin', 'supervisor', 'driver'],
    children: [
      { href: '/drivers', labelKey: 'nav.drivers', icon: Car },
      {
        href: '/join-requests',
        labelKey: 'nav.joinRequests',
        icon: UserCheck,
        roles: ['superadmin', 'admin'],
      },
    ],
  },

  // ── Communication ──
  { type: 'separator', labelKey: 'nav.groups.communication' },
  {
    href: '/news',
    labelKey: 'nav.news',
    icon: Megaphone,
    roles: ['superadmin', 'admin', 'supervisor', 'employee', 'driver'],
  },
  {
    href: '/approvals',
    labelKey: 'nav.approvals',
    icon: UserCheck,
    roles: ['superadmin', 'admin'],
  },
  {
    href: '/surveys',
    labelKey: 'nav.surveys',
    icon: ClipboardList,
    roles: ['superadmin', 'admin', 'supervisor', 'employee', 'driver'],
  },

  // ── Settings & Admin ──
  { type: 'separator', labelKey: 'nav.groups.admin' },
  {
    href: '/help',
    labelKey: 'nav.help',
    icon: HelpCircle,
    roles: ['superadmin', 'admin', 'supervisor', 'employee', 'driver'],
  },
  {
    href: '/settings',
    labelKey: 'nav.settings',
    icon: Settings,
    roles: ['superadmin', 'admin', 'supervisor', 'employee', 'driver'],
    children: [
      { href: '/profile', labelKey: 'nav.profile', icon: User },
      { href: '/settings', labelKey: 'nav.settings', icon: Settings },
      { href: '/admin', labelKey: 'nav.admin', icon: ShieldCheck, roles: ['superadmin'] },
      {
        href: '/superadmin/automation',
        labelKey: 'nav.automation',
        icon: Cpu,
        roles: ['superadmin'],
      },
      { href: '/superadmin/support', labelKey: 'nav.support', icon: Ticket, roles: ['superadmin'] },
      {
        href: '/superadmin/emergency',
        labelKey: 'nav.emergency',
        icon: AlertTriangle,
        roles: ['superadmin'],
      },
      {
        href: '/superadmin/impersonate',
        labelKey: 'nav.impersonate',
        icon: User,
        roles: ['superadmin'],
      },
      {
        href: '/superadmin/access-tokens',
        labelKey: 'nav.accessTokens',
        icon: Key,
        roles: ['superadmin'],
      },
      {
        href: '/superadmin/bulk-actions',
        labelKey: 'nav.bulkActions',
        icon: CheckSquare,
        roles: ['superadmin'],
      },
      {
        href: '/superadmin/subscriptions',
        labelKey: 'nav.subscriptions',
        icon: CreditCard,
        roles: ['superadmin'],
      },
      {
        href: '/superadmin/backups',
        labelKey: 'nav.backups',
        icon: Database,
        roles: ['superadmin'],
      },
      {
        href: '/superadmin/security',
        labelKey: 'nav.security',
        icon: ShieldCheck,
        roles: ['superadmin'],
      },
      {
        href: '/admin/ai-governance',
        labelKey: 'nav.aiGovernance',
        icon: ShieldCheck,
        roles: ['superadmin', 'admin'],
      },
      {
        href: '/admin/leave-settings',
        labelKey: 'nav.leaveSettings',
        icon: CalendarCheck,
        roles: ['superadmin', 'admin'],
      },
      {
        href: '/admin/holidays',
        labelKey: 'nav.holidays',
        icon: Sun,
        roles: ['superadmin', 'admin'],
      },
      {
        href: '/admin/leave-balances',
        labelKey: 'nav.leaveBalances',
        icon: Wallet,
        roles: ['superadmin', 'admin'],
      },
      {
        href: '/admin/integrations',
        labelKey: 'nav.integrations',
        icon: Globe,
        roles: ['superadmin', 'admin'],
      },
      {
        href: '/compliance',
        labelKey: 'nav.compliance',
        icon: ClipboardCheck,
        roles: ['superadmin', 'admin'],
      },
      {
        href: '/ai-site-editor',
        labelKey: 'nav.aiSiteEditor',
        icon: Sparkles,
        roles: ['superadmin'],
      },
    ],
  },
];

export type NavDestination = {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  /** i18n key of the separator this destination sits under, when any. */
  groupKey?: string;
};

/**
 * Flattens navItems into a lookup of leaf destinations for the current role.
 *
 * Parents that only group children (their own href duplicates the first child)
 * still appear, because the sidebar links them directly. Duplicate hrefs are
 * collapsed, keeping the first (most specific) label seen.
 */
export function flattenNavDestinations(role: UserRole | undefined): NavDestination[] {
  const userRole: UserRole = role ?? 'employee';
  const seen = new Set<string>();
  const out: NavDestination[] = [];
  let group: string | undefined;

  for (const entry of navItems) {
    if (isSeparator(entry)) {
      group = entry.labelKey;
      continue;
    }
    if (!entry.roles.includes(userRole)) continue;

    if (!seen.has(entry.href)) {
      seen.add(entry.href);
      out.push({ href: entry.href, labelKey: entry.labelKey, icon: entry.icon, groupKey: group });
    }

    for (const child of entry.children ?? []) {
      // A child without its own roles inherits the parent's, which we already
      // checked above.
      if (child.roles && !child.roles.includes(userRole)) continue;
      if (seen.has(child.href)) continue;
      seen.add(child.href);
      out.push({
        href: child.href,
        labelKey: child.labelKey,
        icon: child.icon ?? entry.icon,
        groupKey: group ?? entry.labelKey,
      });
    }
  }

  return out;
}
