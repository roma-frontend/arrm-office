#!/usr/bin/env node
// scripts/check-bundle-guardrails.mjs
//
// Post-build guardrails that cannot be expressed as raw size limits (the old
// webpack-era bundlewatch.config.json was retired because its globs matched
// nothing under Turbopack). These rules are about *count* and *placement* of
// libraries, not raw size:
//
//   1. tfjs single-engine rule — the app must ship exactly ONE copy of the
//      TensorFlow.js engine. `@vladmandic/face-api` bundles its own copy and
//      re-exports it as `tf`; importing the standalone `@tensorflow/tfjs` as
//      well used to ship a second full engine (~1.1 MB) in its own chunk.
//      Detection: chunk-level scan for the minified engine signature
//      (registerBackend + MathBackendWebGL/GPGPUContext).
//   2. Heavy libraries stay lazy — LiveKit's room stack and pdfmake must not
//      appear in any route's eager client manifest. (ExcelJS is watched by the
//      same manifest scan for completeness.)
//   3. Face model weights stay staged — public/models is served to browsers,
//      but only the tiny detector should be small. The 6.4 MB recognition
//      nets are *content*, not JS, so a runtime scan would not fail builds —
//      instead we pin that no JS chunk ever inlines model weight bytes.
//
// Run AFTER `next build` (reads .next/static). Exit 1 = regression.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, sep } from 'node:path';

const root = process.cwd();
const chunksDir = join(root, '.next', 'static', 'chunks');
const serverAppDir = join(root, '.next', 'server', 'app');

let failed = false;
const fail = (msg) => {
  failed = true;
  console.error(`  ✗ ${msg}`);
};
const pass = (msg) => console.log(`  ✓ ${msg}`);

// ── helpers ───────────────────────────────────────────────────────────────────

/** Every built JS chunk (excluding source maps) with its size. */
function listChunks() {
  if (!existsSync(chunksDir)) {
    console.error('✗ .next/static/chunks not found — run `next build` first.');
    process.exit(1);
  }
  return readdirSync(chunksDir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => {
      const p = join(chunksDir, f);
      return { name: f, path: p, size: statSync(p).size, src: readFileSync(p, 'utf8') };
    });
}

/**
 * A chunk contains a tfjs engine when it holds both the kernel-registry entry
 * point and a concrete backend. Both survive minification as plain strings, so
 * a single embedded copy always matches; two matching chunks = two engines.
 */
function containsTfjsEngine(src) {
  return src.includes('registerBackend') && (src.includes('MathBackendWebGL') || src.includes('GPGPUContext'));
}

/**
 * Eager per-route client manifests (Next 16 / Turbopack). Each file lists the
 * chunks a route loads on navigation — i.e. what a route forces every visitor
 * to download before any interaction.
 */
function listRouteManifests() {
  const manifests = [];
  if (!existsSync(serverAppDir)) return manifests;
  const walk = (dir, depth) => {
    if (depth > 8) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p, depth + 1);
      else if (entry.name === 'page_client-reference-manifest.js') manifests.push(p);
    }
  };
  walk(serverAppDir, 0);
  return manifests;
}

const routeOf = (manifestPath) =>
  manifestPath
    .split(sep)
    .join('/')
    .replace(/^.*server\/app/, '')
    .replace(/\/page_client-reference-manifest\.js$/, '') || '/';

// ── 1. exactly one tfjs engine ────────────────────────────────────────────────

console.log('\n1) tfjs single-engine rule');
{
  const chunks = listChunks();
  const engineChunks = chunks.filter((c) => containsTfjsEngine(c.src));

  if (engineChunks.length === 0) {
    fail('no chunk contains a tfjs engine — face login is broken?');
  } else if (engineChunks.length === 1) {
    pass(`exactly one tfjs engine: ${engineChunks[0].name} (${(engineChunks[0].size / 1024).toFixed(0)} KB)`);
  } else {
    fail(
      `${engineChunks.length} chunks contain a tfjs engine:\n` +
        engineChunks
          .map((c) => `      ${c.name} (${(c.size / 1024).toFixed(0)} KB)`)
          .join('\n') +
        `\n      → a dependency (or a new import) ships a second copy of @tensorflow/tfjs. ` +
        `face-api's embedded engine (re-exported as \`tf\`) must be the only one — see src/lib/faceApi.ts.`,
    );
  }

  // The embedded engine must be the one face-api actually uses: its bundle
  // contains the face nets. Combined with rule 1 this catches the case where
  // someone "fixes" duplication by removing face-api's copy instead of the
  // standalone import (which would break inference).
  const faceChunks = chunks.filter((c) => c.src.includes('TinyFaceDetector'));
  if (faceChunks.length === 0) {
    fail('no chunk contains the face-api nets — did the face stack disappear from the build?');
  } else {
    pass(`face-api nets present (${faceChunks.length} chunk)`);
  }
}

// ── 2. heavy libraries must stay lazy ─────────────────────────────────────────

console.log('\n2) heavy libraries are lazy-only');
{
  const libs = [
    { label: 'LiveKit room stack', marker: 'SignalClient' },
    { label: 'pdfmake', marker: 'Roboto-Regular.ttf' },
    { label: 'ExcelJS', marker: 'xl/workbook.xml' },
  ];
  const manifests = listRouteManifests();
  if (manifests.length === 0) {
    console.log('  (no route manifests found — skipping)');
  } else {
    for (const lib of libs) {
      const eager = manifests.filter((m) => readFileSync(m, 'utf8').includes(lib.marker));
      if (eager.length === 0) {
        pass(`${lib.label} loads only on interaction`);
      } else {
        fail(
          `${lib.label} is in the EAGER chunk set of ${eager.length} route(s):\n` +
            eager.map((m) => `      ${routeOf(m)}`).join('\n') +
            `\n      → import it dynamically at the point of use instead of a static import.`,
        );
      }
    }
  }
}

// ── 3. face model weights are not inlined into JS ─────────────────────────────

console.log('\n3) face model weights stay external');
{
  const chunks = listChunks();
  const inlined = chunks.filter(
    (c) => c.src.includes('face_recognition_model-shard1') && c.size > 512 * 1024,
  );
  if (inlined.length === 0) {
    pass('no JS chunk inlines model weight bytes');
  } else {
    fail(`model weights appear to be inlined into: ${inlined.map((c) => c.name).join(', ')}`);
  }
}

console.log('');
if (failed) {
  console.error('✗ bundle guardrails FAILED — see above.');
  process.exit(1);
}
console.log('✓ bundle guardrails passed.');
