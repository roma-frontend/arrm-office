#!/usr/bin/env node
/**
 * Audits t('…') usage against the locale files.
 *
 * Reports two failure modes that surface at runtime as i18next warnings or raw
 * keys on screen:
 *   1. object  — the key resolves to a group, so i18next logs
 *                "returned an object instead of string" and renders nothing.
 *   2. missing — the key exists in no namespace. With a literal fallback the UI
 *                shows untranslated English in every language; without one it
 *                shows the raw key.
 *
 * Usage:
 *   node scripts/check-i18n-keys.mjs            # report everything
 *   node scripts/check-i18n-keys.mjs src/components/goals
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const LOCALES_DIR = 'public/locales';
const LANG = 'en'; // EN is the complete reference; parity is checked separately.
const ROOTS = process.argv.slice(2).length ? process.argv.slice(2) : ['src'];

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (['.ts', '.tsx'].includes(extname(entry))) files.push(full);
  }
  return files;
}

function loadNamespaces() {
  const dir = join(LOCALES_DIR, LANG);
  const bundles = {};
  for (const file of readdirSync(dir)) {
    if (extname(file) !== '.json') continue;
    bundles[file.replace(/\.json$/, '')] = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  }
  return bundles;
}

function lookup(bundle, path) {
  let node = bundle;
  for (const part of path.split('.')) {
    if (node === null || typeof node !== 'object' || !(part in node)) return undefined;
    node = node[part];
  }
  return node;
}

/** i18next JSON v4 plural suffixes. */
const PLURAL_SUFFIXES = ['zero', 'one', 'two', 'few', 'many', 'other'];

/**
 * A key called as `t('x.y', { count })` is stored as `x.y_one` / `x.y_other`,
 * so the plain key is absent by design — without this the report listed every
 * pluralized key as missing.
 */
function lookupWithPlurals(bundle, path) {
  const direct = lookup(bundle, path);
  if (direct !== undefined) return direct;
  for (const suffix of PLURAL_SUFFIXES) {
    const plural = lookup(bundle, `${path}_${suffix}`);
    if (plural !== undefined) return plural;
  }
  return undefined;
}

/**
 * Mirrors the app's runtime resolution: an explicit `ns:key` prefix wins,
 * otherwise every namespace is tried (the app sets fallbackNS to all of them).
 */
function resolve(bundles, key) {
  if (key.includes(':')) {
    const [ns, rest] = key.split(':', 2);
    return bundles[ns] ? lookupWithPlurals(bundles[ns], rest) : undefined;
  }
  for (const bundle of Object.values(bundles)) {
    const found = lookupWithPlurals(bundle, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

// t('key'), t('key', 'fallback'), t('key', { … }) — single-quoted or double.
// Template literals and computed keys are skipped: they cannot be checked here.
const T_CALL = /\bt\(\s*(['"])([^'"`\\]+?)\1\s*(\)|,)/g;

const bundles = loadNamespaces();
const files = ROOTS.flatMap((root) => (statSync(root).isDirectory() ? walk(root) : [root]));

const objectHits = [];
const missingHits = [];

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  // Scanned as one string, not line by line: t(…) calls are commonly wrapped
  // across lines by the formatter, and a per-line regex misses those.
  for (const match of source.matchAll(T_CALL)) {
    const key = match[2];
    // Skip things that are plainly not i18n keys (urls, sentences, css).
    if (!/^[A-Za-z][\w:.-]*$/.test(key) || !key.includes('.')) continue;
    const value = resolve(bundles, key);
    const line = source.slice(0, match.index).split('\n').length;
    const where = `${file}:${line}`;
    if (value === undefined) missingHits.push({ where, key });
    else if (typeof value === 'object') {
      // `returnObjects: true` asks for the group on purpose (feature lists and
      // similar), so it is not the bug this check looks for.
      const callTail = source.slice(match.index, match.index + 200);
      if (!callTail.includes('returnObjects')) objectHits.push({ where, key });
    }
  }
}

const report = (title, hits) => {
  if (hits.length === 0) return;
  console.log(`\n${title} (${hits.length}):`);
  for (const hit of hits) console.log(`  ${hit.where}  ${hit.key}`);
};

report('Keys resolving to an object', objectHits);
report('Keys missing from every namespace', missingHits);

if (objectHits.length === 0 && missingHits.length === 0) {
  console.log(`✓ All checked t() keys resolve to strings in ${LANG}.`);
} else {
  console.log(
    `\n${objectHits.length} object key(s), ${missingHits.length} missing key(s) in ${files.length} files.`,
  );
}

// Object keys are always bugs; missing keys are reported but may be intentional
// when a literal fallback is passed, so only the former fails the check.
process.exit(objectHits.length > 0 ? 1 : 0);
