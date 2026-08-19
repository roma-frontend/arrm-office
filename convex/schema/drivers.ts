import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const drivers = {
  drivers: defineTable({
    organizationId: v.id('organizations'),
    userId: v.id('users'),
    vehicleInfo: v.object({
      model: v.string(),
      plateNumber: v.string(),
      capacity: v.number(),
      color: v.optional(v.string()),
      year: v.optional(v.number()),
    }),
    isAvailable: v.boolean(),
    isOnShift: v.optional(v.boolean()),
    lastStatusUpdateAt: v.optional(v.number()),
    workingHours: v.object({
      startTime: v.string(),
      endTime: v.string(),
      workingDays: v.array(v.number()),
    }),
    maxTripsPerDay: v.number(),
    currentTripsToday: v.number(),
    rating: v.number(),
    totalTrips: v.number(),
    kpiMetrics: v.optional(
      v.object({
        onTimeRate: v.number(),
        customerSatisfaction: v.number(),
        tripsPerShift: v.number(),
        completionRate: v.number(),
      }),
    ),
    currentShiftStart: v.optional(v.number()),
    currentShiftEnd: v.optional(v.number()),
    overtimeHours: v.optional(v.number()),
    lastMaintenanceDate: v.optional(v.number()),
    nextMaintenanceDue: v.optional(v.number()),
    vehicleMileage: v.optional(v.number()),
    inspectionStatus: v.optional(
      v.union(v.literal('passed'), v.literal('failed'), v.literal('overdue')),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_user', ['userId'])
    .index('by_org_available', ['organizationId', 'isAvailable'])
    .index('by_on_shift', ['isOnShift']),

  driverShifts: defineTable({
    organizationId: v.id('organizations'),
    driverId: v.id('drivers'),
    userId: v.id('users'),
    startTime: v.number(),
    endTime: v.optional(v.number()),
    scheduledStartTime: v.optional(v.number()),
    scheduledEndTime: v.optional(v.number()),
    status: v.union(
      v.literal('active'),
      v.literal('completed'),
      v.literal('paused'),
      v.literal('overtime'),
    ),
    totalHours: v.optional(v.number()),
    breakTime: v.optional(v.number()),
    overtimeHours: v.optional(v.number()),
    tripsCompleted: v.number(),
    totalDistance: v.optional(v.number()),
    totalDuration: v.optional(v.number()),
    onTimePerformance: v.optional(v.number()),
    averageRating: v.optional(v.number()),
    driverNotes: v.optional(v.string()),
    supervisorNotes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_driver', ['driverId'])
    .index('by_org', ['organizationId'])
    .index('by_driver_status', ['driverId', 'status'])
    .index('by_org_status', ['organizationId', 'status'])
    .index('by_start_time', ['startTime']),

  driverSchedules: defineTable({
    organizationId: v.id('organizations'),
    driverId: v.id('drivers'),
    userId: v.id('users'),
    startTime: v.number(),
    endTime: v.number(),
    type: v.union(
      v.literal('trip'),
      v.literal('blocked'),
      v.literal('maintenance'),
      v.literal('time_off'),
    ),
    status: v.union(
      v.literal('scheduled'),
      v.literal('in_progress'),
      v.literal('completed'),
      v.literal('cancelled'),
    ),
    tripInfo: v.optional(
      v.object({
        from: v.string(),
        to: v.string(),
        purpose: v.string(),
        passengerCount: v.number(),
        notes: v.optional(v.string()),
        distanceKm: v.optional(v.number()),
        durationMinutes: v.optional(v.number()),
        passengerPhone: v.optional(v.string()),
        pickupCoords: v.optional(
          v.object({
            lat: v.number(),
            lng: v.number(),
          }),
        ),
        dropoffCoords: v.optional(
          v.object({
            lat: v.number(),
            lng: v.number(),
          }),
        ),
      }),
    ),
    reason: v.optional(v.string()),
    driverFeedback: v.optional(
      v.object({
        rating: v.number(),
        comment: v.optional(v.string()),
        completedAt: v.number(),
      }),
    ),
    mapData: v.optional(
      v.object({
        distanceMeters: v.number(),
        durationSeconds: v.number(),
        polyline: v.optional(v.string()),
      }),
    ),
    driverNotes: v.optional(v.string()),
    arrivedAt: v.optional(v.number()),
    passengerPickedUpAt: v.optional(v.number()),
    waitTimeMinutes: v.optional(v.number()),
    etaMinutes: v.optional(v.number()),
    etaUpdatedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_driver', ['driverId'])
    .index('by_driver_time', ['driverId', 'startTime'])
    .index('by_user', ['userId'])
    .index('by_status', ['status']),

  driverRequests: defineTable({
    organizationId: v.id('organizations'),
    requesterId: v.id('users'),
    driverId: v.id('drivers'),
    startTime: v.number(),
    endTime: v.number(),
    tripInfo: v.object({
      from: v.string(),
      to: v.string(),
      purpose: v.string(),
      passengerCount: v.number(),
      notes: v.optional(v.string()),
      pickupCoords: v.optional(
        v.object({
          lat: v.number(),
          lng: v.number(),
        }),
      ),
      dropoffCoords: v.optional(
        v.object({
          lat: v.number(),
          lng: v.number(),
        }),
      ),
    }),
    priority: v.optional(
      v.union(v.literal('P0'), v.literal('P1'), v.literal('P2'), v.literal('P3')),
    ),
    businessJustification: v.optional(v.string()),
    tripCategory: v.optional(
      v.union(
        v.literal('client_meeting'),
        v.literal('airport'),
        v.literal('office_transfer'),
        v.literal('emergency'),
        v.literal('team_event'),
        v.literal('personal'),
      ),
    ),
    costCenter: v.optional(v.string()),
    requiresApproval: v.optional(v.boolean()),
    approvedBy: v.optional(v.id('users')),
    approvedAt: v.optional(v.number()),
    status: v.union(
      v.literal('pending'),
      v.literal('approved'),
      v.literal('declined'),
      v.literal('cancelled'),
      v.literal('completed'),
    ),
    declineReason: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
    passengerRated: v.optional(v.boolean()),
    cancelledAt: v.optional(v.number()),
    cancelledBy: v.optional(v.id('users')),
    cancellationReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_requester', ['requesterId'])
    .index('by_driver', ['driverId'])
    .index('by_status', ['status'])
    .index('by_org_status', ['organizationId', 'status'])
    .index('by_priority', ['priority'])
    .index('by_requires_approval', ['requiresApproval']),

  calendarAccess: defineTable({
    organizationId: v.id('organizations'),
    ownerId: v.id('users'),
    viewerId: v.id('users'),
    accessLevel: v.union(v.literal('full'), v.literal('busy_only'), v.literal('none')),
    scope: v.optional(v.union(v.literal('person'), v.literal('organization'))),
    status: v.optional(
      v.union(v.literal('pending'), v.literal('approved'), v.literal('rejected')),
    ),
    requestedAt: v.optional(v.number()),
    respondedAt: v.optional(v.number()),
    grantedAt: v.number(),
    expiresAt: v.optional(v.number()),
    isActive: v.boolean(),
  })
    .index('by_org', ['organizationId'])
    .index('by_owner', ['ownerId'])
    .index('by_viewer', ['viewerId'])
    .index('by_viewer_org', ['viewerId', 'organizationId'])
    .index('by_owner_status', ['ownerId', 'status'])
    .index('by_owner_viewer', ['ownerId', 'viewerId']),

  recurringTrips: defineTable({
    organizationId: v.id('organizations'),
    userId: v.id('users'),
    driverId: v.id('drivers'),
    tripInfo: v.object({
      from: v.string(),
      to: v.string(),
      purpose: v.string(),
      passengerCount: v.number(),
      notes: v.optional(v.string()),
      pickupCoords: v.optional(v.object({ lat: v.number(), lng: v.number() })),
      dropoffCoords: v.optional(v.object({ lat: v.number(), lng: v.number() })),
    }),
    schedule: v.object({
      daysOfWeek: v.array(v.number()),
      startTime: v.string(),
      endTime: v.string(),
    }),
    isActive: v.boolean(),
    lastGeneratedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_org_active', ['organizationId', 'isActive']),

  favoriteDrivers: defineTable({
    organizationId: v.id('organizations'),
    userId: v.id('users'),
    driverId: v.id('drivers'),
    createdAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_user_org', ['userId', 'organizationId'])
    .index('by_user_driver', ['userId', 'driverId']),

  passengerRatings: defineTable({
    organizationId: v.id('organizations'),
    scheduleId: v.id('driverSchedules'),
    requestId: v.optional(v.id('driverRequests')),
    passengerId: v.id('users'),
    driverId: v.id('drivers'),
    rating: v.number(),
    comment: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_schedule', ['scheduleId'])
    .index('by_passenger', ['passengerId'])
    .index('by_driver', ['driverId']),
};
