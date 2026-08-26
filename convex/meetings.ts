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

import { mutation, query, type MutationCtx } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { getAuthCaller } from './lib/getAuthCaller';
import { isSuperadmin } from './lib/auth';
import {
  assertModuleAccess,
  assertQuota,
  currentPeriodKey,
  incrementUsage,
} from './lib/entitlements';

/** Room names are derived from the event so re-saves never fork the room. */
export function roomNameForEvent(eventId: Id<'calendarEvents'>): string {
  return `evt_${eventId}`;
}

/** The stable join link stored on the calendar event. Relative = origin-agnostic. */
export function videoUrlForRoom(roomName: string): string {
  return `/meetings/${roomName}`;
}

// ── Queries ─────────────────────────────────────────────────────────────────

/**
 * Whether video calls can actually be created right now. The calendar form
 * shows an inline hint instead of letting a save silently skip the join link.
 * Returns a boolean only — no configuration values leave the server.
 */
export const livekitConfigured = query({
  args: {},
  handler: async () => {
    const url = process.env.LIVEKIT_URL ?? process.env.NEXT_PUBLIC_LIVEKIT_URL;
    return Boolean(url && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);
  },
});

/**
 * Whether cloud recording can run: LiveKit Egress needs both the LiveKit
 * credentials *and* an object-storage target, because the finished file is
 * uploaded straight from LiveKit's infrastructure. Booleans only — no bucket
 * names or keys leave the server.
 */
export const recordingConfigured = query({
  args: {},
  handler: async () => {
    const url = process.env.LIVEKIT_URL ?? process.env.NEXT_PUBLIC_LIVEKIT_URL;
    const livekit = Boolean(url && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);
    const storage = Boolean(
      process.env.LIVEKIT_EGRESS_S3_BUCKET &&
      process.env.LIVEKIT_EGRESS_S3_ACCESS_KEY &&
      process.env.LIVEKIT_EGRESS_S3_SECRET,
    );
    return { configured: livekit && storage, livekit, storage };
  },
});

export const getByRoomName = query({
  args: { roomName: v.string() },
  handler: async (ctx, { roomName }) => {
    const meeting = await ctx.db
      .query('meetings')
      .withIndex('by_room_name', (q) => q.eq('roomName', roomName))
      .unique();
    if (!meeting) return null;
    const caller = await getAuthCaller(ctx);
    // Internal members see the full row + their host/cohost flags. External
    // visitors only need the bits required to render the lobby/registration
    // page — title, host name, waiting-room toggle, form fields. Anything
    // privileged (hostUserId, pin code, recording id) is stripped.
    if (caller) {
      if (!isSuperadmin(caller) && caller.organizationId !== meeting.organizationId) return null;
      const event = meeting.eventId ? await ctx.db.get(meeting.eventId) : null;
      return {
        ...meeting,
        event,
        isOriginalHost: meeting.hostUserId === caller._id,
        isCohost: (meeting.cohostIds ?? []).includes(caller._id),
      };
    }
    const host = await ctx.db.get(meeting.hostUserId);
    return {
      roomName: meeting.roomName,
      organizationId: meeting.organizationId,
      status: meeting.status,
      mode: meeting.mode,
      waitingRoomEnabled: meeting.waitingRoomEnabled ?? false,
      registrationEnabled: meeting.registrationEnabled ?? false,
      registrationFields: meeting.registrationFields ?? [
        { name: 'fullName' as const, required: true },
        { name: 'email' as const, required: true },
      ],
      hostName: host?.name ?? '',
    };
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
    waitingRoomEnabled: v.optional(v.boolean()),
    registrationEnabled: v.optional(v.boolean()),
    registrationFields: v.optional(
      v.array(
        v.object({
          name: v.union(v.literal('fullName'), v.literal('email'), v.literal('phone')),
          required: v.boolean(),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'videoConferences');
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

    // Re-saving a meeting is idempotent for stable fields (room name, host,
    // status) but the host may have flipped the waiting room or registration
    // form in the meeting settings dialog between the two saves — patch those
    // through so the change is not lost.
    const lobbyPatch: Record<string, unknown> = {
      mode: args.mode,
      updatedAt: now,
    };
    if (args.waitingRoomEnabled !== undefined) {
      lobbyPatch.waitingRoomEnabled = args.waitingRoomEnabled;
    }
    if (args.registrationEnabled !== undefined) {
      lobbyPatch.registrationEnabled = args.registrationEnabled;
    }
    if (args.registrationFields !== undefined) {
      const hasFullName = args.registrationFields.some((f) => f.name === 'fullName');
      lobbyPatch.registrationFields = hasFullName
        ? args.registrationFields
        : [...args.registrationFields, { name: 'fullName' as const, required: true }];
    }

    if (existing) {
      await ctx.db.patch(existing._id, lobbyPatch);
    } else {
      // A new video room consumes a seat of the monthly `rooms` quota.
      await assertQuota(ctx, 'videoConferences', 'rooms', 1, currentPeriodKey());
      await ctx.db.insert('meetings', {
        eventId: args.eventId,
        organizationId: args.organizationId,
        roomName: args.roomName,
        hostUserId: caller._id,
        mode: args.mode,
        status: 'scheduled',
        waitingRoomEnabled: args.waitingRoomEnabled,
        registrationEnabled: args.registrationEnabled,
        registrationFields: lobbyPatch.registrationFields as
          | Array<{ name: 'fullName' | 'email' | 'phone'; required: boolean }>
          | undefined,
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
    if (!existing && caller.organizationId) {
      await incrementUsage(
        ctx,
        caller.organizationId,
        'videoConferences',
        'rooms',
        1,
        currentPeriodKey(),
      );
    }
    return { success: true };
  },
});

/**
 * Flips the meeting between scheduled → live → ended. Host-only: the status is
 * what the calendar and the meeting list render, so a participant must not be
 * able to end (or re-open) somebody else's meeting.
 */
export const setStatus = mutation({
  args: {
    roomName: v.string(),
    status: v.union(v.literal('scheduled'), v.literal('live'), v.literal('ended')),
  },
  handler: async (ctx, { roomName, status }) => {
    await assertModuleAccess(ctx, 'videoConferences');
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
    // The client already calls this only on the host path (`MeetingRoomClient.tsx`
    // guards its `onConnected`/`onDisconnected` handlers with `isHostFromRoom()`),
    // but that is a UI convention — this is the server-side enforcement, so any
    // org member calling the mutation directly cannot flip the status.
    if (!isSuperadmin(caller) && meeting.hostUserId !== caller._id && caller.role !== 'admin') {
      throw new Error('Only the host or an admin can change the meeting status');
    }
    await ctx.db.patch(meeting._id, { status, updatedAt: Date.now() });
    return { success: true };
  },
});

/**
 * Host authority for one room, resolved from the room name.
 *
 * Same formula as `getJoinToken` and `setStatus`: the meeting's own host, an org
 * admin, or a superadmin. Recording is a host action, and it must stay one
 * whichever entry point calls it.
 */
async function requireHostForRoom(ctx: MutationCtx, roomName: string) {
  await assertModuleAccess(ctx, 'videoConferences');
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
  if (!isSuperadmin(caller) && meeting.hostUserId !== caller._id && caller.role !== 'admin') {
    throw new Error('Only the host or an admin can control the recording');
  }
  return { caller, meeting };
}

/**
 * Records that a cloud recording is running. Called by `startRecording` right
 * after LiveKit accepted the Egress request, so every client watching
 * `getByRoomName` sees the live state (and who started it) immediately.
 */
export const markRecordingStarted = mutation({
  args: {
    roomName: v.string(),
    egressId: v.string(),
    filepath: v.string(),
  },
  handler: async (ctx, { roomName, egressId, filepath }) => {
    const { caller, meeting } = await requireHostForRoom(ctx, roomName);
    const now = Date.now();
    await ctx.db.patch(meeting._id, {
      egressId,
      recordingFilepath: filepath,
      recordingStartedAt: now,
      recordingStartedBy: caller._id,
      updatedAt: now,
    });
    return { success: true };
  },
});

/**
 * Clears the running-recording state. `recordingFilepath` is deliberately kept:
 * it is the only pointer to the object that Egress uploaded.
 */
export const markRecordingStopped = mutation({
  args: {
    roomName: v.string(),
    recordingUrl: v.optional(v.string()),
  },
  handler: async (ctx, { roomName, recordingUrl }) => {
    const { meeting } = await requireHostForRoom(ctx, roomName);
    const now = Date.now();
    await ctx.db.patch(meeting._id, {
      egressId: undefined,
      recordingStartedAt: undefined,
      recordingStartedBy: undefined,
      updatedAt: now,
    });
    if (recordingUrl && meeting.eventId) {
      await ctx.db.patch(meeting.eventId, {
        videoRecordingUrl: recordingUrl,
        updatedAt: now,
      });
    }
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
    await assertModuleAccess(ctx, 'videoConferences');
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
    await assertModuleAccess(ctx, 'videoConferences');
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

/**
 * Replaces the co-host list of a meeting. Only called by `assignCohost` /
 * `reclaimHost` actions in `meetingsActions.ts` — both already enforce that
 * the caller is the host, so the mutation trusts the caller once the same
 * org check passes.
 */
export const setCohostIds = mutation({
  args: {
    roomName: v.string(),
    cohostIds: v.array(v.id('users')),
  },
  handler: async (ctx, { roomName, cohostIds }) => {
    await assertModuleAccess(ctx, 'videoConferences');
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
    if (!isSuperadmin(caller) && meeting.hostUserId !== caller._id && caller.role !== 'admin') {
      throw new Error('Only the host or an admin can change co-hosts');
    }
    await ctx.db.patch(meeting._id, {
      cohostIds: cohostIds.length > 0 ? cohostIds : undefined,
      updatedAt: Date.now(),
    });
    return { success: true, cohostIds };
  },
});

// ── Lobby / registration ────────────────────────────────────────────────────
// External visitors can only reach the room via the link; if the host turned
// the waiting room on, they must first submit a registration form. Internal
// org members skip this step entirely.

/** Public — accepts a registration from an external visitor. Idempotent on
 * `visitorId` so a page refresh does not produce duplicate rows. */
export const submitRegistration = mutation({
  args: {
    roomName: v.string(),
    fullName: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    visitorId: v.optional(v.string()),
  },
  handler: async (ctx, { roomName, fullName, email, phone, visitorId }) => {
    const meeting = await ctx.db
      .query('meetings')
      .withIndex('by_room_name', (q) => q.eq('roomName', roomName))
      .unique();
    if (!meeting) throw new Error('Meeting not found');
    if (!(meeting.registrationEnabled ?? false)) {
      throw new Error('This meeting does not require registration');
    }
    // Trim and validate against the host's configured fields.
    const fields = meeting.registrationFields ?? [];
    const data: Record<string, string> = {
      fullName: fullName.trim(),
      email: (email ?? '').trim(),
      phone: (phone ?? '').trim(),
    };
    if (!data.fullName) throw new Error('Full name is required');
    for (const f of fields) {
      if (f.required && !data[f.name]) {
        throw new Error(`${f.name} is required`);
      }
    }

    if (visitorId) {
      const existing = await ctx.db
        .query('meetingRegistrations')
        .withIndex('by_room', (q) => q.eq('roomName', roomName))
        .collect();
      const dup = existing.find((r) => r.visitorId === visitorId);
      if (dup) return { registrationId: dup._id, deduped: true as const };
    }

    const registrationId = await ctx.db.insert('meetingRegistrations', {
      roomName,
      organizationId: meeting.organizationId,
      fullName: data.fullName,
      email: data.email || undefined,
      phone: data.phone || undefined,
      visitorId,
      createdAt: Date.now(),
    });
    return { registrationId, deduped: false as const };
  },
});

/** Host-only — list everyone currently waiting in the lobby. */
export const listPending = query({
  args: { roomName: v.string() },
  handler: async (ctx, { roomName }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];
    const meeting = await ctx.db
      .query('meetings')
      .withIndex('by_room_name', (q) => q.eq('roomName', roomName))
      .unique();
    if (!meeting) return [];
    if (!isSuperadmin(caller) && caller.organizationId !== meeting.organizationId) return [];
    if (!isSuperadmin(caller) && meeting.hostUserId !== caller._id && caller.role !== 'admin') {
      return [];
    }
    return await ctx.db
      .query('meetingRegistrations')
      .withIndex('by_room', (q) => q.eq('roomName', roomName))
      .collect();
  },
});

/**
 * Host-only — every registration the meeting ever received, regardless of
 * admit state. Used for the post-meeting attendee report so the host can
 * see who turned up (or who only registered and never came).
 */
export const listRegistrations = query({
  args: { roomName: v.string() },
  handler: async (ctx, { roomName }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];
    const meeting = await ctx.db
      .query('meetings')
      .withIndex('by_room_name', (q) => q.eq('roomName', roomName))
      .unique();
    if (!meeting) return [];
    if (!isSuperadmin(caller) && caller.organizationId !== meeting.organizationId) return [];
    if (!isSuperadmin(caller) && meeting.hostUserId !== caller._id && caller.role !== 'admin') {
      return [];
    }
    return await ctx.db
      .query('meetingRegistrations')
      .withIndex('by_room', (q) => q.eq('roomName', roomName))
      .collect();
  },
});

/** Host-only — remove a pending registration (deny or admit + clean-up). */
export const removeRegistration = mutation({
  args: { registrationId: v.id('meetingRegistrations') },
  handler: async (ctx, { registrationId }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const reg = await ctx.db.get(registrationId);
    if (!reg) return { success: true };
    const meeting = await ctx.db
      .query('meetings')
      .withIndex('by_room_name', (q) => q.eq('roomName', reg.roomName))
      .unique();
    if (!meeting) {
      await ctx.db.delete(registrationId);
      return { success: true };
    }
    if (!isSuperadmin(caller) && caller.organizationId !== meeting.organizationId) {
      throw new Error('Access denied: different organization');
    }
    if (!isSuperadmin(caller) && meeting.hostUserId !== caller._id && caller.role !== 'admin') {
      throw new Error('Only the host or an admin can manage the lobby');
    }
    await ctx.db.delete(registrationId);
    return { success: true };
  },
});

/** Public — used by the guest invite flow to resolve a registration row. */
export const getRegistrationById = query({
  args: { registrationId: v.id('meetingRegistrations') },
  handler: async (ctx, { registrationId }) => {
    const reg = await ctx.db.get(registrationId);
    if (!reg) return null;
    return { roomName: reg.roomName, fullName: reg.fullName };
  },
});

/** Host-only — admit a pending visitor. Moved to `meetingsActions.ts`
 * because signing the invite token needs `node:crypto`, which is only
 * available in the Node runtime. */

/** Host-only — toggle the waiting room and/or registration form, and edit
 * which form fields guests see. The two toggles are independent: a meeting
 * can require a registration without gating entry, or use the waiting room
 * without collecting any form data. */
export const updateLobbyAndRegistration = mutation({
  args: {
    roomName: v.string(),
    waitingRoomEnabled: v.optional(v.boolean()),
    registrationEnabled: v.optional(v.boolean()),
    registrationFields: v.optional(
      v.array(
        v.object({
          name: v.union(v.literal('fullName'), v.literal('email'), v.literal('phone')),
          required: v.boolean(),
        }),
      ),
    ),
  },
  handler: async (
    ctx,
    { roomName, waitingRoomEnabled, registrationEnabled, registrationFields },
  ) => {
    await assertModuleAccess(ctx, 'videoConferences');
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const meeting = await ctx.db
      .query('meetings')
      .withIndex('by_room_name', (q) => q.eq('roomName', roomName))
      .unique();
    if (!meeting) throw new Error('Meeting not found');
    if (!isSuperadmin(caller) && meeting.hostUserId !== caller._id && caller.role !== 'admin') {
      throw new Error('Only the host or an admin can change meeting settings');
    }
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (waitingRoomEnabled !== undefined) patch.waitingRoomEnabled = waitingRoomEnabled;
    if (registrationEnabled !== undefined) patch.registrationEnabled = registrationEnabled;
    if (registrationFields !== undefined) {
      // `fullName` is always required — registration without a name is useless.
      const hasFullName = registrationFields.some((f) => f.name === 'fullName');
      const fields = hasFullName
        ? registrationFields
        : [...registrationFields, { name: 'fullName' as const, required: true }];
      patch.registrationFields = fields;
    }
    await ctx.db.patch(meeting._id, patch);
    return { success: true };
  },
});

/**
 * Creates a meeting row from the "Room booking" (Переговорные) flow — i.e. a
 * video room attached to a meeting room booking rather than a calendar event.
 * Returns the room name so the caller can navigate to `/meetings/{roomName}`
 * and reuse the same flow the calendar uses.
 */
export const createForRoomBooking = mutation({
  args: {
    organizationId: v.id('organizations'),
    waitingRoomEnabled: v.optional(v.boolean()),
    registrationEnabled: v.optional(v.boolean()),
    registrationFields: v.optional(
      v.array(
        v.object({
          name: v.union(v.literal('fullName'), v.literal('email'), v.literal('phone')),
          required: v.boolean(),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'videoConferences');
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    if (!isSuperadmin(caller) && caller.organizationId !== args.organizationId) {
      throw new Error('Access denied: different organization');
    }
    const now = Date.now();
    // Each room-booking video gets a fresh, unique room name. The booking id
    // is part of the name so two simultaneous bookings never collide, and the
    // `room_` prefix distinguishes it from `evt_` (calendar) at a glance.
    const roomName = `room_${caller._id}_${now.toString(36)}`;
    await assertQuota(ctx, 'videoConferences', 'rooms', 1, currentPeriodKey());
    const hasFullName = (args.registrationFields ?? []).some((f) => f.name === 'fullName');
    const fields = hasFullName
      ? args.registrationFields
      : [...(args.registrationFields ?? []), { name: 'fullName' as const, required: true }];
    await ctx.db.insert('meetings', {
      organizationId: args.organizationId,
      roomName,
      hostUserId: caller._id,
      mode: 'meeting',
      status: 'live',
      waitingRoomEnabled: args.waitingRoomEnabled,
      registrationEnabled: args.registrationEnabled,
      registrationFields: fields,
      createdAt: now,
      updatedAt: now,
    });
    if (caller.organizationId) {
      await incrementUsage(
        ctx,
        caller.organizationId,
        'videoConferences',
        'rooms',
        1,
        currentPeriodKey(),
      );
    }
    return { roomName, videoUrl: videoUrlForRoom(roomName) };
  },
});
