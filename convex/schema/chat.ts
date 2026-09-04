import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const chat = {
  chatConversations: defineTable({
    organizationId: v.optional(v.id('organizations')),
    type: v.union(v.literal('direct'), v.literal('group')),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    createdBy: v.id('users'),
    lastMessageAt: v.optional(v.number()),
    lastMessageText: v.optional(v.string()),
    lastMessageSenderId: v.optional(v.id('users')),
    dmKey: v.optional(v.string()),
    isPinned: v.optional(v.boolean()),
    isArchived: v.optional(v.boolean()),
    isDeleted: v.optional(v.boolean()),
    deletedBy: v.optional(v.id('users')),
    deletedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_org_last', ['organizationId', 'lastMessageAt'])
    .index('by_org_not_deleted', ['organizationId', 'isDeleted'])
    .index('by_org_pinned', ['organizationId', 'isPinned'])
    .index('by_org_archived', ['organizationId', 'isArchived'])
    .index('by_dm_key', ['dmKey'])
    .index('by_creator', ['createdBy']),

  chatMembers: defineTable({
    conversationId: v.id('chatConversations'),
    userId: v.id('users'),
    organizationId: v.optional(v.id('organizations')),
    role: v.union(v.literal('owner'), v.literal('admin'), v.literal('member')),
    unreadCount: v.number(),
    lastReadAt: v.optional(v.number()),
    lastReadMessageId: v.optional(v.id('chatMessages')),
    isMuted: v.boolean(),
    isDeleted: v.optional(v.boolean()),
    deletedAt: v.optional(v.number()),
    isArchived: v.optional(v.boolean()),
    /**
     * When this member last cleared the history for themselves.
     *
     * `lastMessageText/At/SenderId` live on the shared conversation row, so a
     * per-user clear cannot blank them — the list preview would keep showing a
     * message the user no longer has. This timestamp masks the preview (and
     * nothing else) for that member until a newer message arrives.
     */
    historyClearedAt: v.optional(v.number()),
    joinedAt: v.number(),
  })
    .index('by_conversation', ['conversationId'])
    .index('by_user', ['userId'])
    .index('by_org', ['organizationId'])
    .index('by_conversation_user', ['conversationId', 'userId']),

  chatMessages: defineTable({
    conversationId: v.id('chatConversations'),
    organizationId: v.optional(v.id('organizations')),
    senderId: v.id('users'),
    type: v.union(
      v.literal('text'),
      v.literal('image'),
      v.literal('file'),
      v.literal('audio'),
      v.literal('system'),
      v.literal('call'),
    ),
    content: v.string(),
    attachments: v.optional(
      v.array(
        v.object({
          url: v.string(),
          name: v.string(),
          type: v.string(),
          size: v.number(),
        }),
      ),
    ),
    replyToId: v.optional(v.id('chatMessages')),
    replyToContent: v.optional(v.string()),
    replyToSenderName: v.optional(v.string()),
    // reactions: Record<emojiKey, userId[]> where emojiKey is ASCII-safe codepoint string
    reactions: v.optional(v.record(v.string(), v.array(v.id('users')))),
    mentionedUserIds: v.optional(v.array(v.id('users'))),
    readBy: v.optional(
      v.array(
        v.object({
          userId: v.id('users'),
          readAt: v.number(),
        }),
      ),
    ),
    poll: v.optional(
      v.object({
        question: v.string(),
        options: v.array(
          v.object({
            id: v.string(),
            text: v.string(),
            votes: v.array(v.id('users')),
          }),
        ),
        closedAt: v.optional(v.number()),
      }),
    ),
    threadCount: v.optional(v.number()),
    threadLastAt: v.optional(v.number()),
    scheduledFor: v.optional(v.number()),
    isSent: v.optional(v.boolean()),
    linkPreview: v.optional(
      v.object({
        url: v.string(),
        title: v.optional(v.string()),
        description: v.optional(v.string()),
        image: v.optional(v.string()),
        siteName: v.optional(v.string()),
      }),
    ),
    parentMessageId: v.optional(v.id('chatMessages')),
    isEdited: v.optional(v.boolean()),
    editedAt: v.optional(v.number()),
    isDeleted: v.optional(v.boolean()),
    deletedAt: v.optional(v.number()),
    deletedForUsers: v.optional(v.array(v.id('users'))),
    isPinned: v.optional(v.boolean()),
    pinnedBy: v.optional(v.id('users')),
    pinnedAt: v.optional(v.number()),
    callDuration: v.optional(v.number()),
    callType: v.optional(v.union(v.literal('audio'), v.literal('video'))),
    callStatus: v.optional(
      v.union(v.literal('missed'), v.literal('answered'), v.literal('declined')),
    ),
    isServiceBroadcast: v.optional(v.boolean()),
    broadcastTitle: v.optional(v.string()),
    broadcastIcon: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_conversation', ['conversationId'])
    .index('by_conversation_created', ['conversationId', 'createdAt'])
    .index('by_org', ['organizationId'])
    .index('by_sender', ['senderId'])
    .index('by_pinned', ['conversationId', 'isPinned']),

  chatSavedMessages: defineTable({
    userId: v.id('users'),
    messageId: v.id('chatMessages'),
    conversationId: v.id('chatConversations'),
    organizationId: v.id('organizations'),
    savedAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_user_conversation', ['userId', 'conversationId'])
    .index('by_user_org', ['userId', 'organizationId']),

  chatTyping: defineTable({
    conversationId: v.id('chatConversations'),
    userId: v.id('users'),
    organizationId: v.optional(v.id('organizations')),
    updatedAt: v.number(),
  })
    .index('by_conversation', ['conversationId'])
    .index('by_conversation_user', ['conversationId', 'userId']),

  chatCalls: defineTable({
    conversationId: v.id('chatConversations'),
    organizationId: v.optional(v.id('organizations')),
    initiatorId: v.id('users'),
    type: v.union(v.literal('audio'), v.literal('video')),
    status: v.union(
      v.literal('ringing'),
      v.literal('active'),
      v.literal('ended'),
      v.literal('missed'),
      v.literal('declined'),
    ),
    participants: v.array(
      v.object({
        userId: v.id('users'),
        joinedAt: v.optional(v.number()),
        leftAt: v.optional(v.number()),
        offer: v.optional(v.string()),
        answer: v.optional(v.string()),
        iceCandidates: v.optional(v.array(v.string())),
      }),
    ),
    startedAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    duration: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_conversation', ['conversationId'])
    .index('by_organization', ['organizationId'])
    .index('by_initiator', ['initiatorId'])
    .index('by_status', ['status']),
};
