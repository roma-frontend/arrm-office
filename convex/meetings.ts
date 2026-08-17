/**
 * LiveKit video conferences — room metadata, lifecycle, queries.
 *
 * LiveKit never stores business logic: the app creates a LiveKit room only when
 * an organizer saves an event with video enabled, and participants get access
 * through short-lived JWTs minted in `meetingsActions.ts` (a Node-runtime
 * action — our server). Who, when and with which rights is decided here.
 *
 * This file holds the DB layer (queries + mutations, default Convex runtime).
 * All LiveKit HTTP calls live in `convex/meetingsActions.ts` ("use node"),
 * which funnels every write through the mutations below so an action can never
 * create a row the caller would not be allowed to create directly.
 */

import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { getAuthCaller } from './lib/getAuthCaller';
import { isSuperadmin } from './lib/auth';

/** Room names are derived from the event so re-saves never fork the room. */
export function roomNameForEvent(eventId: Id<'calendarEvents'>): string {
  return `evt_${eventId}`;
}

/** The stable join link stored on the calendar event. Relative = origin-agnostic. */
export function videoUrlForRoom(roomName: string): string {
  return `/meetings/${roomName}`;
}

// ── Queries ─────────────────────────────────────────────────────────────────

export const getByRoomName = query({
  args: { roomName: v.string() },
  handler: async (ctx, { roomName }) => {
    const meeting = await ctx.db
      .query('meetings')
      .withIndex('by_room_name', (q) => q.eq('roomName', roomName))
      .unique();
    if (!meeting) return null;
    const caller = await getAuthCaller(ctx);
    // Phase 1: org members + superadmins may read the meeting. Guest access by
    // link lands in Phase 2 together with the lobby/PIN flow.
    if (!caller) return null;
    if (!isSuperadmin(caller) && caller.organizationId !== meeting.organizationId) return null;
    const event = meeting.eventId ? await ctx.db.get(meeting.eventId) : null;
    return { ...meeting, event };
  },
});

export const getByEvent = query({
  args: { eventId: v.id('calendarEvents') },
  handler: async (ctx, { eventId }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return null;
    const meeting = await ctx.db
      .query('meetings')
      .withIndex('by_event', (q) => q.eq('eventId', eventId))
      .unique();
    if (!meeting) return null;
    if (!isSuperadmin(caller) && caller.organizationId !== meeting.organizationId) return null;
    return meeting;
  },
});

export const listByOrganization = query({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, { organizationId }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];
    if (!isSuperadmin(caller) && caller.organizationId !== organizationId) return [];
    return await ctx.db
      .query('meetings')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .order('desc')
      .take(100);
  },
});

// ── Mutations (called by actions or the client) ─────────────────────────────

/**
 * Idempotent room registration: creates the meeting row if missing and points
 * the calendar event at the join link. Safe to call on every save of an event
 * with video enabled.
 */
export const register = mutation({
  args: {
    eventId: v.id('calendarEvents'),
    organizationId: v.id('organizations'),
    roomName: v.string(),
    mode: v.union(v.literal('meeting'), v.literal('webinar')),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    if (!isSuperadmin(caller) && caller.organizationId !== args.organizationId) {
      throw new Error('Access denied: different organization');
    }
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error('Event not found');
    if (!isSuperadmin(caller) && event.createdBy !== caller._id && caller.role !== 'admin') {
      throw new Error('Only the organizer or an admin can attach video to this event');
    }

    const existing = await ctx.db
      .query('meetings')
      .withIndex('by_event', (q) => q.eq('eventId', args.eventId))
      .unique();
    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        mode: args.mode,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert('meetings', {
        eventId: args.eventId,
        organizationId: args.organizationId,
        roomName: args.roomName,
        hostUserId: caller._id,
        mode: args.mode,
        status: 'scheduled',
        createdAt: now,
        updatedAt: now,
      });
    }

    // Point the event at the room only once — the link is stable for the room's
    // lifetime, so re-saving must not produce a fresh URL.
    await ctx.db.patch(args.eventId, {
      videoUrl: event.videoUrl ?? videoUrlForRoom(args.roomName),
      videoProvider: 'livekit',
      updatedAt: now,
    });
    return { success: true };
  },
});

export const setStatus = mutation({
  args: {
    roomName: v.string(),
    status: v.union(v.literal('scheduled'), v.literal('live'), v.literal('ended')),
  },
  handler: async (ctx, { roomName, status }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const meeting = await ctx.db
      .query('meetings')
      .withIndex('by_room_name', (q) => q.eq('roomName', roomName))
      .unique();
    if (!meeting) throw new Error('Meeting not found');
    if (!isSuperadmin(caller) && caller.organizationId !== meeting.organizationId) {
      throw new Error('Access denied: different organization');
    }
    await ctx.db.patch(meeting._id, { status, updatedAt: Date.now() });
    return { success: true };
  },
});

/** Attaches the Egress recording link to the event once the recording finishes. */
export const setRecording = mutation({
  args: {
    roomName: v.string(),
    recordingUrl: v.string(),
  },
  handler: async (ctx, { roomName, recordingUrl }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const meeting = await ctx.db
      .query('meetings')
      .withIndex('by_room_name', (q) => q.eq('roomName', roomName))
      .unique();
    if (!meeting) throw new Error('Meeting not found');
    if (!isSuperadmin(caller) && caller.organizationId !== meeting.organizationId) {
      throw new Error('Access denied: different organization');
    }
    await ctx.db.patch(meeting._id, { updatedAt: Date.now() });
    if (meeting.eventId) {
      await ctx.db.patch(meeting.eventId, {
        videoRecordingUrl: recordingUrl,
        updatedAt: Date.now(),
      });
    }
    return { success: true };
  },
});

/**
 * Removes the video link from an event when the organizer turns the toggle off.
 * The LiveKit room itself is left in place (cheap, and the meeting row keeps
 * history); cleanup of orphaned rooms is a Phase 3 concern.
 */
export const removeVideo = mutation({
  args: { eventId: v.id('calendarEvents') },
  handler: async (ctx, { eventId }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const event = await ctx.db.get(eventId);
    if (!event) throw new Error('Event not found');
    if (!isSuperadmin(caller) && event.createdBy !== caller._id && caller.role !== 'admin') {
      throw new Error('Only the organizer or an admin can change this event');
    }
    await ctx.db.patch(eventId, {
      videoUrl: undefined,
      videoProvider: undefined,
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});
