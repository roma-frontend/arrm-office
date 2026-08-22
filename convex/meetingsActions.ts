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
 *
 * Recording (`startRecording` / `stopRecording`) follows the same shape: LiveKit
 * Egress does the work server-side and uploads to our bucket, and the meeting row
 * only tracks *that* it runs, since when, and by whom.
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

/**
 * Object storage for cloud recordings. LiveKit Egress uploads the finished file
 * itself, so the credentials belong to the deployment env and never to a client.
 * Any S3-compatible target works (AWS, Cloudflare R2, MinIO) — R2 and MinIO need
 * `ENDPOINT`, and MinIO usually needs `FORCE_PATH_STYLE=true`.
 */
const EGRESS_S3 = {
  bucket: process.env.LIVEKIT_EGRESS_S3_BUCKET,
  region: process.env.LIVEKIT_EGRESS_S3_REGION,
  accessKey: process.env.LIVEKIT_EGRESS_S3_ACCESS_KEY,
  secret: process.env.LIVEKIT_EGRESS_S3_SECRET,
  endpoint: process.env.LIVEKIT_EGRESS_S3_ENDPOINT,
  forcePathStyle: process.env.LIVEKIT_EGRESS_S3_FORCE_PATH_STYLE === 'true',
  /** Public base for the finished file, e.g. a CDN in front of the bucket. */
  publicUrl: process.env.LIVEKIT_EGRESS_S3_PUBLIC_URL,
};

function livekitConfigured(): boolean {
  return Boolean(LIVEKIT_URL && LIVEKIT_API_KEY && LIVEKIT_API_SECRET);
}

function egressStorageConfigured(): boolean {
  return Boolean(EGRESS_S3.bucket && EGRESS_S3.accessKey && EGRESS_S3.secret);
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
  /** Present only while a cloud recording is running. */
  egressId?: string;
  recordingFilepath?: string;
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

/**
 * Host-only mute of a single participant's microphone or camera.
 *
 * Server-side on purpose: asking a client to mute itself over a data channel is
 * cooperative — a modified client can ignore the message and keep publishing.
 * `mutePublishedTrack` stops the track at the LiveKit server, so the mute holds
 * whatever the participant's client does. Pass `muted: false` to unmute.
 */
export const muteParticipantTrack = action({
  args: {
    roomName: v.string(),
    identity: v.string(),
    source: v.union(v.literal('microphone'), v.literal('camera')),
    muted: v.optional(v.boolean()),
  },
  handler: async (ctx, { roomName, identity, source, muted }) => {
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
    if (!isHost) throw new Error('Only the host can mute participants');

    const { RoomServiceClient, TrackSource } = await import('livekit-server-sdk');
    const roomService = new RoomServiceClient(LIVEKIT_URL!, LIVEKIT_API_KEY!, LIVEKIT_API_SECRET!);

    const wantedSource = source === 'microphone' ? TrackSource.MICROPHONE : TrackSource.CAMERA;

    // `getParticipant` throws once the participant has left the room — turn that
    // into a message the host panel can show as-is.
    const participant = await roomService.getParticipant(roomName, identity).catch(() => {
      throw new Error('Participant is no longer in the room');
    });

    const tracks = participant.tracks.filter((track) => track.source === wantedSource);
    for (const track of tracks) {
      await roomService.mutePublishedTrack(roomName, identity, track.sid, muted ?? true);
    }

    return { muted: tracks.length };
  },
});

/**
 * Host-only "mute all" — silences every other participant's microphone.
 *
 * Same reasoning as `muteParticipantTrack`: a broadcast "please mute" over the
 * data channel is advisory, this is not. The host's own tracks are skipped
 * (participant identities are the Convex user id), already-muted tracks are left
 * alone, and the mutes run through `Promise.allSettled` so one participant
 * dropping out mid-call does not abort the rest.
 */
export const muteEveryone = action({
  args: {
    roomName: v.string(),
  },
  handler: async (ctx, { roomName }) => {
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
    if (!isHost) throw new Error('Only the host can mute participants');

    const { RoomServiceClient, TrackSource } = await import('livekit-server-sdk');
    const roomService = new RoomServiceClient(LIVEKIT_URL!, LIVEKIT_API_KEY!, LIVEKIT_API_SECRET!);

    const participants = await roomService.listParticipants(roomName);
    const results = await Promise.allSettled(
      participants
        .filter((participant) => participant.identity !== caller._id)
        .flatMap((participant) =>
          participant.tracks
            .filter((track) => track.source === TrackSource.MICROPHONE && !track.muted)
            .map((track) =>
              roomService.mutePublishedTrack(roomName, participant.identity, track.sid, true),
            ),
        ),
    );

    return { muted: results.filter((result) => result.status === 'fulfilled').length };
  },
});

// ── Cloud recording (LiveKit Egress) ────────────────────────────────────────
// Room-composite egress: LiveKit runs a headless browser against its own
// template, encodes the mixed room, and uploads one MP4 to our bucket. Nothing
// is recorded in the participant's browser, so a recording survives the host
// closing their laptop — and the only way to start it is this host-only action.

/** Deterministic object key, so the row can point at the file before it exists. */
function recordingFilepath(roomName: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `recordings/${roomName}/${stamp}.mp4`;
}

/** Public URL of a finished recording — only when a public base is configured. */
function recordingPublicUrl(filepath: string): string | null {
  const base = EGRESS_S3.publicUrl?.replace(/\/+$/, '');
  return base ? `${base}/${filepath}` : null;
}

/**
 * Host-only start of a cloud recording.
 *
 * Returns `{ configured: false }` instead of throwing when the storage env is
 * missing, so the dock can render a disabled button with a reason rather than a
 * failing click. Re-entrancy is handled by asking LiveKit for the room's active
 * egresses first: two hosts hitting the button must not produce two files.
 */
export const startRecording = action({
  args: {
    roomName: v.string(),
  },
  handler: async (ctx, { roomName }) => {
    const caller = await getActionCaller(ctx);
    if (!caller) throw new Error('Not authenticated');

    if (!livekitConfigured()) throw new Error('Video calls are not configured yet');
    if (!egressStorageConfigured()) {
      return { configured: false as const, egressId: null, alreadyRunning: false };
    }

    const meeting = (await ctx.runQuery(api.meetings.getByRoomName, {
      roomName,
    })) as ActionMeeting | null;
    if (!meeting) throw new Error('Meeting not found');

    const isHost =
      meeting.hostUserId === caller._id || caller.role === 'admin' || isSuperadmin(caller);
    if (!isHost) throw new Error('Only the host can record the meeting');

    const { EgressClient, EncodedFileOutput, EncodedFileType, S3Upload } =
      await import('livekit-server-sdk');
    const egressClient = new EgressClient(LIVEKIT_URL!, LIVEKIT_API_KEY!, LIVEKIT_API_SECRET!);

    // LiveKit is the source of truth for "is it running": our row can lag behind
    // an egress that ended on its own (storage rejected the upload, room closed).
    const active = await egressClient.listEgress({ roomName, active: true }).catch(() => []);
    const running = active[0];
    if (running) {
      await ctx.runMutation(api.meetings.markRecordingStarted, {
        roomName,
        egressId: running.egressId,
        filepath: meeting.recordingFilepath ?? '',
      });
      return { configured: true as const, egressId: running.egressId, alreadyRunning: true };
    }

    const filepath = recordingFilepath(roomName);
    const output = new EncodedFileOutput({
      fileType: EncodedFileType.MP4,
      filepath,
      output: {
        case: 's3',
        value: new S3Upload({
          accessKey: EGRESS_S3.accessKey!,
          secret: EGRESS_S3.secret!,
          bucket: EGRESS_S3.bucket!,
          region: EGRESS_S3.region ?? '',
          endpoint: EGRESS_S3.endpoint ?? '',
          forcePathStyle: EGRESS_S3.forcePathStyle,
        }),
      },
    });

    const info = await egressClient
      .startRoomCompositeEgress(roomName, output, { layout: 'grid' })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`LiveKit: could not start the recording — ${msg}`);
      });

    await ctx.runMutation(api.meetings.markRecordingStarted, {
      roomName,
      egressId: info.egressId,
      filepath,
    });

    return { configured: true as const, egressId: info.egressId, alreadyRunning: false };
  },
});

/**
 * Host-only stop. The file is still uploading when `stopEgress` returns (Egress
 * goes ACTIVE → ENDING → COMPLETE), so the URL we attach to the event may 404
 * for a few seconds; a LiveKit `egress_ended` webhook is the robust place to
 * confirm it, and `recordingFilepath` on the row is what such a handler needs.
 */
export const stopRecording = action({
  args: {
    roomName: v.string(),
  },
  handler: async (ctx, { roomName }) => {
    const caller = await getActionCaller(ctx);
    if (!caller) throw new Error('Not authenticated');

    if (!livekitConfigured()) throw new Error('Video calls are not configured yet');

    const meeting = (await ctx.runQuery(api.meetings.getByRoomName, {
      roomName,
    })) as ActionMeeting | null;
    if (!meeting) throw new Error('Meeting not found');

    const isHost =
      meeting.hostUserId === caller._id || caller.role === 'admin' || isSuperadmin(caller);
    if (!isHost) throw new Error('Only the host can stop the recording');

    const { EgressClient } = await import('livekit-server-sdk');
    const egressClient = new EgressClient(LIVEKIT_URL!, LIVEKIT_API_KEY!, LIVEKIT_API_SECRET!);

    // Prefer the id we stored; fall back to whatever LiveKit says is running, so
    // a lost/stale row can still be cleaned up from the UI.
    let egressId = meeting.egressId;
    if (!egressId) {
      const active = await egressClient.listEgress({ roomName, active: true }).catch(() => []);
      egressId = active[0]?.egressId;
    }

    if (egressId) {
      await egressClient.stopEgress(egressId).catch((err: unknown) => {
        // An egress that already ended is not an error worth blocking the UI on —
        // the state still has to be cleared below.
        const msg = err instanceof Error ? err.message : String(err);
        if (!/not found|already ended|EGRESS_COMPLETE/i.test(msg)) {
          throw new Error(`LiveKit: could not stop the recording — ${msg}`);
        }
      });
    }

    const url = meeting.recordingFilepath ? recordingPublicUrl(meeting.recordingFilepath) : null;
    await ctx.runMutation(api.meetings.markRecordingStopped, {
      roomName,
      ...(url ? { recordingUrl: url } : {}),
    });

    return { stopped: Boolean(egressId), url };
  },
});
