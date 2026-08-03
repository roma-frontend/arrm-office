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
}

/** Bookings arrive in several shapes; the timeline only needs these fields. */
export type TimelineBooking = RoomBookingLite;
