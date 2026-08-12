/**
 * Tests for src/components/tasks/AssignSupervisorModal.tsx — the modal that
 * assigns a supervisor to an employee: option building from the employees and
 * supervisors queries, the selected-employee summary, assign flow with success
 * reset, and the close paths.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ── Mutable fixtures ─────────────────────────────────────────────────────────
let mockEmployees: any = undefined;
let mockSupervisors: any = undefined;
const assignMutation = jest.fn(async () => undefined);

// ── i18n ─────────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | { defaultValue?: string }) => {
      if (typeof fallback === 'string') return fallback;
      if (fallback && typeof fallback === 'object' && 'defaultValue' in fallback) {
        return fallback.defaultValue ?? key;
      }
      return key;
    },
    i18n: { language: 'en' },
  }),
}));

let mockAuthUser: any = { id: 'u1', name: 'Me', organizationId: 'org-1' };
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({ user: mockAuthUser }),
}));

jest.mock('@/lib/logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// ── Convex ───────────────────────────────────────────────────────────────────
jest.mock('@/convex/_generated/api', () => ({
  api: {
    tasks: {
      getUsersForAssignment: { _name: 'tasks.getUsersForAssignment' },
    },
    reporting: {
      getPotentialManagers: { _name: 'reporting.getPotentialManagers' },
      assignManager: { _name: 'reporting.assignManager' },
    },
  },
}));

jest.mock('convex/react', () => ({
  useQuery: (q: any, args?: any) => {
    if (!q || args === 'skip') return undefined;
    if (q._name === 'tasks.getUsersForAssignment') return mockEmployees;
    if (q._name === 'reporting.getPotentialManagers') return mockSupervisors;
    return undefined;
  },
  useMutation: (m: any) => (m._name === 'reporting.assignManager' ? assignMutation : jest.fn()),
}));

// ── next/image ───────────────────────────────────────────────────────────────
jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, ...rest }: any) => <img src={src} alt={alt} {...rest} />,
}));

// ── UI primitives ────────────────────────────────────────────────────────────
jest.mock('@/components/ui/CustomSelect', () => ({
  CustomSelect: ({ value, onChange, options, disabled }: any) => (
    <select value={value} disabled={disabled} onChange={(e: any) => onChange(e.target.value)}>
      {options.map((o: any) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

jest.mock('lucide-react', () => {
  const MockIcon = (props: any) => <span data-testid="lucide-icon" {...props} />;
  return new Proxy({}, { get: () => MockIcon });
});

// ── Module under test ──
import { AssignSupervisorModal } from '@/components/tasks/AssignSupervisorModal';

const EMP = {
  _id: 'emp-1',
  name: 'Anna',
  position: 'Designer',
  department: 'Design',
  avatarUrl: null,
  supervisorId: undefined,
};
const SUP = {
  _id: 'sup-1',
  name: 'Boss',
  role: 'admin',
  department: 'Design',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthUser = { id: 'u1', name: 'Me', organizationId: 'org-1' };
  mockEmployees = undefined;
  mockSupervisors = undefined;
  (assignMutation as jest.Mock).mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('AssignSupervisorModal', () => {
  it('renders the modal shell, both selects and the actions', () => {
    render(<AssignSupervisorModal onClose={jest.fn()} />);

    expect(screen.getByText('modals.assignSupervisor.title')).toBeInTheDocument();
    expect(screen.getByText('modals.assignSupervisor.description')).toBeInTheDocument();
    expect(screen.getByText('modals.assignSupervisor.selectEmployee')).toBeInTheDocument();
    expect(screen.getByText('modals.assignSupervisor.assignSupervisor')).toBeInTheDocument();
    expect(screen.getByText('common.close')).toBeInTheDocument();
    expect(screen.getByText('modals.assignSupervisor.saveAssignment')).toBeInTheDocument();
  });

  it('shows a loading option while employees are undefined and an empty option when none exist', () => {
    const { rerender } = render(<AssignSupervisorModal onClose={jest.fn()} />);
    expect(screen.getByText('commonUI.loading...')).toBeInTheDocument();

    mockEmployees = [];
    rerender(<AssignSupervisorModal onClose={jest.fn()} />);
    expect(screen.getByText('employees.noFound')).toBeInTheDocument();
  });

  it('lists employees with their position and shows the assignment overview', () => {
    mockEmployees = [
      EMP,
      { ...EMP, _id: 'emp-2', name: 'Bob', supervisorId: 'sup-1', avatarUrl: 'https://a/img.png' },
    ];
    mockSupervisors = [SUP];
    render(<AssignSupervisorModal onClose={jest.fn()} />);

    expect(screen.getByText('Anna — Designer')).toBeInTheDocument();
    expect(screen.getByText('Bob — Designer')).toBeInTheDocument();
    // overview rows: Bob has a supervisor arrow, Anna has none
    expect(screen.getByText('→ Boss')).toBeInTheDocument();
    expect(screen.getByText('modals.assignSupervisor.noSupervisor')).toBeInTheDocument();
    // Bob has an avatar image, Anna shows her initial
    expect(screen.getByAltText('Bob')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('shows two-letter initials for a multi-word name', () => {
    mockEmployees = [
      { ...EMP, name: 'Anna Petrova' },
      { ...EMP, _id: 'emp-2', name: 'Bob', supervisorId: 'sup-1', avatarUrl: 'https://a/img.png' },
    ];
    mockSupervisors = [SUP];
    render(<AssignSupervisorModal onClose={jest.fn()} />);

    expect(screen.getByText('AP')).toBeInTheDocument();
  });

  it('skips the queries when there is no authenticated user', () => {
    mockAuthUser = null;
    mockEmployees = [EMP];
    mockSupervisors = [SUP];
    render(<AssignSupervisorModal onClose={jest.fn()} />);

    // Queries were skipped, so no employees/supervisors rendered — only the
    // shell and the loading option for the employee select.
    expect(screen.getByText('commonUI.loading...')).toBeInTheDocument();
    expect(screen.queryByText('Anna')).toBeNull();
  });

  it('shows the employee summary with no current supervisor', () => {
    mockEmployees = [{ ...EMP, supervisorId: undefined }];
    mockSupervisors = [SUP];
    render(<AssignSupervisorModal onClose={jest.fn()} />);

    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'emp-1' } });

    expect(screen.getByText('modals.assignSupervisor.currentSupervisor')).toBeInTheDocument();
    expect(screen.getByText('common.none')).toBeInTheDocument();
  });

  it('shows the selected employee summary with the current supervisor', async () => {
    mockEmployees = [{ ...EMP, supervisorId: 'sup-1' }];
    mockSupervisors = [SUP];
    render(<AssignSupervisorModal onClose={jest.fn()} />);

    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'emp-1' } });

    // Anna appears both in the summary and in the overview list.
    expect(screen.getAllByText('Anna').length).toBeGreaterThan(0);
    expect(screen.getByText('modals.assignSupervisor.currentSupervisor')).toBeInTheDocument();
    expect(screen.getByText('Boss')).toBeInTheDocument();
  });

  it('renders employees and supervisors without position or department', () => {
    mockEmployees = [
      { ...EMP, _id: 'emp-1', name: 'Anna', position: undefined, department: undefined },
      { ...EMP, _id: 'emp-2', name: 'Bob', position: undefined, department: undefined },
    ];
    mockSupervisors = [{ ...SUP, _id: 'sup-1', name: 'Boss', department: undefined }];
    render(<AssignSupervisorModal onClose={jest.fn()} />);

    // Employee option without position suffix; supervisor option without department.
    // 'Anna' appears both in the select option and the overview row.
    expect(screen.getAllByText('Anna').length).toBeGreaterThan(0);
    expect(screen.getByText('Boss (roles.admin)')).toBeInTheDocument();

    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'emp-1' } });
    // Summary without department separator.
    expect(screen.getByText('modals.assignSupervisor.currentSupervisor')).toBeInTheDocument();
  });

  it('renders overview rows with two-word names and missing departments', () => {
    mockEmployees = [
      { ...EMP, name: 'Anna Petrova' },
      { ...EMP, _id: 'emp-2', name: 'Bob' },
    ];
    mockSupervisors = [{ ...SUP, department: undefined }];
    render(<AssignSupervisorModal onClose={jest.fn()} />);

    // Overview rows show the names; Anna's initials are two letters.
    expect(screen.getByText('Anna Petrova')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('AP')).toBeInTheDocument();
  });

  it('enables the supervisor select only after an employee is chosen', () => {
    mockEmployees = [EMP];
    mockSupervisors = [SUP];
    render(<AssignSupervisorModal onClose={jest.fn()} />);

    const supervisorSelect = screen.getAllByRole('combobox')[1];
    expect(supervisorSelect).toBeDisabled();

    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'emp-1' } });
    expect(supervisorSelect).toBeEnabled();
  });

  it('assigns the selected supervisor and resets the form after success', async () => {
    jest.useFakeTimers();
    mockEmployees = [EMP];
    mockSupervisors = [SUP];
    render(<AssignSupervisorModal onClose={jest.fn()} />);

    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'emp-1' } });
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'sup-1' } });
    fireEvent.click(screen.getByText('modals.assignSupervisor.saveAssignment'));

    // Flush the async mutation microtasks before asserting on the banner.
    await act(async () => {});
    expect(assignMutation).toHaveBeenCalledWith({ employeeId: 'emp-1', supervisorId: 'sup-1' });
    // The success banner is prefixed with an emoji.
    expect(screen.getByText(/supervisorAssignedSuccess/)).toBeInTheDocument();

    // After 1.5s the form resets — wrap the timer fire in act to flush the render.
    act(() => {
      jest.advanceTimersByTime(1500);
    });
    expect(screen.queryByText(/supervisorAssignedSuccess/)).toBeNull();
    expect(screen.getAllByRole('combobox')[0]).toHaveValue('');
  });

  it('can remove a supervisor by leaving the field empty', async () => {
    mockEmployees = [EMP];
    mockSupervisors = [SUP];
    render(<AssignSupervisorModal onClose={jest.fn()} />);

    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'emp-1' } });
    // keep the default empty value → supervisorId undefined
    fireEvent.click(screen.getByText('modals.assignSupervisor.saveAssignment'));

    await waitFor(() =>
      expect(assignMutation).toHaveBeenCalledWith({ employeeId: 'emp-1', supervisorId: undefined }),
    );
  });

  it('does nothing when no employee is selected', () => {
    render(<AssignSupervisorModal onClose={jest.fn()} />);
    fireEvent.click(screen.getByText('modals.assignSupervisor.saveAssignment'));
    expect(assignMutation).not.toHaveBeenCalled();
  });

  it('closes via the overlay and the close button', () => {
    const onClose = jest.fn();
    render(<AssignSupervisorModal onClose={onClose} />);

    fireEvent.click(screen.getByText('✕'));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('common.close'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('shows saving state while the mutation is in flight', async () => {
    mockEmployees = [EMP];
    mockSupervisors = [SUP];
    let resolveAssign!: (v: unknown) => void;
    (assignMutation as jest.Mock).mockImplementation(() => new Promise((r) => (resolveAssign = r)));
    render(<AssignSupervisorModal onClose={jest.fn()} />);

    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'emp-1' } });
    fireEvent.click(screen.getByText('modals.assignSupervisor.saveAssignment'));

    expect(screen.getByText('common.saving')).toBeInTheDocument();
    resolveAssign(undefined);
    await waitFor(() =>
      expect(screen.getByText('modals.assignSupervisor.saveAssignment')).toBeInTheDocument(),
    );
  });
});
