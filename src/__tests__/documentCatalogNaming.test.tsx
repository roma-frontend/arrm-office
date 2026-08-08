/**
 * The built-in template catalog must be named in the reader's language.
 *
 * The dialog listed every template through `localizedContent(template, 'en')`, so
 * "Employment Verification Letter" stayed English next to a translated category
 * line — and a blueprint forked from it inherited the English name. The catalog
 * carries Russian, Armenian and German copy for all of them, so nothing but the
 * language argument was wrong.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';

let currentLang = 'ru';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown) => (typeof fallback === 'string' ? fallback : key),
    i18n: { language: currentLang },
  }),
}));

jest.mock('convex/react', () => ({
  useQuery: () => [],
  useMutation: () => jest.fn(),
}));

jest.mock('@/convex/_generated/api', () => ({ api: { documentBlueprints: {} } }));
jest.mock('../../convex/_generated/api', () => ({ api: { documentBlueprints: {} } }));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}));

jest.mock('@/components/documents/BlueprintEditor', () => ({
  __esModule: true,
  default: ({ initial }: { initial?: { name?: string } }) => (
    <div data-testid="editor" data-draft-name={initial?.name ?? ''} />
  ),
}));

import DocumentBuilderTab from '@/components/documents/DocumentBuilderTab';
import { CATALOG, localizedContent } from '@/lib/documentCatalog';

function openCatalog() {
  render(<DocumentBuilderTab organizationId={'org-1' as never} />);
  // Both the empty state and the header offer the catalog; either will do.
  fireEvent.click(screen.getAllByText('From a built-in template')[0]!);
}

describe('built-in template catalog', () => {
  beforeEach(() => {
    currentLang = 'ru';
  });

  it('names templates in the interface language', () => {
    openCatalog();

    const russian = localizedContent(CATALOG[0]!, 'ru').title;
    const english = localizedContent(CATALOG[0]!, 'en').title;
    expect(russian).not.toBe(english); // guards the fixture itself

    expect(screen.getAllByText(russian).length).toBeGreaterThan(0);
    expect(screen.queryByText(english)).not.toBeInTheDocument();
  });

  it('follows a different language too', () => {
    currentLang = 'de';
    openCatalog();

    expect(screen.getAllByText(localizedContent(CATALOG[0]!, 'de').title).length).toBeGreaterThan(
      0,
    );
  });

  it('falls back to English for a language the catalog has no copy in', () => {
    currentLang = 'fr';
    openCatalog();

    expect(screen.getAllByText(localizedContent(CATALOG[0]!, 'en').title).length).toBeGreaterThan(
      0,
    );
  });

  it('names a forked blueprint in the interface language', () => {
    openCatalog();
    fireEvent.click(screen.getAllByText(localizedContent(CATALOG[0]!, 'ru').title)[0]!);

    expect(screen.getByTestId('editor')).toHaveAttribute(
      'data-draft-name',
      localizedContent(CATALOG[0]!, 'ru').title,
    );
  });

  it('has localized titles for every built-in template', () => {
    // The dialog can only be as translated as the catalog behind it.
    for (const template of CATALOG) {
      for (const locale of ['en', 'ru', 'hy', 'de'] as const) {
        expect(template.locales[locale]?.title?.length ?? 0).toBeGreaterThan(0);
      }
    }
  });
});
