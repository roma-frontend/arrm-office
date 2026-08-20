'use node';

/**
 * LiveKit actions — the only place the app talks to the LiveKit server.
 *
 * Runs in the Node runtime (that is what the "use node" directive is for):
 * `livekit-server-sdk` needs Node crypto, and the LIVEKIT_* secrets live in the
 * deployment env, never on the client.
 *
 * Both actions are thin: they authenticate the caller, do the LiveKit HTTP
 * call, and delegate every database write to the mutations in `meetings.ts`.
 */

import { action, type ActionCtx } from './_generated/server';
import { api } from './_generated/api';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { isSuperadmin } from './lib/auth';
import { roomNameForEvent, videoUrlForRoom } from './meetings';

const LIVEKIT_URL = process.env.LIVEKIT_URL ?? process.env.NEXT_PUBLIC_LIVEKIT_URL;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

function livekitConfigured(): boolean {
  return Boolean(LIVEKIT_URL && LIVEKIT_API_KEY && LIVEKIT_API_SECRET);
}

/** Minimal shape of the redacted user doc `getUserByEmail` returns. */
interface ActionUser {
  _id: string;
  name: string;
  role?: string;
  email?: string;
  organizationId?: string;
  isActive?: boolean;
}

interface ActionCaller {
  _id: Id<'users'>;
  role: 'superadmin' | 'admin' | 'supervisor' | 'employee' | 'driver';
  email: string;
  organizationId?: Id<'organizations'>;
  name: string;
}

/** Minimal shape of the meeting row + its event, as returned by `getByRoomName`. */
interface ActionMeeting {
  roomName: string;
  organizationId: Id<'organizations'>;
  hostUserId: Id<'users'>;
  mode: 'meeting' | 'webinar';
}

/**
 * Action-friendly auth: `getAuthCaller` needs `ctx.db`, which actions do not
 * have. The identity's email is authoritative — `getUserByEmail` re-checks the
 * caller's own org and returns the redacted user doc.
 */
async function getActionCaller(ctx: ActionCtx): Promise<ActionCaller | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity?.email) return null;
  const user = (await ctx.runQuery(api.users.queries.getUserByEmail, {
    email: identity.email.toLowerCase(),
  })) as ActionUser | null;
  if (!user || user.isActive === false) return null;
  return {
    _id: user._id as Id<'users'>,
    role: user.role as ActionCaller['role'],
    email: user.email ?? '',
    organizationId: user.organizationId as Id<'organizations'> | undefined,
    name: user.name,
  };
}

/**
 * Creates the LiveKit room (idempotent) and registers it against the event.
 * Returns `{ configured: false }` when LIVEKIT_* env vars are missing so the
 * calendar can still save the event — video just stays off.
 */
export const ensureRoom = action({
  args: {
    eventId: v.id('calendarEvents'),
    organizationId: v.id('organizations'),
    mode: v.optional(v.union(v.literal('meeting'), v.literal('webinar'))),
  },
  handler: async (ctx, { eventId, organizationId, mode }) => {
    const caller = await getActionCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    if (!isSuperadmin(caller) && caller.organizationId !== organizationId) {
      throw new Error('Access denied: different organization');
    }

    if (!livekitConfigured()) {
      return { configured: false as const, roomName: null, videoUrl: null };
    }

    const roomName = roomNameForEvent(eventId);

    // Ensure the LiveKit room exists — creating an existing room throws, so
    // treat that as "already there" (the idempotent path).
    const { RoomServiceClient } = await import('livekit-server-sdk');
    const roomService = new RoomServiceClient(LIVEKIT_URL!, LIVEKIT_API_KEY!, LIVEKIT_API_SECRET!);
    try {
      await roomService.createRoom({ name: roomName });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/already exists/i.test(msg) && !/Room .* already/i.test(msg)) {
        throw new Error(`LiveKit: could not create room — ${msg}`);
      }
    }

    await ctx.runMutation(api.meetings.register, {
      eventId,
      organizationId,
      roomName,
      mode: mode ?? 'meeting',
    });

    return { configured: true as const, roomName, videoUrl: videoUrlForRoom(roomName) };
  },
});

/**
 * Mints a short-lived LiveKit join token for an authenticated user.
 *
 * Phase 1 rules: any member of the room's organization may join. Webinar mode
 * downgrades non-hosts to viewers (no publish) — the host panel comes in Phase
 * 2. Guests without an account are Phase 2 too (lobby + PIN).
 */
export const getJoinToken = action({
  args: {
    roomName: v.string(),
  },
  handler: async (ctx, { roomName }) => {
    const caller = await getActionCaller(ctx);
    if (!caller) throw new Error('Not authenticated');

    if (!livekitConfigured()) {
      throw new Error('Video calls are not configured yet');
    }

    // `getByRoomName` is the security boundary: it returns null unless the
    // caller belongs to the meeting's organization. The action re-uses it, so
    // there is exactly one place where access is decided.
    const meeting = (await ctx.runQuery(api.meetings.getByRoomName, {
      roomName,
    })) as ActionMeeting | null;
    if (!meeting) throw new Error('Meeting not found');

    const isHost =
      meeting.hostUserId === caller._id || caller.role === 'admin' || isSuperadmin(caller);
    const isWebinarViewer = meeting.mode === 'webinar' && !isHost;

    const { AccessToken } = await import('livekit-server-sdk');
    const token = new AccessToken(LIVEKIT_API_KEY!, LIVEKIT_API_SECRET!, {
      identity: caller._id,
      name: caller.name,
      ttl: 6 * 60 * 60, // 6 hours — enough to span any meeting length
      metadata: JSON.stringify({
        organizationId: meeting.organizationId,
        roomName,
        role: isHost ? 'host' : isWebinarViewer ? 'viewer' : 'participant',
      }),
    });
    token.addGrant({
      roomJoin: true,
      room: meeting.roomName,
      canPublish: !isWebinarViewer,
      canSubscribe: true,
      canPublishData: true,
    });

    return {
      token: await token.toJwt(),
      url: LIVEKIT_URL!,
      identity: caller._id,
      name: caller.name,
      isHost,
      mode: meeting.mode,
    };
  },
});

/**
 * Host-only removal of a participant from a live LiveKit room.
 *
 * Uses the server SDK (authoritative — the ejected client is disconnected by
 * the LiveKit server, it cannot opt out). The host check mirrors
 * `getJoinToken`: the room's `hostUserId`, or an admin/superadmin.
 */
export const removeParticipant = action({
  args: {
    roomName: v.string(),
    identity: v.string(),
  },
  handler: async (ctx, { roomName, identity }) => {
    const caller = await getActionCaller(ctx);
    if (!caller) throw new Error('Not authenticated');

    if (!livekitConfigured()) {
      throw new Error('Video calls are not configured yet');
    }

    const meeting = (await ctx.runQuery(api.meetings.getByRoomName, {
      roomName,
    })) as ActionMeeting | null;
    if (!meeting) throw new Error('Meeting not found');

    const isHost =
      meeting.hostUserId === caller._id || caller.role === 'admin' || isSuperadmin(caller);
    if (!isHost) throw new Error('Only the host can remove participants');

    const { RoomServiceClient } = await import('livekit-server-sdk');
    const roomService = new RoomServiceClient(LIVEKIT_URL!, LIVEKIT_API_KEY!, LIVEKIT_API_SECRET!);
    await roomService.removeParticipant(roomName, identity);

    return { removed: true as const };
  },
});
