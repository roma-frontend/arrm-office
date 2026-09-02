import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const leaves = {
  leaveRequests: defineTable({
    organizationId: v.optional(v.id('organizations')),
    userId: v.id('users'),
    /**
     * Who actually filed the request. Equals `userId` for a self-service
     * request; differs when HR files on someone's behalf.
     *
     * Needed for separation of duties: the person who filed a request may not
     * also approve it. Optional because rows created before this field existed
     * have no filer recorded.
     */
    createdBy: v.optional(v.id('users')),
    type: v.union(
      v.literal('paid'),
      v.literal('unpaid'),
      v.literal('sick'),
      v.literal('family'),
      v.literal('doctor'),
      v.literal('day_off'),
      v.literal('maternity'),
      v.literal('paternity'),
      v.literal('study'),
    ),
    startDate: v.string(),
    endDate: v.string(),
    days: v.number(),
    reason: v.string(),
    comment: v.optional(v.string()),
    status: v.union(
      v.literal('pending'),
      v.literal('approved'),
      v.literal('rejected'),
      v.literal('cancel_requested'),
    ),
    /** Status before the employee asked HR to cancel the leave — used to restore it when HR rejects the cancellation. */
    previousStatus: v.optional(
      v.union(v.literal('pending'), v.literal('approved'), v.literal('rejected')),
    ),
    /** When the employee requested cancellation (HR queue). */
    cancelRequestedAt: v.optional(v.number()),
    isRead: v.optional(v.boolean()),
    reviewedBy: v.optional(v.id('users')),
    reviewComment: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
    /** Bilingual leave request document sent to the supervisor for signature. */
    leaveRequestDocumentId: v.optional(v.id('signatureDocuments')),
    /** Bilingual leave order document sent to HR for signature (generated after supervisor approval). */
    leaveOrderDocumentId: v.optional(v.id('signatureDocuments')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_user', ['userId'])
    .index('by_org_status', ['organizationId', 'status'])
    .index('by_status', ['status'])
    .index('by_created', ['createdAt'])
    .index('by_status_created', ['status', 'createdAt'])
    .index('by_user_status', ['userId', 'status'])
    .index('by_org_created', ['organizationId', 'createdAt']),
};
