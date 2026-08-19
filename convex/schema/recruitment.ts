import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const recruitment = {
  // Vacancies (job postings)
  vacancies: defineTable({
    organizationId: v.id('organizations'),
    title: v.string(),
    department: v.optional(v.string()),
    location: v.optional(v.string()),
    employmentType: v.union(
      v.literal('full_time'),
      v.literal('part_time'),
      v.literal('contract'),
      v.literal('internship'),
    ),
    description: v.string(),
    requirements: v.optional(v.string()),
    salary: v.optional(
      v.object({
        min: v.number(),
        max: v.number(),
        currency: v.string(),
      }),
    ),
    status: v.union(
      v.literal('draft'),
      v.literal('open'),
      v.literal('paused'),
      v.literal('closed'),
    ),
    hiringManagerId: v.id('users'),
    createdBy: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
    closedAt: v.optional(v.number()),
  })
    .index('by_org', ['organizationId'])
    .index('by_org_status', ['organizationId', 'status'])
    .index('by_status', ['status'])
    .index('by_manager', ['hiringManagerId']),

  // Candidate profiles (person-level, reusable across vacancies)
  candidateProfiles: defineTable({
    organizationId: v.id('organizations'),
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    resumeText: v.optional(v.string()),
    source: v.union(
      v.literal('manual'),
      v.literal('referral'),
      v.literal('career_page'),
      v.literal('linkedin'),
      v.literal('other'),
    ),
    referredBy: v.optional(v.id('users')),
    /** Telegram identity — set when the candidate links their account via the bot. */
    telegramChatId: v.optional(v.string()),
    telegramUsername: v.optional(v.string()),
    /** Optional: the candidate may be blocked from applying again. */
    isBlocked: v.optional(v.boolean()),
    blockedAt: v.optional(v.number()),
    blockedReason: v.optional(v.string()),
    createdBy: v.id('users'),
    createdAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_org_email', ['organizationId', 'email'])
    .index('by_telegramChatId', ['telegramChatId']),

  // Applications (candidate + vacancy link, with pipeline stage)
  applications: defineTable({
    organizationId: v.id('organizations'),
    candidateId: v.id('candidateProfiles'),
    vacancyId: v.id('vacancies'),
    stage: v.union(
      v.literal('applied'),
      v.literal('screening'),
      v.literal('interview'),
      v.literal('offer'),
      v.literal('hired'),
      v.literal('rejected'),
    ),
    /**
     * The CV the candidate attached, and what HR decided about it.
     *
     * A pipeline that lets everyone through to an interview wastes the
     * interviewers' time, so the first stage is a gate: the candidate attaches a
     * PDF, HR reads it, and only an approved CV opens the rest of the stages.
     *
     * All optional. Applications recorded before this existed carry no CV, and
     * neither do candidates HR enters by hand from a referral or an inbox — the
     * gate must not strand either of them (see `cvBlocksAdvance` in
     * convex/recruitment.ts).
     */
    cvFileUrl: v.optional(v.string()),
    cvFileName: v.optional(v.string()),
    cvFileSize: v.optional(v.number()),
    cvMimeType: v.optional(v.string()),
    cvUploadedAt: v.optional(v.number()),
    cvStatus: v.optional(
      v.union(v.literal('pending'), v.literal('approved'), v.literal('rejected')),
    ),
    cvReviewedBy: v.optional(v.id('users')),
    cvReviewedAt: v.optional(v.number()),
    cvReviewNote: v.optional(v.string()),
    rating: v.optional(v.number()),
    notes: v.optional(v.string()),
    rejectionReason: v.optional(v.string()),
    /** Screening: AI-generated instructions sent via Telegram. */
    screeningStartedAt: v.optional(v.number()),
    screeningCompletedAt: v.optional(v.number()),
    screeningInstructions: v.optional(v.string()),
    screeningScore: v.optional(v.number()),
    /**
     * AI interview prep pack — staff-only material (questions, scorecard
     * criteria, red flags). Persisted so the interviewer can reopen it during
     * the interview; never exposed to the candidate portal.
     */
    interviewPrep: v.optional(
      v.object({
        questions: v.array(
          v.object({
            category: v.string(),
            question: v.string(),
            whatToLookFor: v.string(),
          }),
        ),
        criteria: v.array(v.object({ criterion: v.string(), description: v.string() })),
        redFlags: v.array(v.string()),
        openingTips: v.string(),
        updatedAt: v.number(),
      }),
    ),
    /** Unique token for the public candidate portal. */
    candidateToken: v.optional(v.string()),
    createdBy: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_vacancy', ['vacancyId'])
    .index('by_vacancy_stage', ['vacancyId', 'stage'])
    .index('by_candidate', ['candidateId'])
    .index('by_org', ['organizationId'])
    .index('by_org_stage', ['organizationId', 'stage'])
    // The review queue: applications whose CV is still waiting on someone.
    .index('by_org_cvStatus', ['organizationId', 'cvStatus'])
    // Public candidate portal lookup.
    .index('by_candidateToken', ['candidateToken']),

  // Application stage events (audit trail)
  applicationEvents: defineTable({
    applicationId: v.id('applications'),
    organizationId: v.id('organizations'),
    fromStage: v.optional(v.string()),
    toStage: v.string(),
    changedBy: v.id('users'),
    reason: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_application', ['applicationId'])
    .index('by_org_date', ['organizationId', 'createdAt']),

  // Interviews
  interviews: defineTable({
    applicationId: v.id('applications'),
    organizationId: v.id('organizations'),
    interviewerId: v.id('users'),
    scheduledAt: v.number(),
    duration: v.number(),
    type: v.union(
      v.literal('phone'),
      v.literal('video'),
      v.literal('onsite'),
      v.literal('technical'),
      v.literal('hr'),
    ),
    location: v.optional(v.string()),
    // Sent in the invitation email and therefore has to be storable; the
    // scheduling mutation passed both through and the insert failed on them.
    meetingLink: v.optional(v.string()),
    additionalNotes: v.optional(v.string()),
    /** Round number within the application (1, 2, 3…) */
    round: v.optional(v.number()),
    status: v.union(
      v.literal('scheduled'),
      v.literal('completed'),
      v.literal('cancelled'),
      v.literal('no_show'),
    ),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_application', ['applicationId'])
    .index('by_interviewer', ['interviewerId'])
    .index('by_org_date', ['organizationId', 'scheduledAt']),

  // Screening responses — messages candidates send via Telegram during screening
  screeningResponses: defineTable({
    applicationId: v.id('applications'),
    organizationId: v.id('organizations'),
    /** Raw text the candidate sent. */
    message: v.string(),
    /** Telegram message ID for dedup / edit tracking. */
    telegramMessageId: v.optional(v.number()),
    /** Candidate's Telegram chat ID (denormalized for quick lookup). */
    telegramChatId: v.string(),
    /** Who sent this message: candidate via Telegram or HR via the dashboard. */
    sender: v.union(v.literal('candidate'), v.literal('hr')),
    /** If sender is 'hr', the user who sent it. */
    sentBy: v.optional(v.id('users')),
    /** AI scoring — populated after the candidate completes screening. */
    aiScore: v.optional(
      v.object({
        score: v.number(), // 1-10
        verdict: v.union(v.literal('pass'), v.literal('conditional'), v.literal('fail')),
        reasoning: v.string(),
        strengths: v.array(v.string()),
        concerns: v.array(v.string()),
      }),
    ),
    createdAt: v.number(),
  })
    .index('by_application', ['applicationId'])
    .index('by_org', ['organizationId'])
    .index('by_telegramChatId', ['telegramChatId']),

  // Interview scorecards
  interviewScorecards: defineTable({
    applicationId: v.id('applications'),
    organizationId: v.id('organizations'),
    interviewId: v.optional(v.id('interviews')),
    interviewerId: v.id('users'),
    ratings: v.array(
      v.object({
        criterion: v.string(),
        score: v.number(),
        comment: v.optional(v.string()),
      }),
    ),
    overallScore: v.number(),
    recommendation: v.union(
      v.literal('strong_yes'),
      v.literal('yes'),
      v.literal('neutral'),
      v.literal('no'),
      v.literal('strong_no'),
    ),
    summary: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_application', ['applicationId'])
    .index('by_interviewer', ['interviewerId']),
};
