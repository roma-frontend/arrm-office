/**
 * Where a notification takes the user, in one place.
 *
 * Both entry points into a notification — the bell dropdown in the navbar and
 * the real-time banner — used to build the destination themselves, and they
 * disagreed: the banner ignored the type map and sent anything without a stored
 * `route` to `/dashboard`, and only tasks ever received the `?highlight=`
 * parameter. Everything now goes through `notificationTarget`.
 */

/** The shape both call-sites already have; a superset of what we read. */
export interface NotificationLike {
  type: string;
  relatedId?: string;
  route?: string;
}

/**
 * Fallback destination per notification type, used when the row carries no
 * `route` of its own. Types missing here (`system`, `security_alert`,
 * `probation_*`, `offboarding_*`, …) are expected to store their own route.
 */
export const NOTIFICATION_ROUTES: Record<string, string> = {
  join_request: '/join-requests',
  join_approved: '/dashboard',
  join_rejected: '/dashboard',
  leave_request: '/leaves',
  leave_approved: '/leaves',
  leave_rejected: '/leaves',
  driver_request: '/drivers',
  driver_request_approved: '/drivers',
  driver_request_rejected: '/drivers',
  status_change: '/drivers',
  employee_added: '/employees',
  message_mention: '/chat',
  review_deadline: '/performance',
  okr_checkin_reminder: '/goals',
  survey_auto_activated: '/surveys',
  survey_auto_closed: '/surveys',
  onboarding_task_due: '/onboarding',
  onboarding_started: '/onboarding',
  onboarding_manager_assigned: '/onboarding',
  onboarding_buddy_assigned: '/onboarding',
  onboarding_task_overdue: '/onboarding',
  asset_assigned: '/assets',
  room_booked: '/rooms',
  room_booking_cancelled: '/rooms',
  room_meeting_reminder: '/calendar',
  announcement_published: '/news',
};

/**
 * Routes whose page reads `?highlight=<id>` and flashes the matching row
 * (`useHighlightedEntity`). Adding a route here without teaching its page to
 * read the parameter just produces a harmless no-op, but the point is the pair.
 */
export const HIGHLIGHT_ROUTES = ['/tasks', '/leaves', '/calendar'] as const;

/** Query parameter that carries the id of the entity to flash. */
export const HIGHLIGHT_PARAM = 'highlight';

/**
 * Adds `?highlight=<id>` to a destination that supports it, preserving any
 * query string the route already carries.
 */
export function withHighlight(target: string, entityId: string): string {
  const [path = target, existingQuery] = target.split('?');
  const params = new URLSearchParams(existingQuery ?? '');
  params.set(HIGHLIGHT_PARAM, entityId);
  return `${path}?${params.toString()}`;
}

/** True when the page behind `target` knows how to flash a highlighted row. */
export function supportsHighlight(target: string): boolean {
  const path = target.split('?')[0] ?? target;
  return (HIGHLIGHT_ROUTES as readonly string[]).includes(path);
}

/**
 * The destination of a notification without its query string — i.e. which module
 * it belongs to. Used to group unread notifications per tool.
 */
export function notificationRoute(n: NotificationLike, role?: string): string | null {
  const target = notificationTarget(n, role);
  return target ? (target.split('?')[0] ?? target) : null;
}

/**
 * Resolve the destination for a notification, or null when it has none.
 *
 * `relatedId` is a plain string rather than a typed id, and some producers
 * namespace it (`support_ticket:…`, `user:…`). A namespaced value is never an
 * entity id of the target page, so it is not passed on as a highlight.
 */
export function notificationTarget(n: NotificationLike, role?: string): string | null {
  if (n.type === 'security_alert' && n.relatedId && !n.relatedId.includes(':')) {
    return `/superadmin/security/alert/${n.relatedId}`;
  }
  if (n.relatedId?.startsWith('support_ticket:')) {
    return role === 'superadmin' ? '/superadmin/support' : '/help';
  }

  const base = n.route ?? NOTIFICATION_ROUTES[n.type] ?? null;
  if (!base) return null;

  if (n.relatedId && !n.relatedId.includes(':') && supportsHighlight(base)) {
    return withHighlight(base, n.relatedId);
  }
  return base;
}
