/**
 * Guards the notification type list against drift.
 *
 * `NOTIFICATION_TYPES` (convex/lib/notify.ts) is what the client uses at runtime
 * to decide whether a row was written by our own notifier, while the database
 * only accepts the union declared in the schema. If the two lists diverge, a
 * new notification type either gets rejected on insert or silently renders the
 * generic per-type label — so they are compared here instead of by review.
 */
import { describe, it, expect } from '@jest/globals';
import { NOTIFICATION_TYPES } from '../../convex/lib/notify';
import { notifications } from '../../convex/schema/notifications';

/** Pull the literal values out of the `type` union of the notifications table. */
function schemaTypes(): string[] {
  const table = notifications.notifications as unknown as {
    validator: { fields: Record<string, { members?: Array<{ value?: unknown }> }> };
  };
  const union = table.validator.fields.type;
  const members = union?.members ?? [];
  return members
    .map((member) => member.value)
    .filter((value): value is string => typeof value === 'string');
}

describe('notification types', () => {
  it('exposes the same set as the schema union', () => {
    const fromSchema = schemaTypes();
    expect(fromSchema.length).toBeGreaterThan(0);
    expect([...fromSchema].sort()).toEqual([...NOTIFICATION_TYPES].sort());
  });

  it('has no duplicates', () => {
    expect(new Set(NOTIFICATION_TYPES).size).toBe(NOTIFICATION_TYPES.length);
  });

  it('covers the offboarding lifecycle', () => {
    expect(NOTIFICATION_TYPES).toContain('offboarding_started');
    expect(NOTIFICATION_TYPES).toContain('offboarding_last_day_soon');
    expect(NOTIFICATION_TYPES).toContain('offboarding_completed');
  });
});
