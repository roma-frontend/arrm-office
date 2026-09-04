/**
 * Unit tests for the shared notification routing helper.
 *
 * Covers: special cases (security alert, support ticket), the row route winning
 * over the type map, the `?highlight=` parameter being added only for routes
 * whose page can consume it, query-string preservation, namespaced relatedIds,
 * and `notificationRoute` stripping the query.
 */

import {
  HIGHLIGHT_ROUTES,
  notificationRoute,
  notificationTarget,
  supportsHighlight,
  withHighlight,
} from '@/lib/notificationTarget';

describe('notificationTarget', () => {
  it('routes a security alert with a plain related id to its alert page', () => {
    expect(notificationTarget({ type: 'security_alert', relatedId: 'abc' })).toBe(
      '/superadmin/security/alert/abc',
    );
  });

  it('routes support tickets by role', () => {
    expect(
      notificationTarget({ type: 'system', relatedId: 'support_ticket:t1' }, 'superadmin'),
    ).toBe('/superadmin/support');
    expect(notificationTarget({ type: 'system', relatedId: 'support_ticket:t1' }, 'employee')).toBe(
      '/help',
    );
  });

  it('prefers the stored route over the type map, and falls back to null', () => {
    expect(notificationTarget({ type: 'leave_request', route: '/custom' })).toBe('/custom');
    expect(notificationTarget({ type: 'join_request' })).toBe('/join-requests');
    expect(notificationTarget({ type: 'unknown_type' })).toBeNull();
  });

  it.each(HIGHLIGHT_ROUTES)('adds the highlight parameter for %s', (route) => {
    expect(notificationTarget({ type: 'system', route, relatedId: 'id-1' })).toBe(
      `${route}?highlight=id-1`,
    );
  });

  it('highlights a leave request reached through the type map', () => {
    expect(notificationTarget({ type: 'leave_approved', relatedId: 'leave-9' })).toBe(
      '/leaves?highlight=leave-9',
    );
  });

  it('leaves routes that cannot consume the parameter untouched', () => {
    expect(notificationTarget({ type: 'employee_added', relatedId: 'emp-1' })).toBe('/employees');
    expect(notificationTarget({ type: 'announcement_published', relatedId: 'n-1' })).toBe('/news');
  });

  it('does not turn a namespaced related id into a highlight', () => {
    // `user:1` identifies a broader entity, not a row on the target page.
    expect(notificationTarget({ type: 'leave_request', relatedId: 'user:1' })).toBe('/leaves');
  });

  it('keeps a query string the stored route already carries', () => {
    expect(
      notificationTarget({ type: 'system', route: '/calendar?date=2026-09-04', relatedId: 'ev-1' }),
    ).toBe('/calendar?date=2026-09-04&highlight=ev-1');
  });

  it('does not highlight when there is no related id', () => {
    expect(notificationTarget({ type: 'leave_request' })).toBe('/leaves');
  });
});

describe('notificationRoute', () => {
  it('reports the module without the query string', () => {
    expect(notificationRoute({ type: 'leave_approved', relatedId: 'leave-9' })).toBe('/leaves');
    expect(notificationRoute({ type: 'unknown_type' })).toBeNull();
  });
});

describe('withHighlight / supportsHighlight', () => {
  it('replaces an existing highlight instead of appending a second one', () => {
    expect(withHighlight('/tasks?highlight=old', 'new')).toBe('/tasks?highlight=new');
  });

  it('recognises highlightable paths with or without a query', () => {
    expect(supportsHighlight('/tasks')).toBe(true);
    expect(supportsHighlight('/calendar?date=2026-09-04')).toBe(true);
    expect(supportsHighlight('/employees')).toBe(false);
  });
});
