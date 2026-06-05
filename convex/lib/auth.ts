/**
 * Shared auth helpers — env-driven superadmin bootstrap.
 *
 * SECURITY NOTE:
 *   Previously a hardcoded email (`romangulanyan@gmail.com`) granted
 *   superadmin powers anywhere in the codebase. That was a classic
 *   "account-as-backdoor" pattern: owning that Google/email account
 *   would mean owning the whole platform.
 *
 *   Now the source of truth is `users.role === 'superadmin'`.
 *   The env var `BOOTSTRAP_SUPERADMIN_EMAIL` is only used to identify
 *   the very first superadmin during initial org bootstrap (register flow).
 *   All runtime checks use the role in the DB.
 */
import type { QueryCtx, MutationCtx } from '../_generated/server';

/**
 * Read the bootstrap superadmin email from env (supports both
 * `BOOTSTRAP_SUPERADMIN_EMAIL` and legacy `SUPERADMIN_EMAIL`).
 *
 * In production this MUST be set; missing env will disable the
 * bootstrap path instead of silently falling back to a public email.
 */
function readBootstrapEmail(): string | null {
  const email = process.env.BOOTSTRAP_SUPERADMIN_EMAIL ?? process.env.SUPERADMIN_EMAIL ?? null;
  if (!email) return null;
  return email.toLowerCase().trim();
}

/**
 * The single source of truth for the superadmin bootstrap email.
 *
 * - In production: MUST be set via `BOOTSTRAP_SUPERADMIN_EMAIL`.
 *   If missing, returns `''` so bootstrap-path checks all fail — safe default.
 * - In development: same as production, no fallback hardcode.
 *
 * Most code should NOT use this — use `isSuperadmin(user)` against the DB role.
 */
export const SUPERADMIN_EMAIL = readBootstrapEmail() ?? '';

/**
 * Returns true if the given email matches the configured bootstrap email.
 * Only meaningful during initial registration of the very first superadmin.
 */
export function isSuperadminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  const target = readBootstrapEmail();
  if (!target) return false;
  return email.toLowerCase().trim() === target;
}

/**
 * Requires the caller to be authenticated (via Convex auth).
 * Returns the identity email (lowercased).
 */
export async function requireAuth(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity?.email) throw new Error('Not authenticated');
  return identity.email.toLowerCase();
}

/**
 * Resolves the authenticated user from ctx.auth (unforgeable JWT).
 * Returns the full user doc from the DB, or null if the user was deleted.
 * Use in queries so they gracefully return empty data instead of throwing
 * error boundaries when a temp user's access is revoked mid-session.
 */
export async function requireAuthUser(ctx: QueryCtx | MutationCtx) {
  const email = await requireAuth(ctx);
  const user = await ctx.db
    .query('users')
    .withIndex('by_email', (q) => q.eq('email', email))
    .unique();
  return user ?? null;
}

/**
 * Same as requireAuthUser but throws when the user is not found.
 * Use in mutations where the user MUST exist.
 */
export async function requireAuthUserOrThrow(ctx: QueryCtx | MutationCtx) {
  const user = await requireAuthUser(ctx);
  if (!user) throw new Error('User not found');
  return user;
}

/**
 * Preferred runtime check: does this user currently hold the superadmin role?
 *
 * @param user — user doc or minimal shape with role + email
 */
export function isSuperadmin(
  user:
    | {
        role?: string;
        email?: string;
      }
    | null
    | undefined,
): boolean {
  if (!user) return false;
  // Primary: role in DB is the source of truth
  if (user.role === 'superadmin') return true;
  // Fallback ONLY for bootstrap: if no superadmin exists yet, the env-pinned
  // email is allowed. This is used only by the register flow, not in runtime
  // permission checks on other mutations.
  return isSuperadminEmail(user.email);
}
