/**
 * Titles of tasks the system generated for itself.
 *
 * Onboarding mirrors every step into the shared task board, and it wrote those
 * titles in English at creation time: a Russian board showed "[Onboarding]
 * Prepare workplace and access badge" between columns and labels that were
 * translated, which reads as a bug rather than as a language gap.
 *
 * New rows carry `titleKey` and are simply translated. Rows created before the
 * key existed are matched on their stored English text — the built-in checklist
 * is a closed set, so this is exact for them, and anything else falls through to
 * the text as typed, which is the only correct answer for free-form input.
 */

import type { TFunction } from 'i18next';

const ONBOARDING_PREFIX = '[Onboarding] ';

/** English titles of the built-in onboarding checklist → blueprint key. */
const LEGACY_TITLE_TO_KEY: Record<string, string> = {
  'Sign employment paperwork': 'default_paperwork',
  'Create accounts and grant system access': 'default_accounts',
  'Hand over laptop and equipment': 'default_equipment',
  'Prepare workplace and access badge': 'default_workplace',
  'Introduce to the team': 'default_team_intro',
  'First meeting with the buddy': 'default_buddy_meeting',
  'Read internal policies and safety rules': 'default_policies',
  'Agree on goals for the probation period': 'default_goals',
  '30-day check-in': 'default_checkin_30',
};

export type TitledTask = {
  title: string;
  titleKey?: string | null;
};

/**
 * The task's title in the reader's language, prefixed as an onboarding step when
 * it is one.
 */
export function localizedTaskTitle(t: TFunction, task: TitledTask): string {
  const prefix = `${t('tasks.onboardingPrefix', 'Onboarding')}: `;

  if (task.titleKey) {
    // The default is the stored text, so a missing translation still reads.
    const stored = task.title.startsWith(ONBOARDING_PREFIX)
      ? task.title.slice(ONBOARDING_PREFIX.length)
      : task.title;
    return `${prefix}${t(task.titleKey, stored)}`;
  }

  if (task.title.startsWith(ONBOARDING_PREFIX)) {
    const english = task.title.slice(ONBOARDING_PREFIX.length);
    const key = LEGACY_TITLE_TO_KEY[english];
    return `${prefix}${key ? t(`onboarding.defaultTasks.${key}`, english) : english}`;
  }

  return task.title;
}
