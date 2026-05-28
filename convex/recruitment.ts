import { v } from 'convex/values';
import { query, mutation, action } from './_generated/server';
import { paginationOptsValidator } from 'convex/server';
import type { MutationCtx } from './_generated/server';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { withAuth } from './lib/withAuth';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP } from './lib/limits';

// ============ QUERIES ============

export const listVacancies = query({
  args: {
    organizationId: v.id('organizations'),
    status: v.optional(v.string()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { organizationId, status } = args;
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
        const manager = (await ctx.db.get(vac.hiringManagerId)) as any as any;
        return {
          ...vac,
          managerName: manager?.name ?? 'Unknown',
          candidateCount: apps.length,
          stageCounts: {
            applied: apps.filter((a: any) => a.stage === 'applied').length,
            screening: apps.filter((a: any) => a.stage === 'screening').length,
            interview: apps.filter((a: any) => a.stage === 'interview').length,
            offer: apps.filter((a: any) => a.stage === 'offer').length,
            hired: apps.filter((a: any) => a.stage === 'hired').length,
            rejected: apps.filter((a: any) => a.stage === 'rejected').length,
          },
        };
      }),
    );

    return enriched;
  }),
});

export const getVacancy = query({
  args: { vacancyId: v.id('vacancies') },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { vacancyId } = args;
    const vac = (await ctx.db.get(vacancyId)) as any as any;
    if (!vac) return null;
    const manager = (await ctx.db.get(vac.hiringManagerId)) as any as any;
    return { ...vac, managerName: manager?.name ?? 'Unknown' };
  }),
});

export const listCandidatesByVacancy = query({
  args: {
    vacancyId: v.id('vacancies'),
    stage: v.optional(v.string()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { vacancyId, stage } = args;
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
        const profile = (await ctx.db.get(app.candidateId)) as any as any;
        const scorecards = await ctx.db
          .query('interviewScorecards')
          .withIndex('by_application', (q) => q.eq('applicationId', app._id))
          .take(DEFAULT_LIST_CAP);
        const avgScore =
          scorecards.length > 0
            ? Math.round(
                (scorecards.reduce((s: any, sc: any) => s + sc.overallScore, 0) /
                  scorecards.length) *
                  10,
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

    return enriched.sort((a: any, b: any) => b.createdAt - a.createdAt);
  }),
});

/** Paginated applications for a vacancy */
export const listApplicationsPaginated = query({
  args: { vacancyId: v.id('vacancies'), paginationOpts: paginationOptsValidator },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { vacancyId, paginationOpts } = args;
    const result = await ctx.db
      .query('applications')
      .withIndex('by_vacancy', (q) => q.eq('vacancyId', vacancyId))
      .order('desc')
      .paginate(paginationOpts);

    const enriched = await Promise.all(
      result.page.map(async (app) => {
        const profile = (await ctx.db.get(app.candidateId)) as any as any;
        return { ...app, candidate: profile };
      }),
    );

    return { ...result, page: enriched };
  }),
});

export const getCandidate = query({
  args: { applicationId: v.id('applications') },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { applicationId } = args;
    const app = (await ctx.db.get(applicationId)) as any as any;
    if (!app) return null;

    const profile = (await ctx.db.get(app.candidateId)) as any as any;
    const vacancy = (await ctx.db.get(app.vacancyId)) as any as any;

    const interviews = await ctx.db
      .query('interviews')
      .withIndex('by_application', (q) => q.eq('applicationId', applicationId))
      .take(DEFAULT_LIST_CAP);

    const enrichedInterviews = await Promise.all(
      interviews.map(async (iv) => {
        const interviewer = (await ctx.db.get(iv.interviewerId)) as any as any;
        return { ...iv, interviewerName: interviewer?.name ?? 'Unknown' };
      }),
    );

    const scorecards = await ctx.db
      .query('interviewScorecards')
      .withIndex('by_application', (q) => q.eq('applicationId', applicationId))
      .take(DEFAULT_LIST_CAP);

    const enrichedScorecards = await Promise.all(
      scorecards.map(async (sc) => {
        const interviewer = (await ctx.db.get(sc.interviewerId)) as any as any;
        return { ...sc, interviewerName: interviewer?.name ?? 'Unknown' };
      }),
    );

    const events = await ctx.db
      .query('applicationEvents')
      .withIndex('by_application', (q) => q.eq('applicationId', applicationId))
      .take(DEFAULT_LIST_CAP);

    const enrichedEvents = await Promise.all(
      events.map(async (ev) => {
        const user = (await ctx.db.get(ev.changedBy)) as any as any;
        return { ...ev, changedByName: user?.name ?? 'Unknown' };
      }),
    );

    return {
      ...app,
      candidate: profile,
      vacancy,
      interviews: enrichedInterviews.sort((a: any, b: any) => b.scheduledAt - a.scheduledAt),
      scorecards: enrichedScorecards.sort((a: any, b: any) => b.createdAt - a.createdAt),
      events: enrichedEvents.sort((a: any, b: any) => b.createdAt - a.createdAt),
    };
  }),
});

export const getMyInterviews = query({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { organizationId, userId } = args;
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
        const app = (await ctx.db.get(iv.applicationId)) as any as any;
        const profile = app ? ((await ctx.db.get(app.candidateId)) as any as any) : null;
        const vacancy = app ? ((await ctx.db.get(app.vacancyId)) as any as any) : null;
        return {
          ...iv,
          candidateName: profile?.name ?? 'Unknown',
          vacancyTitle: vacancy?.title ?? 'Unknown',
        };
      }),
    );

    return enriched.sort((a: any, b: any) => a.scheduledAt - b.scheduledAt);
  }),
});

export const getPipelineStats = query({
  args: { organizationId: v.id('organizations') },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { organizationId } = args;
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
      pipeline: {
        applied: allApps.filter((a: any) => a.stage === 'applied').length,
        screening: allApps.filter((a: any) => a.stage === 'screening').length,
        interview: allApps.filter((a: any) => a.stage === 'interview').length,
        offer: allApps.filter((a: any) => a.stage === 'offer').length,
        hired: allApps.filter((a: any) => a.stage === 'hired').length,
        rejected: allApps.filter((a: any) => a.stage === 'rejected').length,
      },
    };
  }),
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
    createdBy: v.id('users'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const now = Date.now();
    return await ctx.db.insert('vacancies', {
      ...args,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    });
  }),
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
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { vacancyId, ...updates } = args;
    const vac = (await ctx.db.get(vacancyId)) as any as any;
    if (!vac) throw new Error('Vacancy not found');

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
  }),
});

export const deleteVacancy = mutation({
  args: { vacancyId: v.id('vacancies') },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { vacancyId } = args;
    const vac = (await ctx.db.get(vacancyId)) as any as any;
    if (!vac) throw new Error('Vacancy not found');

    // Delete all related applications and events
    const applications = await ctx.db
      .query('applications')
      .withIndex('by_vacancy', (q) => q.eq('vacancyId', vacancyId))
      .take(DEFAULT_LIST_CAP);

    for (const app of applications) {
      // Delete application events (no by_application index — inline filter;
      // TODO: add index for cleaner cascade).
      const events = await ctx.db
        .query('applicationEvents')
        .filter((q: any) => q.eq(q.field('applicationId'), app._id))
        .take(SMALL_LIST_CAP);
      for (const ev of events) {
        await ctx.db.delete(ev._id);
      }
      await ctx.db.delete(app._id);
    }

    // Delete interviews for this vacancy (via applications)
    for (const app of applications) {
      const interviews = await ctx.db
        .query('interviews')
        .withIndex('by_application', (q) => q.eq('applicationId', app._id))
        .take(SMALL_LIST_CAP);
      for (const interview of interviews) {
        await ctx.db.delete(interview._id);
      }
    }

    await ctx.db.delete(vacancyId);
  }),
});

export const deleteCandidate = mutation({
  args: { applicationId: v.id('applications') },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { applicationId } = args;
    const app = (await ctx.db.get(applicationId)) as any as any;
    if (!app) throw new Error('Application not found');

    // Delete application events
    const events = await ctx.db
      .query('applicationEvents')
      .filter((q: any) => q.eq(q.field('applicationId'), applicationId))
      .take(SMALL_LIST_CAP);
    for (const ev of events) {
      await ctx.db.delete(ev._id);
    }

    // Delete interviews for this application
    const interviews = await ctx.db
      .query('interviews')
      .filter((q: any) => q.eq(q.field('applicationId'), applicationId))
      .take(SMALL_LIST_CAP);
    for (const interview of interviews) {
      await ctx.db.delete(interview._id);
    }

    // Delete the application
    await ctx.db.delete(applicationId);

    // Check if candidate has other applications — if not, delete profile too
    const otherApps = await ctx.db
      .query('applications')
      .filter((q: any) => q.eq(q.field('candidateId'), app.candidateId))
      .first();

    if (!otherApps) {
      await ctx.db.delete(app.candidateId);
    }
  }),
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
    createdBy: v.id('users'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const {
      vacancyId,
      name,
      email,
      phone,
      resumeText,
      source,
      referredBy,
      organizationId,
      createdBy,
    } = args;

    // Check if candidate profile exists by email
    const existing = await ctx.db
      .query('candidateProfiles')
      .withIndex('by_org_email', (q) => q.eq('organizationId', organizationId).eq('email', email))
      .first();

    const now = Date.now();
    let candidateId;

    if (existing) {
      candidateId = existing._id;
    } else {
      candidateId = await ctx.db.insert('candidateProfiles', {
        organizationId,
        name,
        email,
        phone,
        resumeText,
        source,
        referredBy,
        createdBy,
        createdAt: now,
      });
    }

    // Create application
    const applicationId = await ctx.db.insert('applications', {
      organizationId,
      candidateId,
      vacancyId,
      stage: 'applied',
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
      .filter((q: any) => q.or(q.eq(q.field('role'), 'admin'), q.eq(q.field('role'), 'superadmin')))
      .take(SMALL_LIST_CAP);

    const vacancy = (await ctx.db.get(vacancyId)) as any as any;
    for (const admin of orgAdmins) {
      if (admin._id === createdBy) continue; // don't notify self
      await ctx.db.insert('notifications', {
        organizationId,
        userId: admin._id,
        type: 'system',
        title: '📩 New Candidate Added',
        message: `${name} was added to "${vacancy?.title || 'vacancy'}" (${source})`,
        isRead: false,
        relatedId: applicationId,
        route: '/recruitment',
        createdAt: now,
      });
    }

    // 📧 Send application confirmation email
    const candidate = (await ctx.db.get(candidateId)) as any as any;
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
  }),
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
    userId: v.id('users'),
    reason: v.optional(v.string()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { applicationId, newStage, userId, reason } = args;
    const app = (await ctx.db.get(applicationId)) as any as any;
    if (!app) throw new Error('Application not found');

    const oldStage = app.stage;
    if (oldStage === newStage) return;

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
    const candidate = (await ctx.db.get(app.candidateId)) as any as any;
    const vacancy = (await ctx.db.get(app.vacancyId)) as any as any;

    if (candidate?.email && vacancy) {
      if (newStage === 'offer') {
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
          salary: 'To be discussed',
          offerExpiryDate: new Date(now + 7 * 86400000).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
          contactEmail: 'hr@company.com',
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
  }),
});

export const rejectCandidate = mutation({
  args: {
    applicationId: v.id('applications'),
    userId: v.id('users'),
    reason: v.optional(v.string()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { applicationId, userId, reason } = args;
    const app = (await ctx.db.get(applicationId)) as any as any;
    if (!app) throw new Error('Application not found');

    const now = Date.now();
    await ctx.db.patch(applicationId, {
      stage: 'rejected',
      rejectionReason: reason,
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
    const candidate = (await ctx.db.get(app.candidateId)) as any as any;
    const vacancy = (await ctx.db.get(app.vacancyId)) as any as any;

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
  }),
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
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const interviewId = await ctx.db.insert('interviews', {
      ...args,
      status: 'scheduled',
      createdAt: Date.now(),
    });

    // 📧 Send interview invitation email
    const app = (await ctx.db.get(args.applicationId)) as any as any;
    if (app) {
      const candidate = (await ctx.db.get(app.candidateId)) as any as any;
      const vacancy = (await ctx.db.get(app.vacancyId)) as any as any;
      const interviewer = (await ctx.db.get(args.interviewerId)) as any as any;

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
          interviewerName: interviewer?.name ?? 'HR Team',
          location: args.location,
          meetingLink: args.meetingLink,
          additionalNotes: args.additionalNotes,
        });
      }
    }

    return interviewId;
  }),
});

export const updateInterviewStatus = mutation({
  args: {
    interviewId: v.id('interviews'),
    status: v.union(v.literal('completed'), v.literal('cancelled'), v.literal('no_show')),
    notes: v.optional(v.string()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { interviewId, status, notes } = args;
    const patch: Record<string, unknown> = { status };
    if (notes !== undefined) patch.notes = notes;
    await ctx.db.patch(interviewId, patch);
  }),
});

export const submitScorecard = mutation({
  args: {
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
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    // Mark interview as completed if linked
    if (args.interviewId) {
      await ctx.db.patch(args.interviewId, { status: 'completed' });
    }

    return await ctx.db.insert('interviewScorecards', {
      ...args,
      createdAt: Date.now(),
    });
  }),
});

export const updateCandidateNotes = mutation({
  args: {
    applicationId: v.id('applications'),
    notes: v.string(),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { applicationId, notes } = args;
    await ctx.db.patch(applicationId, { notes, updatedAt: Date.now() });
  }),
});

export const hireCandidate = mutation({
  args: {
    applicationId: v.id('applications'),
    userId: v.id('users'),
    startDate: v.optional(v.number()),
    position: v.optional(v.string()),
    department: v.optional(v.string()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { applicationId, userId, startDate, position, department } = args;
    const app = (await ctx.db.get(applicationId)) as any as any;
    if (!app) throw new Error('Application not found');
    if (app.stage === 'hired') throw new Error('Candidate already hired');

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
      .filter((q: any) => q.or(q.eq(q.field('role'), 'admin'), q.eq(q.field('role'), 'superadmin')))
      .take(SMALL_LIST_CAP);

    const candidate = (await ctx.db.get(app.candidateId)) as any as any;
    const vacancy = (await ctx.db.get(app.vacancyId)) as any as any;

    for (const admin of orgAdmins) {
      if (admin._id === userId) continue;
      await ctx.db.insert('notifications', {
        organizationId: app.organizationId,
        userId: admin._id,
        type: 'system',
        title: '🎉 New Hire',
        message: `${candidate?.name || 'Candidate'} was hired for "${vacancy?.title || 'position'}"`,
        isRead: false,
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
          // Create user account for the new hire
          employeeId = await ctx.db.insert('users', {
            organizationId: app.organizationId,
            name: candidate.name,
            email: candidate.email,
            passwordHash: '', // Will be set via password reset flow
            role: 'employee',
            employeeType: 'staff',
            department: department || vacancy?.department,
            position: position || vacancy?.title,
            phone: candidate.phone,
            isActive: true,
            isApproved: true,
            approvedBy: userId,
            approvedAt: now,
            travelAllowance: 0,
            paidLeaveBalance: 0,
            sickLeaveBalance: 0,
            familyLeaveBalance: 0,
            createdAt: now,
          });
        }
      }

      // Only trigger onboarding if we have a valid employee user ID
      if (employeeId) {
        // Find a matching template by department
        const templates = await ctx.db
          .query('onboardingTemplates')
          .withIndex('by_org', (q) => q.eq('organizationId', app.organizationId))
          .filter((q: any) => q.eq(q.field('isActive'), true))
          .take(SMALL_LIST_CAP);

        let templateId: Id<'onboardingTemplates'> | undefined;
        if (department) {
          const deptTemplate = templates.find((t: any) => t.department === department);
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
          .filter((q: any) =>
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
          createdBy: userId,
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
  }),
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECURED MUTATIONS — verified identity via ctx.auth
// ═══════════════════════════════════════════════════════════════════════════════

export const secureDeleteVacancy = mutation({
  args: { vacancyId: v.id('vacancies') },
  handler: withAuth<MutationCtx, { vacancyId: Id<'vacancies'> }, void>(
    { minimumRole: 'admin' },
    async (ctx, { vacancyId }, caller) => {
      const vacancy = (await ctx.db.get(vacancyId)) as any as any as any;
      if (!vacancy) throw new Error('Vacancy not found');
      if (caller.role !== 'superadmin' && caller.organizationId !== vacancy.organizationId) {
        throw new Error('Access denied');
      }
      await ctx.db.delete(vacancyId);
    },
  ),
});

export const secureDeleteCandidate = mutation({
  args: { applicationId: v.id('applications') },
  handler: withAuth<MutationCtx, { applicationId: Id<'applications'> }, void>(
    { minimumRole: 'admin' },
    async (ctx, { applicationId }, caller) => {
      const app = (await ctx.db.get(applicationId)) as any as any as any;
      if (!app) throw new Error('Application not found');
      if (app.candidateId) await ctx.db.delete(app.candidateId);
      await ctx.db.delete(applicationId);
    },
  ),
});
