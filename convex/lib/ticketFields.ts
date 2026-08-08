import { v } from 'convex/values';
import type { Infer } from 'convex/values';

/**
 * The one definition of a support ticket's category.
 *
 * The literal union used to be written out three times — in the table, in the
 * `createTicket` arguments, and as a cast in the wizard that submits the form —
 * and the copies drifted. The wizard offered `account` and `feature`, neither of
 * which the server accepts, and the cast in its submit handler told TypeScript
 * the value was already one of the accepted literals, so the mismatch only
 * surfaced as an `ArgumentValidationError` at the moment a user tried to file a
 * ticket.
 *
 * Everything now derives from here: the validator, the type, the list the UI
 * renders, and the guard that narrows form input.
 */
export const ticketCategoryValidator = v.union(
  v.literal('technical'),
  v.literal('billing'),
  v.literal('access'),
  v.literal('feature_request'),
  v.literal('bug'),
  v.literal('other'),
);

export type TicketCategory = Infer<typeof ticketCategoryValidator>;

/**
 * Keyed by the union, so the compiler rejects both a category missing from this
 * map and one that the validator does not accept. The order is the order the
 * pickers offer.
 */
const CATEGORY_PRESENCE: Record<TicketCategory, true> = {
  technical: true,
  bug: true,
  access: true,
  billing: true,
  feature_request: true,
  other: true,
};

export const TICKET_CATEGORIES = Object.keys(CATEGORY_PRESENCE) as TicketCategory[];

/**
 * Narrows unchecked input, e.g. a value coming back from a generic form.
 *
 * Own keys only: `in` would also answer for inherited members, so `toString`
 * would pass as a category.
 */
export function isTicketCategory(value: unknown): value is TicketCategory {
  return typeof value === 'string' && Object.hasOwn(CATEGORY_PRESENCE, value);
}

export const ticketPriorityValidator = v.union(
  v.literal('low'),
  v.literal('medium'),
  v.literal('high'),
  v.literal('critical'),
);

export type TicketPriority = Infer<typeof ticketPriorityValidator>;

const PRIORITY_PRESENCE: Record<TicketPriority, true> = {
  low: true,
  medium: true,
  high: true,
  critical: true,
};

export const TICKET_PRIORITIES = Object.keys(PRIORITY_PRESENCE) as TicketPriority[];

export function isTicketPriority(value: unknown): value is TicketPriority {
  return typeof value === 'string' && Object.hasOwn(PRIORITY_PRESENCE, value);
}
