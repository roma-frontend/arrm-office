#!/usr/bin/env node

/**
 * ratchet-coverage.mjs
 *
 * Reads the current coverage-summary.json and updates jest.config.js
 * coverageThreshold values to match current coverage levels minus a small
 * buffer. This ensures CI catches regression without requiring manual
 * threshold bumps after each coverage improvement.
 *
 * Usage:
 *   node scripts/ratchet-coverage.mjs          # dry-run (prints proposed changes)
 *   node scripts/ratchet-coverage.mjs --apply   # writes changes to jest.config.js
 *
 * Buffer: thresholds are set 1pp (percentage point) below current actual,
 * with a minimum step-up of 0.5pp. This prevents thrashing on tiny
 * fluctuations while still ratcheting up over time.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const DRY_RUN = !process.argv.includes('--apply');

// ── Read current coverage ───────────────────────────────────────────────────
let coverage;
try {
  coverage = JSON.parse(readFileSync('coverage/coverage-summary.json', 'utf-8'));
} catch (err) {
  console.error('Could not read coverage/coverage-summary.json');
  console.error('  Run `npx jest --coverage --coverageReporters json-summary` first.');
  process.exit(1);
}

// ── Read current jest.config.js ─────────────────────────────────────────────
let config;
try {
  config = readFileSync('jest.config.js', 'utf-8');
} catch (err) {
  console.error('Could not read jest.config.js');
  process.exit(1);
}

// ── Compute new thresholds ──────────────────────────────────────────────────
const METRICS = ['lines', 'functions', 'branches', 'statements'];
const changes = [];
const BUFFER = 1; // percentage points below current

METRICS.forEach(function (metric) {
  const actual = coverage.total[metric].pct;
  // New threshold: floor(actual - buffer), but at least 0
  const proposed = Math.max(0, Math.floor(actual - BUFFER));
  // Find current threshold in the config
  const regex = new RegExp('(' + metric + '):\\s*(\\d+)', 'i');
  const match = config.match(regex);
  const current = match ? parseInt(match[2], 10) : 0;

  if (proposed > current) {
    changes.push({ metric: metric, current: current, proposed: proposed, actual: actual });
  } else if (proposed < current) {
    console.log(
      '  ' +
        metric +
        ': would drop from ' +
        current +
        ' to ' +
        proposed +
        ' (actual: ' +
        actual.toFixed(2) +
        '%) — skipping (no ratchet down)',
    );
  } else {
    console.log(
      '  ' +
        metric +
        ': already at ' +
        current +
        ' — no change needed (actual: ' +
        actual.toFixed(2) +
        '%)',
    );
  }
});

// ── Apply or print ──────────────────────────────────────────────────────────
if (changes.length === 0) {
  console.log('No thresholds to ratchet up. All thresholds already at or above proposed values.');
  process.exit(0);
}

console.log('');
console.log('Proposed threshold bumps:');
console.log('');
console.log('| Metric | Current | Proposed | Actual |');
console.log('|--------|---------|----------|--------|');
changes.forEach(function (c) {
  console.log(
    '| ' + c.metric + ' | ' + c.current + ' | ' + c.proposed + ' | ' + c.actual.toFixed(2) + '% |',
  );
});

if (DRY_RUN) {
  console.log('');
  console.log('This is a dry run. Run with --apply to write changes.');
  console.log('  node scripts/ratchet-coverage.mjs --apply');
  // Exit 1 so the caller can detect that changes are available
  process.exit(1);
}

// Apply changes — preserve original formatting (spaces, indent) around the number
var newConfig = config;
changes.forEach(function (c) {
  // Match: metric: optional-spaces current-number
  // Replace only the number, keep everything else
  const regex = new RegExp('(' + c.metric + '):(\\s*)(\\d+)', 'i');
  newConfig = newConfig.replace(regex, '$1:$2' + c.proposed);
});

writeFileSync('jest.config.js', newConfig, 'utf-8');
console.log('');
console.log('Updated jest.config.js with new thresholds.');
console.log('Run tests to verify: npm run test:coverage');
