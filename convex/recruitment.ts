import { v } from 'convex/values';
import { query, mutation, type MutationCtx, type QueryCtx } from './_generated/server';
import { assertFeatureEnabled } from './superadmin/featureToggles';
import { paginationOptsValidator } from 'convex/server';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';

import { DEFAULT_LIST_CAP, SMALL_LIST_CAP } from './lib/limits';
import { notify } from './lib/notify';
import { getStartingLeaveBalances } from './lib/leaveBalances';
import { resolveOrgUnitsByName } from './lib/orgUnits';
import {
  assertOrgScope,
  assertOrgStaff,
  resolveOrgScope,
  resolveOrgStaff,
  scopeOwnsRecord,
  type OrgScope,
} from './lib/orgAccess';
import { assertModuleAccess } from './lib/entitlements';

/**
 * Candidate records are personal data: a name, an email, a phone number, a CV and
 * whatever the interviewers wrote down. Every read here is therefore staff-only
 * and pinned to one organization, and every write takes its actor from the
 * session — the module used to accept `userId` as an argument, which made the
 * audit trail in `applicationEvents` something the caller could dictate.
 */

/** Stages a candidate can be moved to from each stage. */
const ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  applied: ['screening', 'interview', 'rejected'],
  screening: ['interview', 'offer', 'rejected'],
  interview: ['offer', 'screening', 'rejected'],
  offer: ['hired', 'interview', 'rejected'],
  // Terminal stages. Reopening is deliberate rather than forbidden: a rejection
  // gets reversed, an offer falls through after the fact.
  hired: ['offer'],
  rejected: ['applied', 'screening', 'interview', 'offer'],
};

/** Stages that require an approved CV to enter. */
const STAGES_BEHIND_CV_GATE = new Set(['interview', 'offer', 'hired']);

/**
 * Whether the CV blocks this move.
 *
 * Only an application that actually has a CV can be gated by it. A referral HR
 * typed in by hand never had one, and neither did anything recorded before the
 * gate existed; refusing to advance those would break hiring rather than
 * improve it. Rejection is never gated — a CV nobody approved is one of the
 * reasons to reject.
 */
function cvBlocksAdvance(
  app: { cvFileUrl?: string; cvStatus?: string },
  newStage: string,
): boolean {
  if (!STAGES_BEHIND_CV_GATE.has(newStage)) return false;
  if (!app.cvFileUrl) return false;
  return app.cvStatus !== 'approved';
}

/** Read an application and confirm it belongs to the caller's organization. */
async function ownedApplication(
  ctx: QueryCtx | MutationCtx,
  scope: OrgScope,
  applicationId: Id<'applications'>,
) {
  const app = await ctx.db.get(applicationId);
  if (!app) throw new Error('Application not found');
  if (!scopeOwnsRecord(scope, app)) throw new Error('Not authorized for this application');
  return app;
}

// ============ QUERIES ============

export const listVacancies = query({
  args: {
    organizationId: v.id('organizations'),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { organizationId, status } = args;
    // Vacancy rows carry pipeline counts, so this is a staff view. The public
    // careers page reads through convex/careers.ts instead.
    const scope = await resolveOrgStaff(ctx, organizationId);
    if (!scope) return [];
    let vacancies;
    if (status) {
      vacancies = await ctx.db
        .query('vacancies')
        .withIndex('by_org_status', (q) =>
          q
            .eq('organizationId', organizationId)
            .eq('status', status as 'draft' | 'open' | 'paused' | 'closed'),
        )
        .order('desc')
        .take(DEFAULT_LIST_CAP);
    } else {
      vacancies = await ctx.db
        .query('vacancies')
        .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
        .order('desc')
        .take(DEFAULT_LIST_CAP);
    }

    const enriched = await Promise.all(
      vacancies.map(async (vac) => {
        const apps = await ctx.db
          .query('applications')
          .withIndex('by_vacancy', (q) => q.eq('vacancyId', vac._id))
          .take(DEFAULT_LIST_CAP);
        const manager = await ctx.db.get(vac.hiringManagerId);
        return {
          ...vac,
          managerName: manager?.name ?? 'Unknown',
          candidateCount: apps.length,
          stageCounts: {
            applied: apps.filter((a) => a.stage === 'applied').length,
            screening: apps.filter((a) => a.stage === 'screening').length,
            interview: apps.filter((a) => a.stage === 'interview').length,
            offer: apps.filter((a) => a.stage === 'offer').length,
            hired: apps.filter((a) => a.stage === 'hired').length,
            rejected: apps.filter((a) => a.stage === 'rejected').length,
          },
        };
      }),
    );

    return enriched;
  },
});

export const getVacancy = query({
  args: { vacancyId: v.id('vacancies') },
  handler: async (ctx, args) => {
    const { vacancyId } = args;
    const vac = await ctx.db.get(vacancyId);
    if (!vac) return null;
    const scope = await resolveOrgStaff(ctx, vac.organizationId);
    if (!scope) return null;
    const manager = await ctx.db.get(vac.hiringManagerId);
    return { ...vac, managerName: manager?.name ?? 'Unknown' };
  },
});

export const listCandidatesByVacancy = query({
  args: {
    vacancyId: v.id('vacancies'),
    stage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { vacancyId, stage } = args;
    // Candidate contact details and CVs — staff of the owning org only.
    const vacancy = await ctx.db.get(vacancyId);
    if (!vacancy) return [];
    const scope = await resolveOrgStaff(ctx, vacancy.organizationId);
    if (!scope) return [];
    let apps;
    if (stage) {
      apps = await ctx.db
        .query('applications')
        .withIndex('by_vacancy_stage', (q) =>
          q
            .eq('vacancyId', vacancyId)
            .eq(
              'stage',
              stage as 'applied' | 'screening' | 'interview' | 'offer' | 'hired' | 'rejected',
            ),
        )
        .take(DEFAULT_LIST_CAP);
    } else {
      apps = await ctx.db
        .query('applications')
        .withIndex('by_vacancy', (q) => q.eq('vacancyId', vacancyId))
        .take(DEFAULT_LIST_CAP);
    }

    const enriched = await Promise.all(
      apps.map(async (app) => {
        const profile = await ctx.db.get(app.candidateId);
        const scorecards = await ctx.db
          .query('interviewScorecards')
          .withIndex('by_application', (q) => q.eq('applicationId', app._id))
          .take(DEFAULT_LIST_CAP);
        const avgScore =
          scorecards.length > 0
            ? Math.round(
                (scorecards.reduce((s, sc) => s + sc.overallScore, 0) / scorecards.length) * 10,
              ) / 10
            : null;
        return {
          ...app,
          candidate: profile,
          scorecardsCount: scorecards.length,
          avgScore,
        };
      }),
    );

    return enriched.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Paginated applications for a vacancy */
export const listApplicationsPaginated = query({
  args: { vacancyId: v.id('vacancies'), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const { vacancyId, paginationOpts } = args;
    const vacancy = await ctx.db.get(vacancyId);
    const scope = vacancy ? await resolveOrgStaff(ctx, vacancy.organizationId) : null;
    if (!scope) return { page: [], isDone: true, continueCursor: '' };
    const result = await ctx.db
      .query('applications')
      .withIndex('by_vacancy', (q) => q.eq('vacancyId', vacancyId))
      .order('desc')
      .paginate(paginationOpts);

    const enriched = await Promise.all(
      result.page.map(async (app) => {
        const profile = await ctx.db.get(app.candidateId);
        return { ...app, candidate: profile };
      }),
    );

    return { ...result, page: enriched };
  },
});

export const getCandidate = query({
  args: { applicationId: v.id('applications') },
  handler: async (ctx, args) => {
    const { applicationId } = args;
    const app = await ctx.db.get(applicationId);
    if (!app) return null;
    const scope = await resolveOrgStaff(ctx, app.organizationId);
    if (!scope) return null;

    const profile = await ctx.db.get(app.candidateId);
    const vacancy = await ctx.db.get(app.vacancyId);

    const interviews = await ctx.db
      .query('interviews')
      .withIndex('by_application', (q) => q.eq('applicationId', applicationId))
      .take(DEFAULT_LIST_CAP);

    const enrichedInterviews = await Promise.all(
      interviews.map(async (iv) => {
        const interviewer = await ctx.db.get(iv.interviewerId);
        return { ...iv, interviewerName: interviewer?.name ?? 'Unknown' };
      }),
    );

    const scorecards = await ctx.db
      .query('interviewScorecards')
      .withIndex('by_application', (q) => q.eq('applicationId', applicationId))
      .take(DEFAULT_LIST_CAP);

    const enrichedScorecards = await Promise.all(
      scorecards.map(async (sc) => {
        const interviewer = await ctx.db.get(sc.interviewerId);
        return { ...sc, interviewerName: interviewer?.name ?? 'Unknown' };
      }),
    );

    const events = await ctx.db
      .query('applicationEvents')
      .withIndex('by_application', (q) => q.eq('applicationId', applicationId))
      .take(DEFAULT_LIST_CAP);

    const enrichedEvents = await Promise.all(
      events.map(async (ev) => {
        const user = await ctx.db.get(ev.changedBy);
        return { ...ev, changedByName: user?.name ?? 'Unknown' };
      }),
    );

    return {
      ...app,
      candidate: profile,
      vacancy,
      interviews: enrichedInterviews.sort((a, b) => b.scheduledAt - a.scheduledAt),
      scorecards: enrichedScorecards.sort((a, b) => b.createdAt - a.createdAt),
      events: enrichedEvents.sort((a, b) => b.createdAt - a.createdAt),
    };
  },
});

export const getMyInterviews = query({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    const { organizationId } = args;
    // "Mine" is the session's, not an id the caller picks: interview notes name
    // the candidate and the interviewer's read on them.
    const scope = await resolveOrgScope(ctx, organizationId);
    if (!scope) return [];
    const userId = scope.caller._id;
    const interviews = await ctx.db
      .query('interviews')
      .withIndex('by_interviewer', (q) => q.eq('interviewerId', userId))
      .take(DEFAULT_LIST_CAP);

    const upcoming = interviews.filter(
      (iv) =>
        iv.organizationId === organizationId &&
        iv.status === 'scheduled' &&
        iv.scheduledAt > Date.now(),
    );

    const enriched = await Promise.all(
      upcoming.map(async (iv) => {
        const app = await ctx.db.get(iv.applicationId);
        const profile = app ? await ctx.db.get(app.candidateId) : null;
        const vacancy = app ? await ctx.db.get(app.vacancyId) : null;
        return {
          ...iv,
          candidateName: profile?.name ?? 'Unknown',
          vacancyTitle: vacancy?.title ?? 'Unknown',
        };
      }),
    );

    return enriched.sort((a, b) => a.scheduledAt - b.scheduledAt);
  },
});

export const getPipelineStats = query({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, args) => {
    const { organizationId } = args;
    const scope = await resolveOrgStaff(ctx, organizationId);
    if (!scope) {
      return {
        openVacancies: 0,
        totalCandidates: 0,
        cvPending: 0,
        pipeline: {
          applied: 0,
          screening: 0,
          interview: 0,
          offer: 0,
          hired: 0,
          rejected: 0,
        },
      };
    }
    const openVacancies = await ctx.db
      .query('vacancies')
      .withIndex('by_org_status', (q) =>
        q.eq('organizationId', organizationId).eq('status', 'open'),
      )
      .take(DEFAULT_LIST_CAP);

    const allApps = await ctx.db
      .query('applications')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(DEFAULT_LIST_CAP);

    return {
      openVacancies: openVacancies.length,
      totalCandidates: allApps.length,
      // How many CVs are waiting on HR — the queue the gate creates.
      cvPending: allApps.filter((a) => a.cvFileUrl && a.cvStatus === 'pending').length,
      pipeline: {
        applied: allApps.filter((a) => a.stage === 'applied').length,
        screening: allApps.filter((a) => a.stage === 'screening').length,
        interview: allApps.filter((a) => a.stage === 'interview').length,
        offer: allApps.filter((a) => a.stage === 'offer').length,
        hired: allApps.filter((a) => a.stage === 'hired').length,
        rejected: allApps.filter((a) => a.stage === 'rejected').length,
      },
    };
  },
});

// ============ MUTATIONS ============

export const createVacancy = mutation({
  args: {
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
    salary: v.optional(v.object({ min: v.number(), max: v.number(), currency: v.string() })),
    hiringManagerId: v.id('users'),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'recruitment');
    await assertFeatureEnabled(ctx, 'recruitment.module');
    const scope = await assertOrgStaff(ctx, args.organizationId);
    const organizationId = scope.organizationId ?? args.organizationId;

    const manager = await ctx.db.get(args.hiringManagerId);
    if (!manager || manager.organizationId !== organizationId) {
      throw new Error('Hiring manager must belong to this organization');
    }

    const now = Date.now();
    return await ctx.db.insert('vacancies', {
      ...args,
      organizationId,
      status: 'open',
      // Attribution comes from the session, never from the caller's arguments.
      createdBy: scope.caller._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateVacancy = mutation({
  args: {
    vacancyId: v.id('vacancies'),
    title: v.optional(v.string()),
    department: v.optional(v.string()),
    location: v.optional(v.string()),
    description: v.optional(v.string()),
    requirements: v.optional(v.string()),
    employmentType: v.optional(
      v.union(
        v.literal('full_time'),
        v.literal('part_time'),
        v.literal('contract'),
        v.literal('internship'),
      ),
    ),
    salary: v.optional(v.object({ min: v.number(), max: v.number(), currency: v.string() })),
    hiringManagerId: v.optional(v.id('users')),
    status: v.optional(
      v.union(v.literal('draft'), v.literal('open'), v.literal('paused'), v.literal('closed')),
    ),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'recruitment');
    await assertFeatureEnabled(ctx, 'recruitment.module');
    const { vacancyId, ...updates } = args;
    const vac = await ctx.db.get(vacancyId);
    if (!vac) throw new Error('Vacancy not found');
    const scope = await assertOrgStaff(ctx, vac.organizationId);
    if (!scopeOwnsRecord(scope, vac)) throw new Error('Not authorized for this vacancy');

    if (updates.hiringManagerId !== undefined) {
      const manager = await ctx.db.get(updates.hiringManagerId);
      if (!manager || manager.organizationId !== vac.organizationId) {
        throw new Error('Hiring manager must belong to this organization');
      }
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (updates.title !== undefined) patch.title = updates.title;
    if (updates.department !== undefined) patch.department = updates.department;
    if (updates.location !== undefined) patch.location = updates.location;
    if (updates.description !== undefined) patch.description = updates.description;
    if (updates.requirements !== undefined) patch.requirements = updates.requirements;
    if (updates.employmentType !== undefined) patch.employmentType = updates.employmentType;
    if (updates.salary !== undefined) patch.salary = updates.salary;
    if (updates.hiringManagerId !== undefined) patch.hiringManagerId = updates.hiringManagerId;
    if (updates.status !== undefined) {
      patch.status = updates.status;
      if (updates.status === 'closed') patch.closedAt = Date.now();
    }

    await ctx.db.patch(vacancyId, patch);
  },
});

/**
 * Remove an application and everything hanging off it.
 *
 * Scorecards used to survive the deletion of the application they scored, and
 * events were found by a full table scan although `by_application` exists.
 */
async function purgeApplication(
  ctx: MutationCtx,
  applicationId: Id<'applications'>,
): Promise<void> {
  const events = await ctx.db
    .query('applicationEvents')
    .withIndex('by_application', (q) => q.eq('applicationId', applicationId))
    .take(DEFAULT_LIST_CAP);
  for (const ev of events) await ctx.db.delete(ev._id);

  const interviews = await ctx.db
    .query('interviews')
    .withIndex('by_application', (q) => q.eq('applicationId', applicationId))
    .take(DEFAULT_LIST_CAP);
  for (const iv of interviews) await ctx.db.delete(iv._id);

  const scorecards = await ctx.db
    .query('interviewScorecards')
    .withIndex('by_application', (q) => q.eq('applicationId', applicationId))
    .take(DEFAULT_LIST_CAP);
  for (const sc of scorecards) await ctx.db.delete(sc._id);

  await ctx.db.delete(applicationId);
}

/** Drop a candidate profile once no application refers to it any more. */
async function purgeOrphanCandidate(
  ctx: MutationCtx,
  candidateId: Id<'candidateProfiles'>,
): Promise<void> {
  const remaining = await ctx.db
    .query('applications')
    .withIndex('by_candidate', (q) => q.eq('candidateId', candidateId))
    .first();
  if (!remaining) await ctx.db.delete(candidateId);
}

export const deleteVacancy = mutation({
  args: { vacancyId: v.id('vacancies') },
  handler: async (ctx, args) => {
    await assertFeatureEnabled(ctx, 'recruitment.module');
    const { vacancyId } = args;
    const vac = await ctx.db.get(vacancyId);
    if (!vac) throw new Error('Vacancy not found');
    const scope = await assertOrgStaff(ctx, vac.organizationId, { adminOnly: true });
    if (!scopeOwnsRecord(scope, vac)) throw new Error('Not authorized for this vacancy');

    const applications = await ctx.db
      .query('applications')
      .withIndex('by_vacancy', (q) => q.eq('vacancyId', vacancyId))
      .take(DEFAULT_LIST_CAP);

    const candidateIds = new Set(applications.map((a) => a.candidateId));
    for (const app of applications) await purgeApplication(ctx, app._id);
    // A profile only exists to be applied with; without applications it is a
    // stranded record of someone's personal data.
    for (const candidateId of candidateIds) await purgeOrphanCandidate(ctx, candidateId);

    await ctx.db.delete(vacancyId);
  },
});

export const deleteCandidate = mutation({
  args: { applicationId: v.id('applications') },
  handler: async (ctx, args) => {
    await assertFeatureEnabled(ctx, 'recruitment.module');
    const { applicationId } = args;
    const scope = await assertOrgScope(ctx);
    const app = await ownedApplication(ctx, scope, applicationId);
    if (!scope.isStaff) throw new Error('Not authorized: staff access required');

    await purgeApplication(ctx, applicationId);
    await purgeOrphanCandidate(ctx, app.candidateId);
  },
});

export const addCandidate = mutation({
  args: {
    organizationId: v.id('organizations'),
    vacancyId: v.id('vacancies'),
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
    /** CV metadata, when HR attaches the file it was sent. */
    cvFileUrl: v.optional(v.string()),
    cvFileName: v.optional(v.string()),
    cvFileSize: v.optional(v.number()),
    cvMimeType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'recruitment');
    await assertFeatureEnabled(ctx, 'recruitment.module');
    const {
      vacancyId,
      name,
      email,
      phone,
      resumeText,
      source,
      referredBy,
      cvFileUrl,
      cvFileName,
      cvFileSize,
      cvMimeType,
    } = args;

    const scope = await assertOrgStaff(ctx, args.organizationId);
    const organizationId = scope.organizationId ?? args.organizationId;
    const createdBy = scope.caller._id;

    const vacancy = await ctx.db.get(vacancyId);
    if (!vacancy || vacancy.organizationId !== organizationId) {
      throw new Error('Vacancy not found in this organization');
    }

    // The career page stores emails lowercased; matching raw here created a
    // second profile for the same person depending on how they typed it.
    const normalizedEmail = email.trim().toLowerCase();

    // Check if candidate profile exists by email
    const existing = await ctx.db
      .query('candidateProfiles')
      .withIndex('by_org_email', (q) =>
        q.eq('organizationId', organizationId).eq('email', normalizedEmail),
      )
      .first();

    const now = Date.now();
    let candidateId;

    if (existing) {
      candidateId = existing._id;
      // A returning candidate usually sends a fresh CV; keeping the old text
      // silently discarded whatever they just wrote.
      if (resumeText && resumeText !== existing.resumeText) {
        await ctx.db.patch(existing._id, { resumeText });
      }
    } else {
      candidateId = await ctx.db.insert('candidateProfiles', {
        organizationId,
        name,
        email: normalizedEmail,
        phone,
        resumeText,
        source,
        referredBy,
        createdBy,
        createdAt: now,
      });
    }

    // One open application per person per vacancy, however it was entered.
    const duplicate = await ctx.db
      .query('applications')
      .withIndex('by_vacancy', (q) => q.eq('vacancyId', vacancyId))
      .filter((q) =>
        q.and(q.eq(q.field('candidateId'), candidateId), q.neq(q.field('stage'), 'rejected')),
      )
      .first();
    if (duplicate) throw new Error('This candidate already has an open application');

    // Create application
    const applicationId = await ctx.db.insert('applications', {
      organizationId,
      candidateId,
      vacancyId,
      stage: 'applied',
      ...(cvFileUrl
        ? {
            cvFileUrl,
            cvFileName,
            cvFileSize,
            cvMimeType,
            cvUploadedAt: now,
            cvStatus: 'pending' as const,
          }
        : {}),
      createdBy,
      createdAt: now,
      updatedAt: now,
    });

    // Record stage event
    await ctx.db.insert('applicationEvents', {
      applicationId,
      organizationId,
      toStage: 'applied',
      changedBy: createdBy,
      createdAt: now,
    });

    // 🔔 Notify org admins about new candidate
    const orgAdmins = await ctx.db
      .query('users')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .filter((q) => q.or(q.eq(q.field('role'), 'admin'), q.eq(q.field('role'), 'superadmin')))
      .take(SMALL_LIST_CAP);

    for (const admin of orgAdmins) {
      if (admin._id === createdBy) continue; // don't notify self
      await notify(ctx, {
        organizationId,
        userId: admin._id,
        type: 'system',
        titleKey: 'notifications.titles.candidateAdded',
        messageKey: 'notifications.messages.candidateAdded',
        params: {
          name,
          vacancyTitle: vacancy?.title || 'vacancy',
          source,
        },
        fallbackTitle: '📩 New Candidate Added',
        fallbackMessage: `${name} was added to "${vacancy?.title || 'vacancy'}" (${source})`,
        relatedId: applicationId,
        route: '/recruitment',
        createdAt: now,
      });
    }

    // 📧 Send application confirmation email
    const candidate = await ctx.db.get(candidateId);
    if (candidate?.email) {
      const applicationDate = new Date(now).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      await ctx.scheduler.runAfter(0, api.recruitmentEmails.sendApplicationConfirmation, {
        candidateEmail: candidate.email,
        candidateName: candidate.name,
        vacancyTitle: vacancy?.title || 'position',
        applicationDate,
      });
    }

    return applicationId;
  },
});

export const moveCandidate = mutation({
  args: {
    applicationId: v.id('applications'),
    newStage: v.union(
      v.literal('applied'),
      v.literal('screening'),
      v.literal('interview'),
      v.literal('offer'),
      v.literal('hired'),
      v.literal('rejected'),
    ),
    userId: v.optional(v.id('users')),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'recruitment');
    await assertFeatureEnabled(ctx, 'recruitment.module');
    const { applicationId, newStage, reason } = args;
    const scope = await assertOrgStaff(ctx, undefined);
    const app = await ownedApplication(ctx, scope, applicationId);
    const userId = scope.caller._id;

    const oldStage = app.stage;
    if (oldStage === newStage) return;

    // The pipeline is a sequence, and nothing enforced it: applied → hired in one
    // move skipped the screening, the interview and the offer, and the events
    // table recorded the jump as if it were normal.
    const allowed = ALLOWED_TRANSITIONS[oldStage] ?? [];
    if (!allowed.includes(newStage)) {
      throw new Error(`Cannot move a candidate from ${oldStage} to ${newStage}`);
    }

    // The CV gate. Anything past screening needs HR to have read the CV.
    if (cvBlocksAdvance(app, newStage)) {
      throw new Error(
        app.cvStatus === 'rejected'
          ? 'The CV was rejected — reopen the review before advancing'
          : 'The CV has not been reviewed yet',
      );
    }

    const now = Date.now();
    const patch: Record<string, unknown> = { stage: newStage, updatedAt: now };
    if (newStage === 'rejected' && reason) patch.rejectionReason = reason;

    await ctx.db.patch(applicationId, patch);

    // Record event
    await ctx.db.insert('applicationEvents', {
      applicationId,
      organizationId: app.organizationId,
      fromStage: oldStage,
      toStage: newStage,
      changedBy: userId,
      reason,
      createdAt: now,
    });

    // 📧 Send email notifications for stage changes
    const candidate = await ctx.db.get(app.candidateId);
    const vacancy = await ctx.db.get(app.vacancyId);

    if (candidate?.email && vacancy) {
      if (newStage === 'offer') {
        // The offer used to leave with invented terms: "To be discussed" instead
        // of the posted range, and hr@company.com — a domain the organization
        // does not own — as the address to reply to.
        const hiringManager = await ctx.db.get(vacancy.hiringManagerId);
        const salary = vacancy.salary
          ? `${vacancy.salary.min.toLocaleString('en-US')}–${vacancy.salary.max.toLocaleString(
              'en-US',
            )} ${vacancy.salary.currency}`
          : 'To be discussed';

        await ctx.scheduler.runAfter(0, api.recruitmentEmails.sendOfferLetter, {
          candidateEmail: candidate.email,
          candidateName: candidate.name,
          vacancyTitle: vacancy.title,
          position: vacancy.title,
          department: vacancy.department ?? 'General',
          startDate: new Date(now + 14 * 86400000).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
          salary,
          offerExpiryDate: new Date(now + 7 * 86400000).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
          contactEmail: hiringManager?.email ?? scope.caller.email,
        });
      } else if (newStage === 'rejected') {
        const rejectionDate = new Date(now).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
        await ctx.scheduler.runAfter(0, api.recruitmentEmails.sendRejectionNotice, {
          candidateEmail: candidate.email,
          candidateName: candidate.name,
          vacancyTitle: vacancy.title,
          rejectionDate,
          feedback: reason,
          encourageReapply: true,
        });
      }
    }
  },
});

export const rejectCandidate = mutation({
  args: {
    applicationId: v.id('applications'),
    userId: v.optional(v.id('users')),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertFeatureEnabled(ctx, 'recruitment.module');
    const { applicationId, reason } = args;
    const scope = await assertOrgStaff(ctx, undefined);
    const app = await ownedApplication(ctx, scope, applicationId);
    const userId = scope.caller._id;
    // Rejecting twice sent the candidate a second "we have decided not to
    // proceed" letter and overwrote the recorded reason with nothing.
    if (app.stage === 'rejected') return;

    const now = Date.now();
    await ctx.db.patch(applicationId, {
      stage: 'rejected',
      // Keep an earlier reason rather than blanking it when none is given.
      ...(reason ? { rejectionReason: reason } : {}),
      updatedAt: now,
    });

    await ctx.db.insert('applicationEvents', {
      applicationId,
      organizationId: app.organizationId,
      fromStage: app.stage,
      toStage: 'rejected',
      changedBy: userId,
      reason,
      createdAt: now,
    });

    // 📧 Send rejection email
    const candidate = await ctx.db.get(app.candidateId);
    const vacancy = await ctx.db.get(app.vacancyId);

    if (candidate?.email && vacancy) {
      const rejectionDate = new Date(now).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      await ctx.scheduler.runAfter(0, api.recruitmentEmails.sendRejectionNotice, {
        candidateEmail: candidate.email,
        candidateName: candidate.name,
        vacancyTitle: vacancy.title,
        rejectionDate,
        feedback: reason,
        encourageReapply: true,
      });
    }
  },
});

export const scheduleInterview = mutation({
  args: {
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
    meetingLink: v.optional(v.string()),
    additionalNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertFeatureEnabled(ctx, 'recruitment.module');
    const scope = await assertOrgStaff(ctx, args.organizationId);
    const app = await ownedApplication(ctx, scope, args.applicationId);
    // Inviting someone who has been rejected, or already hired, is a mistake
    // worth stopping before the email goes out.
    if (app.stage === 'rejected' || app.stage === 'hired') {
      throw new Error(`Cannot schedule an interview for a ${app.stage} application`);
    }
    if (cvBlocksAdvance(app, 'interview')) {
      throw new Error('The CV has not been approved yet');
    }
    const interviewer = await ctx.db.get(args.interviewerId);
    if (!interviewer || interviewer.organizationId !== app.organizationId) {
      throw new Error('Interviewer must belong to this organization');
    }
    if (args.scheduledAt < Date.now())
      throw new Error('Interviews cannot be scheduled in the past');
    if (args.duration <= 0) throw new Error('Interview duration must be positive');

    const interviewId = await ctx.db.insert('interviews', {
      ...args,
      organizationId: app.organizationId,
      status: 'scheduled',
      createdAt: Date.now(),
    });

    // 📧 Send interview invitation email
    {
      const candidate = await ctx.db.get(app.candidateId);
      const vacancy = await ctx.db.get(app.vacancyId);
      const invitedBy = await ctx.db.get(args.interviewerId);

      if (candidate?.email && vacancy) {
        const interviewDate = new Date(args.scheduledAt).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
        const interviewTime = new Date(args.scheduledAt).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
        });

        await ctx.scheduler.runAfter(0, api.recruitmentEmails.sendInterviewInvitation, {
          candidateEmail: candidate.email,
          candidateName: candidate.name,
          vacancyTitle: vacancy.title,
          interviewDate,
          interviewTime,
          interviewType: args.type,
          interviewerName: invitedBy?.name ?? 'HR Team',
          location: args.location,
          meetingLink: args.meetingLink,
          additionalNotes: args.additionalNotes,
        });
      }
    }

    return interviewId;
  },
});

export const updateInterviewStatus = mutation({
  args: {
    interviewId: v.id('interviews'),
    status: v.union(v.literal('completed'), v.literal('cancelled'), v.literal('no_show')),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertFeatureEnabled(ctx, 'recruitment.module');
    const { interviewId, status, notes } = args;
    const interview = await ctx.db.get(interviewId);
    if (!interview) throw new Error('Interview not found');
    const scope = await assertOrgScope(ctx, interview.organizationId);
    // Staff run the pipeline; the interviewer may close out their own slot.
    if (!scope.isStaff && interview.interviewerId !== scope.caller._id) {
      throw new Error('Not authorized for this interview');
    }
    const patch: Record<string, unknown> = { status };
    if (notes !== undefined) patch.notes = notes;
    await ctx.db.patch(interviewId, patch);
  },
});

export const submitScorecard = mutation({
  args: {
    applicationId: v.id('applications'),
    organizationId: v.id('organizations'),
    interviewId: v.optional(v.id('interviews')),
    interviewerId: v.optional(v.id('users')),
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
  },
  handler: async (ctx, args) => {
    await assertFeatureEnabled(ctx, 'recruitment.module');
    const { applicationId, interviewId, ratings, overallScore, recommendation, summary } = args;
    const scope = await assertOrgScope(ctx, args.organizationId);
    const app = await ownedApplication(ctx, scope, applicationId);

    // A scorecard is signed by whoever wrote it. Anyone in the organization may
    // score an interview they took part in; staff may record one either way.
    const interview = interviewId ? await ctx.db.get(interviewId) : null;
    if (interviewId && (!interview || interview.applicationId !== applicationId)) {
      throw new Error('Interview does not belong to this application');
    }
    if (!scope.isStaff && interview?.interviewerId !== scope.caller._id) {
      throw new Error('Not authorized to score this interview');
    }

    // Scores feed the average shown next to a candidate; out-of-range values
    // silently skewed it.
    for (const r of ratings) {
      if (!Number.isFinite(r.score) || r.score < 1 || r.score > 5) {
        throw new Error('Each score must be between 1 and 5');
      }
    }
    if (!Number.isFinite(overallScore) || overallScore < 1 || overallScore > 5) {
      throw new Error('The overall score must be between 1 and 5');
    }

    if (interviewId) {
      await ctx.db.patch(interviewId, { status: 'completed' });
    }

    return await ctx.db.insert('interviewScorecards', {
      applicationId,
      organizationId: app.organizationId,
      interviewId,
      interviewerId: scope.caller._id,
      ratings,
      overallScore,
      recommendation,
      summary,
      createdAt: Date.now(),
    });
  },
});

export const updateCandidateNotes = mutation({
  args: {
    applicationId: v.id('applications'),
    notes: v.string(),
  },
  handler: async (ctx, args) => {
    await assertFeatureEnabled(ctx, 'recruitment.module');
    const { applicationId, notes } = args;
    const scope = await assertOrgStaff(ctx, undefined);
    await ownedApplication(ctx, scope, applicationId);
    await ctx.db.patch(applicationId, { notes, updatedAt: Date.now() });
  },
});

/**
 * HR's decision on the attached CV.
 *
 * This is the gate the first stage exists for: an approval opens the interview
 * and everything after it, a rejection holds the candidate at screening while
 * leaving the reason on the record. Re-reviewing is allowed — a second reader
 * disagrees, or the candidate sends a corrected file.
 */
export const reviewCv = mutation({
  args: {
    applicationId: v.id('applications'),
    decision: v.union(v.literal('approved'), v.literal('rejected'), v.literal('pending')),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertFeatureEnabled(ctx, 'recruitment.module');
    const { applicationId, decision, note } = args;
    const scope = await assertOrgStaff(ctx, undefined);
    const app = await ownedApplication(ctx, scope, applicationId);
    if (!app.cvFileUrl) throw new Error('This application has no CV to review');

    const now = Date.now();
    await ctx.db.patch(applicationId, {
      cvStatus: decision,
      cvReviewedBy: scope.caller._id,
      cvReviewedAt: now,
      cvReviewNote: note,
      updatedAt: now,
    });

    // The review is part of the candidate's history, not a hidden flag.
    await ctx.db.insert('applicationEvents', {
      applicationId,
      organizationId: app.organizationId,
      fromStage: app.stage,
      toStage: app.stage,
      changedBy: scope.caller._id,
      reason: note ? `CV ${decision}: ${note}` : `CV ${decision}`,
      createdAt: now,
    });

    return { cvStatus: decision };
  },
});

/** Applications whose CV is still waiting on a reader. */
export const listCvQueue = query({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, args) => {
    const scope = await resolveOrgStaff(ctx, args.organizationId);
    if (!scope) return [];

    const pending = await ctx.db
      .query('applications')
      .withIndex('by_org_cvStatus', (q) =>
        q.eq('organizationId', args.organizationId).eq('cvStatus', 'pending'),
      )
      .take(DEFAULT_LIST_CAP);

    const enriched = await Promise.all(
      pending.map(async (app) => {
        const candidate = await ctx.db.get(app.candidateId);
        const vacancy = await ctx.db.get(app.vacancyId);
        return {
          _id: app._id,
          stage: app.stage,
          cvFileUrl: app.cvFileUrl,
          cvFileName: app.cvFileName,
          cvUploadedAt: app.cvUploadedAt,
          candidateName: candidate?.name ?? 'Unknown',
          candidateEmail: candidate?.email,
          vacancyTitle: vacancy?.title ?? 'Unknown',
        };
      }),
    );

    return enriched.sort((a, b) => (a.cvUploadedAt ?? 0) - (b.cvUploadedAt ?? 0));
  },
});

export const hireCandidate = mutation({
  args: {
    applicationId: v.id('applications'),
    userId: v.optional(v.id('users')),
    startDate: v.optional(v.number()),
    position: v.optional(v.string()),
    department: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'recruitment');
    await assertFeatureEnabled(ctx, 'recruitment.module');
    const { applicationId, startDate, position, department } = args;
    // Hiring creates a user account with access to the organization, so it is an
    // admin action rather than a staff one.
    const scope = await assertOrgStaff(ctx, undefined, { adminOnly: true });
    const app = await ownedApplication(ctx, scope, applicationId);
    const userId = scope.caller._id;
    if (app.stage === 'hired') throw new Error('Candidate already hired');
    const allowed = ALLOWED_TRANSITIONS[app.stage] ?? [];
    if (!allowed.includes('hired')) {
      throw new Error(`Cannot hire from ${app.stage}`);
    }
    if (cvBlocksAdvance(app, 'hired')) throw new Error('The CV has not been approved yet');

    const now = Date.now();

    // Update application stage
    await ctx.db.patch(applicationId, {
      stage: 'hired',
      updatedAt: now,
    });

    // Record event
    await ctx.db.insert('applicationEvents', {
      applicationId,
      organizationId: app.organizationId,
      fromStage: app.stage,
      toStage: 'hired',
      changedBy: userId,
      createdAt: now,
    });

    // Notify org admins
    const orgAdmins = await ctx.db
      .query('users')
      .withIndex('by_org', (q) => q.eq('organizationId', app.organizationId))
      .filter((q) => q.or(q.eq(q.field('role'), 'admin'), q.eq(q.field('role'), 'superadmin')))
      .take(SMALL_LIST_CAP);

    const candidate = await ctx.db.get(app.candidateId);
    const vacancy = await ctx.db.get(app.vacancyId);

    for (const admin of orgAdmins) {
      if (admin._id === userId) continue;
      await notify(ctx, {
        organizationId: app.organizationId,
        userId: admin._id,
        type: 'system',
        titleKey: 'notifications.titles.newHire',
        messageKey: 'notifications.messages.newHire',
        params: {
          candidateName: candidate?.name || 'Candidate',
          vacancyTitle: vacancy?.title || 'position',
        },
        fallbackTitle: '🎉 New Hire',
        fallbackMessage: `${candidate?.name || 'Candidate'} was hired for "${vacancy?.title || 'position'}"`,
        relatedId: applicationId,
        route: '/onboarding',
        createdAt: now,
      });
    }

    // Auto-trigger onboarding for the new hire
    try {
      const hireDate = startDate || now + 7 * 86400000; // Default: start in 7 days

      // Find or create user account for the candidate
      let employeeId: Id<'users'> | undefined;

      if (candidate?.email) {
        // Check if user already exists with this email
        const existingUser = await ctx.db
          .query('users')
          .withIndex('by_email', (q) => q.eq('email', candidate.email))
          .first();

        if (existingUser) {
          employeeId = existingUser._id;
        } else {
          // Create user account for the new hire. Department/position come from
          // the vacancy as free text, so they are resolved to real org units —
          // otherwise the hire never shows up in department head-counts.
          const units = await resolveOrgUnitsByName(
            ctx,
            app.organizationId,
            {
              department: department || vacancy?.department,
              position: position || vacancy?.title,
            },
            { create: true },
          );
          // A new hire starts with the organization's configured entitlement;
          // this path used to grant zero of everything.
          const balances = await getStartingLeaveBalances(ctx, app.organizationId);

          employeeId = await ctx.db.insert('users', {
            organizationId: app.organizationId,
            name: candidate.name,
            email: candidate.email,
            passwordHash: '', // Will be set via password reset flow
            role: 'employee',
            employeeType: 'staff',
            ...units,
            phone: candidate.phone,
            isActive: true,
            isApproved: true,
            approvedBy: userId,
            approvedAt: now,
            travelAllowance: 0,
            ...balances,
            createdAt: now,
          });
        }
      }

      // Only trigger onboarding if we have a valid employee user ID
      if (employeeId) {
        // A hire starts probation alongside onboarding; the scheduled mutation
        // is defensive and never blocks the hire itself.
        await ctx.scheduler.runAfter(0, internal.probation.autoStartProbation, {
          employeeId,
          createdBy: userId,
        });

        // Find a matching template by department
        const templates = await ctx.db
          .query('onboardingTemplates')
          .withIndex('by_org', (q) => q.eq('organizationId', app.organizationId))
          .filter((q) => q.eq(q.field('isActive'), true))
          .take(SMALL_LIST_CAP);

        let templateId: Id<'onboardingTemplates'> | undefined;
        if (department) {
          const deptTemplate = templates.find((t) => t.department === department);
          if (deptTemplate) templateId = deptTemplate._id;
        }
        if (!templateId && templates.length > 0) {
          templateId = templates[0]!._id; // Fallback to first active template
        }

        // Use vacancy's hiring manager as onboarding manager, or the user who triggered hire
        const managerId = vacancy?.hiringManagerId || userId;

        // Find a buddy (first available employee who isn't the manager or new hire).
        // Cap small: we only need the first match.
        const employees = await ctx.db
          .query('users')
          .withIndex('by_org', (q) => q.eq('organizationId', app.organizationId))
          .filter((q) =>
            q.and(
              q.neq(q.field('_id'), managerId),
              q.neq(q.field('_id'), employeeId),
              q.neq(q.field('role'), 'superadmin'),
            ),
          )
          .take(SMALL_LIST_CAP);

        const buddyId = employees.length > 0 ? employees[0]!._id : undefined;

        await ctx.runMutation(api.onboarding.startOnboarding, {
          organizationId: app.organizationId,
          employeeId,
          templateId,
          startDate: hireDate,
          buddyId,
          managerId,
        });
      }
    } catch (e: unknown) {
      // Don't fail the hire if onboarding setup fails — log and continue
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      if (!errorMessage.includes('already has an active onboarding program')) {
        // Only log non-duplicate errors
        console.warn('Failed to auto-create onboarding program:', errorMessage);
      }
    }

    return { applicationId, candidateId: app.candidateId };
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECURED MUTATIONS — verified identity via ctx.auth
// ═══════════════════════════════════════════════════════════════════════════════

export const secureDeleteVacancy = mutation({
  args: { vacancyId: v.id('vacancies') },
  handler: async (ctx, { vacancyId }) => {
    await assertFeatureEnabled(ctx, 'recruitment.module');
    const vacancy = await ctx.db.get(vacancyId);
    if (!vacancy) throw new Error('Vacancy not found');
    const scope = await assertOrgStaff(ctx, vacancy.organizationId, { adminOnly: true });
    if (!scopeOwnsRecord(scope, vacancy)) throw new Error('Access denied');

    // Deleting the posting used to leave its applications, events, interviews and
    // scorecards behind as unreachable rows of personal data.
    const applications = await ctx.db
      .query('applications')
      .withIndex('by_vacancy', (q) => q.eq('vacancyId', vacancyId))
      .take(DEFAULT_LIST_CAP);
    const candidateIds = new Set(applications.map((a) => a.candidateId));
    for (const app of applications) await purgeApplication(ctx, app._id);
    for (const candidateId of candidateIds) await purgeOrphanCandidate(ctx, candidateId);

    await ctx.db.delete(vacancyId);
  },
});

export const secureDeleteCandidate = mutation({
  args: { applicationId: v.id('applications') },
  handler: async (ctx, { applicationId }) => {
    await assertFeatureEnabled(ctx, 'recruitment.module');
    const scope = await assertOrgStaff(ctx, undefined);
    // The organization check was missing here while its sibling had one, so an
    // authenticated user of one tenant could delete another tenant's candidate.
    const app = await ownedApplication(ctx, scope, applicationId);

    await purgeApplication(ctx, applicationId);
    // The profile is shared between applications; dropping it unconditionally
    // took the other vacancies' candidates with it.
    await purgeOrphanCandidate(ctx, app.candidateId);
  },
});
