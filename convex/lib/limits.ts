/**
 * Hard caps for bounded Convex reads.
 *
 * Convex enforces a hard limit of 16384 documents per query invocation.
 * Using explicit `.take(N)` with a sane cap keeps memory predictable and
 * prevents silent slow queries as tenants grow.
 *
 * Use the smallest cap that still matches the UX contract for the call-site:
 *   - SMALL_LIST_CAP   — per-user / per-entity subsets (comments, children)
 *   - DEFAULT_LIST_CAP — most list-views (tasks, leaves, documents per org)
 *   - XLARGE_LIST_CAP  — admin-only reports; use sparingly
 *
 * See docs/PAGINATE_MIGRATION_PLAN.md §3.1 for context.
 */

/** Per-user / per-entity bounded reads (comments on a task, children of a parent). */
export const SMALL_LIST_CAP = 500;

/** Default cap for org-scoped list-views. Covers 99% of organizations. */
export const DEFAULT_LIST_CAP = 2000;

/** Admin-only reports / exports. Use sparingly — memory footprint is significant. */
export const XLARGE_LIST_CAP = 8000;

/**
 * Maximum number of employees allowed per subscription plan.
 *
 * This is the single source of truth for seat enforcement. Whenever an
 * organization's `plan` changes (via Stripe webhook, manual superadmin
 * assignment, or admin update) the organization's `employeeLimit` MUST be set
 * from this map so plan and seat-limit never drift apart.
 */
export const PLAN_EMPLOYEE_LIMITS: Record<'starter' | 'professional' | 'enterprise', number> = {
  starter: 10,
  professional: 50,
  enterprise: 999999,
};
