/**
 * Superadmin Terminal — the operator's command console.
 *
 * A whitelisted command registry, not a shell: every command is a checked
 * Convex handler, so nothing arbitrary can run against the platform. Read-only
 * commands live on `runCommand` (a query); state-changing ones (toggles,
 * broadcasts) on `runWriteCommand` (a mutation). The UI calls one or the other
 * depending on the first token, and `listCommands` powers autocomplete/help.
 *
 * Output is plain text lines with a simple exit code — the client renders
 * them in a terminal look with ANSI-ish colors (green ok / yellow warn /
 * red error) derived from the exit code and per-line prefixes.
 */

import { v } from 'convex/values';
import { mutation, query, type MutationCtx, type QueryCtx } from '../_generated/server';
import schema from '../schema';
import { getAuthCaller } from '../lib/getAuthCaller';
import { DEFAULT_LIST_CAP } from '../lib/limits';
import { KNOWN_FEATURES } from './featureToggles';

/** All user table names, derived from the compiled schema. */
function allTableNames(): string[] {
  const tables = (schema as unknown as { tables?: Record<string, unknown> }).tables ?? {};
  return Object.keys(tables).sort();
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CommandResult {
  /** Render-ready text lines. */
  lines: string[];
  /** 0 = ok, 1 = error, 2 = warning (rendered yellow). */
  exitCode: 0 | 1 | 2;
}

/** Read-only handlers get a QueryCtx; write handlers a MutationCtx. */
type ReadHandler = (ctx: QueryCtx, args: string[]) => Promise<CommandResult>;
type WriteHandler = (ctx: MutationCtx, args: string[]) => Promise<CommandResult>;

interface CommandDef {
  name: string;
  summary: string;
  usage: string;
  kind: 'read' | 'write';
  handler: ReadHandler | WriteHandler;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function requireSuperadmin(ctx: Parameters<typeof getAuthCaller>[0]) {
  const caller = await getAuthCaller(ctx);
  if (!caller || caller.role !== 'superadmin') {
    throw new Error('Only superadmins can use the terminal');
  }
  return caller;
}

const ok = (lines: string[]): CommandResult => ({ lines, exitCode: 0 });
const warn = (lines: string[]): CommandResult => ({ lines, exitCode: 2 });
const err = (lines: string[]): CommandResult => ({ lines, exitCode: 1 });

const formatNum = (n: number) => n.toLocaleString();
const fmtDate = (ts: number) => new Date(ts).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

/** Routes a superadmin can jump to — a curated map of the dashboard. */
const APP_ROUTES: { path: string; label: string }[] = [
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/employees', label: 'Employees' },
  { path: '/departments', label: 'Departments' },
  { path: '/positions', label: 'Positions' },
  { path: '/attendance', label: 'Attendance' },
  { path: '/leaves', label: 'Leave' },
  { path: '/tasks', label: 'Tasks' },
  { path: '/projects', label: 'Projects' },
  { path: '/calendar', label: 'Calendar' },
  { path: '/chat', label: 'Chat' },
  { path: '/reports', label: 'Reports' },
  { path: '/analytics', label: 'Analytics' },
  { path: '/recruitment', label: 'Recruitment' },
  { path: '/performance', label: 'Performance' },
  { path: '/expenses', label: 'Expenses' },
  { path: '/drivers', label: 'Drivers' },
  { path: '/payroll', label: 'Payroll' },
  { path: '/compensation', label: 'Compensation' },
  { path: '/learning', label: 'Learning' },
  { path: '/surveys', label: 'Surveys' },
  { path: '/documents', label: 'Documents' },
  { path: '/settings', label: 'Settings' },
  { path: '/superadmin', label: 'Superadmin Hub' },
  { path: '/superadmin/database', label: 'Data Browser' },
  { path: '/superadmin/sessions', label: 'Sessions' },
  { path: '/superadmin/audit', label: 'Audit Trail' },
  { path: '/superadmin/feature-toggles', label: 'Feature Toggles' },
  { path: '/superadmin/subscriptions', label: 'Subscriptions' },
  { path: '/superadmin/backups', label: 'Backups' },
  { path: '/superadmin/impersonate', label: 'Impersonate' },
  { path: '/superadmin/emergency', label: 'Emergency' },
  { path: '/superadmin/bulk-actions', label: 'Bulk Actions' },
];

// ── Individual commands ───────────────────────────────────────────────────────

async function cmdHelp(ctx: QueryCtx): Promise<CommandResult> {
  const caller = await requireSuperadmin(ctx);
  const lines = [
    `Strata operator console — welcome, ${caller.name}`,
    `Type a command and press Enter. Tab autocompletes, ↑/↓ walks history.`,
    ``,
    `COMMANDS`,
    `--------`,
    ...COMMANDS.map((c) => {
      const kind = c.kind === 'write' ? ' [write]' : '';
      return `  ${c.name.padEnd(14)} ${c.summary}${kind}`;
    }),
    ``,
    `Try: health, tables, orgs, audit, toggle ai.assistant on`,
  ];
  return ok(lines);
}

async function cmdHealth(ctx: QueryCtx): Promise<CommandResult> {
  await requireSuperadmin(ctx);
  const now = Date.now();
  const [orgs, users, subscriptions, pendingLeaves, incidents, tickets] = await Promise.all([
    ctx.db.query('organizations').collect(),
    ctx.db.query('users').take(DEFAULT_LIST_CAP),
    ctx.db.query('subscriptions').take(DEFAULT_LIST_CAP),
    ctx.db
      .query('leaveRequests')
      .withIndex('by_status', (q) => q.eq('status', 'pending'))
      .take(100),
    ctx.db
      .query('emergencyIncidents')
      .withIndex('by_status', (q) => q.eq('status', 'investigating'))
      .take(100),
    ctx.db
      .query('supportTickets')
      .filter((q) => q.eq(q.field('status'), 'open'))
      .take(100),
  ]);
  const activeSubs = subscriptions.filter((s) => s.status === 'active' || s.status === 'trialing');
  const expiringTrials = subscriptions.filter(
    (s) =>
      s.status === 'trialing' &&
      s.trialEnd &&
      s.trialEnd > now &&
      s.trialEnd - now < 3 * 24 * 60 * 60 * 1000,
  );
  const activeUsers = users.filter((u) => u.isActive !== false);
  const activeSessions = users.filter(
    (u) => u.sessionToken && u.sessionExpiry && u.sessionExpiry > now,
  ).length;

  const lines = [
    `Platform health @ ${fmtDate(now)}`,
    `  organizations ....... ${formatNum(orgs.length)}`,
    `  users ............... ${formatNum(activeUsers.length)}`,
    `  subscriptions ....... ${formatNum(activeSubs.length)} active`,
    `  trials expiring ..... ${formatNum(expiringTrials.length)}`,
    `  pending leaves ...... ${formatNum(pendingLeaves.length)}`,
    `  investigating ....... ${formatNum(incidents.length)}`,
    `  open tickets ........ ${formatNum(tickets.length)}`,
    `  active sessions ..... ${formatNum(activeSessions)}`,
  ];
  return incidents.length > 0 ? warn(lines) : ok(lines);
}

async function cmdStats(ctx: QueryCtx): Promise<CommandResult> {
  await requireSuperadmin(ctx);
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const [orgs, users, tasks] = await Promise.all([
    ctx.db.query('organizations').collect(),
    ctx.db.query('users').take(DEFAULT_LIST_CAP),
    ctx.db.query('tasks').take(DEFAULT_LIST_CAP),
  ]);
  const orgs30d = orgs.filter((o) => now - o._creationTime < 30 * day).length;
  const users30d = users.filter((u) => now - u._creationTime < 30 * day).length;
  const tasks7d = tasks.filter((t) => now - t._creationTime < 7 * day).length;
  return ok([
    `Growth (last 30d)`,
    `  new organizations ... ${formatNum(orgs30d)}`,
    `  new users ........... ${formatNum(users30d)}`,
    `  tasks created 7d .... ${formatNum(tasks7d)}`,
    `  total users ......... ${formatNum(users.length)}`,
  ]);
}

async function cmdPing(): Promise<CommandResult> {
  const started = Date.now();
  // A tiny no-op round trip keeps this honest about transport latency.
  await new Promise((r) => setTimeout(r, 5));
  const ms = Date.now() - started;
  return ok([`pong in ${ms}ms (server round-trip)`]);
}

async function cmdSessions(ctx: QueryCtx): Promise<CommandResult> {
  await requireSuperadmin(ctx);
  const now = Date.now();
  const users = await ctx.db.query('users').take(DEFAULT_LIST_CAP);
  const active = users.filter((u) => u.sessionToken && u.sessionExpiry && u.sessionExpiry > now);
  if (active.length === 0) return ok(['No active sessions']);
  return ok(
    [
      `${active.length} active session(s)`,
      '',
      ...active.slice(0, 25).map((u) => {
        const expiry = new Date(u.sessionExpiry!).toISOString().replace('T', ' ').slice(0, 19);
        return `  ${u.email.padEnd(36)} expires ${expiry}  ${u.role}`;
      }),
      active.length > 25 ? `  … and ${active.length - 25} more` : '',
    ].filter(Boolean),
  );
}

async function cmdOrgs(ctx: QueryCtx, args: string[]): Promise<CommandResult> {
  await requireSuperadmin(ctx);
  const q = args.join(' ').toLowerCase();
  const orgs = await ctx.db.query('organizations').order('desc').take(200);
  const filtered = q
    ? orgs.filter((o) => o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q))
    : orgs;
  if (filtered.length === 0) return err([`No organizations match "${q}"`]);
  return ok(
    [
      `${filtered.length} organization(s)${q ? ` matching "${q}"` : ''}`,
      '',
      ...filtered.slice(0, 30).map((o) => {
        const status = o.isActive ? 'active' : 'INACTIVE';
        const plan = (o.plan ?? '—').toUpperCase().padEnd(12);
        return `  ${o.slug.padEnd(24)} ${plan} ${status.padEnd(9)} ${o.name}`;
      }),
      filtered.length > 30 ? `  … and ${filtered.length - 30} more` : '',
    ].filter(Boolean),
  );
}

async function cmdUsers(ctx: QueryCtx, args: string[]): Promise<CommandResult> {
  await requireSuperadmin(ctx);
  const q = args.join(' ').toLowerCase();
  if (!q) return err(['usage: users <name|email query>']);
  const users = await ctx.db.query('users').take(DEFAULT_LIST_CAP);
  const filtered = users.filter(
    (u) => u.email.toLowerCase().includes(q) || (u.name ?? '').toLowerCase().includes(q),
  );
  if (filtered.length === 0) return err([`No users match "${q}"`]);
  return ok(
    [
      `${filtered.length} user(s) matching "${q}"`,
      '',
      ...filtered.slice(0, 30).map((u) => {
        const status = u.isActive ? 'active' : 'INACTIVE';
        const org = u.organizationId ? String(u.organizationId).slice(0, 8) : '—';
        return `  ${u.email.padEnd(36)} ${u.role.padEnd(11)} ${status.padEnd(8)} org ${org}  ${u.name ?? ''}`;
      }),
      filtered.length > 30 ? `  … and ${filtered.length - 30} more` : '',
    ].filter(Boolean),
  );
}

async function cmdTables(ctx: QueryCtx, args: string[]): Promise<CommandResult> {
  await requireSuperadmin(ctx);
  const q = args.join(' ').toLowerCase();
  const tableNames = allTableNames();
  const filtered = q ? tableNames.filter((name) => name.toLowerCase().includes(q)) : tableNames;
  if (filtered.length === 0) return err([`No tables match "${q}"`]);
  return ok([
    `${filtered.length} table(s)${q ? ` matching "${q}"` : ''}`,
    '',
    ...filtered.map((name) => `  ${name}`),
  ]);
}

async function cmdAudit(ctx: QueryCtx, args: string[]): Promise<CommandResult> {
  await requireSuperadmin(ctx);
  const limit = Math.min(Math.max(parseInt(args[0] ?? '15', 10) || 15, 1), 50);
  const logs = await ctx.db.query('auditLogs').order('desc').take(limit);
  if (logs.length === 0) return ok(['No audit entries yet']);
  const userIds = [...new Set(logs.map((l) => l.userId).filter(Boolean))];
  const userMap = new Map<string, string>();
  await Promise.all(
    userIds.map(async (id) => {
      const u = await ctx.db.get(id as never);
      if (u)
        userMap.set(
          id,
          (u as { email?: string; name?: string }).email ?? (u as { name?: string }).name ?? id,
        );
    }),
  );
  return ok([
    `Latest ${logs.length} audit entr${logs.length === 1 ? 'y' : 'ies'}`,
    '',
    ...logs.map((l) => {
      const who = l.userId ? ((userMap.get(l.userId) ?? '?').split('@')[0] ?? '?') : 'system';
      const time = new Date(l.createdAt).toISOString().replace('T', ' ').slice(5, 19);
      const detail = l.details ? `  ${String(l.details).slice(0, 60)}` : '';
      return `  ${time}  ${who.padEnd(18)} ${String(l.action).padEnd(34)}${detail}`;
    }),
  ]);
}

async function cmdTickets(ctx: QueryCtx): Promise<CommandResult> {
  await requireSuperadmin(ctx);
  const tickets = await ctx.db
    .query('supportTickets')
    .filter((q) => q.eq(q.field('status'), 'open'))
    .take(50);
  if (tickets.length === 0) return ok(['No open tickets — all clear']);
  return ok(
    [
      `${tickets.length} open ticket(s)`,
      '',
      ...tickets.slice(0, 25).map((t) => {
        const prio = String(t.priority ?? '—')
          .toUpperCase()
          .padEnd(8);
        const title = (t as { title?: string }).title ?? 'Untitled ticket';
        return `  ${prio} ${String(title).slice(0, 60)}`;
      }),
      tickets.length > 25 ? `  … and ${tickets.length - 25} more` : '',
    ].filter(Boolean),
  );
}

async function cmdToggle(ctx: MutationCtx, args: string[]): Promise<CommandResult> {
  const caller = await requireSuperadmin(ctx);
  const key = args[0];
  if (!key) return err(['usage: toggle <feature.key> [on|off|status]']);
  const known = KNOWN_FEATURES.find((f) => f.key === key);
  if (!known) {
    return err([
      `Unknown feature "${key}". Known:`,
      ...KNOWN_FEATURES.map((f) => `  ${f.key} — ${f.labelKey}`),
    ]);
  }
  const existing = await ctx.db
    .query('featureToggles')
    .withIndex('by_key', (q) => q.eq('key', key))
    .first();
  const current = existing?.enabled ?? known.defaultEnabled;

  const action = args[1] ?? 'status';
  if (action === 'status') {
    return ok([
      `${key}: ${current ? 'ON' : 'OFF'}`,
      current === known.defaultEnabled
        ? `  (default — no explicit global override)`
        : `  (overridden in console)`,
    ]);
  }
  const enabled = action === 'on' ? true : action === 'off' ? false : null;
  if (enabled === null) return err(['usage: toggle <key> [on|off|status]']);

  const now = Date.now();
  if (existing) {
    await ctx.db.patch(existing._id, {
      enabled,
      updatedBy: caller._id,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert('featureToggles', {
      key,
      enabled,
      updatedBy: caller._id,
      updatedAt: now,
    });
  }
  return ok([`${key} → ${enabled ? 'ON' : 'OFF'} (global)`]);
}

async function cmdExport(ctx: QueryCtx, args: string[]): Promise<CommandResult> {
  await requireSuperadmin(ctx);
  const table = args[0];
  if (!table) return err(['usage: export <tableName>']);
  try {
    // @ts-expect-error -- dynamic table name
    const docs = await ctx.db.query(table).take(200);
    return ok(
      [
        `${table}: ${docs.length} document(s)`,
        '',
        ...docs.slice(0, 50).map((d) => JSON.stringify(d)),
        docs.length > 50
          ? `  … and ${docs.length - 50} more (use the Data Browser for full export)`
          : '',
      ].filter(Boolean),
    );
  } catch (e) {
    return err([
      `Cannot read table "${table}": ${e instanceof Error ? e.message : 'unknown error'}`,
    ]);
  }
}

async function cmdBroadcast(ctx: MutationCtx, args: string[]): Promise<CommandResult> {
  const caller = await requireSuperadmin(ctx);
  const orgSlug = args[0];
  const message = args.slice(1).join(' ');
  if (!orgSlug || !message) {
    return err(['usage: broadcast <orgSlug> <message text>']);
  }
  const org = await ctx.db
    .query('organizations')
    .filter((q) => q.eq(q.field('slug'), orgSlug))
    .first();
  if (!org) return err([`No organization with slug "${orgSlug}"`]);

  const now = Date.now();
  let conv = await ctx.db
    .query('chatConversations')
    .withIndex('by_org', (q) => q.eq('organizationId', org._id))
    .filter((q) =>
      q.and(
        q.eq(q.field('type'), 'group'),
        q.eq(q.field('name'), 'System Announcements'),
        q.eq(q.field('isDeleted'), false),
      ),
    )
    .first();
  if (!conv) {
    const convId = await ctx.db.insert('chatConversations', {
      organizationId: org._id,
      type: 'group',
      name: 'System Announcements',
      description: 'Official company-wide announcements and service messages',
      createdBy: caller._id,
      createdAt: now,
      updatedAt: now,
      isArchived: false,
      isDeleted: false,
    });
    conv = await ctx.db.get(convId);
  }
  if (!conv) return err(['Could not create the announcements channel']);

  await ctx.db.insert('chatMessages', {
    conversationId: conv._id,
    senderId: caller._id,
    type: 'text',
    content: message,
    createdAt: now,
    readBy: [],
    attachments: undefined,
  });
  await ctx.db.patch(conv._id, { updatedAt: now });
  return ok([`Broadcast sent to ${org.name} (${orgSlug})`]);
}

async function cmdEnv(ctx: QueryCtx, args: string[]): Promise<CommandResult> {
  await requireSuperadmin(ctx);
  const key = args[0]?.toUpperCase();
  if (!key) return err(['usage: env <KEY>']);
  const value = process.env[key];
  if (value === undefined) return warn([`${key}: NOT SET`]);
  const masked =
    value.length <= 6
      ? '***'
      : `${value.slice(0, 3)}${'•'.repeat(Math.min(value.length - 6, 12))}${value.slice(-3)}`;
  return ok([`${key}: SET  (masked: ${masked}, length ${value.length})`]);
}

async function cmdRoutes(_ctx: QueryCtx, args: string[]): Promise<CommandResult> {
  await requireSuperadmin(_ctx);
  const q = args.join(' ').toLowerCase();
  const filtered = q
    ? APP_ROUTES.filter((r) => r.path.includes(q) || r.label.toLowerCase().includes(q))
    : APP_ROUTES;
  if (filtered.length === 0) return err([`No routes match "${q}"`]);
  return ok([
    `${filtered.length} route(s)${q ? ` matching "${q}"` : ''}`,
    '',
    ...filtered.map((r) => `  ${r.path.padEnd(30)} ${r.label}`),
  ]);
}

async function cmdWhoami(ctx: QueryCtx): Promise<CommandResult> {
  const caller = await requireSuperadmin(ctx);
  return ok([
    `superadmin@strata:~$`,
    `  name .......... ${caller.name}`,
    `  email ......... ${caller.email}`,
    `  role .......... ${caller.role}`,
    `  organization .. ${caller.organizationId ?? '— (platform-wide)'}`,
  ]);
}

async function cmdEcho(_ctx: QueryCtx, args: string[]): Promise<CommandResult> {
  return ok([args.join(' ') || '']);
}

async function cmdTablesInfo(ctx: QueryCtx): Promise<CommandResult> {
  await requireSuperadmin(ctx);
  const tableNames = allTableNames();
  return ok([`Schema: ${tableNames.length} tables`, '', ...tableNames.map((name) => `  ${name}`)]);
}

// ── Registry ──────────────────────────────────────────────────────────────────

export const COMMANDS: CommandDef[] = [
  {
    name: 'help',
    summary: 'List all commands',
    usage: 'help',
    kind: 'read',
    handler: (ctx: QueryCtx) => cmdHelp(ctx),
  },
  {
    name: 'health',
    summary: 'Platform health snapshot',
    usage: 'health',
    kind: 'read',
    handler: (ctx: QueryCtx) => cmdHealth(ctx),
  },
  {
    name: 'stats',
    summary: 'Growth and usage stats',
    usage: 'stats',
    kind: 'read',
    handler: (ctx: QueryCtx) => cmdStats(ctx),
  },
  {
    name: 'ping',
    summary: 'Server round-trip latency',
    usage: 'ping',
    kind: 'read',
    handler: () => cmdPing(),
  },
  {
    name: 'sessions',
    summary: 'Active sessions',
    usage: 'sessions',
    kind: 'read',
    handler: (ctx: QueryCtx) => cmdSessions(ctx),
  },
  {
    name: 'orgs',
    summary: 'List/search organizations',
    usage: 'orgs [query]',
    kind: 'read',
    handler: (ctx: QueryCtx, args: string[]) => cmdOrgs(ctx, args),
  },
  {
    name: 'users',
    summary: 'Search users by name/email',
    usage: 'users <query>',
    kind: 'read',
    handler: (ctx: QueryCtx, args: string[]) => cmdUsers(ctx, args),
  },
  {
    name: 'tables',
    summary: 'List schema tables',
    usage: 'tables [query]',
    kind: 'read',
    handler: (ctx: QueryCtx, args: string[]) => cmdTables(ctx, args),
  },
  {
    name: 'audit',
    summary: 'Latest audit log entries',
    usage: 'audit [limit]',
    kind: 'read',
    handler: (ctx: QueryCtx, args: string[]) => cmdAudit(ctx, args),
  },
  {
    name: 'tickets',
    summary: 'Open support tickets',
    usage: 'tickets',
    kind: 'read',
    handler: (ctx: QueryCtx) => cmdTickets(ctx),
  },
  {
    name: 'toggle',
    summary: 'Feature toggle on/off/status',
    usage: 'toggle <key> [on|off|status]',
    kind: 'write',
    handler: (ctx: MutationCtx, args: string[]) => cmdToggle(ctx, args),
  },
  {
    name: 'export',
    summary: 'Dump up to 200 docs of a table',
    usage: 'export <tableName>',
    kind: 'read',
    handler: (ctx: QueryCtx, args: string[]) => cmdExport(ctx, args),
  },
  {
    name: 'broadcast',
    summary: 'Send service announcement to an org',
    usage: 'broadcast <orgSlug> <message>',
    kind: 'write',
    handler: (ctx: MutationCtx, args: string[]) => cmdBroadcast(ctx, args),
  },
  {
    name: 'env',
    summary: 'Check an env var (masked)',
    usage: 'env <KEY>',
    kind: 'read',
    handler: (ctx: QueryCtx, args: string[]) => cmdEnv(ctx, args),
  },
  {
    name: 'routes',
    summary: 'Search app routes',
    usage: 'routes [query]',
    kind: 'read',
    handler: (ctx: QueryCtx, args: string[]) => cmdRoutes(ctx, args),
  },
  {
    name: 'whoami',
    summary: 'Current operator identity',
    usage: 'whoami',
    kind: 'read',
    handler: (ctx: QueryCtx) => cmdWhoami(ctx),
  },
  {
    name: 'echo',
    summary: 'Print arguments back',
    usage: 'echo <text>',
    kind: 'read',
    handler: (ctx: QueryCtx, args: string[]) => cmdEcho(ctx, args),
  },
  {
    name: 'tables-info',
    summary: 'Full schema table list',
    usage: 'tables-info',
    kind: 'read',
    handler: (ctx: QueryCtx) => cmdTablesInfo(ctx),
  },
];

// ── Public endpoints ──────────────────────────────────────────────────────────

/** Command registry metadata — powers autocomplete and help in the UI. */
export const listCommands = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperadmin(ctx);
    return COMMANDS.map((c) => ({
      name: c.name,
      summary: c.summary,
      usage: c.usage,
      kind: c.kind,
    }));
  },
});

/**
 * Run any command — read or write. One mutation for the whole console so the
 * client has a single `await` call; the registry decides what each command is
 * allowed to do. Never executes arbitrary input — only whitelisted handlers.
 */
export const runCommand = mutation({
  args: { input: v.string() },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx);
    const [name, ...rest] = args.input.trim().split(/\s+/);
    const cmd = COMMANDS.find((c) => c.name === name);
    if (!cmd) {
      const hint = COMMANDS.filter((c) => c.name.startsWith(name ?? '')).slice(0, 5);
      return err(
        [
          `Unknown command "${name}". Type "help" for the full list.`,
          hint.length > 0 ? `Did you mean: ${hint.map((h) => h.name).join(', ')}?` : '',
        ].filter(Boolean),
      );
    }
    if (cmd.kind === 'write') {
      return (cmd.handler as WriteHandler)(ctx, rest);
    }
    return (cmd.handler as ReadHandler)(ctx, rest);
  },
});
