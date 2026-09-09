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
// Run AFTER `next build` (reads the dist output). Exit 1 = regression.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, sep, dirname, basename } from 'node:path';

const root = process.cwd();
// Mirror next.config.js: builds may target an isolated dist dir via NEXT_DIST_DIR.
const distDir = process.env.NEXT_DIST_DIR || '.next';
const distPath = join(root, distDir);
const serverAppDir = join(distPath, 'server', 'app');

// Whether "I could not find the client bundle" is fatal.
//
// On Vercel the dist layout is the host's business (it applies its own
// modifyConfig and may relocate the output), so a tree this script cannot
// recognise is a script/host mismatch — NOT evidence of a bundle regression.
// Blocking the deploy on it rejects a commit the GitHub Actions build already
// validated with these very rules. Everywhere else (local, CI) the chunks are
// guaranteed to exist, so not finding them means the script is broken and must
// fail loudly rather than silently stop guarding.
const lookupFailureIsAdvisory = Boolean(process.env.VERCEL);

let failed = false;
const fail = (msg) => {
  failed = true;
  console.error(`  ✗ ${msg}`);
};
const pass = (msg) => console.log(`  ✓ ${msg}`);
const skip = (msg) => console.log(`  – ${msg}`);

// ── locating the client bundle ────────────────────────────────────────────────

/** True when `dir` exists and directly holds at least one .js file. */
function hasJsFiles(dir) {
  try {
    return readdirSync(dir).some((f) => f.endsWith('.js'));
  } catch {
    return false;
  }
}

/**
 * Client chunk paths Next itself recorded, relative to distDir
 * (e.g. `static/chunks/0cz1d0mv5g_q7.js`). This is the authoritative answer to
 * "where did the browser bundle go", whatever the host did to the tree.
 */
function manifestChunkPaths() {
  const paths = [];
  const visit = (node) => {
    if (typeof node === 'string') {
      if (node.endsWith('.js')) paths.push(node);
    } else if (Array.isArray(node)) {
      node.forEach(visit);
    } else if (node && typeof node === 'object') {
      Object.values(node).forEach(visit);
    }
  };
  for (const name of ['build-manifest.json', 'app-build-manifest.json']) {
    const p = join(distPath, name);
    if (!existsSync(p)) continue;
    try {
      visit(JSON.parse(readFileSync(p, 'utf8')));
    } catch {
      /* a malformed manifest just means we fall through to the tree scan */
    }
  }
  return paths.filter((p) => p.split('/').includes('chunks'));
}

/** Depth-limited walk yielding every directory under `from` (including it). */
function* walkDirs(from, maxDepth = 8) {
  const stack = [[from, 0]];
  while (stack.length > 0) {
    const [dir, depth] = stack.pop();
    yield dir;
    if (depth >= maxDepth) continue;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'cache') {
        stack.push([join(dir, entry.name), depth + 1]);
      }
    }
  }
}

/**
 * Locate the built client-chunks directory.
 *
 * Ordered by how much the answer can be trusted; every step must identify the
 * *client* bundle specifically. A generic "first directory named chunks" scan
 * is not acceptable: `<dist>/build/chunks` holds Turbopack's own build-time
 * chunks (a handful of files, none of the app's client code), and an earlier
 * version of this script picked exactly that on Vercel and then reported the
 * whole face-recognition stack as missing from the build.
 */
function resolveChunksDir() {
  // 1. The conventional location.
  const conventional = join(distPath, 'static', 'chunks');
  if (hasJsFiles(conventional)) return conventional;

  // 2. Vercel Build Output API layout, in case the dist dir was already moved.
  const buildOutput = join(root, '.vercel', 'output', 'static', '_next', 'static', 'chunks');
  if (hasJsFiles(buildOutput)) return buildOutput;

  // 3. Ask Next: manifest paths resolved against distDir.
  const manifestPaths = manifestChunkPaths();
  for (const rel of manifestPaths) {
    const direct = join(distPath, ...rel.split('/'));
    if (existsSync(direct)) return dirname(direct);
  }

  // 4. Same manifest, but the tree moved: chunk *filenames* still match, so
  //    find the directory that actually contains one of them.
  const wanted = new Set(manifestPaths.map((p) => basename(p)));
  if (wanted.size > 0) {
    for (const dir of walkDirs(distPath)) {
      let entries;
      try {
        entries = readdirSync(dir);
      } catch {
        continue;
      }
      if (entries.some((f) => wanted.has(f))) return dir;
    }
  }

  // 5. No manifest at all: accept a `chunks` directory nested directly under a
  //    `static` directory, which `<dist>/build/chunks` can never satisfy.
  for (const dir of walkDirs(distPath)) {
    if (basename(dir) === 'chunks' && basename(dirname(dir)) === 'static' && hasJsFiles(dir)) {
      return dir;
    }
  }

  return null;
}

/** Print the dist layout so a host-side relocation explains itself in the log. */
function reportLayout() {
  console.log(`  looked under ${distDir} for the client bundle and found:`);
  let shown = 0;
  for (const dir of walkDirs(distPath, 4)) {
    if (shown >= 25) break;
    let count = 0;
    try {
      count = readdirSync(dir).filter((f) => f.endsWith('.js')).length;
    } catch {
      continue;
    }
    if (count === 0) continue;
    console.log(`    ${dir.replace(root + sep, '')} — ${count} .js`);
    shown++;
  }
  if (shown === 0) console.log('    (no directory containing .js files)');
}

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Every built client JS chunk (excluding source maps) with its size.
 * Memoised: rules 1 and 3 both scan the full set, which is ~650 files.
 * Returns null when the client bundle could not be located.
 */
let chunkCache;
function getChunks() {
  if (chunkCache !== undefined) return chunkCache;

  const resolved = resolveChunksDir();
  if (!resolved) {
    // Diagnostics go to stdout so they stay in order with the rule output —
    // interleaving them across stdout/stderr scrambles the CI log.
    console.log('  no client chunks directory found.');
    reportLayout();
    if (lookupFailureIsAdvisory) {
      console.log(
        '  Skipping the chunk-level rules: on Vercel the dist layout is host-controlled,\n' +
          '  so this is a layout mismatch rather than a bundle regression. The GitHub\n' +
          '  Actions build enforces these same rules on every push to main.',
      );
    } else {
      fail('could not locate the client bundle — see the layout dump above');
    }
    chunkCache = null;
    return null;
  }

  if (resolved !== join(distPath, 'static', 'chunks')) {
    console.log(`  (using chunks at ${resolved.replace(root + sep, '')})`);
  }
  chunkCache = readdirSync(resolved)
    .filter((f) => f.endsWith('.js'))
    .map((f) => {
      const p = join(resolved, f);
      return { name: f, path: p, size: statSync(p).size, src: readFileSync(p, 'utf8') };
    });
  return chunkCache;
}

/**
 * A chunk contains a tfjs engine when it holds both the kernel-registry entry
 * point and a concrete backend. Both survive minification as plain strings, so
 * a single embedded copy always matches; two matching chunks = two engines.
 */
function containsTfjsEngine(src) {
  return (
    src.includes('registerBackend') &&
    (src.includes('MathBackendWebGL') || src.includes('GPGPUContext'))
  );
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
  const chunks = getChunks();
  if (!chunks) {
    skip('client bundle not found — tfjs engine count not checked');
  } else {
    const engineChunks = chunks.filter((c) => containsTfjsEngine(c.src));

    if (engineChunks.length === 0) {
      fail('no chunk contains a tfjs engine — face login is broken?');
    } else if (engineChunks.length === 1) {
      pass(
        `exactly one tfjs engine: ${engineChunks[0].name} (${(engineChunks[0].size / 1024).toFixed(0)} KB)`,
      );
    } else {
      fail(
        `${engineChunks.length} chunks contain a tfjs engine:\n` +
          engineChunks.map((c) => `      ${c.name} (${(c.size / 1024).toFixed(0)} KB)`).join('\n') +
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
  const chunks = getChunks();
  if (!chunks) {
    skip('client bundle not found — inlined weights not checked');
  } else {
    const inlined = chunks.filter(
      (c) => c.src.includes('face_recognition_model-shard1') && c.size > 512 * 1024,
    );
    if (inlined.length === 0) {
      pass('no JS chunk inlines model weight bytes');
    } else {
      fail(`model weights appear to be inlined into: ${inlined.map((c) => c.name).join(', ')}`);
    }
  }
}

console.log('');
if (failed) {
  console.error('✗ bundle guardrails FAILED — see above.');
  process.exit(1);
}
console.log('✓ bundle guardrails passed.');
