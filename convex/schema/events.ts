import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const events = {
  companyEvents: defineTable({
    organizationId: v.id('organizations'),
    name: v.string(),
    description: v.optional(v.string()),
    startDate: v.number(),
    endDate: v.number(),
    isAllDay: v.optional(v.boolean()),
    requiredDepartments: v.array(v.string()),
    requiredEmployeeIds: v.optional(v.array(v.id('users'))),
    eventType: v.union(
      v.literal('meeting'),
      v.literal('conference'),
      v.literal('training'),
      v.literal('team_building'),
      v.literal('holiday'),
      v.literal('deadline'),
      v.literal('other'),
    ),
    priority: v.optional(v.union(v.literal('high'), v.literal('medium'), v.literal('low'))),
    createdBy: v.id('users'),
    notifyDaysBefore: v.optional(v.number()),
    notifiedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_date', ['startDate'])
    .index('by_org_date', ['organizationId', 'startDate'])
    .index('by_priority', ['priority']),

  calendarEvents: defineTable({
    organizationId: v.id('organizations'),
    createdBy: v.id('users'),
    title: v.string(),
    date: v.string(),
    startTime: v.string(),
    endTime: v.string(),
    allDay: v.boolean(),
    location: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.string(),
    reminder: v.string(),
    /**
     * Attendee names, kept in step with `attendeeIds` by the mutations so the
     * calendar can label an event without resolving every user.
     */
    attendees: v.optional(v.array(v.string())),
    /** The attendees themselves — the identity a rename or a namesake cannot break. */
    attendeeIds: v.optional(v.array(v.id('users'))),
    attachmentUrl: v.optional(v.string()),
    /** Meeting room reserved for this event, when one was picked. */
    roomId: v.optional(v.id('meetingRooms')),
    /** The reservation that backs `roomId`; cancelled when the event is removed. */
    roomBookingId: v.optional(v.id('roomBookings')),
    /**
     * LiveKit video conference link, auto-created by `meetings.ensureRoom` when
     * the organizer enables video. Stored relative ("meetings/{roomName}") so it
     * works on any origin (dev, preview, prod) without a domain config.
     */
    videoUrl: v.optional(v.string()),
    videoProvider: v.optional(v.literal('livekit')),
    /** Recording link attached after the meeting ends (Egress → storage). */
    videoRecordingUrl: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index('by_org', ['organizationId'])
    .index('by_org_date', ['organizationId', 'date'])
    .index('by_user', ['createdBy'])
    .index('by_room_booking', ['roomBookingId']),
};
