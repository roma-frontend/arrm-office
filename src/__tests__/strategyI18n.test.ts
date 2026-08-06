/**
 * Guards the /strategy route against the namespace bug that left its cards in
 * English for non-English users.
 *
 * Only `common` and `landing` are bundled for ru/hy/de (see `src/i18n/config.ts`);
 * every other namespace is fetched on demand by HttpBackend. i18next only fetches
 * the namespaces a component *declares* in `useTranslation`, and `fallbackNS`
 * searches loaded bundles only. So a component calling a bare `useTranslation()`
 * can read `common` fine but silently falls back to bundled English for keys that
 * live anywhere else — which is what happened to every `goals.*` label here.
 *
 * The invariant: each key a file resolves must live in a namespace that file
 * declares.
 */
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const LOCALES = ['en', 'ru', 'hy', 'de'] as const;

/** Files rendering the /strategy route. */
const FILES = [
  'src/app/(dashboard)/strategy/page.tsx',
  'src/components/strategy-map/AlignmentViewDashboard.tsx',
  'src/components/strategy-map/BalancedScorecardDashboard.tsx',
  'src/components/strategy-map/StrategyMapsClient.tsx',
];

/** Namespaces bundled at build time for every language. */
const ALWAYS_BUNDLED = ['common', 'landing'];

type Bundle = Record<string, unknown>;

function readNamespace(locale: string, ns: string): Bundle | null {
  const file = path.join(ROOT, 'public', 'locales', locale, `${ns}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Bundle;
}

function namespacesOf(locale: string): string[] {
  const dir = path.join(ROOT, 'public', 'locales', locale);
  return fs
    .readdirSync(dir)
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

/** Static keys: t('a.b'). Template keys with `${}` are covered by their families below. */
function staticKeys(source: string): string[] {
  return [...source.matchAll(/\bt\(\s*'([a-zA-Z][\w.]*)'/g)].map((m) => m[1]);
}

/** Namespaces declared by useTranslation(...) in a file. Bare calls mean `common` only. */
function declaredNamespaces(source: string): string[] {
  const declared = new Set<string>();
  for (const m of source.matchAll(/useTranslation\(([^)]*)\)/g)) {
    const args = m[1].trim();
    if (args === '') {
      declared.add('common'); // defaultNS
      continue;
    }
    for (const q of args.matchAll(/'([^']+)'/g)) declared.add(q[1]);
  }
  return [...declared];
}

describe('/strategy i18n', () => {
  const sources = new Map(
    FILES.map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')] as const),
  );

  it.each(FILES)('%s resolves every key from a namespace it declares', (file) => {
    const source = sources.get(file)!;
    const declared = declaredNamespaces(source);
    const unreachable = staticKeys(source).filter(
      (key) => !declared.some((ns) => lookup(readNamespace('en', ns), key) !== undefined),
    );

    expect({ file, declared, unreachable }).toEqual({ file, declared, unreachable: [] });
  });

  it.each(FILES)('%s declares every non-bundled namespace it depends on', (file) => {
    const source = sources.get(file)!;
    const declared = declaredNamespaces(source);
    const all = namespacesOf('en');

    // A key only reachable through a lazily fetched namespace must have that
    // namespace declared, or it renders in English for ru/hy/de.
    const lazyOnly = staticKeys(source).filter((key) => {
      const bundled = ALWAYS_BUNDLED.some(
        (ns) => lookup(readNamespace('en', ns), key) !== undefined,
      );
      if (bundled) return false;
      const owners = all.filter((ns) => lookup(readNamespace('en', ns), key) !== undefined);
      return owners.length > 0 && !owners.some((ns) => declared.includes(ns));
    });

    expect({ file, lazyOnly }).toEqual({ file, lazyOnly: [] });
  });

  /** Key families built with template literals, which the static scan cannot see. */
  const families: Record<string, string[]> = {
    'goals.level': ['company', 'team', 'individual'],
    'strategyMap.health': ['on_track', 'at_risk', 'behind', 'completed', 'draft'],
    'bsc.grade': ['excellent', 'good', 'fair', 'poor'],
    'bsc.perspective': ['financial', 'customer', 'internal', 'learning'],
  };

  it.each(LOCALES)('%s translates every dynamic key family', (locale) => {
    const namespaces = namespacesOf(locale);
    const missing: string[] = [];

    for (const [prefix, variants] of Object.entries(families)) {
      for (const variant of variants) {
        const key = `${prefix}.${variant}`;
        const found = namespaces.some(
          (ns) => typeof lookup(readNamespace(locale, ns), key) === 'string',
        );
        if (!found) missing.push(key);
      }
    }

    expect(missing).toEqual([]);
  });

  it('translates the grade labels away from their English defaults', () => {
    // ScoreBadge used to render its hardcoded `label` directly, bypassing t().
    const source = sources.get('src/components/strategy-map/BalancedScorecardDashboard.tsx')!;
    expect(source).toContain('t(`bsc.grade.${grade}`');
    expect(source).not.toMatch(/\{cfg\.label\}/);

    for (const locale of ['ru', 'hy', 'de']) {
      const en = lookup(readNamespace('en', 'common'), 'bsc.grade.excellent');
      const translated = lookup(readNamespace(locale, 'common'), 'bsc.grade.excellent');
      expect(translated).toBeTruthy();
      expect(translated).not.toBe(en);
    }
  });
});
