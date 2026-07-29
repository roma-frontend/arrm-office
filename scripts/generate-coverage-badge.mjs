#!/usr/bin/env node

/**
 * generate-coverage-badge.mjs
 *
 * Reads coverage/coverage-summary.json produced by Jest and writes
 * badges/coverage.json — a shields.io endpoint-compatible JSON payload.
 *
 * Usage:
 *   node scripts/generate-coverage-badge.mjs
 *
 * Output (badges/coverage.json):
 *   {
 *     "schemaVersion": 1,
 *     "label": "coverage",
 *     "message": "9.80%",
 *     "color": "yellow"
 *   }
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Read coverage summary ───────────────────────────────────────────────────
let summary;
try {
  summary = JSON.parse(readFileSync(resolve(ROOT, 'coverage/coverage-summary.json'), 'utf-8'));
} catch (err) {
  console.error('❌ Could not read coverage/coverage-summary.json');
  console.error('   Run `npx jest --coverage --coverageReporters json-summary` first.');
  process.exit(1);
}

const pct = summary.total.lines.pct;

// ── Pick colour based on coverage percentage ─────────────────────────────────
let color;
if (pct >= 90) color = 'brightgreen';
else if (pct >= 70) color = 'green';
else if (pct >= 50) color = 'yellowgreen';
else if (pct >= 30) color = 'yellow';
else if (pct >= 10) color = 'orange';
else color = 'red';

// ── Write badge JSON ────────────────────────────────────────────────────────
const badgeDir = resolve(ROOT, 'badges');
mkdirSync(badgeDir, { recursive: true });

const payload = {
  schemaVersion: 1,
  label: 'coverage',
  message: `${pct.toFixed(1)}%`,
  color,
};

writeFileSync(resolve(badgeDir, 'coverage.json'), JSON.stringify(payload, null, 2) + '\n');
console.log(`✅ Wrote badges/coverage.json — ${payload.message} (${color})`);
