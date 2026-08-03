import { defineTable } from 'convex/server';
import { v } from 'convex/values';

/**
 * Meeting rooms and their bookings.
 *
 * Rooms are managed by organization admins; bookings can be created by any
 * member of the organization. Times are epoch milliseconds so the live
 * free/busy status is a plain numeric comparison — no timezone parsing on the
 * hot path.
 */
export const meetingRooms = {
  meetingRooms: defineTable({
    organizationId: v.id('organizations'),
    name: v.string(),
    description: v.optional(v.string()),
    /** Where to find it: building / floor / door number. */
    building: v.optional(v.string()),
    floor: v.optional(v.string()),
    roomNumber: v.optional(v.string()),
    capacity: v.number(),
    /** Equipment keys (projector, tv, whiteboard, …) — see src/lib/meetingRooms.ts */
    amenities: v.array(v.string()),
    /** Accent colour used by the board and the calendar pills. */
    color: v.optional(v.string()),
    photoUrl: v.optional(v.string()),
    /** Archived rooms keep their history but cannot be booked. */
    isActive: v.boolean(),
    /** Optional booking window, e.g. 08:00–20:00 ("HH:mm"). */
    openFrom: v.optional(v.string()),
    openTo: v.optional(v.string()),
    createdBy: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_org_active', ['organizationId', 'isActive']),

  roomBookings: defineTable({
    organizationId: v.id('organizations'),
    roomId: v.id('meetingRooms'),
    title: v.string(),
    description: v.optional(v.string()),
    /** Epoch ms — inclusive start, exclusive end. */
    startTime: v.number(),
    endTime: v.number(),
    organizerId: v.id('users'),
    attendeeIds: v.optional(v.array(v.id('users'))),
    /** Free-form guests (clients, candidates) that have no account. */
    externalAttendees: v.optional(v.array(v.string())),
    status: v.union(v.literal('confirmed'), v.literal('cancelled')),
    /** Set when the organizer confirms they actually showed up. */
    checkedInAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    cancelledBy: v.optional(v.id('users')),
    cancelReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_room', ['roomId'])
    .index('by_room_start', ['roomId', 'startTime'])
    .index('by_org_start', ['organizationId', 'startTime'])
    .index('by_organizer', ['organizerId']),
};
