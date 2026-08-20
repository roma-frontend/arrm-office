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
    /** True = a virtual room backed by LiveKit rather than a physical one. */
    isVirtual: v.optional(v.boolean()),
    /** LiveKit room name backing a virtual room; unset for physical rooms. */
    livekitRoomName: v.optional(v.string()),
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
    videoUrl: v.optional(v.string()),
    videoProvider: v.optional(
      v.union(v.literal('livekit'), v.literal('teams'), v.literal('zoom'), v.literal('meet')),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_room', ['roomId'])
    .index('by_room_start', ['roomId', 'startTime'])
    .index('by_org_start', ['organizationId', 'startTime'])
    .index('by_organizer', ['organizerId']),

  /**
   * Per-attendee invitation state — the Outlook "Tracking" tab.
   *
   * `roomBookings.attendeeIds` stays as the denormalized roster (it is what the
   * lists and the capacity check read); this table adds the part a roster cannot
   * express: who answered what, when, with which note, and who actually turned
   * up. Rows are kept when somebody is uninvited (`removedAt`) so the history of
   * a meeting stays complete.
   */
  roomBookingAttendees: defineTable({
    organizationId: v.id('organizations'),
    bookingId: v.id('roomBookings'),
    roomId: v.id('meetingRooms'),
    userId: v.id('users'),
    /** 'needs_action' = invited, no answer yet. */
    response: v.union(
      v.literal('needs_action'),
      v.literal('accepted'),
      v.literal('tentative'),
      v.literal('declined'),
    ),
    respondedAt: v.optional(v.number()),
    /** Note left with the answer, e.g. "will join remotely". */
    comment: v.optional(v.string()),
    /** Optional attendees do not count towards the "everyone answered" state. */
    isOptional: v.optional(v.boolean()),
    invitedAt: v.number(),
    invitedBy: v.id('users'),
    /** Set when this person confirms they are in the room. */
    checkedInAt: v.optional(v.number()),
    removedAt: v.optional(v.number()),
    removedBy: v.optional(v.id('users')),
  })
    .index('by_booking', ['bookingId'])
    .index('by_booking_user', ['bookingId', 'userId'])
    .index('by_user', ['userId'])
    .index('by_org', ['organizationId']),

  /**
   * Append-only activity log of one booking: created, rescheduled, cancelled,
   * invitations, every RSVP change and every check-in.
   *
   * Actor and target names are snapshotted on write. An audit trail that joins
   * to `users` at read time turns into "Unknown → Unknown" once somebody leaves
   * the company, which is exactly when it is needed.
   */
  roomBookingEvents: defineTable({
    organizationId: v.id('organizations'),
    bookingId: v.id('roomBookings'),
    roomId: v.id('meetingRooms'),
    type: v.union(
      v.literal('created'),
      v.literal('updated'),
      v.literal('rescheduled'),
      v.literal('cancelled'),
      v.literal('attendee_added'),
      v.literal('attendee_removed'),
      v.literal('responded'),
      v.literal('responses_reset'),
      v.literal('checked_in'),
    ),
    /** Absent for system actions (a cron cancelling an archived room's bookings). */
    actorId: v.optional(v.id('users')),
    actorName: v.string(),
    actorRole: v.optional(v.string()),
    targetUserId: v.optional(v.id('users')),
    targetName: v.optional(v.string()),
    response: v.optional(
      v.union(
        v.literal('needs_action'),
        v.literal('accepted'),
        v.literal('tentative'),
        v.literal('declined'),
      ),
    ),
    previousStartTime: v.optional(v.number()),
    previousEndTime: v.optional(v.number()),
    newStartTime: v.optional(v.number()),
    newEndTime: v.optional(v.number()),
    /** Cancel reason, RSVP note, or a summary of the fields that changed. */
    note: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_booking', ['bookingId', 'createdAt'])
    .index('by_org_created', ['organizationId', 'createdAt'])
    .index('by_room_created', ['roomId', 'createdAt']),
};
