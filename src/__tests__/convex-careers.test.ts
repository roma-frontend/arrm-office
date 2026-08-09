/**
 * Tests for convex/careers.ts — the public career page: open vacancies across
 * orgs, active org listing, vacancy details and the public application
 * mutation with CV validation, candidate dedupe and admin notifications.
 *
 * Pattern: convex-recruitment.test.ts — mock `_generated/server` and
 * lib/notify, run convex/values + lib/limits for real, require the module
 * inside jest.isolateModules.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Mocks ────────────────────────────────────────────────────────────────────
jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
  action: ({ handler, args }: any) => ({ handler, args }),
  internalMutation: ({ handler, args }: any) => ({ handler, args }),
  internalQuery: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/notify', () => ({
  notify: jest.fn(),
}));

// ── Module under test ────────────────────────────────────────────────────────
let mockNotify: jest.Mock;

type Handler = (ctx: any, args: any) => Promise<unknown>;
const handlers: Record<string, Handler> = {};

beforeEach(() => {
  jest.clearAllMocks();
  mockNotify = jest.requireMock('../../convex/lib/notify').notify;
  mockNotify.mockResolvedValue('notif_1');

  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../convex/careers');
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
const VAC_ID = 'vac_1';
const CAND_ID = 'cand_1';
const APP_ID = 'app_1';
const CREATED_BY = 'user_mgr';

function orgDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: ORG_A,
    name: 'Acme',
    slug: 'acme',
    logoUrl: 'https://cdn.acme/logo.png',
    industry: 'IT',
    isActive: true,
    primaryColor: '#3b82f6',
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
    status: 'open' as const,
    createdBy: CREATED_BY,
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

function longDescription() {
  return 'x'.repeat(250);
}

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
  const chains = new Map<string, ReturnType<typeof makeChain>>();
  const db = {
    get,
    insert,
    query: jest.fn((table: string) => {
      if (!chains.has(table)) chains.set(table, makeChain());
      return chains.get(table)!;
    }),
  };
  return { ctx: { db, get, insert }, get, insert, chains, db };
}

function chain(
  chains: Map<string, ReturnType<typeof makeChain>>,
  table: string,
): ReturnType<typeof makeChain> {
  if (!chains.has(table)) chains.set(table, makeChain());
  return chains.get(table)!;
}

// ── listAllOpenVacancies ─────────────────────────────────────────────────────
describe('listAllOpenVacancies', () => {
  it('returns an empty list when there are no vacancies', async () => {
    const { ctx } = makeCtx();
    await expect(handlers.listAllOpenVacancies(ctx)).resolves.toEqual([]);
  });

  it('keeps only vacancies whose org exists and is active, and truncates long descriptions', async () => {
    const { ctx, chains } = makeCtx();
    ctx.get.mockImplementation((id: string) =>
      id === ORG_A
        ? Promise.resolve(orgDoc())
        : id === ORG_B
          ? Promise.resolve(orgDoc({ _id: ORG_B, isActive: false }))
          : Promise.resolve(null),
    );
    const vacCh = chain(chains, 'vacancies');
    vacCh.take.mockResolvedValue([
      vacancyDoc({ _id: 'vac_long', description: longDescription() }),
      vacancyDoc({ _id: VAC_ID, description: 'Short' }),
      vacancyDoc({ _id: 'vac_orgB', organizationId: ORG_B }), // inactive org
      vacancyDoc({ _id: 'vac_missing', organizationId: 'org_ghost' }), // org absent from map
    ]);
    const res = (await handlers.listAllOpenVacancies(ctx)) as any[];

    expect(res).toHaveLength(2);
    expect(res[0]._id).toBe('vac_long');
    expect(res[0].excerpt).toBe('x'.repeat(200) + '...');
    expect(res[1].excerpt).toBe('Short');
    expect(res[1].org).toMatchObject({ _id: ORG_A, name: 'Acme', slug: 'acme' });
    expect(vacCh.withIndex).toHaveBeenCalledWith('by_status', expect.any(Function));
  });

  it('drops vacancies whose org is present but inactive', async () => {
    const { ctx, chains } = makeCtx();
    ctx.get.mockResolvedValue(orgDoc({ isActive: false }));
    chain(chains, 'vacancies').take.mockResolvedValue([vacancyDoc()]);

    const res = (await handlers.listAllOpenVacancies(ctx)) as any[];

    expect(res).toHaveLength(0);
  });
});

// ── listActiveOrganizations ──────────────────────────────────────────────────
describe('listActiveOrganizations', () => {
  it('returns [] when there are no organizations', async () => {
    const { ctx } = makeCtx();
    await expect(handlers.listActiveOrganizations(ctx)).resolves.toEqual([]);
  });

  it('filters out inactive orgs and sorts active ones by name', async () => {
    const { ctx, chains } = makeCtx();
    chain(chains, 'organizations').take.mockResolvedValue([
      orgDoc({ _id: ORG_B, name: 'Zeta', isActive: true }),
      orgDoc({ name: 'Acme', isActive: true }),
      orgDoc({ _id: 'org_dead', name: 'AAA Dead', isActive: false }),
    ]);

    const res = (await handlers.listActiveOrganizations(ctx)) as any[];

    expect(res.map((o) => o.name)).toEqual(['Acme', 'Zeta']);
    expect(res[0]).toMatchObject({ _id: ORG_A, slug: 'acme', industry: 'IT' });
  });
});

// ── listOpenVacancies ────────────────────────────────────────────────────────
describe('listOpenVacancies', () => {
  it('returns an empty payload for a missing org', async () => {
    const { ctx } = makeCtx();
    await expect(handlers.listOpenVacancies(ctx, { orgSlug: 'acme' })).resolves.toEqual({
      org: null,
      vacancies: [],
    });
  });

  it('returns an empty payload for an inactive org', async () => {
    const { ctx, chains } = makeCtx();
    chain(chains, 'organizations').first.mockResolvedValue(orgDoc({ isActive: false }));
    await expect(handlers.listOpenVacancies(ctx, { orgSlug: 'acme' })).resolves.toEqual({
      org: null,
      vacancies: [],
    });
  });

  it('returns the org and truncated vacancy cards', async () => {
    const { ctx, chains } = makeCtx();
    chain(chains, 'organizations').first.mockResolvedValue(orgDoc());
    const vacCh = chain(chains, 'vacancies');
    vacCh.take.mockResolvedValue([
      vacancyDoc({ _id: 'vac_long', description: longDescription() }),
      vacancyDoc({ description: 'Short' }),
    ]);

    const res = (await handlers.listOpenVacancies(ctx, { orgSlug: 'acme' })) as any;

    expect(res.org).toMatchObject({
      name: 'Acme',
      slug: 'acme',
      primaryColor: '#3b82f6',
      industry: 'IT',
    });
    expect(res.vacancies).toHaveLength(2);
    expect(res.vacancies[0].excerpt).toBe('x'.repeat(200) + '...');
    expect(res.vacancies[1].excerpt).toBe('Short');
    expect(vacCh.withIndex).toHaveBeenCalledWith('by_org_status', expect.any(Function));
  });
});

// ── getVacancyDetails ────────────────────────────────────────────────────────
describe('getVacancyDetails', () => {
  it('returns null for a missing vacancy', async () => {
    const { ctx } = makeCtx();
    await expect(handlers.getVacancyDetails(ctx, { vacancyId: VAC_ID })).resolves.toBeNull();
  });

  it('returns null for a closed vacancy', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(vacancyDoc({ status: 'closed' }));
    await expect(handlers.getVacancyDetails(ctx, { vacancyId: VAC_ID })).resolves.toBeNull();
  });

  it('returns the full details with the org name', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(vacancyDoc()).mockResolvedValueOnce(orgDoc({ name: 'Acme Inc' }));

    const res = (await handlers.getVacancyDetails(ctx, { vacancyId: VAC_ID })) as any;

    expect(res).toMatchObject({
      _id: VAC_ID,
      title: 'Frontend Engineer',
      description: 'Build the product',
      requirements: 'React',
      orgName: 'Acme Inc',
    });
  });

  it('leaves orgName undefined when the org is gone', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(vacancyDoc()).mockResolvedValueOnce(null);
    const res = (await handlers.getVacancyDetails(ctx, { vacancyId: VAC_ID })) as any;
    expect(res.orgName).toBeUndefined();
  });
});

// ── applyToVacancy ───────────────────────────────────────────────────────────
describe('applyToVacancy', () => {
  const baseArgs = {
    vacancyId: VAC_ID,
    name: 'Anna Petrova',
    email: '  ANNA@Example.COM ',
    consentGiven: true,
  };

  it('throws when consent is not given', async () => {
    const { ctx } = makeCtx();
    await expect(
      handlers.applyToVacancy(ctx, { ...baseArgs, consentGiven: false }),
    ).rejects.toThrow('Privacy consent is required');
  });

  it('throws when the vacancy is missing or closed', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(null);
    await expect(handlers.applyToVacancy(ctx, baseArgs)).rejects.toThrow(
      'This vacancy is no longer accepting applications',
    );
    ctx.get.mockReset().mockResolvedValueOnce(vacancyDoc({ status: 'closed' }));
    await expect(handlers.applyToVacancy(ctx, baseArgs)).rejects.toThrow(
      'This vacancy is no longer accepting applications',
    );
  });

  it('rejects CVs not hosted on res.cloudinary.com', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(vacancyDoc());
    await expect(
      handlers.applyToVacancy(ctx, { ...baseArgs, cvFileUrl: 'https://evil.example/cv.pdf' }),
    ).rejects.toThrow('The CV must be uploaded through this form');
  });

  it('rejects non-PDF mime types', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(vacancyDoc());
    await expect(
      handlers.applyToVacancy(ctx, {
        ...baseArgs,
        cvFileUrl: 'https://res.cloudinary.com/x/cv.pdf',
        cvMimeType: 'image/png',
      }),
    ).rejects.toThrow('The CV must be a PDF');
  });

  it('rejects CVs over the size cap', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(vacancyDoc());
    await expect(
      handlers.applyToVacancy(ctx, {
        ...baseArgs,
        cvFileUrl: 'https://res.cloudinary.com/x/cv.pdf',
        cvFileSize: 11 * 1024 * 1024,
      }),
    ).rejects.toThrow('The CV is too large');
  });

  it('throws when the candidate profile cannot be created', async () => {
    const { ctx, chains } = makeCtx();
    ctx.get.mockResolvedValueOnce(vacancyDoc()).mockResolvedValue(null); // candidate fetch after insert → null
    chain(chains, 'candidateProfiles').first.mockResolvedValue(null);
    chain(chains, 'applications').first.mockResolvedValue(null);

    await expect(handlers.applyToVacancy(ctx, baseArgs)).rejects.toThrow(
      'Failed to create candidate',
    );
  });

  it('throws when the candidate already applied', async () => {
    const { ctx, chains } = makeCtx();
    ctx.get.mockResolvedValueOnce(vacancyDoc()).mockResolvedValueOnce({ _id: CAND_ID });
    const candCh = chain(chains, 'candidateProfiles');
    candCh.first.mockResolvedValueOnce(null); // no existing profile
    const appCh = chain(chains, 'applications');
    appCh.first.mockResolvedValueOnce({ _id: APP_ID }); // duplicate application

    await expect(handlers.applyToVacancy(ctx, baseArgs)).rejects.toThrow(
      'You have already applied to this position',
    );
  });

  it('creates the profile + application without CV and notifies every org admin', async () => {
    const { ctx, insert, chains } = makeCtx();
    ctx.get.mockResolvedValueOnce(vacancyDoc()).mockResolvedValueOnce({ _id: CAND_ID }); // candidate fetch after insert
    insert.mockResolvedValueOnce(CAND_ID).mockResolvedValueOnce(APP_ID);
    const candCh = chain(chains, 'candidateProfiles');
    candCh.first.mockResolvedValueOnce(null); // new candidate
    const appCh = chain(chains, 'applications');
    appCh.first.mockResolvedValueOnce(null); // no duplicate
    const usersCh = chain(chains, 'users');
    // The chain mock executes the role filter predicate for coverage but does
    // not actually filter, so only staff rows are supplied here.
    usersCh.take.mockResolvedValue([
      { _id: 'user_admin1', role: 'admin' },
      { _id: 'user_super', role: 'superadmin' },
    ]);

    const res = (await handlers.applyToVacancy(ctx, baseArgs)) as any;

    expect(res).toEqual({ success: true, applicationId: APP_ID });
    // New profile normalizes the email and links the vacancy creator.
    const profCall = insert.mock.calls.find(([t]) => t === 'candidateProfiles') as unknown[];
    expect(profCall![1]).toMatchObject({
      organizationId: ORG_A,
      name: 'Anna Petrova',
      email: 'anna@example.com',
      source: 'career_page',
      createdBy: CREATED_BY,
    });
    // No CV metadata on the application.
    const appCall = insert.mock.calls.find(([t]) => t === 'applications') as unknown[];
    expect(appCall![1]).toMatchObject({
      candidateId: CAND_ID,
      vacancyId: VAC_ID,
      stage: 'applied',
      createdBy: CREATED_BY,
    });
    expect(appCall![1]).not.toHaveProperty('cvStatus');
    expect(insert).toHaveBeenCalledWith(
      'applicationEvents',
      expect.objectContaining({
        applicationId: APP_ID,
        toStage: 'applied',
        changedBy: CREATED_BY,
        reason: 'Applied via career page',
      }),
    );
    expect(mockNotify).toHaveBeenCalledTimes(2);
    expect(mockNotify).toHaveBeenNthCalledWith(
      1,
      ctx,
      expect.objectContaining({
        userId: 'user_admin1',
        titleKey: 'notifications.titles.applicationReceived',
        params: expect.objectContaining({ name: 'Anna Petrova' }),
        fallbackTitle: '📩 New Application Received',
        relatedId: APP_ID,
        route: '/recruitment',
      }),
    );
    expect(mockNotify).toHaveBeenNthCalledWith(
      2,
      ctx,
      expect.objectContaining({ userId: 'user_super' }),
    );
    expect(usersCh.withIndex).toHaveBeenCalledWith('by_org', expect.any(Function));
  });

  it('reuses an existing profile and skips notifications without admins', async () => {
    const { ctx, insert, chains } = makeCtx();
    ctx.get.mockResolvedValueOnce(vacancyDoc()).mockResolvedValueOnce({ _id: CAND_ID }); // re-fetched existing candidate
    insert.mockResolvedValueOnce(APP_ID); // application only — no profile insert
    const candCh = chain(chains, 'candidateProfiles');
    candCh.first.mockResolvedValueOnce({ _id: CAND_ID }); // existing candidate
    const appCh = chain(chains, 'applications');
    appCh.first.mockResolvedValueOnce(null);
    chain(chains, 'users').take.mockResolvedValue([]);

    const res = (await handlers.applyToVacancy(ctx, baseArgs)) as any;

    expect(res.success).toBe(true);
    expect(insert).not.toHaveBeenCalledWith('candidateProfiles', expect.anything());
    expect(mockNotify).not.toHaveBeenCalled();
  });
  it('stores the CV metadata when a valid CV is attached', async () => {
    const { ctx, insert, chains } = makeCtx();
    ctx.get.mockResolvedValueOnce(vacancyDoc()).mockResolvedValueOnce({ _id: CAND_ID });
    insert.mockResolvedValueOnce(CAND_ID).mockResolvedValueOnce(APP_ID);
    chain(chains, 'candidateProfiles').first.mockResolvedValueOnce(null);
    chain(chains, 'applications').first.mockResolvedValueOnce(null);
    chain(chains, 'users').take.mockResolvedValue([]);

    await handlers.applyToVacancy(ctx, {
      ...baseArgs,
      cvFileUrl: 'https://res.cloudinary.com/x/cv.pdf',
      cvFileName: 'cv.pdf',
      cvFileSize: 1024,
      cvMimeType: 'application/pdf',
    });

    const appCall = insert.mock.calls.find(([t]) => t === 'applications') as unknown[];
    expect(appCall![1]).toMatchObject({
      cvFileUrl: 'https://res.cloudinary.com/x/cv.pdf',
      cvFileName: 'cv.pdf',
      cvFileSize: 1024,
      cvMimeType: 'application/pdf',
      cvStatus: 'pending',
      cvUploadedAt: expect.any(Number),
    });
  });
});
