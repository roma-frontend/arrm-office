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
    /**
     * Users the current host promoted to co-host before leaving the room.
     * Only the original `hostUserId` can reclaim host rights; co-hosts are
     * demoted back to `participant` on claim. Empty/absent on most meetings.
     */
    cohostIds: v.optional(v.array(v.id('users'))),
    /** `meeting` = everyone talks; `webinar` = only presenters talk. */
    mode: v.union(v.literal('meeting'), v.literal('webinar')),
    status: v.union(v.literal('scheduled'), v.literal('live'), v.literal('ended')),
    /** Optional door code a participant must type before joining. */
    pinCode: v.optional(v.string()),
    /**
     * Waiting room — when `true`, external visitors are held in a lobby until
     * the host explicitly admits them. Internal org members skip the lobby.
     * Independent of the registration form below: a host can require a
     * registration without gating entry, or use the lobby without collecting
     * any form data.
     */
    waitingRoomEnabled: v.optional(v.boolean()),
    /**
     * Registration form — when `true`, external visitors must fill out a form
     * (name/email/phone per the host's configuration) before they can enter
     * the meeting. The data is saved on the `meetingRegistrations` table so
     * the host can see who attended after the fact.
     */
    registrationEnabled: v.optional(v.boolean()),
    /**
     * Per-field configuration of the registration form shown in the lobby. Each
     * entry is the field name plus a `required` flag — the UI maps these to
     * inputs and validates before submitting. Stored on the row so the host
     * edits it once per meeting instead of hardcoding per-environment.
     */
    registrationFields: v.optional(
      v.array(
        v.object({
          name: v.union(v.literal('fullName'), v.literal('email'), v.literal('phone')),
          required: v.boolean(),
        }),
      ),
    ),
    /** Live LiveKit Egress id while a cloud recording runs — absent = not recording. */
    egressId: v.optional(v.string()),
    /** When the running recording was started, so the UI can show an elapsed timer. */
    recordingStartedAt: v.optional(v.number()),
    /** Who started it — recording is a host action and stays attributable. */
    recordingStartedBy: v.optional(v.id('users')),
    /** Object path the Egress writes to; the finished file URL is built from it. */
    recordingFilepath: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index('by_org', ['organizationId'])
    .index('by_event', ['eventId'])
    .index('by_room_name', ['roomName']),

  /**
   * One row per guest waiting in the lobby. Created when an external visitor
   * submits the registration form; deleted once the host admits or denies.
   * Internal org members never end up here — they join the room directly.
   * The host's roster UI queries this table to render the admit/deny list.
   */
  meetingRegistrations: defineTable({
    roomName: v.string(),
    organizationId: v.id('organizations'),
    /** The registration form payload, normalized to strings. */
    fullName: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    /** Optional fingerprint so a refresh of the lobby page still maps to the
     * same row instead of producing duplicates. */
    visitorId: v.optional(v.string()),
    createdAt: v.number(),
    /** Set by `meetingsActions.admitRegistration` when the host admits
     * the visitor. The lobby UI subscribes to this row so it can detect
     * the admit in real time and copy the invite URL into a "You're in"
     * banner that the visitor can open with one click. */
    admittedAt: v.optional(v.number()),
    /** Optional HMAC-signed admit token written by the host so the
     * visitor's lobby page can promote them straight into the meeting
     * without requiring the host to forward the URL by hand. */
    admitToken: v.optional(v.string()),
  })
    .index('by_room', ['roomName'])
    .index('by_org', ['organizationId'])
    .index('by_visitor', ['visitorId']),
};
