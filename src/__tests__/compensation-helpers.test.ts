/**
 * Tests for compensation helper functions.
 *
 * Covers: formatCurrency, formatDate, getStatusBadge, getTypeBadge.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';

// ── formatCurrency (inlined from CompensationClient) ────────────────────────

function formatCurrency(amount: number, currency = 'AMD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

describe('formatCurrency', () => {
  it('formats AMD with no decimals', () => {
    const result = formatCurrency(1234567, 'AMD');
    expect(result).not.toContain('.');
    expect(result).toContain('1');
  });

  it('formats USD', () => {
    const result = formatCurrency(50000, 'USD');
    expect(result).toContain('$');
    expect(result).toContain('50,000');
  });

  it('formats EUR', () => {
    const result = formatCurrency(42000, 'EUR');
    expect(result).toContain('€');
    expect(result).toContain('42,000');
  });

  it('defaults to AMD', () => {
    const result = formatCurrency(1000);
    expect(result).not.toContain('$');
  });

  it('formats zero', () => {
    const result = formatCurrency(0, 'USD');
    expect(result).toContain('$');
    expect(result).toContain('0');
  });
});

// ── formatDate (inlined from CompensationClient) ────────────────────────────

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

describe('formatDate', () => {
  it('formats a valid timestamp', () => {
    // 2025-01-15T00:00:00Z
    const result = formatDate(1736899200000);
    expect(result).toContain('Jan');
    expect(result).toContain('15');
    expect(result).toContain('2025');
  });

  it('handles epoch 0', () => {
    const result = formatDate(0);
    expect(result).toContain('Jan');
    expect(result).toContain('1970');
  });
});

// ── getStatusBadge (inlined from CompensationClient) ────────────────────────

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

function getStatusBadge(status: string) {
  const variants: Record<string, string> = {
    active: 'success',
    approved: 'success',
    completed: 'success',
    pending_approval: 'warning',
    draft: 'secondary',
    rejected: 'destructive',
    cancelled: 'destructive',
    expired: 'destructive',
    under_review: 'warning',
    submitted: 'warning',
  };
  return variants[status] || 'secondary';
}

describe('getStatusBadge variant mapping', () => {
  it('maps active to success', () => {
    expect(getStatusBadge('active')).toBe('success');
  });

  it('maps approved to success', () => {
    expect(getStatusBadge('approved')).toBe('success');
  });

  it('maps pending_approval to warning', () => {
    expect(getStatusBadge('pending_approval')).toBe('warning');
  });

  it('maps draft to secondary', () => {
    expect(getStatusBadge('draft')).toBe('secondary');
  });

  it('maps rejected to destructive', () => {
    expect(getStatusBadge('rejected')).toBe('destructive');
  });

  it('maps unknown to secondary', () => {
    expect(getStatusBadge('unknown_status')).toBe('secondary');
  });

  it('maps expired to destructive', () => {
    expect(getStatusBadge('expired')).toBe('destructive');
  });
});

// ── getTypeBadge (inlined from CompensationClient) ──────────────────────────

function getTypeBadge(type: string) {
  const variants: Record<string, string> = {
    base: 'success',
    bonus: 'warning',
    raise: 'info',
    adjustment: 'secondary',
    allowance: 'warning',
  };
  return variants[type] || 'secondary';
}

describe('getTypeBadge variant mapping', () => {
  it('maps base to success', () => {
    expect(getTypeBadge('base')).toBe('success');
  });

  it('maps bonus to warning', () => {
    expect(getTypeBadge('bonus')).toBe('warning');
  });

  it('maps raise to info', () => {
    expect(getTypeBadge('raise')).toBe('info');
  });

  it('maps adjustment to secondary', () => {
    expect(getTypeBadge('adjustment')).toBe('secondary');
  });

  it('maps unknown to secondary', () => {
    expect(getTypeBadge('mystery')).toBe('secondary');
  });
});
