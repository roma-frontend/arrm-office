import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const users = {
  users: defineTable({
    organizationId: v.optional(v.id('organizations')),
    name: v.string(),
    email: v.string(),
    passwordHash: v.string(),
    googleId: v.optional(v.string()),
    clerkId: v.optional(v.string()),
    imidSub: v.optional(v.string()),
    /**
     * Stable identifier this user carries in the HR system they were imported
     * from (ՀԾ Armsoft, Lucky Carrot). Lets a sync recognise someone whose
     * email changed at the provider instead of creating a duplicate account.
     */
    externalId: v.optional(v.string()),
    /** Which provider `externalId` belongs to — ids are only unique per source. */
    externalSource: v.optional(v.string()),
    role: v.union(
      v.literal('superadmin'),
      v.literal('admin'),
      v.literal('supervisor'),
      v.literal('employee'),
      v.literal('driver'),
    ),
    employeeType: v.union(v.literal('staff'), v.literal('contractor')),
    department: v.optional(v.string()),
    departmentId: v.optional(v.id('departments')),
    position: v.optional(v.string()),
    positionId: v.optional(v.id('positions')),
    phone: v.optional(v.string()),
    location: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    presenceStatus: v.optional(
      v.union(
        v.literal('available'),
        v.literal('in_meeting'),
        v.literal('in_call'),
        v.literal('out_of_office'),
        v.literal('busy'),
      ),
    ),
    supervisorId: v.optional(v.id('users')),
    isActive: v.boolean(),
    isApproved: v.boolean(),
    approvedBy: v.optional(v.id('users')),
    approvedAt: v.optional(v.number()),
    // Effective monthly travel allowance for this employee. Denormalized:
    // `travelAllowanceOverride` when HR set one, otherwise the org policy
    // amount. Optional: organizations without a policy leave it unset. Never
    // write a literal here — resolve it via convex/lib/travelAllowance.ts.
    travelAllowance: v.optional(v.number()),
    // Per-employee deviation from the organization's policy, set by HR in the
    // edit-employee dialog. Present ⇒ it wins over the policy amount (even when
    // the policy is disabled) and survives every later edit of the employee.
    // Absent ⇒ this employee follows the organization policy.
    travelAllowanceOverride: v.optional(v.number()),
    paidLeaveBalance: v.number(),
    sickLeaveBalance: v.number(),
    familyLeaveBalance: v.number(),
    dayOffBalance: v.optional(v.number()),
    maternityLeaveBalance: v.optional(v.number()),
    studyLeaveBalance: v.optional(v.number()),
    webauthnChallenge: v.optional(v.string()),
    faceDescriptor: v.optional(v.array(v.number())),
    faceImageUrl: v.optional(v.string()),
    faceRegisteredAt: v.optional(v.number()),
    faceIdBlocked: v.optional(v.boolean()),
    faceIdBlockedAt: v.optional(v.number()),
    faceIdFailedAttempts: v.optional(v.number()),
    faceIdLastAttempt: v.optional(v.number()),
    loginFailedAttempts: v.optional(v.number()),
    loginLockedUntil: v.optional(v.number()),
    dateOfBirth: v.optional(v.string()),
    /** Birth year — used to decide Armenia funded-pension exemption (born before 1974). */
    birthYear: v.optional(v.number()),
    /** Manual override of the pension exemption derived from birthYear/dateOfBirth. */
    pensionExempt: v.optional(v.boolean()),
    /**
     * Whether the employee participates in Armenia's mandatory health insurance system.
     */
    healthInsured: v.optional(v.boolean()),
    language: v.optional(v.string()),
    timezone: v.optional(v.string()),
    dateFormat: v.optional(v.string()),
    timeFormat: v.optional(v.string()),
    firstDayOfWeek: v.optional(v.string()),
    theme: v.optional(v.string()),
    notificationsEnabled: v.optional(v.boolean()),
    emailNotifications: v.optional(v.boolean()),
    pushNotifications: v.optional(v.boolean()),
    isSuspended: v.optional(v.boolean()),
    suspendedUntil: v.optional(v.number()),
    suspendedReason: v.optional(v.string()),
    suspendedBy: v.optional(v.id('users')),
    suspendedAt: v.optional(v.number()),
    totpSecret: v.optional(v.string()),
    totpEnabled: v.optional(v.boolean()),
    backupCodes: v.optional(v.array(v.string())),
    resetPasswordToken: v.optional(v.string()),
    resetPasswordExpiry: v.optional(v.number()),
    sessionToken: v.optional(v.string()),
    sessionExpiry: v.optional(v.number()),
    focusModeEnabled: v.optional(v.boolean()),
    workHoursStart: v.optional(v.string()),
    workHoursEnd: v.optional(v.string()),
    breakRemindersEnabled: v.optional(v.boolean()),
    breakInterval: v.optional(v.number()),
    dailyTaskGoal: v.optional(v.number()),
    defaultView: v.optional(v.string()),
    dataRefreshRate: v.optional(v.string()),
    compactMode: v.optional(v.boolean()),
    chatBackground: v.optional(v.string()),
    dashboardWidgets: v.optional(
      v.object({
        quickStats: v.boolean(),
        leaveCalendar: v.boolean(),
        upcomingTasks: v.boolean(),
        teamActivity: v.boolean(),
        recentLeaves: v.boolean(),
        analytics: v.boolean(),
      }),
    ),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    lastLoginAt: v.optional(v.number()),
    // Soft delete: set by the superadmin trash instead of removing the row,
    // so the account (and its data) can be restored.
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id('users')),
    // GDPR markers set by the superadmin toolkit — anonymize leaves a shell
    // account, erase also sweeps owned records first.
    dataAnonymizedAt: v.optional(v.number()),
    dataErasedAt: v.optional(v.number()),
  })
    .index('by_email', ['email'])
    .index('by_deleted', ['deletedAt'])
    .index('by_org', ['organizationId'])
    .index('by_org_role', ['organizationId', 'role'])
    .index('by_org_active', ['organizationId', 'isActive'])
    .index('by_org_approval', ['organizationId', 'isApproved'])
    .index('by_role', ['role'])
    .index('by_supervisor', ['supervisorId'])
    .index('by_approval', ['isApproved'])
    .index('by_clerk_id', ['clerkId'])
    .index('by_org_email', ['organizationId', 'email'])
    .index('by_org_created', ['organizationId', 'createdAt'])
    .index('by_session_token', ['sessionToken'])
    .index('by_reset_token', ['resetPasswordToken'])
    .index('by_department', ['departmentId'])
    .index('by_position', ['positionId'])
    // Lets an integration sync find a previously imported user by provider id.
    .index('by_org_external', ['organizationId', 'externalSource', 'externalId']),

  webauthnCredentials: defineTable({
    userId: v.id('users'),
    credentialId: v.string(),
    publicKey: v.string(),
    counter: v.number(),
    deviceName: v.optional(v.string()),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
  })
    .index('by_user', ['userId'])
    .index('by_credential_id', ['credentialId']),
};
