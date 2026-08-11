import { getRoleSuggestions, type UserRole } from '@/lib/aiAssistant';
import type { AnyAction } from './chatWidgetTypes';

export function parseActions(content: string): { cleanContent: string; actions: AnyAction[] } {
  const actionMatches = [...content.matchAll(/<ACTION>([\s\S]*?)<\/ACTION>/g)];
  if (actionMatches.length === 0) return { cleanContent: content, actions: [] };

  const actions: AnyAction[] = [];
  for (const match of actionMatches) {
    try {
      const actionStr = match[1]?.trim();
      if (actionStr) {
        const action = JSON.parse(actionStr) as AnyAction;
        actions.push(action);
      }
    } catch {
      // skip invalid JSON
    }
  }

  // Runs of spaces left where a tag used to sit are collapsed, but only mid-line
  // and never across newlines. This used to be `\s{2,}` → ' ', which flattened
  // every newline in the reply — so any answer carrying an <ACTION> tag lost all
  // of its markdown structure (tables, lists, headings) and arrived as one
  // run-on paragraph. Leading whitespace is left alone so nested list
  // indentation survives.
  const cleanContent = content
    .replace(/<ACTION>[\s\S]*?<\/ACTION>/g, '')
    .replace(/([^\n \t])[ \t]{2,}/g, '$1 ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { cleanContent, actions };
}

export function getFollowUpSuggestions(
  content: string,
  userRole: string,
  t: (key: string) => string,
): string[] {
  const lower = content.toLowerCase();

  if (
    lower.includes('book') ||
    lower.includes(t('chatWidget.leaveRequest')) ||
    lower.includes('submitted') ||
    lower.includes('approved')
  ) {
    return [t('chatWidget.showBalance'), t('chatWidget.viewUpcoming'), t('chatWidget.whoOnLeave')];
  }
  if (lower.includes('balance') || lower.includes('days left') || lower.includes('remaining')) {
    return ['📆 Book a vacation', '🤒 Request sick leave', '📊 Show my leave history'];
  }
  if (lower.includes('sick') || lower.includes('doctor') || lower.includes('medical')) {
    return ['🤒 Book sick leave for today', '👨‍⚕️ Book a doctor visit', t('chatWidget.showBalance')];
  }
  if (lower.includes('team') || lower.includes('colleague') || lower.includes('who is')) {
    return ['📅 Show team calendar', '📋 My leave balance', '📆 Book time off'];
  }
  if (lower.includes('cancel') || lower.includes('delete') || lower.includes('removed')) {
    return ['📋 Show my pending leaves', '📆 Book new leave', '📊 My leave balance'];
  }
  if (userRole === 'admin' || userRole === 'supervisor') {
    return [
      t('chatWidget.whoOnLeaveToday'),
      t('chatWidget.teamStats'),
      t('chatWidget.pendingApprovals'),
    ];
  }
  return ['📆 Book a vacation', t('chatWidget.showBalance'), '👥 Who is on leave this week?'];
}

export const LEAVE_TYPE_LABELS: Record<string, string> = {
  paid: '🏖️ Paid Leave',
  sick: '🤒 Sick Leave',
  family: '👨‍👩‍👧 Family Leave',
  unpaid: '💼 Unpaid Leave',
  doctor: '🏥 Doctor Visit',
};

export const getInitialSuggestions = (
  role: UserRole | undefined,
  t: (key: string) => string,
): string[] => {
  if (!role)
    return [
      t('chatWidget.showBalance'),
      t('chatWidget.bookVacation'),
      t('chatWidget.sickLeave'),
      t('chatWidget.whoOnLeaveWeek'),
    ];

  return getRoleSuggestions(role as UserRole, t);
};
