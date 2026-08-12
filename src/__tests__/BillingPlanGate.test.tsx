/**
 * Tests for the billing/PlanGate re-export (which re-exports the canonical
 * subscription/PlanGate) plus UpgradeBadge and useUpgradeModal.
 *
 * The billing file is a pure re-export: importing it and rendering the
 * canonical component through it covers the re-export statements.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';

// Mutable plan-features behavior.
let mockCanAccess: (feature: string) => boolean = () => true;
let mockRequiresPlan: (feature: string) => string | null = () => null;
let mockIsLoading = false;

jest.mock('@/hooks/usePlanFeatures', () => ({
  usePlanFeatures: () => ({
    canAccess: mockCanAccess,
    requiresPlan: mockRequiresPlan,
    isLoading: mockIsLoading,
  }),
  PLAN_LABELS: {
    starter: 'Starter',
    professional: 'Professional',
    enterprise: 'Enterprise',
  },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => (typeof fallback === 'string' ? fallback : key),
  }),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, size }: any) => (
    <button type="button" onClick={onClick} data-size={size}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/subscription/UpgradeModal', () => ({
  UpgradeModal: ({ open, onClose, featureTitle, featureDescription, recommendedPlan }: any) =>
    open ? (
      <div data-testid="upgrade-modal">
        <button type="button" data-testid="upgrade-close" onClick={onClose}>
          close
        </button>
        <div>{featureTitle}</div>
        <div>{featureDescription}</div>
        <div data-testid="recommended-plan">{recommendedPlan}</div>
      </div>
    ) : null,
}));

jest.mock('lucide-react', () => ({
  Lock: (props: any) => <span data-testid="icon-lock" {...props} />,
  Zap: (props: any) => <span data-testid="icon-zap" {...props} />,
}));

import { PlanGate, UpgradeBadge } from '@/components/billing/PlanGate';
// useUpgradeModal is not part of the billing re-export — import the canonical one.
import { useUpgradeModal } from '@/components/subscription/PlanGate';

describe('PlanGate (via billing re-export)', () => {
  beforeEach(() => {
    mockCanAccess = () => true;
    mockRequiresPlan = () => null;
    mockIsLoading = false;
  });

  it('renders children when access is granted', () => {
    render(<PlanGate feature="analytics">Secret content</PlanGate>);
    expect(screen.getByText('Secret content')).toBeInTheDocument();
    expect(screen.queryByText('planGate.upgradeTo')).not.toBeInTheDocument();
  });

  it('shows children while loading to avoid a flash', () => {
    mockIsLoading = true;
    render(<PlanGate feature="analytics">Loading content</PlanGate>);
    expect(screen.getByText('Loading content')).toBeInTheDocument();
  });

  it('renders the custom fallback when access is denied', () => {
    mockCanAccess = () => false;
    render(
      <PlanGate feature="analytics" fallback={<div>Custom upsell</div>}>
        Hidden
      </PlanGate>,
    );
    expect(screen.getByText('Custom upsell')).toBeInTheDocument();
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });

  it('renders the upgrade card and opens the modal on upgrade click', () => {
    mockCanAccess = () => false;
    mockRequiresPlan = (f) => (f === 'analytics' ? 'professional' : null);
    render(
      <PlanGate feature="analytics" title="Advanced Analytics" description="Unlock insights">
        Hidden
      </PlanGate>,
    );
    expect(screen.getByText('Advanced Analytics')).toBeInTheDocument();
    expect(screen.getByText('Unlock insights')).toBeInTheDocument();
    // planGate.upgradeTo + Professional.
    expect(screen.getByText('planGate.upgradeTo Professional')).toBeInTheDocument();

    fireEvent.click(screen.getByText('planGate.upgradeTo Professional'));
    expect(screen.getByTestId('upgrade-modal')).toBeInTheDocument();
    expect(screen.getByTestId('recommended-plan')).toHaveTextContent('professional');
  });

  it('closes the upgrade modal', () => {
    mockCanAccess = () => false;
    render(<PlanGate feature="analytics">Hidden</PlanGate>);
    fireEvent.click(screen.getByText('planGate.upgradeTo Professional'));
    fireEvent.click(screen.getByTestId('upgrade-close'));
    expect(screen.queryByTestId('upgrade-modal')).not.toBeInTheDocument();
  });

  it('maps starter to professional in the recommended plan', () => {
    mockCanAccess = () => false;
    mockRequiresPlan = () => 'starter';
    render(<PlanGate feature="analytics">Hidden</PlanGate>);
    fireEvent.click(screen.getByText('planGate.upgradeTo Starter'));
    expect(screen.getByTestId('recommended-plan')).toHaveTextContent('professional');
  });

  it('defaults to professional when requiresPlan is null', () => {
    mockCanAccess = () => false;
    render(<PlanGate feature="analytics">Hidden</PlanGate>);
    fireEvent.click(screen.getByText('planGate.upgradeTo Professional'));
    expect(screen.getByTestId('recommended-plan')).toHaveTextContent('professional');
  });

  it('renders overlay mode with blurred children', () => {
    mockCanAccess = () => false;
    render(
      <PlanGate feature="analytics" mode="overlay">
        Blurred content
      </PlanGate>,
    );
    // Children still render (blurred).
    expect(screen.getByText('Blurred content')).toBeInTheDocument();
    expect(screen.getByText('planGate.upgradeTo Professional')).toBeInTheDocument();
  });

  it('opens the upgrade modal from the overlay card', () => {
    mockCanAccess = () => false;
    render(
      <PlanGate feature="analytics" mode="overlay">
        Blurred
      </PlanGate>,
    );
    fireEvent.click(screen.getByText('planGate.upgradeTo Professional'));
    expect(screen.getByTestId('upgrade-modal')).toBeInTheDocument();
  });
});

describe('UpgradeBadge', () => {
  it('renders the default professional label', () => {
    render(<UpgradeBadge />);
    expect(screen.getByText('Professional')).toBeInTheDocument();
  });

  it('renders the enterprise label', () => {
    render(<UpgradeBadge requiredPlan="enterprise" />);
    expect(screen.getByText('Enterprise')).toBeInTheDocument();
  });
});

describe('useUpgradeModal', () => {
  it('returns a closed modal initially and opens it on demand', () => {
    const Harness = () => {
      const { openModal, modal } = useUpgradeModal();
      return (
        <div>
          <button type="button" onClick={() => openModal()}>
            Open
          </button>
          {modal}
        </div>
      );
    };
    render(<Harness />);
    expect(screen.queryByTestId('upgrade-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByTestId('upgrade-modal')).toBeInTheDocument();
  });

  it('passes config options to the modal and closes it', () => {
    const Harness = () => {
      const { openModal, modal } = useUpgradeModal();
      return (
        <div>
          <button
            type="button"
            onClick={() =>
              openModal({
                featureTitle: 'Pro Feature',
                featureDescription: 'More power',
                recommendedPlan: 'enterprise',
              })
            }
          >
            Open
          </button>
          {modal}
        </div>
      );
    };
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByText('Pro Feature')).toBeInTheDocument();
    expect(screen.getByText('More power')).toBeInTheDocument();
    expect(screen.getByTestId('recommended-plan')).toHaveTextContent('enterprise');
    // Close via the modal's onClose → covers the setOpen(false) handler.
    fireEvent.click(screen.getByTestId('upgrade-close'));
    expect(screen.queryByTestId('upgrade-modal')).not.toBeInTheDocument();
  });
});
