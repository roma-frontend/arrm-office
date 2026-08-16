/**
 * Superadmin trash — soft-deleted organizations and users with one-click
 * restore, and permanent purge for the rows that must really go away.
 *
 * Deleting is reversible by default: the rows keep `deletedAt`/`deletedBy`
 * and `isActive: false`, so nothing is lost until a purge. Every move and
 * restore lands in the global audit log.
 */

import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { getAuthCaller } from '../lib/getAuthCaller';
import { DEFAULT_LIST_CAP } from '../lib/limits';

async function requireSuperadmin(ctx: Parameters<typeof getAuthCaller>[0]) {
  const caller = await getAuthCaller(ctx);
  if (!caller || caller.role !== 'superadmin') {
    throw new Error('Only superadmins can use the trash');
  }
  return caller;
}

// ── List ─────────────────────────────────────────────────────────────────────

/** Deleted organizations and users, newest first. */
export const listTrash = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperadmin(ctx);

    const [orgs, users] = await Promise.all([
      ctx.db
        .query('organizations')
        .withIndex('by_deleted', (q) => q.gt('deletedAt', 0))
        .order('desc')
        .take(DEFAULT_LIST_CAP),
      ctx.db
        .query('users')
        .withIndex('by_deleted', (q) => q.gt('deletedAt', 0))
        .order('desc')
        .take(DEFAULT_LIST_CAP),
    ]);

    const orgIds = [...new Set(users.map((u) => u.organizationId).filter(Boolean))];
    const orgMap = new Map<string, { name: string } | null>();
    await Promise.all(
      orgIds.map(async (id) => {
        orgMap.set(id as string, (await ctx.db.get(id as never)) as { name: string } | null);
      }),
    );

    return {
      organizations: orgs.map((o) => ({
        id: o._id,
        name: o.name,
        slug: o.slug,
        deletedAt: o.deletedAt!,
        deletedBy: o.deletedBy ?? null,
      })),
      users: users.map((u) => ({
        id: u._id,
        name: u.name ?? 'Unknown',
        email: u.email ?? '',
        role: u.role,
        organizationName: u.organizationId ? orgMap.get(u.organizationId)?.name : undefined,
        deletedAt: u.deletedAt!,
        deletedBy: u.deletedBy ?? null,
      })),
    };
  },
});

// ── Move to trash ────────────────────────────────────────────────────────────

/** Soft-delete an organization and every user inside it. */
export const moveOrgToTrash = mutation({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, args) => {
    const caller = await requireSuperadmin(ctx);
    if (caller.organizationId === args.organizationId) {
      throw new Error('You cannot trash the organization you belong to');
    }
    const org = await ctx.db.get(args.organizationId);
    if (!org) throw new Error('Organization not found');
    if (org.deletedAt) return { success: true, alreadyInTrash: true };

    const now = Date.now();
    await ctx.db.patch(args.organizationId, {
      deletedAt: now,
      deletedBy: caller._id,
      isActive: false,
      updatedAt: now,
    });

    // Every member goes with the org so it stops producing active users.
    const members = await ctx.db
      .query('users')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .take(DEFAULT_LIST_CAP);
    await Promise.all(
      members.map((m) =>
        ctx.db.patch(m._id, {
          deletedAt: now,
          deletedBy: caller._id,
          isActive: false,
          sessionToken: undefined,
          sessionExpiry: undefined,
        }),
      ),
    );

    await ctx.db.insert('auditLogs', {
      organizationId: args.organizationId,
      userId: caller._id,
      action: 'superadmin.trash.org_move',
      target: args.organizationId,
      details: `Moved organization "${org.name}" to trash with ${members.length} users`,
      createdAt: now,
    });

    return { success: true, usersAffected: members.length };
  },
});

/** Soft-delete a single user. */
export const moveUserToTrash = mutation({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const caller = await requireSuperadmin(ctx);
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error('User not found');
    if (user.deletedAt) return { success: true, alreadyInTrash: true };
    if (user.role === 'superadmin') {
      throw new Error('You cannot trash another superadmin account');
    }

    const now = Date.now();
    await ctx.db.patch(args.userId, {
      deletedAt: now,
      deletedBy: caller._id,
      isActive: false,
      sessionToken: undefined,
      sessionExpiry: undefined,
    });

    await ctx.db.insert('auditLogs', {
      organizationId: user.organizationId ?? undefined,
      userId: caller._id,
      action: 'superadmin.trash.user_move',
      target: args.userId,
      details: `Moved user ${user.email ?? user.name ?? args.userId} to trash`,
      createdAt: now,
    });

    return { success: true };
  },
});

// ── Restore ──────────────────────────────────────────────────────────────────

/** Restore a soft-deleted organization and all users that went with it. */
export const restoreOrg = mutation({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, args) => {
    const caller = await requireSuperadmin(ctx);
    const org = await ctx.db.get(args.organizationId);
    if (!org) throw new Error('Organization not found');
    if (!org.deletedAt) return { success: true, notInTrash: true };

    const now = Date.now();
    await ctx.db.patch(args.organizationId, {
      deletedAt: undefined,
      deletedBy: undefined,
      isActive: true,
      updatedAt: now,
    });

    // Restore the members that were trashed together with this org.
    const members = await ctx.db
      .query('users')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .take(DEFAULT_LIST_CAP);
    await Promise.all(
      members
        .filter((m) => m.deletedAt)
        .map((m) =>
          ctx.db.patch(m._id, {
            deletedAt: undefined,
            deletedBy: undefined,
            isActive: true,
          }),
        ),
    );

    await ctx.db.insert('auditLogs', {
      organizationId: args.organizationId,
      userId: caller._id,
      action: 'superadmin.trash.org_restore',
      target: args.organizationId,
      details: `Restored organization "${org.name}" with ${members.filter((m) => m.deletedAt).length} users`,
      createdAt: now,
    });

    return { success: true, usersRestored: members.filter((m) => m.deletedAt).length };
  },
});

/** Restore a soft-deleted user. */
export const restoreUser = mutation({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const caller = await requireSuperadmin(ctx);
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error('User not found');
    if (!user.deletedAt) return { success: true, notInTrash: true };

    await ctx.db.patch(args.userId, {
      deletedAt: undefined,
      deletedBy: undefined,
      isActive: true,
    });

    await ctx.db.insert('auditLogs', {
      organizationId: user.organizationId ?? undefined,
      userId: caller._id,
      action: 'superadmin.trash.user_restore',
      target: args.userId,
      details: `Restored user ${user.email ?? user.name ?? args.userId}`,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

// ── Purge (permanent) ────────────────────────────────────────────────────────

/**
 * Permanently delete a soft-deleted user. Organizations are purged through
 * the existing cascade (`secureDeleteOrganization`) so the tombstone + batch
 * machinery stays in one place — the trash UI asks for slug confirmation.
 */
export const purgeUser = mutation({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const caller = await requireSuperadmin(ctx);
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error('User not found');

    await ctx.db.insert('auditLogs', {
      organizationId: user.organizationId ?? undefined,
      userId: caller._id,
      action: 'superadmin.trash.user_purge',
      target: args.userId,
      details: `Purged user ${user.email ?? user.name ?? args.userId}`,
      createdAt: Date.now(),
    });

    await ctx.db.delete(args.userId);
    return { success: true };
  },
});
