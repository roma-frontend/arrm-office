/**
 * Tests for chatWidgetUtils — pure helpers for the AI chat widget.
 *
 * Covers parseActions (valid/invalid/missing <ACTION> tags), follow-up
 * suggestion routing by keyword and role, and initial suggestions.
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('@/lib/aiAssistant', () => ({
  getRoleSuggestions: (role: string) => [`role:${role}:one`, `role:${role}:two`],
}));

import {
  parseActions,
  getFollowUpSuggestions,
  getInitialSuggestions,
  LEAVE_TYPE_LABELS,
} from '@/components/ai/chatWidgetUtils';

const t = (key: string) => key;

describe('parseActions', () => {
  it('returns the content unchanged when there are no actions', () => {
    expect(parseActions('hello world')).toEqual({ cleanContent: 'hello world', actions: [] });
  });

  it('parses a single action and strips it from the content', () => {
    const content = 'Please do this <ACTION>{"type":"leave","days":2}</ACTION> thanks';
    const { cleanContent, actions } = parseActions(content);
    expect(actions).toEqual([{ type: 'leave', days: 2 }]);
    expect(cleanContent).toBe('Please do this thanks');
  });

  it('parses multiple actions', () => {
    const content =
      '<ACTION>{"type":"a"}</ACTION> text <ACTION>{"type":"b"}</ACTION> more <ACTION>{"type":"c"}</ACTION>';
    const { actions } = parseActions(content);
    expect(actions).toEqual([{ type: 'a' }, { type: 'b' }, { type: 'c' }]);
  });

  it('skips invalid JSON inside action tags', () => {
    const content = '<ACTION>not json</ACTION> rest';
    const { cleanContent, actions } = parseActions(content);
    expect(actions).toEqual([]);
    expect(cleanContent).toBe('rest');
  });

  it('handles empty action bodies', () => {
    const content = '<ACTION></ACTION> x';
    const { cleanContent, actions } = parseActions(content);
    expect(actions).toEqual([]);
    expect(cleanContent).toBe('x');
  });

  it('collapses multiple spaces in cleaned content', () => {
    const content = '<ACTION>{"a":1}</ACTION>  spaced    out ';
    const { cleanContent } = parseActions(content);
    expect(cleanContent).toBe('spaced out');
  });
});

describe('getFollowUpSuggestions', () => {
  it('returns leave-related suggestions when content mentions booking', () => {
    const suggestions = getFollowUpSuggestions('Can I book a vacation?', 'user', t);
    expect(suggestions).toContain('chatWidget.showBalance');
    expect(suggestions).toContain('chatWidget.viewUpcoming');
    expect(suggestions).toContain('chatWidget.whoOnLeave');
  });

  it('returns leave suggestions when content mentions submitted or approved', () => {
    expect(getFollowUpSuggestions('my request was approved', 'user', t)).toContain(
      'chatWidget.showBalance',
    );
    expect(getFollowUpSuggestions('request submitted', 'user', t)).toContain(
      'chatWidget.showBalance',
    );
  });

  it('returns balance suggestions when content mentions balance', () => {
    const suggestions = getFollowUpSuggestions('show my balance', 'user', t);
    expect(suggestions).toContain('📆 Book a vacation');
    expect(suggestions).toContain('📊 Show my leave history');
  });

  it('returns sick leave suggestions when content mentions doctor', () => {
    const suggestions = getFollowUpSuggestions('I need a doctor visit', 'user', t);
    expect(suggestions).toContain('🤒 Book sick leave for today');
    expect(suggestions).toContain('👨‍⚕️ Book a doctor visit');
  });

  it('returns team suggestions when content mentions a colleague', () => {
    const suggestions = getFollowUpSuggestions('who is on my team', 'user', t);
    expect(suggestions).toContain('📅 Show team calendar');
  });

  it('returns pending leaves suggestions when content mentions cancel', () => {
    const suggestions = getFollowUpSuggestions('cancel my leave', 'user', t);
    expect(suggestions).toContain('📋 Show my pending leaves');
  });

  it('returns admin suggestions for admin role', () => {
    const suggestions = getFollowUpSuggestions('anything', 'admin', t);
    expect(suggestions).toContain('chatWidget.whoOnLeaveToday');
    expect(suggestions).toContain('chatWidget.teamStats');
    expect(suggestions).toContain('chatWidget.pendingApprovals');
  });

  it('returns admin suggestions for supervisor role', () => {
    const suggestions = getFollowUpSuggestions('anything', 'supervisor', t);
    expect(suggestions).toContain('chatWidget.teamStats');
  });

  it('returns generic suggestions for regular users by default', () => {
    const suggestions = getFollowUpSuggestions('hello there', 'employee', t);
    expect(suggestions).toContain('📆 Book a vacation');
    expect(suggestions).toContain('chatWidget.showBalance');
    expect(suggestions).toContain('👥 Who is on leave this week?');
  });
});

describe('getInitialSuggestions', () => {
  it('returns default suggestions when no role is provided', () => {
    const suggestions = getInitialSuggestions(undefined, t);
    expect(suggestions).toHaveLength(4);
    expect(suggestions).toContain('chatWidget.showBalance');
    expect(suggestions).toContain('chatWidget.bookVacation');
  });

  it('delegates to getRoleSuggestions when a role is provided', () => {
    const suggestions = getInitialSuggestions('manager', t);
    expect(suggestions).toEqual(['role:manager:one', 'role:manager:two']);
  });
});

describe('LEAVE_TYPE_LABELS', () => {
  it('maps every leave type to a label', () => {
    expect(LEAVE_TYPE_LABELS.paid).toContain('Paid Leave');
    expect(LEAVE_TYPE_LABELS.sick).toContain('Sick Leave');
    expect(LEAVE_TYPE_LABELS.family).toContain('Family Leave');
    expect(LEAVE_TYPE_LABELS.unpaid).toContain('Unpaid Leave');
    expect(LEAVE_TYPE_LABELS.doctor).toContain('Doctor Visit');
  });
});
