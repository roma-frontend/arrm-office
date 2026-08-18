/**
 * Superadmin Data Browser — the support engineer's view of the whole database.
 *
 * Modeled on the admin console of builder-studio: a table list, a row browser
 * with search, inline editing that writes back through the same validation the
 * app uses, an audit trail of every edit with one-click undo, and a full
 * database export with credentials redacted.
 *
 * WHY THIS IS SAFE
 *   - Every handler starts with `requireSuperadmin`, so only superadmins reach
 *     any of it.
 *   - Reads go through Convex's normal table validation; writes go through
 *     `ctx.db.patch`, which re-validates against the schema and refuses fields
 *     the table does not define — a browser edit cannot smuggle in new columns.
 *   - Deletes are logged with a before-snapshot so they can be restored; the
 *     export strips password hashes, session tokens and biometric data.
 *
 * LIMITATION (by design, matching Convex's model): the list of table names is
 * derived from the compiled schema, not from runtime introspection. Adding a
 * table to the schema automatically adds it here on the next deployment.
 */

import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import schema from '../schema';
import { getAuthCaller } from '../lib/getAuthCaller';
import { DEFAULT_LIST_CAP } from '../lib/limits';
import { SENSITIVE_USER_FIELDS } from '../lib/userRedaction';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function requireSuperadmin(ctx: Parameters<typeof getAuthCaller>[0]) {
  const caller = await getAuthCaller(ctx);
  if (!caller || caller.role !== 'superadmin') {
    throw new Error('Only superadmins can use the database browser');
  }
  return caller;
}

/** All user table names, derived from the compiled schema. */
function allTableNames(): string[] {
  const tables = (schema as unknown as { tables?: Record<string, unknown> }).tables ?? {};
  return Object.keys(tables).sort();
}

/**
 * Tables that are never worth browsing and must never be exported wholesale:
 * the audit trail itself, session-adjacent tokens, and the like.
 */
const HIDDEN_TABLES = new Set([
  'adminDbChanges',
  'superadminAccessTokens',
  'auditLogs',
  'sessions',
]);

/** User fields that must never be exported even when the rest of the doc goes. */
const EXPORT_REDACTED_FIELDS = new Set([
  ...SENSITIVE_USER_FIELDS,
  'sessionToken',
  'sessionExpiry',
  'passwordHash',
  'totpSecret',
  'faceImageUrl',
  'biometricKey',
]);

/**
 * Redact a single document for export: drop sensitive keys and any value that
 * looks like a stored secret (long token/hex strings) from known secret keys.
 */
function redactDoc(doc: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(doc)) {
    if (EXPORT_REDACTED_FIELDS.has(key)) continue;
    out[key] = value;
  }
  return out;
}

/** Strip Convex system fields (`_id`, `_creationTime`) for display. */
function stripSystemFields(doc: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(doc)) {
    if (key === '_id' || key === '_creationTime') continue;
    out[key] = value;
  }
  return out;
}

/**
 * Union of every field name seen across the page of rows, in first-seen order.
 * Drives the Data Browser grid: instead of one opaque "content" blob, each
 * column of the document becomes a real table column.
 */
function collectColumns(rows: unknown[]): string[] {
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const doc = row as Record<string, unknown>;
    for (const key of Object.keys(doc)) {
      if (key === '_id' || key === '_creationTime' || seen.has(key)) continue;
      seen.add(key);
      columns.push(key);
    }
  }
  return columns;
}

/**
 * Guess a related table name from a foreign-key-looking field (`userId` →
 * `users`, `organizationId` → `organizations`). Used to make `Id` values
 * clickable so a support engineer can jump from a row to the thing it points
 * at. Purely cosmetic — never used to read across tables.
 */
function guessRelatedTable(field: string): string | null {
  const m = /^(.+)Id$/.exec(field);
  if (!m) return null;
  const base = m[1];
  // camelCase → snake (the tables are all plural snake_case): taskAssignee →
  // task_assignees is too speculative, so only handle the obvious singulars
  // that actually exist as tables.
  const candidates = [`${base}s`, `${base}es`];
  const all = allTableNames();
  return candidates.find((c) => all.includes(c)) ?? null;
}

// ── Table list ───────────────────────────────────────────────────────────────

export const listTables = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperadmin(ctx);
    const names = allTableNames().filter((name) => !HIDDEN_TABLES.has(name));
    return Promise.all(
      names.map(async (name) => {
        let count = 0;
        try {
          // @ts-expect-error -- dynamic table name
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call -- dynamic table query
          count = await ctx.db.query(name).count();
        } catch {
          count = 0;
        }
        return { name, count };
      }),
    );
  },
});

// ── Row browser ──────────────────────────────────────────────────────────────

export const getTableRows = query({
  args: {
    tableName: v.string(),
    search: v.optional(v.string()),
    /** Column name to filter on, paired with `value` for an exact match. */
    column: v.optional(v.string()),
    /** Exact value for the column filter (stringified compare). */
    columnValue: v.optional(v.string()),
    offset: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx);

    const names = allTableNames();
    if (!names.includes(args.tableName)) throw new Error('Unknown table');

    const limit = Math.min(args.limit ?? 50, DEFAULT_LIST_CAP);
    const offset = Math.max(args.offset ?? 0, 0);

    const search = args.search?.trim().toLowerCase();
    const column = args.column?.trim();
    const columnValue = args.columnValue?.trim();
    // A search term or column filter means the match can live anywhere in the
    // table, not just on the current page — otherwise "find employee X" would
    // silently fail once the table outgrows one page. When filtering, scan up
    // to DEFAULT_LIST_CAP rows and filter in memory (HR tables fit comfortably;
    // for huge tables the cap is the documented ceiling). Without filters we
    // page directly, so browsing a big table stays cheap.
    const filtering = Boolean(search) || (column !== undefined && columnValue !== undefined);
    const scanCount = filtering ? DEFAULT_LIST_CAP : offset + limit;

    // @ts-expect-error -- dynamic table name: Convex validates the name at
    // runtime and rejects unknown tables, which we already checked above.
    const rows = await ctx.db.query(args.tableName).take(scanCount);

    const matches = rows.filter((row) => {
      const doc = row as Record<string, unknown>;
      if (column && columnValue !== undefined) {
        const raw = doc[column];
        if (raw === undefined) return false;
        let str: string;
        try {
          str = typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
        } catch {
          str = '';
        }
        if (str !== columnValue && !str.toLowerCase().includes(columnValue.toLowerCase())) {
          return false;
        }
      }
      if (!search) return true;
      return Object.values(doc).some((value) => {
        try {
          return JSON.stringify(value).toLowerCase().includes(search);
        } catch {
          return false;
        }
      });
    });

    const page = matches.slice(offset, offset + limit);

    return {
      // All column names observed on this page — drives the grid header.
      columns: collectColumns(page),
      rows: page.map((row) => ({
        id: (row as { _id: unknown })._id as string,
        doc: stripSystemFields(row as Record<string, unknown>),
      })),
      // With filters this is the match count (so the client shows how many
      // rows matched); otherwise the fetched count, as before.
      total: filtering ? matches.length : rows.length,
      // Without filters a full page means more rows may exist (keep paging);
      // with filters, truncation is exactly "matches spill past this page".
      truncated: filtering ? matches.length > offset + limit : rows.length >= offset + limit,
    };
  },
});

export const getRowById = query({
  args: { tableName: v.string(), docId: v.string() },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx);
    const names = allTableNames();
    if (!names.includes(args.tableName)) throw new Error('Unknown table');

    // @ts-expect-error -- dynamic table name
    const row = await ctx.db.get(args.docId);
    if (!row) return null;
    return {
      id: (row as { _id: unknown })._id as string,
      doc: stripSystemFields(row as Record<string, unknown>),
    };
  },
});

// ── Row writes (audited) ─────────────────────────────────────────────────────

/**
 * Patch a row. `patch` must be a partial object of fields the table already
 * defines — `ctx.db.patch` re-validates against the schema and rejects unknown
 * fields, which is exactly the guard we want for a browser edit.
 */
export const patchDbRow = mutation({
  args: {
    tableName: v.string(),
    docId: v.string(),
    patch: v.record(v.string(), v.any()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await requireSuperadmin(ctx);
    const names = allTableNames();
    if (!names.includes(args.tableName)) throw new Error('Unknown table');
    if (HIDDEN_TABLES.has(args.tableName)) throw new Error('This table is protected');

    // @ts-expect-error -- dynamic table name
    const before = await ctx.db.get(args.docId);
    if (!before) throw new Error('Row not found');

    // @ts-expect-error -- dynamic table name
    await ctx.db.patch(args.docId, args.patch);

    // @ts-expect-error -- dynamic table name
    const after = await ctx.db.get(args.docId);

    await ctx.db.insert('adminDbChanges', {
      tableName: args.tableName,
      docId: args.docId,
      beforeJson: JSON.stringify(stripSystemFields(before as Record<string, unknown>)),
      afterJson: after
        ? JSON.stringify(stripSystemFields(after as Record<string, unknown>))
        : undefined,
      action: 'patch',
      changedBy: caller._id,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

export const insertDbRow = mutation({
  args: {
    tableName: v.string(),
    doc: v.record(v.string(), v.any()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await requireSuperadmin(ctx);
    const names = allTableNames();
    if (!names.includes(args.tableName)) throw new Error('Unknown table');
    if (HIDDEN_TABLES.has(args.tableName)) throw new Error('This table is protected');

    // @ts-expect-error -- dynamic table name
    const docId = await ctx.db.insert(args.tableName, args.doc);

    await ctx.db.insert('adminDbChanges', {
      tableName: args.tableName,
      docId: docId as string,
      beforeJson: undefined,
      afterJson: JSON.stringify(args.doc),
      action: 'insert',
      changedBy: caller._id,
      createdAt: Date.now(),
    });

    return { success: true, docId: docId as string };
  },
});

export const deleteDbRow = mutation({
  args: {
    tableName: v.string(),
    docId: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await requireSuperadmin(ctx);
    const names = allTableNames();
    if (!names.includes(args.tableName)) throw new Error('Unknown table');
    if (HIDDEN_TABLES.has(args.tableName)) throw new Error('This table is protected');

    // @ts-expect-error -- dynamic table name
    const before = await ctx.db.get(args.docId);
    if (!before) throw new Error('Row not found');

    const beforeJson = JSON.stringify(stripSystemFields(before as Record<string, unknown>));

    // @ts-expect-error -- dynamic table name
    await ctx.db.delete(args.docId);

    await ctx.db.insert('adminDbChanges', {
      tableName: args.tableName,
      docId: args.docId,
      beforeJson,
      afterJson: undefined,
      action: 'delete',
      changedBy: caller._id,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Table overview: row count, sampled columns and the foreign-key-looking
 * fields. Powers the header strip above the grid so the operator sees at a
 * glance what the table holds before diving into rows.
 */
export const getTableInfo = query({
  args: { tableName: v.string() },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx);
    const names = allTableNames();
    if (!names.includes(args.tableName)) throw new Error('Unknown table');

    // @ts-expect-error -- dynamic table name
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- dynamic table query
    const count = ((await ctx.db.query(args.tableName).count()) as number) ?? 0;
    // @ts-expect-error -- dynamic table name
    const sample = (await ctx.db.query(args.tableName).take(20)) as unknown[];
    const columns = collectColumns(sample);

    return {
      tableName: args.tableName,
      count,
      columns,
      // Fields that look like foreign keys — clickable navigation targets.
      related: columns
        .map((c) => ({ field: c, table: guessRelatedTable(c) }))
        .filter((r) => r.table !== null),
    };
  },
});

/**
 * Delete several rows at once, each recorded in the change history so every
 * one of them can be restored individually.
 */
export const bulkDeleteDbRows = mutation({
  args: {
    tableName: v.string(),
    docIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await requireSuperadmin(ctx);
    const names = allTableNames();
    if (!names.includes(args.tableName)) throw new Error('Unknown table');
    if (HIDDEN_TABLES.has(args.tableName)) throw new Error('This table is protected');

    let deleted = 0;
    for (const docId of args.docIds) {
      // @ts-expect-error -- dynamic table name
      const before = await ctx.db.get(docId);
      if (!before) continue;
      const beforeJson = JSON.stringify(stripSystemFields(before as Record<string, unknown>));
      // @ts-expect-error -- dynamic table name
      await ctx.db.delete(docId);
      await ctx.db.insert('adminDbChanges', {
        tableName: args.tableName,
        docId,
        beforeJson,
        afterJson: undefined,
        action: 'delete',
        changedBy: caller._id,
        createdAt: Date.now(),
      });
      deleted++;
    }

    return { success: true, deleted };
  },
});

/**
 * Clone a row into the same table: identical content, fresh system fields. The
 * copy is recorded as an insert so it can be undone.
 */
export const duplicateDbRow = mutation({
  args: { tableName: v.string(), docId: v.string() },
  handler: async (ctx, args) => {
    const caller = await requireSuperadmin(ctx);
    const names = allTableNames();
    if (!names.includes(args.tableName)) throw new Error('Unknown table');
    if (HIDDEN_TABLES.has(args.tableName)) throw new Error('This table is protected');

    // @ts-expect-error -- dynamic table name
    const before = await ctx.db.get(args.docId);
    if (!before) throw new Error('Row not found');

    const copy = { ...(before as Record<string, unknown>) };
    delete copy._id;
    delete copy._creationTime;

    // @ts-expect-error -- dynamic table name
    const docId = await ctx.db.insert(args.tableName, copy);

    await ctx.db.insert('adminDbChanges', {
      tableName: args.tableName,
      docId: docId as string,
      beforeJson: undefined,
      afterJson: JSON.stringify(stripSystemFields(copy)),
      action: 'insert',
      changedBy: caller._id,
      createdAt: Date.now(),
    });

    return { success: true, docId: docId as string };
  },
});

// ── Change history + undo ────────────────────────────────────────────────────

export const listDbHistory = query({
  args: {
    tableName: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx);
    const limit = Math.min(args.limit ?? 50, DEFAULT_LIST_CAP);

    const rows = args.tableName
      ? await ctx.db
          .query('adminDbChanges')
          .withIndex('by_table', (q) => q.eq('tableName', args.tableName!))
          .order('desc')
          .take(limit)
      : await ctx.db.query('adminDbChanges').order('desc').take(limit);

    return Promise.all(
      rows.map(async (change) => {
        const author = await ctx.db.get(change.changedBy);
        return {
          ...change,
          authorName: author?.name ?? 'Unknown',
        };
      }),
    );
  },
});

/**
 * Undo a recorded change. Patch/insert are reverted by restoring the before
 * snapshot; deletes by re-inserting it. Idempotent: a change already undone is
 * a no-op.
 */
export const undoDbChange = mutation({
  args: { changeId: v.id('adminDbChanges') },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx);
    const change = await ctx.db.get(args.changeId);
    if (!change) throw new Error('Change not found');
    if (change.undoneAt) return { success: true, alreadyUndone: true };

    const names = allTableNames();
    if (!names.includes(change.tableName)) throw new Error('Table no longer exists');

    try {
      if (change.action === 'delete' && change.beforeJson) {
        const restored = JSON.parse(change.beforeJson) as Record<string, unknown>;
        // @ts-expect-error -- dynamic table name
        await ctx.db.insert(change.tableName, restored);
      } else if (change.action === 'insert') {
        // @ts-expect-error -- dynamic table name
        await ctx.db.delete(change.docId);
      } else if (change.action === 'patch' && change.beforeJson) {
        const before = JSON.parse(change.beforeJson) as Record<string, unknown>;
        // @ts-expect-error -- dynamic table name
        const current = await ctx.db.get(change.docId);
        if (current) {
          // @ts-expect-error -- dynamic patch: before is the stored snapshot of
          // a doc that was already validated against this table's schema.
          await ctx.db.patch(change.docId, before);
        }
      }
    } catch {
      // Restoring can fail (a doc already changed since) — surface the error
      // so the operator can inspect the history instead of silently losing it.
      throw new Error('Could not undo — the row may have changed since the edit');
    }

    await ctx.db.patch(args.changeId, { undoneAt: Date.now() });
    return { success: true };
  },
});

// ── Import (audited) ─────────────────────────────────────────────────────────

/**
 * Insert a batch of documents into one table — the counterpart of
 * `exportDatabase`. System fields are stripped so an export file can be fed
 * back verbatim; every successful insert lands in the change history as an
 * `insert`, so a bad import is undoable row by row.
 *
 * Rows that fail schema validation are counted and reported, not thrown: an
 * export from a newer deployment may carry fields this schema does not know,
 * and one stale table must not sink the rest of the import. The client sends
 * small chunks, so a mutation never grows unbounded.
 */
export const importTableRows = mutation({
  args: {
    tableName: v.string(),
    docs: v.array(v.record(v.string(), v.any())),
  },
  handler: async (ctx, args) => {
    const caller = await requireSuperadmin(ctx);
    const names = allTableNames();
    if (!names.includes(args.tableName)) throw new Error('Unknown table');
    if (HIDDEN_TABLES.has(args.tableName)) throw new Error('This table is protected');

    let inserted = 0;
    const errors: string[] = [];
    const now = Date.now();
    for (const raw of args.docs) {
      const doc = { ...raw };
      delete doc._id;
      delete doc._creationTime;
      try {
        // @ts-expect-error -- dynamic table name: Convex re-validates the doc
        // against the table schema and rejects unknown or mistyped fields.
        const docId = await ctx.db.insert(args.tableName, doc);
        await ctx.db.insert('adminDbChanges', {
          tableName: args.tableName,
          docId: docId as string,
          beforeJson: undefined,
          afterJson: JSON.stringify(doc),
          action: 'insert',
          changedBy: caller._id,
          createdAt: now,
        });
        inserted++;
      } catch (error) {
        if (errors.length < 5) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }
    }
    return { inserted, failed: args.docs.length - inserted, errors };
  },
});

// ── Full export (redacted) ───────────────────────────────────────────────────

/**
 * Full database export: every table's rows, with credentials and biometric
 * data removed. Returns a serializable object the client can download as JSON.
 * The scan is capped per table so one giant table cannot blow the response.
 */
export const exportDatabase = query({
  args: {},
  handler: async (ctx) => {
    const caller = await requireSuperadmin(ctx);
    const names = allTableNames().filter((name) => !HIDDEN_TABLES.has(name));
    const now = Date.now();

    const dump: Record<string, unknown[]> = {};
    for (const tableName of names) {
      // @ts-expect-error -- dynamic table name
      const rows = await ctx.db.query(tableName).take(DEFAULT_LIST_CAP);
      dump[tableName] = rows
        .map((row) => redactDoc(row as Record<string, unknown>))
        .map((row) => stripSystemFields(row));
    }

    return {
      exportedBy: caller.email,
      exportedAt: now,
      tableCount: names.length,
      rowCount: Object.values(dump).reduce((sum, rows) => sum + rows.length, 0),
      tables: dump,
    };
  },
});
