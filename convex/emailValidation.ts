'use node';

import { action } from './_generated/server';
import { v } from 'convex/values';
import dns from 'dns';
import { promisify } from 'util';

const resolveMx = promisify(dns.resolveMx);

/**
 * Validates email: format check + DNS MX record verification
 */
export const validateEmail = action({
  args: { email: v.string() },
  handler: async (_ctx, { email }): Promise<{ valid: boolean; reason?: string }> => {
    const trimmed = email.trim().toLowerCase();

    // 1. Format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      return { valid: false, reason: 'invalid_format' };
    }

    // 2. Extract domain
    const domain = trimmed.split('@')[1];
    if (!domain) {
      return { valid: false, reason: 'invalid_format' };
    }

    // 3. Block disposable/temporary email domains
    const disposableDomains = [
      'tempmail.com',
      'throwaway.email',
      'guerrillamail.com',
      'mailinator.com',
      'yopmail.com',
      'trashmail.com',
      'tempail.com',
      'fakeinbox.com',
      '10minutemail.com',
      'dispostable.com',
      'sharklasers.com',
      'guerrillamailblock.com',
    ];
    if (disposableDomains.includes(domain)) {
      return { valid: false, reason: 'disposable_email' };
    }

    // 4. DNS MX record check
    try {
      const mxRecords = await resolveMx(domain);
      if (!mxRecords || mxRecords.length === 0) {
        return { valid: false, reason: 'no_mx_records' };
      }
      return { valid: true };
    } catch (err: unknown) {
      // ENOTFOUND = domain doesn't exist, ENODATA = no MX records
      const code =
        err && typeof err === 'object' && 'code' in err
          ? (err as { code?: string }).code
          : undefined;
      if (code === 'ENOTFOUND' || code === 'ENODATA') {
        return { valid: false, reason: 'domain_not_found' };
      }
      // Network error — allow through (don't block on temporary failures)
      return { valid: true };
    }
  },
});
