import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const employees = {
  employeeProfiles: defineTable({
    organizationId: v.optional(v.id('organizations')),
    userId: v.id('users'),
    biography: v.optional(
      v.object({
        education: v.optional(v.array(v.string())),
        certifications: v.optional(v.array(v.string())),
        workHistory: v.optional(v.array(v.string())),
        skills: v.optional(v.array(v.string())),
        languages: v.optional(v.array(v.string())),
      }),
    ),
    baseSalary: v.optional(v.number()),
    bonuses: v.optional(v.number()),
    overtimeHours: v.optional(v.number()),
    hourlyRate: v.optional(v.number()),
    salaryCurrency: v.optional(v.string()),
    salaryUpdatedAt: v.optional(v.number()),
    // Identity / passport document data (all optional — sensitive PII)
    passportNumber: v.optional(v.string()),
    passportIssuedBy: v.optional(v.string()),
    passportIssueDate: v.optional(v.string()),
    passportExpiryDate: v.optional(v.string()),
    socialCardNumber: v.optional(v.string()),
    nationality: v.optional(v.string()),
    // New extended fields
    address: v.optional(v.string()),
    emergencyContactName: v.optional(v.string()),
    emergencyContactPhone: v.optional(v.string()),
    emergencyContactRelation: v.optional(v.string()),
    workFormat: v.optional(v.union(v.literal('remote'), v.literal('office'), v.literal('hybrid'))),
    workSchedule: v.optional(
      v.object({
        startTime: v.string(),
        endTime: v.string(),
        workingDays: v.array(v.string()),
        flexHours: v.boolean(),
      }),
    ),
    socialLinks: v.optional(
      v.object({
        linkedin: v.optional(v.string()),
        github: v.optional(v.string()),
        portfolio: v.optional(v.string()),
      }),
    ),
    structuredWorkHistory: v.optional(
      v.array(
        v.object({
          company: v.string(),
          position: v.string(),
          startDate: v.string(),
          endDate: v.optional(v.string()),
          description: v.optional(v.string()),
        }),
      ),
    ),
    structuredEducation: v.optional(
      v.array(
        v.object({
          institution: v.string(),
          degree: v.string(),
          field: v.string(),
          startDate: v.string(),
          endDate: v.optional(v.string()),
          gpa: v.optional(v.string()),
        }),
      ),
    ),
    dateOfBirth: v.optional(v.string()),
    /** Birth year — used to decide Armenia funded-pension exemption (born before 1974). */
    birthYear: v.optional(v.number()),
    /** Manual override of the pension exemption derived from birthYear/dateOfBirth. */
    pensionExempt: v.optional(v.boolean()),
    /** Last SRC (ՀՎՀՀ) taxpayer-verification status. */
    taxIdStatus: v.optional(
      v.union(
        v.literal('verified'),
        v.literal('not_found'),
        v.literal('valid_local'),
        v.literal('invalid_checksum'),
        v.literal('invalid_format'),
      ),
    ),
    /** When the last verification was run (ms epoch). */
    taxIdVerifiedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    // GDPR marker set by the superadmin toolkit when PII is scrubbed.
    dataAnonymizedAt: v.optional(v.number()),
  })
    .index('by_org', ['organizationId'])
    .index('by_user', ['userId']),

  employeeDocuments: defineTable({
    organizationId: v.optional(v.id('organizations')),
    userId: v.id('users'),
    uploaderId: v.id('users'),
    category: v.union(
      v.literal('resume'),
      v.literal('contract'),
      v.literal('certificate'),
      v.literal('performance_review'),
      v.literal('id_document'),
      v.literal('other'),
    ),
    fileName: v.string(),
    fileUrl: v.string(),
    fileSize: v.number(),
    description: v.optional(v.string()),
    uploadedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_user', ['userId']),

  employeeNotes: defineTable({
    organizationId: v.optional(v.id('organizations')),
    employeeId: v.id('users'),
    authorId: v.id('users'),
    type: v.union(
      v.literal('performance'),
      v.literal('behavior'),
      v.literal('achievement'),
      v.literal('concern'),
      v.literal('general'),
    ),
    visibility: v.union(
      v.literal('private'),
      v.literal('hr_only'),
      v.literal('manager_only'),
      v.literal('employee_visible'),
    ),
    content: v.string(),
    sentiment: v.union(v.literal('positive'), v.literal('neutral'), v.literal('negative')),
    tags: v.array(v.string()),
    createdAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_employee', ['employeeId'])
    .index('by_author', ['authorId']),

  performanceMetrics: defineTable({
    organizationId: v.optional(v.id('organizations')),
    userId: v.id('users'),
    updatedBy: v.id('users'),
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
    .index('by_org', ['organizationId'])
    .index('by_user', ['userId']),

  timeTracking: defineTable({
    organizationId: v.optional(v.id('organizations')),
    userId: v.id('users'),
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
    status: v.union(v.literal('checked_in'), v.literal('checked_out'), v.literal('absent')),
    date: v.string(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_user', ['userId'])
    .index('by_date', ['date'])
    .index('by_user_date', ['userId', 'date'])
    .index('by_status', ['status']),

  supervisorRatings: defineTable({
    organizationId: v.optional(v.id('organizations')),
    employeeId: v.id('users'),
    supervisorId: v.id('users'),
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
    .index('by_org', ['organizationId'])
    .index('by_employee', ['employeeId'])
    .index('by_supervisor', ['supervisorId'])
    .index('by_period', ['ratingPeriod']),
};
