/**
 * Locale coverage for screens that regressed into English.
 *
 * `t('a.b', 'English default')` renders the inline default in *every* language
 * when `a.b` is absent from the locale files. The screen therefore looks correct
 * in English and silently broken everywhere else, with no console warning and no
 * type error — nothing fails until someone looks at the UI in another language.
 * That is how the tasks board shipped an "All Projects" / "Without project"
 * filter sitting next to fully translated "Все приоритеты" / "Все статусы"
 * siblings, and how `strategyMap.doneTasks` stayed English on the alignment cards.
 *
 * Note on namespaces: `src/i18n/config.ts` passes `ns: [...allNamespaces]`, so
 * i18next preloads every namespace for the active language regardless of what a
 * component declares in `useTranslation`. A missing key is the real failure mode
 * here, not an undeclared namespace.
 *
 * Scoped to the screens below rather than the whole tree: a repo-wide sweep
 * currently reports ~196 keys missing from ru, which is a backlog to burn down
 * separately rather than something to gate on today.
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
  '/tasks': ['src/components/tasks/TasksClient.tsx'],
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

/** Static keys: t('a.b'). Template-literal keys are covered by the families below. */
function staticKeys(source: string): string[] {
  return [...source.matchAll(/\bt\(\s*'([a-zA-Z][\w.]*)'/g)].map((m) => m[1]);
}

/** Resolves like i18next does here: any preloaded namespace may own the key. */
function isTranslated(locale: string, key: string): boolean {
  return namespacesOf(locale).some(
    (ns) => typeof lookup(readNamespace(locale, ns), key) === 'string',
  );
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
