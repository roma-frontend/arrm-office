import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const userProfiles = {
  userProfiles: defineTable({
    userId: v.id('users'),
    // Employment
    employeeType: v.optional(v.union(v.literal('staff'), v.literal('contractor'))),
    department: v.optional(v.string()),
    departmentId: v.optional(v.id('departments')),
    position: v.optional(v.string()),
    positionId: v.optional(v.id('positions')),
    supervisorId: v.optional(v.id('users')),
    // Personal
    phone: v.optional(v.string()),
    location: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()),
    /** Birth year — used to decide Armenia funded-pension exemption (born before 1974). */
    birthYear: v.optional(v.number()),
    /** Manual override of the pension exemption derived from birthYear/dateOfBirth. */
    pensionExempt: v.optional(v.boolean()),
    /**
     * Whether the employee participates in Armenia's mandatory health insurance system.
     * When true, health insurance contributions are deducted per the tiered schedule.
     */
    healthInsured: v.optional(v.boolean()),
    // Status
    presenceStatus: v.optional(
      v.union(
        v.literal('available'),
        v.literal('in_meeting'),
        v.literal('in_call'),
        v.literal('out_of_office'),
        v.literal('busy'),
      ),
    ),
    // Balances
    travelAllowance: v.optional(v.number()),
    paidLeaveBalance: v.optional(v.number()),
    sickLeaveBalance: v.optional(v.number()),
    familyLeaveBalance: v.optional(v.number()),
    dayOffBalance: v.optional(v.number()),
    maternityLeaveBalance: v.optional(v.number()),
    studyLeaveBalance: v.optional(v.number()),
    // GDPR marker set by the superadmin toolkit when PII is scrubbed.
    dataAnonymizedAt: v.optional(v.number()),
  })
    .index('by_user', ['userId'])
    .index('by_department', ['departmentId'])
    .index('by_supervisor', ['supervisorId'])
    .index('by_position', ['positionId']),
};
