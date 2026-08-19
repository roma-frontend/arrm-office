/**
 * Tests for convex/recruitment.ts — the recruitment pipeline: vacancies,
 * candidates, applications, interviews, scorecards, CV review and hiring.
 *
 * Pattern: convex-departments.test.ts — mock `_generated/server`,
 * `_generated/api`, lib/orgAccess, lib/notify, lib/leaveBalances and
 * lib/orgUnits; run lib/limits and convex/values for real; require the
 * module inside jest.isolateModules.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// ── Mocks ────────────────────────────────────────────────────────────────────
jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
  action: ({ handler, args }: any) => ({ handler, args }),
  internalMutation: ({ handler, args }: any) => ({ handler, args }),
  internalQuery: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/_generated/api', () => ({
  api: {
    recruitmentEmails: {
      sendApplicationConfirmation: { _name: 'sendApplicationConfirmation' },
      sendOfferLetter: { _name: 'sendOfferLetter' },
      sendRejectionNotice: { _name: 'sendRejectionNotice' },
      sendInterviewInvitation: { _name: 'sendInterviewInvitation' },
    },
    onboarding: {
      startOnboarding: { _name: 'startOnboarding' },
    },
    telegram: {
      sendScreeningInstructions: { _name: 'sendScreeningInstructions' },
    },
  },
  internal: {
    probation: {
      autoStartProbation: { _name: 'autoStartProbation' },
    },
    telegram: {
      sendInterviewInvite: { _name: 'sendInterviewInvite' },
    },
  },
}));

jest.mock('../../convex/lib/orgAccess', () => ({
  assertOrgScope: jest.fn(),
  assertOrgStaff: jest.fn(),
  resolveOrgScope: jest.fn(),
  resolveOrgStaff: jest.fn(),
  scopeOwnsRecord: jest.fn(),
}));

jest.mock('../../convex/lib/notify', () => ({
  notify: jest.fn(),
}));

jest.mock('../../convex/lib/leaveBalances', () => ({
  getStartingLeaveBalances: jest.fn(),
}));

jest.mock('../../convex/lib/orgUnits', () => ({
  resolveOrgUnitsByName: jest.fn(),
}));

// ── Module under test ────────────────────────────────────────────────────────
let mockAssertOrgScope: jest.Mock;
let mockAssertOrgStaff: jest.Mock;
let mockResolveOrgScope: jest.Mock;
let mockResolveOrgStaff: jest.Mock;
let mockScopeOwnsRecord: jest.Mock;
let mockNotify: jest.Mock;
let mockGetStartingLeaveBalances: jest.Mock;
let mockResolveOrgUnitsByName: jest.Mock;

type Handler = (ctx: any, args: any) => Promise<unknown>;
const handlers: Record<string, Handler> = {};

beforeEach(() => {
  jest.clearAllMocks();
  mockAssertOrgScope = jest.requireMock('../../convex/lib/orgAccess').assertOrgScope;
  mockAssertOrgStaff = jest.requireMock('../../convex/lib/orgAccess').assertOrgStaff;
  mockResolveOrgScope = jest.requireMock('../../convex/lib/orgAccess').resolveOrgScope;
  mockResolveOrgStaff = jest.requireMock('../../convex/lib/orgAccess').resolveOrgStaff;
  mockScopeOwnsRecord = jest.requireMock('../../convex/lib/orgAccess').scopeOwnsRecord;
  mockNotify = jest.requireMock('../../convex/lib/notify').notify;
  mockGetStartingLeaveBalances = jest.requireMock(
    '../../convex/lib/leaveBalances',
  ).getStartingLeaveBalances;
  mockResolveOrgUnitsByName = jest.requireMock('../../convex/lib/orgUnits').resolveOrgUnitsByName;
  mockAssertOrgScope.mockReset();
  mockAssertOrgStaff.mockReset();
  mockResolveOrgScope.mockReset();
  mockResolveOrgStaff.mockReset();
  mockScopeOwnsRecord.mockReset();
  mockNotify.mockReset();
  mockGetStartingLeaveBalances.mockReset();
  mockResolveOrgUnitsByName.mockReset();

  const scope = makeScope();
  mockAssertOrgScope.mockResolvedValue(scope);
  mockAssertOrgStaff.mockResolvedValue(scope);
  mockResolveOrgScope.mockResolvedValue(scope);
  mockResolveOrgStaff.mockResolvedValue(scope);
  mockScopeOwnsRecord.mockReturnValue(true);

  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../convex/recruitment');
    for (const [name, def] of Object.entries(mod)) {
      if (def && typeof def === 'object' && typeof (def as any).handler === 'function') {
        handlers[name] = (def as any).handler;
      }
    }
  });
});

// ── Fixtures ─────────────────────────────────────────────────────────────────
const ORG_A = 'org-1';
const ORG_B = 'org-2';
const ADMIN_ID = 'user_admin';
const USER_ID = 'user_emp';
const VAC_ID = 'vac_1';
const VAC_2 = 'vac_2';
const APP_ID = 'app_1';
const APP_2 = 'app_2';
const CAND_ID = 'cand_1';
const IV_ID = 'iv_1';
const SC_ID = 'sc_1';
const DEPT_ID = 'dept_1';

function makeScope(overrides: Record<string, unknown> = {}) {
  return {
    caller: { _id: ADMIN_ID, role: 'admin', organizationId: ORG_A, email: 'admin@example.com' },
    organizationId: ORG_A,
    isStaff: true,
    isAdmin: true,
    isSuper: false,
    ...overrides,
  };
}

function vacancyDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: VAC_ID,
    organizationId: ORG_A,
    title: 'Frontend Engineer',
    department: 'Engineering',
    location: 'Yerevan',
    employmentType: 'full_time' as const,
    description: 'Build the product',
    requirements: 'React',
    salary: { min: 1000, max: 1500, currency: 'USD' },
    hiringManagerId: 'user_mgr',
    status: 'open' as const,
    createdBy: ADMIN_ID,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    closedAt: undefined,
    ...overrides,
  };
}

function applicationDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: APP_ID,
    organizationId: ORG_A,
    candidateId: CAND_ID,
    vacancyId: VAC_ID,
    stage: 'applied' as const,
    cvFileUrl: undefined,
    cvFileName: undefined,
    cvFileSize: undefined,
    cvMimeType: undefined,
    cvUploadedAt: undefined,
    cvStatus: undefined,
    cvReviewedBy: undefined,
    cvReviewedAt: undefined,
    cvReviewNote: undefined,
    notes: undefined,
    rejectionReason: undefined,
    createdBy: ADMIN_ID,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

function candidateDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: CAND_ID,
    organizationId: ORG_A,
    name: 'Anna Petrova',
    email: 'anna@example.com',
    phone: '+374 00 000 000',
    resumeText: 'Experienced engineer',
    source: 'linkedin' as const,
    referredBy: undefined,
    createdBy: ADMIN_ID,
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

function interviewDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: IV_ID,
    organizationId: ORG_A,
    applicationId: APP_ID,
    interviewerId: 'user_iv',
    scheduledAt: 1_700_000_100_000,
    duration: 60,
    type: 'technical' as const,
    location: undefined,
    meetingLink: undefined,
    additionalNotes: undefined,
    status: 'scheduled' as const,
    createdAt: 1_700_000_050_000,
    notes: undefined,
    ...overrides,
  };
}

function scorecardDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: SC_ID,
    organizationId: ORG_A,
    applicationId: APP_ID,
    interviewId: IV_ID,
    interviewerId: 'user_iv',
    ratings: [{ criterion: 'Skill', score: 4 }],
    overallScore: 4,
    recommendation: 'yes' as const,
    summary: 'Good',
    createdAt: 1_700_000_080_000,
    ...overrides,
  };
}

function eventDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'ev_1',
    applicationId: APP_ID,
    organizationId: ORG_A,
    fromStage: undefined,
    toStage: 'applied',
    changedBy: ADMIN_ID,
    reason: undefined,
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

function userDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'user_mgr',
    organizationId: ORG_A,
    name: 'Manager',
    email: 'manager@example.com',
    role: 'admin' as const,
    ...overrides,
  };
}

// Fully chainable mock so `.withIndex().filter().order().take().first().paginate()`
// all work, and the withIndex/filter predicates are *executed* so their bodies
// count as covered lines (like the real Convex query layer would run them).
function makeChain() {
  const node: any = {};
  const q: any = {};
  q.eq = jest.fn(() => q);
  q.neq = jest.fn(() => q);
  q.field = jest.fn(() => q);
  q.and = jest.fn(() => q);
  q.or = jest.fn(() => q);
  node.take = jest.fn().mockResolvedValue([]);
  node.first = jest.fn().mockResolvedValue(null);
  node.order = jest.fn().mockReturnValue(node);
  node.paginate = jest.fn().mockResolvedValue({ page: [], isDone: true, continueCursor: '' });
  node.filter = jest.fn((pred?: (qb: any) => any) => {
    if (pred) pred(q);
    return node;
  });
  node.withIndex = jest.fn((_name: string, pred?: (qb: any) => any) => {
    if (pred) pred(q);
    return node;
  });
  return node;
}

function makeCtx() {
  const get = jest.fn().mockResolvedValue(null);
  const insert = jest.fn().mockResolvedValue('new_id');
  const patch = jest.fn().mockResolvedValue(undefined);
  const remove = jest.fn().mockResolvedValue(undefined);
  const runMutation = jest.fn().mockResolvedValue(undefined);
  const runAfter = jest.fn().mockResolvedValue(undefined);
  const chains = new Map<string, ReturnType<typeof makeChain>>();
  const db = {
    get,
    insert,
    patch,
    delete: remove,
    query: jest.fn((table: string) => {
      if (!chains.has(table)) chains.set(table, makeChain());
      return chains.get(table)!;
    }),
  };
  return {
    ctx: {
      db,
      get,
      insert,
      patch,
      delete: remove,
      runMutation,
      scheduler: { runAfter },
    },
    get,
    insert,
    patch,
    remove,
    runMutation,
    runAfter,
    chains,
    db,
  };
}

/** Eagerly create (or return) the chain mock for a table. */
function chain(
  chains: Map<string, ReturnType<typeof makeChain>>,
  table: string,
): ReturnType<typeof makeChain> {
  if (!chains.has(table)) chains.set(table, makeChain());
  return chains.get(table)!;
}

// ── cvBlocksAdvance (via moveCandidate / scheduleInterview / hireCandidate) ──
describe('cv gate', () => {
  it('lets an application without a CV advance through gated stages', async () => {
    const { ctx, patch } = makeCtx();
    ctx.get
      .mockResolvedValueOnce(applicationDoc({ stage: 'screening', cvFileUrl: undefined }))
      .mockResolvedValueOnce(candidateDoc({ email: undefined }))
      .mockResolvedValueOnce(vacancyDoc());

    await handlers.moveCandidate(ctx, { applicationId: APP_ID, newStage: 'interview' });

    expect(patch).toHaveBeenCalledWith(APP_ID, expect.objectContaining({ stage: 'interview' }));
  });

  it('blocks gated stages while the CV is pending review', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(
      applicationDoc({ stage: 'screening', cvFileUrl: 'cv.pdf', cvStatus: 'pending' }),
    );

    await expect(
      handlers.moveCandidate(ctx, { applicationId: APP_ID, newStage: 'interview' }),
    ).rejects.toThrow('The CV has not been reviewed yet');
  });

  it('blocks gated stages after a CV rejection with a dedicated message', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(
      applicationDoc({ stage: 'screening', cvFileUrl: 'cv.pdf', cvStatus: 'rejected' }),
    );

    await expect(
      handlers.moveCandidate(ctx, { applicationId: APP_ID, newStage: 'offer' }),
    ).rejects.toThrow('The CV was rejected — reopen the review before advancing');
  });

  it('never gates non-CV stages like screening and rejection', async () => {
    const { ctx, patch } = makeCtx();
    ctx.get
      .mockResolvedValueOnce(
        applicationDoc({ stage: 'applied', cvFileUrl: 'cv.pdf', cvStatus: 'pending' }),
      )
      .mockResolvedValueOnce(candidateDoc({ email: undefined }))
      .mockResolvedValueOnce(vacancyDoc());

    await handlers.moveCandidate(ctx, { applicationId: APP_ID, newStage: 'screening' });

    expect(patch).toHaveBeenCalledWith(APP_ID, expect.objectContaining({ stage: 'screening' }));
  });
});

// ── listVacancies ────────────────────────────────────────────────────────────
describe('listVacancies', () => {
  it('returns [] when the caller is not staff', async () => {
    mockResolveOrgStaff.mockResolvedValueOnce(null);
    const { ctx } = makeCtx();
    await expect(handlers.listVacancies(ctx, { organizationId: ORG_A })).resolves.toEqual([]);
  });

  it('returns vacancies enriched with manager name and stage counts', async () => {
    const { ctx, chains } = makeCtx();
    ctx.get.mockImplementation((id: string) =>
      id === 'user_mgr'
        ? Promise.resolve(userDoc())
        : id === CAND_ID
          ? Promise.resolve(candidateDoc())
          : Promise.resolve(null),
    );
    const vacCh = chain(chains, 'vacancies');
    vacCh.take.mockResolvedValue([vacancyDoc()]);
    const appCh = chain(chains, 'applications');
    appCh.take.mockResolvedValue([
      applicationDoc({ stage: 'applied' }),
      applicationDoc({ _id: APP_2, stage: 'interview' }),
      applicationDoc({ _id: 'app_3', stage: 'interview' }),
    ]);

    const res = (await handlers.listVacancies(ctx, { organizationId: ORG_A })) as any[];

    expect(res).toHaveLength(1);
    expect(res[0].managerName).toBe('Manager');
    expect(res[0].candidateCount).toBe(3);
    expect(res[0].stageCounts).toEqual({
      applied: 1,
      screening: 0,
      interview: 2,
      offer: 0,
      hired: 0,
      rejected: 0,
    });
    expect(vacCh.withIndex).toHaveBeenCalledWith('by_org', expect.any(Function));
  });

  it('filters by status and falls back to Unknown manager', async () => {
    const { ctx, chains } = makeCtx();
    ctx.get.mockResolvedValue(null);
    const vacCh = chain(chains, 'vacancies');
    vacCh.take.mockResolvedValue([vacancyDoc({ status: 'closed' })]);

    const res = (await handlers.listVacancies(ctx, {
      organizationId: ORG_A,
      status: 'closed',
    })) as any[];

    expect(res[0].managerName).toBe('Unknown');
    expect(vacCh.withIndex).toHaveBeenCalledWith('by_org_status', expect.any(Function));
  });
});

// ── getVacancy ───────────────────────────────────────────────────────────────
describe('getVacancy', () => {
  it('returns null for a missing vacancy', async () => {
    const { ctx } = makeCtx();
    await expect(handlers.getVacancy(ctx, { vacancyId: VAC_ID })).resolves.toBeNull();
  });

  it('returns null for a non-staff caller', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(vacancyDoc());
    mockResolveOrgStaff.mockResolvedValueOnce(null);

    await expect(handlers.getVacancy(ctx, { vacancyId: VAC_ID })).resolves.toBeNull();
  });

  it('returns the vacancy with the manager name', async () => {
    const { ctx } = makeCtx();
    ctx.get
      .mockResolvedValueOnce(vacancyDoc())
      .mockResolvedValueOnce(userDoc({ _id: 'user_mgr', name: 'Manager' }));

    const res = (await handlers.getVacancy(ctx, { vacancyId: VAC_ID })) as any;

    expect(res._id).toBe(VAC_ID);
    expect(res.managerName).toBe('Manager');
  });

  it('falls back to Unknown manager name', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(vacancyDoc()).mockResolvedValueOnce(null);

    const res = (await handlers.getVacancy(ctx, { vacancyId: VAC_ID })) as any;

    expect(res.managerName).toBe('Unknown');
  });
});

// ── listCandidatesByVacancy ──────────────────────────────────────────────────
describe('listCandidatesByVacancy', () => {
  it('returns [] for a missing vacancy', async () => {
    const { ctx } = makeCtx();
    await expect(handlers.listCandidatesByVacancy(ctx, { vacancyId: VAC_ID })).resolves.toEqual([]);
  });

  it('returns [] when the caller is not staff', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(vacancyDoc());
    mockResolveOrgStaff.mockResolvedValueOnce(null);
    await expect(handlers.listCandidatesByVacancy(ctx, { vacancyId: VAC_ID })).resolves.toEqual([]);
  });

  it('enriches applications with the candidate profile and average score', async () => {
    const { ctx, chains } = makeCtx();
    ctx.get.mockResolvedValue(vacancyDoc());
    ctx.get.mockImplementation((id: string) =>
      id === VAC_ID
        ? Promise.resolve(vacancyDoc())
        : id === CAND_ID
          ? Promise.resolve(candidateDoc())
          : Promise.resolve(null),
    );
    const appCh = chain(chains, 'applications');
    appCh.take.mockResolvedValue([
      applicationDoc({ createdAt: 100 }),
      applicationDoc({ _id: APP_2, createdAt: 300 }),
    ]);
    const scCh = chain(chains, 'interviewScorecards');
    scCh.take.mockResolvedValue([
      scorecardDoc({ overallScore: 4 }),
      scorecardDoc({ overallScore: 5 }),
    ]);

    const res = (await handlers.listCandidatesByVacancy(ctx, { vacancyId: VAC_ID })) as any[];

    expect(res).toHaveLength(2);
    // Sorted newest first.
    expect(res[0]._id).toBe(APP_2);
    expect(res[0].candidate).toMatchObject({ name: 'Anna Petrova' });
    expect(res[0].scorecardsCount).toBe(2);
    expect(res[0].avgScore).toBe(4.5);
  });

  it('filters by stage and reports null average without scorecards', async () => {
    const { ctx, chains } = makeCtx();
    ctx.get.mockImplementation((id: string) =>
      id === VAC_ID
        ? Promise.resolve(vacancyDoc())
        : id === CAND_ID
          ? Promise.resolve(candidateDoc())
          : Promise.resolve(null),
    );
    const appCh = chain(chains, 'applications');
    appCh.take.mockResolvedValue([applicationDoc()]);

    const res = (await handlers.listCandidatesByVacancy(ctx, {
      vacancyId: VAC_ID,
      stage: 'applied',
    })) as any[];

    expect(res[0].avgScore).toBeNull();
    expect(res[0].scorecardsCount).toBe(0);
    expect(appCh.withIndex).toHaveBeenCalledWith('by_vacancy_stage', expect.any(Function));
  });
});

// ── listApplicationsPaginated ────────────────────────────────────────────────
describe('listApplicationsPaginated', () => {
  const opts = { numItems: 10, cursor: null };

  it('returns an empty page for a missing vacancy', async () => {
    const { ctx } = makeCtx();
    await expect(
      handlers.listApplicationsPaginated(ctx, { vacancyId: VAC_ID, paginationOpts: opts }),
    ).resolves.toEqual({ page: [], isDone: true, continueCursor: '' });
  });

  it('returns an empty page when the caller is not staff', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(vacancyDoc());
    mockResolveOrgStaff.mockResolvedValueOnce(null);
    await expect(
      handlers.listApplicationsPaginated(ctx, { vacancyId: VAC_ID, paginationOpts: opts }),
    ).resolves.toEqual({ page: [], isDone: true, continueCursor: '' });
  });

  it('paginates applications enriched with the candidate profile', async () => {
    const { ctx, chains } = makeCtx();
    ctx.get.mockImplementation((id: string) =>
      id === VAC_ID
        ? Promise.resolve(vacancyDoc())
        : id === CAND_ID
          ? Promise.resolve(candidateDoc())
          : Promise.resolve(null),
    );
    const appCh = chain(chains, 'applications');
    appCh.paginate.mockResolvedValue({
      page: [applicationDoc()],
      isDone: false,
      continueCursor: 'c_1',
    });

    const res = (await handlers.listApplicationsPaginated(ctx, {
      vacancyId: VAC_ID,
      paginationOpts: opts,
    })) as any;

    expect(res.isDone).toBe(false);
    expect(res.page).toHaveLength(1);
    expect(res.page[0].candidate).toMatchObject({ name: 'Anna Petrova' });
    expect(appCh.withIndex).toHaveBeenCalledWith('by_vacancy', expect.any(Function));
  });
});

// ── getCandidate ─────────────────────────────────────────────────────────────
describe('getCandidate', () => {
  it('returns null for a missing application', async () => {
    const { ctx } = makeCtx();
    await expect(handlers.getCandidate(ctx, { applicationId: APP_ID })).resolves.toBeNull();
  });

  it('returns null for a non-staff caller', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(applicationDoc());
    mockResolveOrgStaff.mockResolvedValueOnce(null);
    await expect(handlers.getCandidate(ctx, { applicationId: APP_ID })).resolves.toBeNull();
  });

  it('falls back to Unknown names when the referenced users are gone', async () => {
    const { ctx, chains } = makeCtx();
    ctx.get.mockImplementation((id: string) =>
      id === APP_ID ? Promise.resolve(applicationDoc()) : Promise.resolve(null),
    );
    chain(chains, 'interviews').take.mockResolvedValue([interviewDoc()]);
    chain(chains, 'interviewScorecards').take.mockResolvedValue([scorecardDoc()]);
    chain(chains, 'applicationEvents').take.mockResolvedValue([eventDoc()]);

    const res = (await handlers.getCandidate(ctx, { applicationId: APP_ID })) as any;

    expect(res.interviews[0].interviewerName).toBe('Unknown');
    expect(res.scorecards[0].interviewerName).toBe('Unknown');
    expect(res.events[0].changedByName).toBe('Unknown');
  });

  it('returns the full candidate dossier with enriched, sorted sub-lists', async () => {
    const { ctx, chains } = makeCtx();
    ctx.get.mockImplementation((id: string) => {
      if (id === APP_ID) return Promise.resolve(applicationDoc());
      if (id === CAND_ID) return Promise.resolve(candidateDoc());
      if (id === VAC_ID) return Promise.resolve(vacancyDoc());
      if (id === 'user_iv') return Promise.resolve(userDoc({ _id: 'user_iv', name: 'Ivan' }));
      if (id === ADMIN_ID) return Promise.resolve(userDoc({ _id: ADMIN_ID, name: 'Admin' }));
      return Promise.resolve(null);
    });
    const ivCh = chain(chains, 'interviews');
    ivCh.take.mockResolvedValue([
      interviewDoc({ scheduledAt: 100 }),
      interviewDoc({ _id: 'iv_old', scheduledAt: 300 }),
    ]);
    const scCh = chain(chains, 'interviewScorecards');
    scCh.take.mockResolvedValue([
      scorecardDoc({ createdAt: 100 }),
      scorecardDoc({ _id: 'sc_old', createdAt: 300 }),
    ]);
    const evCh = chain(chains, 'applicationEvents');
    evCh.take.mockResolvedValue([
      eventDoc({ createdAt: 100 }),
      eventDoc({ _id: 'ev_old', createdAt: 300 }),
    ]);

    const res = (await handlers.getCandidate(ctx, { applicationId: APP_ID })) as any;

    expect(res.candidate).toMatchObject({ name: 'Anna Petrova' });
    expect(res.vacancy.title).toBe('Frontend Engineer');
    // Newest first in every list.
    expect(res.interviews[0]._id).toBe('iv_old');
    expect(res.interviews[0].interviewerName).toBe('Ivan');
    expect(res.scorecards[0]._id).toBe('sc_old');
    expect(res.scorecards[0].interviewerName).toBe('Ivan');
    expect(res.events[0]._id).toBe('ev_old');
    expect(res.events[0].changedByName).toBe('Admin');
  });
});

// ── getMyInterviews ──────────────────────────────────────────────────────────
describe('getMyInterviews', () => {
  it('returns [] when the scope cannot be resolved', async () => {
    mockResolveOrgScope.mockResolvedValueOnce(null);
    const { ctx } = makeCtx();
    await expect(handlers.getMyInterviews(ctx, { organizationId: ORG_A })).resolves.toEqual([]);
  });

  it('returns only upcoming interviews for the caller, enriched and sorted', async () => {
    const now = Date.now();
    const { ctx, chains } = makeCtx();
    ctx.get.mockImplementation((id: string) => {
      if (id === APP_ID) return Promise.resolve(applicationDoc());
      if (id === CAND_ID) return Promise.resolve(candidateDoc());
      if (id === VAC_ID) return Promise.resolve(vacancyDoc());
      return Promise.resolve(null);
    });
    const ivCh = chain(chains, 'interviews');
    ivCh.take.mockResolvedValue([
      interviewDoc({ scheduledAt: now + 2000 }), // upcoming
      interviewDoc({ _id: 'iv_soon', scheduledAt: now + 1000 }), // upcoming, sooner
      interviewDoc({ _id: 'iv_past', scheduledAt: now - 1000 }), // past → dropped
      interviewDoc({ _id: 'iv_other', organizationId: ORG_B, scheduledAt: now + 1000 }), // other org
      interviewDoc({ _id: 'iv_done', status: 'completed', scheduledAt: now + 1000 }), // not scheduled
    ]);

    const res = (await handlers.getMyInterviews(ctx, { organizationId: ORG_A })) as any[];

    expect(res).toHaveLength(2);
    // Sorted soonest first.
    expect(res[0]._id).toBe('iv_soon');
    expect(res[1]._id).toBe(IV_ID);
    expect(res[1].candidateName).toBe('Anna Petrova');
    expect(res[1].vacancyTitle).toBe('Frontend Engineer');
    expect(ivCh.withIndex).toHaveBeenCalledWith('by_interviewer', expect.any(Function));
  });

  it('falls back to Unknown labels when the application is gone', async () => {
    const now = Date.now();
    const { ctx, chains } = makeCtx();
    ctx.get.mockResolvedValue(null);
    const ivCh = chain(chains, 'interviews');
    ivCh.take.mockResolvedValue([interviewDoc({ scheduledAt: now + 1000 })]);

    const res = (await handlers.getMyInterviews(ctx, { organizationId: ORG_A })) as any[];

    expect(res[0].candidateName).toBe('Unknown');
    expect(res[0].vacancyTitle).toBe('Unknown');
  });
});

// ── getPipelineStats ─────────────────────────────────────────────────────────
describe('getPipelineStats', () => {
  it('returns zeroed stats for a non-staff caller', async () => {
    mockResolveOrgStaff.mockResolvedValueOnce(null);
    const { ctx } = makeCtx();
    await expect(handlers.getPipelineStats(ctx, { organizationId: ORG_A })).resolves.toEqual({
      openVacancies: 0,
      totalCandidates: 0,
      cvPending: 0,
      pipeline: { applied: 0, screening: 0, interview: 0, offer: 0, hired: 0, rejected: 0 },
    });
  });

  it('aggregates the pipeline across the organization', async () => {
    const { ctx, chains } = makeCtx();
    // Orphan applications (missing profile) must not feed the counters.
    ctx.get.mockImplementation((id: string) =>
      id === CAND_ID ? Promise.resolve(candidateDoc()) : Promise.resolve(null),
    );
    const vacCh = chain(chains, 'vacancies');
    vacCh.take.mockResolvedValue([vacancyDoc(), vacancyDoc({ _id: VAC_2, status: 'paused' })]);
    const appCh = chain(chains, 'applications');
    appCh.take.mockResolvedValue([
      applicationDoc({ stage: 'applied' }),
      applicationDoc({ _id: APP_2, stage: 'screening' }),
      applicationDoc({ _id: 'app_3', stage: 'interview' }),
      applicationDoc({ _id: 'app_4', stage: 'offer' }),
      applicationDoc({ _id: 'app_5', stage: 'hired' }),
      applicationDoc({ _id: 'app_6', stage: 'rejected' }),
      applicationDoc({ _id: 'app_7', stage: 'applied', cvFileUrl: 'cv.pdf', cvStatus: 'pending' }),
      applicationDoc({
        _id: 'app_8',
        stage: 'screening',
        cvFileUrl: 'cv.pdf',
        cvStatus: 'approved',
      }),
    ]);

    const res = (await handlers.getPipelineStats(ctx, { organizationId: ORG_A })) as any;

    expect(res.openVacancies).toBe(2);
    expect(res.totalCandidates).toBe(8);
    expect(res.cvPending).toBe(1);
    expect(res.pipeline).toEqual({
      applied: 2,
      screening: 2,
      interview: 1,
      offer: 1,
      hired: 1,
      rejected: 1,
    });
  });

  it('ignores orphan applications whose candidate profile was removed', async () => {
    const { ctx, chains } = makeCtx();
    // Only CAND_ID resolves to a profile; the ghost candidate is gone.
    ctx.get.mockImplementation((id: string) =>
      id === CAND_ID ? Promise.resolve(candidateDoc()) : Promise.resolve(null),
    );
    const appCh = chain(chains, 'applications');
    appCh.take.mockResolvedValue([
      applicationDoc({ stage: 'applied' }),
      applicationDoc({ _id: APP_2, candidateId: 'cand_ghost', stage: 'interview' }),
    ]);

    const res = (await handlers.getPipelineStats(ctx, { organizationId: ORG_A })) as any;

    expect(res.totalCandidates).toBe(1);
    expect(res.pipeline).toEqual({
      applied: 1,
      screening: 0,
      interview: 0,
      offer: 0,
      hired: 0,
      rejected: 0,
    });
  });
});

// ── createVacancy ────────────────────────────────────────────────────────────
describe('createVacancy', () => {
  const args = {
    organizationId: ORG_A,
    title: 'Backend Engineer',
    department: 'Engineering',
    employmentType: 'full_time' as const,
    description: 'Servers',
    hiringManagerId: 'user_mgr',
  };

  it('throws when the hiring manager does not exist', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(null);
    await expect(handlers.createVacancy(ctx, args)).rejects.toThrow(
      'Hiring manager must belong to this organization',
    );
  });

  it('throws when the hiring manager is from another organization', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(userDoc({ organizationId: ORG_B }));
    await expect(handlers.createVacancy(ctx, args)).rejects.toThrow(
      'Hiring manager must belong to this organization',
    );
  });

  it('inserts an open vacancy attributed to the session caller', async () => {
    const { ctx, insert } = makeCtx();
    insert.mockResolvedValueOnce(VAC_ID);
    ctx.get.mockResolvedValueOnce(userDoc());

    const id = await handlers.createVacancy(ctx, args);

    expect(id).toBe(VAC_ID);
    const call = insert.mock.calls.find(([t]) => t === 'vacancies') as unknown[];
    expect(call![1]).toMatchObject({
      organizationId: ORG_A,
      title: 'Backend Engineer',
      status: 'open',
      createdBy: ADMIN_ID,
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    });
  });

  it('uses the args organization when the scope carries no org (superadmin)', async () => {
    mockAssertOrgStaff.mockResolvedValueOnce(
      makeScope({ organizationId: undefined, isSuper: true }),
    );
    const { ctx, insert } = makeCtx();
    insert.mockResolvedValueOnce(VAC_ID);
    ctx.get.mockResolvedValueOnce(userDoc());

    await handlers.createVacancy(ctx, args);

    const call = insert.mock.calls.find(([t]) => t === 'vacancies') as unknown[];
    expect(call![1]).toMatchObject({ organizationId: ORG_A });
  });
});

// ── updateVacancy ────────────────────────────────────────────────────────────
describe('updateVacancy', () => {
  it('throws for a missing vacancy', async () => {
    const { ctx } = makeCtx();
    await expect(handlers.updateVacancy(ctx, { vacancyId: VAC_ID, title: 'X' })).rejects.toThrow(
      'Vacancy not found',
    );
  });

  it('throws when the caller does not own the vacancy', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(vacancyDoc());
    mockScopeOwnsRecord.mockReturnValueOnce(false);
    await expect(handlers.updateVacancy(ctx, { vacancyId: VAC_ID, title: 'X' })).rejects.toThrow(
      'Not authorized for this vacancy',
    );
  });

  it('throws when the new hiring manager is invalid', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(vacancyDoc()).mockResolvedValueOnce(null);
    await expect(
      handlers.updateVacancy(ctx, { vacancyId: VAC_ID, hiringManagerId: 'ghost' }),
    ).rejects.toThrow('Hiring manager must belong to this organization');
  });

  it('patches the provided fields and stamps closedAt when closing', async () => {
    const { ctx, patch } = makeCtx();
    ctx.get.mockResolvedValueOnce(vacancyDoc()).mockResolvedValueOnce(userDoc());

    await handlers.updateVacancy(ctx, {
      vacancyId: VAC_ID,
      title: 'Senior FE',
      status: 'closed',
      hiringManagerId: 'user_mgr',
      salary: { min: 2000, max: 2500, currency: 'EUR' },
    });

    expect(patch).toHaveBeenCalledWith(
      VAC_ID,
      expect.objectContaining({
        title: 'Senior FE',
        status: 'closed',
        closedAt: expect.any(Number),
        hiringManagerId: 'user_mgr',
        salary: { min: 2000, max: 2500, currency: 'EUR' },
        updatedAt: expect.any(Number),
      }),
    );
  });

  it('keeps closedAt undefined for non-closed updates', async () => {
    const { ctx, patch } = makeCtx();
    ctx.get.mockResolvedValueOnce(vacancyDoc());

    await handlers.updateVacancy(ctx, { vacancyId: VAC_ID, status: 'paused' });

    const payload = patch.mock.calls.find(([id]) => id === VAC_ID)?.[1] as Record<string, unknown>;
    expect(payload.status).toBe('paused');
    expect(payload).not.toHaveProperty('closedAt');
  });

  it('patches every other mutable field', async () => {
    const { ctx, patch } = makeCtx();
    ctx.get.mockResolvedValueOnce(vacancyDoc());

    await handlers.updateVacancy(ctx, {
      vacancyId: VAC_ID,
      department: 'Sales',
      location: 'Gyumri',
      description: 'New desc',
      requirements: 'TypeScript',
      employmentType: 'contract',
    });

    expect(patch).toHaveBeenCalledWith(
      VAC_ID,
      expect.objectContaining({
        department: 'Sales',
        location: 'Gyumri',
        description: 'New desc',
        requirements: 'TypeScript',
        employmentType: 'contract',
        updatedAt: expect.any(Number),
      }),
    );
  });

  it('leaves status untouched when not provided', async () => {
    const { ctx, patch } = makeCtx();
    ctx.get.mockResolvedValueOnce(vacancyDoc());

    await handlers.updateVacancy(ctx, { vacancyId: VAC_ID, title: 'Renamed' });

    const payload = patch.mock.calls.find(([id]) => id === VAC_ID)?.[1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('status');
  });
});

// ── deleteVacancy ────────────────────────────────────────────────────────────
describe('deleteVacancy', () => {
  it('throws for a missing vacancy', async () => {
    const { ctx } = makeCtx();
    await expect(handlers.deleteVacancy(ctx, { vacancyId: VAC_ID })).rejects.toThrow(
      'Vacancy not found',
    );
  });

  it('throws when the caller is not an admin of the org', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(vacancyDoc());
    mockScopeOwnsRecord.mockReturnValueOnce(false);
    await expect(handlers.deleteVacancy(ctx, { vacancyId: VAC_ID })).rejects.toThrow(
      'Not authorized for this vacancy',
    );
  });

  it('purges applications, orphaned candidates and the vacancy itself', async () => {
    const { ctx, remove, chains } = makeCtx();
    ctx.get.mockResolvedValueOnce(vacancyDoc());
    const appCh = chain(chains, 'applications');
    appCh.take.mockResolvedValue([
      applicationDoc(),
      applicationDoc({ _id: APP_2, candidateId: CAND_ID }),
    ]);
    // purgeOrphanCandidate: no remaining applications → delete both candidates.
    appCh.first.mockResolvedValue(null);
    const evCh = chain(chains, 'applicationEvents');
    evCh.take.mockResolvedValue([eventDoc()]);
    const ivCh = chain(chains, 'interviews');
    ivCh.take.mockResolvedValue([interviewDoc()]);
    const scCh = chain(chains, 'interviewScorecards');
    scCh.take.mockResolvedValue([scorecardDoc()]);

    await handlers.deleteVacancy(ctx, { vacancyId: VAC_ID });

    expect(remove).toHaveBeenCalledWith('ev_1');
    expect(remove).toHaveBeenCalledWith(IV_ID);
    expect(remove).toHaveBeenCalledWith(SC_ID);
    expect(remove).toHaveBeenCalledWith(APP_ID);
    expect(remove).toHaveBeenCalledWith(APP_2);
    expect(remove).toHaveBeenCalledWith(CAND_ID);
    expect(remove).toHaveBeenCalledWith(VAC_ID);
  });

  it('keeps a candidate profile when other applications still reference it', async () => {
    const { ctx, remove, chains } = makeCtx();
    ctx.get.mockResolvedValueOnce(vacancyDoc());
    const appCh = chain(chains, 'applications');
    appCh.take.mockResolvedValue([applicationDoc()]);
    appCh.first.mockResolvedValue({ _id: 'app_other' });

    await handlers.deleteVacancy(ctx, { vacancyId: VAC_ID });

    expect(remove).not.toHaveBeenCalledWith(CAND_ID);
  });
});

// ── deleteCandidate ──────────────────────────────────────────────────────────
describe('deleteCandidate', () => {
  it('throws for a missing application', async () => {
    const { ctx } = makeCtx();
    await expect(handlers.deleteCandidate(ctx, { applicationId: APP_ID })).rejects.toThrow(
      'Application not found',
    );
  });

  it('throws when the caller is not staff', async () => {
    mockAssertOrgScope.mockResolvedValueOnce(makeScope({ isStaff: false, isAdmin: false }));
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(applicationDoc());
    await expect(handlers.deleteCandidate(ctx, { applicationId: APP_ID })).rejects.toThrow(
      'Not authorized: staff access required',
    );
  });

  it('purges the application and the orphaned candidate', async () => {
    const { ctx, remove, chains } = makeCtx();
    ctx.get.mockResolvedValueOnce(applicationDoc());
    const appCh = chain(chains, 'applications');
    appCh.first.mockResolvedValue(null);

    await handlers.deleteCandidate(ctx, { applicationId: APP_ID });

    expect(remove).toHaveBeenCalledWith(APP_ID);
    expect(remove).toHaveBeenCalledWith(CAND_ID);
  });
});

// ── addCandidate ─────────────────────────────────────────────────────────────
describe('addCandidate', () => {
  const args = {
    organizationId: ORG_A,
    vacancyId: VAC_ID,
    name: 'Boris Ivanov',
    email: '  BORIS@Example.COM ',
    source: 'linkedin' as const,
  };

  it('throws when the vacancy is missing or from another org', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(null);
    await expect(handlers.addCandidate(ctx, args)).rejects.toThrow(
      'Vacancy not found in this organization',
    );
    ctx.get.mockResolvedValueOnce(vacancyDoc({ organizationId: ORG_B }));
    await expect(handlers.addCandidate(ctx, args)).rejects.toThrow(
      'Vacancy not found in this organization',
    );
  });

  it('throws when the candidate already has an open application', async () => {
    const { ctx, chains } = makeCtx();
    ctx.get.mockResolvedValueOnce(vacancyDoc());
    const candCh = chain(chains, 'candidateProfiles');
    candCh.first.mockResolvedValueOnce(null);
    const appCh = chain(chains, 'applications');
    appCh.first.mockResolvedValueOnce(applicationDoc());

    await expect(handlers.addCandidate(ctx, args)).rejects.toThrow(
      'This candidate already has an open application',
    );
  });

  it('creates a new profile and application, notifies admins and schedules the confirmation email', async () => {
    const { ctx, insert, runAfter, chains } = makeCtx();
    ctx.get
      .mockResolvedValueOnce(vacancyDoc())
      .mockResolvedValueOnce(candidateDoc({ _id: CAND_ID, email: 'boris@example.com' }));
    insert
      .mockResolvedValueOnce(CAND_ID) // candidateProfiles
      .mockResolvedValueOnce(APP_ID); // applications
    const candCh = chain(chains, 'candidateProfiles');
    candCh.first.mockResolvedValueOnce(null);
    const appCh = chain(chains, 'applications');
    appCh.first.mockResolvedValueOnce(null);
    const usersCh = chain(chains, 'users');
    usersCh.take.mockResolvedValue([
      userDoc({ _id: ADMIN_ID }), // self — skipped
      userDoc({ _id: 'user_admin2' }), // other admin — notified
    ]);

    const id = await handlers.addCandidate(ctx, {
      ...args,
      cvFileUrl: 'cv.pdf',
      cvFileName: 'cv.pdf',
    });

    expect(id).toBe(APP_ID);
    // Profile insert normalizes the email.
    const profCall = insert.mock.calls.find(([t]) => t === 'candidateProfiles') as unknown[];
    expect(profCall![1]).toMatchObject({
      name: 'Boris Ivanov',
      email: 'boris@example.com',
      source: 'linkedin',
      createdBy: ADMIN_ID,
    });
    // Application insert carries the CV metadata with pending status.
    const appCall = insert.mock.calls.find(([t]) => t === 'applications') as unknown[];
    expect(appCall![1]).toMatchObject({
      candidateId: CAND_ID,
      vacancyId: VAC_ID,
      stage: 'applied',
      cvFileUrl: 'cv.pdf',
      cvStatus: 'pending',
      cvUploadedAt: expect.any(Number),
    });
    expect(insert).toHaveBeenCalledWith(
      'applicationEvents',
      expect.objectContaining({ toStage: 'applied', changedBy: ADMIN_ID }),
    );
    // Only the other admin gets notified.
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        userId: 'user_admin2',
        titleKey: 'notifications.titles.candidateAdded',
      }),
    );
    expect(runAfter).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ _name: 'sendApplicationConfirmation' }),
      expect.objectContaining({
        candidateEmail: 'boris@example.com',
        vacancyTitle: 'Frontend Engineer',
      }),
    );
  });

  it('reuses an existing profile, updates changed resume text and skips the email without a candidate email', async () => {
    const { ctx, insert, patch, runAfter, chains } = makeCtx();
    ctx.get
      .mockResolvedValueOnce(vacancyDoc())
      .mockResolvedValueOnce(null) // duplicate scan
      .mockResolvedValueOnce(candidateDoc({ _id: CAND_ID, email: undefined })); // candidate fetch
    insert.mockResolvedValueOnce(APP_ID); // applications only
    const candCh = chain(chains, 'candidateProfiles');
    candCh.first.mockResolvedValueOnce(candidateDoc({ resumeText: 'Old text' }));
    const appCh = chain(chains, 'applications');
    appCh.first.mockResolvedValueOnce(null);

    const id = await handlers.addCandidate(ctx, { ...args, resumeText: 'New text' });

    expect(id).toBe(APP_ID);
    expect(patch).toHaveBeenCalledWith(CAND_ID, { resumeText: 'New text' });
    expect(insert).not.toHaveBeenCalledWith('candidateProfiles', expect.anything());
    expect(runAfter).not.toHaveBeenCalled();
  });

  it('does not rewrite an unchanged resume on a returning candidate', async () => {
    const { ctx, insert, patch, chains } = makeCtx();
    ctx.get
      .mockResolvedValueOnce(vacancyDoc())
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(candidateDoc({ email: undefined }));
    insert.mockResolvedValueOnce(APP_ID);
    const candCh = chain(chains, 'candidateProfiles');
    candCh.first.mockResolvedValueOnce(candidateDoc({ resumeText: 'Same' }));
    const appCh = chain(chains, 'applications');
    appCh.first.mockResolvedValueOnce(null);

    await handlers.addCandidate(ctx, { ...args, resumeText: 'Same' });

    expect(patch).not.toHaveBeenCalled();
  });

  it('uses the args organization when the scope carries no org (superadmin)', async () => {
    mockAssertOrgStaff.mockResolvedValueOnce(
      makeScope({ organizationId: undefined, isSuper: true }),
    );
    const { ctx, insert, chains } = makeCtx();
    ctx.get
      .mockResolvedValueOnce(vacancyDoc())
      .mockResolvedValueOnce(candidateDoc({ _id: CAND_ID, email: undefined }));
    insert.mockResolvedValueOnce(CAND_ID).mockResolvedValueOnce(APP_ID);
    chain(chains, 'candidateProfiles').first.mockResolvedValueOnce(null);
    chain(chains, 'applications').first.mockResolvedValueOnce(null);
    chain(chains, 'users').take.mockResolvedValue([]);

    await handlers.addCandidate(ctx, args);

    const profCall = insert.mock.calls.find(([t]) => t === 'candidateProfiles') as unknown[];
    expect(profCall![1]).toMatchObject({ organizationId: ORG_A });
  });

  it('falls back to generic vacancy labels in the notification and email', async () => {
    const { ctx, insert, runAfter, chains } = makeCtx();
    ctx.get
      .mockResolvedValueOnce(vacancyDoc({ title: undefined }))
      .mockResolvedValueOnce(candidateDoc({ _id: CAND_ID, email: 'boris@example.com' }));
    insert.mockResolvedValueOnce(CAND_ID).mockResolvedValueOnce(APP_ID);
    chain(chains, 'candidateProfiles').first.mockResolvedValueOnce(null);
    chain(chains, 'applications').first.mockResolvedValueOnce(null);
    chain(chains, 'users').take.mockResolvedValue([userDoc({ _id: 'other_admin' })]);

    await handlers.addCandidate(ctx, args);

    expect(mockNotify).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ params: expect.objectContaining({ vacancyTitle: 'vacancy' }) }),
    );
    const call = runAfter.mock.calls.find(
      ([, ref]) => (ref as any)?._name === 'sendApplicationConfirmation',
    ) as unknown[];
    expect(call![2]).toMatchObject({ vacancyTitle: 'position' });
  });
});

// ── moveCandidate ────────────────────────────────────────────────────────────
describe('moveCandidate', () => {
  it('no-ops when the stage is unchanged', async () => {
    const { ctx, patch, insert } = makeCtx();
    ctx.get.mockResolvedValueOnce(applicationDoc({ stage: 'screening' }));
    await handlers.moveCandidate(ctx, { applicationId: APP_ID, newStage: 'screening' });
    expect(patch).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('rejects disallowed transitions', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(applicationDoc({ stage: 'applied' }));
    await expect(
      handlers.moveCandidate(ctx, { applicationId: APP_ID, newStage: 'hired' }),
    ).rejects.toThrow('Cannot move a candidate from applied to hired');
  });

  it('rejects moves from an unrecognized stage', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(applicationDoc({ stage: 'weird_stage' }));
    await expect(
      handlers.moveCandidate(ctx, { applicationId: APP_ID, newStage: 'screening' }),
    ).rejects.toThrow('Cannot move a candidate from weird_stage to screening');
  });

  it('records a stage move with reason and event', async () => {
    const { ctx, patch, insert } = makeCtx();
    ctx.get
      .mockResolvedValueOnce(applicationDoc({ stage: 'applied' }))
      .mockResolvedValueOnce(candidateDoc({ email: undefined }))
      .mockResolvedValueOnce(vacancyDoc());

    await handlers.moveCandidate(ctx, {
      applicationId: APP_ID,
      newStage: 'screening',
      reason: 'Good CV',
    });

    expect(patch).toHaveBeenCalledWith(
      APP_ID,
      expect.objectContaining({ stage: 'screening', updatedAt: expect.any(Number) }),
    );
    expect(insert).toHaveBeenCalledWith(
      'applicationEvents',
      expect.objectContaining({
        fromStage: 'applied',
        toStage: 'screening',
        changedBy: ADMIN_ID,
        reason: 'Good CV',
      }),
    );
  });

  it('sends an offer letter with the posted salary range when moving to offer', async () => {
    const { ctx, runAfter } = makeCtx();
    ctx.get
      .mockResolvedValueOnce(applicationDoc({ stage: 'interview' }))
      .mockResolvedValueOnce(candidateDoc())
      .mockResolvedValueOnce(vacancyDoc())
      .mockResolvedValueOnce(
        userDoc({ _id: 'user_mgr', name: 'Manager', email: 'mgr@example.com' }),
      );

    await handlers.moveCandidate(ctx, { applicationId: APP_ID, newStage: 'offer' });

    expect(runAfter).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ _name: 'sendOfferLetter' }),
      expect.objectContaining({
        candidateEmail: 'anna@example.com',
        salary: '1,000–1,500 USD',
        department: 'Engineering',
        contactEmail: 'mgr@example.com',
      }),
    );
  });

  it('falls back to To be discussed and the caller email for an offer without salary or manager', async () => {
    const { ctx, runAfter } = makeCtx();
    ctx.get
      .mockResolvedValueOnce(applicationDoc({ stage: 'interview' }))
      .mockResolvedValueOnce(candidateDoc())
      .mockResolvedValueOnce(
        vacancyDoc({ salary: undefined, hiringManagerId: 'ghost', department: undefined }),
      )
      .mockResolvedValueOnce(null); // hiring manager missing

    await handlers.moveCandidate(ctx, { applicationId: APP_ID, newStage: 'offer' });

    const call = runAfter.mock.calls.find(
      ([, ref]) => (ref as any)?._name === 'sendOfferLetter',
    ) as unknown[];
    expect(call![2]).toMatchObject({
      salary: 'To be discussed',
      department: 'General',
      contactEmail: 'admin@example.com',
    });
  });

  it('sends a rejection notice with the reason and stamps rejectionReason', async () => {
    const { ctx, patch, runAfter } = makeCtx();
    ctx.get
      .mockResolvedValueOnce(applicationDoc({ stage: 'screening' }))
      .mockResolvedValueOnce(candidateDoc())
      .mockResolvedValueOnce(vacancyDoc());

    await handlers.moveCandidate(ctx, {
      applicationId: APP_ID,
      newStage: 'rejected',
      reason: 'No match',
    });

    expect(patch).toHaveBeenCalledWith(
      APP_ID,
      expect.objectContaining({ stage: 'rejected', rejectionReason: 'No match' }),
    );
    expect(runAfter).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ _name: 'sendRejectionNotice' }),
      expect.objectContaining({ feedback: 'No match', encourageReapply: true }),
    );
  });

  it('skips the email when the candidate has no address', async () => {
    const { ctx, runAfter } = makeCtx();
    ctx.get
      .mockResolvedValueOnce(applicationDoc({ stage: 'interview' }))
      .mockResolvedValueOnce(candidateDoc({ email: undefined }))
      .mockResolvedValueOnce(vacancyDoc());

    await handlers.moveCandidate(ctx, { applicationId: APP_ID, newStage: 'offer' });

    expect(runAfter).not.toHaveBeenCalled();
  });

  it('sends no email for neutral stage changes even with a candidate address', async () => {
    const { ctx, runAfter } = makeCtx();
    ctx.get
      .mockResolvedValueOnce(applicationDoc({ stage: 'applied' }))
      .mockResolvedValueOnce(candidateDoc())
      .mockResolvedValueOnce(vacancyDoc());

    await handlers.moveCandidate(ctx, { applicationId: APP_ID, newStage: 'screening' });

    // Screening legitimately schedules the Telegram instructions — but no
    // email action may go out for a neutral move.
    const emailFns = [
      'sendApplicationConfirmation',
      'sendOfferLetter',
      'sendRejectionNotice',
      'sendInterviewInvitation',
    ];
    for (const call of runAfter.mock.calls) {
      expect(emailFns).not.toContain((call[1] as { _name?: string })._name);
    }
  });
});

// ── rejectCandidate ──────────────────────────────────────────────────────────
describe('rejectCandidate', () => {
  it('no-ops when the candidate is already rejected', async () => {
    const { ctx, patch } = makeCtx();
    ctx.get.mockResolvedValueOnce(applicationDoc({ stage: 'rejected' }));
    await handlers.rejectCandidate(ctx, { applicationId: APP_ID, reason: 'again' });
    expect(patch).not.toHaveBeenCalled();
  });

  it('rejects, records the event and sends the notice', async () => {
    const { ctx, patch, insert, runAfter } = makeCtx();
    ctx.get
      .mockResolvedValueOnce(applicationDoc({ stage: 'screening', rejectionReason: 'old' }))
      .mockResolvedValueOnce(candidateDoc())
      .mockResolvedValueOnce(vacancyDoc());

    await handlers.rejectCandidate(ctx, { applicationId: APP_ID, reason: 'Budget' });

    expect(patch).toHaveBeenCalledWith(
      APP_ID,
      expect.objectContaining({ stage: 'rejected', rejectionReason: 'Budget' }),
    );
    expect(insert).toHaveBeenCalledWith(
      'applicationEvents',
      expect.objectContaining({ fromStage: 'screening', toStage: 'rejected' }),
    );
    expect(runAfter).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ _name: 'sendRejectionNotice' }),
      expect.objectContaining({ feedback: 'Budget' }),
    );
  });

  it('keeps an earlier reason when none is provided', async () => {
    const { ctx, patch } = makeCtx();
    ctx.get
      .mockResolvedValueOnce(applicationDoc({ stage: 'screening', rejectionReason: 'old' }))
      .mockResolvedValueOnce(candidateDoc({ email: undefined }))
      .mockResolvedValueOnce(vacancyDoc());

    await handlers.rejectCandidate(ctx, { applicationId: APP_ID });

    expect(patch).toHaveBeenCalledWith(
      APP_ID,
      expect.not.objectContaining({ rejectionReason: 'old' }),
    );
    const payload = patch.mock.calls.find(([id]) => id === APP_ID)?.[1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('rejectionReason');
  });
});

// ── scheduleInterview ────────────────────────────────────────────────────────
describe('scheduleInterview', () => {
  const args = {
    applicationId: APP_ID,
    organizationId: ORG_A,
    interviewerId: 'user_iv',
    scheduledAt: Date.now() + 86400000,
    duration: 60,
    type: 'technical' as const,
  };

  it('rejects scheduling for a rejected or hired application', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(applicationDoc({ stage: 'rejected' }));
    await expect(handlers.scheduleInterview(ctx, args)).rejects.toThrow(
      'Cannot schedule an interview for a rejected application',
    );
    ctx.get.mockResolvedValueOnce(applicationDoc({ stage: 'hired' }));
    await expect(handlers.scheduleInterview(ctx, args)).rejects.toThrow(
      'Cannot schedule an interview for a hired application',
    );
  });

  it('enforces the CV gate', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(applicationDoc({ cvFileUrl: 'cv.pdf', cvStatus: 'pending' }));
    await expect(handlers.scheduleInterview(ctx, args)).rejects.toThrow(
      'The CV has not been approved yet',
    );
  });

  it('rejects an interviewer outside the organization', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(applicationDoc()).mockResolvedValueOnce(null);
    await expect(handlers.scheduleInterview(ctx, args)).rejects.toThrow(
      'Interviewer must belong to this organization',
    );
    ctx.get
      .mockReset()
      .mockResolvedValueOnce(applicationDoc())
      .mockResolvedValueOnce(userDoc({ organizationId: ORG_B }));
    await expect(handlers.scheduleInterview(ctx, args)).rejects.toThrow(
      'Interviewer must belong to this organization',
    );
  });

  it('rejects past dates and non-positive durations', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(applicationDoc()).mockResolvedValueOnce(userDoc());
    await expect(
      handlers.scheduleInterview(ctx, { ...args, scheduledAt: Date.now() - 1000 }),
    ).rejects.toThrow('Interviews cannot be scheduled in the past');
    ctx.get.mockReset().mockResolvedValueOnce(applicationDoc()).mockResolvedValueOnce(userDoc());
    await expect(handlers.scheduleInterview(ctx, { ...args, duration: 0 })).rejects.toThrow(
      'Interview duration must be positive',
    );
  });

  it('creates the interview and sends the invitation email', async () => {
    const { ctx, insert, runAfter } = makeCtx();
    insert.mockResolvedValueOnce(IV_ID);
    ctx.get
      .mockResolvedValueOnce(applicationDoc())
      .mockResolvedValueOnce(userDoc({ _id: 'user_iv', name: 'Ivan' }))
      .mockResolvedValueOnce(candidateDoc())
      .mockResolvedValueOnce(vacancyDoc())
      .mockResolvedValueOnce(userDoc({ _id: 'user_iv', name: 'Ivan' }));

    const id = await handlers.scheduleInterview(ctx, { ...args, meetingLink: 'zoom/x' });

    expect(id).toBe(IV_ID);
    const call = insert.mock.calls.find(([t]) => t === 'interviews') as unknown[];
    expect(call![1]).toMatchObject({
      applicationId: APP_ID,
      organizationId: ORG_A,
      status: 'scheduled',
      type: 'technical',
      meetingLink: 'zoom/x',
    });
    expect(runAfter).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ _name: 'sendInterviewInvitation' }),
      expect.objectContaining({ interviewerName: 'Ivan', interviewType: 'technical' }),
    );
  });

  it('falls back to HR Team for an unnamed interviewer', async () => {
    const { ctx, runAfter } = makeCtx();
    ctx.get
      .mockResolvedValueOnce(applicationDoc())
      .mockResolvedValueOnce(userDoc({ _id: 'user_iv' })) // interviewer validation
      .mockResolvedValueOnce(candidateDoc())
      .mockResolvedValueOnce(vacancyDoc())
      .mockResolvedValueOnce(null); // invitedBy lookup → HR Team

    await handlers.scheduleInterview(ctx, args);

    const call = runAfter.mock.calls.find(
      ([, ref]) => (ref as any)?._name === 'sendInterviewInvitation',
    ) as unknown[];
    expect(call![2]).toMatchObject({ interviewerName: 'HR Team' });
  });

  it('skips the invitation email when the candidate has no address', async () => {
    const { ctx, runAfter } = makeCtx();
    ctx.get
      .mockResolvedValueOnce(applicationDoc())
      .mockResolvedValueOnce(userDoc({ _id: 'user_iv' }))
      .mockResolvedValueOnce(candidateDoc({ email: undefined }))
      .mockResolvedValueOnce(vacancyDoc());

    await handlers.scheduleInterview(ctx, args);

    expect(runAfter).not.toHaveBeenCalled();
  });
});

// ── updateInterviewStatus ────────────────────────────────────────────────────
describe('updateInterviewStatus', () => {
  it('throws for a missing interview', async () => {
    const { ctx } = makeCtx();
    await expect(
      handlers.updateInterviewStatus(ctx, { interviewId: IV_ID, status: 'completed' }),
    ).rejects.toThrow('Interview not found');
  });

  it('throws for a non-staff outsider', async () => {
    mockAssertOrgScope.mockResolvedValueOnce(
      makeScope({
        isStaff: false,
        isAdmin: false,
        caller: { _id: 'outsider', role: 'employee', organizationId: ORG_A },
      }),
    );
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(interviewDoc({ interviewerId: 'someone_else' }));
    await expect(
      handlers.updateInterviewStatus(ctx, { interviewId: IV_ID, status: 'completed' }),
    ).rejects.toThrow('Not authorized for this interview');
  });

  it('lets the interviewer close out their own slot', async () => {
    mockAssertOrgScope.mockResolvedValueOnce(
      makeScope({
        isStaff: false,
        isAdmin: false,
        caller: { _id: 'user_iv', role: 'employee', organizationId: ORG_A },
      }),
    );
    const { ctx, patch } = makeCtx();
    ctx.get.mockResolvedValueOnce(interviewDoc());

    await handlers.updateInterviewStatus(ctx, {
      interviewId: IV_ID,
      status: 'no_show',
      notes: 'never joined',
    });

    expect(patch).toHaveBeenCalledWith(IV_ID, { status: 'no_show', notes: 'never joined' });
  });

  it('patches only the status when no notes are provided', async () => {
    const { ctx, patch } = makeCtx();
    ctx.get.mockResolvedValueOnce(interviewDoc());

    await handlers.updateInterviewStatus(ctx, { interviewId: IV_ID, status: 'cancelled' });

    expect(patch).toHaveBeenCalledWith(IV_ID, { status: 'cancelled' });
  });
});

// ── submitScorecard ──────────────────────────────────────────────────────────
describe('submitScorecard', () => {
  const args = {
    applicationId: APP_ID,
    organizationId: ORG_A,
    interviewId: IV_ID,
    ratings: [{ criterion: 'Skill', score: 4 }],
    overallScore: 4,
    recommendation: 'yes' as const,
    summary: 'Good',
  };

  it('throws when the interview does not belong to the application', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(applicationDoc()).mockResolvedValueOnce(null);
    await expect(handlers.submitScorecard(ctx, args)).rejects.toThrow(
      'Interview does not belong to this application',
    );
    ctx.get
      .mockReset()
      .mockResolvedValueOnce(applicationDoc())
      .mockResolvedValueOnce(interviewDoc({ applicationId: APP_2 }));
    await expect(handlers.submitScorecard(ctx, args)).rejects.toThrow(
      'Interview does not belong to this application',
    );
  });

  it('throws when a non-staff outsider tries to score', async () => {
    mockAssertOrgScope.mockResolvedValueOnce(
      makeScope({
        isStaff: false,
        isAdmin: false,
        caller: { _id: 'outsider', role: 'employee', organizationId: ORG_A },
      }),
    );
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(applicationDoc()).mockResolvedValueOnce(interviewDoc());
    await expect(handlers.submitScorecard(ctx, args)).rejects.toThrow(
      'Not authorized to score this interview',
    );
  });

  it('rejects out-of-range scores', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(applicationDoc()).mockResolvedValueOnce(interviewDoc());
    await expect(
      handlers.submitScorecard(ctx, { ...args, ratings: [{ criterion: 'x', score: 0 }] }),
    ).rejects.toThrow('Each score must be between 1 and 5');
    ctx.get
      .mockReset()
      .mockResolvedValueOnce(applicationDoc())
      .mockResolvedValueOnce(interviewDoc());
    await expect(
      handlers.submitScorecard(ctx, { ...args, ratings: [{ criterion: 'x', score: 6 }] }),
    ).rejects.toThrow('Each score must be between 1 and 5');
    ctx.get
      .mockReset()
      .mockResolvedValueOnce(applicationDoc())
      .mockResolvedValueOnce(interviewDoc());
    await expect(
      handlers.submitScorecard(ctx, { ...args, ratings: [{ criterion: 'x', score: Number.NaN }] }),
    ).rejects.toThrow('Each score must be between 1 and 5');
  });

  it('rejects an out-of-range overall score', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(applicationDoc()).mockResolvedValueOnce(interviewDoc());
    await expect(handlers.submitScorecard(ctx, { ...args, overallScore: 7 })).rejects.toThrow(
      'The overall score must be between 1 and 5',
    );
  });

  it('completes the interview and stores the scorecard', async () => {
    const { ctx, insert, patch } = makeCtx();
    insert.mockResolvedValueOnce(SC_ID);
    ctx.get.mockResolvedValueOnce(applicationDoc()).mockResolvedValueOnce(interviewDoc());

    const id = await handlers.submitScorecard(ctx, args);

    expect(id).toBe(SC_ID);
    expect(patch).toHaveBeenCalledWith(IV_ID, { status: 'completed' });
    const call = insert.mock.calls.find(([t]) => t === 'interviewScorecards') as unknown[];
    expect(call![1]).toMatchObject({
      applicationId: APP_ID,
      organizationId: ORG_A,
      interviewerId: ADMIN_ID,
      overallScore: 4,
      recommendation: 'yes',
      createdAt: expect.any(Number),
    });
  });

  it('stores a scorecard without an interview reference', async () => {
    const { ctx, patch, insert } = makeCtx();
    insert.mockResolvedValueOnce(SC_ID);
    ctx.get.mockResolvedValueOnce(applicationDoc());

    await handlers.submitScorecard(ctx, { ...args, interviewId: undefined });

    expect(patch).not.toHaveBeenCalled();
    const call = insert.mock.calls.find(([t]) => t === 'interviewScorecards') as unknown[];
    expect(call![1]).toMatchObject({ interviewId: undefined, interviewerId: ADMIN_ID });
  });
});

// ── updateCandidateNotes ─────────────────────────────────────────────────────
describe('updateCandidateNotes', () => {
  it('patches the notes with a fresh updatedAt', async () => {
    const { ctx, patch } = makeCtx();
    ctx.get.mockResolvedValueOnce(applicationDoc());

    await handlers.updateCandidateNotes(ctx, {
      applicationId: APP_ID,
      notes: 'Call back next week',
    });

    expect(patch).toHaveBeenCalledWith(
      APP_ID,
      expect.objectContaining({ notes: 'Call back next week', updatedAt: expect.any(Number) }),
    );
  });

  it('throws for an application outside the caller org', async () => {
    mockScopeOwnsRecord.mockReturnValueOnce(false);
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(applicationDoc());
    await expect(
      handlers.updateCandidateNotes(ctx, { applicationId: APP_ID, notes: 'x' }),
    ).rejects.toThrow('Not authorized for this application');
  });
});

// ── reviewCv ─────────────────────────────────────────────────────────────────
describe('reviewCv', () => {
  it('throws when the application has no CV', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(applicationDoc());
    await expect(
      handlers.reviewCv(ctx, { applicationId: APP_ID, decision: 'approved' }),
    ).rejects.toThrow('This application has no CV to review');
  });

  it('records the decision and an event, returning the status', async () => {
    const { ctx, patch, insert } = makeCtx();
    ctx.get.mockResolvedValueOnce(applicationDoc({ cvFileUrl: 'cv.pdf', stage: 'screening' }));

    const res = await handlers.reviewCv(ctx, {
      applicationId: APP_ID,
      decision: 'approved',
      note: 'Looks good',
    });

    expect(res).toEqual({ cvStatus: 'approved' });
    expect(patch).toHaveBeenCalledWith(
      APP_ID,
      expect.objectContaining({
        cvStatus: 'approved',
        cvReviewedBy: ADMIN_ID,
        cvReviewedAt: expect.any(Number),
        cvReviewNote: 'Looks good',
      }),
    );
    expect(insert).toHaveBeenCalledWith(
      'applicationEvents',
      expect.objectContaining({ reason: 'CV approved: Looks good' }),
    );
  });

  it('builds the event reason without a note', async () => {
    const { ctx, insert } = makeCtx();
    ctx.get.mockResolvedValueOnce(applicationDoc({ cvFileUrl: 'cv.pdf' }));

    await handlers.reviewCv(ctx, { applicationId: APP_ID, decision: 'rejected' });

    expect(insert).toHaveBeenCalledWith(
      'applicationEvents',
      expect.objectContaining({ reason: 'CV rejected' }),
    );
  });
});

// ── listCvQueue ──────────────────────────────────────────────────────────────
describe('listCvQueue', () => {
  it('returns [] for a non-staff caller', async () => {
    mockResolveOrgStaff.mockResolvedValueOnce(null);
    const { ctx } = makeCtx();
    await expect(handlers.listCvQueue(ctx, { organizationId: ORG_A })).resolves.toEqual([]);
  });

  it('lists pending CVs sorted by upload time', async () => {
    const { ctx, chains } = makeCtx();
    ctx.get.mockImplementation((id: string) => {
      if (id === CAND_ID) return Promise.resolve(candidateDoc());
      if (id === VAC_ID) return Promise.resolve(vacancyDoc());
      return Promise.resolve(null);
    });
    const appCh = chain(chains, 'applications');
    appCh.take.mockResolvedValue([
      applicationDoc({ cvUploadedAt: 300 }),
      applicationDoc({ _id: APP_2, cvUploadedAt: 100 }),
      applicationDoc({ _id: 'app_no_ts' }), // no upload timestamp
      applicationDoc({ _id: 'app_no_ts2' }), // another one, for the comparator's b-side
    ]);

    const res = (await handlers.listCvQueue(ctx, { organizationId: ORG_A })) as any[];

    expect(res.map((r) => r._id)).toEqual(['app_no_ts', 'app_no_ts2', APP_2, APP_ID]);
    expect(res[0]).toMatchObject({
      candidateName: 'Anna Petrova',
      vacancyTitle: 'Frontend Engineer',
    });
    expect(appCh.withIndex).toHaveBeenCalledWith('by_org_cvStatus', expect.any(Function));
  });

  it('falls back to Unknown labels when the rows are gone', async () => {
    const { ctx, chains } = makeCtx();
    ctx.get.mockResolvedValue(null);
    const appCh = chain(chains, 'applications');
    appCh.take.mockResolvedValue([applicationDoc({ cvUploadedAt: 100 })]);

    const res = (await handlers.listCvQueue(ctx, { organizationId: ORG_A })) as any[];

    expect(res[0].candidateName).toBe('Unknown');
    expect(res[0].candidateEmail).toBeUndefined();
    expect(res[0].vacancyTitle).toBe('Unknown');
  });
});

// ── hireCandidate ────────────────────────────────────────────────────────────
describe('hireCandidate', () => {
  it('throws when the candidate is already hired', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(applicationDoc({ stage: 'hired' }));
    await expect(handlers.hireCandidate(ctx, { applicationId: APP_ID })).rejects.toThrow(
      'Candidate already hired',
    );
  });

  it('throws when hiring is not a legal move from the current stage', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(applicationDoc({ stage: 'applied' }));
    await expect(handlers.hireCandidate(ctx, { applicationId: APP_ID })).rejects.toThrow(
      'Cannot hire from applied',
    );
  });

  it('enforces the CV gate', async () => {
    const { ctx } = makeCtx();
    // Hiring is legal from offer; the pending CV must still block it.
    ctx.get.mockResolvedValueOnce(
      applicationDoc({ stage: 'offer', cvFileUrl: 'cv.pdf', cvStatus: 'pending' }),
    );
    await expect(handlers.hireCandidate(ctx, { applicationId: APP_ID })).rejects.toThrow(
      'The CV has not been approved yet',
    );
  });

  it('throws for an unrecognized stage', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(applicationDoc({ stage: 'weird' }));
    await expect(handlers.hireCandidate(ctx, { applicationId: APP_ID })).rejects.toThrow(
      'Cannot hire from weird',
    );
  });

  it('hires an existing user, picks the department template, finds a buddy and starts onboarding', async () => {
    const { ctx, patch, insert, runMutation, chains } = makeCtx();
    ctx.get.mockImplementation((id: string) => {
      if (id === APP_ID) return Promise.resolve(applicationDoc({ stage: 'offer' }));
      if (id === CAND_ID) return Promise.resolve(candidateDoc());
      if (id === VAC_ID) return Promise.resolve(vacancyDoc({ hiringManagerId: 'user_mgr' }));
      return Promise.resolve(null);
    });
    const usersCh = chain(chains, 'users');
    usersCh.take
      .mockResolvedValueOnce([
        userDoc({ _id: ADMIN_ID }), // self — skipped
        userDoc({ _id: 'user_admin2' }), // other admin — notified
      ])
      .mockResolvedValueOnce([userDoc({ _id: 'user_buddy' })]); // buddy pool
    usersCh.first.mockResolvedValueOnce(userDoc({ _id: 'user_existing' })); // user by email
    const tplCh = chain(chains, 'onboardingTemplates');
    tplCh.take.mockResolvedValue([
      { _id: 'tpl_dept', department: 'Engineering', isActive: true },
      { _id: 'tpl_first', department: 'Sales', isActive: true },
    ]);

    const res = (await handlers.hireCandidate(ctx, {
      applicationId: APP_ID,
      startDate: 1_800_000_000_000,
      department: 'Engineering',
    })) as any;

    expect(res).toEqual({ applicationId: APP_ID, candidateId: CAND_ID });
    expect(patch).toHaveBeenCalledWith(APP_ID, expect.objectContaining({ stage: 'hired' }));
    // The other admin is notified, the acting admin is skipped.
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ userId: 'user_admin2', titleKey: 'notifications.titles.newHire' }),
    );
    // No new user inserted — an account already existed for the email.
    expect(insert).not.toHaveBeenCalledWith('users', expect.anything());
    expect(runMutation).toHaveBeenCalledWith(
      expect.objectContaining({ _name: 'startOnboarding' }),
      expect.objectContaining({
        employeeId: 'user_existing',
        templateId: 'tpl_dept',
        buddyId: 'user_buddy',
        managerId: 'user_mgr',
        startDate: 1_800_000_000_000,
      }),
    );
  });

  it('creates a new employee account when the candidate has no user yet', async () => {
    const { ctx, insert, runMutation, chains } = makeCtx();
    ctx.get.mockImplementation((id: string) => {
      if (id === APP_ID) return Promise.resolve(applicationDoc({ stage: 'offer' }));
      if (id === CAND_ID) return Promise.resolve(candidateDoc());
      if (id === VAC_ID) return Promise.resolve(vacancyDoc({ hiringManagerId: undefined }));
      return Promise.resolve(null);
    });
    const usersCh = chain(chains, 'users');
    usersCh.take.mockResolvedValueOnce([userDoc({ _id: ADMIN_ID })]); // only self → no notify
    usersCh.first.mockResolvedValueOnce(null); // no existing user by email
    insert
      .mockResolvedValueOnce(APP_ID) // applicationEvents
      .mockResolvedValueOnce('user_new'); // users
    const tplCh = chain(chains, 'onboardingTemplates');
    tplCh.take.mockResolvedValue([{ _id: 'tpl_first', department: 'Sales', isActive: true }]);
    mockResolveOrgUnitsByName.mockResolvedValue({ departmentId: DEPT_ID, positionId: 'pos_1' });
    mockGetStartingLeaveBalances.mockResolvedValue({ annualLeaveDays: 20, sickLeaveDays: 5 });

    await handlers.hireCandidate(ctx, { applicationId: APP_ID });

    expect(mockResolveOrgUnitsByName).toHaveBeenCalledWith(
      ctx,
      ORG_A,
      expect.objectContaining({ department: 'Engineering', position: 'Frontend Engineer' }),
      { create: true },
    );
    expect(mockGetStartingLeaveBalances).toHaveBeenCalledWith(ctx, ORG_A);
    const userCall = insert.mock.calls.find(([t]) => t === 'users') as unknown[];
    expect(userCall![1]).toMatchObject({
      organizationId: ORG_A,
      name: 'Anna Petrova',
      email: 'anna@example.com',
      role: 'employee',
      isActive: true,
      isApproved: true,
      approvedBy: ADMIN_ID,
      departmentId: DEPT_ID,
      positionId: 'pos_1',
      annualLeaveDays: 20,
      sickLeaveDays: 5,
    });
    // No department passed → falls back to the first active template; no
    // buddy pool → buddyId undefined; no hiring manager → managerId = caller.
    expect(runMutation).toHaveBeenCalledWith(
      expect.objectContaining({ _name: 'startOnboarding' }),
      expect.objectContaining({
        employeeId: 'user_new',
        templateId: 'tpl_first',
        buddyId: undefined,
        managerId: ADMIN_ID,
      }),
    );
  });

  it('skips onboarding entirely when the candidate has no email', async () => {
    const { ctx, runMutation, chains } = makeCtx();
    ctx.get.mockImplementation((id: string) => {
      if (id === APP_ID) return Promise.resolve(applicationDoc({ stage: 'offer' }));
      if (id === CAND_ID) return Promise.resolve(candidateDoc({ email: undefined }));
      if (id === VAC_ID) return Promise.resolve(vacancyDoc());
      return Promise.resolve(null);
    });
    const usersCh = chain(chains, 'users');
    usersCh.take.mockResolvedValueOnce([userDoc({ _id: ADMIN_ID })]);

    await handlers.hireCandidate(ctx, { applicationId: APP_ID });

    expect(runMutation).not.toHaveBeenCalled();
  });

  it('falls back to generic labels in the new-hire notification', async () => {
    const { ctx, chains } = makeCtx();
    ctx.get.mockImplementation((id: string) => {
      if (id === APP_ID) return Promise.resolve(applicationDoc({ stage: 'offer' }));
      if (id === CAND_ID) return Promise.resolve(candidateDoc({ name: '', email: undefined }));
      if (id === VAC_ID) return Promise.resolve(vacancyDoc({ title: undefined }));
      return Promise.resolve(null);
    });
    const usersCh = chain(chains, 'users');
    usersCh.take.mockResolvedValueOnce([
      userDoc({ _id: 'other_admin' }),
      userDoc({ _id: ADMIN_ID }),
    ]);

    await handlers.hireCandidate(ctx, { applicationId: APP_ID });

    expect(mockNotify).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        params: { candidateName: 'Candidate', vacancyTitle: 'position' },
      }),
    );
  });

  it('falls back to the first active template when the department has none', async () => {
    const { ctx, runMutation, insert, chains } = makeCtx();
    ctx.get.mockImplementation((id: string) => {
      if (id === APP_ID) return Promise.resolve(applicationDoc({ stage: 'offer' }));
      if (id === CAND_ID) return Promise.resolve(candidateDoc());
      if (id === VAC_ID) return Promise.resolve(vacancyDoc());
      return Promise.resolve(null);
    });
    const usersCh = chain(chains, 'users');
    usersCh.take.mockResolvedValueOnce([userDoc({ _id: ADMIN_ID })]); // only self → no notify
    usersCh.first.mockResolvedValueOnce(null); // no existing user
    insert.mockResolvedValueOnce(APP_ID).mockResolvedValueOnce('user_new');
    const tplCh = chain(chains, 'onboardingTemplates');
    tplCh.take.mockResolvedValue([
      { _id: 'tpl_dept', department: 'Engineering', isActive: true },
      { _id: 'tpl_first', department: 'Sales', isActive: true },
    ]);
    mockResolveOrgUnitsByName.mockResolvedValue({ departmentId: DEPT_ID, positionId: 'pos_1' });
    mockGetStartingLeaveBalances.mockResolvedValue({});

    await handlers.hireCandidate(ctx, { applicationId: APP_ID, department: 'Marketing' });

    // No template matches Marketing → first active template wins.
    expect(runMutation).toHaveBeenCalledWith(
      expect.objectContaining({ _name: 'startOnboarding' }),
      expect.objectContaining({ templateId: 'tpl_dept' }),
    );
  });

  it('logs a warning when onboarding setup fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { ctx, chains } = makeCtx();
      ctx.get.mockImplementation((id: string) => {
        if (id === APP_ID) return Promise.resolve(applicationDoc({ stage: 'offer' }));
        if (id === CAND_ID) return Promise.resolve(candidateDoc());
        if (id === VAC_ID) return Promise.resolve(vacancyDoc());
        return Promise.resolve(null);
      });
      const usersCh = chain(chains, 'users');
      usersCh.take.mockResolvedValueOnce([userDoc({ _id: ADMIN_ID })]);
      usersCh.first.mockResolvedValueOnce(null);
      mockResolveOrgUnitsByName.mockRejectedValue(new Error('Boom'));

      const res = (await handlers.hireCandidate(ctx, { applicationId: APP_ID })) as any;

      expect(res).toEqual({ applicationId: APP_ID, candidateId: CAND_ID });
      expect(warnSpy).toHaveBeenCalledWith('Failed to auto-create onboarding program:', 'Boom');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('swallows the duplicate-onboarding error silently', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { ctx, chains } = makeCtx();
      ctx.get.mockImplementation((id: string) => {
        if (id === APP_ID) return Promise.resolve(applicationDoc({ stage: 'offer' }));
        if (id === CAND_ID) return Promise.resolve(candidateDoc());
        if (id === VAC_ID) return Promise.resolve(vacancyDoc());
        return Promise.resolve(null);
      });
      const usersCh = chain(chains, 'users');
      usersCh.take.mockResolvedValueOnce([userDoc({ _id: ADMIN_ID })]);
      usersCh.first.mockResolvedValueOnce(null);
      mockResolveOrgUnitsByName.mockRejectedValue(
        new Error('already has an active onboarding program'),
      );

      await handlers.hireCandidate(ctx, { applicationId: APP_ID });

      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('logs the generic message when a non-Error value is thrown', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { ctx, chains } = makeCtx();
      ctx.get.mockImplementation((id: string) => {
        if (id === APP_ID) return Promise.resolve(applicationDoc({ stage: 'offer' }));
        if (id === CAND_ID) return Promise.resolve(candidateDoc());
        if (id === VAC_ID) return Promise.resolve(vacancyDoc());
        return Promise.resolve(null);
      });
      const usersCh = chain(chains, 'users');
      usersCh.take.mockResolvedValueOnce([userDoc({ _id: ADMIN_ID })]);
      usersCh.first.mockResolvedValueOnce(null);
      mockResolveOrgUnitsByName.mockRejectedValue('raw string failure');

      await handlers.hireCandidate(ctx, { applicationId: APP_ID });

      expect(warnSpy).toHaveBeenCalledWith(
        'Failed to auto-create onboarding program:',
        'Unknown error',
      );
    } finally {
      warnSpy.mockRestore();
    }
  });
});

// ── secureDeleteVacancy ──────────────────────────────────────────────────────
describe('secureDeleteVacancy', () => {
  it('throws for a missing vacancy', async () => {
    const { ctx } = makeCtx();
    await expect(handlers.secureDeleteVacancy(ctx, { vacancyId: VAC_ID })).rejects.toThrow(
      'Vacancy not found',
    );
  });

  it('throws when the caller is not an admin of the org', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(vacancyDoc());
    mockScopeOwnsRecord.mockReturnValueOnce(false);
    await expect(handlers.secureDeleteVacancy(ctx, { vacancyId: VAC_ID })).rejects.toThrow(
      'Access denied',
    );
  });

  it('purges the vacancy and its data', async () => {
    const { ctx, remove, chains } = makeCtx();
    ctx.get.mockResolvedValueOnce(vacancyDoc());
    const appCh = chain(chains, 'applications');
    appCh.take.mockResolvedValue([applicationDoc()]);
    appCh.first.mockResolvedValue(null);
    const evCh = chain(chains, 'applicationEvents');
    evCh.take.mockResolvedValue([eventDoc()]);

    await handlers.secureDeleteVacancy(ctx, { vacancyId: VAC_ID });

    expect(remove).toHaveBeenCalledWith('ev_1');
    expect(remove).toHaveBeenCalledWith(APP_ID);
    expect(remove).toHaveBeenCalledWith(CAND_ID);
    expect(remove).toHaveBeenCalledWith(VAC_ID);
  });
});

// ── secureDeleteCandidate ────────────────────────────────────────────────────
describe('secureDeleteCandidate', () => {
  it('purges the application and orphaned candidate', async () => {
    const { ctx, remove, chains } = makeCtx();
    ctx.get.mockResolvedValueOnce(applicationDoc());
    const appCh = chain(chains, 'applications');
    appCh.first.mockResolvedValue(null);

    await handlers.secureDeleteCandidate(ctx, { applicationId: APP_ID });

    expect(remove).toHaveBeenCalledWith(APP_ID);
    expect(remove).toHaveBeenCalledWith(CAND_ID);
  });

  it('rejects an application outside the caller org', async () => {
    mockScopeOwnsRecord.mockReturnValueOnce(false);
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(applicationDoc());
    await expect(handlers.secureDeleteCandidate(ctx, { applicationId: APP_ID })).rejects.toThrow(
      'Not authorized for this application',
    );
  });
});
