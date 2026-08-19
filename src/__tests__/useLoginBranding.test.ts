/**
 * Tests for src/hooks/useLoginBranding.ts
 *
 * Verifies that the hook:
 * 1. Reads the ?org= parameter from the URL
 * 2. Fetches branding via getBrandingByOrg when org param is present
 * 3. Returns null when no org param is present
 * 4. Returns null when branding query is still loading
 * 5. Returns the formatted branding data when available
 */

import { renderHook } from '@testing-library/react';
import React from 'react';

// ── Mocks ────────────────────────────────────────────────────────────────────
let mockSearchParams: URLSearchParams;
let mockBrandingResult: Record<string, unknown> | null | undefined = undefined;

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

jest.mock('convex/react', () => ({
  useQuery: () => mockBrandingResult,
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    branding: {
      getBrandingByOrg: { _name: 'getBrandingByOrg' },
    },
  },
}));

import { useLoginBranding } from '@/hooks/useLoginBranding';

beforeEach(() => {
  jest.clearAllMocks();
  mockSearchParams = new URLSearchParams();
  mockBrandingResult = undefined;
});

// ── Tests ────────────────────────────────────────────────────────────────────
describe('useLoginBranding', () => {
  it('returns null when no ?org= param is in the URL', () => {
    mockSearchParams = new URLSearchParams('');
    mockBrandingResult = null;

    const { result } = renderHook(() => useLoginBranding());

    expect(result.current).toBeNull();
  });

  it('returns null while branding query is loading', () => {
    mockSearchParams = new URLSearchParams('?org=org-1');
    mockBrandingResult = undefined; // Convex returns undefined while loading

    const { result } = renderHook(() => useLoginBranding());

    expect(result.current).toBeNull();
  });

  it('returns null when branding query returns null (no branding configured)', () => {
    mockSearchParams = new URLSearchParams('?org=org-1');
    mockBrandingResult = null;

    const { result } = renderHook(() => useLoginBranding());

    expect(result.current).toBeNull();
  });

  it('returns formatted branding data when available', () => {
    mockSearchParams = new URLSearchParams('?org=org-1');
    mockBrandingResult = {
      primaryColor: '#e11d48',
      secondaryColor: '#0891b2',
      accentColor: '#7c3aed',
      logoUrl: 'https://example.com/logo.png',
      faviconUrl: 'https://example.com/favicon.ico',
      brandName: 'Acme Corp',
      enableWhiteLabel: true,
      hidePoweredBy: true,
    };

    const { result } = renderHook(() => useLoginBranding());

    expect(result.current).toEqual({
      primaryColor: '#e11d48',
      secondaryColor: '#0891b2',
      accentColor: '#7c3aed',
      logoUrl: 'https://example.com/logo.png',
      brandName: 'Acme Corp',
      enableWhiteLabel: true,
      hidePoweredBy: true,
    });
  });

  it('normalizes null optional fields to null', () => {
    mockSearchParams = new URLSearchParams('?org=org-1');
    mockBrandingResult = {
      primaryColor: '#2563eb',
      secondaryColor: '#059669',
      accentColor: '#8b5cf6',
      logoUrl: undefined,
      faviconUrl: undefined,
      brandName: undefined,
      enableWhiteLabel: false,
      hidePoweredBy: false,
    };

    const { result } = renderHook(() => useLoginBranding());

    expect(result.current?.logoUrl).toBeNull();
    expect(result.current?.brandName).toBeNull();
  });

  it('returns data with string logoUrl when provided', () => {
    mockSearchParams = new URLSearchParams('?org=org-1');
    mockBrandingResult = {
      primaryColor: '#2563eb',
      secondaryColor: '#059669',
      accentColor: '#8b5cf6',
      logoUrl: 'https://cdn.example.com/logo.svg',
      faviconUrl: null,
      brandName: 'Test Corp',
      enableWhiteLabel: false,
      hidePoweredBy: false,
    };

    const { result } = renderHook(() => useLoginBranding());

    expect(result.current?.logoUrl).toBe('https://cdn.example.com/logo.svg');
    expect(result.current?.brandName).toBe('Test Corp');
  });
});
