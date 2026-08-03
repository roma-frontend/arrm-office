#!/usr/bin/env node

/**
 * audit-convex-auth.mjs
 *
 * Lists PUBLIC Convex functions (query/mutation/action) whose handler body
 * contains no recognizable authorization check.
 *
 * `internalQuery`/`internalMutation`/`internalAction` are excluded: they are not
 * reachable from a browser client, only from other server functions and crons.
 * `httpAction` is excluded too — those authenticate at the HTTP layer.
 *
 * This is a lint-grade heuristic, not a proof: it flags handlers for human
 * review. A handler counts as "checked" when its body mentions one of the
 * known auth/RBAC helpers (see AUTH_PATTERNS).
 *
 * Usage:
 *   node scripts/audit-convex-auth.mjs            # human-readable report
 *   node scripts/audit-convex-auth.mjs --json     # machine-readable
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const CONVEX_DIR = join(ROOT, 'convex');

// Helpers that establish caller identity or enforce a role/org constraint.
const AUTH_PATTERNS = [
  'getAuthCaller',
  'requireAuth',
  'requireAuthUser',
  'requireAuthUserOrThrow',
  'requireRole',
  'requireRoleAtLeast',
  'callerId',
  'ctx.auth',
  'getUserIdentity',
  'resolveEmployeeAccess',
  'assertCanManageEmployee',
  'assertCan',
  // convex/lib/orgAccess.ts — caller-identity org scoping
  'resolveOrgScope',
  'assertOrgScope',
  'resolveOrgStaff',
  'assertOrgStaff',
  'scopeOwnsRecord',
  'canAccessOwnedRecord',
  'isOrgStaff',
  'canAccessExpenseRecord',
  'isSuperadmin',
  'withRBAC',
  'requireOrgMember',
  'requireSameOrg',
];

const PUBLIC_KINDS = ['query', 'mutation', 'action'];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '_generated') continue;
      walk(full, out);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Extract top-level `export const NAME = KIND({ ... })` blocks by brace
 * counting, so nested objects/functions don't end the block early.
 */
function extractExports(src) {
  const results = [];
  const re = /^export const (\w+)\s*=\s*(\w+)\(/gm;
  let m;
  while ((m = re.exec(src)) !== null) {
    const [, name, kind] = m;
    const open = src.indexOf('(', m.index + m[0].length - 1);
    let depth = 0;
    let i = open;
    let inStr = null;
    for (; i < src.length; i++) {
      const c = src[i];
      const prev = src[i - 1];
      if (inStr) {
        if (c === inStr && prev !== '\\') inStr = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') {
        inStr = c;
        continue;
      }
      if (c === '(') depth++;
      else if (c === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    const body = src.slice(m.index, i + 1);
    const line = src.slice(0, m.index).split('\n').length;
    results.push({ name, kind, body, line });
  }
  return results;
}

const files = walk(CONVEX_DIR);
const findings = [];
let publicCount = 0;

for (const file of files) {
  const src = readFileSync(file, 'utf-8');
  const rel = relative(ROOT, file).split(sep).join('/');
  for (const { name, kind, body, line } of extractExports(src)) {
    if (!PUBLIC_KINDS.includes(kind)) continue;
    publicCount++;
    const hasAuth = AUTH_PATTERNS.some((p) => body.includes(p));
    if (!hasAuth) findings.push({ file: rel, name, kind, line });
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ publicCount, unchecked: findings }, null, 2));
} else {
  const byFile = new Map();
  for (const f of findings) {
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file).push(f);
  }
  const sorted = [...byFile.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [file, fns] of sorted) {
    console.log(`\n${file}  (${fns.length})`);
    for (const fn of fns) console.log(`  ${fn.kind.padEnd(8)} ${fn.name}  :${fn.line}`);
  }
  console.log(
    `\n${findings.length} of ${publicCount} public functions have no recognizable auth check ` +
      `across ${byFile.size} files.`,
  );
}
