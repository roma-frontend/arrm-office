#!/usr/bin/env node
/**
 * Locale parity check.
 *
 * Verifies that every translation key present in `public/locales/en/<ns>.json`
 * also exists in `ru`, `hy`, `de` for the same namespace, and vice versa.
 *
 * EN is the source of truth (also bundled at runtime via src/i18n/config.ts);
 * any key missing from a non-EN locale will render the raw key string in that
 * language. Any key missing from EN means a non-EN locale has dead translations.
 *
 * Plurals are compared by their base key, because the set of CLDR plural
 * categories is language-specific: English needs `_one`/`_other`, Russian also
 * needs `_few`/`_many`. Comparing raw keys reported those legitimate Russian
 * forms as "extra". Instead we check what i18next actually resolves at runtime:
 *   - every plural suffix must be a valid category for that language,
 *   - for keys pluralized in EN, each of the target language's categories must
 *     resolve to either `key_<category>` or the bare `key` fallback.
 *
 * Exit codes:
 *   0 — all locales aligned
 *   1 — drift detected (printed as a diff, also fails CI)
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(process.cwd(), 'public', 'locales');
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

/** Flatten a nested translation object into a map of dotted-path → leaf value. */
function flatten(obj, prefix = '') {
  const out = {};
  for (const k of Object.keys(obj)) {
    const next = prefix ? `${prefix}.${k}` : k;
    const v = obj[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v, next));
    } else {
      out[next] = v;
    }
  }
  return out;
}

function loadNs(lang, ns) {
  const file = path.join(ROOT, lang, `${ns}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** i18next JSON v4 plural/ordinal suffixes. */
const PLURAL_SUFFIXES = ['zero', 'one', 'two', 'few', 'many', 'other'];

/**
 * Split `chat.newMessages_few` into `{ base: 'chat.newMessages', suffix: 'few' }`.
 * Non-plural keys yield `{ base: key, suffix: null }`.
 */
function splitPluralKey(key) {
  const match = key.match(/^(.*)_(?:ordinal_)?(zero|one|two|few|many|other)$/);
  if (!match) return { base: key, suffix: null };
  return { base: match[1], suffix: match[2], ordinal: key.includes('_ordinal_') };
}

/** CLDR plural categories a language actually uses (memoized). */
const categoriesCache = new Map();
function pluralCategories(lang) {
  if (!categoriesCache.has(lang)) {
    const cats = new Intl.PluralRules(lang).resolvedOptions().pluralCategories;
    categoriesCache.set(lang, new Set([...cats, 'other']));
  }
  return categoriesCache.get(lang);
}

/** Map base key → Set of suffixes present (`null` for the bare key). */
function groupByBase(keys) {
  const map = new Map();
  for (const key of keys) {
    const { base, suffix } = splitPluralKey(key);
    if (!map.has(base)) map.set(base, new Set());
    map.get(base).add(suffix);
  }
  return map;
}

let hasDrift = false;
const report = [];

for (const ns of NAMESPACES) {
  const reference = loadNs(REFERENCE, ns);
  if (!reference) {
    report.push(`✖ ${REFERENCE}/${ns}.json — missing reference file`);
    hasDrift = true;
    continue;
  }
  const refBases = groupByBase(Object.keys(flatten(reference)));

  for (const lang of TARGETS) {
    const target = loadNs(lang, ns);
    if (!target) {
      report.push(`✖ ${lang}/${ns}.json — missing locale file`);
      hasDrift = true;
      continue;
    }
    const targetKeys = Object.keys(flatten(target));
    const targetBases = groupByBase(targetKeys);
    const allowedSuffixes = pluralCategories(lang);

    const missingInTarget = [...refBases.keys()].filter((k) => !targetBases.has(k));
    const extraInTarget = [...targetBases.keys()].filter((k) => !refBases.has(k));

    // A plural suffix the language does not have is dead weight (and a typo
    // magnet): e.g. `_few` in German never resolves.
    const invalidPlurals = targetKeys.filter((key) => {
      const { suffix } = splitPluralKey(key);
      return suffix !== null && !allowedSuffixes.has(suffix);
    });

    // For keys pluralized in EN, every category of the target language must
    // resolve — either directly or through i18next's bare-key fallback.
    const unresolvedPlurals = [];
    for (const [base, refSuffixes] of refBases) {
      const isPlural = [...refSuffixes].some((s) => s !== null);
      const suffixes = targetBases.get(base);
      if (!isPlural || !suffixes || suffixes.has(null)) continue;
      for (const category of allowedSuffixes) {
        if (!suffixes.has(category)) unresolvedPlurals.push(`${base}_${category}`);
      }
    }

    if (
      missingInTarget.length ||
      extraInTarget.length ||
      invalidPlurals.length ||
      unresolvedPlurals.length
    ) {
      hasDrift = true;
      report.push(
        `\n${lang}/${ns}.json — drift: ${missingInTarget.length} missing, ` +
          `${extraInTarget.length} extra, ${invalidPlurals.length} invalid plural, ` +
          `${unresolvedPlurals.length} unresolved plural`,
      );
      if (missingInTarget.length) {
        report.push('  Missing (in EN, not in target):');
        for (const k of missingInTarget.slice(0, 20)) report.push(`    + ${k}`);
        if (missingInTarget.length > 20)
          report.push(`    … and ${missingInTarget.length - 20} more`);
      }
      if (extraInTarget.length) {
        report.push('  Extra (in target, not in EN):');
        for (const k of extraInTarget.slice(0, 20)) report.push(`    - ${k}`);
        if (extraInTarget.length > 20) report.push(`    … and ${extraInTarget.length - 20} more`);
      }
      if (invalidPlurals.length) {
        report.push(`  Invalid plural suffix for '${lang}' (never resolves at runtime):`);
        for (const k of invalidPlurals.slice(0, 20)) report.push(`    ! ${k}`);
      }
      if (unresolvedPlurals.length) {
        report.push(`  Missing plural form (no bare-key fallback either):`);
        for (const k of unresolvedPlurals.slice(0, 20)) report.push(`    ? ${k}`);
      }
    }
  }
}

if (hasDrift) {
  console.error('Locale drift detected:\n');
  console.error(report.join('\n'));
  console.error('\n');
  console.error('Fix by syncing keys across locales (EN is the reference).');
  process.exit(1);
}

console.warn(
  `✓ Locale parity OK across ${TARGETS.join(', ')} for ${NAMESPACES.length} namespaces.`,
);
