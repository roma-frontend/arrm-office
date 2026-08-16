/**
 * Tests for the superadmin landing text editor backend —
 * convex/superadmin/landingEditor.ts.
 *
 * The publish contract (mirrors Builder Studio): saveDraft writes a working
 * copy that is NEVER served; only publish copies drafts → published; unpublish
 * and resetLandingTexts clear overrides back to the bundled default copy.
 * getPublishedLandingTexts is deliberately public and returns published values
 * only — never drafts.
 */

import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
  internalAction: ({ handler, args }: any) => ({ handler, args }),
  internalMutation: ({ handler, args }: any) => ({ handler, args }),
  internalQuery: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/getAuthCaller', () => ({
  getAuthCaller: jest.fn(),
}));

let editor: any;
let mockGetAuthCaller: jest.Mock;
let mockGet: jest.Mock;
let mockPatch: jest.Mock;
let mockInsert: jest.Mock;
let mockQuery: jest.Mock;
let mockFirst: jest.Mock;

const superadmin = { _id: 'user-super', name: 'Root', email: 'root@x.com', role: 'superadmin' };
const admin = { _id: 'user-admin', name: 'Admin', email: 'a@a.com', role: 'admin' };

function row(over: Record<string, unknown> = {}) {
  return {
    _id: 'row-1',
    key: 'landing.heroTitle',
    locale: 'en',
    createdAt: 1000,
    updatedAt: 1000,
    draftValue: undefined,
    publishedValue: undefined,
    ...over,
  };
}

function makeCtx(extra = {}) {
  return {
    db: {
      get: mockGet,
      patch: mockPatch,
      insert: mockInsert,
      query: mockQuery,
    },
    ...extra,
  };
}

beforeAll(async () => {
  editor = await import('../../convex/superadmin/landingEditor');
});

beforeEach(() => {
  mockGetAuthCaller = (jest.requireMock('../../convex/lib/getAuthCaller') as any).getAuthCaller;
  mockGetAuthCaller.mockReset();
  mockGet = jest.fn();
  mockPatch = jest.fn(async () => undefined);
  mockInsert = jest.fn(async () => 'row-1');
  mockQuery = jest.fn();
  mockFirst = jest.fn();
  mockQuery.mockReturnValue({
    withIndex: () => ({ take: jest.fn(async () => []), first: mockFirst }),
  });
});

describe('landing editor — auth', () => {
  it('rejects non-superadmins from editor mutations', async () => {
    mockGetAuthCaller.mockResolvedValue(admin);
    await expect(
      editor.saveLandingDraft.handler(makeCtx(), { key: 'a', locale: 'en', value: 'x' }),
    ).rejects.toThrow('Superadmin only');
  });
});

describe('landing editor — draft/publish contract', () => {
  it('saveDraft writes the working copy; getPublished never serves it', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    // existing row found
    const existing = row();
    mockFirst.mockResolvedValue(existing);

    await editor.saveLandingDraft.handler(makeCtx(), {
      key: 'landing.heroTitle',
      locale: 'en',
      value: 'Edited hero',
    });
    expect(mockPatch).toHaveBeenCalledWith(
      'row-1',
      expect.objectContaining({ draftValue: 'Edited hero' }),
    );

    // public read: published only, draft must NOT leak
    mockGetAuthCaller.mockResolvedValue(null);
    mockQuery.mockReturnValue({
      withIndex: () => ({
        take: jest.fn(async () => [{ ...existing, draftValue: 'Edited hero' }]),
      }),
    });
    const published = await editor.getPublishedLandingTexts.handler(makeCtx(), { lang: 'en' });
    expect(published).toEqual({}); // draft only → nothing published
  });

  it('publish copies drafts → live (draft consumed)', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    const draft = row({ draftValue: 'Live hero', publishedValue: undefined });
    mockQuery.mockReturnValue({ order: () => ({ take: jest.fn(async () => [draft]) }) });

    const res = await editor.publishLandingTexts.handler(makeCtx(), { locale: 'en' });
    expect(res.published).toBe(1);
    expect(mockPatch).toHaveBeenCalledWith(
      'row-1',
      expect.objectContaining({ publishedValue: 'Live hero', draftValue: undefined }),
    );

    // public read now serves the published copy
    mockGetAuthCaller.mockResolvedValue(null);
    mockQuery.mockReturnValue({
      withIndex: () => ({
        take: jest.fn(async () => [
          { ...draft, draftValue: undefined, publishedValue: 'Live hero' },
        ]),
      }),
    });
    const published = await editor.getPublishedLandingTexts.handler(makeCtx(), { lang: 'en' });
    expect(published).toEqual({ 'landing.heroTitle': 'Live hero' });
  });

  it('unpublish drops the published override → default returns', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    const live = row({ publishedValue: 'Live hero' });
    mockFirst.mockResolvedValue(live);

    await editor.unpublishLandingText.handler(makeCtx(), {
      key: 'landing.heroTitle',
      locale: 'en',
    });
    expect(mockPatch).toHaveBeenCalledWith(
      'row-1',
      expect.objectContaining({ publishedValue: undefined, publishedAt: undefined }),
    );
  });

  it('resetLandingTexts wipes drafts AND published for the locale', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    const rows = [
      row({ draftValue: 'd1', publishedValue: 'p1' }),
      row({
        _id: 'row-2',
        key: 'landing.heroSubtitle',
        draftValue: undefined,
        publishedValue: 'p2',
      }),
      row({
        _id: 'row-3',
        key: 'pricing.features',
        locale: 'ru',
        draftValue: 'rd',
        publishedValue: 'rp',
      }),
    ];
    mockQuery.mockReturnValue({ order: () => ({ take: jest.fn(async () => rows) }) });

    const res = await editor.resetLandingTexts.handler(makeCtx(), { locale: 'en' });
    expect(res.reset).toBe(2); // only en rows
    expect(mockPatch).toHaveBeenCalledTimes(2);
    for (const call of mockPatch.mock.calls as [string, Record<string, unknown>][]) {
      expect(call[1].draftValue).toBeUndefined();
      expect(call[1].publishedValue).toBeUndefined();
      expect(call[1].publishedAt).toBeUndefined();
    }

    // no locale → wipes everything
    mockPatch.mockClear();
    const resAll = await editor.resetLandingTexts.handler(makeCtx(), {});
    expect(resAll.reset).toBe(3);
  });

  it('listLandingTexts exposes draft + published for the editor UI', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    mockQuery.mockReturnValue({
      order: () => ({ take: jest.fn(async () => [row({ draftValue: 'd' })]) }),
    });
    const list = await editor.listLandingTexts.handler(makeCtx(), {});
    expect(list[0]).toMatchObject({
      key: 'landing.heroTitle',
      draftValue: 'd',
      publishedValue: null,
    });
  });
});
