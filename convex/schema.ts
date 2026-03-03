import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ── ORGANIZATIONS ────────────────────────────────────────────────────────
  // Each tenant is one organization. All data is scoped by organizationId.
  organizations: defineTable({
    name: v.string(),                  // "AURA Medical Center"
    slug: v.string(),                  // "aura" — unique, lowercase, URL-safe
    plan: v.union(
      v.literal("starter"),
      v.literal("professional"),
      v.literal("enterprise"),
    ),
    isActive: v.boolean(),
    // The superadmin who created this org
    createdBySuperadmin: v.boolean(),
    // Settings
    logoUrl: v.optional(v.string()),
    primaryColor: v.optional(v.string()),
    timezone: v.optional(v.string()),
    country: v.optional(v.string()),
    industry: v.optional(v.string()),
    employeeLimit: v.number(),         // max employees by plan
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_plan", ["plan"])
    .index("by_active", ["isActive"]),

  // ── ORGANIZATION CREATION REQUESTS ───────────────────────────────────────
  // When someone wants to create a new organization (Professional/Enterprise)
  organizationRequests: defineTable({
    requestedName: v.string(),
    requestedSlug: v.string(),
    requesterName: v.string(),
    requesterEmail: v.string(),
    requesterPhone: v.optional(v.string()),
    requesterPassword: v.string(),              // hashed password for future user
    requestedPlan: v.union(
      v.literal("professional"),
      v.literal("enterprise"),
    ),
    industry: v.optional(v.string()),
    country: v.optional(v.string()),
    teamSize: v.optional(v.string()),           // "1-10", "11-50", "51-200", "200+"
    description: v.optional(v.string()),        // Why do they need this?
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
    ),
    reviewedBy: v.optional(v.id("users")),      // superadmin who reviewed
    reviewedAt: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
    // After approval
    organizationId: v.optional(v.id("organizations")),
    userId: v.optional(v.id("users")),          // created admin user
    createdAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_email", ["requesterEmail"])
    .index("by_slug", ["requestedSlug"]),

  // ── JOIN REQUESTS ────────────────────────────────────────────────────────
  // When an employee types an org name → request goes to org admin
  organizationInvites: defineTable({
    organizationId: v.id("organizations"),
    // For join requests (employee → org)
    requestedByEmail: v.string(),
    requestedByName: v.string(),
    requestedAt: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
    ),
    reviewedBy: v.optional(v.id("users")), // org admin who reviewed
    reviewedAt: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
    // After approval, the user record ID
    userId: v.optional(v.id("users")),
    // Invite link mode (admin → employee)
    inviteToken: v.optional(v.string()),  // unique token for invite links
    inviteEmail: v.optional(v.string()),  // pre-filled email
    inviteExpiry: v.optional(v.number()), // expiry timestamp
    createdAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_email", ["requestedByEmail"])
    .index("by_status", ["status"])
    .index("by_org_status", ["organizationId", "status"])
    .index("by_token", ["inviteToken"]),

  // ── USERS ────────────────────────────────────────────────────────────────
  users: defineTable({
    // Multi-tenant: every user belongs to one organization
    organizationId: v.optional(v.id("organizations")),
    name: v.string(),
    email: v.string(),
    passwordHash: v.string(),
    role: v.union(
      v.literal("superadmin"),   // platform owner (you) — sees all orgs
      v.literal("admin"),        // org admin — sees only their org
      v.literal("supervisor"),
      v.literal("employee"),
    ),
    employeeType: v.union(v.literal("staff"), v.literal("contractor")),
    department: v.optional(v.string()),
    position: v.optional(v.string()),
    phone: v.optional(v.string()),
    location: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    presenceStatus: v.optional(v.union(
      v.literal("available"),
      v.literal("in_meeting"),
      v.literal("in_call"),
      v.literal("out_of_office"),
      v.literal("busy"),
    )),
    supervisorId: v.optional(v.id("users")),
    isActive: v.boolean(),
    // Approval system
    isApproved: v.boolean(),
    approvedBy: v.optional(v.id("users")),
    approvedAt: v.optional(v.number()),
    // Travel allowance: contractor=12000, staff=20000
    travelAllowance: v.number(),
    // Annual leave balances
    paidLeaveBalance: v.number(),
    sickLeaveBalance: v.number(),
    familyLeaveBalance: v.number(),
    // WebAuthn
    webauthnChallenge: v.optional(v.string()),
    // Face Recognition
    faceDescriptor: v.optional(v.array(v.number())),
    faceImageUrl: v.optional(v.string()),
    faceRegisteredAt: v.optional(v.number()),
    faceIdBlocked: v.optional(v.boolean()),
    faceIdBlockedAt: v.optional(v.number()),
    faceIdFailedAttempts: v.optional(v.number()),
    faceIdLastAttempt: v.optional(v.number()),
    // Password Reset
    resetPasswordToken: v.optional(v.string()),
    resetPasswordExpiry: v.optional(v.number()),
    // Sessions
    sessionToken: v.optional(v.string()),
    sessionExpiry: v.optional(v.number()),
    // Productivity Settings
    focusModeEnabled: v.optional(v.boolean()),
    workHoursStart: v.optional(v.string()),
    workHoursEnd: v.optional(v.string()),
    breakRemindersEnabled: v.optional(v.boolean()),
    breakInterval: v.optional(v.number()),
    dailyTaskGoal: v.optional(v.number()),
    // Localization Settings
    language: v.optional(v.string()),
    timezone: v.optional(v.string()),
    dateFormat: v.optional(v.string()),
    timeFormat: v.optional(v.string()),
    firstDayOfWeek: v.optional(v.string()),
    // Dashboard Settings
    defaultView: v.optional(v.string()),
    dataRefreshRate: v.optional(v.string()),
    compactMode: v.optional(v.boolean()),
    dashboardWidgets: v.optional(v.object({
      quickStats: v.boolean(),
      leaveCalendar: v.boolean(),
      upcomingTasks: v.boolean(),
      teamActivity: v.boolean(),
      recentLeaves: v.boolean(),
      analytics: v.boolean(),
    })),
    // Metadata
    createdAt: v.number(),
    lastLoginAt: v.optional(v.number()),
  })
    .index("by_email", ["email"])
    .index("by_org", ["organizationId"])
    .index("by_org_role", ["organizationId", "role"])
    .index("by_org_active", ["organizationId", "isActive"])
    .index("by_org_approval", ["organizationId", "isApproved"])
    .index("by_role", ["role"])
    .index("by_supervisor", ["supervisorId"])
    .index("by_approval", ["isApproved"]),

  webauthnCredentials: defineTable({
    userId: v.id("users"),
    credentialId: v.string(),
    publicKey: v.string(),
    counter: v.number(),
    deviceName: v.optional(v.string()),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_credential_id", ["credentialId"]),

  // ── LEAVE REQUESTS ───────────────────────────────────────────────────────
  leaveRequests: defineTable({
    organizationId: v.optional(v.id("organizations")),   // optional for migration
    userId: v.id("users"),
    type: v.union(
      v.literal("paid"),
      v.literal("unpaid"),
      v.literal("sick"),
      v.literal("family"),
      v.literal("doctor"),
    ),
    startDate: v.string(),
    endDate: v.string(),
    days: v.number(),
    reason: v.string(),
    comment: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
    ),
    reviewedBy: v.optional(v.id("users")),
    reviewComment: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_user", ["userId"])
    .index("by_org_status", ["organizationId", "status"])
    .index("by_status", ["status"])
    .index("by_created", ["createdAt"]),

  // ── NOTIFICATIONS ────────────────────────────────────────────────────────
  notifications: defineTable({
    organizationId: v.optional(v.id("organizations")),   // optional for migration
    userId: v.id("users"),
    type: v.union(
      v.literal("leave_request"),
      v.literal("leave_approved"),
      v.literal("leave_rejected"),
      v.literal("employee_added"),
      v.literal("join_request"),             // new: employee wants to join
      v.literal("join_approved"),            // new: join request approved
      v.literal("join_rejected"),            // new: join request rejected
      v.literal("system"),
    ),
    title: v.string(),
    message: v.string(),
    isRead: v.boolean(),
    relatedId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_org", ["organizationId"])
    .index("by_user_unread", ["userId", "isRead"]),

  // ── AUDIT LOGS ───────────────────────────────────────────────────────────
  auditLogs: defineTable({
    organizationId: v.optional(v.id("organizations")),   // optional for migration
    userId: v.id("users"),
    action: v.string(),
    target: v.optional(v.string()),
    details: v.optional(v.string()),
    ip: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_user", ["userId"]),

  // ── SLA CONFIG ───────────────────────────────────────────────────────────
  slaConfig: defineTable({
    organizationId: v.optional(v.id("organizations")),   // optional for migration
    targetResponseTime: v.number(),
    warningThreshold: v.number(),
    criticalThreshold: v.number(),
    businessHoursOnly: v.boolean(),
    businessStartHour: v.number(),
    businessEndHour: v.number(),
    excludeWeekends: v.boolean(),
    notifyOnWarning: v.boolean(),
    notifyOnCritical: v.boolean(),
    notifyOnBreach: v.boolean(),
    updatedBy: v.id("users"),
    updatedAt: v.number(),
  }).index("by_org", ["organizationId"]),

  // ── SLA METRICS ──────────────────────────────────────────────────────────
  slaMetrics: defineTable({
    organizationId: v.optional(v.id("organizations")),   // optional for migration
    leaveRequestId: v.id("leaveRequests"),
    submittedAt: v.number(),
    respondedAt: v.optional(v.number()),
    responseTimeHours: v.optional(v.number()),
    targetResponseTime: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("on_time"),
      v.literal("breached"),
    ),
    slaScore: v.optional(v.number()),
    warningTriggered: v.boolean(),
    criticalTriggered: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_leave", ["leaveRequestId"])
    .index("by_status", ["status"])
    .index("by_submitted", ["submittedAt"]),

  // ── EMPLOYEE PROFILES ────────────────────────────────────────────────────
  employeeProfiles: defineTable({
    organizationId: v.optional(v.id("organizations")),   // optional for migration
    userId: v.id("users"),
    biography: v.optional(v.object({
      education: v.optional(v.array(v.string())),
      certifications: v.optional(v.array(v.string())),
      workHistory: v.optional(v.array(v.string())),
      skills: v.optional(v.array(v.string())),
      languages: v.optional(v.array(v.string())),
    })),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_user", ["userId"]),

  // ── EMPLOYEE DOCUMENTS ───────────────────────────────────────────────────
  employeeDocuments: defineTable({
    organizationId: v.optional(v.id("organizations")),   // optional for migration
    userId: v.id("users"),
    uploaderId: v.id("users"),
    category: v.union(
      v.literal("resume"),
      v.literal("contract"),
      v.literal("certificate"),
      v.literal("performance_review"),
      v.literal("id_document"),
      v.literal("other"),
    ),
    fileName: v.string(),
    fileUrl: v.string(),
    fileSize: v.number(),
    description: v.optional(v.string()),
    uploadedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_user", ["userId"]),

  // ── EMPLOYEE NOTES ───────────────────────────────────────────────────────
  employeeNotes: defineTable({
    organizationId: v.optional(v.id("organizations")),   // optional for migration
    employeeId: v.id("users"),
    authorId: v.id("users"),
    type: v.union(
      v.literal("performance"),
      v.literal("behavior"),
      v.literal("achievement"),
      v.literal("concern"),
      v.literal("general"),
    ),
    visibility: v.union(
      v.literal("private"),
      v.literal("hr_only"),
      v.literal("manager_only"),
      v.literal("employee_visible"),
    ),
    content: v.string(),
    sentiment: v.union(
      v.literal("positive"),
      v.literal("neutral"),
      v.literal("negative"),
    ),
    tags: v.array(v.string()),
    createdAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_employee", ["employeeId"])
    .index("by_author", ["authorId"]),

  // ── PERFORMANCE METRICS ──────────────────────────────────────────────────
  performanceMetrics: defineTable({
    organizationId: v.optional(v.id("organizations")),   // optional for migration
    userId: v.id("users"),
    updatedBy: v.id("users"),
    punctualityScore: v.number(),
    absenceRate: v.number(),
    lateArrivals: v.number(),
    kpiScore: v.number(),
    projectCompletion: v.number(),
    deadlineAdherence: v.number(),
    teamworkRating: v.number(),
    communicationScore: v.number(),
    conflictIncidents: v.number(),
    createdAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_user", ["userId"]),

  // ── TIME TRACKING ────────────────────────────────────────────────────────
  timeTracking: defineTable({
    organizationId: v.optional(v.id("organizations")),   // optional for migration
    userId: v.id("users"),
    checkInTime: v.number(),
    checkOutTime: v.optional(v.number()),
    scheduledStartTime: v.number(),
    scheduledEndTime: v.number(),
    isLate: v.boolean(),
    lateMinutes: v.optional(v.number()),
    isEarlyLeave: v.boolean(),
    earlyLeaveMinutes: v.optional(v.number()),
    overtimeMinutes: v.optional(v.number()),
    totalWorkedMinutes: v.optional(v.number()),
    status: v.union(
      v.literal("checked_in"),
      v.literal("checked_out"),
      v.literal("absent"),
    ),
    date: v.string(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_user", ["userId"])
    .index("by_date", ["date"])
    .index("by_user_date", ["userId", "date"])
    .index("by_status", ["status"]),

  // ── SUPERVISOR RATINGS ───────────────────────────────────────────────────
  supervisorRatings: defineTable({
    organizationId: v.optional(v.id("organizations")),   // optional for migration
    employeeId: v.id("users"),
    supervisorId: v.id("users"),
    qualityOfWork: v.number(),
    efficiency: v.number(),
    teamwork: v.number(),
    initiative: v.number(),
    communication: v.number(),
    reliability: v.number(),
    overallRating: v.number(),
    strengths: v.optional(v.string()),
    areasForImprovement: v.optional(v.string()),
    generalComments: v.optional(v.string()),
    ratingPeriod: v.string(),
    createdAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_employee", ["employeeId"])
    .index("by_supervisor", ["supervisorId"])
    .index("by_period", ["ratingPeriod"]),

  // ── TASKS ────────────────────────────────────────────────────────────────
  tasks: defineTable({
    organizationId: v.optional(v.id("organizations")),   // optional for migration
    title: v.string(),
    description: v.optional(v.string()),
    assignedTo: v.id("users"),
    assignedBy: v.id("users"),
    status: v.union(
      v.literal("pending"),
      v.literal("in_progress"),
      v.literal("review"),
      v.literal("completed"),
      v.literal("cancelled"),
    ),
    priority: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("urgent"),
    ),
    deadline: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
    attachmentUrl: v.optional(v.string()),
    attachments: v.optional(v.array(v.object({
      url: v.string(),
      name: v.string(),
      type: v.string(),
      size: v.number(),
      uploadedBy: v.id("users"),
      uploadedAt: v.number(),
    }))),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_assigned_to", ["assignedTo"])
    .index("by_assigned_by", ["assignedBy"])
    .index("by_status", ["status"])
    .index("by_deadline", ["deadline"]),

  // ── TASK COMMENTS ────────────────────────────────────────────────────────
  taskComments: defineTable({
    taskId: v.id("tasks"),
    authorId: v.id("users"),
    content: v.string(),
    createdAt: v.number(),
  }).index("by_task", ["taskId"]),

  // ── SUBSCRIPTIONS ────────────────────────────────────────────────────────
  // Subscriptions belong to an organization (not individual user)
  subscriptions: defineTable({
    organizationId: v.optional(v.id("organizations")), // ← tenant
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.string(),
    stripeSessionId: v.optional(v.string()),
    plan: v.union(
      v.literal("starter"),
      v.literal("professional"),
      v.literal("enterprise"),
    ),
    status: v.union(
      v.literal("trialing"),
      v.literal("active"),
      v.literal("past_due"),
      v.literal("canceled"),
      v.literal("incomplete"),
    ),
    email: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    currentPeriodStart: v.optional(v.number()),
    currentPeriodEnd: v.optional(v.number()),
    cancelAtPeriodEnd: v.boolean(),
    trialEnd: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_stripe_customer", ["stripeCustomerId"])
    .index("by_stripe_subscription", ["stripeSubscriptionId"])
    .index("by_status", ["status"])
    .index("by_user", ["userId"])
    .index("by_email", ["email"]),

  // ── CONTACT INQUIRIES ────────────────────────────────────────────────────
  contactInquiries: defineTable({
    name: v.string(),
    email: v.string(),
    company: v.optional(v.string()),
    teamSize: v.optional(v.string()),
    message: v.string(),
    plan: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_created", ["createdAt"]),

  // ── WORK SCHEDULE ────────────────────────────────────────────────────────
  workSchedule: defineTable({
    organizationId: v.optional(v.id("organizations")),   // optional for migration
    userId: v.id("users"),
    startTime: v.string(),
    endTime: v.string(),
    workingDays: v.array(v.number()),
    timezone: v.string(),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_user", ["userId"]),

  // ── USER PREFERENCES ─────────────────────────────────────────────────
  // Store user preferences like tour completion, UI settings, etc.
  userPreferences: defineTable({
    userId: v.id("users"),
    key: v.string(),              // e.g., "tour_seen_login-tour", "theme", "notifications_enabled"
    value: v.any(),               // The preference value (boolean, string, object, etc.)
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_key", ["userId", "key"]),

  // ── POMODORO SESSIONS ────────────────────────────────────────────────
  pomodoroSessions: defineTable({
    userId: v.id("users"),
    taskId: v.optional(v.id("tasks")),
    startTime: v.number(),
    endTime: v.number(),
    duration: v.number(), // in milliseconds
    completed: v.boolean(),
    interrupted: v.boolean(),
    actualEndTime: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_active", ["userId", "completed", "interrupted"]),

  // ── AI SITE EDITOR SESSIONS ──────────────────────────────────────────────
  // Track AI-powered site editing sessions with plan-based limitations
  aiSiteEditorSessions: defineTable({
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    plan: v.union(
      v.literal("starter"),
      v.literal("professional"),
      v.literal("enterprise"),
    ),
    // Request details
    userMessage: v.string(),              // What user asked for
    aiResponse: v.string(),               // AI's response
    // What was edited
    editType: v.union(
      v.literal("design"),                // CSS/styling changes
      v.literal("content"),               // Text/content changes
      v.literal("layout"),                // Component structure
      v.literal("logic"),                 // Functionality/behavior
      v.literal("full_control"),          // Complete site modifications (Pro only)
    ),
    targetComponent: v.optional(v.string()), // Which component was edited
    changesMade: v.array(v.object({
      file: v.string(),                   // File path that was modified
      type: v.string(),                   // Type of change
      description: v.string(),            // Human-readable description
      before: v.optional(v.string()),     // Code before (for rollback)
      after: v.optional(v.string()),      // Code after
    })),
    // Plan limits tracking
    limitType: v.union(
      v.literal("limited"),               // Starter: very limited actions
      v.literal("unlimited"),             // Professional: unlimited actions
    ),
    tokensUsed: v.optional(v.number()),   // For usage tracking
    // Status
    status: v.union(
      v.literal("pending"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("rejected"),              // Rejected by plan limits
    ),
    errorMessage: v.optional(v.string()),
    // Rollback capability
    canRollback: v.boolean(),
    rolledBack: v.boolean(),
    rolledBackAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_user", ["userId"])
    .index("by_org_date", ["organizationId", "createdAt"])
    .index("by_plan", ["plan"])
    .index("by_status", ["status"]),

  // ── SECURITY SETTINGS (superadmin global toggles) ────────────────────────
  securitySettings: defineTable({
    key: v.string(),          // e.g. "adaptive_auth", "keystroke_dynamics", "continuous_face", "audit_logging"
    enabled: v.boolean(),
    updatedBy: v.id("users"),
    updatedAt: v.number(),
    description: v.optional(v.string()),
  }).index("by_key", ["key"]),

  // ── LOGIN ATTEMPTS ────────────────────────────────────────────────────────
  loginAttempts: defineTable({
    email: v.string(),
    userId: v.optional(v.id("users")),
    organizationId: v.optional(v.id("organizations")),
    success: v.boolean(),
    method: v.union(
      v.literal("password"),
      v.literal("face_id"),
      v.literal("webauthn"),
      v.literal("google"),
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
    .index("by_email", ["email"])
    .index("by_user", ["userId"])
    .index("by_org", ["organizationId"])
    .index("by_created", ["createdAt"])
    .index("by_success", ["success"]),

  // ── DEVICE FINGERPRINTS ───────────────────────────────────────────────────
  deviceFingerprints: defineTable({
    userId: v.id("users"),
    fingerprint: v.string(),           // hash of browser/device signature
    userAgent: v.optional(v.string()),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
    isTrusted: v.boolean(),            // admin/user can mark as trusted
    loginCount: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_fingerprint", ["fingerprint"])
    .index("by_user_fingerprint", ["userId", "fingerprint"]),

  // ── KEYSTROKE PROFILES ────────────────────────────────────────────────────
  keystrokeProfiles: defineTable({
    userId: v.id("users"),
    // Average timing patterns (ms between keypresses)
    avgDwell: v.number(),              // avg key hold time
    avgFlight: v.number(),             // avg time between keys
    stdDevDwell: v.optional(v.number()),
    stdDevFlight: v.optional(v.number()),
    sampleCount: v.number(),           // how many samples collected
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // ── AI SITE EDITOR USAGE LIMITS ──────────────────────────────────────────
  // Track monthly usage limits for different plans
  aiSiteEditorUsage: defineTable({
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    plan: v.union(
      v.literal("starter"),
      v.literal("professional"),
      v.literal("enterprise"),
    ),
    // Monthly tracking
    month: v.string(),                    // "2026-03" format
    // Usage counters
    designChanges: v.number(),            // Starter: max 5/month
    contentChanges: v.number(),           // Starter: max 10/month
    layoutChanges: v.number(),            // Starter: max 2/month
    logicChanges: v.number(),             // Starter: max 0/month (Pro only)
    fullControlChanges: v.number(),       // Starter: max 0/month (Pro only)
    totalRequests: v.number(),
    // Last reset
    lastResetAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_user", ["userId"])
    .index("by_org_month", ["organizationId", "month"])
    .index("by_user_month", ["userId", "month"]),
});
