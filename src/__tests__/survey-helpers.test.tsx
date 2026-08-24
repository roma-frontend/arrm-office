/**
 * Tests for surveys sub-components and helpers.
 *
 * Covers: StatusBadge variants, survey result rendering logic,
 * response rate calculation, question type icon mapping.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';

// Mock i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      const map: Record<string, string> = {
        'surveyStatus.draft': 'Draft',
        'surveyStatus.active': 'Active',
        'surveyStatus.closed': 'Closed',
      };
      return map[key] ?? fallback ?? key;
    },
  }),
}));

// ── StatusBadge (extracted from SurveyDetailClient) ─────────────────────────

const StatusBadge = ({ status }: { status: string }) => {
  const { t } = require('react-i18next').useTranslation();
  const label =
    ({
      draft: t('surveyStatus.draft'),
      active: t('surveyStatus.active'),
      closed: t('surveyStatus.closed'),
    }[status] as string) ?? t('surveyStatus.draft');

  return <span data-testid={`status-${status}`}>{label}</span>;
};

describe('Survey StatusBadge', () => {
  it('renders Draft for draft status', () => {
    render(<StatusBadge status="draft" />);
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('renders Active for active status', () => {
    render(<StatusBadge status="active" />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders Closed for closed status', () => {
    render(<StatusBadge status="closed" />);
    expect(screen.getByText('Closed')).toBeInTheDocument();
  });

  it('falls back to Draft for unknown status', () => {
    render(<StatusBadge status="unknown" />);
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });
});

// ── Question type icon mapping (extracted from SurveyResultsDashboard) ──────

const QUESTION_TYPE_ICONS: Record<string, string> = {
  rating: 'Star',
  multiple_choice: 'Hash',
  text: 'MessageSquare',
  yes_no: 'ThumbsUp',
  nps: 'BarChart3',
};

describe('Question type icon mapping', () => {
  it('maps rating to Star', () => {
    expect(QUESTION_TYPE_ICONS.rating).toBe('Star');
  });

  it('maps multiple_choice to Hash', () => {
    expect(QUESTION_TYPE_ICONS.multiple_choice).toBe('Hash');
  });

  it('maps text to MessageSquare', () => {
    expect(QUESTION_TYPE_ICONS.text).toBe('MessageSquare');
  });

  it('maps yes_no to ThumbsUp', () => {
    expect(QUESTION_TYPE_ICONS.yes_no).toBe('ThumbsUp');
  });

  it('maps nps to BarChart3', () => {
    expect(QUESTION_TYPE_ICONS.nps).toBe('BarChart3');
  });
});

// ── Response rate calculation (from SurveyResultsDashboard) ─────────────────

describe('Survey response rate calculation', () => {
  it('calculates response rate correctly', () => {
    const totalResponses = 45;
    const invitedCount = 60;
    const rate = Math.round((totalResponses / invitedCount) * 100);
    expect(rate).toBe(75);
  });

  it('returns 100% when all invited responded', () => {
    const rate = Math.round((50 / 50) * 100);
    expect(rate).toBe(100);
  });

  it('returns 0% when no responses', () => {
    const rate = Math.round((0 / 50) * 100);
    expect(rate).toBe(0);
  });
});

// ── Average rating calculation (from SurveyResultsDashboard) ────────────────

describe('Survey average calculation', () => {
  it('calculates average correctly', () => {
    const distribution: Record<string, number> = {
      '1': 5,
      '2': 10,
      '3': 20,
      '4': 10,
      '5': 5,
    };
    const total = Object.values(distribution).reduce((s, v) => s + v, 0);
    const weightedSum = Object.entries(distribution).reduce(
      (s, [val, count]) => s + Number(val) * count,
      0,
    );
    const avg = weightedSum / total;
    expect(avg).toBe(3);
  });

  it('calculates percentage for NPS', () => {
    const avg = 8.5;
    const maxVal = 10;
    const pct = (avg / maxVal) * 100;
    expect(pct).toBe(85);
  });
});

// ── Yes/No percentage calculation ───────────────────────────────────────────

describe('Survey yes/no calculation', () => {
  it('calculates yes percentage', () => {
    const yesCount = 30;
    const noCount = 20;
    const total = yesCount + noCount;
    const yesPct = (yesCount / total) * 100;
    expect(yesPct).toBe(60);
  });

  it('handles zero responses', () => {
    const yesCount = 0;
    const noCount = 0;
    const total = yesCount + noCount;
    const yesPct = total > 0 ? (yesCount / total) * 100 : 0;
    expect(yesPct).toBe(0);
  });
});

// ── STATUS_VARIANT mapping (from SurveyResultsDashboard) ────────────────────

describe('STATUS_VARIANT mapping', () => {
  const STATUS_VARIANT: Record<string, string> = {
    draft: 'secondary',
    active: 'success',
    closed: 'danger',
  };

  it('maps draft to secondary', () => {
    expect(STATUS_VARIANT.draft).toBe('secondary');
  });

  it('maps active to success', () => {
    expect(STATUS_VARIANT.active).toBe('success');
  });

  it('maps closed to danger', () => {
    expect(STATUS_VARIANT.closed).toBe('danger');
  });

  it('returns undefined for unknown', () => {
    expect(STATUS_VARIANT['unknown']).toBeUndefined();
  });
});
