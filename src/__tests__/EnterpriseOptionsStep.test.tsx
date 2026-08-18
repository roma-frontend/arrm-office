/**
 * EnterpriseOptionsStep — the per-org Enterprise deal picker in the manual
 * subscription wizard: module checkboxes grouped by category, limit inputs for
 * modules with a settings schema, and the flat-field resolution helpers the
 * wizard uses to submit the selection.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  EnterpriseOptionsStep,
  resolveCustomModules,
} from '@/components/superadmin/EnterpriseOptionsStep';

// Stateful mock so that updates cause the component to re-render.
let stepData: Record<string, string | number | boolean | null | string[]> = {};

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

jest.mock('@/components/ui/wizard', () => ({
  useWizardContext: () => ({
    stepData,
    updateStepData: (key: string, value: string | number | boolean | null | string[]) => {
      stepData = { ...stepData, [key]: value };
    },
  }),
}));

jest.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
    id,
  }: {
    checked?: boolean;
    onCheckedChange?: (v: boolean) => void;
    id?: string;
  }) => (
    <input
      type="checkbox"
      data-testid={id}
      checked={checked ?? false}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
    />
  ),
}));

jest.mock('@/components/ui/label', () => ({
  Label: ({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
}));

beforeEach(() => {
  stepData = {};
});

describe('EnterpriseOptionsStep', () => {
  it('renders category groups with module names', () => {
    render(<EnterpriseOptionsStep />);
    // Category label renders the fallback text (no real i18n in tests).
    expect(screen.getByText('people')).toBeTruthy();
    // Module names render from BILLING_MODULES as fallback.
    expect(screen.getByText('Dashboard')).toBeTruthy();
    expect(screen.getByText('Employees')).toBeTruthy();
  });

  it('toggles a non-core module on and off', () => {
    const { rerender } = render(<EnterpriseOptionsStep />);
    const checkbox = screen.getByTestId('ent-module-payroll') as HTMLInputElement;
    expect(checkbox.checked).toBe(false); // non-core starts off

    fireEvent.click(checkbox);
    rerender(<EnterpriseOptionsStep />); // mock state changed; force re-render
    expect(checkbox.checked).toBe(true);

    fireEvent.click(checkbox);
    rerender(<EnterpriseOptionsStep />);
    expect(checkbox.checked).toBe(false);
  });

  it('core modules are always checked and cannot be unchecked', () => {
    const { rerender } = render(<EnterpriseOptionsStep />);
    const checkbox = screen.getByTestId('ent-module-dashboard') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    fireEvent.click(checkbox);
    rerender(<EnterpriseOptionsStep />);
    // Core modules are immutable — the toggle is a no-op.
    expect(checkbox.checked).toBe(true);
  });

  it('resolveCustomModules falls back to core-only defaults when untouched', () => {
    const result = resolveCustomModules({});
    expect(result.length).toBeGreaterThan(0);
    // Core modules (dashboard, profile) default to included.
    expect(result.find((m) => m.moduleKey === 'dashboard')?.included).toBe(true);
    expect(result.find((m) => m.moduleKey === 'profile')?.included).toBe(true);
    // Non-core modules default to excluded.
    expect(result.find((m) => m.moduleKey === 'employees')?.included).toBe(false);
    expect(result.find((m) => m.moduleKey === 'payroll')?.included).toBe(false);
  });

  it('resolveCustomModules reads the wizard selection and limits', () => {
    const result = resolveCustomModules({
      customModules: ['employees', 'payroll'],
      customLimitsJson: JSON.stringify({ employees: { seats: 150 } }),
    });
    expect(result.find((m) => m.moduleKey === 'employees')?.included).toBe(true);
    expect(result.find((m) => m.moduleKey === 'employees')?.limits).toEqual({ seats: 150 });
    expect(result.find((m) => m.moduleKey === 'payroll')?.included).toBe(true);
  });
});
