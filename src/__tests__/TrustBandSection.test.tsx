/**
 * Tests for the landing TrustBandSection — the logo marquee and the
 * trust/security strip (SOC 2, GDPR, encryption, EU hosting, uptime).
 */

import React from 'react';
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';

// ── i18n mock ────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    i18n: {
      language: 'en',
      getFixedT: () => (key: string, fallback?: string) => fallback ?? key,
    },
  }),
}));

jest.mock('@/i18n/config', () => ({}));

// ── convex mock — no curated logos by default, so the i18n wordmarks show ───
let mockShowcase: { logos: unknown[]; testimonials: unknown[] } | undefined;
jest.mock('convex/react', () => ({
  useQuery: () => mockShowcase,
}));

beforeEach(() => {
  mockShowcase = { logos: [], testimonials: [] };
});

afterEach(() => {
  jest.clearAllMocks();
});

import TrustBandSection from '@/components/landing/TrustBandSection';

describe('TrustBandSection', () => {
  it('renders real curated logos when a superadmin has set them up', async () => {
    mockShowcase = {
      logos: [{ name: 'Acme Corp', logoUrl: undefined, order: 0 }],
      testimonials: [],
    };
    render(<TrustBandSection />);
    await waitFor(() => {
      expect(screen.getByText('landing.trustEyebrow')).toBeInTheDocument();
    });
    // Doubled marquee track → the real org name appears twice.
    expect(screen.getAllByText('Acme Corp')).toHaveLength(2);
  });

  it('renders the marquee and trust strip after mount', async () => {
    render(<TrustBandSection />);

    await waitFor(() => {
      expect(screen.getByText('landing.trustEyebrow')).toBeInTheDocument();
    });
    // Trust items
    expect(screen.getByText('landing.trustSoc2')).toBeInTheDocument();
    expect(screen.getByText('landing.trustGdpr')).toBeInTheDocument();
    expect(screen.getByText('landing.trustEncryption')).toBeInTheDocument();
    expect(screen.getByText('landing.trustEuHosting')).toBeInTheDocument();
    expect(screen.getByText('landing.trustUptime')).toBeInTheDocument();
    // Logo wordmarks (doubled track)
    expect(screen.getAllByText('landing.logoNova')).toHaveLength(2);
    expect(screen.getAllByText('landing.logoAtlas')).toHaveLength(2);
  });

  it('has an accessible section label for the marquee', async () => {
    render(<TrustBandSection />);
    await waitFor(() => {
      expect(screen.getByLabelText('Teams that run on Strata')).toBeInTheDocument();
    });
  });
});
