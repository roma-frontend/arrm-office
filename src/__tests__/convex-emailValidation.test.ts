/**
 * Tests for convex/emailValidation.ts — format + disposable-domain + DNS MX
 * validation of emails.
 *
 * `dns.resolveMx` is mocked so no real network I/O happens.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
  action: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('dns', () => {
  const actual = jest.requireActual('dns') as typeof import('dns');
  // Keep the callback signature so `promisify(dns.resolveMx)` in the module
  // under test still works — tests drive behaviour via mockResolveMx.
  return {
    ...actual,
    resolveMx: jest.fn((domain: string, cb: (err: Error | null, records?: unknown[]) => void) =>
      cb(null, [{ exchange: 'mx.example.com', priority: 10 }]),
    ),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const dns = require('dns') as { resolveMx: jest.Mock };
const mockResolveMx = () => dns.resolveMx as jest.Mock;

let validateEmailHandler: (
  ctx: any,
  args: { email: string },
) => Promise<{
  valid: boolean;
  reason?: string;
}>;

beforeEach(() => {
  jest.clearAllMocks();
  // Default: a valid MX record exists. Each test overrides as needed.
  mockResolveMx().mockImplementation(
    (_domain: string, cb: (err: Error | null, records?: unknown[]) => void) =>
      cb(null, [{ exchange: 'mx.example.com', priority: 10 }]),
  );
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../convex/emailValidation');
    validateEmailHandler = mod.validateEmail.handler;
  });
});

describe('validateEmail', () => {
  it('rejects an empty email', async () => {
    const res = await validateEmailHandler({}, { email: '' });
    expect(res).toEqual({ valid: false, reason: 'invalid_format' });
  });

  it('rejects an email without an @', async () => {
    const res = await validateEmailHandler({}, { email: 'not-an-email' });
    expect(res).toEqual({ valid: false, reason: 'invalid_format' });
  });

  it('rejects an email without a domain', async () => {
    const res = await validateEmailHandler({}, { email: 'user@localhost' });
    expect(res).toEqual({ valid: false, reason: 'invalid_format' });
  });

  it('rejects an email with whitespace in the local part', async () => {
    const res = await validateEmailHandler({}, { email: 'a b@example.com' });
    expect(res).toEqual({ valid: false, reason: 'invalid_format' });
  });

  it('trims and lowercases the input before validating', async () => {
    const res = await validateEmailHandler({}, { email: '  USER@Example.COM  ' });
    expect(res).toEqual({ valid: true });
    expect(mockResolveMx()).toHaveBeenCalledWith('example.com', expect.any(Function));
  });

  it('rejects known disposable email domains', async () => {
    const res = await validateEmailHandler({}, { email: 'someone@mailinator.com' });
    expect(res).toEqual({ valid: false, reason: 'disposable_email' });
    expect(dns.resolveMx).not.toHaveBeenCalled();
  });

  it('rejects throwaway.email domains', async () => {
    const res = await validateEmailHandler({}, { email: 'x@throwaway.email' });
    expect(res).toEqual({ valid: false, reason: 'disposable_email' });
  });

  it('accepts a domain with MX records', async () => {
    mockResolveMx().mockImplementation(
      (_domain: string, cb: (err: Error | null, records?: unknown[]) => void) =>
        cb(null, [{ exchange: 'mx.gmail.com', priority: 5 }]),
    );
    const res = await validateEmailHandler({}, { email: 'alice@gmail.com' });
    expect(res).toEqual({ valid: true });
  });

  it('rejects a domain with an empty MX list', async () => {
    mockResolveMx().mockImplementation(
      (_domain: string, cb: (err: Error | null, records?: unknown[]) => void) => cb(null, []),
    );
    const res = await validateEmailHandler({}, { email: 'bob@example.com' });
    expect(res).toEqual({ valid: false, reason: 'no_mx_records' });
  });

  it('rejects a nonexistent domain (ENOTFOUND)', async () => {
    const err: NodeJS.ErrnoException = new Error('getaddrinfo ENOTFOUND nope.example');
    err.code = 'ENOTFOUND';
    mockResolveMx().mockImplementation(
      (_domain: string, cb: (err: Error | null, records?: unknown[]) => void) => cb(err),
    );
    const res = await validateEmailHandler({}, { email: 'x@nope.example' });
    expect(res).toEqual({ valid: false, reason: 'domain_not_found' });
  });

  it('rejects a domain with no MX records (ENODATA)', async () => {
    const err: NodeJS.ErrnoException = new Error('queryMx ENODATA example.com');
    err.code = 'ENODATA';
    mockResolveMx().mockImplementation(
      (_domain: string, cb: (err: Error | null, records?: unknown[]) => void) => cb(err),
    );
    const res = await validateEmailHandler({}, { email: 'x@example.com' });
    expect(res).toEqual({ valid: false, reason: 'domain_not_found' });
  });

  it('accepts on transient network errors (do not block legit users)', async () => {
    mockResolveMx().mockImplementation(
      (_domain: string, cb: (err: Error | null, records?: unknown[]) => void) =>
        cb(new Error('ETIMEOUT')),
    );
    const res = await validateEmailHandler({}, { email: 'x@example.com' });
    expect(res).toEqual({ valid: true });
  });
});
