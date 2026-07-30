/**
 * Pagination utilities for Convex queries
 * Prevents loading all data at once, improves performance for large datasets
 */

import { v } from 'convex/values';
export interface PaginationOptions {
  pageSize?: number;
  cursor?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor?: string;
  hasMore: boolean;
  totalCount?: number;
}

// Default page size: 20 items per page
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * Validate and normalize page size
 */
export function normalizePageSize(pageSize?: number): number {
  if (!pageSize) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE);
}

/**
 * Parse cursor from base64
 */
export function decodeCursor(cursor: string): Record<string, any> {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
  } catch {
    return {};
  }
}

/**
 * Encode cursor to base64
 */
export function encodeCursor(data: Record<string, any>): string {
  return Buffer.from(JSON.stringify(data)).toString('base64');
}

/**
 * Pagination argument validator for Convex
 */
export const paginationArgs = {
  pageSize: v.optional(v.number()),
  cursor: v.optional(v.string()),
};

/**
 * Example usage in Convex query:
 *
 * export const getLeavesPaginated = query({
 *   args: { ...paginationArgs, organizationId: v.id("organizations") },
 *   handler: async (ctx, { pageSize, cursor, organizationId }) => {
 *     const normalizedPageSize = normalizePageSize(pageSize);
 *
 *     let query = ctx.db
 *       .query("leaveRequests")
 *       .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
 *       .order("desc");
 *
 *     // Apply cursor if provided
 *     if (cursor) {
 *       const { _id } = decodeCursor(cursor);
 *       query = query.filter((q) => q.lt(q.field("_creationTime"), _id));
 *     }
 *
 *     // Fetch pageSize + 1 to check if there are more items
 *     const items = await query.take(normalizedPageSize + 1);
 *     const hasMore = items.length > normalizedPageSize;
 *
 *     if (hasMore) {
 *       items.pop(); // Remove the extra item
 *     }
 *
 *     return {
 *       items,
 *       hasMore,
 *       nextCursor: hasMore && items.length > 0
 *         ? encodeCursor({ _id: items[items.length - 1]._creationTime })
 *         : undefined,
 *     };
 *   },
 * });
 */
