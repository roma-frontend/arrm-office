import { describe, it, expect, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';

// Mock next/dynamic — return a simple component
jest.mock('next/dynamic', () => {
  const MockDynamic = () => null;
  MockDynamic.displayName = 'DynamicMock';
  return jest.fn(() => MockDynamic);
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: { language: 'en' },
  }),
}));

jest.mock('lucide-react', () => {
  const MockIcon = ({ className }: { className?: string }) => (
    <svg data-testid="mock-icon" className={className} />
  );
  return {
    ShieldCheck: MockIcon,
    BarChart3: MockIcon,
    Skeleton: () => null,
  };
});

// Mock close Icon
jest.mock('@/components/ui/skeleton', () => ({
  Skeleton: () => null,
}));

// ── Page tests ──
describe('admin/ai-governance page', () => {
  it('renders the page shell without crashing', async () => {
    const Page = (await import('@/app/(dashboard)/admin/ai-governance/page')).default;
    const { container } = render(<Page />);
    expect(container).toBeTruthy();
  });

  it('renders header with title', async () => {
    const Page = (await import('@/app/(dashboard)/admin/ai-governance/page')).default;
    render(<Page />);
    expect(screen.getByText('AI Governance')).toBeInTheDocument();
    expect(screen.getByText(/Monitor, control, and audit AI agent activity/)).toBeInTheDocument();
  });
});

describe('analytics/reports page', () => {
  it('renders the page shell without crashing', async () => {
    const Page = (await import('@/app/(dashboard)/analytics/reports/page')).default;
    const { container } = render(<Page />);
    expect(container).toBeTruthy();
  });

  it('renders header with title', async () => {
    const Page = (await import('@/app/(dashboard)/analytics/reports/page')).default;
    render(<Page />);
    expect(screen.getByText('Report Builder')).toBeInTheDocument();
    expect(screen.getByText(/Create custom reports and dashboards/)).toBeInTheDocument();
  });
});
