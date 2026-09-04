/**
 * True for the email-shaped accounts used by internal automations (HR
 * Assistant bot, future moderation bots, etc.) — anything that lives under
 * the `.internal` namespace.
 *
 * These accounts:
 * - Must NOT appear as employees in any UI or listing.
 * - Must NOT receive leave approvals, notifications (other than chat), or
 *   any other human-facing workflow.
 * - May still be chat senders / channel owners.
 */
export function isSystemAccountEmail(email: string | undefined | null): boolean {
  return !!email && email.endsWith('.internal');
}
