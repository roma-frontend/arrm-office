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

function lookup(bundle: Bundle | null, key: string): unknown {
  let cur: unknown = bundle;
  for (const part of key.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/** Static keys, i.e. a literal single-quoted first argument to t(). Template
 *  literals are covered by the families below. */
function staticKeys(source: string): string[] {
  return [...source.matchAll(/\bt\(\s*'([a-zA-Z][\w.]*)'/g)].map((m) => m[1]);
}

/** Resolves like i18next does here: any preloaded namespace may own the key. */
function isTranslated(locale: string, key: string): boolean {
  return namespacesOf(locale).some(
    (ns) => typeof lookup(readNamespace(locale, ns), key) === 'string',
  );
}

/** First string value for a key across a locale's namespaces. */
function resolve(locale: string, key: string): string | undefined {
  for (const ns of namespacesOf(locale)) {
    const value = lookup(readNamespace(locale, ns), key);
    if (typeof value === 'string') return value;
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
  describe.each(['ru', 'hy'] as const)('%s', (locale) => {
    it.each(Object.keys(GUARDED))('holds no English value on %s', (route) => {
      const untranslated = new Set<string>();

      for (const file of GUARDED[route]) {
        for (const key of staticKeys(sources.get(file)!)) {
          const en = resolve('en', key);
          if (en !== undefined && en === resolve(locale, key)) untranslated.add(key);
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
