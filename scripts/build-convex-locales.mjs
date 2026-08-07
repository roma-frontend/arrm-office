/**
 * Regenerates convex/lib/localeCatalog.ts from public/locales/<locale>/common.json.
 *
 * The Convex runtime cannot read files from disk, so the handful of translation
 * groups that server code needs (notification titles/messages, enum labels used
 * inside them) are compiled into a TypeScript literal.
 *
 * Usage:
 *   npm run build:convex-locales
 *   npm run build:convex-locales -- --check   # fail if the file is out of date
 *
 * Only the groups listed in GROUPS are copied — everything else stays
 * client-only. Keys are flattened with dots and sorted so the diff of a
 * regeneration shows real changes only.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES = ['en', 'ru', 'hy', 'de'];
const OUTPUT = join(ROOT, 'convex', 'lib', 'localeCatalog.ts');

/** Top-level groups of common.json that server-side code translates. */
const GROUPS = [
  'attendeeResponses',
  'incidentSeverities',
  'kudosCategories',
  'leaveTypes',
  'notifications',
  'roles',
  'ticket',
  'ticketPriorities',
  'ticketStatuses',
  'tripPriorities',
];

function flatten(value, prefix, out) {
  for (const [key, entry] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      flatten(entry, path, out);
    } else if (typeof entry === 'string') {
      out[path] = entry;
    }
  }
  return out;
}

function collect(locale) {
  const file = join(ROOT, 'public', 'locales', locale, 'common.json');
  const json = JSON.parse(readFileSync(file, 'utf8'));
  const flat = {};
  for (const group of GROUPS) {
    if (json[group] === undefined) continue;
    flatten({ [group]: json[group] }, '', flat);
  }
  // `localeCompare` (not codepoint order) — matches the ordering the checked-in
  // catalog was generated with, so a regeneration diff shows only real changes.
  return Object.fromEntries(Object.entries(flat).sort(([a], [b]) => a.localeCompare(b)));
}

const header = `/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Built from public/locales/<locale>/common.json by
 * scripts/build-convex-locales.mjs. Edit the locale JSON and re-run:
 *
 *   npm run build:convex-locales
 *
 * Holds only the groups Convex functions translate (see GROUPS in that script),
 * because the Convex runtime cannot read the locale files from disk.
 */

// prettier-ignore
export const LOCALE_CATALOG: Record<string, Record<string, string>> = {
`;

const blocks = LOCALES.map((locale) => {
  const entries = Object.entries(collect(locale));
  const lines = entries.map(
    ([key, value], index) =>
      `      ${JSON.stringify(key)}: ${JSON.stringify(value)}${index === entries.length - 1 ? '' : ','}`,
  );
  return `  ${locale}: {\n${lines.join('\n')}\n  },`;
});

const footer = `};

export type CatalogLocale = ${LOCALES.map((l) => `'${l}'`).join(' | ')};
`;

// No trailing extra newline: the file must stay prettier-clean (a blank line
// at EOF makes `prettier --check` in CI fail on the generated file).
const output = `${header}${blocks.join('\n')}\n${footer}`;

if (process.argv.includes('--check')) {
  const current = readFileSync(OUTPUT, 'utf8');
  if (current !== output) {
    console.error(
      '✗ convex/lib/localeCatalog.ts is out of date — run `npm run build:convex-locales`.',
    );
    process.exit(1);
  }
  console.log('✓ convex/lib/localeCatalog.ts is up to date.');
} else {
  writeFileSync(OUTPUT, output, 'utf8');
  const counts = LOCALES.map((l) => `${l}: ${Object.keys(collect(l)).length}`).join(', ');
  console.log(`✓ Wrote convex/lib/localeCatalog.ts (${counts}).`);
}
