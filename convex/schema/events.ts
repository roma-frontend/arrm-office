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
    attendees: v.optional(v.array(v.string())),
    attachmentUrl: v.optional(v.string()),
    /** Meeting room reserved for this event, when one was picked. */
    roomId: v.optional(v.id('meetingRooms')),
    /** The reservation that backs `roomId`; cancelled when the event is removed. */
    roomBookingId: v.optional(v.id('roomBookings')),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index('by_org', ['organizationId'])
    .index('by_org_date', ['organizationId', 'date'])
    .index('by_user', ['createdBy'])
    .index('by_room_booking', ['roomBookingId']),
};
