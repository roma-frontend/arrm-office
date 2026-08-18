import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import { MAX_PAGE_SIZE } from '../pagination';
import { getProfile } from '../lib/userProfile';
import { assertModuleAccess, assertQuota, incrementUsage } from '../lib/entitlements';

async function getUserOrgId(ctx: QueryCtx, userId: Id<'users'>): Promise<Id<'organizations'>> {
  const user = await ctx.db.get(userId);
  if (!user) throw new Error('User not found');
  if (!user.organizationId) throw new Error('User has no organization');
  return user.organizationId;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET MY CONVERSATIONS — sorted by lastMessageAt, with unread counts
// Uses chatConversations + chatMembers (shared with desktop)
// ─────────────────────────────────────────────────────────────────────────────
export const getMyConversations = query({
  args: {
    userId: v.id('users'),
    organizationId: v.optional(v.id('organizations')),
  },
  handler: async (ctx, args) => {
    const { userId } = args;
    const user = await ctx.db.get(userId);
    if (!user) return [];

    // For superadmin without org, get all memberships
    const memberships = await ctx.db
      .query('chatMembers')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .take(MAX_PAGE_SIZE);

    const conversations = await Promise.all(
      memberships
        .filter((m) => !m.isDeleted)
        .map(async (m) => {
          const conv = await ctx.db.get(m.conversationId);
          if (!conv || conv.isDeleted) return null;

          // For org-scoped users, only show their org conversations
          if (user.organizationId && conv.organizationId !== user.organizationId) return null;

          // For DMs: get other user's info
          let otherUser = null;
          if (conv.type === 'direct') {
            const allMembers = await ctx.db
              .query('chatMembers')
              .withIndex('by_conversation', (q) => q.eq('conversationId', conv._id))
              .take(MAX_PAGE_SIZE);
            const otherMember = allMembers.find((mm) => mm.userId !== userId);
            if (otherMember) {
              const u = await ctx.db.get(otherMember.userId);
              if (u) {
                const uProfile = await getProfile(ctx, u._id);
                otherUser = {
                  _id: u._id,
                  name: u.name,
                  avatarUrl: uProfile?.avatarUrl ?? u.avatarUrl,
                  presenceStatus: uProfile?.presenceStatus ?? u.presenceStatus,
                };
              }
            }
          }

          return {
            ...conv,
            unreadCount: m.unreadCount,
            isMuted: m.isMuted,
            lastReadAt: m.lastReadAt,
            otherUser,
            // Map desktop fields to what ConversationList expects
            lastMessagePreview: conv.lastMessageText
              ? conv.lastMessageSenderId
                ? conv.lastMessageText
                : conv.lastMessageText
              : undefined,
          };
        }),
    );

    return conversations.filter(Boolean).sort((a, b) => {
      if (a!.isPinned && !b!.isPinned) return -1;
      if (!a!.isPinned && b!.isPinned) return 1;
      return (b!.lastMessageAt ?? b!.createdAt) - (a!.lastMessageAt ?? a!.createdAt);
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET CONVERSATION INFO — participants + metadata
// ─────────────────────────────────────────────────────────────────────────────
export const getConversationInfo = query({
  args: {
    conversationId: v.id('chatConversations'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { conversationId, userId } = args;
    const membership = await ctx.db
      .query('chatMembers')
      .withIndex('by_conversation_user', (q) =>
        q.eq('conversationId', conversationId).eq('userId', userId),
      )
      .first();
    if (!membership) throw new Error('Not a member');

    const conv = await ctx.db.get(conversationId);
    if (!conv) throw new Error('Conversation not found');

    const members = await ctx.db
      .query('chatMembers')
      .withIndex('by_conversation', (q) => q.eq('conversationId', conversationId))
      .take(MAX_PAGE_SIZE);

    const enrichedParticipants = await Promise.all(
      members.map(async (m) => {
        const user = await ctx.db.get(m.userId);
        const userProfile = await getProfile(ctx, m.userId);
        return {
          ...m,
          // Map to expected shape
          userId: m.userId,
          userName: user?.name ?? 'Unknown',
          userAvatarUrl: userProfile?.avatarUrl ?? user?.avatarUrl,
          userEmail: user?.email,
          userRole: user?.role,
          userDepartment: userProfile?.department ?? user?.department,
        };
      }),
    );

    return {
      ...conv,
      // Map desktop type to mobile type for UI compat
      type: conv.type === 'direct' ? ('personal' as const) : ('group' as const),
      participants: enrichedParticipants,
      myRole: membership.role,
      isMuted: membership.isMuted,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET OR CREATE DM — 1-on-1 chat using chatConversations
// ─────────────────────────────────────────────────────────────────────────────
export const getOrCreatePersonalConversation = mutation({
  args: {
    userId: v.id('users'),
    otherUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'chat');
    const { userId, otherUserId } = args;
    if (userId === otherUserId) throw new Error('Cannot create conversation with yourself');

    const orgId = await getUserOrgId(ctx, userId);
    const ids = [userId, otherUserId].sort();
    const dmKey = ids.join('_');

    // Check existing DM
    const existing = await ctx.db
      .query('chatConversations')
      .withIndex('by_dm_key', (q) => q.eq('dmKey', dmKey))
      .first();
    if (existing) return existing._id;

    const now = Date.now();
    const convId = await ctx.db.insert('chatConversations', {
      organizationId: orgId,
      type: 'direct',
      createdBy: userId,
      dmKey,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert('chatMembers', {
      conversationId: convId,
      userId,
      organizationId: orgId,
      role: 'member',
      unreadCount: 0,
      isMuted: false,
      joinedAt: now,
    });

    await ctx.db.insert('chatMembers', {
      conversationId: convId,
      userId: otherUserId,
      organizationId: orgId,
      role: 'member',
      unreadCount: 0,
      isMuted: false,
      joinedAt: now,
    });

    return convId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// CREATE GROUP CONVERSATION
// ─────────────────────────────────────────────────────────────────────────────
export const createGroupConversation = mutation({
  args: {
    creatorId: v.id('users'),
    name: v.string(),
    participantIds: v.array(v.id('users')),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'chat');
    const { creatorId, name, participantIds } = args;
    const orgId = await getUserOrgId(ctx, creatorId);
    await assertQuota(ctx, 'chat', 'channels', 1);
    const now = Date.now();

    const convId = await ctx.db.insert('chatConversations', {
      organizationId: orgId,
      type: 'group',
      name,
      createdBy: creatorId,
      createdAt: now,
      updatedAt: now,
    });
    await incrementUsage(ctx, orgId, 'chat', 'channels', 1);

    // Add creator as owner
    await ctx.db.insert('chatMembers', {
      conversationId: convId,
      userId: creatorId,
      organizationId: orgId,
      role: 'owner',
      unreadCount: 0,
      isMuted: false,
      joinedAt: now,
    });

    // Add participants
    const uniqueIds = [...new Set(participantIds.filter((id) => id !== creatorId))];
    for (const uid of uniqueIds) {
      await ctx.db.insert('chatMembers', {
        conversationId: convId,
        userId: uid,
        organizationId: orgId,
        role: 'member',
        unreadCount: 0,
        isMuted: false,
        joinedAt: now,
      });
    }

    // System message
    const creator = await ctx.db.get(creatorId);
    await ctx.db.insert('chatMessages', {
      conversationId: convId,
      organizationId: orgId,
      senderId: creatorId,
      type: 'system',
      content: `${creator?.name ?? 'Someone'} created the group "${name}"`,
      createdAt: now,
    });

    // Audit log: group conversation created
    await ctx.db.insert('auditLogs', {
      organizationId: orgId,
      userId: creatorId,
      action: 'messenger_group_created',
      target: convId,
      details: JSON.stringify({ name, participantCount: uniqueIds.length + 1 }),
      createdAt: now,
    });

    return convId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE CONVERSATION — name
// ─────────────────────────────────────────────────────────────────────────────
export const updateConversation = mutation({
  args: {
    conversationId: v.id('chatConversations'),
    userId: v.id('users'),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { conversationId, userId, name } = args;
    const membership = await ctx.db
      .query('chatMembers')
      .withIndex('by_conversation_user', (q) =>
        q.eq('conversationId', conversationId).eq('userId', userId),
      )
      .first();
    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin'))
      throw new Error('Not authorized');

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (name !== undefined) patch.name = name;
    await ctx.db.patch(conversationId, patch);

    // Audit log: conversation updated
    await ctx.db.insert('auditLogs', {
      organizationId: membership.organizationId,
      userId,
      action: 'messenger_conversation_updated',
      target: conversationId,
      details: JSON.stringify({ name: name || 'metadata' }),
      createdAt: Date.now(),
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// LEAVE CONVERSATION
// ─────────────────────────────────────────────────────────────────────────────
export const leaveConversation = mutation({
  args: {
    conversationId: v.id('chatConversations'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { conversationId, userId } = args;
    const membership = await ctx.db
      .query('chatMembers')
      .withIndex('by_conversation_user', (q) =>
        q.eq('conversationId', conversationId).eq('userId', userId),
      )
      .first();
    if (!membership) return;

    await ctx.db.delete(membership._id);

    const conv = await ctx.db.get(conversationId);
    const user = await ctx.db.get(userId);
    if (conv) {
      await ctx.db.insert('chatMessages', {
        conversationId,
        organizationId: conv.organizationId,
        senderId: userId,
        type: 'system',
        content: `${user?.name ?? 'A member'} left the group`,
        createdAt: Date.now(),
      });

      // Audit log: user left conversation
      await ctx.db.insert('auditLogs', {
        organizationId: conv.organizationId,
        userId,
        action: 'messenger_user_left_conversation',
        target: conversationId,
        details: JSON.stringify({ userName: user?.name ?? 'Unknown' }),
        createdAt: Date.now(),
      });
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// ADD PARTICIPANTS
// ─────────────────────────────────────────────────────────────────────────────
export const addParticipants = mutation({
  args: {
    conversationId: v.id('chatConversations'),
    adminUserId: v.id('users'),
    userIds: v.array(v.id('users')),
  },
  handler: async (ctx, args) => {
    const { conversationId, adminUserId, userIds } = args;
    const conv = await ctx.db.get(conversationId);
    if (!conv || conv.type !== 'group') throw new Error('Not a group conversation');

    const adminM = await ctx.db
      .query('chatMembers')
      .withIndex('by_conversation_user', (q) =>
        q.eq('conversationId', conversationId).eq('userId', adminUserId),
      )
      .first();
    if (!adminM || (adminM.role !== 'owner' && adminM.role !== 'admin'))
      throw new Error('Not authorized');

    const now = Date.now();
    const admin = await ctx.db.get(adminUserId);
    const addedNames: string[] = [];

    // Batch-load all users upfront to avoid N+1 queries
    const usersBatch = await Promise.all(userIds.map((id) => ctx.db.get(id)));
    const userMap = new Map(
      usersBatch.filter((u): u is NonNullable<typeof u> => u !== null).map((u) => [u._id, u]),
    );

    // Batch-check existing memberships
    const allMemberships = await ctx.db
      .query('chatMembers')
      .withIndex('by_conversation', (q) => q.eq('conversationId', conversationId))
      .take(MAX_PAGE_SIZE);
    const existingMemberIds = new Set(allMemberships.map((m) => m.userId));

    for (const uid of userIds) {
      if (existingMemberIds.has(uid)) continue;

      await ctx.db.insert('chatMembers', {
        conversationId,
        userId: uid,
        organizationId: conv.organizationId,
        role: 'member',
        unreadCount: 0,
        isMuted: false,
        joinedAt: now,
      });

      const user = userMap.get(uid);
      if (user) addedNames.push(user.name);
    }

    if (addedNames.length > 0) {
      await ctx.db.insert('chatMessages', {
        conversationId,
        organizationId: conv.organizationId,
        senderId: adminUserId,
        type: 'system',
        content: `${admin?.name ?? 'Admin'} added ${addedNames.join(', ')}`,
        createdAt: now,
      });

      // Audit log: participants added
      await ctx.db.insert('auditLogs', {
        organizationId: conv.organizationId,
        userId: adminUserId,
        action: 'messenger_participants_added',
        target: conversationId,
        details: JSON.stringify({ addedNames, count: addedNames.length }),
        createdAt: now,
      });
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// REMOVE PARTICIPANT
// ─────────────────────────────────────────────────────────────────────────────
export const removeParticipant = mutation({
  args: {
    conversationId: v.id('chatConversations'),
    adminUserId: v.id('users'),
    targetUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { conversationId, adminUserId, targetUserId } = args;
    const adminM = await ctx.db
      .query('chatMembers')
      .withIndex('by_conversation_user', (q) =>
        q.eq('conversationId', conversationId).eq('userId', adminUserId),
      )
      .first();
    if (!adminM || (adminM.role !== 'owner' && adminM.role !== 'admin'))
      throw new Error('Not authorized');

    const targetM = await ctx.db
      .query('chatMembers')
      .withIndex('by_conversation_user', (q) =>
        q.eq('conversationId', conversationId).eq('userId', targetUserId),
      )
      .first();
    if (!targetM) throw new Error('User is not a member');

    await ctx.db.delete(targetM._id);

    const conv = await ctx.db.get(conversationId);
    const admin = await ctx.db.get(adminUserId);
    const target = await ctx.db.get(targetUserId);
    if (conv) {
      await ctx.db.insert('chatMessages', {
        conversationId,
        organizationId: conv.organizationId,
        senderId: adminUserId,
        type: 'system',
        content: `${admin?.name ?? 'Admin'} removed ${target?.name ?? 'a member'}`,
        createdAt: Date.now(),
      });

      // Audit log: participant removed
      await ctx.db.insert('auditLogs', {
        organizationId: conv.organizationId,
        userId: adminUserId,
        action: 'messenger_participant_removed',
        target: conversationId,
        details: JSON.stringify({
          removedUserId: targetUserId,
          removedUserName: target?.name ?? 'Unknown',
        }),
        createdAt: Date.now(),
      });
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// TOGGLE MUTE
// ─────────────────────────────────────────────────────────────────────────────
export const toggleMute = mutation({
  args: {
    conversationId: v.id('chatConversations'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { conversationId, userId } = args;
    const membership = await ctx.db
      .query('chatMembers')
      .withIndex('by_conversation_user', (q) =>
        q.eq('conversationId', conversationId).eq('userId', userId),
      )
      .first();
    if (!membership) throw new Error('Not a member');

    await ctx.db.patch(membership._id, { isMuted: !membership.isMuted });

    // Audit log: conversation muted/unmuted
    await ctx.db.insert('auditLogs', {
      organizationId: membership.organizationId,
      userId,
      action: membership.isMuted
        ? 'messenger_conversation_unmuted'
        : 'messenger_conversation_muted',
      target: conversationId,
      details: JSON.stringify({ muted: !membership.isMuted }),
      createdAt: Date.now(),
    });

    return !membership.isMuted;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// MARK CONVERSATION READ
// ─────────────────────────────────────────────────────────────────────────────
export const markConversationRead = mutation({
  args: {
    conversationId: v.id('chatConversations'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { conversationId, userId } = args;
    const membership = await ctx.db
      .query('chatMembers')
      .withIndex('by_conversation_user', (q) =>
        q.eq('conversationId', conversationId).eq('userId', userId),
      )
      .first();
    if (!membership) return;

    const now = Date.now();
    await ctx.db.patch(membership._id, { lastReadAt: now, unreadCount: 0 });

    // Audit log: conversation marked as read
    await ctx.db.insert('auditLogs', {
      organizationId: membership.organizationId,
      userId,
      action: 'messenger_conversation_marked_read',
      target: conversationId,
      details: JSON.stringify({ markedAt: now }),
      createdAt: now,
    });

    // Stamp readBy on recent unread messages
    const recent = await ctx.db
      .query('chatMessages')
      .withIndex('by_conversation_created', (q) => q.eq('conversationId', conversationId))
      .order('desc')
      .take(20);

    for (const msg of recent) {
      if (msg.senderId === userId) continue;
      const readBy: Array<{ userId: Id<'users'>; readAt: number }> = (msg.readBy ?? []) as Array<{
        userId: Id<'users'>;
        readAt: number;
      }>;
      const existing = readBy.find((r) => r.userId === userId);
      if (existing && existing.readAt > 0) continue; // Already read
      // Update delivered (-1) to read, or add new entry
      const updated = readBy.filter((r) => r.userId !== userId);
      updated.push({ userId, readAt: now });
      await ctx.db.patch(msg._id, { readBy: updated });
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// PIN CONVERSATION
// ─────────────────────────────────────────────────────────────────────────────
export const pinConversation = mutation({
  args: {
    conversationId: v.id('chatConversations'),
    userId: v.id('users'),
    pin: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { conversationId, userId, pin } = args;
    const membership = await ctx.db
      .query('chatMembers')
      .withIndex('by_conversation_user', (q) =>
        q.eq('conversationId', conversationId).eq('userId', userId),
      )
      .first();
    if (!membership) throw new Error('Not a member');

    await ctx.db.patch(conversationId, { isPinned: pin });

    // Audit log: conversation pinned/unpinned
    await ctx.db.insert('auditLogs', {
      organizationId: membership.organizationId,
      userId,
      action: pin ? 'messenger_conversation_pinned' : 'messenger_conversation_unpinned',
      target: conversationId,
      details: JSON.stringify({ pinned: pin }),
      createdAt: Date.now(),
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// ARCHIVE CONVERSATION
// ─────────────────────────────────────────────────────────────────────────────
export const archiveConversation = mutation({
  args: {
    conversationId: v.id('chatConversations'),
    userId: v.id('users'),
    archive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { conversationId, userId, archive } = args;
    const membership = await ctx.db
      .query('chatMembers')
      .withIndex('by_conversation_user', (q) =>
        q.eq('conversationId', conversationId).eq('userId', userId),
      )
      .first();
    if (!membership) throw new Error('Not a member');

    await ctx.db.patch(conversationId, { isArchived: archive });

    // Audit log: conversation archived/unarchived
    await ctx.db.insert('auditLogs', {
      organizationId: membership.organizationId,
      userId,
      action: archive ? 'messenger_conversation_archived' : 'messenger_conversation_unarchived',
      target: conversationId,
      details: JSON.stringify({ archived: archive }),
      createdAt: Date.now(),
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE CONVERSATION (soft delete)
// ─────────────────────────────────────────────────────────────────────────────
export const deleteConversation = mutation({
  args: {
    conversationId: v.id('chatConversations'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { conversationId, userId } = args;
    const membership = await ctx.db
      .query('chatMembers')
      .withIndex('by_conversation_user', (q) =>
        q.eq('conversationId', conversationId).eq('userId', userId),
      )
      .first();
    if (!membership) throw new Error('Not a member');

    await ctx.db.patch(membership._id, {
      isDeleted: true,
      deletedAt: Date.now(),
    });

    // Audit log: conversation deleted (soft)
    await ctx.db.insert('auditLogs', {
      organizationId: membership.organizationId,
      userId,
      action: 'messenger_conversation_deleted',
      target: conversationId,
      details: JSON.stringify({ softDelete: true }),
      createdAt: Date.now(),
    });
  },
});
