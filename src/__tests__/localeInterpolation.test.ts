/**
 * Locale interpolation hygiene.
 *
 * `scripts/check-locale-parity.mjs` guarantees the four locales hold the same
 * *keys*. This suite guards the layer below that: the `{{...}}` placeholders
 * inside the values.
 *
 * Two real bugs shipped to production before this existed:
 *
 *  1. A JavaScript ternary was written inside a placeholder —
 *     `Starts at {{startTime}}.{{platform ? " Platform: " + platform : ""}}`.
 *     i18next does not evaluate expressions; it looks for a variable literally
 *     named `platform ? " Platform: " + platform : ""`, finds nothing, and
 *     prints the whole thing verbatim. Users saw the source code in their
 *     notification bell. Conditional text needs two keys, not a ternary.
 *
 *  2. Translations invented placeholders the English source never had
 *     (`de.tasks.tasksClient.total` = "Insgesamt {{count}} Aufgaben" while the
 *     caller is `t('tasksClient.total')` with no params). Nobody supplies
 *     `count`, so German users saw a literal `{{count}}`. English being the
 *     reference locale, its placeholder set is the contract every translation
 *     has to stay inside.
 */
import fs from 'node:fs';
import path from 'node:path';

const LOCALES_ROOT = path.join(process.cwd(), 'public', 'locales');
const REFERENCE = 'en';
const TARGETS = ['ru', 'hy', 'de'] as const;

/** Mirrors the namespace list in scripts/check-locale-parity.mjs. */
const NAMESPACES = [
  'common',
  'landing',
  'auth',
  'dashboard',
  'leaves',
  'tasks',
  'employees',
  'chat',
  'admin',
  'drivers',
  'settings',
  'modules',
  'payroll',
  'compensation',
  'learning',
  'expenses',
] as const;

type Json = { [key: string]: unknown };

function flatten(obj: Json, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(out, flatten(value as Json, next));
    } else if (typeof value === 'string') {
      out[next] = value;
    }
  }
  return out;
}

function loadNamespace(lang: string, ns: string): Record<string, string> {
  const file = path.join(LOCALES_ROOT, lang, `${ns}.json`);
  return flatten(JSON.parse(fs.readFileSync(file, 'utf8')) as Json);
}

const PLACEHOLDER = /\{\{\s*([^}]+?)\s*\}\}/g;

/**
 * Variable names referenced by a string. `{{count, number}}` is i18next's
 * formatter syntax, so only the part before the comma is the variable.
 */
function placeholdersOf(value: string): Set<string> {
  const found = new Set<string>();
  for (const match of value.matchAll(PLACEHOLDER)) {
    const name = match[1];
    if (name) found.add(name.split(',')[0]!.trim());
  }
  return found;
}

/** `chat.newMessages_few` and `chat.newMessages` share one placeholder contract. */
function pluralBase(key: string): string {
  return key.replace(/_(?:ordinal_)?(zero|one|two|few|many|other)$/, '');
}

/**
 * Characters that only appear in a placeholder if someone tried to write code
 * where a variable name belongs. Dots are legal (`{{user.name}}` resolves a
 * nested param), so they are not listed here.
 */
const EXPRESSION_CHARS = /[?+|&:'"()[\]]/;

const ALL_LOCALES = [REFERENCE, ...TARGETS];

describe('locale interpolation hygiene', () => {
  it.each(ALL_LOCALES)('%s contains no expressions inside placeholders', (lang) => {
    const offenders: string[] = [];

    for (const ns of NAMESPACES) {
      for (const [key, value] of Object.entries(loadNamespace(lang, ns))) {
        for (const match of value.matchAll(PLACEHOLDER)) {
          const name = match[1] ?? '';
          if (EXPRESSION_CHARS.test(name)) {
            offenders.push(`${lang}/${ns}.json → ${key}: ${match[0]}`);
          }
        }
      }
    }

    // i18next prints an unresolved placeholder verbatim, so an expression here
    // leaks source code into the UI. Use two keys and pick one in code instead.
    expect(offenders).toEqual([]);
  });

  it.each(TARGETS)('%s references no placeholder missing from the English source', (lang) => {
    const offenders: string[] = [];

    for (const ns of NAMESPACES) {
      const reference = loadNamespace(REFERENCE, ns);

      // Collect per base key so a plural form may use any variable that any of
      // the English plural forms uses.
      const allowed = new Map<string, Set<string>>();
      for (const [key, value] of Object.entries(reference)) {
        const base = pluralBase(key);
        const set = allowed.get(base) ?? new Set<string>();
        for (const name of placeholdersOf(value)) set.add(name);
        allowed.set(base, set);
      }

      for (const [key, value] of Object.entries(loadNamespace(lang, ns))) {
        const permitted = allowed.get(pluralBase(key));
        if (!permitted) continue; // key parity is check-locale-parity.mjs's job
        const extra = [...placeholdersOf(value)].filter((name) => !permitted.has(name));
        if (extra.length > 0) {
          offenders.push(
            `${lang}/${ns}.json → ${key}: unknown ${extra.map((n) => `{{${n}}}`).join(', ')}` +
              ` (en provides ${[...permitted].map((n) => `{{${n}}}`).join(', ') || 'no params'})`,
          );
        }
      }
    }

    // Callers pass the params the English string asks for. Anything extra is
    // never supplied and renders as literal braces for that language only.
    expect(offenders).toEqual([]);
  });

  it('keeps the meeting reminder split into with- and without-platform keys', () => {
    // Regression guard for the ternary bug: the platform name has to live in a
    // separate key so each language decides where it goes in the sentence.
    for (const lang of ALL_LOCALES) {
      const messages = loadNamespace(lang, 'common');
      const plain = messages['notifications.messages.roomMeetingReminder'];
      const withPlatform = messages['notifications.messages.roomMeetingReminderWithPlatform'];

      expect(plain).toBeDefined();
      expect(withPlatform).toBeDefined();
      expect([...placeholdersOf(plain!)]).not.toContain('platform');
      expect([...placeholdersOf(withPlatform!)]).toContain('platform');
    }
  });
});
