#!/usr/bin/env node

/**
 * compare-coverage.mjs
 *
 * Compares two Jest coverage-summary.json files and writes a markdown diff
 * table (including per-file breakdown) to both stdout and coverage-diff.md.
 *
 * Usage:
 *   node scripts/compare-coverage.mjs base-coverage.json head-coverage.json
 */

import { readFileSync, writeFileSync } from 'node:fs';

const [basePath, headPath] = process.argv.slice(2);

if (!basePath || !headPath) {
  console.error(
    'Usage: node scripts/compare-coverage.mjs <base-coverage.json> <head-coverage.json>',
  );
  process.exit(1);
}

// ── Read both files ─────────────────────────────────────────────────────────
let base, head;
try {
  base = JSON.parse(readFileSync(basePath, 'utf-8'));
} catch (err) {
  console.error('Could not read base coverage file: ' + basePath);
  console.error('  ' + err.message);
  process.exit(1);
}

try {
  head = JSON.parse(readFileSync(headPath, 'utf-8'));
} catch (err) {
  console.error('Could not read head coverage file: ' + headPath);
  console.error('  ' + err.message);
  process.exit(1);
}

// ── Compare summary metrics ─────────────────────────────────────────────────
const METRICS = ['lines', 'functions', 'branches', 'statements'];

const summaryRows = [];
let anyDropped = false;

METRICS.forEach(function (metric) {
  const baseInfo = base.total ? base.total[metric] || {} : {};
  const headInfo = head.total ? head.total[metric] || {} : {};
  const baseVal = baseInfo.pct || 0;
  const headVal = headInfo.pct || 0;
  const diff = headVal - baseVal;
  const diffStr = diff >= 0 ? '+' + diff.toFixed(2) + '%' : diff.toFixed(2) + '%';
  const status = diff < -0.5 ? '❌' : diff < 0 ? '⚠️' : '✅';
  if (status !== '✅') anyDropped = true;

  const label = metric.charAt(0).toUpperCase() + metric.slice(1);
  summaryRows.push(
    '| **' +
      label +
      '** | ' +
      baseVal.toFixed(2) +
      '% | ' +
      headVal.toFixed(2) +
      '% | ' +
      diffStr +
      ' | ' +
      status +
      ' |',
  );
});

// ── File-level diff (>1pp changes) ──────────────────────────────────────────
// Only compares files that exist in BOTH base and head.
// New files are correctly reflected in the total-coverage summary already.
const fileDiffs = [];
const newFilesLowCoverage = [];
const headKeys = Object.keys(head);
for (let i = 0; i < headKeys.length; i++) {
  const filePath = headKeys[i];
  if (filePath === 'total') continue;
  const headInfo = head[filePath];
  const baseInfo = base[filePath];
  if (!baseInfo) {
    // New file — track separately
    const headPct = (headInfo.lines && headInfo.lines.pct) || 0;
    if (headPct < 50 && headPct > 0) {
      newFilesLowCoverage.push({
        path: filePath.replace(/^.*[\\/](?=src[\\/])/, '').replace(/\\/g, '/'),
        pct: headPct,
      });
    }
    continue;
  }
  const basePct = (baseInfo.lines && baseInfo.lines.pct) || 0;
  const headPct = (headInfo.lines && headInfo.lines.pct) || 0;
  const diff = headPct - basePct;
  if (Math.abs(diff) > 1) {
    fileDiffs.push({
      path: filePath.replace(/^.*[\\/](?=src[\\/])/, '').replace(/\\/g, '/'),
      basePct: basePct,
      headPct: headPct,
      diff: diff,
    });
  }
}

fileDiffs.sort(function (a, b) {
  return a.diff - b.diff;
});
const topDrops = fileDiffs.slice(0, 10);
const gains = fileDiffs.filter(function (f) {
  return f.diff > 0;
});
gains.sort(function (a, b) {
  return b.diff - a.diff;
});
const topGains = gains.slice(0, 5);

// ── Build output ────────────────────────────────────────────────────────────
const lines = [];

lines.push('### ☂️ Coverage Diff');
lines.push('');
lines.push('| Metric | Base | Head | Δ | Status |');
lines.push('|--------|------|------|---|--------|');
summaryRows.forEach(function (r) {
  lines.push(r);
});

if (topDrops.length > 0) {
  lines.push('');
  lines.push('**📉 Biggest drops (>1pp):**');
  lines.push('');
  lines.push('| File | Base | Head | Δ |');
  lines.push('|------|------|------|---|');
  topDrops.forEach(function (f) {
    const diffStr = f.diff >= 0 ? '+' + f.diff.toFixed(1) + 'pp' : f.diff.toFixed(1) + 'pp';
    lines.push(
      '| `' +
        f.path +
        '` | ' +
        f.basePct.toFixed(1) +
        '% | ' +
        f.headPct.toFixed(1) +
        '% | ' +
        diffStr +
        ' |',
    );
  });
}

if (topGains.length > 0) {
  lines.push('');
  lines.push('**📈 Biggest gains (>1pp):**');
  lines.push('');
  lines.push('| File | Base | Head | Δ |');
  lines.push('|------|------|------|---|');
  topGains.forEach(function (f) {
    const diffStr = f.diff >= 0 ? '+' + f.diff.toFixed(1) + 'pp' : f.diff.toFixed(1) + 'pp';
    lines.push(
      '| `' +
        f.path +
        '` | ' +
        f.basePct.toFixed(1) +
        '% | ' +
        f.headPct.toFixed(1) +
        '% | ' +
        diffStr +
        ' |',
    );
  });
}

if (newFilesLowCoverage.length > 0) {
  lines.push('');
  lines.push('**🆕 New files (<50% coverage):**');
  lines.push('');
  lines.push('| File | Coverage |');
  lines.push('|------|---------|');
  newFilesLowCoverage.forEach(function (f) {
    lines.push('| `' + f.path + '` | ' + f.pct.toFixed(1) + '% |');
  });
}

lines.push('');
lines.push('---');
lines.push('_Generated by scripts/compare-coverage.mjs_');

const output = lines.join('\n') + '\n';

// ── Write to file + stdout ─────────────────────────────────────────────────
writeFileSync('coverage-diff.md', output);
console.log(output);

if (anyDropped) {
  console.error('⚠️  Some coverage metrics dropped (threshold: -0.5pp)');
}
