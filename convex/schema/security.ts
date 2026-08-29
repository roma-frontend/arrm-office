import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const security = {
  impersonationSessions: defineTable({
    superadminId: v.id('users'),
    targetUserId: v.id('users'),
    organizationId: v.id('organizations'),
    reason: v.string(),
    token: v.string(),
    expiresAt: v.number(),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    isActive: v.boolean(),
  })
    .index('by_superadmin', ['superadminId'])
    .index('by_target', ['targetUserId'])
    .index('by_token', ['token'])
    .index('by_active', ['isActive']),

  emergencyIncidents: defineTable({
    organizationId: v.optional(v.id('organizations')),
    title: v.string(),
    description: v.string(),
    severity: v.union(
      v.literal('low'),
      v.literal('medium'),
      v.literal('high'),
      v.literal('critical'),
    ),
    status: v.union(
      v.literal('investigating'),
      v.literal('identified'),
      v.literal('monitoring'),
      v.literal('resolved'),
    ),
    affectedUsers: v.number(),
    affectedOrgs: v.number(),
    rootCause: v.optional(v.string()),
    resolution: v.optional(v.string()),
    startedAt: v.number(),
    resolvedAt: v.optional(v.number()),
    createdBy: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_status', ['status'])
    .index('by_severity', ['severity'])
    .index('by_org', ['organizationId'])
    .index('by_created', ['createdAt']),

  auditLogs: defineTable({
    organizationId: v.optional(v.id('organizations')),
    userId: v.id('users'),
    action: v.string(),
    target: v.optional(v.string()),
    details: v.optional(v.string()),
    ip: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_user', ['userId'])
    .index('by_org_created', ['organizationId', 'createdAt'])
    .index('by_user_created', ['userId', 'createdAt'])
    .index('by_action', ['action'])
    .index('by_target', ['target']),

  /**
   * Short-lived server-issued tokens that prove a Face ID descriptor was
   * verified server-side. Consumed one-time by auth:login when
   * `isFaceLogin: true` is supplied.
   */
  faceLoginTokens: defineTable({
    userId: v.id('users'),
    token: v.string(),
    issuedAt: v.number(),
    expiresAt: v.number(),
    consumedAt: v.optional(v.number()),
    ip: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  })
    .index('by_token', ['token'])
    .index('by_user', ['userId'])
    .index('by_expires', ['expiresAt']),

  securitySettings: defineTable({
    key: v.string(),
    enabled: v.boolean(),
    updatedBy: v.id('users'),
    updatedAt: v.number(),
    description: v.optional(v.string()),
  }).index('by_key', ['key']),

  /**
   * Feature toggles — platform-level switches a superadmin flips from the
   * console, with per-organization overrides. Global defaults live here
   * (scope 'global', organizationId undefined); an org row overrides it.
   */
  featureToggles: defineTable({
    key: v.string(),
    enabled: v.boolean(),
    organizationId: v.optional(v.id('organizations')),
    /** Who changed it last. */
    updatedBy: v.id('users'),
    updatedAt: v.number(),
    description: v.optional(v.string()),
  })
    .index('by_key', ['key'])
    .index('by_org', ['organizationId'])
    .index('by_org_key', ['organizationId', 'key']),

  loginAttempts: defineTable({
    email: v.string(),
    userId: v.optional(v.id('users')),
    organizationId: v.optional(v.id('organizations')),
    success: v.boolean(),
    method: v.union(
      v.literal('password'),
      v.literal('face_id'),
      v.literal('webauthn'),
      v.literal('google'),
    ),
    ip: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    deviceFingerprint: v.optional(v.string()),
    riskScore: v.optional(v.number()),
    riskFactors: v.optional(v.array(v.string())),
    blockedReason: v.optional(v.string()),
    country: v.optional(v.string()),
    city: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_email', ['email'])
    .index('by_user', ['userId'])
    .index('by_org', ['organizationId'])
    .index('by_created', ['createdAt'])
    .index('by_success', ['success']),

  deviceFingerprints: defineTable({
    userId: v.id('users'),
    fingerprint: v.string(),
    userAgent: v.optional(v.string()),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
    isTrusted: v.boolean(),
    loginCount: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_fingerprint', ['fingerprint'])
    .index('by_user_fingerprint', ['userId', 'fingerprint']),

  keystrokeProfiles: defineTable({
    userId: v.id('users'),
    avgDwell: v.number(),
    avgFlight: v.number(),
    stdDevDwell: v.optional(v.number()),
    stdDevFlight: v.optional(v.number()),
    sampleCount: v.number(),
    updatedAt: v.number(),
  }).index('by_user', ['userId']),

  /**
   * Time-limited superadmin accounts for external specialists (auditors, pen-testers).
   * When generated, a real user is created with role='superadmin'. The token tracks
   * the credentials and expiry — the user is deactivated after expiry.
   */
  superadminAccessTokens: defineTable({
    createdBy: v.id('users'),
    name: v.string(),
    email: v.string(),
    tempUserId: v.id('users'),
    passwordHash: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
    isRevoked: v.boolean(),
    revokedAt: v.optional(v.number()),
    lastUsedAt: v.optional(v.number()),
    reason: v.string(),
  })
    .index('by_creator', ['createdBy'])
    .index('by_email', ['email'])
    .index('by_temp_user', ['tempUserId'])
    .index('by_expires', ['expiresAt']),

  /**
   * Superadmin Data Browser audit trail. Every row edit made through the
   * browser is recorded here with its before/after snapshot, so a change can be
   * inspected later and undone in one click — the same discipline the admin
   * console in builder-studio follows.
   */
  adminDbChanges: defineTable({
    tableName: v.string(),
    /** The edited document id, as a string (ids are typed per table). */
    docId: v.string(),
    /** JSON snapshot of the doc before the change. */
    beforeJson: v.optional(v.string()),
    /** JSON snapshot of the doc after the change. */
    afterJson: v.optional(v.string()),
    /** 'patch' | 'insert' | 'delete' */
    action: v.string(),
    changedBy: v.id('users'),
    /** Set when the change has been undone. */
    undoneAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_table', ['tableName'])
    .index('by_doc', ['tableName', 'docId'])
    .index('by_creator', ['changedBy'])
    .index('by_created', ['createdAt']),
};
