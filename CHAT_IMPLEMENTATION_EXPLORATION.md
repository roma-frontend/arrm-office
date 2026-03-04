# Chat Implementation Planning - Project Exploration Summary

## 1. Existing Chat-Related Code Analysis

### Current Chat Implementation (AI-Powered Only)
The project currently has **AI chat functionality** but **NO real-time peer-to-peer chat**:

- **`Desktop/office/src/components/ai/ChatWidget.tsx`** - AI chatbot for leave management
  - Purpose: AI assistant for booking leave, viewing balances, team stats
  - Uses voice input with Web Speech API
  - Integrates with leave management APIs
  - Connected to API routes: `/api/chat/*` (leave-specific endpoints)
  
- **`Desktop/office/src/app/api/chat/`** - AI Chat API Routes
  - `/api/chat/` - Main chat endpoint with Claude/OpenAI integration
  - `/api/chat/context/` - Context gathering for AI
  - `/api/chat/full-context/` - Comprehensive context
  - `/api/chat/insights/` - AI insights
  - `/api/chat/weekly-digest/` - Weekly summaries
  - Leave-specific routes: `/api/chat/book-leave/`, `/api/chat/edit-leave/`, `/api/chat/delete-leave/`

### Localization Support
- Chat UI strings found in i18n locales (en.json, ru.json, hy.json)
- Keys: `chatWidget.chat`, `chatWidget.chatHistory`, `chatWidget.joined`, `chatWidget.left`

### **No Existing Real-Time Chat Tables**
- **No `messages` table** in Convex schema
- **No `conversations` or `channels` table**
- **No `chatUsers` or `chatMembers` table**
- The schema covers: leaves, tasks, notifications, users, etc., but NOT messaging

---

## 2. Dashboard Pages Structure

### Existing Dashboard Routes
Located in `Desktop/office/src/app/(dashboard)/`:

**Admin/Supervisor Pages:**
- `/dashboard/` - Main dashboard (role-based: DashboardClient for admin, EmployeeDashboard for employee)
- `/tasks/` - Task management
- `/leaves/` - Leave requests
- `/approvals/` - Leave approvals
- `/analytics/` - Department analytics
- `/attendance/` - Attendance tracking
- `/calendar/` - Calendar sync
- `/employees/` - Employee directory
- `/reports/` - Reports
- `/settings/` - User settings

**Employee Pages:**
- `/profile/` - User profile
- `/join-requests/` - Organization join requests
- `/org-requests/` - Organization creation requests

**Superadmin Pages:**
- `/superadmin/organizations/` - Manage organizations
- `/superadmin/subscriptions/` - Billing management
- `/superadmin/security/` - Security monitoring
- `/superadmin/stripe-dashboard/` - Stripe integration

**Note:** `/ai-chat/` directory exists but is empty (no page.tsx)

### Recommended Chat Page Location
- **New route:** `Desktop/office/src/app/(dashboard)/chat/page.tsx`
- Could also be: `Desktop/office/src/app/(dashboard)/messages/page.tsx`

---

## 3. Components Directory Structure

### Existing Component Categories
```
src/components/
├── ai/                  # AI features (ChatWidget, SiteEditor)
├── admin/              # Admin tools (ConflictDetection, CostAnalysis, SLA)
├── analytics/          # Charts & stats (LeaveHeatmap, TrendChart)
├── attendance/         # Check-in/out features
├── auth/               # Authentication (Face, WebAuthn, Password)
├── billing/            # Subscription gates
├── calendar/           # Google/Outlook sync
├── dashboard/          # Dashboard clients
├── employees/          # Employee management
├── landing/            # Landing page
├── layout/             # Layout components (Navbar, Sidebar, Providers)
├── leaves/             # Leave management (LeaveRequestModal, AILeaveAssistant)
├── onboarding/         # Tour steps
├── optimized/          # Lazy loading
├── productivity/       # Pomodoro, FocusMode, TeamPresence
├── providers/          # Context providers
├── security/           # Security features
├── settings/           # Settings panels
├── subscription/       # Subscription UI
├── tasks/              # Task management
└── ui/                 # Base UI components (shadcn)
```

### Recommended Chat Components Structure
```
src/components/chat/
├── ChatClient.tsx               # Main client component
├── ChatWindow.tsx               # Chat interface
├── ConversationList.tsx         # Sidebar with conversations
├── MessageList.tsx              # Message display
├── MessageInput.tsx             # Input form
├── UserTypingIndicator.tsx      # Real-time typing status
├── ConversationHeader.tsx       # Conversation title & info
├── FileUploadPreview.tsx        # File attachment preview
└── ChatModals/
    ├── CreateConversationModal.tsx
    ├── AddMembersModal.tsx
    └── ConversationDetailsModal.tsx
```

---

## 4. Convex Backend Structure & Patterns

### Schema Overview (Highly Multi-Tenant)
All tables follow the **organization-scoped pattern**:
```typescript
// Every table includes organizationId for tenant isolation
defineTable({
  organizationId: v.optional(v.id("organizations")),
  // ... other fields
})
  .index("by_org", ["organizationId"])
  .index("by_org_status", ["organizationId", "status"])  // compound indexes
```

### Existing Convex Files (Models/Services)
- `admin.ts` - Admin operations
- `analytics.ts` - Analytics queries
- `auth.ts` - Authentication
- `employeeNotes.ts` - Employee note management
- `employeeProfiles.ts` - Profile data
- `faceRecognition.ts` - Face ID
- `leaves.ts` - Leave requests (**Good reference pattern**)
- `notifications.ts` - Notification system
- `organizations.ts` - Org management
- `tasks.ts` - Task management (**Excellent reference pattern**)
- `users.ts` - User operations
- `timeTracking.ts` - Attendance
- `userPreferences.ts` - User settings
- Plus AI, security, and subscription modules

### Pattern Analysis: leaves.ts & tasks.ts

#### **Key Patterns to Follow:**

1. **Organization Scoping on Create**
   ```typescript
   export const createLeave = mutation({
     args: { userId: v.id("users"), ... },
     handler: async (ctx, args) => {
       const user = await ctx.db.get(args.userId);
       if (!user.organizationId) throw new Error("User does not belong to an organization");
       
       const leaveId = await ctx.db.insert("leaveRequests", {
         organizationId: user.organizationId,  // ← Tenant isolation
         userId: args.userId,
         ...
       });
     }
   });
   ```

2. **Access Control Check**
   ```typescript
   export const approveLeave = mutation({
     args: { leaveId: v.id("leaveRequests"), reviewerId: v.id("users") },
     handler: async (ctx, { leaveId, reviewerId }) => {
       const leave = await ctx.db.get(leaveId);
       const reviewer = await ctx.db.get(reviewerId);
       
       // Cross-org protection - CRITICAL PATTERN
       if (reviewer.organizationId !== leave.organizationId) {
         throw new Error("Access denied: cross-organization operation");
       }
     }
   });
   ```

3. **Notification Creation on Action**
   ```typescript
   // After creating/updating something, notify relevant users
   await ctx.db.insert("notifications", {
     organizationId: user.organizationId,
     userId: recipientId,
     type: "leave_request",
     title: "New Leave Request",
     message: `...`,
     isRead: false,
     relatedId: leaveId,
     createdAt: Date.now(),
   });
   ```

4. **Compound Indexes for Common Queries**
   ```typescript
   leaveRequests: defineTable({
     ...
   })
     .index("by_org", ["organizationId"])           // Single org queries
     .index("by_user", ["userId"])                  // User's own records
     .index("by_org_status", ["organizationId", "status"])  // Org + status filter
     .index("by_status", ["status"])
     .index("by_created", ["createdAt"])
   ```

5. **Query with Organization Filter**
   ```typescript
   export const getAllLeaves = query({
     args: { requesterId: v.id("users") },
     handler: async (ctx, { requesterId }) => {
       const requester = await ctx.db.get(requesterId);
       if (!requester) throw new Error("Requester not found");
       
       // Handle superadmin differently
       const SUPERADMIN_EMAIL = "romangulanyan@gmail.com";
       let leaves;
       if (requester.email.toLowerCase() === SUPERADMIN_EMAIL) {
         leaves = await ctx.db.query("leaveRequests").order("desc").collect();
       } else {
         // Normal users see only their org's data
         leaves = await ctx.db
           .query("leaveRequests")
           .withIndex("by_org", (q) => q.eq("organizationId", requester.organizationId))
           .order("desc")
           .collect();
       }
     }
   });
   ```

6. **Relationship Resolution (Fetching Related Data)**
   ```typescript
   return await Promise.all(
     leaves.map(async (leave) => {
       const user = await ctx.db.get(leave.userId);
       const reviewer = leave.reviewedBy ? await ctx.db.get(leave.reviewedBy) : null;
       return {
         ...leave,
         userName: user?.name ?? "Unknown",
         userEmail: user?.email ?? "",
         reviewerName: reviewer?.name,
       };
     })
   );
   ```

7. **Filtering Logic (Client-Side vs Query)**
   ```typescript
   // Query returns data, then filter in handler
   const allLeaves = await ctx.db.query("leaveRequests").collect();
   leaves = allLeaves.filter(l => l.status === "pending");
   
   // OR use compound index if possible
   leaves = await ctx.db
     .query("leaveRequests")
     .withIndex("by_org_status", (q) =>
       q.eq("organizationId", orgId).eq("status", "pending")
     )
     .collect();
   ```

---

## 5. Recommended Chat Schema Design

### New Convex Tables Needed

```typescript
// ── CONVERSATIONS ────────────────────────────────────────────────────
conversations: defineTable({
  organizationId: v.id("organizations"),      // Tenant isolation
  type: v.union(
    v.literal("direct"),      // 1-to-1 chat
    v.literal("group")        // Group chat
  ),
  name: v.optional(v.string()), // For group chats
  description: v.optional(v.string()),
  
  // Participants
  creatorId: v.id("users"),
  // members: handled via conversationMembers table
  
  // Metadata
  lastMessageAt: v.optional(v.number()),
  lastMessageAuthorId: v.optional(v.id("users")),
  lastMessagePreview: v.optional(v.string()),
  
  // Settings
  isArchived: v.boolean(),
  
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_org", ["organizationId"])
  .index("by_creator", ["creatorId"])
  .index("by_type", ["type"])
  .index("by_org_type", ["organizationId", "type"])
  .index("by_last_message", ["lastMessageAt"])

// ── CONVERSATION MEMBERS ─────────────────────────────────────────────
conversationMembers: defineTable({
  conversationId: v.id("conversations"),
  userId: v.id("users"),
  
  // Role in conversation
  role: v.union(
    v.literal("owner"),
    v.literal("member")
  ),
  
  // Per-user state
  joinedAt: v.number(),
  lastReadMessageId: v.optional(v.string()),
  lastReadAt: v.optional(v.number()),
  unreadCount: v.number(),
  isMuted: v.boolean(),
  
  // Presence
  isActive: v.boolean(),
  lastSeenAt: v.optional(v.number()),
})
  .index("by_conversation", ["conversationId"])
  .index("by_user", ["userId"])
  .index("by_conversation_user", ["conversationId", "userId"])
  .index("by_unread", ["conversationId", "unreadCount"])

// ── MESSAGES ──────────────────────────────────────────────────────────
messages: defineTable({
  organizationId: v.id("organizations"),      // Tenant isolation
  conversationId: v.id("conversations"),
  authorId: v.id("users"),
  
  // Content
  content: v.string(),
  messageType: v.union(
    v.literal("text"),
    v.literal("file"),
    v.literal("image"),
    v.literal("system")
  ),
  
  // File attachments
  attachments: v.optional(v.array(v.object({
    url: v.string(),
    name: v.string(),
    type: v.string(),
    size: v.number(),
    uploadedAt: v.number(),
  }))),
  
  // Message status
  status: v.union(
    v.literal("sent"),
    v.literal("delivered"),
    v.literal("read")
  ),
  
  // Replies/Threads
  replyToId: v.optional(v.id("messages")),
  replyToAuthor: v.optional(v.string()),
  replyToContent: v.optional(v.string()),
  
  // Editing
  editedAt: v.optional(v.number()),
  isDeleted: v.boolean(),
  
  createdAt: v.number(),
})
  .index("by_org", ["organizationId"])
  .index("by_conversation", ["conversationId"])
  .index("by_author", ["authorId"])
  .index("by_conversation_created", ["conversationId", "createdAt"])
  .index("by_conversation_undeleted", ["conversationId", "isDeleted"])

// ── MESSAGE READS ────────────────────────────────────────────────────
messageReads: defineTable({
  messageId: v.id("messages"),
  userId: v.id("users"),
  readAt: v.number(),
})
  .index("by_message", ["messageId"])
  .index("by_user", ["userId"])
  .index("by_message_user", ["messageId", "userId"])

// ── TYPING INDICATORS (Real-time presence) ────────────────────────────
typingIndicators: defineTable({
  conversationId: v.id("conversations"),
  userId: v.id("users"),
  typingAt: v.number(),
  expiresAt: v.number(),  // Auto-cleanup
})
  .index("by_conversation", ["conversationId"])
  .index("by_expires", ["expiresAt"])
```

### Key Design Decisions:

1. **Organization Scoping**: `organizationId` on conversations AND messages for cross-org isolation
2. **Unread Count**: Stored in `conversationMembers` for quick access
3. **Message Status**: Track sent/delivered/read for real-time updates
4. **Typing Indicators**: Separate table with TTL for ephemeral presence
5. **File Support**: Attachments array for multi-file messages
6. **Message Replies**: Support for threaded conversations
7. **Soft Deletes**: `isDeleted` field preserves history

---

## 6. Recommended Convex Mutations & Queries Pattern

```typescript
// Desktop/office/convex/chat.ts (NEW FILE)

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ── CREATE CONVERSATION ────────────────────────────────────────────────
export const createConversation = mutation({
  args: {
    userId: v.id("users"),
    type: v.union(v.literal("direct"), v.literal("group")),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    memberIds: v.array(v.id("users")),  // Includes creator
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user?.organizationId) throw new Error("User not in organization");
    
    const conversationId = await ctx.db.insert("conversations", {
      organizationId: user.organizationId,
      type: args.type,
      name: args.name,
      description: args.description,
      creatorId: args.userId,
      isArchived: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    
    // Add members
    for (const memberId of args.memberIds) {
      await ctx.db.insert("conversationMembers", {
        conversationId,
        userId: memberId,
        role: memberId === args.userId ? "owner" : "member",
        joinedAt: Date.now(),
        unreadCount: 0,
        isMuted: false,
        isActive: false,
      });
    }
    
    return conversationId;
  },
});

// ── SEND MESSAGE ────────────────────────────────────────────────────────
export const sendMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    authorId: v.id("users"),
    content: v.string(),
    messageType: v.optional(v.union(v.literal("text"), v.literal("file"))),
    attachments: v.optional(v.array(v.object({
      url: v.string(),
      name: v.string(),
      type: v.string(),
      size: v.number(),
    }))),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) throw new Error("Conversation not found");
    
    const author = await ctx.db.get(args.authorId);
    if (author.organizationId !== conversation.organizationId) {
      throw new Error("Cross-org access denied");
    }
    
    // Check member permission
    const member = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", args.conversationId).eq("userId", args.authorId)
      )
      .first();
    
    if (!member) throw new Error("User not member of conversation");
    
    const now = Date.now();
    const messageId = await ctx.db.insert("messages", {
      organizationId: conversation.organizationId,
      conversationId: args.conversationId,
      authorId: args.authorId,
      content: args.content,
      messageType: args.messageType ?? "text",
      attachments: args.attachments,
      status: "sent",
      isDeleted: false,
      createdAt: now,
    });
    
    // Update conversation metadata
    await ctx.db.patch(args.conversationId, {
      lastMessageAt: now,
      lastMessageAuthorId: args.authorId,
      lastMessagePreview: args.content.slice(0, 50),
      updatedAt: now,
    });
    
    // Update unread counts for other members
    const members = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .collect();
    
    for (const m of members) {
      if (m.userId !== args.authorId) {
        await ctx.db.patch(m._id, {
          unreadCount: (m.unreadCount ?? 0) + 1,
        });
      }
    }
    
    // Create system notification
    for (const m of members) {
      if (m.userId !== args.authorId && !m.isMuted) {
        await ctx.db.insert("notifications", {
          organizationId: conversation.organizationId,
          userId: m.userId,
          type: "system",
          title: "New Message",
          message: `${author.name}: ${args.content.slice(0, 40)}...`,
          isRead: false,
          relatedId: messageId,
          createdAt: now,
        });
      }
    }
    
    return messageId;
  },
});

// ── GET CONVERSATIONS FOR USER ──────────────────────────────────────────
export const getConversations = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("conversationMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();
    
    return await Promise.all(
      memberships.map(async (membership) => {
        const conversation = await ctx.db.get(membership.conversationId);
        const lastAuthor = conversation?.lastMessageAuthorId
          ? await ctx.db.get(conversation.lastMessageAuthorId)
          : null;
        
        const otherMembers = await ctx.db
          .query("conversationMembers")
          .withIndex("by_conversation", (q) => q.eq("conversationId", membership.conversationId))
          .collect();
        
        return {
          ...conversation,
          membership,
          lastMessageAuthorName: lastAuthor?.name,
          memberCount: otherMembers.length,
        };
      })
    );
  },
});

// ── GET MESSAGES IN CONVERSATION ────────────────────────────────────────
export const getMessages = query({
  args: {
    conversationId: v.id("conversations"),
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) throw new Error("Conversation not found");
    
    // Verify membership
    const member = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", args.conversationId).eq("userId", args.userId)
      )
      .first();
    
    if (!member) throw new Error("Access denied");
    
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation_created", (q) =>
        q.eq("conversationId", args.conversationId).eq("isDeleted", false)
      )
      .order("desc")
      .take(args.limit ?? 50);
    
    return await Promise.all(
      messages.map(async (msg) => {
        const author = await ctx.db.get(msg.authorId);
        return { ...msg, authorName: author?.name };
      })
    );
  },
});
```

---

## 7. Implementation Roadmap

### Phase 1: Backend Infrastructure
1. Add chat tables to `convex/schema.ts`
2. Create `convex/chat.ts` with core mutations/queries
3. Add `convex/notifications.ts` enhancements for chat notifications

### Phase 2: Client Components
1. Create `src/components/chat/` directory structure
2. Implement ChatClient (main page component)
3. Build ConversationList, MessageList, MessageInput
4. Wire up real-time subscriptions using Convex's `useQuery`

### Phase 3: UI & Real-time Features
1. Implement typing indicators
2. Add message read receipts
3. Build file upload support
4. Add conversation search/filtering

### Phase 4: Advanced Features
1. Message editing/deletion
2. Conversation archiving
3. User presence indicators
4. Message reactions/emojis

---

## Key Takeaways for Real-Time Chat

1. **Always include `organizationId`** - Multi-tenant isolation is critical
2. **Use compound indexes** - e.g., `by_conversation_created` for efficient pagination
3. **Track unread counts** - Store in `conversationMembers`, not calculated on-the-fly
4. **Notify on state changes** - Create notification records for message arrivals
5. **Verify cross-org access** - Every mutation must check org boundaries
6. **Handle presence with TTL** - Typing indicators expire after short periods
7. **Support message threads** - Add `replyToId` for organized conversations
8. **Soft delete messages** - Keep history, use `isDeleted` flag
9. **Track message status** - sent → delivered → read progression
10. **Use Convex subscriptions** - Leverage real-time reactivity for live updates

