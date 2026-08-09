/**
 * Integration tests for convex/recruitment.ts.
 *
 * The module had no authorization at all: every function took the acting user as
 * an argument, so an unauthenticated caller could read every candidate's contact
 * details and CV, move people through the pipeline, send offers and rejections in
 * the company's name, and create an approved employee account. It also let the
 * pipeline be skipped — applied straight to hired — which is what the CV gate
 * depends on being impossible.
 *
 * These tests cover the promises that replaced all that: the session is the
 * actor, one organization cannot touch another's, stages advance in order, and an
 * attached CV holds a candidate at screening until HR has read it.
 */
import { describe, it, expect } from '@jest/globals';
import { convexTest } from 'convex-test';

import schema from '../../convex/schema';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

const modules = {
  './_generated/api.ts': () => import('../../convex/_generated/api'),
  './recruitment.ts': () => import('../../convex/recruitment'),
  './careers.ts': () => import('../../convex/careers'),
} as unknown as Record<string, () => Promise<unknown>>;

const BASE_USER = {
  passwordHash: 'x',
  employeeType: 'staff' as const,
  isActive: true,
  isApproved: true,
  travelAllowance: 0,
  paidLeaveBalance: 0,
  sickLeaveBalance: 0,
  familyLeaveBalance: 0,
  createdAt: Date.now(),
};

async function seed() {
  const t = convexTest(schema, modules);

  const ids = await t.run(async (ctx) => {
    const organizationId = await ctx.db.insert('organizations', {
      name: 'Acme',
      slug: `acme-${Math.random().toString(36).slice(2)}`,
      plan: 'professional',
      isActive: true,
      createdBySuperadmin: false,
      employeeLimit: 100,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as never);
    const otherOrgId = await ctx.db.insert('organizations', {
      name: 'Globex',
      slug: `globex-${Math.random().toString(36).slice(2)}`,
      plan: 'professional',
      isActive: true,
      createdBySuperadmin: false,
      employeeLimit: 100,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as never);

    const adminId = await ctx.db.insert('users', {
      ...BASE_USER,
      organizationId,
      name: 'Admin',
      email: 'admin@acme.test',
      role: 'admin',
    });
    const employeeId = await ctx.db.insert('users', {
      ...BASE_USER,
      organizationId,
      name: 'Anna',
      email: 'anna@acme.test',
      role: 'employee',
    });
    const outsiderAdminId = await ctx.db.insert('users', {
      ...BASE_USER,
      organizationId: otherOrgId,
      name: 'Outsider',
      email: 'outsider@globex.test',
      role: 'admin',
    });

    const vacancyId = await ctx.db.insert('vacancies', {
      organizationId,
      title: 'Backend Developer',
      employmentType: 'full_time',
      description: 'Build things',
      status: 'open',
      salary: { min: 500_000, max: 900_000, currency: 'AMD' },
      hiringManagerId: adminId,
      createdBy: adminId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as never);

    return { organizationId, otherOrgId, adminId, employeeId, outsiderAdminId, vacancyId };
  });

  return {
    t,
    asAdmin: t.withIdentity({ email: 'admin@acme.test' }),
    asEmployee: t.withIdentity({ email: 'anna@acme.test' }),
    asOutsider: t.withIdentity({ email: 'outsider@globex.test' }),
    ...ids,
  };
}

type Ctx = Awaited<ReturnType<typeof seed>>;

/** An application, optionally with a CV in a given review state. */
async function addApplication(
  ctx: Ctx,
  opts: { cv?: 'pending' | 'approved' | 'rejected' | 'none'; stage?: string; email?: string } = {},
) {
  const { cv = 'none', stage = 'applied', email = 'candidate@example.test' } = opts;

  return await ctx.t.run(async (dbCtx) => {
    const candidateId = await dbCtx.db.insert('candidateProfiles', {
      organizationId: ctx.organizationId,
      name: 'Candidate',
      email,
      source: 'career_page',
      createdBy: ctx.adminId,
      createdAt: Date.now(),
    } as never);

    const applicationId = await dbCtx.db.insert('applications', {
      organizationId: ctx.organizationId,
      candidateId,
      vacancyId: ctx.vacancyId,
      stage,
      ...(cv === 'none'
        ? {}
        : {
            cvFileUrl: 'https://res.cloudinary.com/demo/raw/upload/cv.pdf',
            cvFileName: 'cv.pdf',
            cvMimeType: 'application/pdf',
            cvUploadedAt: Date.now(),
            cvStatus: cv,
          }),
      createdBy: ctx.adminId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as never);

    return { applicationId, candidateId };
  });
}

async function stageOf(ctx: Ctx, applicationId: Id<'applications'>) {
  return await ctx.t.run(async (dbCtx) => (await dbCtx.db.get(applicationId))?.stage);
}

describe('recruitment — who may act', () => {
  it('tells an unauthenticated reader nothing', async () => {
    const ctx = await seed();
    await addApplication(ctx);

    expect(
      await ctx.t.query(api.recruitment.listVacancies, { organizationId: ctx.organizationId }),
    ).toEqual([]);
    expect(
      await ctx.t.query(api.recruitment.getPipelineStats, { organizationId: ctx.organizationId }),
    ).toMatchObject({ openVacancies: 0, totalCandidates: 0 });
  });

  it('keeps candidate contact details away from ordinary employees', async () => {
    const ctx = await seed();
    const { applicationId } = await addApplication(ctx);

    expect(await ctx.asEmployee.query(api.recruitment.getCandidate, { applicationId })).toBeNull();
    expect(
      await ctx.asEmployee.query(api.recruitment.listCandidatesByVacancy, {
        vacancyId: ctx.vacancyId,
      }),
    ).toEqual([]);
  });

  it('refuses an unauthenticated move', async () => {
    const ctx = await seed();
    const { applicationId } = await addApplication(ctx);

    await expect(
      ctx.t.mutation(api.recruitment.moveCandidate, { applicationId, newStage: 'screening' }),
    ).rejects.toThrow();
    expect(await stageOf(ctx, applicationId)).toBe('applied');
  });

  it('refuses another organization staff, even an admin', async () => {
    const ctx = await seed();
    const { applicationId } = await addApplication(ctx);

    await expect(
      ctx.asOutsider.mutation(api.recruitment.moveCandidate, {
        applicationId,
        newStage: 'screening',
      }),
    ).rejects.toThrow();
    await expect(
      ctx.asOutsider.mutation(api.recruitment.secureDeleteCandidate, { applicationId }),
    ).rejects.toThrow();
    expect(await stageOf(ctx, applicationId)).toBe('applied');
  });

  it('records the session as the actor, not whatever id was passed', async () => {
    const ctx = await seed();
    const { applicationId } = await addApplication(ctx);

    // The old signature took `userId`; passing someone else's must not forge the
    // audit trail.
    await ctx.asAdmin.mutation(api.recruitment.moveCandidate, {
      applicationId,
      newStage: 'screening',
      userId: ctx.employeeId,
    });

    const events = await ctx.t.run(async (dbCtx) =>
      dbCtx.db
        .query('applicationEvents')
        .withIndex('by_application', (q) => q.eq('applicationId', applicationId))
        .collect(),
    );
    const move = events.find((e) => e.toStage === 'screening');
    expect(move?.changedBy).toBe(ctx.adminId);
  });

  it('lets only an admin hire', async () => {
    const ctx = await seed();
    const { applicationId } = await addApplication(ctx, { stage: 'offer' });

    await expect(
      ctx.asEmployee.mutation(api.recruitment.hireCandidate, { applicationId }),
    ).rejects.toThrow();
  });
});

describe('recruitment — stage order', () => {
  it('refuses to skip the pipeline', async () => {
    const ctx = await seed();
    const { applicationId } = await addApplication(ctx);

    await expect(
      ctx.asAdmin.mutation(api.recruitment.moveCandidate, { applicationId, newStage: 'hired' }),
    ).rejects.toThrow();
    await expect(
      ctx.asAdmin.mutation(api.recruitment.moveCandidate, { applicationId, newStage: 'offer' }),
    ).rejects.toThrow();
    expect(await stageOf(ctx, applicationId)).toBe('applied');
  });

  it('allows the ordinary step forward', async () => {
    const ctx = await seed();
    const { applicationId } = await addApplication(ctx);

    await ctx.asAdmin.mutation(api.recruitment.moveCandidate, {
      applicationId,
      newStage: 'screening',
    });
    expect(await stageOf(ctx, applicationId)).toBe('screening');
  });

  it('allows a rejection from any active stage', async () => {
    const ctx = await seed();
    const { applicationId } = await addApplication(ctx, { stage: 'interview' });

    await ctx.asAdmin.mutation(api.recruitment.moveCandidate, {
      applicationId,
      newStage: 'rejected',
      reason: 'Not a fit',
    });
    expect(await stageOf(ctx, applicationId)).toBe('rejected');
  });

  it('allows a rejection to be reopened but not turned straight into a hire', async () => {
    const ctx = await seed();
    const { applicationId } = await addApplication(ctx, { stage: 'rejected' });

    await expect(
      ctx.asAdmin.mutation(api.recruitment.moveCandidate, { applicationId, newStage: 'hired' }),
    ).rejects.toThrow();

    await ctx.asAdmin.mutation(api.recruitment.moveCandidate, {
      applicationId,
      newStage: 'screening',
    });
    expect(await stageOf(ctx, applicationId)).toBe('screening');
  });

  it('does not reject twice or blank an existing reason', async () => {
    const ctx = await seed();
    const { applicationId } = await addApplication(ctx, { stage: 'screening' });

    await ctx.asAdmin.mutation(api.recruitment.rejectCandidate, {
      applicationId,
      reason: 'Withdrew',
    });
    // A second click used to send another rejection letter and erase the reason.
    await ctx.asAdmin.mutation(api.recruitment.rejectCandidate, { applicationId });

    const app = await ctx.t.run(async (dbCtx) => dbCtx.db.get(applicationId));
    expect(app?.rejectionReason).toBe('Withdrew');

    const events = await ctx.t.run(async (dbCtx) =>
      dbCtx.db
        .query('applicationEvents')
        .withIndex('by_application', (q) => q.eq('applicationId', applicationId))
        .collect(),
    );
    expect(events.filter((e) => e.toStage === 'rejected')).toHaveLength(1);
  });
});

describe('recruitment — the CV gate', () => {
  it('holds a candidate at screening until the CV is approved', async () => {
    const ctx = await seed();
    const { applicationId } = await addApplication(ctx, { cv: 'pending' });

    // Screening is where the CV is read, so getting there is allowed.
    await ctx.asAdmin.mutation(api.recruitment.moveCandidate, {
      applicationId,
      newStage: 'screening',
    });
    await expect(
      ctx.asAdmin.mutation(api.recruitment.moveCandidate, { applicationId, newStage: 'interview' }),
    ).rejects.toThrow(/CV/);
    expect(await stageOf(ctx, applicationId)).toBe('screening');
  });

  it('opens the rest of the pipeline once HR approves', async () => {
    const ctx = await seed();
    const { applicationId } = await addApplication(ctx, { cv: 'pending', stage: 'screening' });

    await ctx.asAdmin.mutation(api.recruitment.reviewCv, { applicationId, decision: 'approved' });
    await ctx.asAdmin.mutation(api.recruitment.moveCandidate, {
      applicationId,
      newStage: 'interview',
    });

    expect(await stageOf(ctx, applicationId)).toBe('interview');
  });

  it('keeps a rejected CV closed until the review is reopened', async () => {
    const ctx = await seed();
    const { applicationId } = await addApplication(ctx, { cv: 'pending', stage: 'screening' });

    await ctx.asAdmin.mutation(api.recruitment.reviewCv, {
      applicationId,
      decision: 'rejected',
      note: 'No relevant experience',
    });
    await expect(
      ctx.asAdmin.mutation(api.recruitment.moveCandidate, { applicationId, newStage: 'interview' }),
    ).rejects.toThrow(/CV/);

    await ctx.asAdmin.mutation(api.recruitment.reviewCv, { applicationId, decision: 'approved' });
    await ctx.asAdmin.mutation(api.recruitment.moveCandidate, {
      applicationId,
      newStage: 'interview',
    });
    expect(await stageOf(ctx, applicationId)).toBe('interview');
  });

  it('never blocks a rejection', async () => {
    const ctx = await seed();
    const { applicationId } = await addApplication(ctx, { cv: 'pending', stage: 'screening' });

    // An unapproved CV is a reason to reject, so the gate must not stand in the way.
    await ctx.asAdmin.mutation(api.recruitment.moveCandidate, {
      applicationId,
      newStage: 'rejected',
    });
    expect(await stageOf(ctx, applicationId)).toBe('rejected');
  });

  it('does not strand an application that has no CV', async () => {
    const ctx = await seed();
    const { applicationId } = await addApplication(ctx, { cv: 'none', stage: 'screening' });

    // Referrals HR types in by hand, and everything recorded before the gate.
    await ctx.asAdmin.mutation(api.recruitment.moveCandidate, {
      applicationId,
      newStage: 'interview',
    });
    expect(await stageOf(ctx, applicationId)).toBe('interview');
  });

  it('writes the review into the candidate history', async () => {
    const ctx = await seed();
    const { applicationId } = await addApplication(ctx, { cv: 'pending' });

    await ctx.asAdmin.mutation(api.recruitment.reviewCv, {
      applicationId,
      decision: 'approved',
      note: 'Strong background',
    });

    const app = await ctx.t.run(async (dbCtx) => dbCtx.db.get(applicationId));
    expect(app?.cvStatus).toBe('approved');
    expect(app?.cvReviewedBy).toBe(ctx.adminId);
    expect(app?.cvReviewNote).toBe('Strong background');

    const events = await ctx.t.run(async (dbCtx) =>
      dbCtx.db
        .query('applicationEvents')
        .withIndex('by_application', (q) => q.eq('applicationId', applicationId))
        .collect(),
    );
    expect(events.some((e) => e.reason?.includes('CV approved'))).toBe(true);
  });

  it('has nothing to review when no CV was attached', async () => {
    const ctx = await seed();
    const { applicationId } = await addApplication(ctx, { cv: 'none' });

    await expect(
      ctx.asAdmin.mutation(api.recruitment.reviewCv, { applicationId, decision: 'approved' }),
    ).rejects.toThrow();
  });

  it('lists the CVs waiting on someone, oldest first', async () => {
    const ctx = await seed();
    await addApplication(ctx, { cv: 'pending', email: 'first@example.test' });
    await addApplication(ctx, { cv: 'approved', email: 'second@example.test' });

    const queue = (await ctx.asAdmin.query(api.recruitment.listCvQueue, {
      organizationId: ctx.organizationId,
    })) as Array<{ candidateEmail?: string }>;

    expect(queue).toHaveLength(1);
    expect(queue[0]!.candidateEmail).toBe('first@example.test');
    expect(
      await ctx.asEmployee.query(api.recruitment.listCvQueue, {
        organizationId: ctx.organizationId,
      }),
    ).toEqual([]);
  });

  it('counts the waiting CVs in the pipeline stats', async () => {
    const ctx = await seed();
    await addApplication(ctx, { cv: 'pending', email: 'a@example.test' });
    await addApplication(ctx, { cv: 'pending', email: 'b@example.test' });
    await addApplication(ctx, { cv: 'none', email: 'c@example.test' });

    const stats = (await ctx.asAdmin.query(api.recruitment.getPipelineStats, {
      organizationId: ctx.organizationId,
    })) as { cvPending: number; totalCandidates: number };

    expect(stats.cvPending).toBe(2);
    expect(stats.totalCandidates).toBe(3);
  });
});

describe('recruitment — interviews', () => {
  it('will not invite someone whose CV is unread', async () => {
    const ctx = await seed();
    const { applicationId } = await addApplication(ctx, { cv: 'pending', stage: 'screening' });

    await expect(
      ctx.asAdmin.mutation(api.recruitment.scheduleInterview, {
        applicationId,
        organizationId: ctx.organizationId,
        interviewerId: ctx.adminId,
        scheduledAt: Date.now() + 86_400_000,
        duration: 60,
        type: 'video',
      }),
    ).rejects.toThrow(/CV/);
  });

  it('will not invite a rejected candidate', async () => {
    const ctx = await seed();
    const { applicationId } = await addApplication(ctx, { stage: 'rejected' });

    await expect(
      ctx.asAdmin.mutation(api.recruitment.scheduleInterview, {
        applicationId,
        organizationId: ctx.organizationId,
        interviewerId: ctx.adminId,
        scheduledAt: Date.now() + 86_400_000,
        duration: 60,
        type: 'video',
      }),
    ).rejects.toThrow();
  });

  it('refuses an interviewer from another organization and a date in the past', async () => {
    const ctx = await seed();
    const { applicationId } = await addApplication(ctx, { stage: 'screening' });

    await expect(
      ctx.asAdmin.mutation(api.recruitment.scheduleInterview, {
        applicationId,
        organizationId: ctx.organizationId,
        interviewerId: ctx.outsiderAdminId,
        scheduledAt: Date.now() + 86_400_000,
        duration: 60,
        type: 'video',
      }),
    ).rejects.toThrow();

    await expect(
      ctx.asAdmin.mutation(api.recruitment.scheduleInterview, {
        applicationId,
        organizationId: ctx.organizationId,
        interviewerId: ctx.adminId,
        scheduledAt: Date.now() - 86_400_000,
        duration: 60,
        type: 'video',
      }),
    ).rejects.toThrow();
  });

  it('stores the meeting link the invitation promises', async () => {
    const ctx = await seed();
    const { applicationId } = await addApplication(ctx, { cv: 'approved', stage: 'screening' });

    const interviewId = (await ctx.asAdmin.mutation(api.recruitment.scheduleInterview, {
      applicationId,
      organizationId: ctx.organizationId,
      interviewerId: ctx.adminId,
      scheduledAt: Date.now() + 86_400_000,
      duration: 45,
      type: 'video',
      meetingLink: 'https://meet.example.test/abc',
      additionalNotes: 'Bring a portfolio',
    })) as Id<'interviews'>;

    const interview = await ctx.t.run(async (dbCtx) => dbCtx.db.get(interviewId));
    expect(interview?.meetingLink).toBe('https://meet.example.test/abc');
    expect(interview?.additionalNotes).toBe('Bring a portfolio');
  });
});

describe('recruitment — deletion', () => {
  it('takes the events, interviews and scorecards with the application', async () => {
    const ctx = await seed();
    const { applicationId } = await addApplication(ctx);

    await ctx.t.run(async (dbCtx) => {
      await dbCtx.db.insert('applicationEvents', {
        applicationId,
        organizationId: ctx.organizationId,
        toStage: 'applied',
        changedBy: ctx.adminId,
        createdAt: Date.now(),
      } as never);
      await dbCtx.db.insert('interviewScorecards', {
        applicationId,
        organizationId: ctx.organizationId,
        interviewerId: ctx.adminId,
        ratings: [{ criterion: 'Skill', score: 4 }],
        overallScore: 4,
        recommendation: 'yes',
        createdAt: Date.now(),
      } as never);
    });

    await ctx.asAdmin.mutation(api.recruitment.deleteCandidate, { applicationId });

    await ctx.t.run(async (dbCtx) => {
      expect(await dbCtx.db.get(applicationId)).toBeNull();
      const events = await dbCtx.db
        .query('applicationEvents')
        .withIndex('by_application', (q) => q.eq('applicationId', applicationId))
        .collect();
      const scorecards = await dbCtx.db
        .query('interviewScorecards')
        .withIndex('by_application', (q) => q.eq('applicationId', applicationId))
        .collect();
      expect(events).toHaveLength(0);
      expect(scorecards).toHaveLength(0);
    });
  });

  it('keeps the profile while another application still refers to it', async () => {
    const ctx = await seed();
    const { applicationId, candidateId } = await addApplication(ctx);

    const secondVacancyId = await ctx.t.run(async (dbCtx) =>
      dbCtx.db.insert('vacancies', {
        organizationId: ctx.organizationId,
        title: 'Frontend Developer',
        employmentType: 'full_time',
        description: 'Build screens',
        status: 'open',
        hiringManagerId: ctx.adminId,
        createdBy: ctx.adminId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as never),
    );
    await ctx.t.run(async (dbCtx) => {
      await dbCtx.db.insert('applications', {
        organizationId: ctx.organizationId,
        candidateId,
        vacancyId: secondVacancyId,
        stage: 'applied',
        createdBy: ctx.adminId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as never);
    });

    await ctx.asAdmin.mutation(api.recruitment.deleteCandidate, { applicationId });

    // Dropping the shared profile here used to break the other vacancy's pipeline.
    expect(await ctx.t.run(async (dbCtx) => dbCtx.db.get(candidateId))).not.toBeNull();
  });
});

describe('recruitment — adding a candidate by hand', () => {
  it('normalises the email so one person is one profile', async () => {
    const ctx = await seed();

    await ctx.asAdmin.mutation(api.recruitment.addCandidate, {
      organizationId: ctx.organizationId,
      vacancyId: ctx.vacancyId,
      name: 'Boris',
      email: 'Boris@Example.TEST',
      source: 'referral',
    });

    const profiles = await ctx.t.run(async (dbCtx) =>
      dbCtx.db
        .query('candidateProfiles')
        .withIndex('by_org_email', (q) =>
          q.eq('organizationId', ctx.organizationId).eq('email', 'boris@example.test'),
        )
        .collect(),
    );
    expect(profiles).toHaveLength(1);
  });

  it('refuses a second open application for the same vacancy', async () => {
    const ctx = await seed();
    const args = {
      organizationId: ctx.organizationId,
      vacancyId: ctx.vacancyId,
      name: 'Boris',
      email: 'boris@example.test',
      source: 'referral' as const,
    };

    await ctx.asAdmin.mutation(api.recruitment.addCandidate, args);
    await expect(ctx.asAdmin.mutation(api.recruitment.addCandidate, args)).rejects.toThrow();
  });

  it('refuses an employee entirely', async () => {
    const ctx = await seed();

    await expect(
      ctx.asEmployee.mutation(api.recruitment.addCandidate, {
        organizationId: ctx.organizationId,
        vacancyId: ctx.vacancyId,
        name: 'Boris',
        email: 'boris@example.test',
        source: 'referral',
      }),
    ).rejects.toThrow();
  });
});

describe('careers — the public application form', () => {
  it('records an attached CV as waiting for review', async () => {
    const ctx = await seed();

    const result = (await ctx.t.mutation(api.careers.applyToVacancy, {
      vacancyId: ctx.vacancyId,
      name: 'Public Applicant',
      email: 'public@example.test',
      cvFileUrl: 'https://res.cloudinary.com/demo/raw/upload/cv.pdf',
      cvFileName: 'cv.pdf',
      cvFileSize: 120_000,
      cvMimeType: 'application/pdf',
      consentGiven: true,
    })) as { applicationId: Id<'applications'> };

    const app = await ctx.t.run(async (dbCtx) => dbCtx.db.get(result.applicationId));
    expect(app?.cvStatus).toBe('pending');
    expect(app?.cvFileName).toBe('cv.pdf');
    expect(app?.stage).toBe('applied');
  });

  it('refuses a CV that did not come from our own storage', async () => {
    const ctx = await seed();

    await expect(
      ctx.t.mutation(api.careers.applyToVacancy, {
        vacancyId: ctx.vacancyId,
        name: 'Public Applicant',
        email: 'public@example.test',
        cvFileUrl: 'https://evil.example.com/payload.pdf',
        cvMimeType: 'application/pdf',
        consentGiven: true,
      }),
    ).rejects.toThrow();
  });

  it('refuses anything that is not a PDF, and anything oversized', async () => {
    const ctx = await seed();
    const base = {
      vacancyId: ctx.vacancyId,
      name: 'Public Applicant',
      email: 'public@example.test',
      cvFileUrl: 'https://res.cloudinary.com/demo/raw/upload/cv.pdf',
      consentGiven: true,
    };

    await expect(
      ctx.t.mutation(api.careers.applyToVacancy, { ...base, cvMimeType: 'application/zip' }),
    ).rejects.toThrow();
    await expect(
      ctx.t.mutation(api.careers.applyToVacancy, {
        ...base,
        cvMimeType: 'application/pdf',
        cvFileSize: 20 * 1024 * 1024,
      }),
    ).rejects.toThrow();
  });

  it('still accepts an application without a CV', async () => {
    const ctx = await seed();

    const result = (await ctx.t.mutation(api.careers.applyToVacancy, {
      vacancyId: ctx.vacancyId,
      name: 'Public Applicant',
      email: 'public@example.test',
      consentGiven: true,
    })) as { applicationId: Id<'applications'> };

    const app = await ctx.t.run(async (dbCtx) => dbCtx.db.get(result.applicationId));
    expect(app?.cvStatus).toBeUndefined();
  });
});
