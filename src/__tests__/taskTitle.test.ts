/**
 * Titles of system-generated tasks.
 *
 * Onboarding mirrors its steps onto the shared board, and those titles were
 * written in English when the programme started — so a Russian board read
 * "[Onboarding] Prepare workplace and access badge" among translated columns.
 * These tests cover both halves of the fix: rows that carry a key, and rows
 * created before the key existed which are matched on their stored English.
 */

import { describe, it, expect } from '@jest/globals';
import type { TFunction } from 'i18next';

import { localizedTaskTitle } from '@/lib/taskTitle';

/** Stands in for i18next: a small dictionary, falling back to the given default. */
const RU: Record<string, string> = {
  'tasks.onboardingPrefix': 'Онбординг',
  'onboarding.defaultTasks.default_workplace': 'Подготовить рабочее место и пропуск',
  'onboarding.defaultTasks.default_paperwork': 'Подписать документы о трудоустройстве',
};

const t = ((key: string, fallback?: string) => RU[key] ?? fallback ?? key) as unknown as TFunction;

describe('localizedTaskTitle', () => {
  it('translates a task that carries its key', () => {
    expect(
      localizedTaskTitle(t, {
        title: '[Onboarding] Prepare workplace and access badge',
        titleKey: 'onboarding.defaultTasks.default_workplace',
      }),
    ).toBe('Онбординг: Подготовить рабочее место и пропуск');
  });

  it('translates a task created before the key existed', () => {
    expect(
      localizedTaskTitle(t, { title: '[Onboarding] Prepare workplace and access badge' }),
    ).toBe('Онбординг: Подготовить рабочее место и пропуск');
  });

  it('covers the rest of the built-in checklist', () => {
    expect(localizedTaskTitle(t, { title: '[Onboarding] Sign employment paperwork' })).toBe(
      'Онбординг: Подписать документы о трудоустройстве',
    );
  });

  it('leaves a task somebody typed themselves alone', () => {
    expect(localizedTaskTitle(t, { title: 'Позвонить в банк' })).toBe('Позвонить в банк');
  });

  it('keeps wording it does not recognise, with the prefix translated', () => {
    // A template an organization wrote itself: the words are theirs, but the
    // prefix is ours and should still read in the reader's language.
    expect(localizedTaskTitle(t, { title: '[Onboarding] Order a company car' })).toBe(
      'Онбординг: Order a company car',
    );
  });

  it('falls back to the stored text when the translation is missing', () => {
    expect(
      localizedTaskTitle(t, {
        title: '[Onboarding] Introduce to the team',
        titleKey: 'onboarding.defaultTasks.default_team_intro',
      }),
    ).toBe('Онбординг: Introduce to the team');
  });

  it('does not double the prefix on a keyed task', () => {
    const out = localizedTaskTitle(t, {
      title: '[Onboarding] Prepare workplace and access badge',
      titleKey: 'onboarding.defaultTasks.default_workplace',
    });
    expect(out.match(/Онбординг/g)).toHaveLength(1);
    expect(out).not.toContain('[Onboarding]');
  });

  it('treats a null key like an absent one', () => {
    expect(localizedTaskTitle(t, { title: 'Обычная задача', titleKey: null })).toBe(
      'Обычная задача',
    );
  });
});
