/**
 * Tests for src/components/providers/BrandingProvider.tsx
 *
 * Verifies that the provider:
 * 1. Injects the correct semantic CSS tokens (--brand, --brand-hover, etc.)
 *    derived from Convex branding data
 * 2. Updates the favicon when branding provides one
 * 3. Sets data-white-label attribute for white-label mode
 * 4. Cleans up on unmount
 * 5. Falls back to defaults when no branding exists
 */

import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

// ── Mocks ────────────────────────────────────────────────────────────────────
let mockBranding: Record<string, unknown> | null | undefined = undefined;

jest.mock('convex/react', () => ({
  useQuery: () => mockBranding,
}));

jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: (selector: any) =>
    selector
      ? selector({ user: { id: 'u1', role: 'admin', organizationId: 'org-1' } })
      : { user: { id: 'u1', role: 'admin', organizationId: 'org-1' } },
}));

import { BrandingProvider } from '@/components/providers/BrandingProvider';

beforeEach(() => {
  jest.clearAllMocks();
  mockBranding = undefined;
  // Clean up any injected style tags
  const existing = document.getElementById('org-branding-vars');
  if (existing) existing.remove();
  document.body.removeAttribute('data-white-label');
  document.title = 'Shield HR';
});

afterEach(() => {
  cleanup();
  const existing = document.getElementById('org-branding-vars');
  if (existing) existing.remove();
  document.body.removeAttribute('data-white-label');
});

// ── Tests ────────────────────────────────────────────────────────────────────
describe('BrandingProvider', () => {
  it('renders children without errors', () => {
    mockBranding = null;
    render(
      <BrandingProvider>
        <div>test content</div>
      </BrandingProvider>,
    );
    expect(screen.getByText('test content')).toBeInTheDocument();
  });

  it('clears injected vars when branding is null (reset case)', async () => {
    mockBranding = null;
    render(
      <BrandingProvider>
        <div>app</div>
      </BrandingProvider>,
    );

    await waitFor(() => {
      const style = document.getElementById('org-branding-vars');
      expect(style).toBeTruthy();
      // When branding is null (no row in Convex — reset or never configured),
      // the style tag should be empty so tokens.css defaults take over.
      expect(style?.textContent).toBe('');
    });
  });

  it('injects semantic tokens from Convex branding', async () => {
    mockBranding = {
      primaryColor: '#e11d48',
      secondaryColor: '#0891b2',
      accentColor: '#7c3aed',
      logoUrl: null,
      faviconUrl: null,
      brandName: 'Acme Corp',
      enableWhiteLabel: false,
      hidePoweredBy: false,
    };

    render(
      <BrandingProvider>
        <div>app</div>
      </BrandingProvider>,
    );

    await waitFor(() => {
      const style = document.getElementById('org-branding-vars');
      expect(style).toBeTruthy();
      // Primary → --brand
      expect(style?.textContent).toContain('--brand: #e11d48');
      expect(style?.textContent).toContain('--brand-hover:');
      expect(style?.textContent).toContain('--brand-text:');
      expect(style?.textContent).toContain('--primary: #e11d48');
      // Secondary → success
      expect(style?.textContent).toContain('--success-solid: #0891b2');
      // Accent → warning
      expect(style?.textContent).toContain('--warning-solid: #7c3aed');
    });
  });

  it('derives button, badge, and sidebar tokens from primary', async () => {
    mockBranding = {
      primaryColor: '#2563eb',
      secondaryColor: '#059669',
      accentColor: '#8b5cf6',
      logoUrl: null,
      faviconUrl: null,
      brandName: null,
      enableWhiteLabel: false,
      hidePoweredBy: false,
    };

    render(
      <BrandingProvider>
        <div>app</div>
      </BrandingProvider>,
    );

    await waitFor(() => {
      const style = document.getElementById('org-branding-vars');
      expect(style?.textContent).toContain('--button-primary-bg: #2563eb');
      expect(style?.textContent).toContain('--button-primary-hover:');
      expect(style?.textContent).toContain('--button-secondary-bg:');
      expect(style?.textContent).toContain('--badge-primary-bg:');
      expect(style?.textContent).toContain('--badge-primary-text:');
      expect(style?.textContent).toContain('--sidebar-item-active:');
      expect(style?.textContent).toContain('--loader-color:');
    });
  });

  it('sets data-white-label attribute when white-label mode is enabled', async () => {
    mockBranding = {
      primaryColor: '#2563eb',
      secondaryColor: '#059669',
      accentColor: '#8b5cf6',
      logoUrl: null,
      faviconUrl: null,
      brandName: null,
      enableWhiteLabel: true,
      hidePoweredBy: true,
    };

    render(
      <BrandingProvider>
        <div>app</div>
      </BrandingProvider>,
    );

    await waitFor(() => {
      expect(document.body.getAttribute('data-white-label')).toBe('true');
    });
  });

  it('does not set data-white-label when hidePoweredBy is false', async () => {
    mockBranding = {
      primaryColor: '#2563eb',
      secondaryColor: '#059669',
      accentColor: '#8b5cf6',
      logoUrl: null,
      faviconUrl: null,
      brandName: null,
      enableWhiteLabel: true,
      hidePoweredBy: false,
    };

    render(
      <BrandingProvider>
        <div>app</div>
      </BrandingProvider>,
    );

    await waitFor(() => {
      expect(document.body.hasAttribute('data-white-label')).toBe(false);
    });
  });

  it('removes data-white-label when branding changes to non-white-label', async () => {
    mockBranding = {
      primaryColor: '#2563eb',
      secondaryColor: '#059669',
      accentColor: '#8b5cf6',
      logoUrl: null,
      faviconUrl: null,
      brandName: null,
      enableWhiteLabel: true,
      hidePoweredBy: true,
    };

    const { rerender } = render(
      <BrandingProvider>
        <div>app</div>
      </BrandingProvider>,
    );

    await waitFor(() => {
      expect(document.body.getAttribute('data-white-label')).toBe('true');
    });

    // Simulate branding change
    mockBranding = {
      ...(mockBranding as any),
      enableWhiteLabel: false,
    };

    rerender(
      <BrandingProvider>
        <div>app</div>
      </BrandingProvider>,
    );

    await waitFor(() => {
      expect(document.body.hasAttribute('data-white-label')).toBe(false);
    });
  });

  it('cleans up CSS vars on unmount', async () => {
    mockBranding = {
      primaryColor: '#e11d48',
      secondaryColor: '#0891b2',
      accentColor: '#7c3aed',
      logoUrl: null,
      faviconUrl: null,
      brandName: null,
      enableWhiteLabel: false,
      hidePoweredBy: false,
    };

    const { unmount } = render(
      <BrandingProvider>
        <div>app</div>
      </BrandingProvider>,
    );

    await waitFor(() => {
      const style = document.getElementById('org-branding-vars');
      expect(style?.textContent).toContain('--brand: #e11d48');
    });

    unmount();

    const style = document.getElementById('org-branding-vars');
    expect(style?.textContent).toBe('');
  });

  it('updates favicon when branding provides one', async () => {
    // Ensure a link[rel='icon'] exists
    const existingLink = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
    if (existingLink) existingLink.remove();

    mockBranding = {
      primaryColor: '#2563eb',
      secondaryColor: '#059669',
      accentColor: '#8b5cf6',
      logoUrl: null,
      faviconUrl: 'https://example.com/favicon.ico',
      brandName: null,
      enableWhiteLabel: false,
      hidePoweredBy: false,
    };

    render(
      <BrandingProvider>
        <div>app</div>
      </BrandingProvider>,
    );

    await waitFor(() => {
      const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      expect(link).toBeTruthy();
      expect(link.href).toBe('https://example.com/favicon.ico');
    });
  });

  it('does not touch favicon when no faviconUrl is provided', async () => {
    const existingLink = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
    if (existingLink) existingLink.remove();

    mockBranding = {
      primaryColor: '#2563eb',
      secondaryColor: '#059669',
      accentColor: '#8b5cf6',
      logoUrl: null,
      faviconUrl: null,
      brandName: null,
      enableWhiteLabel: false,
      hidePoweredBy: false,
    };

    render(
      <BrandingProvider>
        <div>app</div>
      </BrandingProvider>,
    );

    await new Promise((r) => setTimeout(r, 50));
    // No favicon link should be created
    expect(document.querySelector("link[rel~='icon']")).toBeNull();
  });
});
