import { v } from 'convex/values';
import { query, mutation } from './_generated/server';
import { MAX_PAGE_SIZE } from './pagination';
import { isSuperadmin } from './lib/auth';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP } from './lib/limits';
import { requireRequester } from './lib/requireRequester';
import { withAuth } from './lib/withAuth';

// ─── Helper: Check permissions ───────────────────────────────────────────────
async function checkAccess(ctx: any, organizationId: any, requesterId: any) {
  const requester = await ctx.db.get(requesterId);
  if (!requester) throw new Error('Requester not found');
  const userIsSuperadmin = isSuperadmin(requester);
  if (!userIsSuperadmin && requester.organizationId !== organizationId) {
    throw new Error('Access denied');
  }
  return { requester, isSuperadmin: userIsSuperadmin || requester.role === 'admin' };
}

// ─── DOCUMENTS ────────────────────────────────────────────────────────────────

export const listDocuments = query({
  args: {
    organizationId: v.id('organizations'),
    requesterId: v.id('users'),
    category: v.optional(v.string()),
    search: v.optional(v.string()),
    includeUnpublished: v.optional(v.boolean()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, caller) => {
    const { requester, isSuperadmin } = await checkAccess(
      ctx,
      args.organizationId,
      args.requesterId,
    );

    let docs = await ctx.db
      .query('documents')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .take(MAX_PAGE_SIZE);

    if (!args.includeUnpublished || !isSuperadmin) {
      docs = docs.filter((d) => d.isPublished);
    }

    if (args.category) docs = docs.filter((d) => d.category === args.category);
    if (args.search) {
      const lower = args.search.toLowerCase();
      docs = docs.filter(
        (d) =>
          d.title.toLowerCase().includes(lower) || d.description?.toLowerCase().includes(lower),
      );
    }

    const enriched = await Promise.all(
      docs.map(async (doc) => {
        const uploader = (await ctx.db.get(doc.uploadedBy)) as any;
        return { ...doc, uploaderName: uploader?.name ?? 'Unknown' };
      }),
    );

    return enriched;
  }),
});

export const getDocument = query({
  args: {
    organizationId: v.id('organizations'),
    requesterId: v.id('users'),
    documentId: v.id('documents'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, caller) => {
    await checkAccess(ctx, args.organizationId, args.requesterId);
    const doc = (await ctx.db.get(args.documentId)) as any;
    if (!doc || doc.organizationId !== args.organizationId) {
      throw new Error('Document not found');
    }
    const uploader = (await ctx.db.get(doc.uploadedBy)) as any;
    return { ...doc, uploaderName: uploader?.name ?? 'Unknown' };
  }),
});

export const getDocumentById = query({
  args: {
    documentId: v.id('documents'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, caller) => {
    const doc = (await ctx.db.get(args.documentId)) as any;
    if (!doc) return null;
    const uploader = (await ctx.db.get(doc.uploadedBy)) as any;
    return { ...doc, uploaderName: uploader?.name ?? 'Unknown' };
  }),
});

export const createDocument = mutation({
  args: {
    organizationId: v.id('organizations'),
    requesterId: v.id('users'),
    title: v.string(),
    description: v.optional(v.string()),
    category: v.union(
      v.literal('policy'),
      v.literal('contract'),
      v.literal('report'),
      v.literal('template'),
      v.literal('form'),
      v.literal('certificate'),
      v.literal('other'),
    ),
    fileUrl: v.string(),
    fileName: v.string(),
    fileSize: v.optional(v.number()),
    mimeType: v.optional(v.string()),
    isMandatory: v.optional(v.boolean()),
    expiresAt: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, caller) => {
    const { isSuperadmin } = await checkAccess(ctx, args.organizationId, args.requesterId);
    if (!isSuperadmin) throw new Error('Only admins can create documents');

    const now = Date.now();
    return await ctx.db.insert('documents', {
      organizationId: args.organizationId,
      title: args.title,
      description: args.description,
      category: args.category,
      fileUrl: args.fileUrl,
      fileName: args.fileName,
      fileSize: args.fileSize,
      mimeType: args.mimeType,
      uploadedBy: args.requesterId,
      isPublished: false,
      isMandatory: args.isMandatory ?? false,
      expiresAt: args.expiresAt,
      tags: args.tags ?? [],
      createdAt: now,
      updatedAt: now,
    });
  }),
});

export const updateDocument = mutation({
  args: {
    documentId: v.id('documents'),
    requesterId: v.id('users'),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    fileUrl: v.optional(v.string()),
    fileName: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    mimeType: v.optional(v.string()),
    isPublished: v.optional(v.boolean()),
    isMandatory: v.optional(v.boolean()),
    expiresAt: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, caller) => {
    const doc = (await ctx.db.get(args.documentId)) as any;
    if (!doc) throw new Error('Document not found');
    const { isSuperadmin } = await checkAccess(ctx, doc.organizationId, args.requesterId);
    if (!isSuperadmin) throw new Error('Only admins can update documents');

    const patch: any = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = args.title;
    if (args.description !== undefined) patch.description = args.description;
    if (args.category !== undefined) patch.category = args.category;
    if (args.fileUrl !== undefined) patch.fileUrl = args.fileUrl;
    if (args.fileName !== undefined) patch.fileName = args.fileName;
    if (args.fileSize !== undefined) patch.fileSize = args.fileSize;
    if (args.mimeType !== undefined) patch.mimeType = args.mimeType;
    if (args.isPublished !== undefined) patch.isPublished = args.isPublished;
    if (args.isMandatory !== undefined) patch.isMandatory = args.isMandatory;
    if (args.expiresAt !== undefined) patch.expiresAt = args.expiresAt;
    if (args.tags !== undefined) patch.tags = args.tags;

    await ctx.db.patch(args.documentId, patch);
    return { success: true };
  }),
});

export const deleteDocument = mutation({
  args: {
    documentId: v.id('documents'),
    requesterId: v.id('users'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, caller) => {
    const doc = (await ctx.db.get(args.documentId)) as any;
    if (!doc) throw new Error('Document not found');
    await checkAccess(ctx, doc.organizationId, args.requesterId);

    const views = await ctx.db
      .query('documentViews')
      .withIndex('by_document', (q) =>
        q.eq('organizationId', doc.organizationId).eq('documentId', doc._id),
      )
      .take(DEFAULT_LIST_CAP);
    for (const view of views) await ctx.db.delete(view._id);

    await ctx.db.delete(args.documentId);
    return { success: true };
  }),
});

// ─── DOCUMENT VIEWS ──────────────────────────────────────────────────────────

export const recordDocumentView = mutation({
  args: {
    organizationId: v.id('organizations'),
    requesterId: v.id('users'),
    documentId: v.id('documents'),
    acknowledged: v.optional(v.boolean()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, caller) => {
    await checkAccess(ctx, args.organizationId, args.requesterId);

    const existing = await ctx.db
      .query('documentViews')
      .withIndex('by_user_document', (q) =>
        q
          .eq('organizationId', args.organizationId)
          .eq('userId', args.requesterId)
          .eq('documentId', args.documentId),
      )
      .first();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { viewedAt: now, acknowledged: args.acknowledged });
    } else {
      await ctx.db.insert('documentViews', {
        organizationId: args.organizationId,
        documentId: args.documentId,
        userId: args.requesterId,
        viewedAt: now,
        acknowledged: args.acknowledged,
      });
    }

    return { success: true };
  }),
});

export const getMyDocumentViews = query({
  args: {
    organizationId: v.id('organizations'),
    requesterId: v.id('users'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, caller) => {
    return await ctx.db
      .query('documentViews')
      .withIndex('by_user', (q) =>
        q.eq('organizationId', args.organizationId).eq('userId', args.requesterId),
      )
      .take(DEFAULT_LIST_CAP);
  }),
});

export const getDocumentViews = query({
  args: {
    organizationId: v.id('organizations'),
    requesterId: v.id('users'),
    documentId: v.id('documents'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, caller) => {
    await checkAccess(ctx, args.organizationId, args.requesterId);
    const views = await ctx.db
      .query('documentViews')
      .withIndex('by_document', (q) =>
        q.eq('organizationId', args.organizationId).eq('documentId', args.documentId),
      )
      .take(DEFAULT_LIST_CAP);

    const enriched = await Promise.all(
      views.map(async (view) => {
        const user = await ctx.db.get(view.userId);
        return { ...view, userName: user?.name ?? 'Unknown', userEmail: user?.email };
      }),
    );

    return enriched;
  }),
});

// ─── DOCUMENT CATEGORIES ─────────────────────────────────────────────────────

export const getDocumentCategories = query({
  args: {
    organizationId: v.id('organizations'),
    requesterId: v.id('users'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, caller) => {
    await checkAccess(ctx, args.organizationId, args.requesterId);
    return await ctx.db
      .query('documentCategories')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .order('asc')
      .take(SMALL_LIST_CAP);
  }),
});

export const createDocumentCategory = mutation({
  args: {
    organizationId: v.id('organizations'),
    requesterId: v.id('users'),
    name: v.string(),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
    order: v.optional(v.number()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, caller) => {
    const { isSuperadmin } = await checkAccess(ctx, args.organizationId, args.requesterId);
    if (!isSuperadmin) throw new Error('Only admins can create categories');

    const now = Date.now();
    return await ctx.db.insert('documentCategories', {
      organizationId: args.organizationId,
      name: args.name,
      description: args.description,
      icon: args.icon,
      color: args.color,
      order: args.order ?? 0,
      createdAt: now,
      updatedAt: now,
    });
  }),
});

// ─── TEAM/ADMIN DOCUMENT OVERVIEW ────────────────────────────────────────────

export const getTeamDocumentOverview = query({
  args: {
    organizationId: v.id('organizations'),
    requesterId: v.id('users'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, caller) => {
    // Resolve the requester without throwing — a stale client cache may call
    // this query for a user whose DB role no longer qualifies as admin. In
    // that case we return `null` so the UI (which already guards on
    // `teamOverview` being truthy) degrades gracefully instead of crashing
    // the whole page render.
    // requireRequester fallback handled by withAuth wrapper above
    if (!caller) return null;

    const isPlatformSuperadmin = isSuperadmin(caller);

    const isAdmin = isPlatformSuperadmin || caller.role === 'admin';
    if (!isAdmin) return null;

    if (!isPlatformSuperadmin && caller.organizationId !== args.organizationId) {
      return null;
    }

    const docs = await ctx.db
      .query('documents')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .take(DEFAULT_LIST_CAP);

    const views = await ctx.db
      .query('documentViews')
      .withIndex('by_user', (q) => q.eq('organizationId', args.organizationId))
      .take(DEFAULT_LIST_CAP);

    const totalDocuments = docs.length;
    const publishedDocuments = docs.filter((d) => d.isPublished).length;
    const mandatoryDocuments = docs.filter((d) => d.isMandatory).length;
    const totalViews = views.length;
    const acknowledgedViews = views.filter((v) => v.acknowledged).length;

    const acknowledgmentRate =
      totalViews > 0 ? Math.round((acknowledgedViews / totalViews) * 100) : 0;

    return {
      totalDocuments,
      publishedDocuments,
      mandatoryDocuments,
      totalViews,
      acknowledgmentRate,
    };
  }),
});
