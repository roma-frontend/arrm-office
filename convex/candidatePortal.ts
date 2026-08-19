/**
 * Public candidate portal — no authentication required.
 *
 * Candidates access their recruitment dashboard via a unique token in the URL.
 * The token is generated when they apply and shared via Telegram/email.
 */
import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { DEFAULT_LIST_CAP } from './lib/limits';

/**
 * Generate a unique candidate token for an application.
 * Called internally when a candidate applies.
 */
export function generateCandidateToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * Public query: get the candidate portal data by token.
 * Returns the full recruitment status, screening responses, interviews, and timeline.
 */
export const getCandidatePortal = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    // Find the application by token
    const app = await ctx.db
      .query('applications')
      .withIndex('by_candidateToken', (q) => q.eq('candidateToken', args.token))
      .first();

    if (!app) return null;

    const candidate = await ctx.db.get(app.candidateId);
    const vacancy = await ctx.db.get(app.vacancyId);
    const organization = await ctx.db.get(app.organizationId);

    // Screening responses (both candidate and HR messages)
    const screeningResponses = await ctx.db
      .query('screeningResponses')
      .withIndex('by_application', (q) => q.eq('applicationId', app._id))
      .order('asc')
      .take(DEFAULT_LIST_CAP);

    // Interviews
    const interviews = await ctx.db
      .query('interviews')
      .withIndex('by_application', (q) => q.eq('applicationId', app._id))
      .order('asc')
      .take(DEFAULT_LIST_CAP);

    const enrichedInterviews = await Promise.all(
      interviews.map(async (iv) => {
        const interviewer = await ctx.db.get(iv.interviewerId);
        return { ...iv, interviewerName: interviewer?.name ?? 'HR Team' };
      }),
    );

    // Scorecards
    const scorecards = await ctx.db
      .query('interviewScorecards')
      .withIndex('by_application', (q) => q.eq('applicationId', app._id))
      .order('asc')
      .take(DEFAULT_LIST_CAP);

    const enrichedScorecards = await Promise.all(
      scorecards.map(async (sc) => {
        const interviewer = await ctx.db.get(sc.interviewerId);
        return { ...sc, interviewerName: interviewer?.name ?? 'HR Team' };
      }),
    );

    // Timeline events
    const events = await ctx.db
      .query('applicationEvents')
      .withIndex('by_application', (q) => q.eq('applicationId', app._id))
      .order('asc')
      .take(DEFAULT_LIST_CAP);

    return {
      // Application info
      applicationId: app._id,
      stage: app.stage,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,

      // Screening
      screeningStartedAt: app.screeningStartedAt,
      screeningCompletedAt: app.screeningCompletedAt,
      screeningInstructions: app.screeningInstructions,
      screeningScore: app.screeningScore,

      // Candidate profile (limited — no email/phone for security)
      candidateName: candidate?.name ?? 'Candidate',
      telegramLinked: !!candidate?.telegramChatId,

      // Vacancy info
      vacancyTitle: vacancy?.title ?? 'Position',
      vacancyDepartment: vacancy?.department,
      vacancyLocation: vacancy?.location,
      vacancyDescription: vacancy?.description,

      // Organization (name only)
      orgName: organization?.name ?? 'Company',

      // Screening conversation
      screeningResponses: screeningResponses.map((r) => ({
        _id: r._id,
        message: r.message,
        sender: r.sender,
        createdAt: r.createdAt,
        aiScore: r.aiScore,
      })),

      // Interviews
      interviews: enrichedInterviews.map((iv) => ({
        _id: iv._id,
        type: iv.type,
        round: iv.round,
        scheduledAt: iv.scheduledAt,
        duration: iv.duration,
        status: iv.status,
        interviewerName: iv.interviewerName,
        location: iv.location,
        meetingLink: iv.meetingLink,
      })),

      // Scorecards
      scorecards: enrichedScorecards.map((sc) => ({
        _id: sc._id,
        overallScore: sc.overallScore,
        recommendation: sc.recommendation,
        summary: sc.summary,
        interviewerName: sc.interviewerName,
        createdAt: sc.createdAt,
      })),

      // Timeline (candidate-friendly — no internal details)
      timeline: events.map((ev) => ({
        _id: ev._id,
        fromStage: ev.fromStage,
        toStage: ev.toStage,
        reason: ev.reason,
        createdAt: ev.createdAt,
      })),
    };
  },
});

/**
 * Generate a candidate token for an existing application (for migrations).
 */
export const generateToken = mutation({
  args: { applicationId: v.id('applications') },
  handler: async (ctx, args) => {
    const app = await ctx.db.get(args.applicationId);
    if (!app) throw new Error('Application not found');
    if (app.candidateToken) return app.candidateToken;

    const token = generateCandidateToken();
    await ctx.db.patch(args.applicationId, { candidateToken: token });
    return token;
  },
});
