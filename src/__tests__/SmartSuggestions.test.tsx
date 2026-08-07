/**
 * Tests for SmartSuggestions — AI admin suggestion feed.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) => {
      if (fallback && typeof fallback === 'object') return key;
      return (fallback as string) || key;
    },
  }),
}));

let queryResults: Record<string, unknown> = {};
jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
}));

jest.mock('@/convex/_generated/api', () => ({
  api: { admin: { getSmartSuggestions: { _name: 'getSmartSuggestions' } } },
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant }: any) => (
    <span data-testid="badge" data-variant={variant}>
      {children}
    </span>
  ),
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <div data-testid="shield-loader" />,
}));

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return { Lightbulb: Icon, Sparkles: Icon };
});

import SmartSuggestions from '@/components/admin/SmartSuggestions';

const SUGGESTIONS = [
  {
    id: 's-1',
    category: 'optimization',
    titleKey: 'suggestions.title1',
    descriptionKey: 'suggestions.desc1',
    descriptionParams: {},
    impact: 'high',
  },
  {
    id: 's-2',
    category: 'cost',
    titleKey: 'suggestions.title2',
    descriptionKey: 'suggestions.desc2',
    descriptionParams: {},
    impact: 'medium',
  },
  {
    id: 's-3',
    category: 'conflict',
    titleKey: 'suggestions.title3',
    descriptionKey: 'suggestions.desc3',
    descriptionParams: {},
    impact: 'low',
  },
];

describe('SmartSuggestions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryResults = { getSmartSuggestions: SUGGESTIONS };
  });

  it('shows a loader while suggestions are loading', () => {
    queryResults = {};
    const { container } = render(<SmartSuggestions organizationId="org-1" />);
    expect(container.querySelector('[data-testid="shield-loader"]')).toBeInTheDocument();
  });

  it('renders the card title', () => {
    render(<SmartSuggestions organizationId="org-1" />);
    expect(screen.getByText('aiSuggestions.title')).toBeInTheDocument();
  });

  it('renders suggestion titles and descriptions', () => {
    render(<SmartSuggestions organizationId="org-1" />);
    expect(screen.getByText('suggestions.title1')).toBeInTheDocument();
    expect(screen.getByText('suggestions.desc1')).toBeInTheDocument();
    expect(screen.getByText('suggestions.title2')).toBeInTheDocument();
  });

  it('renders impact badges for high, medium and low', () => {
    render(<SmartSuggestions organizationId="org-1" />);
    expect(screen.getByText('aiSuggestions.highImpact')).toBeInTheDocument();
    expect(screen.getByText('aiSuggestions.mediumImpact')).toBeInTheDocument();
    expect(screen.getByText('aiSuggestions.lowImpact')).toBeInTheDocument();
  });

  it('renders category badges', () => {
    render(<SmartSuggestions organizationId="org-1" />);
    expect(screen.getByText('suggestion.category.optimization')).toBeInTheDocument();
    expect(screen.getByText('suggestion.category.cost')).toBeInTheDocument();
    expect(screen.getByText('suggestion.category.conflict')).toBeInTheDocument();
  });

  it('shows an empty state when there are no suggestions', () => {
    queryResults = { getSmartSuggestions: [] };
    render(<SmartSuggestions organizationId="org-1" />);
    expect(screen.getByText('aiSuggestions.noSuggestions')).toBeInTheDocument();
    expect(screen.getByText('aiSuggestions.optimal')).toBeInTheDocument();
  });
});
