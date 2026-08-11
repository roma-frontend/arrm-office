import { v } from 'convex/values';
import { query, mutation, internalMutation } from '../_generated/server';
import { internal } from '../_generated/api';
import type {
  GenericDatabaseWriter,
  GenericDataModel,
  GenericDocument,
  PaginationResult,
} from 'convex/server';
import { requireAuthUserOrThrow } from '../lib/auth';
import { DEFAULT_LIST_CAP } from '../lib/limits';
import schema from '../schema';

async function requireSuperadmin(ctx: Parameters<typeof requireAuthUserOrThrow>[0]) {
  const caller = await requireAuthUserOrThrow(ctx);
  if (caller.role !== 'superadmin') {
    throw new Error('Only superadmins can manage organizations');
  }
  return caller;
}

/**
 * Public projection used by the app to render the freeze screen (at login and
 * as an in-app gate). Exposes only the fact of the freeze and its reason —
 * the reason is meant to be shown to the organization's employees anyway.
 */
export const getFreezeState = query({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.organizationId);
    if (!org?.frozenAt) return { frozen: false, reason: null, frozenAt: null };
    return { frozen: true, reason: org.frozenReason ?? null, frozenAt: org.frozenAt };
  },
});

/**
 * Temporarily freeze an organization: logins are rejected with the reason,
 * live sessions lose all Convex access (getAuthCaller/rbac treat the caller
 * as unauthenticated / unauthorized) and the app shows a freeze screen.
 * Data is untouched; unfreeze restores everything.
 */
export const freezeOrganization = mutation({
  args: {
    organizationId: v.id('organizations'),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const caller = await requireSuperadmin(ctx);
    const reason = args.reason.trim();
    if (!reason) throw new Error('A freeze reason is required — employees will see it');

    const org = await ctx.db.get(args.organizationId);
    if (!org) throw new Error('Organization not found');
    if (org.frozenAt) throw new Error('Organization is already frozen');

    const now = Date.now();
    await ctx.db.patch(args.organizationId, {
      frozenAt: now,
      frozenBy: caller._id,
      frozenReason: reason,
      updatedAt: now,
    });

    // Kill cookie sessions so the freeze takes effect at the next login; live
    // Convex connections degrade to unauthenticated on the very next request.
    const members = await ctx.db
      .query('users')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .take(DEFAULT_LIST_CAP);
    for (const member of members) {
      if (member.sessionToken) {
        await ctx.db.patch(member._id, {
          sessionToken: undefined,
          sessionExpiry: undefined,
        });
      }
    }

    await ctx.db.insert('auditLogs', {
      organizationId: args.organizationId,
      userId: caller._id,
      action: 'organization_frozen',
      details: JSON.stringify({ reason, orgName: org.name }),
      createdAt: now,
    });
    return true;
  },
});

export const unfreezeOrganization = mutation({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, args) => {
    const caller = await requireSuperadmin(ctx);
    const org = await ctx.db.get(args.organizationId);
    if (!org) throw new Error('Organization not found');
    if (!org.frozenAt) throw new Error('Organization is not frozen');

    const now = Date.now();
    await ctx.db.patch(args.organizationId, {
      frozenAt: undefined,
      frozenBy: undefined,
      frozenReason: undefined,
      updatedAt: now,
    });

    await ctx.db.insert('auditLogs', {
      organizationId: args.organizationId,
      userId: caller._id,
      action: 'organization_unfrozen',
      details: JSON.stringify({ orgName: org.name, wasFrozenAt: org.frozenAt }),
      createdAt: now,
    });
    return true;
  },
});

/**
 * Hard delete an organization and every document that belongs to it.
 * Confirmation by slug (type-it-in) guards against misclicks; the purge runs
 * in batched internal mutations so even large tenants stay within function
 * limits, and the orgDeletions row makes the sweep resumable and auditable.
 */
export const secureDeleteOrganization = mutation({
  args: {
    organizationId: v.id('organizations'),
    confirmSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const caller = await requireSuperadmin(ctx);
    if (caller.organizationId === args.organizationId) {
      throw new Error('You cannot delete the organization you belong to');
    }

    const org = await ctx.db.get(args.organizationId);
    if (!org) throw new Error('Organization not found');
    if (org.slug !== args.confirmSlug.trim()) {
      throw new Error('Confirmation slug does not match');
    }

    const running = await ctx.db
      .query('orgDeletions')
      .withIndex('by_org', (q) => q.eq('organizationId', org._id))
      .filter((q) => q.eq(q.field('status'), 'in_progress'))
      .first();
    if (running) throw new Error('Deletion is already in progress');

    // A tenant being deleted must lose access immediately, even before the
    // sweep finishes — the freeze gate covers logins and live sessions.
    if (!org.frozenAt) {
      await ctx.db.patch(org._id, {
        frozenAt: Date.now(),
        frozenBy: caller._id,
        frozenReason: 'Organization is being deleted',
        updatedAt: Date.now(),
      });
    }

    const deletionId = await ctx.db.insert('orgDeletions', {
      organizationId: org._id,
      organizationName: org.name,
      requestedBy: caller._id,
      status: 'in_progress',
      tableIndex: 0,
      deletedDocs: 0,
      startedAt: Date.now(),
    });

    // Tombstone outside the org so the decision survives the purge.
    await ctx.db.insert('auditLogs', {
      userId: caller._id,
      action: 'organization_delete_started',
      target: org._id,
      details: JSON.stringify({ orgName: org.name, slug: org.slug }),
      createdAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.superadmin.purgeOrganizationData, {
      deletionId,
    });
    return deletionId;
  },
});

// Tables handled outside the generic sweep.
const SKIP_TABLES = new Set(['users', 'organizations', 'orgDeletions']);

// Fields that reference a user document. Convex ids embed their table name,
// so a users id can never false-match a reference to another table.
const USER_REF_FIELDS = [
  'userId',
  'employeeId',
  'assignedTo',
  'assignedBy',
  'createdBy',
  'managerId',
  'supervisorId',
  'approvedBy',
  'reviewedBy',
  'completedBy',
  'uploadedBy',
  'requesterId',
  'initiatedBy',
  'buddyId',
  'extendedBy',
  'suspendedBy',
  'deletedBy',
  'ownerId',
  'authorId',
  'memberId',
  'participantId',
] as const;

const DELETE_BUDGET_PER_RUN = 1000;

function isOrgData(doc: Record<string, unknown>, orgId: string, userSet: Set<string>): boolean {
  if (doc.organizationId === orgId) return true;
  for (const field of USER_REF_FIELDS) {
    const value = doc[field];
    if (typeof value === 'string' && userSet.has(value)) return true;
  }
  return false;
}

/**
 * Batched cascade purge. One pass per invocation: walk every schema table,
 * delete documents that belong to the org (by organizationId or by a user
 * reference into the org's users), then delete the users and finally the org
 * itself. Reschedules itself until done.
 */
export const purgeOrganizationData = internalMutation({
  args: { deletionId: v.id('orgDeletions') },
  handler: async (ctx, args) => {
    const control = await ctx.db.get(args.deletionId);
    if (!control || control.status === 'done') return;
    const orgId = control.organizationId as string;

    // Generic writer so the sweep can address any table by name.
    const db = ctx.db as unknown as GenericDatabaseWriter<GenericDataModel>;

    const orgUsers = await ctx.db
      .query('users')
      .withIndex('by_org', (q) => q.eq('organizationId', control.organizationId))
      .take(DEFAULT_LIST_CAP);
    const userSet = new Set<string>(orgUsers.map((u) => u._id as string));

    let budget = DELETE_BUDGET_PER_RUN;
    let deleted = control.deletedDocs;
    let tableIndex = control.tableIndex;

    const tables = Object.keys(schema.tables);
    for (; tableIndex < tables.length && budget > 0; tableIndex++) {
      const table = tables[tableIndex]!;
      if (SKIP_TABLES.has(table)) continue;

      // Full paginated walk; collect victims first, delete after, so the
      // cursor is never invalidated mid-walk.
      const victims: string[] = [];
      let cursor: string | null = null;
      do {
        const page: PaginationResult<GenericDocument> = await db
          .query(table)
          .paginate({ numItems: 200, cursor });
        for (const doc of page.page) {
          if (isOrgData(doc as Record<string, unknown>, orgId, userSet)) {
            victims.push(String(doc._id));
          }
        }
        cursor = page.isDone ? null : page.continueCursor;
      } while (cursor);

      if (victims.length === 0) continue;
      const slice = victims.slice(0, budget);
      for (const id of slice) {
        const gid = db.normalizeId(table, id);
        if (gid) await db.delete(gid);
      }
      deleted += slice.length;
      budget -= slice.length;
      if (slice.length < victims.length) {
        // Budget exhausted mid-table: stay on this table; the deleted slice
        // is gone, so the next pass walks the remainder.
        await ctx.db.patch(args.deletionId, { tableIndex, deletedDocs: deleted });
        await ctx.scheduler.runAfter(0, internal.superadmin.purgeOrganizationData, {
          deletionId: args.deletionId,
        });
        return;
      }
    }

    if (budget <= 0) {
      await ctx.db.patch(args.deletionId, { tableIndex, deletedDocs: deleted });
      await ctx.scheduler.runAfter(0, internal.superadmin.purgeOrganizationData, {
        deletionId: args.deletionId,
      });
      return;
    }

    // All tables swept — remove the member accounts, then the org itself.
    for (const user of orgUsers) {
      await ctx.db.delete(user._id);
      deleted++;
    }
    const leftover = await ctx.db
      .query('users')
      .withIndex('by_org', (q) => q.eq('organizationId', control.organizationId))
      .take(DEFAULT_LIST_CAP);
    if (leftover.length > 0) {
      // Org larger than one user batch: finish users on the next pass.
      await ctx.db.patch(args.deletionId, {
        tableIndex: tables.length,
        deletedDocs: deleted,
      });
      await ctx.scheduler.runAfter(0, internal.superadmin.purgeOrganizationData, {
        deletionId: args.deletionId,
      });
      return;
    }

    await ctx.db.delete(control.organizationId);
    await ctx.db.patch(args.deletionId, {
      status: 'done',
      deletedDocs: deleted,
      completedAt: Date.now(),
    });
  },
});
