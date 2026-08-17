/**
 * Tests for src/components/employees/AssignManagerModal.tsx — the modal that
 * picks a manager for one employee.
 *
 * The behaviours pinned here are the ones that were broken in the UI: clicking a
 * candidate must select it without closing the modal or reordering the list
 * under the cursor, and the footer must name the person being assigned.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ── Mutable fixtures ─────────────────────────────────────────────────────────
let mockManagers: any = undefined;
let mockReportingLine: any = undefined;
const assignMutation = jest.fn(async () => undefined);

// ── i18n ─────────────────────────────────────────────────────────────────────
// Interpolates {{var}} like the real i18next, so a missing value is visible.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: any, opts?: any) => {
      const values = typeof fallback === 'object' && fallback !== null ? fallback : opts;
      const template = typeof fallback === 'string' ? fallback : key;
      if (!values) return template;
      return template.replace(/\{\{(\w+)\}\}/g, (m: string, name: string) =>
        values[name] === undefined ? m : String(values[name]),
      );
    },
    i18n: { language: 'en' },
  }),
}));

jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: (selector?: any) => {
    const state = { user: { id: 'me', name: 'Me', organizationId: 'org-1' } };
    return selector ? selector(state) : state;
  },
}));

jest.mock('zustand/shallow', () => ({ useShallow: (fn: any) => fn }));

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

// ── Convex ───────────────────────────────────────────────────────────────────
jest.mock('../../convex/_generated/api', () => ({
  api: {
    reporting: {
      getPotentialManagers: { _name: 'reporting.getPotentialManagers' },
      getReportingLine: { _name: 'reporting.getReportingLine' },
      assignManager: { _name: 'reporting.assignManager' },
    },
  },
}));

jest.mock('convex/react', () => ({
  useQuery: (q: any, args?: any) => {
    if (!q || args === 'skip') return undefined;
    if (q._name === 'reporting.getPotentialManagers') return mockManagers;
    if (q._name === 'reporting.getReportingLine') return mockReportingLine;
    return undefined;
  },
  useMutation: () => assignMutation,
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, ...rest }: any) => <img src={src} alt={alt} {...rest} />,
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <div data-testid="loader" />,
}));

jest.mock('lucide-react', () => {
  const MockIcon = (props: any) => <span data-testid="lucide-icon" {...props} />;
  return new Proxy({}, { get: () => MockIcon });
});

// ── Module under test ────────────────────────────────────────────────────────
import { AssignManagerModal } from '@/components/employees/AssignManagerModal';

const ROMAN = {
  _id: 'u-roman',
  name: 'Роман',
  email: 'roman@example.com',
  role: 'admin',
  department: 'Finance',
  position: 'FAO',
};
const ALEX = {
  _id: 'u-alex',
  name: 'Alex',
  email: 'alex@example.com',
  role: 'employee',
  department: 'Finance',
  position: 'Sales Manager',
};
const PETROS = {
  _id: 'u-petros',
  name: 'Petros Petrosyan',
  email: 'petros@example.com',
  role: 'employee',
  department: 'Finance',
  position: 'Senior Finance Officer',
};

function renderModal(props: Record<string, unknown> = {}) {
  const onClose = jest.fn();
  const onSuccess = jest.fn();
  const utils = render(
    <AssignManagerModal
      employeeId={'emp-1' as any}
      employeeName="Cane Corso"
      currentSupervisorId={'u-roman' as any}
      organizationId={'org-1' as any}
      open
      onClose={onClose}
      onSuccess={onSuccess}
      {...(props as any)}
    />,
  );
  return { ...utils, onClose, onSuccess };
}

/** The clickable row for a candidate — the button wrapping their name. */
function rowFor(name: string) {
  return screen.getByText(name).closest('button') as HTMLElement;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockManagers = [ROMAN, ALEX, PETROS];
  mockReportingLine = { ancestors: [ROMAN], directReports: [], subject: {} };
  (assignMutation as jest.Mock).mockResolvedValue(undefined);
});

describe('AssignManagerModal', () => {
  it('renders the candidates with their role, position and department', () => {
    renderModal();
    expect(screen.getByText('Assign Manager', { selector: 'h2' })).toBeInTheDocument();
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('Sales Manager')).toBeInTheDocument();
    expect(screen.getByText('alex@example.com')).toBeInTheDocument();
  });

  it('keeps the modal open when a candidate is clicked', () => {
    const { onClose } = renderModal();
    fireEvent.click(rowFor('Alex'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('leaves the candidates in place when the selection changes', () => {
    const { container } = renderModal();
    const order = () =>
      Array.from(container.querySelectorAll('[data-candidate]')).map((el) =>
        el.getAttribute('data-candidate'),
      );

    const before = order();
    expect(before).toEqual(['u-roman', 'u-alex', 'u-petros']);

    fireEvent.click(rowFor('Petros Petrosyan'));
    expect(order()).toEqual(before);
  });

  it('names the person being assigned in the footer', () => {
    renderModal();
    fireEvent.click(rowFor('Alex'));
    expect(screen.getByText('Alex will be set as the manager.')).toBeInTheDocument();
  });

  it('closes via the backdrop but not via a click inside the dialog', () => {
    const { container, onClose } = renderModal();

    fireEvent.click(screen.getByText('Assign Manager', { selector: 'h2' }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(container.querySelector('[data-backdrop]') as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('assigns the selected manager and closes', async () => {
    const { onClose, onSuccess } = renderModal();
    fireEvent.click(rowFor('Alex'));
    fireEvent.click(screen.getByRole('button', { name: /Assign Manager/ }));

    await waitFor(() => expect(assignMutation).toHaveBeenCalledTimes(1));
    expect(assignMutation).toHaveBeenCalledWith({ employeeId: 'emp-1', supervisorId: 'u-alex' });
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it('removes the manager when the clear row is chosen', async () => {
    renderModal();
    fireEvent.click(screen.getByText('Click to remove current manager').closest('button')!);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() =>
      expect(assignMutation).toHaveBeenCalledWith({
        employeeId: 'emp-1',
        supervisorId: undefined,
      }),
    );
  });

  it('renders nothing when closed', () => {
    const { container } = renderModal({ open: false });
    expect(container.querySelector('[data-backdrop]')).toBeNull();
    expect(screen.queryByText('Alex')).toBeNull();
  });
});
