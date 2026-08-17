import { defineTable } from 'convex/server';
import { v } from 'convex/values';

/**
 * Video-conference metadata — one row per LiveKit room.
 *
 * The row is created by `meetings.ensureRoom` (a Convex action) at the moment
 * the organizer saves an event with video enabled. `roomName` is derived from
 * the event id, so re-saving the event is idempotent and the join link is a
 * stable `meetings/{roomName}` URL that survives calendar re-scheduling.
 *
 * LiveKit itself never stores business logic: everything about *who, when and
 * with which rights* lives here; the JWT the participant gets is minted by our
 * server and is valid for a few hours only.
 */
export const meetings = {
  meetings: defineTable({
    /** The calendar event this room is attached to, when created from one. */
    eventId: v.optional(v.id('calendarEvents')),
    organizationId: v.id('organizations'),
    /** Unique LiveKit room name — stable across re-saves (`evt_{eventId}`). */
    roomName: v.string(),
    /** The user who created the room. */
    hostUserId: v.id('users'),
    /** `meeting` = everyone talks; `webinar` = only presenters talk. */
    mode: v.union(v.literal('meeting'), v.literal('webinar')),
    status: v.union(v.literal('scheduled'), v.literal('live'), v.literal('ended')),
    /** Optional door code a participant must type before joining. */
    pinCode: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index('by_org', ['organizationId'])
    .index('by_event', ['eventId'])
    .index('by_room_name', ['roomName']),
};
