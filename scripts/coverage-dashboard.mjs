#!/usr/bin/env node
/**
 * Live coverage dashboard.
 *
 *   npm run coverage:serve   →   http://localhost:8788/watch
 *
 * Watches `src/`, `convex/` and `public/locales/` for changes, re-runs jest
 * with coverage (debounced) and serves a live dashboard showing the overall
 * percentages and a per-file table. The page updates in real time over
 * Server-Sent Events, so you can keep it open while writing tests.
 *
 * Endpoints:
 *   GET  /watch           dashboard (HTML)
 *   GET  /api/coverage    current coverage summary (JSON)
 *   GET  /api/events      Server-Sent Events stream
 *   POST /api/rerun       trigger a coverage run on demand
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync, watch, statSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8788);
const SUMMARY_PATH = path.join(ROOT, 'coverage', 'coverage-summary.json');

const WATCH_DIRS = [
  path.join(ROOT, 'src'),
  path.join(ROOT, 'convex'),
  path.join(ROOT, 'public', 'locales'),
];

const DEBOUNCE_MS = 800;

/* ── State ─────────────────────────────────────────────────────────────── */

const state = {
  data: null, // { total: {...}, files: [...] }
  status: 'idle', // idle | running
  lastRun: null, // epoch ms of last completed run
  lastDuration: null, // ms
  runError: null,
};

/* ── Coverage summary loading ──────────────────────────────────────────── */

function loadSummary() {
  try {
    if (!existsSync(SUMMARY_PATH)) return null;
    const raw = JSON.parse(readFileSync(SUMMARY_PATH, 'utf8'));
    const total = raw.total;
    if (!total) return null;

    const files = Object.entries(raw)
      .filter(([k]) => k !== 'total')
      .map(([k, v]) => {
        const parts = k.replace(/\\/g, '/').split('/');
        const name = parts[parts.length - 1];
        const dir = parts.slice(0, -1).join('/').replace(/^.*?\/src/, 'src').replace(/^.*?\/convex/, 'convex');
        const section = k.includes('convex/')
          ? 'convex'
          : k.includes('src/__tests__')
            ? 'tests'
            : k.includes('src/components')
              ? 'components'
              : k.includes('src/app')
                ? 'app'
                : k.includes('src/lib')
                  ? 'lib'
                  : 'other';
        return {
          name,
          dir,
          section,
          lines: v.lines,
          statements: v.statements,
          branches: v.branches,
          functions: v.functions,
        };
      })
      .sort((a, b) => a.lines.pct - b.lines.pct);

    state.data = { total, files };
    return state.data;
  } catch (err) {
    state.data = null;
    state.runError = `Failed to read coverage: ${err.message}`;
    return null;
  }
}

/* ── Jest runner ───────────────────────────────────────────────────────── */

let child = null;
let rerunQueued = false;

function runJest() {
  if (child) {
    rerunQueued = true;
    return;
  }
  state.status = 'running';
  state.runError = null;
  broadcast({ type: 'status', status: 'running' });

  const started = Date.now();
  // Fixed command string (no user input) so `shell: true` is safe.
  const cmd = 'npx --no-install jest --silent --coverage --coverageReporters=json-summary';
  child = spawn(cmd, {
    cwd: ROOT,
    stdio: ['ignore', 'ignore', 'pipe'],
    shell: true,
    windowsHide: true,
  });

  let stderr = '';
  child.stderr?.on('data', (d) => {
    stderr += String(d);
    if (stderr.length > 4000) stderr = stderr.slice(-4000);
  });

  child.on('error', (err) => {
    state.runError = `jest failed to start: ${err.message}`;
    child = null;
    state.status = 'idle';
    broadcast({ type: 'status', status: 'idle' });
    maybeDrainQueue();
  });

  child.on('exit', (code) => {
    child = null;
    state.status = 'idle';
    state.lastRun = Date.now();
    state.lastDuration = Date.now() - started;
    state.runError = code === 0 ? null : `jest exited with code ${code}`;
    loadSummary();
    broadcast({ type: 'update' });
    maybeDrainQueue();
  });
}

function maybeDrainQueue() {
  if (rerunQueued) {
    rerunQueued = false;
    setTimeout(runJest, 300);
  }
}

/* ── File watching ─────────────────────────────────────────────────────── */

let debounceTimer = null;

function scheduleRerun() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    if (state.status === 'idle') {
      runJest();
    } else {
      rerunQueued = true;
    }
  }, DEBOUNCE_MS);
}

function snapshotMtimes(root) {
  const snap = new Map();
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.next' || e.name === 'coverage') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(ts|tsx|js|jsx|css|json)$/.test(e.name)) {
        try {
          snap.set(full, statSync(full).mtimeMs);
        } catch {
          /* ignore */
        }
      }
    }
  };
  walk(dir);
  return snap;
}

let lastMtimes = null;

function installWatchers() {
  // Prefer native recursive fs.watch (works on Windows since Node 20).
  let watched = false;
  for (const dir of WATCH_DIRS) {
    try {
      watch(dir, { recursive: true }, (_evt, filename) => {
        if (!filename) return;
        const f = String(filename);
        if (f.includes('__tests__') || /\.(ts|tsx|js|jsx|css|json)$/.test(f)) scheduleRerun();
      });
      watched = true;
    } catch {
      /* fall through to polling */
    }
  }

  // Polling fallback (also covers editors that use atomic rename).
  if (!watched) {
    lastMtimes = WATCH_DIRS.map((d) => snapshotMtimes(d));
    setInterval(() => {
      let changed = false;
      WATCH_DIRS.forEach((dir, i) => {
        const now = snapshotMtimes(dir);
        if (lastMtimes[i].size !== now.size) changed = true;
        else for (const [p, m] of now) if (lastMtimes[i].get(p) !== m) changed = true;
        lastMtimes[i] = now;
      });
      if (changed) scheduleRerun();
    }, 2000);
  }
}

/* ── SSE ───────────────────────────────────────────────────────────────── */

const clients = new Set();

function broadcast(payload) {
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) {
    try {
      res.write(msg);
    } catch {
      clients.delete(res);
    }
  }
}

function meta() {
  return {
    status: state.status,
    lastRun: state.lastRun,
    lastDuration: state.lastDuration,
    runError: state.runError,
    fileCount: state.data?.files.length ?? 0,
  };
}

/* ── Dashboard HTML ────────────────────────────────────────────────────── */

const CSS = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: #0b1020; color: #dbe4f3; padding: 24px 20px 60px;
  }
  header { display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap; margin-bottom: 18px; }
  h1 { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
  h1 .dot { color: #34d399; }
  .status {
    font-size: 12px; padding: 4px 10px; border-radius: 999px;
    background: #1c2740; color: #94a3c8; border: 1px solid #2a3a5f;
  }
  .status.running { background: #3a2d14; color: #fbbf24; border-color: #6b5310; }
  .status.error { background: #3f1515; color: #f87171; border-color: #7f1d1d; }
  .status.ok { background: #0f3d2c; color: #34d399; border-color: #166534; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 18px; }
  .card { background: #141c33; border: 1px solid #22304e; border-radius: 12px; padding: 14px 16px; }
  .card .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #8fa3cc; }
  .card .value { font-size: 30px; font-weight: 800; margin: 4px 0 2px; font-variant-numeric: tabular-nums; }
  .card .sub { font-size: 12px; color: #7d90b8; }
  .bar { height: 6px; border-radius: 999px; background: #22304e; overflow: hidden; margin-top: 8px; }
  .bar > i { display: block; height: 100%; border-radius: 999px; transition: width 0.4s ease; }
  .bar.green > i { background: #34d399; }
  .bar.yellow > i { background: #fbbf24; }
  .bar.red > i { background: #f87171; }
  .toolbar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
  input[type=search] {
    flex: 1; min-width: 200px; background: #141c33; border: 1px solid #22304e;
    color: #dbe4f3; border-radius: 10px; padding: 9px 14px; font-size: 13px; outline: none;
  }
  input[type=search]:focus { border-color: #3b82f6; }
  .chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .chip {
    background: #141c33; border: 1px solid #22304e; color: #94a3c8;
    border-radius: 999px; padding: 6px 12px; font-size: 12px; cursor: pointer;
  }
  .chip.active { background: #2563eb; border-color: #2563eb; color: #fff; }
  .chip.rerun { background: #1e3a5f; border-color: #2d6fc0; color: #bcd6ff; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid #1a2440; white-space: nowrap; }
  th { color: #8fa3cc; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.file { width: 100%; }
  td.file .name { font-weight: 600; color: #c9d7f2; }
  td.file .dir { color: #6b7ea8; font-size: 11px; margin-left: 8px; }
  tr.file-row:hover td { background: #131b31; }
  .pct-cell { min-width: 64px; }
  .pct-badge { display: inline-block; width: 52px; text-align: right; }
  .good { color: #34d399; } .mid { color: #fbbf24; } .bad { color: #f87171; }
  .mini { color: #7d90b8; }
  .group td { background: #101728; color: #8fa3cc; font-size: 11px; text-transform: uppercase;
    letter-spacing: 0.08em; padding: 6px 10px; }
  .footer { margin-top: 16px; font-size: 12px; color: #6b7ea8; }
  .empty { padding: 40px; text-align: center; color: #7d90b8; }
  @media (max-width: 720px) { body { padding: 16px 10px 40px; } .hide-sm { display: none; } }
`;

function pctClass(p) {
  if (p >= 90) return 'good';
  if (p >= 60) return 'mid';
  return 'bad';
}

function barColor(p) {
  return p >= 90 ? 'green' : p >= 60 ? 'yellow' : 'red';
}

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Coverage Dashboard</title>
<style>${CSS}</style>
</head>
<body>
<header>
  <h1><span class="dot">●</span> Coverage <span id="env" class="mini"></span></h1>
  <span id="status" class="status">connecting…</span>
  <span id="meta" class="mini"></span>
</header>

<section class="cards" id="cards">
  <div class="card"><div class="label">Lines</div><div class="value" id="c-lines">—</div><div class="sub" id="c-lines-sub"></div><div class="bar" id="b-lines"></div></div>
  <div class="card"><div class="label">Statements</div><div class="value" id="c-statements">—</div><div class="sub" id="c-statements-sub"></div><div class="bar" id="b-statements"></div></div>
  <div class="card"><div class="label">Branches</div><div class="value" id="c-branches">—</div><div class="sub" id="c-branches-sub"></div><div class="bar" id="b-branches"></div></div>
  <div class="card"><div class="label">Functions</div><div class="value" id="c-functions">—</div><div class="sub" id="c-functions-sub"></div><div class="bar" id="b-functions"></div></div>
</section>

<div class="toolbar">
  <input type="search" id="q" placeholder="Filter by file name…" autocomplete="off" />
  <div class="chips" id="chips"></div>
</div>

<table>
  <thead>
    <tr>
      <th class="file">File</th>
      <th class="num">Uncovered</th>
      <th class="num pct-cell hide-sm">Stmts</th>
      <th class="num pct-cell hide-sm">Branch</th>
      <th class="num pct-cell hide-sm">Funcs</th>
      <th class="num pct-cell">Lines</th>
    </tr>
  </thead>
  <tbody id="rows"></tbody>
</table>

<div class="footer" id="footer"></div>

<script>
const CHIPS = [
  ['all', 'All'],
  ['need', '< 90%'],
  ['zero', '0%'],
  ['convex', 'Convex'],
  ['components', 'Components'],
  ['tests', 'Tests'],
  ['other', 'Lib / App'],
];
let files = [];
let filter = 'all';
let query = '';

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function fmtPct(p, cls) {
  const span = el('span', 'pct-badge ' + (cls || pctClass(p)));
  span.textContent = (p || 0).toFixed(1) + '%';
  return span;
}

function renderChips() {
  const wrap = document.getElementById('chips');
  wrap.innerHTML = '';
  for (const [key, label] of CHIPS) {
    const b = el('button', 'chip' + (filter === key ? ' active' : ''), label);
    b.onclick = () => { filter = key; renderChips(); renderRows(); };
    wrap.appendChild(b);
  }
  const rerun = el('button', 'chip rerun', '↻ Rerun jest');
  rerun.onclick = () => fetch('/api/rerun', { method: 'POST' });
  wrap.appendChild(rerun);
}

function renderCards() {
  const card = document.getElementById('cards');
  if (!card) return;
}

function renderRows() {
  const tbody = document.getElementById('rows');
  tbody.innerHTML = '';
  const q = query.toLowerCase();
  const list = files.filter((f) => {
    if (filter === 'need' && f.lines.pct >= 90) return false;
    if (filter === 'zero' && f.lines.pct !== 0) return false;
    if (filter === 'convex' && f.section !== 'convex') return false;
    if (filter === 'components' && f.section !== 'components') return false;
    if (filter === 'tests' && f.section !== 'tests') return false;
    if (filter === 'other' && !['lib', 'app', 'other'].includes(f.section)) return false;
    if (q && !f.name.toLowerCase().includes(q)) return false;
    return true;
  });

  if (!list.length) {
    tbody.appendChild(el('tr', '', el('td', 'empty', 'Nothing matches — write some tests!')));
    return;
  }

  let currentSection = null;
  for (const f of list) {
    if (f.section !== currentSection) {
      currentSection = f.section;
      const g = el('tr', 'group');
      const td = el('td', '', currentSection.toUpperCase());
      td.colSpan = 6;
      g.appendChild(td);
      tbody.appendChild(g);
    }
    const tr = el('tr', 'file-row');
    const fileTd = el('td', 'file');
    fileTd.appendChild(el('span', 'name', f.name));
    fileTd.appendChild(el('span', 'dir', f.dir.replace(/^src\\//, '').replace(/^convex\\//, '')));
    tr.appendChild(fileTd);

    const unc = f.lines.total - f.lines.covered;
    tr.appendChild(el('td', 'num ' + (unc > 0 ? 'bad' : 'good'), String(unc)));
    const st = el('td', 'num hide-sm'); st.appendChild(fmtPct(f.statements.pct)); tr.appendChild(st);
    const br = el('td', 'num hide-sm'); br.appendChild(fmtPct(f.branches.pct)); tr.appendChild(br);
    const fn = el('td', 'num hide-sm'); fn.appendChild(fmtPct(f.functions.pct)); tr.appendChild(fn);

    const ln = el('td', 'num');
    ln.appendChild(fmtPct(f.lines.pct));
    const bar = el('div', 'bar ' + barColor(f.lines.pct));
    const fill = el('i');
    fill.style.width = (f.lines.pct || 0) + '%';
    bar.appendChild(fill);
    ln.appendChild(bar);
    tr.appendChild(ln);

    tbody.appendChild(tr);
  }
}

function render(data) {
  const t = data.total;
  for (const m of ['lines', 'statements', 'branches', 'functions']) {
    const v = t[m];
    document.getElementById('c-' + m).textContent = (v.pct || 0).toFixed(1) + '%';
    document.getElementById('c-' + m + '-sub').textContent = v.covered + ' / ' + v.total;
    const bar = document.getElementById('b-' + m);
    bar.className = 'bar ' + barColor(v.pct);
    bar.innerHTML = '';
    const fill = el('i');
    fill.style.width = (v.pct || 0) + '%';
    bar.appendChild(fill);
  }
  files = data.files;
  renderRows();
}

function setStatus(s, err) {
  const elm = document.getElementById('status');
  elm.className = 'status';
  if (s === 'running') { elm.classList.add('running'); elm.textContent = '⏳ jest running…'; }
  else if (err) { elm.classList.add('error'); elm.textContent = '⚠ ' + err; }
  else { elm.classList.add('ok'); elm.textContent = '● live'; }
  const meta = document.getElementById('meta');
  if (dataLast && dataLast.meta) {
    const m = dataLast.meta;
    meta.textContent = m.fileCount + ' files · last run ' +
      (m.lastDuration ? (m.lastDuration / 1000).toFixed(0) + 's' : '—') +
      (m.lastRun ? ' · ' + new Date(m.lastRun).toLocaleTimeString() : '');
  }
}

let dataLast = null;
async function refresh() {
  try {
    const res = await fetch('/api/coverage');
    const data = await res.json();
    if (!data || !data.total) return;
    dataLast = data;
    render(data);
    setStatus(data.meta.status, data.meta.runError);
  } catch (err) {
    setStatus('idle', err.message);
  }
}

document.getElementById('env').textContent = '(localhost:' + location.port + ')';
document.getElementById('q').addEventListener('input', (e) => { query = e.target.value; renderRows(); });
renderChips();
refresh();

// Live updates over SSE, with a polling fallback.
const evt = new EventSource('/api/events');
evt.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === 'status') {
    const elm = document.getElementById('status');
    elm.className = 'status running';
    elm.textContent = '⏳ jest running…';
  } else if (msg.type === 'update') {
    refresh();
  }
};
evt.onerror = () => {
  document.getElementById('status').textContent = '⚠ SSE lost — polling…';
  setInterval(refresh, 5000);
};
setInterval(refresh, 30000); // safety net even with SSE
</script>
</body>
</html>`;

/* ── HTTP server ───────────────────────────────────────────────────────── */

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  if (p === '/' || p === '/watch') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML);
    return;
  }

  if (p === '/api/coverage') {
    const data = state.data ?? loadSummary();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ...(data ?? { total: null, files: [] }), meta: meta() }));
    return;
  }

  if (p === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');
    res.write(`data: ${JSON.stringify({ type: 'hello', meta: meta() })}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  if (p === '/api/rerun' && req.method === 'POST') {
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    runJest();
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\n  📊 Coverage dashboard:  http://localhost:${PORT}/watch\n`);
  loadSummary();
  installWatchers();
  runJest();
});

process.on('SIGINT', () => {
  if (child) child.kill();
  process.exit(0);
});
