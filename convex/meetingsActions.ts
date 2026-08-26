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
  cohostIds?: Id<'users'>[];
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
    { eventId, organizationId, mode, waitingRoomEnabled, registrationEnabled, registrationFields },
  ) => {
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
      waitingRoomEnabled,
      registrationEnabled,
      registrationFields,
    });

    return { configured: true as const, roomName, videoUrl: videoUrlForRoom(roomName) };
  },
});

/**
 * Mints a short-lived LiveKit join token. Two entry points:
 *
 * 1. **Authenticated member** of the meeting's organization — gets the usual
 *    `host` / `cohost` / `participant` role.
 * 2. **External guest with an invite** (single token produced by
 *    `admitRegistration`, format `id:exp:sig`) — gets a one-shot `guest`
 *    identity whose display name comes from the registration row, with
 *    publish rights and a TTL tied to the invite's expiry.
 */
export const getJoinToken = action({
  args: {
    roomName: v.string(),
    /**
     * Combined invite token: `${registrationId}:${exp}:${hmacSig}`. The HMAC
     * is checked against the same LiveKit secret the host signed it with, so
     * a forged URL gets rejected before the LiveKit token is minted.
     */
    invite: v.optional(v.string()),
  },
  handler: async (ctx, { roomName, invite }) => {
    if (!livekitConfigured()) {
      throw new Error('Video calls are not configured yet');
    }

    // ── Guest path ─────────────────────────────────────────────────────────
    if (invite) {
      const parts = invite.split(':');
      if (parts.length !== 3) throw new Error('Invalid invite token');
      const [registrationId, expStr, providedSig] = parts;
      const exp = Number(expStr);
      if (!Number.isFinite(exp)) throw new Error('Invalid invite expiry');
      if (Date.now() > exp) throw new Error('Invite has expired — ask the host for a new one');
      const { createHmac } = await import('node:crypto');
      const secret = process.env.LIVEKIT_API_SECRET ?? process.env.CLERK_JWT_KEY ?? 'unknown';
      const expectedSig = createHmac('sha256', secret)
        .update(`${registrationId}:${exp}`)
        .digest('hex')
        .slice(0, 40);
      if (expectedSig !== providedSig) throw new Error('Invite signature mismatch');

      const reg = (await ctx.runQuery(api.meetings.getRegistrationById, {
        registrationId: registrationId as Id<'meetingRegistrations'>,
      })) as { roomName: string; fullName: string } | null;
      if (!reg) throw new Error('Invite revoked');
      if (reg.roomName !== roomName) throw new Error('Invite is for a different meeting');

      const guestIdentity = `guest_${registrationId}`;
      const { AccessToken } = await import('livekit-server-sdk');
      const token = new AccessToken(LIVEKIT_API_KEY!, LIVEKIT_API_SECRET!, {
        identity: guestIdentity,
        name: reg.fullName,
        ttl: Math.max(60, Math.floor((exp - Date.now()) / 1000)),
        metadata: JSON.stringify({
          organizationId: undefined,
          roomName,
          role: 'guest',
        }),
      });
      token.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      });
      return {
        token: await token.toJwt(),
        url: LIVEKIT_URL!,
        identity: guestIdentity,
        name: reg.fullName,
        isHost: false,
        isCohost: false,
        isOriginalHost: false,
        cohostIds: [] as string[],
        mode: 'meeting' as const,
        isGuest: true,
      };
    }

    const caller = await getActionCaller(ctx);
    if (!caller) throw new Error('Not authenticated');

    // `getByRoomName` is the security boundary: it returns null unless the
    // caller belongs to the meeting's organization. The action re-uses it, so
    // there is exactly one place where access is decided.
    const meeting = (await ctx.runQuery(api.meetings.getByRoomName, {
      roomName,
    })) as ActionMeeting | null;
    if (!meeting) throw new Error('Meeting not found');

    const isHost =
      meeting.hostUserId === caller._id || caller.role === 'admin' || isSuperadmin(caller);
    const isCohost = (meeting.cohostIds ?? []).includes(caller._id) && !isHost;
    const isWebinarViewer = meeting.mode === 'webinar' && !isHost && !isCohost;

    const { AccessToken } = await import('livekit-server-sdk');
    const token = new AccessToken(LIVEKIT_API_KEY!, LIVEKIT_API_SECRET!, {
      identity: caller._id,
      name: caller.name,
      ttl: 6 * 60 * 60, // 6 hours — enough to span any meeting length
      metadata: JSON.stringify({
        organizationId: meeting.organizationId,
        roomName,
        role: isHost ? 'host' : isCohost ? 'cohost' : isWebinarViewer ? 'viewer' : 'participant',
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
      isCohost,
      isOriginalHost: meeting.hostUserId === caller._id,
      cohostIds: meeting.cohostIds ?? [],
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
    const isCohost = (meeting.cohostIds ?? []).includes(caller._id) && !isHost;
    if (!isHost && !isCohost) throw new Error('Only the host or a co-host can remove participants');

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
    const isCohost = (meeting.cohostIds ?? []).includes(caller._id) && !isHost;
    if (!isHost && !isCohost) throw new Error('Only the host or a co-host can mute participants');

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
    const isCohost = (meeting.cohostIds ?? []).includes(caller._id) && !isHost;
    if (!isHost && !isCohost) throw new Error('Only the host or a co-host can mute participants');

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

// ── Host rotation (Zoom-style) ─────────────────────────────────────────────
// When the host leaves, they can either end the meeting for everyone, or hand
// the room to a single participant who becomes a co-host. The original host
// can reclaim their seat on a later join and the co-host is automatically
// demoted back to `participant`.

/** Pushes fresh metadata to a live LiveKit participant so the client re-renders
 * its `isHost` / `isCohost` derivations immediately. */
async function pushMetadata(
  roomName: string,
  identity: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const { RoomServiceClient } = await import('livekit-server-sdk');
  const roomService = new RoomServiceClient(LIVEKIT_URL!, LIVEKIT_API_KEY!, LIVEKIT_API_SECRET!);
  await roomService.updateParticipant(roomName, identity, {
    metadata: JSON.stringify(metadata),
  });
}

/**
 * Host-only. Records a co-host assignment, then returns. The caller is
 * expected to disconnect the room right after — the live metadata push lets
 * the chosen participant's UI flip to co-host without a reconnect.
 */
export const assignCohost = action({
  args: {
    roomName: v.string(),
    newCohostIdentity: v.string(),
  },
  handler: async (ctx, { roomName, newCohostIdentity }) => {
    const caller = await getActionCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    if (!livekitConfigured()) throw new Error('Video calls are not configured yet');

    const meeting = (await ctx.runQuery(api.meetings.getByRoomName, {
      roomName,
    })) as (ActionMeeting & { cohostIds?: Id<'users'>[] }) | null;
    if (!meeting) throw new Error('Meeting not found');

    const isHost =
      meeting.hostUserId === caller._id || caller.role === 'admin' || isSuperadmin(caller);
    if (!isHost) throw new Error('Only the host can assign a co-host');

    if (newCohostIdentity === caller._id) {
      throw new Error('You are already the host');
    }

    const list = (meeting.cohostIds ?? []).filter((id) => id !== newCohostIdentity);
    list.push(newCohostIdentity as Id<'users'>);
    await ctx.runMutation(api.meetings.setCohostIds, {
      roomName,
      cohostIds: list,
    });

    // Push the new role into LiveKit so the participant's UI updates live.
    await pushMetadata(roomName, newCohostIdentity, {
      organizationId: meeting.organizationId,
      roomName,
      role: 'cohost',
    });

    return { ok: true as const, cohostIds: list };
  },
});

/**
 * Host-only. The original host is rejoining a meeting they previously handed
 * off: we wipe the co-host list, push the host role back to themselves, and
 * demote every current co-host back to `participant` in one go.
 */
export const reclaimHost = action({
  args: {
    roomName: v.string(),
  },
  handler: async (ctx, { roomName }) => {
    const caller = await getActionCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    if (!livekitConfigured()) throw new Error('Video calls are not configured yet');

    const meeting = (await ctx.runQuery(api.meetings.getByRoomName, {
      roomName,
    })) as (ActionMeeting & { cohostIds?: Id<'users'>[] }) | null;
    if (!meeting) throw new Error('Meeting not found');

    // Only the original host can reclaim — admins/superadmins are kept out so
    // the rotation stays between the people who actually own the meeting.
    if (meeting.hostUserId !== caller._id) {
      throw new Error('Only the original host can reclaim the host role');
    }

    const previousCohosts = meeting.cohostIds ?? [];
    await ctx.runMutation(api.meetings.setCohostIds, { roomName, cohostIds: [] });

    const { RoomServiceClient } = await import('livekit-server-sdk');
    const roomService = new RoomServiceClient(LIVEKIT_URL!, LIVEKIT_API_KEY!, LIVEKIT_API_SECRET!);

    // The host takes back the role.
    await pushMetadata(roomName, caller._id, {
      organizationId: meeting.organizationId,
      roomName,
      role: 'host',
    });

    // Anyone who was a co-host is now a regular participant again.
    await Promise.allSettled(
      previousCohosts.map((identity) =>
        pushMetadata(roomName, identity, {
          organizationId: meeting.organizationId,
          roomName,
          role: 'participant',
        }),
      ),
    );

    // List is informational — `updateParticipant` does not need a fresh fetch.
    void roomService;

    return { ok: true as const, demoted: previousCohosts.length };
  },
});

/**
 * Host-only — admit a pending visitor by minting a one-time invite URL.
 * Runs as an action because signing the token needs `node:crypto` (Node
 * runtime only). The URL embeds the registration id + an HMAC token valid
 * for 30 minutes, so the host can pass it to the guest via any side
 * channel and a forged URL can never reach the LiveKit join path.
 */
export const admitRegistration = action({
  args: { registrationId: v.id('meetingRegistrations') },
  handler: async (ctx, { registrationId }) => {
    const caller = await getActionCaller(ctx);
    if (!caller) throw new Error('Not authenticated');

    const reg = (await ctx.runQuery(api.meetings.getRegistrationById, {
      registrationId,
    })) as { roomName: string; fullName: string } | null;
    if (!reg) throw new Error('Registration not found');

    const meeting = (await ctx.runQuery(api.meetings.getByRoomName, {
      roomName: reg.roomName,
    })) as ActionMeeting | null;
    if (!meeting) throw new Error('Meeting not found');

    if (!isSuperadmin(caller) && caller.organizationId !== meeting.organizationId) {
      throw new Error('Access denied: different organization');
    }
    if (!isSuperadmin(caller) && meeting.hostUserId !== caller._id && caller.role !== 'admin') {
      throw new Error('Only the host or an admin can admit visitors');
    }

    const { createHmac } = await import('node:crypto');
    const secret = process.env.LIVEKIT_API_SECRET ?? process.env.CLERK_JWT_KEY ?? 'unknown';
    const expiresAt = Date.now() + 30 * 60 * 1000;
    const signature = createHmac('sha256', secret)
      .update(`${registrationId}:${expiresAt}`)
      .digest('hex')
      .slice(0, 40);
    const combinedToken = `${registrationId}:${expiresAt}:${signature}`;

    return {
      success: true as const,
      inviteToken: combinedToken,
      inviteUrl: `/meetings/${reg.roomName}?invite=${encodeURIComponent(combinedToken)}`,
      expiresAt,
      guestName: reg.fullName,
    };
  },
});
