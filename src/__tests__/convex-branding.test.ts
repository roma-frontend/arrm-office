/**
 * Tests for convex/branding.ts — org branding CRUD mutations and queries.
 *
 * Pattern: convex-tasks.test.ts — mock _generated/server, getAuthCaller;
 * require the module inside jest.isolateModules.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Mocks ────────────────────────────────────────────────────────────────────
jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/getAuthCaller', () => ({
  getAuthCaller: jest.fn(),
}));

// ── Module under test ────────────────────────────────────────────────────────
let mockGetAuthCaller: jest.Mock;

type Handler = (ctx: any, args: any) => Promise<unknown>;
const handlers: Record<string, Handler> = {};

const ORG_A = 'org-1';
const ORG_B = 'org-2';
const USER_ID = 'user_admin';
const BRANDING_ID = 'branding_1';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
  mockGetAuthCaller.mockReset();
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const branding = require('../../convex/branding');
    for (const [name, def] of Object.entries(branding)) {
      if (def && typeof def === 'object' && typeof (def as any).handler === 'function') {
        handlers[name] = (def as any).handler;
      }
    }
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeCaller(
  role: 'admin' | 'superadmin' | 'employee' = 'admin',
  org: string | undefined = ORG_A,
) {
  return { _id: USER_ID, role, email: 'admin@example.com', organizationId: org, name: 'Admin' };
}

function makeCtx() {
  const get = jest.fn();
  const insert = jest.fn().mockResolvedValue('new_id');
  const patch = jest.fn().mockResolvedValue(undefined);
  const remove = jest.fn().mockResolvedValue(undefined);
  const unique = jest.fn().mockResolvedValue(null);
  const withIndex = jest.fn().mockReturnValue({ unique });
  const query = jest.fn().mockReturnValue({ withIndex });
  const db = { get, insert, patch, delete: remove, query };
  return { ctx: { db }, get, insert, patch, remove, unique, query, withIndex };
}

const DEFAULT_BRANDING_ARGS = {
  primaryColor: '#ff0000',
  secondaryColor: '#00ff00',
  accentColor: '#0000ff',
  logoUrl: undefined as string | undefined,
  faviconUrl: undefined as string | undefined,
  brandName: undefined as string | undefined,
  enableWhiteLabel: false,
  hidePoweredBy: false,
};

// ── saveBranding ─────────────────────────────────────────────────────────────
describe('saveBranding', () => {
  it('creates a new branding row when none exists', async () => {
    const { ctx, insert } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A));

    const result = await handlers.saveBranding(ctx, DEFAULT_BRANDING_ARGS);

    expect(insert).toHaveBeenCalledWith(
      'orgBranding',
      expect.objectContaining({
        organizationId: ORG_A,
        primaryColor: '#ff0000',
        secondaryColor: '#00ff00',
        accentColor: '#0000ff',
        enableWhiteLabel: false,
        hidePoweredBy: false,
      }),
    );
    expect(result).toEqual({ id: 'new_id', updated: false });
  });

  it('updates an existing branding row', async () => {
    const { ctx, patch } = makeCtx();
    const { unique } = makeCtx();
    // Override the unique mock on the actual ctx
    (ctx.db.query as any).mockReturnValue({
      withIndex: jest
        .fn()
        .mockReturnValue({ unique: jest.fn().mockResolvedValue({ _id: BRANDING_ID }) }),
    });
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A));

    const result = await handlers.saveBranding(ctx, {
      ...DEFAULT_BRANDING_ARGS,
      primaryColor: '#123456',
      enableWhiteLabel: true,
    });

    expect(patch).toHaveBeenCalledWith(
      BRANDING_ID,
      expect.objectContaining({
        primaryColor: '#123456',
        enableWhiteLabel: true,
        updatedAt: expect.any(Number),
      }),
    );
    expect(result).toEqual({ id: BRANDING_ID, updated: true });
  });

  it('rejects unauthenticated callers', async () => {
    const { ctx } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(null);

    await expect(handlers.saveBranding(ctx, DEFAULT_BRANDING_ARGS)).rejects.toThrow(
      'Not authenticated',
    );
  });

  it('rejects non-admin roles', async () => {
    const { ctx } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A));

    await expect(handlers.saveBranding(ctx, DEFAULT_BRANDING_ARGS)).rejects.toThrow(
      'Only admins can modify branding',
    );
  });

  it('rejects callers without an organization', async () => {
    const { ctx } = makeCtx();
    mockGetAuthCaller.mockResolvedValue({
      _id: USER_ID,
      role: 'admin',
      email: 'admin@example.com',
      organizationId: null,
      name: 'Admin',
    });

    await expect(handlers.saveBranding(ctx, DEFAULT_BRANDING_ARGS)).rejects.toThrow(
      'No organization',
    );
  });

  it('allows superadmins to save branding', async () => {
    const { ctx, insert } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller('superadmin', ORG_A));

    const result = await handlers.saveBranding(ctx, DEFAULT_BRANDING_ARGS);

    expect(insert).toHaveBeenCalledWith('orgBranding', expect.anything());
    expect(result).toEqual({ id: 'new_id', updated: false });
  });
});

// ── resetBranding ────────────────────────────────────────────────────────────
describe('resetBranding', () => {
  it('deletes the existing branding row', async () => {
    const { ctx, remove } = makeCtx();
    (ctx.db.query as any).mockReturnValue({
      withIndex: jest.fn().mockReturnValue({
        unique: jest.fn().mockResolvedValue({ _id: BRANDING_ID }),
      }),
    });
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A));

    const result = await handlers.resetBranding(ctx, {});

    expect(remove).toHaveBeenCalledWith(BRANDING_ID);
    expect(result).toEqual({ success: true });
  });

  it('succeeds even when no branding exists (idempotent)', async () => {
    const { ctx, remove } = makeCtx();
    (ctx.db.query as any).mockReturnValue({
      withIndex: jest.fn().mockReturnValue({ unique: jest.fn().mockResolvedValue(null) }),
    });
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A));

    const result = await handlers.resetBranding(ctx, {});

    expect(remove).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });

  it('rejects unauthenticated callers', async () => {
    const { ctx } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(null);

    await expect(handlers.resetBranding(ctx, {})).rejects.toThrow('Not authenticated');
  });

  it('rejects non-admin roles', async () => {
    const { ctx } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A));

    await expect(handlers.resetBranding(ctx, {})).rejects.toThrow(
      'Only admins can modify branding',
    );
  });
});

// ── getBranding ──────────────────────────────────────────────────────────────
describe('getBranding', () => {
  it('returns branding for the caller organization', async () => {
    const { ctx } = makeCtx();
    const brandingRow = {
      primaryColor: '#ff0000',
      secondaryColor: '#00ff00',
      accentColor: '#0000ff',
      logoUrl: 'https://example.com/logo.png',
      faviconUrl: null,
      brandName: 'Acme Corp',
      enableWhiteLabel: true,
      hidePoweredBy: false,
    };
    (ctx.db.query as any).mockReturnValue({
      withIndex: jest.fn().mockReturnValue({
        unique: jest.fn().mockResolvedValue(brandingRow),
      }),
    });
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A));

    const result = await handlers.getBranding(ctx, {});

    expect(result).toEqual(brandingRow);
  });

  it('returns null when no branding exists', async () => {
    const { ctx } = makeCtx();
    (ctx.db.query as any).mockReturnValue({
      withIndex: jest.fn().mockReturnValue({ unique: jest.fn().mockResolvedValue(null) }),
    });
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A));

    const result = await handlers.getBranding(ctx, {});

    expect(result).toBeNull();
  });

  it('returns null for unauthenticated callers', async () => {
    const { ctx } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(null);

    const result = await handlers.getBranding(ctx, {});

    expect(result).toBeNull();
  });

  it('returns null for callers without an organization', async () => {
    const { ctx } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', undefined));

    const result = await handlers.getBranding(ctx, {});

    expect(result).toBeNull();
  });
});

// ── getBrandingByOrg ─────────────────────────────────────────────────────────
describe('getBrandingByOrg', () => {
  it('returns branding for a specific organization', async () => {
    const { ctx } = makeCtx();
    const brandingRow = {
      primaryColor: '#ff0000',
      secondaryColor: '#00ff00',
      accentColor: '#0000ff',
      logoUrl: null,
      faviconUrl: null,
      brandName: 'Acme Corp',
      enableWhiteLabel: false,
      hidePoweredBy: false,
    };
    (ctx.db.query as any).mockReturnValue({
      withIndex: jest.fn().mockReturnValue({
        unique: jest.fn().mockResolvedValue(brandingRow),
      }),
    });

    const result = await handlers.getBrandingByOrg(ctx, { organizationId: ORG_A });

    expect(result).toEqual(brandingRow);
  });

  it('returns null when no branding exists for the org', async () => {
    const { ctx } = makeCtx();
    (ctx.db.query as any).mockReturnValue({
      withIndex: jest.fn().mockReturnValue({ unique: jest.fn().mockResolvedValue(null) }),
    });

    const result = await handlers.getBrandingByOrg(ctx, { organizationId: ORG_A });

    expect(result).toBeNull();
  });

  it('does not require authentication (public query)', async () => {
    const { ctx } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(null);
    (ctx.db.query as any).mockReturnValue({
      withIndex: jest.fn().mockReturnValue({ unique: jest.fn().mockResolvedValue(null) }),
    });

    // Should not throw — getBrandingByOrg doesn't call getAuthCaller
    const result = await handlers.getBrandingByOrg(ctx, { organizationId: ORG_A });

    expect(result).toBeNull();
  });
});
