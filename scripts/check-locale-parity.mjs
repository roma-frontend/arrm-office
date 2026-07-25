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

let hasDrift = false;
const report = [];

for (const ns of NAMESPACES) {
  const reference = loadNs(REFERENCE, ns);
  if (!reference) {
    report.push(`✖ ${REFERENCE}/${ns}.json — missing reference file`);
    hasDrift = true;
    continue;
  }
  const refKeys = Object.keys(flatten(reference));

  for (const lang of TARGETS) {
    const target = loadNs(lang, ns);
    if (!target) {
      report.push(`✖ ${lang}/${ns}.json — missing locale file`);
      hasDrift = true;
      continue;
    }
    const targetKeys = Object.keys(flatten(target));

    const missingInTarget = refKeys.filter((k) => !targetKeys.includes(k));
    const extraInTarget = targetKeys.filter((k) => !refKeys.includes(k));

    if (missingInTarget.length || extraInTarget.length) {
      hasDrift = true;
      report.push(
        `\n${lang}/${ns}.json — drift: ${missingInTarget.length} missing, ${extraInTarget.length} extra`,
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
