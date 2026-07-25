/**
 * Tests for sharepoint-sync.ts
 */

import {
  COLUMN_MAP,
  getSharePointAuthUrl,
  exchangeSharePointCode,
  refreshSharePointToken,
  fetchSharePointListItems,
  mapSharePointToEmployee,
} from '@/lib/sharepoint-sync';

const originalEnv = { ...process.env };

beforeAll(() => {
  process.env.MICROSOFT_CLIENT_ID = 'dummy';
  process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID = 'dummy';
  process.env.MICROSOFT_TENANT_ID = 'dummy';
  process.env.MICROSOFT_CLIENT_SECRET = 'dummy-secret';
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.com';
  process.env.SHAREPOINT_SITE_ID = 'dummy-site';
  process.env.SHAREPOINT_LIST_ID = 'dummy-list';
});

afterAll(() => {
  process.env = originalEnv;
});

describe('COLUMN_MAP', () => {
  it('has expected field mappings', () => {
    expect(COLUMN_MAP.name).toBe('Title');
  });
});

describe('getSharePointAuthUrl', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID = 'my-client';
    process.env.MICROSOFT_TENANT_ID = 'my-tenant';
  });

  it('returns OAuth URL', () => {
    const url = getSharePointAuthUrl('https://app.com/callback');
    expect(url).toContain('login.microsoftonline.com/my-tenant');
  });

  it('throws when client ID missing', () => {
    delete process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID;
    expect(() => getSharePointAuthUrl('/cb')).toThrow('Client ID');
  });

  it('throws when tenant ID missing', () => {
    delete process.env.MICROSOFT_TENANT_ID;
    expect(() => getSharePointAuthUrl('/cb')).toThrow('Tenant ID');
  });
});

describe('exchangeSharePointCode', () => {
  beforeEach(() => {
    process.env.MICROSOFT_CLIENT_ID = 'client'; // NOTE: NOT NEXT_PUBLIC_ variant
    process.env.MICROSOFT_TENANT_ID = 'tenant';
    process.env.MICROSOFT_CLIENT_SECRET = 'secret';
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.com';
  });

  it('exchanges code for tokens on success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: 'abc', refresh_token: 'ref' }),
    });
    const result = await exchangeSharePointCode('my-code');
    expect(result.access_token).toBe('abc');
  });

  it('throws on API error', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, text: () => Promise.resolve('invalid_grant') });
    await expect(exchangeSharePointCode('bad')).rejects.toThrow(
      'Failed to exchange SharePoint code',
    );
  });

  it('throws when credentials missing', async () => {
    delete process.env.MICROSOFT_CLIENT_SECRET;
    await expect(exchangeSharePointCode('c')).rejects.toThrow('not configured');
  });
});

describe('refreshSharePointToken', () => {
  beforeEach(() => {
    process.env.MICROSOFT_CLIENT_ID = 'client'; // NOTE: NOT NEXT_PUBLIC_ variant
    process.env.MICROSOFT_TENANT_ID = 'tenant';
    process.env.MICROSOFT_CLIENT_SECRET = 'secret';
  });

  it('refreshes token', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({ access_token: 'new' }) });
    const result = await refreshSharePointToken('old-refresh');
    expect(result.access_token).toBe('new');
  });

  it('throws on API error', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, text: () => Promise.resolve('fail') });
    await expect(refreshSharePointToken('x')).rejects.toThrow('Failed to refresh SharePoint token');
  });

  it('throws when credentials missing', async () => {
    delete process.env.MICROSOFT_TENANT_ID;
    await expect(refreshSharePointToken('x')).rejects.toThrow('not configured');
  });
});

describe('mapSharePointToEmployee', () => {
  it('maps fields', () => {
    const r = mapSharePointToEmployee({ Title: 'Alice', Email: 'a@b.com', Category: 'staff' });
    expect(r?.name).toBe('Alice');
  });
  it('returns null for missing email', () => {
    expect(mapSharePointToEmployee({})).toBeNull();
  });
});

describe('fetchSharePointListItems', () => {
  beforeEach(() => {
    process.env.SHAREPOINT_SITE_ID = 'site-123';
    process.env.SHAREPOINT_LIST_ID = 'list-456';
  });
  it('fetches', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          value: [{ fields: { Title: 'A', Email: 'a@t.com', Category: 'staff' } }],
        }),
    });
    const emps = await fetchSharePointListItems('t');
    expect(emps).toHaveLength(1);
  });
});
