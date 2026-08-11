/**
 * Role-gated navigation allow-lists for the AI assistant.
 *
 * The model may only emit `<NAVIGATE>/path</NAVIGATE>` for paths in the
 * user's role allow-list; slash commands are built from the same lists, so an
 * employee is never offered admin-only pages. Client-safe (no server imports).
 *
 * Every path below is a real directory under `src/app/(dashboard)`. The lists
 * used to drift from the router in both directions: they offered pages that do
 * not exist (`/messenger`, `/help-desk`, `/meeting-rooms`, `/corporate`,
 * `/document-builder`, `/audit`, bare `/security` and `/integrations`) while
 * omitting pages that do (`/chat`, `/rooms`, `/news`, `/projects`, `/team`),
 * so navigation to real sections was silently refused by `canNavigate` and
 * navigation to dead ones produced a 404.
 */

import type { UserRole } from '@/lib/aiAssistant';

/** Self-service pages available to every signed-in user. */
export const EMPLOYEE_ROUTES = [
  '/dashboard',
  '/calendar',
  '/leaves',
  '/attendance',
  '/tasks',
  '/chat',
  '/ai-chat',
  '/rooms',
  '/documents',
  '/learning',
  '/recognition',
  '/goals',
  '/performance',
  '/signatures',
  '/surveys',
  '/news',
  '/events',
  '/org-chart',
  '/employees',
  '/profile',
  '/settings',
  '/help',
];

export const DRIVER_ROUTES = [...EMPLOYEE_ROUTES, '/drivers'];

export const SUPERVISOR_ROUTES = [
  ...EMPLOYEE_ROUTES,
  '/drivers',
  '/team',
  '/projects',
  '/assets',
  '/analytics',
  '/reports',
  '/approvals',
  '/strategy',
  '/recruitment',
  '/onboarding',
  '/offboarding',
  '/payroll',
  '/compensation',
  '/expenses',
];

export const ADMIN_ROUTES = [
  ...SUPERVISOR_ROUTES,
  '/admin',
  '/admin/events',
  '/admin/holidays',
  '/admin/integrations',
  '/admin/leave-balances',
  '/admin/leave-settings',
  '/admin/ai-governance',
  '/admin/join-requests',
  '/join-requests',
  '/org-requests',
  '/compliance',
];

export const SUPERADMIN_ROUTES = [
  ...ADMIN_ROUTES,
  '/superadmin',
  '/superadmin/organizations',
  '/superadmin/users',
  '/superadmin/create-org',
  '/superadmin/subscriptions',
  '/superadmin/stripe-dashboard',
  '/superadmin/backups',
  '/superadmin/security',
  '/superadmin/support',
  '/superadmin/automation',
  '/superadmin/emergency',
  '/superadmin/impersonate',
  '/superadmin/access-tokens',
  '/superadmin/bulk-actions',
  '/ai-site-editor',
];

const ROUTES_BY_ROLE: Record<UserRole, string[]> = {
  employee: EMPLOYEE_ROUTES,
  driver: DRIVER_ROUTES,
  supervisor: SUPERVISOR_ROUTES,
  admin: ADMIN_ROUTES,
  superadmin: SUPERADMIN_ROUTES,
};

/** Navigable routes for a role (the NAVIGATE allow-list). */
export function assistantRoutesForRole(role: UserRole): string[] {
  return ROUTES_BY_ROLE[role] ?? EMPLOYEE_ROUTES;
}

/** Whether a given path is navigable for a role. */
export function canNavigate(role: UserRole, path: string): boolean {
  return assistantRoutesForRole(role).some((r) => path === r || path.startsWith(`${r}/`));
}
