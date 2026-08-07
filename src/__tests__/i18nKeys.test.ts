/**
 * Locale coverage for screens that regressed into English.
 *
 * Two failure modes are guarded, both of which shipped and neither of which the
 * existing tooling catches:
 *
 * 1. A key used in code but absent from every locale file. The inline fallback
 *    then renders in *every* language, so the screen looks right in English and
 *    silently broken elsewhere. `scripts/check-locale-parity.mjs` compares EN
 *    against ru/hy/de, so a key missing from EN too keeps parity and passes.
 *    This is how the tasks board shipped an "All Projects" / "Without project"
 *    filter beside fully translated "Все приоритеты" / "Все статусы" siblings.
 *
 * 2. A key that exists but holds the English string. Parity is by key, not by
 *    value, so a block of 12 keys sat in ru/modules.json with their English
 *    values verbatim ("Details", "Department", "Start Date"...) and the goal
 *    detail card mixed translated and untranslated labels.
 *
 * Namespaces are not a factor: `src/i18n/config.ts` passes `ns: [...allNamespaces]`,
 * so i18next preloads every namespace for the active language regardless of what
 * a component declares in useTranslation.
 *
 * Scoped to the screens below rather than the whole tree — `check-i18n-keys.mjs`
 * reports 229 missing keys repo-wide, a backlog to burn down separately rather
 * than something to gate on today.
 */
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const LOCALES = ['en', 'ru', 'hy', 'de'] as const;

const GUARDED: Record<string, string[]> = {
  '/strategy': [
    'src/app/(dashboard)/strategy/page.tsx',
    'src/components/strategy-map/AlignmentViewDashboard.tsx',
    'src/components/strategy-map/BalancedScorecardDashboard.tsx',
    'src/components/strategy-map/StrategyMapsClient.tsx',
  ],
  '/tasks': [
    'src/components/tasks/TasksClient.tsx',
    'src/components/tasks/TaskDetailClient.tsx',
    'src/components/tasks/NewTaskClient.tsx',
    'src/components/tasks/ProjectBadge.tsx',
  ],
  '/goals': ['src/components/GoalsClient.tsx', 'src/components/goals/GoalDetailClient.tsx'],
  // The whole hiringPacket group was absent from every locale file, so the
  // packet panel rendered its English defaults — button tooltips, the "required"
  // marker and the status badges — next to fully translated document titles.
  '/employees (hiring packet)': [
    'src/components/employees/HiringPacketPanel.tsx',
    'src/components/employees/AddEmployeeModal.tsx',
  ],
  // The bilingual document builder and the issued-document registry: both are
  // built entirely out of new keys, so a missing one is easy to overlook.
  '/documents (builder)': [
    'src/components/documents/BlueprintEditor.tsx',
    'src/components/documents/DocumentBuilderTab.tsx',
    'src/components/documents/IssuedDocumentsTab.tsx',
  ],
};

const FILES = Object.values(GUARDED).flat();

type Bundle = Record<string, unknown>;

const bundleCache = new Map<string, Bundle | null>();

function readNamespace(locale: string, ns: string): Bundle | null {
  const cacheKey = `${locale}/${ns}`;
  if (!bundleCache.has(cacheKey)) {
    const file = path.join(ROOT, 'public', 'locales', locale, `${ns}.json`);
    bundleCache.set(
      cacheKey,
      fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as Bundle) : null,
    );
  }
  return bundleCache.get(cacheKey)!;
}

function namespacesOf(locale: string): string[] {
  return fs
    .readdirSync(path.join(ROOT, 'public', 'locales', locale))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''));
}

/** i18next JSON v4 plural suffixes — a pluralized key never exists as a plain string. */
const PLURAL_SUFFIXES = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;

function lookup(bundle: Bundle | null, key: string): unknown {
  let cur: unknown = bundle;
  for (const part of key.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/**
 * A key written as `t('x.y', { count })` is stored as `x.y_one` / `x.y_other`,
 * so the plain key is absent by design. Any plural form counts as translated.
 */
function lookupString(bundle: Bundle | null, key: string): string | undefined {
  const direct = lookup(bundle, key);
  if (typeof direct === 'string') return direct;
  for (const suffix of PLURAL_SUFFIXES) {
    const plural = lookup(bundle, `${key}_${suffix}`);
    if (typeof plural === 'string') return plural;
  }
  return undefined;
}

/** Static keys, i.e. a literal single-quoted first argument to t(). Template
 *  literals are covered by the families below. */
function staticKeys(source: string): string[] {
  return [...source.matchAll(/\bt\(\s*'([a-zA-Z][\w.]*)'/g)].map((m) => m[1]);
}

/** Resolves like i18next does here: any preloaded namespace may own the key. */
function isTranslated(locale: string, key: string): boolean {
  return namespacesOf(locale).some(
    (ns) => lookupString(readNamespace(locale, ns), key) !== undefined,
  );
}

/** First string value for a key across a locale's namespaces. */
function resolve(locale: string, key: string): string | undefined {
  for (const ns of namespacesOf(locale)) {
    const value = lookupString(readNamespace(locale, ns), key);
    if (value !== undefined) return value;
  }
  return undefined;
}

const sources = new Map(
  FILES.map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')] as const),
);

describe('i18n key coverage', () => {
  describe.each(Object.keys(GUARDED))('%s', (route) => {
    it.each(LOCALES)('has no key falling back to its English default in %s', (locale) => {
      const missing = new Set<string>();

      for (const file of GUARDED[route]) {
        for (const key of staticKeys(sources.get(file)!)) {
          if (!isTranslated(locale, key)) missing.add(key);
        }
      }

      expect([...missing]).toEqual([]);
    });
  });

  /** Keys built with template literals, which the static scan cannot see. */
  const families: Record<string, string[]> = {
    'goals.level': ['company', 'team', 'individual'],
    'strategyMap.health': ['on_track', 'at_risk', 'behind', 'completed', 'draft'],
    'bsc.grade': ['excellent', 'good', 'fair', 'poor'],
    'bsc.perspective': ['financial', 'customer', 'internal', 'learning'],
  };

  it.each(LOCALES)('translates every dynamic key family in %s', (locale) => {
    const missing = Object.entries(families).flatMap(([prefix, variants]) =>
      variants.map((v) => `${prefix}.${v}`).filter((key) => !isTranslated(locale, key)),
    );

    expect(missing).toEqual([]);
  });

  /**
   * A key can exist and still be English: the goal detail page had a block of 12
   * keys in ru/modules.json holding their English values verbatim ("Details",
   * "Department", "Start Date"...), so the card mixed translated and untranslated
   * labels. Restricted to ru and hy — they use non-Latin scripts, so a real
   * translation is never byte-identical to the English source, whereas German
   * legitimately shares words like "Details", "Status" and "Team".
   */
  /**
   * Is this value language-neutral?
   *
   * A badge like `v{{version}}` is identical in every language, so comparing it
   * against EN would report a correct translation as missing. Anything with three
   * or more letters outside the interpolations is prose and must be translated.
   */
  function isLanguageNeutral(value: string): boolean {
    const letters = value.replace(/\{\{[^}]*\}\}/g, '').replace(/[^\p{L}]/gu, '');
    return letters.length < 3;
  }

  describe.each(['ru', 'hy'] as const)('%s', (locale) => {
    it.each(Object.keys(GUARDED))('holds no English value on %s', (route) => {
      const untranslated = new Set<string>();

      for (const file of GUARDED[route]) {
        for (const key of staticKeys(sources.get(file)!)) {
          const en = resolve('en', key);
          if (en === undefined || isLanguageNeutral(en)) continue;
          if (en === resolve(locale, key)) untranslated.add(key);
        }
      }

      expect([...untranslated]).toEqual([]);
    });
  });

  it('routes the BSC grade badge through t() instead of its hardcoded label', () => {
    // ScoreBadge rendered `{cfg.label}` directly and never called useTranslation,
    // so its grade was English in all four languages.
    const source = sources.get('src/components/strategy-map/BalancedScorecardDashboard.tsx')!;
    expect(source).toContain('t(`bsc.grade.${grade}`');
    expect(source).not.toMatch(/\{cfg\.label\}/);
  });

  it('keeps the project filter labels out of the English fallback path', () => {
    // The reported defect: both keys were absent from every locale file.
    for (const locale of LOCALES) {
      expect(isTranslated(locale, 'tasksClient.allProjects')).toBe(true);
      expect(isTranslated(locale, 'tasksClient.noProject')).toBe(true);
    }
    expect(lookup(readNamespace('ru', 'tasks'), 'tasksClient.allProjects')).toBe('Все проекты');
    expect(lookup(readNamespace('ru', 'tasks'), 'tasksClient.noProject')).toBe('Без проекта');
  });
});
