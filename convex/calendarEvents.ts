/**
 * Calendar events — the free-form entries people create from the calendar
 * wizard, optionally holding a meeting room.
 *
 * Room handling is the interesting part. An event that reserves a room does so
 * inside the same Convex mutation as the event insert, so the two can never
 * drift apart: either the room was free and both rows exist, or the reservation
 * was refused and no event is created. Re-scheduling moves the reservation and
 * deleting the event releases it.
 */

import { v } from 'convex/values';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { getAuthCaller } from './lib/getAuthCaller';
import { isSuperadmin } from './lib/auth';
import { assertModuleAccess } from './lib/entitlements';
import { notify } from './lib/notify';
import { cancelRoomBooking, reserveRoom } from './meetingRooms';

/**
 * Events store wall-clock strings ("2026-08-04" + "10:00") while rooms work in
 * epoch milliseconds. The client sends the resolved instants alongside them
 * instead of the server re-deriving them from a timezone offset: the browser
 * already knows the organizer's zone (including DST for that specific date), and
 * sharing one number means the availability preview in the wizard and the
 * conflict check on the server compare exactly the same values.
 */
const roomArgs = {
  /** Room to reserve for this event; omit to keep the event room-less. */
  roomId: v.optional(v.id('meetingRooms')),
  /** Reservation window in epoch ms — required whenever `roomId` is set. */
  roomStartTime: v.optional(v.number()),
  roomEndTime: v.optional(v.number()),
};

/**
 * The guest list. Ids are the record; names are stored alongside only so the
 * calendar can render a roster without resolving every user.
 */
const attendeeArgs = {
  attendeeIds: v.optional(v.array(v.id('users'))),
};

function roomWindow(args: { roomStartTime?: number; roomEndTime?: number }): {
  start: number;
  end: number;
} {
  if (args.roomStartTime === undefined || args.roomEndTime === undefined) {
    throw new Error('Room reservation window is missing');
  }
  return { start: args.roomStartTime, end: args.roomEndTime };
}

/**
 * Resolves the guest list to the ids that may actually be invited, plus their
 * current display names.
 *
 * Names are derived here rather than taken from the client: the two fields are
 * written together, so a roster can never disagree with itself, and a client
 * cannot record somebody under a name that is not theirs. Ids outside the
 * organization are dropped — the same rule `filterOrgMembers` applies to
 * company events.
 */
async function resolveAttendees(
  ctx: QueryCtx,
  organizationId: Id<'organizations'>,
  attendeeIds: Id<'users'>[] | undefined,
): Promise<{ ids: Id<'users'>[] | undefined; names: string[] | undefined }> {
  const unique = [...new Set(attendeeIds ?? [])];
  if (unique.length === 0) return { ids: undefined, names: undefined };

  const users = await Promise.all(unique.map((id) => ctx.db.get(id)));
  const members = users.filter(
    (user): user is Doc<'users'> => !!user && user.organizationId === organizationId,
  );
  if (members.length === 0) return { ids: undefined, names: undefined };

  return { ids: members.map((user) => user._id), names: members.map((user) => user.name) };
}

/**
 * Pings every guest whose name lands on the event (or leaves it), skipping the
 * actor. The rows route to `/calendar` so the sidebar calendar badge blinks the
 * same way the tasks badge does for `/tasks` rows.
 */
async function notifyAttendees(
  ctx: MutationCtx,
  organizationId: Id<'organizations'>,
  attendeeIds: Id<'users'>[],
  actorId: Id<'users'>,
  actorName: string,
  event: { id: Id<'calendarEvents'>; title: string; date: string; startTime: string },
  kind: 'invited' | 'updated' | 'cancelled' | 'uninvited',
  now: number,
): Promise<void> {
  const keys = {
    invited: ['notifications.titles.meetingInvited', 'notifications.messages.meetingInvited'],
    updated: ['notifications.titles.meetingUpdated', 'notifications.messages.meetingUpdated'],
    cancelled: ['notifications.titles.meetingCancelled', 'notifications.messages.meetingCancelled'],
    uninvited: ['notifications.titles.meetingUninvited', 'notifications.messages.meetingUninvited'],
  }[kind];
  const fallbacks = {
    invited: [
      `📅 You're invited: ${event.title}`,
      `${actorName} invited you to "${event.title}" (${event.date} ${event.startTime})`,
    ],
    updated: [
      `📅 Meeting updated: ${event.title}`,
      `${actorName} updated "${event.title}" (${event.date} ${event.startTime})`,
    ],
    cancelled: [`📅 Meeting cancelled: ${event.title}`, `${actorName} cancelled "${event.title}"`],
    uninvited: [
      `📅 Invitation withdrawn: ${event.title}`,
      `${actorName} removed you from "${event.title}"`,
    ],
  }[kind]!;
  for (const attendeeId of attendeeIds) {
    if (attendeeId === actorId) continue;
    await notify(ctx, {
      organizationId,
      userId: attendeeId,
      type: 'system',
      titleKey: keys[0]!,
      messageKey: keys[1]!,
      params: {
        eventTitle: event.title,
        organizerName: actorName,
        date: event.date,
        time: event.startTime,
      },
      fallbackTitle: fallbacks[0]!,
      fallbackMessage: fallbacks[1]!,
      relatedId: event.id,
      route: '/calendar',
      createdAt: now,
    });
  }
}

export const create = mutation({
  args: {
    organizationId: v.id('organizations'),
    title: v.string(),
    date: v.string(),
    startTime: v.string(),
    endTime: v.string(),
    allDay: v.boolean(),
    location: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.string(),
    reminder: v.string(),
    attachmentUrl: v.optional(v.string()),
    /** Video toggle intent — the actual LiveKit room/link is created by the
     * `meetings.ensureRoom` action after this mutation succeeds. */
    videoEnabled: v.optional(v.boolean()),
    videoMode: v.optional(v.union(v.literal('meeting'), v.literal('webinar'))),
    ...attendeeArgs,
    ...roomArgs,
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'calendar');
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    if (!isSuperadmin(caller) && caller.organizationId !== args.organizationId) {
      throw new Error('Access denied: different organization');
    }
    const title = args.title.trim();
    if (!title) throw new Error('Title is required');

    const attendees = await resolveAttendees(ctx, args.organizationId, args.attendeeIds);

    // Reserve first: if the room is taken the whole mutation aborts and no
    // orphan event is left behind claiming a room it never had.
    let roomBookingId: Id<'roomBookings'> | undefined;
    if (args.roomId) {
      const { start, end } = roomWindow(args);
      roomBookingId = await reserveRoom(ctx, caller, {
        roomId: args.roomId,
        title,
        description: args.description,
        startTime: start,
        endTime: end,
        attendeeIds: attendees.ids,
      });
    }

    const now = Date.now();
    const eventId = await ctx.db.insert('calendarEvents', {
      organizationId: args.organizationId,
      createdBy: caller._id,
      title,
      date: args.date,
      startTime: args.startTime,
      endTime: args.endTime,
      allDay: args.allDay,
      location: args.location,
      description: args.description,
      category: args.category,
      reminder: args.reminder,
      attendees: attendees.names,
      attendeeIds: attendees.ids,
      attachmentUrl: args.attachmentUrl,
      roomId: args.roomId,
      roomBookingId,
      createdAt: now,
      updatedAt: now,
    });

    // Everyone on the guest list is "mentioned" by the invite — they get the
    // sound + bell + calendar badge like any other notification.
    await notifyAttendees(
      ctx,
      args.organizationId,
      attendees.ids ?? [],
      caller._id,
      caller.name ?? 'Someone',
      { id: eventId, title, date: args.date, startTime: args.startTime },
      'invited',
      now,
    );

    return eventId;
  },
});

/**
 * Edits an event, moving or releasing its room reservation to match.
 *
 * The old reservation is cancelled only after the new one succeeds — otherwise a
 * failed re-booking would leave the event without the room it still shows.
 */
export const update = mutation({
  args: {
    id: v.id('calendarEvents'),
    title: v.string(),
    date: v.string(),
    startTime: v.string(),
    endTime: v.string(),
    allDay: v.boolean(),
    location: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.string(),
    reminder: v.string(),
    attachmentUrl: v.optional(v.string()),
    /** Video toggle intent: `false` removes the video link; `true` keeps it
     * (the `meetings.ensureRoom` action refreshes/creates the room after). */
    videoEnabled: v.optional(v.boolean()),
    videoMode: v.optional(v.union(v.literal('meeting'), v.literal('webinar'))),
    ...attendeeArgs,
    ...roomArgs,
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'calendar');
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const event = await ctx.db.get(args.id);
    if (!event) throw new Error('Event not found');
    if (!isSuperadmin(caller) && caller.organizationId !== event.organizationId) {
      throw new Error('Access denied: different organization');
    }
    if (event.createdBy !== caller._id && !isSuperadmin(caller) && caller.role !== 'admin') {
      throw new Error('Only the organizer or an admin can change this event');
    }
    const title = args.title.trim();
    if (!title) throw new Error('Title is required');

    const attendees = await resolveAttendees(ctx, event.organizationId, args.attendeeIds);

    const keepsSameRoom = args.roomId && args.roomId === event.roomId;
    let roomBookingId = keepsSameRoom ? event.roomBookingId : undefined;

    if (args.roomId) {
      const { start, end } = roomWindow(args);
      // Re-book rather than patch: `reserveRoom` owns every rule, and passing
      // the current reservation as an exception keeps a pure rename from
      // clashing with itself.
      roomBookingId = await reserveRoom(ctx, caller, {
        roomId: args.roomId,
        title,
        description: args.description,
        startTime: start,
        endTime: end,
        attendeeIds: attendees.ids,
        excludeBookingId: keepsSameRoom ? event.roomBookingId : undefined,
      });
    }

    // Release the previous reservation once its replacement is secured.
    if (event.roomBookingId && event.roomBookingId !== roomBookingId) {
      await cancelRoomBooking(ctx, caller, event.roomBookingId, 'Event updated');
    }

    await ctx.db.patch(args.id, {
      title,
      date: args.date,
      startTime: args.startTime,
      endTime: args.endTime,
      allDay: args.allDay,
      location: args.location,
      description: args.description,
      category: args.category,
      reminder: args.reminder,
      attendees: attendees.names,
      attendeeIds: attendees.ids,
      attachmentUrl: args.attachmentUrl ?? event.attachmentUrl,
      roomId: args.roomId,
      roomBookingId,
      // Turning the video toggle off removes the join link; leaving it on (or
      // untouched) keeps whatever room was already attached.
      videoUrl: args.videoEnabled === false ? undefined : event.videoUrl,
      videoProvider: args.videoEnabled === false ? undefined : event.videoProvider,
      updatedAt: Date.now(),
    });

    // Guests keep their sense of the meeting from the notification: remaining
    // and newly added attendees hear about the change, dropped ones about the
    // withdrawn invitation.
    const now = Date.now();
    const newIds = attendees.ids ?? [];
    const removedIds = (event.attendeeIds ?? []).filter((id) => !newIds.includes(id));
    await notifyAttendees(
      ctx,
      event.organizationId,
      newIds,
      caller._id,
      caller.name ?? 'Someone',
      { id: args.id, title, date: args.date, startTime: args.startTime },
      'updated',
      now,
    );
    await notifyAttendees(
      ctx,
      event.organizationId,
      removedIds,
      caller._id,
      caller.name ?? 'Someone',
      { id: args.id, title, date: args.date, startTime: args.startTime },
      'uninvited',
      now,
    );

    return { success: true };
  },
});

/** Adds the room name/colour so the calendar can label events without extra queries. */
async function withRoom(ctx: QueryCtx, event: Doc<'calendarEvents'>) {
  if (!event.roomId) return { ...event, roomName: undefined, roomColor: undefined };
  const room = await ctx.db.get(event.roomId);
  return { ...event, roomName: room?.name, roomColor: room?.color };
}

export const getByOrganization = query({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];
    if (!isSuperadmin(caller) && caller.organizationId !== args.organizationId) return [];

    const events = await ctx.db
      .query('calendarEvents')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .order('desc')
      .take(200);

    return await Promise.all(events.map((event) => withRoom(ctx, event)));
  },
});

export const remove = mutation({
  args: { id: v.id('calendarEvents') },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'calendar');
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const event = await ctx.db.get(args.id);
    if (!event) return { success: true, releasedRoom: false };
    if (!isSuperadmin(caller) && caller.organizationId !== event.organizationId) {
      throw new Error('Access denied: different organization');
    }
    if (event.createdBy !== caller._id && !isSuperadmin(caller) && caller.role !== 'admin') {
      throw new Error('Only the organizer or an admin can delete this event');
    }

    // Deleting the event must free the room, otherwise the board would show a
    // reservation nobody can explain.
    let releasedRoom = false;
    if (event.roomBookingId) {
      releasedRoom = await cancelRoomBooking(ctx, caller, event.roomBookingId, 'Event deleted');
    }

    // The guests' notification is the only trace they get of a cancelled
    // meeting — send it before the row disappears.
    await notifyAttendees(
      ctx,
      event.organizationId,
      event.attendeeIds ?? [],
      caller._id,
      caller.name ?? 'Someone',
      { id: event._id, title: event.title, date: event.date, startTime: event.startTime },
      'cancelled',
      Date.now(),
    );

    await ctx.db.delete(args.id);
    return { success: true, releasedRoom };
  },
});
