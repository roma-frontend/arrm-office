/** Shared shapes for the meeting-room UI (mirrors the Convex documents). */
import type { RoomBookingLite } from '@/lib/meetingRooms';

export interface RoomDoc {
  _id: string;
  organizationId: string;
  name: string;
  description?: string;
  building?: string;
  floor?: string;
  roomNumber?: string;
  capacity: number;
  amenities: string[];
  color?: string;
  photoUrl?: string;
  isActive: boolean;
  openFrom?: string;
  openTo?: string;
  createdAt: number;
  updatedAt: number;
}

export interface RoomWithBookings extends RoomDoc {
  bookings: RoomBookingLite[];
}

/** RSVP roll-up returned alongside every booking. */
export interface BookingResponseCounts {
  total: number;
  accepted: number;
  tentative: number;
  declined: number;
  needsAction: number;
  checkedIn: number;
}

/** A full booking document as returned by `listBookings` / `getRoomBookings`. */
export interface RoomBookingDoc {
  _id: string;
  organizationId: string;
  roomId: string;
  title: string;
  description?: string;
  startTime: number;
  endTime: number;
  organizerId: string;
  organizerName?: string;
  attendeeIds?: string[];
  attendeeNames: string[];
  externalAttendees?: string[];
  status: 'confirmed' | 'cancelled';
  checkedInAt?: number;
  cancelledAt?: number;
  cancelReason?: string;
  roomName: string;
  roomColor?: string;
  roomBuilding?: string;
  roomFloor?: string;
  roomNumber?: string;
  createdAt: number;
  updatedAt: number;
  tracking?: BookingResponseCounts;
  videoUrl?: string;
  meetingStatus?: 'scheduled' | 'live' | 'ended';
}

/** RSVP state of one invited person, as shown in the tracking panel. */
export type AttendeeResponse = 'needs_action' | 'accepted' | 'tentative' | 'declined';

export interface TrackedAttendee {
  userId: string;
  name: string;
  email?: string;
  avatarUrl?: string;
  department?: string;
  position?: string;
  response: AttendeeResponse;
  respondedAt?: number;
  comment?: string;
  isOptional: boolean;
  invitedAt: number;
  checkedInAt?: number;
}

export type BookingEventType =
  | 'created'
  | 'updated'
  | 'rescheduled'
  | 'cancelled'
  | 'attendee_added'
  | 'attendee_removed'
  | 'responded'
  | 'responses_reset'
  | 'checked_in';

export interface BookingActivityEvent {
  _id: string;
  type: BookingEventType;
  actorId?: string;
  actorName: string;
  actorRole?: string;
  targetName?: string;
  response?: AttendeeResponse;
  previousStartTime?: number;
  previousEndTime?: number;
  newStartTime?: number;
  newEndTime?: number;
  note?: string;
  createdAt: number;
}

/** Shape of `api.meetingRooms.getBookingTracking`. */
export interface BookingTracking {
  booking: {
    _id: string;
    title: string;
    description?: string;
    startTime: number;
    endTime: number;
    status: 'confirmed' | 'cancelled';
    createdAt: number;
    updatedAt: number;
    checkedInAt?: number;
    cancelledAt?: number;
    cancelReason?: string;
    externalAttendees: string[];
  };
  room: { _id: string; name: string; color?: string; capacity: number } | null;
  organizer: {
    userId: string;
    name: string;
    email?: string;
    avatarUrl?: string;
    checkedInAt?: number;
  };
  attendees: TrackedAttendee[];
  counts: BookingResponseCounts;
  timeline: BookingActivityEvent[];
  timelineVisible: boolean;
  viewer: {
    userId: string;
    isOrganizer: boolean;
    isAttendee: boolean;
    canManage: boolean;
    isStaff: boolean;
    myResponse: AttendeeResponse | null;
    myRespondedAt?: number;
    canRespond: boolean;
    canCheckIn: boolean;
  };
}

/** Bookings arrive in several shapes; the timeline only needs these fields. */
export type TimelineBooking = RoomBookingLite;
