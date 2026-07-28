/**
 * Locale parity test.
 *
 * Verifies that every translation key present in `public/locales/en/<ns>.json`
 * also exists in `ru`, `hy`, `de` for the same namespace, and vice versa.
 *
 * EN is the source of truth; any key missing from a non-EN locale will render
 * the raw key string in that language. Any key in a non-EN locale that doesn't
 * exist in EN is dead translation baggage — except for known intentional extras
 * such as locale-specific plural forms (i18next _one/_few/_many suffixes).
 *
 * Run:  npx jest locale-parity  (or  npm test -- --testPathPattern=locale-parity)
 */

import fs from 'node:fs';
import path from 'node:path';

// ── Config ──────────────────────────────────────────────────────────────

const LOCALES_DIR = path.join(process.cwd(), 'public', 'locales');
const REFERENCE = 'en';
const TARGETS = ['ru', 'hy', 'de'];

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
];

/** Flattened dotted paths that are intentionally absent from EN. */
const PRESERVED_EXTRAS = new Set([
  'chat.newMessages_one',
  'chat.newMessages_few',
  'chat.newMessages_many',
  'chat.thread.repliesCount_one',
  'chat.thread.repliesCount_few',
  'chat.thread.repliesCount_many',
]);

const PLURAL_SUFFIXES = [
  '_one',
  '_few',
  '_many',
  '_zero',
  '_two',
  '_three',
  '_four',
  '_five',
  '_six',
  '_seven',
  '_eight',
  '_nine',
  '_ten',
  '_other',
];

// ── Helpers ─────────────────────────────────────────────────────────────

/** Recursively flatten a nested translation object into dotted-path → leaf-value map. */
function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const next = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v as Record<string, unknown>, next));
    } else {
      out[next] = v;
    }
  }
  return out;
}

function loadNs(lang: string, ns: string): Record<string, unknown> | null {
  const file = path.join(LOCALES_DIR, lang, `${ns}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function isPluralForm(key: string): boolean {
  const last = key.split('.').pop() ?? key;
  return PLURAL_SUFFIXES.some((s) => last.endsWith(s));
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('Locale parity', () => {
  for (const ns of NAMESPACES) {
    const reference = loadNs(REFERENCE, ns);
    if (!reference) {
      it(`${ns}: EN reference exists`, () => {
        fail(`Missing reference file: ${REFERENCE}/${ns}.json`);
      });
      continue;
    }

    const refKeys = Object.keys(flatten(reference));

    for (const lang of TARGETS) {
      const target = loadNs(lang, ns);
      if (!target) {
        it(`${lang}/${ns}.json: file exists`, () => {
          fail(`Missing locale file: ${lang}/${ns}.json`);
        });
        continue;
      }

      const targetKeys = Object.keys(flatten(target));

      const refSet = new Set(refKeys);
      const tgtSet = new Set(targetKeys);

      // Missing in target (should be added)
      const missing = refKeys.filter((k) => !tgtSet.has(k));

      // Extra in target (should be removed) — except intentional ones
      const extra = targetKeys.filter(
        (k) => !refSet.has(k) && !PRESERVED_EXTRAS.has(k) && !isPluralForm(k),
      );

      if (missing.length > 0 || extra.length > 0) {
        it(`${lang}/${ns}.json has zero drift`, () => {
          const messages: string[] = [];
          if (missing.length > 0) {
            messages.push(
              `Missing keys (${missing.length}):\n${missing.map((k) => `  + ${k}`).join('\n')}`,
            );
          }
          if (extra.length > 0) {
            messages.push(
              `Extra keys (${extra.length}):\n${extra.map((k) => `  - ${k}`).join('\n')}`,
            );
          }
          fail(`Locale drift in ${lang}/${ns}.json:\n\n${messages.join('\n\n')}`);
        });
      } else {
        it(`${lang}/${ns}.json has zero drift`, () => {
          expect(true).toBe(true);
        });
      }
    }
  }
});
