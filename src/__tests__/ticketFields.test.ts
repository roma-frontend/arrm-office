/**
 * Tests for the shared ticket field definitions.
 *
 * The literal union was written out in the table, in the mutation arguments and
 * as a cast in each wizard. The copies drifted: the help wizard offered
 * `account` and `feature`, which the server rejects, and the cast hid it from
 * the compiler, so filing a ticket failed with an ArgumentValidationError. These
 * tests hold the single definition in place.
 */

import { describe, it, expect } from '@jest/globals';
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  isTicketCategory,
  isTicketPriority,
  ticketCategoryValidator,
  ticketPriorityValidator,
} from '../../convex/lib/ticketFields';

/** The literals a validator union accepts, read back off the validator itself. */
function literalsOf(validator: unknown): string[] {
  const members = (validator as { members?: { value?: unknown }[] }).members ?? [];
  return members.map((m) => String(m.value)).sort();
}

describe('ticket categories', () => {
  it('lists exactly what the server validator accepts', () => {
    expect([...TICKET_CATEGORIES].sort()).toEqual(literalsOf(ticketCategoryValidator));
  });

  it('accepts every listed category', () => {
    for (const category of TICKET_CATEGORIES) {
      expect(isTicketCategory(category)).toBe(true);
    }
  });

  it('rejects the values the wizard used to send', () => {
    // The exact pair that produced the runtime failure.
    expect(isTicketCategory('account')).toBe(false);
    expect(isTicketCategory('feature')).toBe(false);
  });

  it('rejects non-strings and object members', () => {
    expect(isTicketCategory(undefined)).toBe(false);
    expect(isTicketCategory(null)).toBe(false);
    expect(isTicketCategory(7)).toBe(false);
    // `in` would find inherited members; a prototype key must not pass.
    expect(isTicketCategory('toString')).toBe(false);
    expect(isTicketCategory('constructor')).toBe(false);
  });
});

describe('ticket priorities', () => {
  it('lists exactly what the server validator accepts', () => {
    expect([...TICKET_PRIORITIES].sort()).toEqual(literalsOf(ticketPriorityValidator));
  });

  it('accepts every listed priority and nothing else', () => {
    for (const priority of TICKET_PRIORITIES) {
      expect(isTicketPriority(priority)).toBe(true);
    }
    expect(isTicketPriority('urgent')).toBe(false);
    expect(isTicketPriority('')).toBe(false);
  });
});
