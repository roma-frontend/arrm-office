import { query, mutation, internalMutation, type MutationCtx } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP, XLARGE_LIST_CAP } from './lib/limits';

import { internal } from './_generated/api';

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════

/** Valid lifecycle actions recorded in the assetHistory audit trail. */
type AssetHistoryAction =
  | 'created'
  | 'updated'
  | 'status_changed'
  | 'assigned'
  | 'returned'
  | 'lost'
  | 'maintenance_scheduled'
  | 'maintenance_started'
  | 'maintenance_completed'
  | 'maintenance_cancelled'
  | 'retired';

function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    laptop: '💻',
    monitor: '🖥️',
    phone: '📱',
    tablet: '📲',
    peripheral: '🖱️',
    furniture: '🪑',
    software_license: '🔑',
    vehicle: '🚗',
    other: '📦',
  };
  return icons[category] || '📦';
}

/**
 * Append an entry to the asset audit trail (assetHistory).
 * Resolves the actor's display name so the history reads well without joins.
 */
async function logAssetHistory(
  ctx: MutationCtx,
  entry: {
    organizationId: Id<'organizations'>;
    assetId: Id<'assetCatalog'>;
    action: AssetHistoryAction;
    fromStatus?: string;
    toStatus?: string;
    note?: string;
    actorId?: Id<'users'>;
  },
): Promise<void> {
  let actorName: string | undefined;
  if (entry.actorId) {
    const actor = await ctx.db.get(entry.actorId);
    actorName = actor?.name ?? undefined;
  }
  await ctx.db.insert('assetHistory', {
    organizationId: entry.organizationId,
    assetId: entry.assetId,
    action: entry.action,
    fromStatus: entry.fromStatus,
    toStatus: entry.toStatus,
    note: entry.note,
    actorId: entry.actorId,
    actorName,
    createdAt: Date.now(),
  });
}

/**
 * Ensure serialNumber / assetTag are unique within an organization.
 * Pass `excludeAssetId` when updating so the asset doesn't clash with itself.
 * Throws a user-facing error on the first collision found.
 */
async function assertUniqueIdentifiers(
  ctx: MutationCtx,
  organizationId: Id<'organizations'>,
  fields: { serialNumber?: string; assetTag?: string },
  excludeAssetId?: Id<'assetCatalog'>,
): Promise<void> {
  const serial = fields.serialNumber?.trim();
  const tag = fields.assetTag?.trim();
  if (!serial && !tag) return;

  // Bounded scan of the org catalog; DEFAULT_LIST_CAP covers 99% of tenants.
  const existing = await ctx.db
    .query('assetCatalog')
    .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
    .take(DEFAULT_LIST_CAP);

  for (const a of existing) {
    if (excludeAssetId && a._id === excludeAssetId) continue;
    if (serial && a.serialNumber && a.serialNumber.trim().toLowerCase() === serial.toLowerCase()) {
      throw new Error(`An asset with serial number "${serial}" already exists.`);
    }
    if (tag && a.assetTag && a.assetTag.trim().toLowerCase() === tag.toLowerCase()) {
      throw new Error(`An asset with asset tag "${tag}" already exists.`);
    }
  }
}

/**
 * When a maintenance record completes or is cancelled, bring the asset back
 * into service — but only if it's still sitting in 'maintenance'. Restores to
 * 'assigned' when an active assignment exists, otherwise 'available'.
 */
async function restoreAssetAfterMaintenance(
  ctx: MutationCtx,
  assetId: Id<'assetCatalog'>,
  action: AssetHistoryAction,
  actorId?: Id<'users'>,
): Promise<void> {
  const asset = await ctx.db.get(assetId);
  if (!asset) return;

  // Only restore if this asset is actually parked in maintenance. If the asset
  // was retired/lost or already back in service, leave it alone.
  if (asset.status !== 'maintenance') {
    await logAssetHistory(ctx, {
      organizationId: asset.organizationId,
      assetId,
      action,
      actorId,
    });
    return;
  }

  const activeAssignment = await ctx.db
    .query('assetAssignments')
    .withIndex('by_asset_active', (q) => q.eq('assetId', assetId).eq('status', 'active'))
    .first();

  const toStatus = activeAssignment ? 'assigned' : 'available';
  await ctx.db.patch(assetId, { status: toStatus, updatedAt: Date.now() });
  await logAssetHistory(ctx, {
    organizationId: asset.organizationId,
    assetId,
    action,
    fromStatus: 'maintenance',
    toStatus,
    actorId,
  });
}

// ═══════════════════════════════════════════════════════════════
//  QUERIES
// ═══════════════════════════════════════════════════════════════

// ── Asset Catalog ──────────────────────────────────────────

export const listAssets = query({
  args: {
    organizationId: v.id('organizations'),
    category: v.optional(
      v.union(
        v.literal('laptop'),
        v.literal('monitor'),
        v.literal('phone'),
        v.literal('tablet'),
        v.literal('peripheral'),
        v.literal('furniture'),
        v.literal('software_license'),
        v.literal('vehicle'),
        v.literal('other'),
      ),
    ),
    status: v.optional(
      v.union(
        v.literal('available'),
        v.literal('assigned'),
        v.literal('maintenance'),
        v.literal('retired'),
        v.literal('lost'),
      ),
    ),
  },
  handler: async (ctx, args) => {
    let q = ctx.db
      .query('assetCatalog')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId));

    if (args.category) {
      q = q.filter((q) => q.eq(q.field('category'), args.category));
    }
    if (args.status) {
      q = q.filter((q) => q.eq(q.field('status'), args.status));
    }

    const assets = await q.order('desc').take(DEFAULT_LIST_CAP);

    // Enrich with current assignment info
    return await Promise.all(
      assets.map(async (asset) => {
        const activeAssignment = await ctx.db
          .query('assetAssignments')
          .withIndex('by_asset_active', (q) => q.eq('assetId', asset._id).eq('status', 'active'))
          .first();

        let assignedToUser = null;
        if (activeAssignment) {
          const user = await ctx.db.get(activeAssignment.assignedTo);
          assignedToUser = user ? { _id: user._id, name: user.name, email: user.email } : null;
        }

        // Count maintenance history
        const maintenanceCount = await ctx.db
          .query('assetMaintenance')
          .withIndex('by_asset', (q) => q.eq('assetId', asset._id))
          .filter((q) => q.eq(q.field('status'), 'completed'))
          .take(SMALL_LIST_CAP);

        return {
          ...asset,
          icon: getCategoryIcon(asset.category),
          currentUser: assignedToUser,
          maintenanceCount: maintenanceCount.length,
          isAssigned: activeAssignment !== null,
        };
      }),
    );
  },
});

export const getAsset = query({
  args: { assetId: v.id('assetCatalog') },
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset) return null;

    // Get full assignment history
    const assignments = await ctx.db
      .query('assetAssignments')
      .withIndex('by_asset', (q) => q.eq('assetId', args.assetId))
      .order('desc')
      .take(SMALL_LIST_CAP);

    const assignmentsWithUsers = await Promise.all(
      assignments.map(async (a) => {
        const user = await ctx.db.get(a.assignedTo);
        const assigner = await ctx.db.get(a.assignedBy);
        const returner = a.returnedBy ? await ctx.db.get(a.returnedBy) : null;
        return {
          ...a,
          userName: user?.name,
          assignedByName: assigner?.name,
          returnedByName: returner?.name,
        };
      }),
    );

    // Get maintenance history
    const maintenance = await ctx.db
      .query('assetMaintenance')
      .withIndex('by_asset', (q) => q.eq('assetId', args.assetId))
      .order('desc')
      .take(SMALL_LIST_CAP);

    // Get current assignment
    let currentAssignment = assignmentsWithUsers.find((a) => a.status === 'active');

    const creator = await ctx.db.get(asset.createdBy);

    // Reconcile movement form status with actual signature document if possible
    // (read-only check; the actual status update happens via the scheduler when signed)
    if (currentAssignment?.movementFormDocId) {
      const sigDoc = await ctx.db.get(currentAssignment.movementFormDocId);
      if (
        sigDoc &&
        sigDoc.status === 'completed' &&
        currentAssignment.movementFormStatus !== 'signed'
      ) {
        currentAssignment = {
          ...currentAssignment,
          movementFormStatus: 'signed',
        } as typeof currentAssignment;
      }
    }

    // Resolve the currently assigned user — mirrors the `currentUser`
    // enrichment of `listAssets` so the detail card can show who holds the
    // asset (previously the card typed this field as `any` and it was
    // silently undefined at runtime, hiding the assignment UI).
    // `position` is included so the handover/return act can print it.
    let currentUser: {
      _id: Id<'users'>;
      name: string;
      email: string;
      position?: string;
    } | null = null;
    if (currentAssignment) {
      const user = await ctx.db.get(currentAssignment.assignedTo);
      currentUser = user
        ? { _id: user._id, name: user.name, email: user.email, position: user.position }
        : null;
    }

    return {
      ...asset,
      icon: getCategoryIcon(asset.category),
      currentAssignment,
      currentUser,
      assignments: assignmentsWithUsers,
      maintenanceHistory: maintenance,
      creatorName: creator?.name,
    };
  },
});

/**
 * Full audit trail for a single asset (created, status changes, assignments,
 * maintenance, retirement, loss) — most recent first.
 */
export const getAssetHistory = query({
  args: { assetId: v.id('assetCatalog') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('assetHistory')
      .withIndex('by_asset_time', (q) => q.eq('assetId', args.assetId))
      .order('desc')
      .take(SMALL_LIST_CAP);
  },
});

/**
 * Generate QR code payload data for an asset.
 * The frontend can use this data with the qrcode library (already dynamically
 * imported via src/lib/dynamic-imports) to render scannable QR codes for
 * physical asset labels and inventory tracking.
 */
export const getAssetQRData = query({
  args: {
    organizationId: v.id('organizations'),
    assetId: v.id('assetCatalog'),
  },
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset) return null;

    // Build a deep-link URL for the asset detail page.
    // When scanned from a mobile device this opens the asset card directly.
    // NOTE: Convex queries run server-side, so window is not available.
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

    return {
      assetId: asset._id,
      name: asset.name,
      serialNumber: asset.serialNumber ?? null,
      assetTag: asset.assetTag ?? null,
      category: asset.category,
      url: `${baseUrl}/assets?asset=${asset._id}`,
    };
  },
});

/**
 * Straight-line depreciation / book value for the org's assets.
 * Assumes a per-category useful life (in years) and zero salvage value.
 * Assets without purchaseDate/purchasePrice are reported as unknown.
 */
export const getDepreciation = query({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, args) => {
    // Default useful life in years by category (industry-typical starting points).
    const usefulLifeYears: Record<string, number> = {
      laptop: 3,
      monitor: 5,
      phone: 2,
      tablet: 3,
      peripheral: 3,
      furniture: 7,
      software_license: 1,
      vehicle: 5,
      other: 5,
    };

    const all = await ctx.db
      .query('assetCatalog')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .take(XLARGE_LIST_CAP);

    const now = Date.now();
    const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

    let totalPurchase = 0;
    let totalBookValue = 0;
    let totalDepreciated = 0;

    const items = all.map((asset) => {
      const price = asset.purchasePrice ?? null;
      const start = asset.purchaseDate ?? null;
      const lifeYears = usefulLifeYears[asset.category] ?? 5;

      // Retired/lost assets carry zero book value.
      const writtenOff = asset.status === 'retired' || asset.status === 'lost';

      let bookValue: number | null = null;
      let depreciated: number | null = null;
      let ageYears: number | null = null;

      if (price != null && start != null) {
        ageYears = Math.max(0, (now - start) / YEAR_MS);
        const fraction = Math.min(1, ageYears / lifeYears);
        depreciated = writtenOff ? price : price * fraction;
        bookValue = writtenOff ? 0 : price - depreciated;

        totalPurchase += price;
        totalBookValue += bookValue;
        totalDepreciated += depreciated;
      }

      return {
        assetId: asset._id,
        name: asset.name,
        category: asset.category,
        icon: getCategoryIcon(asset.category),
        status: asset.status,
        purchasePrice: price,
        purchaseDate: start,
        currency: asset.currency ?? null,
        usefulLifeYears: lifeYears,
        ageYears: ageYears != null ? Math.round(ageYears * 10) / 10 : null,
        depreciated: depreciated != null ? Math.round(depreciated * 100) / 100 : null,
        bookValue: bookValue != null ? Math.round(bookValue * 100) / 100 : null,
        fullyDepreciated: bookValue != null ? bookValue <= 0 : null,
      };
    });

    return {
      items,
      summary: {
        totalPurchase: Math.round(totalPurchase * 100) / 100,
        totalBookValue: Math.round(totalBookValue * 100) / 100,
        totalDepreciated: Math.round(totalDepreciated * 100) / 100,
      },
    };
  },
});

export const getAssetStats = query({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, args) => {
    // Stats are a full-fleet aggregate — use the large cap so totalValue and
    // counts don't silently under-report on bigger tenants (was DEFAULT_LIST_CAP).
    const all = await ctx.db
      .query('assetCatalog')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .take(XLARGE_LIST_CAP);

    const stats = {
      total: all.length,
      available: all.filter((a) => a.status === 'available').length,
      assigned: all.filter((a) => a.status === 'assigned').length,
      maintenance: all.filter((a) => a.status === 'maintenance').length,
      retired: all.filter((a) => a.status === 'retired').length,
      lost: all.filter((a) => a.status === 'lost').length,
      byCategory: {} as Record<string, number>,
      totalValue: 0,
      warrantyExpiringSoon: 0,
    };

    const now = Date.now();
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    for (const asset of all) {
      stats.byCategory[asset.category] = (stats.byCategory[asset.category] || 0) + 1;
      // Only count value of assets still on the books (exclude retired/lost).
      if (asset.purchasePrice && asset.status !== 'retired' && asset.status !== 'lost') {
        stats.totalValue += asset.purchasePrice;
      }
      if (
        asset.warrantyExpiry &&
        asset.warrantyExpiry >= now &&
        asset.warrantyExpiry <= now + THIRTY_DAYS
      ) {
        stats.warrantyExpiringSoon += 1;
      }
    }

    // Count active assignments
    const activeAssignments = await ctx.db
      .query('assetAssignments')
      .withIndex('by_org_status', (q) =>
        q.eq('organizationId', args.organizationId).eq('status', 'active'),
      )
      .take(XLARGE_LIST_CAP);

    // Count pending requests
    const pendingRequests = await ctx.db
      .query('assetRequests')
      .withIndex('by_org_status', (q) =>
        q.eq('organizationId', args.organizationId).eq('status', 'pending'),
      )
      .take(DEFAULT_LIST_CAP);

    return {
      ...stats,
      activeAssignments: activeAssignments.length,
      pendingRequests: pendingRequests.length,
    };
  },
});

export const searchAssets = query({
  args: {
    organizationId: v.id('organizations'),
    query: v.string(),
  },
  handler: async (ctx, args) => {
    if (!args.query.trim()) return [];
    const q = args.query.toLowerCase();
    const all = await ctx.db
      .query('assetCatalog')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .take(DEFAULT_LIST_CAP);

    return all.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.serialNumber && a.serialNumber.toLowerCase().includes(q)) ||
        (a.assetTag && a.assetTag.toLowerCase().includes(q)) ||
        (a.brand && a.brand.toLowerCase().includes(q)) ||
        (a.model && a.model.toLowerCase().includes(q)),
    );
  },
});

// ── Assignments ────────────────────────────────────────────

export const listEmployeeAssets = query({
  args: {
    organizationId: v.id('organizations'),
    employeeId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const assignments = await ctx.db
      .query('assetAssignments')
      .withIndex('by_assignee_org', (q) =>
        q.eq('organizationId', args.organizationId).eq('assignedTo', args.employeeId),
      )
      .order('desc')
      .take(DEFAULT_LIST_CAP);

    return await Promise.all(
      assignments.map(async (a) => {
        const asset = await ctx.db.get(a.assetId);
        // Reconcile movement form status with actual signature document
        let movementFormStatus = a.movementFormStatus;
        if (movementFormStatus === 'pending' && a.movementFormDocId) {
          const sigDoc = await ctx.db.get(a.movementFormDocId);
          if (sigDoc?.status === 'completed') {
            movementFormStatus = 'signed';
          }
        }
        // Reconcile return form status
        let returnFormStatus = a.returnFormStatus;
        if (returnFormStatus === 'pending' && a.returnFormDocId) {
          const sigDoc = await ctx.db.get(a.returnFormDocId);
          if (sigDoc?.status === 'completed') {
            returnFormStatus = 'signed';
          }
        }
        return {
          ...a,
          movementFormStatus,
          returnFormStatus,
          assetName: asset?.name ?? 'Unknown',
          assetCategory: asset?.category ?? 'other',
          assetIcon: getCategoryIcon(asset?.category ?? 'other'),
          assetStatus: asset?.status,
          // Catalog identity fields so the employee-assets tab can build a
          // complete QR sticker payload (previously accessed via `(a as any)`
          // casts and always undefined at runtime).
          assetSerialNumber: asset?.serialNumber,
          assetTag: asset?.assetTag,
          assetBrand: asset?.brand,
          assetModel: asset?.model,
        };
      }),
    );
  },
});

// ── Maintenance ────────────────────────────────────────────

export const listMaintenance = query({
  args: {
    organizationId: v.id('organizations'),
    status: v.optional(
      v.union(
        v.literal('scheduled'),
        v.literal('in_progress'),
        v.literal('completed'),
        v.literal('cancelled'),
      ),
    ),
  },
  handler: async (ctx, args) => {
    let q = ctx.db
      .query('assetMaintenance')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId));

    if (args.status) {
      q = q.filter((q) => q.eq(q.field('status'), args.status));
    }

    const records = await q.order('desc').take(DEFAULT_LIST_CAP);

    return await Promise.all(
      records.map(async (r) => {
        const asset = await ctx.db.get(r.assetId);
        return {
          ...r,
          assetName: asset?.name ?? 'Unknown',
          assetIcon: getCategoryIcon(asset?.category ?? 'other'),
        };
      }),
    );
  },
});

// ── Requests ───────────────────────────────────────────────

export const listAssetRequests = query({
  args: {
    organizationId: v.id('organizations'),
    status: v.optional(
      v.union(
        v.literal('pending'),
        v.literal('approved'),
        v.literal('fulfilled'),
        v.literal('rejected'),
      ),
    ),
  },
  handler: async (ctx, args) => {
    let q = ctx.db
      .query('assetRequests')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId));

    if (args.status) {
      q = q.filter((q) => q.eq(q.field('status'), args.status));
    }

    const requests = await q.order('desc').take(DEFAULT_LIST_CAP);

    return await Promise.all(
      requests.map(async (r) => {
        const requester = await ctx.db.get(r.requestedBy);
        const approver = r.approvedBy ? await ctx.db.get(r.approvedBy) : null;
        const fulfilledAsset = r.fulfilledBy ? await ctx.db.get(r.fulfilledBy) : null;
        return {
          ...r,
          requesterName: requester?.name ?? 'Unknown',
          requesterEmail: requester?.email,
          approverName: approver?.name,
          fulfilledAssetName: fulfilledAsset?.name,
        };
      }),
    );
  },
});

export const getMyAssetRequests = query({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const requests = await ctx.db
      .query('assetRequests')
      .withIndex('by_requestor', (q) => q.eq('requestedBy', args.userId))
      .order('desc')
      .take(DEFAULT_LIST_CAP);

    return await Promise.all(
      requests.map(async (r) => {
        const fulfilledAsset = r.fulfilledBy ? await ctx.db.get(r.fulfilledBy) : null;
        return { ...r, fulfilledAssetName: fulfilledAsset?.name };
      }),
    );
  },
});

// ═══════════════════════════════════════════════════════════════
//  QUERIES — Movement Form
// ═══════════════════════════════════════════════════════════════

/**
 * Check if a specific assignment has a movement form and its signing status.
 */
export const getMovementFormStatus = query({
  args: { assignmentId: v.id('assetAssignments') },
  handler: async (ctx, args) => {
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) return null;

    const status = assignment.movementFormStatus || 'not_sent';

    let signatureDoc = null;
    if (assignment.movementFormDocId) {
      signatureDoc = await ctx.db.get(assignment.movementFormDocId);
    }

    // If the signature document exists, check its real status
    let effectiveStatus = status;
    if (signatureDoc) {
      if (signatureDoc.status === 'completed') {
        effectiveStatus = 'signed';
      } else if (signatureDoc.status === 'pending' || signatureDoc.status === 'partially_signed') {
        effectiveStatus = 'pending';
      }
    }

    return {
      assignmentId: args.assignmentId,
      status: effectiveStatus,
      documentId: assignment.movementFormDocId,
      documentStatus: signatureDoc?.status || null,
      signedPdfUrl: signatureDoc?.signedPdfUrl || null,
      signedPdfName: signatureDoc?.signedPdfName || null,
      documentTitle: signatureDoc?.title || null,
    };
  },
});

// ═══════════════════════════════════════════════════════════════
//  MUTATIONS — Asset Catalog
// ═══════════════════════════════════════════════════════════════

export const createAsset = mutation({
  args: {
    organizationId: v.id('organizations'),
    name: v.string(),
    category: v.union(
      v.literal('laptop'),
      v.literal('monitor'),
      v.literal('phone'),
      v.literal('tablet'),
      v.literal('peripheral'),
      v.literal('furniture'),
      v.literal('software_license'),
      v.literal('vehicle'),
      v.literal('other'),
    ),
    serialNumber: v.optional(v.string()),
    assetTag: v.optional(v.string()),
    brand: v.optional(v.string()),
    model: v.optional(v.string()),
    purchaseDate: v.optional(v.number()),
    purchasePrice: v.optional(v.number()),
    currency: v.optional(v.string()),
    warrantyExpiry: v.optional(v.number()),
    vendor: v.optional(v.string()),
    invoiceNumber: v.optional(v.string()),
    expenseId: v.optional(v.id('expenses')),
    condition: v.optional(
      v.union(
        v.literal('new'),
        v.literal('good'),
        v.literal('fair'),
        v.literal('poor'),
        v.literal('damaged'),
      ),
    ),
    location: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdBy: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { createdBy, ...fields } = args;
    await assertUniqueIdentifiers(ctx, args.organizationId, {
      serialNumber: fields.serialNumber,
      assetTag: fields.assetTag,
    });
    const now = Date.now();
    const assetId = await ctx.db.insert('assetCatalog', {
      ...fields,
      condition: fields.condition ?? 'new',
      status: 'available',
      createdBy,
      createdAt: now,
      updatedAt: now,
    });
    await logAssetHistory(ctx, {
      organizationId: args.organizationId,
      assetId,
      action: 'created',
      toStatus: 'available',
      actorId: createdBy,
    });
    return assetId;
  },
});

export const updateAsset = mutation({
  args: {
    assetId: v.id('assetCatalog'),
    name: v.optional(v.string()),
    category: v.optional(
      v.union(
        v.literal('laptop'),
        v.literal('monitor'),
        v.literal('phone'),
        v.literal('tablet'),
        v.literal('peripheral'),
        v.literal('furniture'),
        v.literal('software_license'),
        v.literal('vehicle'),
        v.literal('other'),
      ),
    ),
    serialNumber: v.optional(v.string()),
    assetTag: v.optional(v.string()),
    brand: v.optional(v.string()),
    model: v.optional(v.string()),
    purchaseDate: v.optional(v.number()),
    purchasePrice: v.optional(v.number()),
    currency: v.optional(v.string()),
    warrantyExpiry: v.optional(v.number()),
    vendor: v.optional(v.string()),
    invoiceNumber: v.optional(v.string()),
    expenseId: v.optional(v.id('expenses')),
    condition: v.optional(
      v.union(
        v.literal('new'),
        v.literal('good'),
        v.literal('fair'),
        v.literal('poor'),
        v.literal('damaged'),
      ),
    ),
    location: v.optional(v.string()),
    notes: v.optional(v.string()),
    imageStorageId: v.optional(v.id('_storage')),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { assetId, ...fields } = args;
    const asset = await ctx.db.get(assetId);
    if (!asset) throw new Error('Asset not found');

    // Re-check identifier uniqueness only when they actually change.
    if (
      (fields.serialNumber !== undefined && fields.serialNumber !== asset.serialNumber) ||
      (fields.assetTag !== undefined && fields.assetTag !== asset.assetTag)
    ) {
      await assertUniqueIdentifiers(
        ctx,
        asset.organizationId,
        {
          serialNumber: fields.serialNumber ?? asset.serialNumber,
          assetTag: fields.assetTag ?? asset.assetTag,
        },
        assetId,
      );
    }

    const update: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) update[key] = value;
    }
    await ctx.db.patch(assetId, update);
  },
});

export const deleteAsset = mutation({
  args: { assetId: v.id('assetCatalog') },
  handler: async (ctx, args) => {
    // Check no active assignments
    const activeAssignment = await ctx.db
      .query('assetAssignments')
      .withIndex('by_asset_active', (q) => q.eq('assetId', args.assetId).eq('status', 'active'))
      .first();
    if (activeAssignment) {
      throw new Error('Cannot delete an asset with active assignment. Return it first.');
    }

    // Clean up the audit trail so deleted assets don't leave orphaned history.
    const history = await ctx.db
      .query('assetHistory')
      .withIndex('by_asset', (q) => q.eq('assetId', args.assetId))
      .take(DEFAULT_LIST_CAP);
    for (const h of history) {
      await ctx.db.delete(h._id);
    }

    await ctx.db.delete(args.assetId);
  },
});

export const changeAssetStatus = mutation({
  args: {
    assetId: v.id('assetCatalog'),
    status: v.union(
      v.literal('available'),
      v.literal('assigned'),
      v.literal('maintenance'),
      v.literal('retired'),
      v.literal('lost'),
    ),
    // Reason for the status change — recorded in the audit trail, NOT written
    // over the asset's descriptive `notes` field (previous bug).
    reason: v.optional(v.string()),
    changedBy: v.optional(v.id('users')),
  },
  handler: async (ctx, args) => {
    const { assetId, status, reason, changedBy } = args;
    const asset = await ctx.db.get(assetId);
    if (!asset) throw new Error('Asset not found');

    const fromStatus = asset.status;
    if (fromStatus === status) return; // no-op, nothing to log

    await ctx.db.patch(assetId, { status, updatedAt: Date.now() });

    await logAssetHistory(ctx, {
      organizationId: asset.organizationId,
      assetId,
      action: status === 'retired' ? 'retired' : 'status_changed',
      fromStatus,
      toStatus: status,
      note: reason,
      actorId: changedBy,
    });
  },
});

// ═══════════════════════════════════════════════════════════════
//  MUTATIONS — Assignments
// ═══════════════════════════════════════════════════════════════

export const assignAsset = mutation({
  args: {
    organizationId: v.id('organizations'),
    assetId: v.id('assetCatalog'),
    assignedTo: v.id('users'),
    assignedBy: v.id('users'),
    expectedReturnAt: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await performAssignment(ctx, args);
  },
});

/**
 * Core assignment routine shared by assignAsset (direct) and request
 * fulfillment. Validates availability, creates the assignment, flips the
 * asset to 'assigned', logs history, generates the movement form, and
 * notifies the assignee. Returns the new assignment id.
 */
async function performAssignment(
  ctx: MutationCtx,
  args: {
    organizationId: Id<'organizations'>;
    assetId: Id<'assetCatalog'>;
    assignedTo: Id<'users'>;
    assignedBy: Id<'users'>;
    expectedReturnAt?: number;
    notes?: string;
  },
): Promise<Id<'assetAssignments'>> {
  const asset = await ctx.db.get(args.assetId);
  if (!asset) throw new Error('Asset not found');
  if (asset.status !== 'available') {
    throw new Error(`Asset is not available (current: ${asset.status})`);
  }

  const now = Date.now();

  // Create assignment
  const assignmentId = await ctx.db.insert('assetAssignments', {
    organizationId: args.organizationId,
    assetId: args.assetId,
    assignedTo: args.assignedTo,
    assignedBy: args.assignedBy,
    assignedAt: now,
    expectedReturnAt: args.expectedReturnAt,
    notes: args.notes,
    status: 'active',
  });

  // Update asset status
  await ctx.db.patch(args.assetId, { status: 'assigned', updatedAt: now });

  await logAssetHistory(ctx, {
    organizationId: args.organizationId,
    assetId: args.assetId,
    action: 'assigned',
    fromStatus: asset.status,
    toStatus: 'assigned',
    note: args.notes,
    actorId: args.assignedBy,
  });

  // Create movement form synchronously so movementFormDocId is set immediately
  // and the UI never shows a "Send" button when a document is already pending.
  // Using scheduler.runAfter here would create a race condition where the user
  // could click "Send" before the deferred job runs, creating duplicate documents.
  await ctx.runMutation(internal.assets.createAssetMovementForm, {
    organizationId: args.organizationId,
    assignmentId,
    assetId: args.assetId,
    assetName: asset.name,
    assignedTo: args.assignedTo,
    assignedBy: args.assignedBy,
  });

  // Send notification
  await ctx.scheduler.runAfter(0, internal.assets.sendAssignmentNotification, {
    organizationId: args.organizationId,
    assetId: args.assetId,
    assignedTo: args.assignedTo,
    assignedBy: args.assignedBy,
    assetName: asset.name,
  });

  return assignmentId;
}

export const returnAsset = mutation({
  args: {
    assignmentId: v.id('assetAssignments'),
    returnedBy: v.id('users'),
    condition: v.optional(
      v.union(v.literal('good'), v.literal('fair'), v.literal('poor'), v.literal('damaged')),
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) throw new Error('Assignment not found');
    if (assignment.status !== 'active') throw new Error('Assignment is not active');

    const now = Date.now();

    // Update assignment. Preserve the assignment's original notes when the
    // caller doesn't provide return notes (avoid wiping handover context).
    await ctx.db.patch(args.assignmentId, {
      status: 'returned',
      returnedAt: now,
      returnedBy: args.returnedBy,
      conditionOnReturn: args.condition,
      notes: args.notes ?? assignment.notes,
    });

    // Update asset status back to available. Only overwrite the asset's
    // condition when a condition was actually assessed on return — otherwise
    // keep whatever the asset already had (previously defaulted to 'good',
    // silently "healing" damaged items).
    const assetForReturn = await ctx.db.get(assignment.assetId);
    await ctx.db.patch(assignment.assetId, {
      status: 'available',
      condition: args.condition ?? assetForReturn?.condition ?? 'good',
      updatedAt: now,
    });

    await logAssetHistory(ctx, {
      organizationId: assignment.organizationId,
      assetId: assignment.assetId,
      action: 'returned',
      fromStatus: assetForReturn?.status,
      toStatus: 'available',
      note: args.condition ? `Condition on return: ${args.condition}` : args.notes,
      actorId: args.returnedBy,
    });

    // Get asset info for the return form
    const returnedAsset = assetForReturn;

    // Auto-create return movement form (async)
    await ctx.scheduler.runAfter(0, internal.assets.createReturnMovementForm, {
      organizationId: assignment.organizationId,
      assignmentId: args.assignmentId,
      assetId: assignment.assetId,
      assetName: returnedAsset?.name || 'Asset',
      assignedTo: assignment.assignedTo,
      returnedBy: args.returnedBy,
      condition: args.condition,
    });
  },
});

export const markAssignmentLost = mutation({
  args: {
    assignmentId: v.id('assetAssignments'),
    returnedBy: v.id('users'),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) throw new Error('Assignment not found');

    const now = Date.now();
    const asset = await ctx.db.get(assignment.assetId);

    await ctx.db.patch(args.assignmentId, {
      status: 'lost',
      returnedAt: now,
      returnedBy: args.returnedBy,
      notes: args.notes ?? assignment.notes,
    });
    await ctx.db.patch(assignment.assetId, { status: 'lost', updatedAt: now });

    await logAssetHistory(ctx, {
      organizationId: assignment.organizationId,
      assetId: assignment.assetId,
      action: 'lost',
      fromStatus: asset?.status,
      toStatus: 'lost',
      note: args.notes,
      actorId: args.returnedBy,
    });
  },
});

// ═══════════════════════════════════════════════════════════════
//  MUTATIONS — Maintenance
// ═══════════════════════════════════════════════════════════════

export const scheduleMaintenance = mutation({
  args: {
    organizationId: v.id('organizations'),
    assetId: v.id('assetCatalog'),
    type: v.union(
      v.literal('scheduled'),
      v.literal('repair'),
      v.literal('upgrade'),
      v.literal('inspection'),
    ),
    description: v.string(),
    scheduledDate: v.optional(v.number()),
    cost: v.optional(v.number()),
    performedBy: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdBy: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { createdBy, ...fields } = args;
    const now = Date.now();

    const asset = await ctx.db.get(args.assetId);
    if (!asset) throw new Error('Asset not found');

    // Only take the asset out of service NOW when the work starts now — i.e.
    // there is no scheduledDate, or it is due today/overdue. Future-dated
    // maintenance stays 'scheduled' and the asset remains usable until then.
    const startsNow = !fields.scheduledDate || fields.scheduledDate <= now;

    // Create maintenance record
    await ctx.db.insert('assetMaintenance', {
      ...fields,
      status: startsNow ? 'in_progress' : 'scheduled',
      createdBy,
      createdAt: now,
    });

    if (startsNow && asset.status !== 'maintenance') {
      await ctx.db.patch(args.assetId, { status: 'maintenance', updatedAt: now });
      await logAssetHistory(ctx, {
        organizationId: args.organizationId,
        assetId: args.assetId,
        action: 'maintenance_started',
        fromStatus: asset.status,
        toStatus: 'maintenance',
        note: fields.description,
        actorId: createdBy,
      });
    } else {
      await logAssetHistory(ctx, {
        organizationId: args.organizationId,
        assetId: args.assetId,
        action: 'maintenance_scheduled',
        note: fields.description,
        actorId: createdBy,
      });
    }
  },
});

/**
 * Move a scheduled maintenance record into 'in_progress' and take the asset
 * out of service. Used when a future-dated maintenance actually begins.
 */
export const startMaintenance = mutation({
  args: {
    maintenanceId: v.id('assetMaintenance'),
    startedBy: v.optional(v.id('users')),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.maintenanceId);
    if (!record) throw new Error('Maintenance record not found');
    if (record.status !== 'scheduled') {
      throw new Error(`Maintenance is not scheduled (current: ${record.status})`);
    }

    const now = Date.now();
    await ctx.db.patch(args.maintenanceId, { status: 'in_progress' });

    const asset = await ctx.db.get(record.assetId);
    if (asset && asset.status !== 'maintenance') {
      await ctx.db.patch(record.assetId, { status: 'maintenance', updatedAt: now });
      await logAssetHistory(ctx, {
        organizationId: record.organizationId,
        assetId: record.assetId,
        action: 'maintenance_started',
        fromStatus: asset.status,
        toStatus: 'maintenance',
        note: record.description,
        actorId: args.startedBy,
      });
    }
  },
});

/**
 * Cancel a scheduled/in-progress maintenance. If the asset was pulled into
 * 'maintenance' for this record, restore it (to assigned or available).
 */
export const cancelMaintenance = mutation({
  args: {
    maintenanceId: v.id('assetMaintenance'),
    cancelledBy: v.optional(v.id('users')),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.maintenanceId);
    if (!record) throw new Error('Maintenance record not found');
    if (record.status === 'completed' || record.status === 'cancelled') {
      throw new Error(`Maintenance is already ${record.status}`);
    }

    await ctx.db.patch(args.maintenanceId, {
      status: 'cancelled',
      notes: args.notes ?? record.notes,
    });

    await restoreAssetAfterMaintenance(
      ctx,
      record.assetId,
      'maintenance_cancelled',
      args.cancelledBy,
    );
  },
});

/**
 * Edit an existing maintenance record's mutable fields.
 */
export const updateMaintenance = mutation({
  args: {
    maintenanceId: v.id('assetMaintenance'),
    description: v.optional(v.string()),
    scheduledDate: v.optional(v.number()),
    cost: v.optional(v.number()),
    performedBy: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { maintenanceId, ...fields } = args;
    const record = await ctx.db.get(maintenanceId);
    if (!record) throw new Error('Maintenance record not found');

    const update: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) update[key] = value;
    }
    if (Object.keys(update).length > 0) {
      await ctx.db.patch(maintenanceId, update);
    }
  },
});

export const completeMaintenance = mutation({
  args: {
    maintenanceId: v.id('assetMaintenance'),
    completedDate: v.number(),
    cost: v.optional(v.number()),
    notes: v.optional(v.string()),
    completedBy: v.optional(v.id('users')),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.maintenanceId);
    if (!record) throw new Error('Maintenance record not found');
    if (record.status === 'completed') throw new Error('Maintenance is already completed');

    await ctx.db.patch(args.maintenanceId, {
      status: 'completed',
      completedDate: args.completedDate,
      cost: args.cost ?? record.cost,
      notes: args.notes ?? record.notes,
    });

    await restoreAssetAfterMaintenance(
      ctx,
      record.assetId,
      'maintenance_completed',
      args.completedBy,
    );
  },
});

// ═══════════════════════════════════════════════════════════════
//  MUTATIONS — Requests
// ═══════════════════════════════════════════════════════════════

export const createAssetRequest = mutation({
  args: {
    organizationId: v.id('organizations'),
    requestedBy: v.id('users'),
    category: v.union(
      v.literal('laptop'),
      v.literal('monitor'),
      v.literal('phone'),
      v.literal('peripheral'),
      v.literal('software'),
      v.literal('other'),
    ),
    reason: v.string(),
    urgency: v.union(v.literal('low'), v.literal('medium'), v.literal('high')),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert('assetRequests', {
      ...args,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const approveAssetRequest = mutation({
  args: {
    requestId: v.id('assetRequests'),
    approvedBy: v.id('users'),
    fulfilledBy: v.optional(v.id('assetCatalog')),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error('Request not found');

    const now = Date.now();
    const update: Record<string, unknown> = {
      status: 'approved',
      approvedBy: args.approvedBy,
      approvedAt: now,
      updatedAt: now,
    };

    // If an asset is chosen at approval time, actually assign it to the
    // requester (creates the assignment + movement form) rather than just
    // stamping fulfilledBy on the request.
    if (args.fulfilledBy) {
      await performAssignment(ctx, {
        organizationId: request.organizationId,
        assetId: args.fulfilledBy,
        assignedTo: request.requestedBy,
        assignedBy: args.approvedBy,
        notes: `Fulfilling asset request: ${request.reason}`,
      });
      update.status = 'fulfilled';
      update.fulfilledBy = args.fulfilledBy;
    }
    await ctx.db.patch(args.requestId, update);
  },
});

export const rejectAssetRequest = mutation({
  args: {
    requestId: v.id('assetRequests'),
    approvedBy: v.id('users'),
    rejectionReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.requestId, {
      status: 'rejected',
      approvedBy: args.approvedBy,
      rejectionReason: args.rejectionReason,
      updatedAt: Date.now(),
    });
  },
});

export const fulfillAssetRequest = mutation({
  args: {
    requestId: v.id('assetRequests'),
    fulfilledBy: v.id('assetCatalog'),
    fulfilledByUser: v.optional(v.id('users')),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error('Request not found');
    if (request.status === 'fulfilled') throw new Error('Request is already fulfilled');
    if (request.status === 'rejected') throw new Error('Cannot fulfill a rejected request');

    // Actually assign the asset to the requester. The assignee is the person
    // who created the request; assignedBy defaults to the requester when no
    // acting admin is supplied (keeps the audit trail non-null).
    await performAssignment(ctx, {
      organizationId: request.organizationId,
      assetId: args.fulfilledBy,
      assignedTo: request.requestedBy,
      assignedBy: args.fulfilledByUser ?? request.approvedBy ?? request.requestedBy,
      notes: `Fulfilling asset request: ${request.reason}`,
    });

    await ctx.db.patch(args.requestId, {
      status: 'fulfilled',
      fulfilledBy: args.fulfilledBy,
      updatedAt: Date.now(),
    });
  },
});

// ═══════════════════════════════════════════════════════════════
//  INTERNAL — Notifications
// ═══════════════════════════════════════════════════════════════

/**
 * Create an e-signature movement form for an asset assignment.
 * The employee receives a signing request in their E-Signatures tab.
 */
export const createAssetMovementForm = internalMutation({
  args: {
    organizationId: v.id('organizations'),
    assignmentId: v.id('assetAssignments'),
    assetId: v.id('assetCatalog'),
    assetName: v.string(),
    assignedTo: v.id('users'),
    assignedBy: v.id('users'),
  },
  handler: async (ctx, args) => {
    const assigner = await ctx.db.get(args.assignedBy);
    const assignee = await ctx.db.get(args.assignedTo);
    if (!assignee) return;

    const now = Date.now();
    const asset = await ctx.db.get(args.assetId);

    // Build the movement form content — locale-agnostic structured JSON.
    // `dateTs` is the canonical value: the client formats it in the active
    // language. `date` stays for backwards compatibility with older readers.
    const dateStr = new Date(now).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const formData = {
      _type: 'movement',
      assetName: args.assetName,
      assetSerial: asset?.serialNumber || '',
      assetTag: asset?.assetTag || '',
      category: asset?.category || '',
      brand: asset?.brand || '',
      model: asset?.model || '',
      location: asset?.location || '',
      condition: asset?.condition || '',
      assigneeName: assignee.name || 'Employee',
      assigneeEmail: assignee.email || '',
      assigneePosition: assignee.position || '',
      assignerName: assigner?.name || 'Admin',
      assignerPosition: assigner?.position || '',
      dateTs: now,
      date: dateStr,
    };
    const content = `__MF__${JSON.stringify(formData)}`;

    const fieldDefinitions = [
      {
        id: 'employee_name',
        label: 'Employee Name',
        type: 'text' as const,
        required: true,
        placeholder: assignee.name || '',
      },
      {
        id: 'date_received',
        label: 'Date Received',
        type: 'date' as const,
        required: true,
        placeholder: dateStr,
      },
      {
        id: 'employee_signature',
        label: 'Employee Signature',
        type: 'signature' as const,
        required: true,
        placeholder: '',
      },
    ];

    const fieldValues = [
      { fieldId: 'employee_name', value: assignee.name || '' },
      { fieldId: 'date_received', value: dateStr },
    ];

    // Create signature document
    const documentId = await ctx.db.insert('signatureDocuments', {
      organizationId: args.organizationId,
      title: 'Movement Form - ' + args.assetName,
      content,
      status: 'pending',
      fieldDefinitions,
      fieldValues,
      createdBy: args.assignedBy,
      createdAt: now,
    });

    // Create signature request for the employee (sequential, order 1)
    await ctx.db.insert('signatureRequests', {
      documentId,
      organizationId: args.organizationId,
      signerId: args.assignedTo,
      signerName: assignee.name || 'Employee',
      signerEmail: assignee.email || '',
      order: 1,
      status: 'pending',
      createdAt: now,
    });

    // Also create a request for admin (sequential, order 2)
    await ctx.db.insert('signatureRequests', {
      documentId,
      organizationId: args.organizationId,
      signerId: args.assignedBy,
      signerName: assigner?.name || 'Admin',
      signerEmail: assigner?.email || '',
      order: 2,
      status: 'pending',
      createdAt: now,
    });

    // Audit log
    await ctx.db.insert('signatureAuditLog', {
      documentId,
      organizationId: args.organizationId,
      userId: args.assignedBy,
      action: 'created',
      timestamp: now,
    });
    await ctx.db.insert('signatureAuditLog', {
      documentId,
      organizationId: args.organizationId,
      userId: args.assignedBy,
      action: 'sent',
      metadata: JSON.stringify({ signerCount: 2 }),
      timestamp: now + 1,
    });

    // Update assignment with movement form reference
    await ctx.db.patch(args.assignmentId, {
      movementFormDocId: documentId,
      movementFormStatus: 'pending',
    });

    // Send notification to employee
    await ctx.db.insert('notifications', {
      organizationId: args.organizationId,
      userId: args.assignedTo,
      type: 'system',
      title: '📄 Movement Form Ready for Signing',
      message:
        'Please sign the movement form for "' + args.assetName + '" in the E-Signatures section.',
      isRead: false,
      relatedId: documentId,
      route: '/signatures',
      createdAt: now,
    });
  },
});

/**
 * Send (or resend) a movement form for an assignment.
 * Public wrapper that the UI can call directly.
 */

/**
 * Create an e-signature return form for an asset return.
 * The employee and admin sign to acknowledge the return.
 */
export const createReturnMovementForm = internalMutation({
  args: {
    organizationId: v.id('organizations'),
    assignmentId: v.id('assetAssignments'),
    assetId: v.id('assetCatalog'),
    assetName: v.string(),
    assignedTo: v.id('users'),
    returnedBy: v.id('users'),
    condition: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const returner = await ctx.db.get(args.returnedBy);
    const assignee = await ctx.db.get(args.assignedTo);
    if (!assignee) return;

    const now = Date.now();
    const asset = await ctx.db.get(args.assetId);

    // Build the return form content — locale-agnostic structured JSON.
    // `dateTs` is canonical; `date` remains for backwards compatibility.
    const dateStr = new Date(now).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const formData = {
      _type: 'return',
      assetName: args.assetName,
      assetSerial: asset?.serialNumber || '',
      assetTag: asset?.assetTag || '',
      category: asset?.category || '',
      brand: asset?.brand || '',
      model: asset?.model || '',
      location: asset?.location || '',
      assigneeName: assignee.name || 'Employee',
      assigneeEmail: assignee.email || '',
      assigneePosition: assignee.position || '',
      returnerName: returner?.name || 'Admin',
      dateTs: now,
      date: dateStr,
      condition: args.condition || 'good',
    };
    const content = `__RF__${JSON.stringify(formData)}`;

    const fieldDefinitions = [
      {
        id: 'employee_name',
        label: 'Employee Name',
        type: 'text' as const,
        required: true,
        placeholder: assignee.name || '',
      },
      {
        id: 'date_returned',
        label: 'Date Returned',
        type: 'date' as const,
        required: true,
        placeholder: dateStr,
      },
      {
        id: 'employee_signature',
        label: 'Employee Signature',
        type: 'signature' as const,
        required: true,
        placeholder: '',
      },
    ];

    const fieldValues = [
      { fieldId: 'employee_name', value: assignee.name || '' },
      { fieldId: 'date_returned', value: dateStr },
    ];

    // Create signature document
    const documentId = await ctx.db.insert('signatureDocuments', {
      organizationId: args.organizationId,
      title: 'Return Form - ' + args.assetName,
      content,
      status: 'pending',
      fieldDefinitions,
      fieldValues,
      createdBy: args.returnedBy,
      createdAt: now,
    });

    // Create signature request for the returning employee (sequential, order 1)
    await ctx.db.insert('signatureRequests', {
      documentId,
      organizationId: args.organizationId,
      signerId: args.assignedTo,
      signerName: assignee.name || 'Employee',
      signerEmail: assignee.email || '',
      order: 1,
      status: 'pending',
      createdAt: now,
    });

    // Also create a request for admin (sequential, order 2)
    await ctx.db.insert('signatureRequests', {
      documentId,
      organizationId: args.organizationId,
      signerId: args.returnedBy,
      signerName: returner?.name || 'Admin',
      signerEmail: returner?.email || '',
      order: 2,
      status: 'pending',
      createdAt: now,
    });

    // Audit log
    await ctx.db.insert('signatureAuditLog', {
      documentId,
      organizationId: args.organizationId,
      userId: args.returnedBy,
      action: 'created',
      timestamp: now,
    });
    await ctx.db.insert('signatureAuditLog', {
      documentId,
      organizationId: args.organizationId,
      userId: args.returnedBy,
      action: 'sent',
      metadata: JSON.stringify({ signerCount: 2 }),
      timestamp: now + 1,
    });

    // Update assignment with return form reference
    await ctx.db.patch(args.assignmentId, {
      returnFormDocId: documentId,
      returnFormStatus: 'pending',
    });

    // Send notification to employee
    await ctx.db.insert('notifications', {
      organizationId: args.organizationId,
      userId: args.assignedTo,
      type: 'system',
      title: '📄 Return Form Ready for Signing',
      message:
        'Please sign the return form for "' + args.assetName + '" in the E-Signatures section.',
      isRead: false,
      relatedId: documentId,
      route: '/signatures',
      createdAt: now,
    });
  },
});

/**
 * Send (or resend) a movement form for an assignment.
 * - If a movement form already exists → resend (send reminder notification only).
 * - If no movement form yet → create one directly (inline, not via scheduler, to
 *   avoid a duplicate with the deferred scheduler job from assignAsset).
 */
export const sendMovementForm = mutation({
  args: {
    organizationId: v.id('organizations'),
    assignmentId: v.id('assetAssignments'),
    assetId: v.id('assetCatalog'),
    assetName: v.string(),
    assignedTo: v.id('users'),
    assignedBy: v.id('users'),
  },
  handler: async (ctx, args) => {
    // Check if a movement form already exists for this assignment
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) throw new Error('Assignment not found');

    if (assignment.movementFormDocId) {
      // Already has a document — just resend notification (reminder)
      const assignee = await ctx.db.get(args.assignedTo);
      if (assignee) {
        await ctx.db.insert('notifications', {
          organizationId: args.organizationId,
          userId: args.assignedTo,
          type: 'system',
          title: '📄 Movement Form Reminder',
          message:
            'Please sign the movement form for "' +
            args.assetName +
            '" in the E-Signatures section.',
          isRead: false,
          relatedId: assignment.movementFormDocId,
          route: '/signatures',
          createdAt: Date.now(),
        });
      }
      return; // Don't create a duplicate
    }

    // No existing document — create inline (not via scheduler) so the UI sees
    // the new documentId immediately and doesn't allow another "Send" click.
    await ctx.scheduler.runAfter(0, internal.assets.createAssetMovementForm, args);
  },
});

export const sendAssignmentNotification = internalMutation({
  args: {
    organizationId: v.id('organizations'),
    assetId: v.id('assetCatalog'),
    assignedTo: v.id('users'),
    assignedBy: v.id('users'),
    assetName: v.string(),
  },
  handler: async (ctx, args) => {
    const assigner = await ctx.db.get(args.assignedBy);
    const now = Date.now();

    // Notify the assignee
    await ctx.db.insert('notifications', {
      organizationId: args.organizationId,
      userId: args.assignedTo,
      type: 'system',
      title: '📦 Equipment Assigned',
      message: `You have been assigned "${args.assetName}" by ${assigner?.name ?? 'admin'}.`,
      isRead: false,
      relatedId: args.assetId,
      route: '/assets',
      createdAt: now,
    });
  },
});

// ═══════════════════════════════════════════════════════════════
//  INTEGRATIONS — called from onboarding / offboarding
// ═══════════════════════════════════════════════════════════════

/**
 * Called from onboarding when a task with category='equipment' is created.
 * This creates an asset request so IT knows to prepare the equipment.
 */
export const autoCreateRequestFromOnboarding = internalMutation({
  args: {
    organizationId: v.id('organizations'),
    employeeId: v.id('users'),
    reason: v.string(),
    category: v.union(
      v.literal('laptop'),
      v.literal('monitor'),
      v.literal('phone'),
      v.literal('peripheral'),
      v.literal('software'),
      v.literal('other'),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.insert('assetRequests', {
      organizationId: args.organizationId,
      requestedBy: args.employeeId,
      category: args.category,
      reason: `[Onboarding] ${args.reason}`,
      urgency: 'high',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Called from offboarding to check for active assignments.
 * Returns active assets so the offboarding UI can show what needs to be returned.
 */
export const checkActiveAssignmentsForEmployee = query({
  args: {
    organizationId: v.id('organizations'),
    employeeId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const assignments = await ctx.db
      .query('assetAssignments')
      .withIndex('by_assignee_org', (q) =>
        q.eq('organizationId', args.organizationId).eq('assignedTo', args.employeeId),
      )
      .filter((q) => q.eq(q.field('status'), 'active'))
      .take(SMALL_LIST_CAP);

    return await Promise.all(
      assignments.map(async (a) => {
        const asset = await ctx.db.get(a.assetId);
        return {
          assignmentId: a._id,
          assetId: a.assetId,
          assetName: asset?.name ?? 'Unknown',
          category: asset?.category ?? 'other',
          icon: getCategoryIcon(asset?.category ?? 'other'),
          assignedAt: a.assignedAt,
        };
      }),
    );
  },
});

/**
 * Auto-unassign all assets for an employee during offboarding.
 * Called when offboarding completes.
 */
export const autoReturnEmployeeAssets = internalMutation({
  args: {
    organizationId: v.id('organizations'),
    employeeId: v.id('users'),
    returnedBy: v.id('users'),
  },
  handler: async (ctx, args) => {
    const activeAssignments = await ctx.db
      .query('assetAssignments')
      .withIndex('by_assignee_org', (q) =>
        q.eq('organizationId', args.organizationId).eq('assignedTo', args.employeeId),
      )
      .filter((q) => q.eq(q.field('status'), 'active'))
      .take(SMALL_LIST_CAP);

    const now = Date.now();
    for (const a of activeAssignments) {
      await ctx.db.patch(a._id, {
        status: 'returned',
        returnedAt: now,
        returnedBy: args.returnedBy,
      });
      const asset = await ctx.db.get(a.assetId);
      if (asset && asset.status === 'assigned') {
        await ctx.db.patch(asset._id, { status: 'available', updatedAt: now });
      }
    }
  },
});

// ═══════════════════════════════════════════════════════════════
//  CRON — Scheduled Reminders
// ═══════════════════════════════════════════════════════════════

/**
 * Daily cron: find assets with warranty expiring in the next 30 days
 * and notify the `createdBy` user of each asset.
 */
export const checkWarrantyReminders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    const in30 = now + THIRTY_DAYS;

    // Iterate all orgs to find assets with warrantyExpiry in range.
    // The cron runs once daily so a bounded scan is acceptable.
    const orgs = await ctx.db.query('organizations').take(DEFAULT_LIST_CAP);

    for (const org of orgs) {
      const assets = await ctx.db
        .query('assetCatalog')
        .withIndex('by_org', (q) => q.eq('organizationId', org._id))
        .take(DEFAULT_LIST_CAP);

      for (const asset of assets) {
        if (!asset.warrantyExpiry) continue;
        if (asset.warrantyExpiry >= now && asset.warrantyExpiry <= in30) {
          const daysLeft = Math.ceil((asset.warrantyExpiry - now) / (24 * 60 * 60 * 1000));
          await ctx.db.insert('notifications', {
            organizationId: org._id,
            userId: asset.createdBy,
            type: 'system',
            title: '🔔 Warranty Expiring Soon',
            message: `Warranty for "${asset.name}" expires in ${daysLeft} day(s).`,
            isRead: false,
            relatedId: asset._id,
            route: '/assets',
            createdAt: now,
          });
        }
      }
    }
  },
});

/**
 * Daily cron: find scheduled maintenance that's due today (or overdue)
 * and send reminders to the person who created the record.
 */
export const checkMaintenanceReminders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const todayEnd = now + 24 * 60 * 60 * 1000;

    const orgs = await ctx.db.query('organizations').take(DEFAULT_LIST_CAP);

    for (const org of orgs) {
      const records = await ctx.db
        .query('assetMaintenance')
        .withIndex('by_org', (q) => q.eq('organizationId', org._id))
        .take(DEFAULT_LIST_CAP);

      for (const record of records) {
        if (record.status !== 'scheduled') continue;
        if (!record.scheduledDate || record.scheduledDate > todayEnd) continue;

        const asset = await ctx.db.get(record.assetId);
        const assetName = asset?.name ?? 'Unknown Asset';

        await ctx.db.insert('notifications', {
          organizationId: org._id,
          userId: record.createdBy,
          type: 'system',
          title: '🔧 Maintenance Due',
          message: `Scheduled maintenance "${record.description}" for ${assetName} is due.`,
          isRead: false,
          relatedId: record._id,
          route: '/assets',
          createdAt: now,
        });
      }
    }
  },
});
