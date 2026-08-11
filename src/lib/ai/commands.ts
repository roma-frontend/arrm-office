/**
 * Pure, framework-agnostic helpers for the assistant composer: slash-command
 * registry/filtering and quick-action prompt templates. Kept free of React so
 * both chat UIs use it and Jest can unit-test it directly. Role-gating reuses
 * the same allow-lists as navigation.
 */

import { assistantRoutesForRole } from './assistantRoutes';
import type { UserRole } from '@/lib/aiAssistant';

export type SlashKind = 'navigate' | 'new' | 'clear' | 'memory';

export interface SlashCommand {
  id: string;
  kind: SlashKind;
  label: string;
  hint?: string;
  /** Route path for navigate commands; empty otherwise. */
  value?: string;
  /** Extra text folded into fuzzy matching (route path, aliases…). */
  keywords?: string;
}

export interface CommandLabels {
  /** route path -> human label, e.g. '/leaves' -> 'Мои отпуска'. */
  routes: Record<string, string>;
  newChat: string;
  clearChat: string;
  memory: string;
  /** Localized verb used in the command hint, e.g. 'Открыть'. */
  openVerb: string;
}

/**
 * Build the ordered slash-command list for a role: new/clear chat + memory,
 * then every navigable route. Labels come from the caller (the i18n dict) so
 * this stays pure and locale-agnostic.
 */
export function buildSlashCommands(role: UserRole, labels: CommandLabels): SlashCommand[] {
  const cmds: SlashCommand[] = [
    { id: 'new', kind: 'new', label: labels.newChat },
    { id: 'clear', kind: 'clear', label: labels.clearChat },
    { id: 'memory', kind: 'memory', label: labels.memory },
  ];
  for (const route of assistantRoutesForRole(role)) {
    const label = labels.routes[route] ?? route;
    cmds.push({
      id: `nav:${route}`,
      kind: 'navigate',
      label,
      hint: `${labels.openVerb} ${route}`,
      value: route,
      keywords: route,
    });
  }
  return cmds;
}

/**
 * Detect whether the composer is in slash-command mode. True only while the
 * whole input is a single '/token' (no spaces yet); returns the token after
 * '/' lower-cased for matching.
 */
export function parseSlashQuery(input: string): { active: boolean; query: string } {
  const m = /^\/(\S*)$/.exec(input);
  if (!m) return { active: false, query: '' };
  return { active: true, query: (m[1] ?? '').toLowerCase() };
}

/**
 * Fuzzy-filter commands: every whitespace-separated token of the query must
 * appear (substring) in the command's label/hint/keywords. Results whose label
 * starts with the query come first; otherwise original order is preserved.
 */
export function filterCommands(commands: SlashCommand[], query: string): SlashCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return commands;
  const tokens = q.split(/\s+/).filter(Boolean);
  const scored = commands
    .map((cmd, index) => {
      const hay = `${cmd.label} ${cmd.hint ?? ''} ${cmd.keywords ?? ''}`.toLowerCase();
      const ok = tokens.every((tk) => hay.includes(tk));
      if (!ok) return null;
      const starts = cmd.label.toLowerCase().startsWith(q) ? 0 : 1;
      return { cmd, index, starts };
    })
    .filter((x): x is { cmd: SlashCommand; index: number; starts: number } => x !== null)
    .sort((a, b) => a.starts - b.starts || a.index - b.index);
  return scored.map((s) => s.cmd);
}

export type QuickAction = 'shorter' | 'longer' | 'simplify' | 'translate' | 'continue';

export const QUICK_ACTIONS: QuickAction[] = [
  'shorter',
  'longer',
  'simplify',
  'translate',
  'continue',
];

export type AssistantLocale = 'en' | 'ru' | 'hy';

// Locale-specific follow-up prompts that operate on the assistant's previous
// answer. Deterministic so they can be unit-tested. `translate` targets the
// "other" major language (RU/HY -> English, EN -> Russian).
const PROMPTS: Record<AssistantLocale, Record<QuickAction, string>> = {
  ru: {
    shorter: 'Сократи предыдущий ответ — оставь только суть, без воды.',
    longer: 'Раскрой предыдущий ответ подробнее, добавь примеры и детали.',
    simplify: 'Объясни предыдущий ответ проще, простыми словами.',
    translate: 'Переведи предыдущий ответ на английский язык.',
    continue: 'Продолжи предыдущий ответ с того места, где остановился.',
  },
  en: {
    shorter: 'Make the previous answer shorter — keep only the essentials.',
    longer: 'Expand the previous answer with more detail and examples.',
    simplify: 'Explain the previous answer more simply, in plain language.',
    translate: 'Translate the previous answer into Russian.',
    continue: 'Continue the previous answer from where it stopped.',
  },
  hy: {
    shorter: 'Կրճատիր նախորդ պատասխանը՝ թողնելով միայն ամենակարևորը։',
    longer: 'Ընդլայնիր նախորդ պատասխանը՝ ավելի մանրամասն, օրինակներով։',
    simplify: 'Բացատրիր նախորդ պատասխանը ավելի պարզ, հասկանալի բառերով։',
    translate: 'Թարգմանիր նախորդ պատասխանը անգլերեն։',
    continue: 'Շարունակիր նախորդ պատասխանը այնտեղից, որտեղ կանգ առար։',
  },
};

export function quickActionPrompt(action: QuickAction, locale: AssistantLocale): string {
  return (PROMPTS[locale] ?? PROMPTS.en)[action];
}

/**
 * Push a sent message onto a bounded, de-duplicated input-history ring (newest
 * last). Consecutive duplicates collapse; capacity defaults to 50.
 */
export function pushInputHistory(history: string[], entry: string, cap = 50): string[] {
  const trimmed = entry.trim();
  if (!trimmed) return history;
  const withoutDup = history.filter((h) => h !== trimmed);
  const next = [...withoutDup, trimmed];
  return next.length > cap ? next.slice(next.length - cap) : next;
}
