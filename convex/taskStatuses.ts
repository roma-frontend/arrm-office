/**
 * Status sets — the organization's own board columns.
 *
 * A set is a named list of statuses (*Unpaid → Ready to pay → Paid*) that a
 * project can adopt. The reading side is open to anyone who can see the board,
 * because a task cannot be rendered without knowing the columns; the writing side
 * is staff-only, and promoting a set to the organization's default is admin-only,
 * since that changes what every project without an explicit choice inherits.
 *
 * The invariant this module exists to protect: **`statusKey` and `status` must
 * never disagree.** Anything that can change the meaning of a status calls
 * `resyncCanonicalStatus`, which brings the affected tasks' canonical status
 * along. See the header of `lib/taskStatus.ts` for why there are two.
 */

import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { SMALL_LIST_CAP } from './lib/limits';
import { assertModuleAccess } from './lib/entitlements';
import { assertOrgStaff, resolveOrgScope, scopeOwnsRecord } from './lib/orgAccess';
import { resolveStatusSet, resyncCanonicalStatus } from './lib/taskConfig';
import {
  DEFAULT_STATUS_SET,
  DEFAULT_STATUS_SET_NAME,
  assertValidStatusSet,
  changedCanonicalStatuses,
  normalizeStatuses,
  sortStatuses,
  taskStatusDefValidator,
} from './lib/taskStatus';
import { sanitizeTitle } from './lib/sanitize';

/**
 * A menu label, not prose. The status editor enforces the same bound so the
 * error arrives before the round trip.
 */
const MAX_SET_NAME_LENGTH = 60;

/** Trimmed, bounded, and never empty — the set name is a label in a menu. */
function cleanSetName(raw: string): string {
  const name = sanitizeTitle(raw, MAX_SET_NAME_LENGTH);
  if (name === '') throw new ConvexError('A status set needs a name');
  return name;
}

// ── Reading ────────────────────────────────────────────────────────────────
/**
 * Every set the organization has authored.
 *
 * Returns `[]` rather than throwing for a caller with no organization, so a page
 * that loses access mid-session renders empty instead of tripping an error
 * boundary — the convention `resolveOrgScope` exists for.
 *
 * An organization that has never opened the editor gets an empty list, and the
 * board falls back to {@link DEFAULT_STATUS_SET}. `builtIn` describes that
 * fallback so the editor can offer "start from the default set" without
 * duplicating the five statuses on the client.
 */
export const listStatusSets = query({
  args: { organizationId: v.optional(v.id('organizations')) },
  handler: async (ctx, args) => {
    const scope = await resolveOrgScope(ctx, args.organizationId);
    const builtIn = {
      name: DEFAULT_STATUS_SET_NAME,
      statuses: sortStatuses(DEFAULT_STATUS_SET),
    };
    if (!scope?.organizationId) return { sets: [], builtIn };

    const sets = await ctx.db
      .query('taskStatusSets')
      .withIndex('by_org', (q) => q.eq('organizationId', scope.organizationId!))
      .take(SMALL_LIST_CAP);

    return {
      sets: sets
        .map((set) => ({ ...set, statuses: sortStatuses(set.statuses) }))
        .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name)),
      builtIn,
    };
  },
});

/**
 * The statuses one board actually uses, after the whole fallback chain.
 *
 * This is what every task surface calls on mount. It answers for the all-tasks
 * board too (no `projectId`), which resolves to the organization's default.
 */
export const resolveForProject = query({
  args: {
    projectId: v.optional(v.id('projects')),
    organizationId: v.optional(v.id('organizations')),
  },
  handler: async (ctx, args) => {
    const scope = await resolveOrgScope(ctx, args.organizationId);
    if (!scope) {
      return { statuses: sortStatuses(DEFAULT_STATUS_SET), source: 'default' as const };
    }

    // A project id from another organization must not be allowed to reveal that
    // organization's status names. Dropping it degrades to the caller's own
    // default rather than erroring, which is what the board wants.
    let projectId = args.projectId;
    if (projectId) {
      const project = await ctx.db.get(projectId);
      if (!scopeOwnsRecord(scope, project)) projectId = undefined;
    }

    return resolveStatusSet(ctx, scope.organizationId, projectId);
  },
});

// ── Writing ────────────────────────────────────────────────────────────────
/**
 * A new set.
 *
 * Staff rather than admin-only: in practice the person who owns a board is the
 * one who knows what its columns should be called, and requiring an admin for
 * every new set is how a feature like this goes unused. Making a set the
 * organization-wide default is the admin's call — see {@link setDefaultStatusSet}.
 *
 * The first set an organization creates becomes its default, because otherwise it
 * would sit there governing nothing and the author would reasonably conclude the
 * feature is broken.
 */
export const createStatusSet = mutation({
  args: {
    name: v.string(),
    statuses: v.array(taskStatusDefValidator),
    organizationId: v.optional(v.id('organizations')),
    /** Adopt it as the organization's default. Ignored for a non-admin. */
    makeDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'tasks');
    const scope = await assertOrgStaff(ctx, args.organizationId);
    const organizationId = scope.organizationId;
    if (!organizationId) throw new ConvexError('An organization is required');

    const name = cleanSetName(args.name);
    const statuses = normalizeStatuses(args.statuses);
    assertValidStatusSet(statuses);

    const existing = await ctx.db
      .query('taskStatusSets')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(SMALL_LIST_CAP);
    if (existing.length >= SMALL_LIST_CAP) {
      throw new ConvexError('Too many status sets');
    }

    const isDefault = existing.length === 0 || (!!args.makeDefault && scope.isAdmin);
    if (isDefault) {
      await Promise.all(
        existing
          .filter((set) => set.isDefault)
          .map((set) => ctx.db.patch(set._id, { isDefault: false, updatedAt: Date.now() })),
      );
    }

    const now = Date.now();
    const setId = await ctx.db.insert('taskStatusSets', {
      organizationId,
      name,
      isDefault,
      statuses,
      createdBy: scope.caller._id,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert('auditLogs', {
      organizationId,
      userId: scope.caller._id,
      action: 'task_status_set_created',
      target: setId,
      details: JSON.stringify({ name, statusCount: statuses.length, isDefault }),
      createdAt: now,
    });

    return setId;
  },
});

/**
 * Rename a set, or change its statuses.
 *
 * The statuses are replaced wholesale rather than patched item by item, because
 * the editor is a reorderable list and a diff of it is the client's problem to
 * describe and the server's problem to disbelieve. What the server does care
 * about is the consequence: any status whose `type` changed takes the tasks in it
 * with it, so a column re-typed from *active* to *done* stops being counted as
 * work in progress everywhere else in the product.
 *
 * A status *removed* from the set is deliberately left alone. Tasks keep the
 * dangling `statusKey`, and `resolveStatus` lands them on the status of the same
 * meaning — so a column deleted by accident and re-added keeps its contents.
 */
export const updateStatusSet = mutation({
  args: {
    setId: v.id('taskStatusSets'),
    name: v.optional(v.string()),
    statuses: v.optional(v.array(taskStatusDefValidator)),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'tasks');
    const set = await ctx.db.get(args.setId);
    if (!set) throw new ConvexError('Status set not found');

    const scope = await assertOrgStaff(ctx, set.organizationId);
    if (!scopeOwnsRecord(scope, set)) {
      throw new ConvexError('That status set belongs to another organization');
    }

    const now = Date.now();
    const patch: {
      name?: string;
      statuses?: typeof set.statuses;
      updatedAt: number;
    } = { updatedAt: now };

    if (args.name !== undefined) patch.name = cleanSetName(args.name);

    let resynced = 0;
    if (args.statuses !== undefined) {
      const statuses = normalizeStatuses(args.statuses);
      assertValidStatusSet(statuses);
      patch.statuses = statuses;

      const changed = changedCanonicalStatuses(set.statuses, statuses);
      resynced = await resyncCanonicalStatus(ctx, {
        organizationId: set.organizationId,
        setId: set._id,
        changed,
      });
    }

    await ctx.db.patch(args.setId, patch);

    await ctx.db.insert('auditLogs', {
      organizationId: set.organizationId,
      userId: scope.caller._id,
      action: 'task_status_set_updated',
      target: args.setId,
      details: JSON.stringify({
        name: patch.name ?? set.name,
        statusCount: patch.statuses?.length ?? set.statuses.length,
        tasksResynced: resynced,
      }),
      createdAt: now,
    });

    return { resynced };
  },
});

/**
 * Adopt a set as the organization's default.
 *
 * Admin-only, unlike the rest of this module: the default governs every project
 * that has not chosen for itself, so this is the one operation here whose blast
 * radius is the whole organization.
 *
 * Switching the default changes what tasks with no project — and projects with no
 * explicit set — resolve to, which can change their canonical status. Both the
 * outgoing and incoming set are re-synced, in that order, so a task governed by
 * the old default is left agreeing with the new one.
 */
export const setDefaultStatusSet = mutation({
  args: { setId: v.id('taskStatusSets') },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'tasks');
    const set = await ctx.db.get(args.setId);
    if (!set) throw new ConvexError('Status set not found');

    const scope = await assertOrgStaff(ctx, set.organizationId, { adminOnly: true });
    if (!scopeOwnsRecord(scope, set)) {
      throw new ConvexError('That status set belongs to another organization');
    }
    if (set.isDefault) return { resynced: 0 };

    const now = Date.now();
    const siblings = await ctx.db
      .query('taskStatusSets')
      .withIndex('by_org_default', (q) =>
        q.eq('organizationId', set.organizationId).eq('isDefault', true),
      )
      .take(SMALL_LIST_CAP);

    for (const sibling of siblings) {
      await ctx.db.patch(sibling._id, { isDefault: false, updatedAt: now });
    }
    await ctx.db.patch(args.setId, { isDefault: true, updatedAt: now });

    // Tasks previously governed by the old default may now resolve through this
    // set's statuses, and a key shared by both sets can mean something different
    // in each. `changedCanonicalStatuses` compares by key, which is exactly the
    // comparison wanted here: only a key present in both, with a different type,
    // needs a write.
    let resynced = 0;
    for (const sibling of siblings) {
      resynced += await resyncCanonicalStatus(ctx, {
        organizationId: set.organizationId,
        setId: args.setId,
        changed: changedCanonicalStatuses(sibling.statuses, set.statuses),
      });
    }

    await ctx.db.insert('auditLogs', {
      organizationId: set.organizationId,
      userId: scope.caller._id,
      action: 'task_status_set_default_changed',
      target: args.setId,
      details: JSON.stringify({ name: set.name, tasksResynced: resynced }),
      createdAt: now,
    });

    return { resynced };
  },
});

/**
 * Delete a set.
 *
 * Refused while a project points at it. That is not a technical limitation —
 * the fallback chain would cope perfectly well — but a project silently losing
 * its columns because somebody tidied up an unrelated menu is the kind of
 * surprise that makes a feature untrustworthy. The error names the projects so
 * the author can decide.
 *
 * Deleting the organization's *default* set is allowed, and lands the whole
 * organization back on the built-in five. Tasks keep their `statusKey` and are
 * displayed by meaning; nothing is lost, and re-creating the set restores them.
 */
export const deleteStatusSet = mutation({
  args: { setId: v.id('taskStatusSets') },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'tasks');
    const set = await ctx.db.get(args.setId);
    if (!set) throw new ConvexError('Status set not found');

    const scope = await assertOrgStaff(ctx, set.organizationId);
    if (!scopeOwnsRecord(scope, set)) {
      throw new ConvexError('That status set belongs to another organization');
    }

    const projects = await ctx.db
      .query('projects')
      .withIndex('by_org', (q) => q.eq('organizationId', set.organizationId))
      .take(SMALL_LIST_CAP);
    const inUse = projects.filter((p) => p.statusSetId === args.setId);
    if (inUse.length > 0) {
      const names = inUse
        .slice(0, 3)
        .map((p) => p.name)
        .join(', ');
      throw new ConvexError(
        inUse.length > 3
          ? `Still used by ${names} and ${inUse.length - 3} more`
          : `Still used by ${names}`,
      );
    }

    const now = Date.now();
    await ctx.db.delete(args.setId);

    await ctx.db.insert('auditLogs', {
      organizationId: set.organizationId,
      userId: scope.caller._id,
      action: 'task_status_set_deleted',
      target: args.setId,
      details: JSON.stringify({ name: set.name, wasDefault: set.isDefault }),
      createdAt: now,
    });
  },
});

/**
 * Attach a set to a project, or clear the attachment so it inherits again.
 *
 * Lives here rather than in `projects.ts` because the interesting part is not the
 * one-field patch — it is the re-sync that has to follow it. A project moving
 * from a set where *Ready to pay* means "active" to one where it means "done"
 * changes what every report says about that project's tasks.
 */
export const setProjectStatusSet = mutation({
  args: {
    projectId: v.id('projects'),
    /** Absent clears the override, so the project inherits the org default. */
    setId: v.optional(v.id('taskStatusSets')),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'tasks');
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new ConvexError('Project not found');

    const scope = await assertOrgStaff(ctx, project.organizationId);
    if (!scopeOwnsRecord(scope, project)) {
      throw new ConvexError('That project belongs to another organization');
    }
    const organizationId = project.organizationId;
    if (!organizationId) throw new ConvexError('An organization is required');

    const before = await resolveStatusSet(ctx, organizationId, args.projectId);

    if (args.setId) {
      const set = await ctx.db.get(args.setId);
      if (!set || !scopeOwnsRecord(scope, set)) {
        throw new ConvexError('Status set not found');
      }
    }

    const now = Date.now();
    await ctx.db.patch(args.projectId, { statusSetId: args.setId, updatedAt: now });

    const after = await resolveStatusSet(ctx, organizationId, args.projectId);
    let resynced = 0;
    if (after.setId) {
      resynced = await resyncCanonicalStatus(ctx, {
        organizationId,
        setId: after.setId,
        changed: changedCanonicalStatuses(before.statuses, after.statuses),
      });
    } else {
      // Back to the built-in set, which has no row to key a re-sync on. Its keys
      // *are* the canonical statuses, so a task whose key survives already
      // agrees; one whose key does not is resolved by meaning on read. Nothing
      // to write.
      resynced = 0;
    }

    await ctx.db.insert('auditLogs', {
      organizationId,
      userId: scope.caller._id,
      action: 'project_status_set_changed',
      target: args.projectId,
      details: JSON.stringify({
        project: project.name,
        from: before.setId ?? 'built-in',
        to: after.setId ?? 'built-in',
        tasksResynced: resynced,
      }),
      createdAt: now,
    });

    return { resynced };
  },
});
