/**
 * Tests for SharedCalendarDialog — the opt-in colleague picker behind the
 * shared calendar: department grouping, search, per-person access states and
 * the organization-wide entry for approved viewers.
 */
import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: any) =>
      fallback && typeof fallback === 'object' ? (fallback.defaultValue ?? key) : fallback || key,
    i18n: { language: 'en' },
  }),
}));

jest.mock('@/components/ui/sheet', () => ({
  Sheet: ({ open, children }: any) => (open ? <div>{children}</div> : null),
  SheetBody: ({ children }: any) => <div>{children}</div>,
  SheetContent: ({ children }: any) => <div data-testid="sheet-content">{children}</div>,
  SheetDescription: ({ children }: any) => <p>{children}</p>,
  SheetHeader: ({ children }: any) => <div>{children}</div>,
  SheetTitle: ({ children }: any) => <h2>{children}</h2>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: any) => <span>{children}</span>,
}));

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: any) => <span>{children}</span>,
  AvatarFallback: ({ children }: any) => <span>{children}</span>,
}));

jest.mock('lucide-react', () => {
  const mkIcon = (name: string) => (props: any) => <span data-testid={`icon-${name}`} {...props} />;
  return {
    Building2: mkIcon('Building2'),
    Check: mkIcon('Check'),
    Clock3: mkIcon('Clock3'),
    Eye: mkIcon('Eye'),
    History: mkIcon('History'),
    Search: mkIcon('Search'),
    Send: mkIcon('Send'),
    ShieldCheck: mkIcon('ShieldCheck'),
    Trash2: mkIcon('Trash2'),
    User: mkIcon('User'),
    Users: mkIcon('Users'),
  };
});

// Relative time is locale machinery, not behaviour under test here.
jest.mock('@/lib/date-format', () => ({
  formatRelativeTime: () => '2 days ago',
}));

import SharedCalendarDialog from '@/components/calendar/SharedCalendarDialog';

const PEOPLE = [
  { _id: 'u-1', name: 'Anna Petrova', department: 'Engineering', position: 'Developer' },
  { _id: 'u-2', name: 'Maya Chen', department: 'Finance', position: 'Accountant' },
  { _id: 'u-3', name: 'Bob Smith', department: undefined, position: 'Contractor' },
] as any;

const baseProps = {
  open: true,
  onClose: jest.fn(),
  people: PEOPLE,
  organizationAccess: 'none' as const,
  personAccess: {},
  availableCalendars: [],
  viewers: [],
  activeView: { type: 'mine' } as const,
  onSelectMine: jest.fn(),
  onSelectPerson: jest.fn(),
  onRequestPerson: jest.fn(),
  onSelectOrganization: jest.fn(),
  onRevokeViewer: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SharedCalendarDialog', () => {
  it('groups colleagues by department with a fallback bucket', () => {
    render(<SharedCalendarDialog {...baseProps} />);
    expect(screen.getByText('Engineering')).toBeInTheDocument();
    expect(screen.getByText('Finance')).toBeInTheDocument();
    expect(screen.getByText('No department')).toBeInTheDocument();
    // Every colleague renders a row.
    expect(screen.getByText('Anna Petrova')).toBeInTheDocument();
    expect(screen.getByText('Maya Chen')).toBeInTheDocument();
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    render(<SharedCalendarDialog {...baseProps} open={false} />);
    expect(screen.queryByTestId('sheet-content')).not.toBeInTheDocument();
  });

  it('filters colleagues through the search field', () => {
    render(<SharedCalendarDialog {...baseProps} />);
    fireEvent.change(screen.getByLabelText('Search colleagues'), { target: { value: 'fin' } });
    expect(screen.getByText('Maya Chen')).toBeInTheDocument();
    expect(screen.queryByText('Anna Petrova')).not.toBeInTheDocument();
    expect(screen.queryByText('Bob Smith')).not.toBeInTheDocument();
  });

  it('offers a request for colleagues without access', () => {
    render(<SharedCalendarDialog {...baseProps} />);
    fireEvent.click(screen.getAllByText('Request access')[0]);
    expect(baseProps.onRequestPerson).toHaveBeenCalled();
  });

  it('opens granted colleagues and marks pending ones as sent', () => {
    render(
      <SharedCalendarDialog
        {...baseProps}
        personAccess={{ 'u-1': 'approved', 'u-2': 'pending' }}
      />,
    );
    // Approved → view action.
    fireEvent.click(screen.getAllByText('View')[0]);
    expect(baseProps.onSelectPerson).toHaveBeenCalledWith('u-1');
    // Pending → static badge, no request button for that person.
    expect(screen.getAllByText('Request sent').length).toBe(1);
    expect(screen.getAllByText('Request access').length).toBe(1);
  });

  it('keeps org-wide approval out of individual calendars', () => {
    render(<SharedCalendarDialog {...baseProps} organizationAccess="approved" />);
    // Org access opens the organization entry only — a colleague still has to
    // approve their own calendar, which is what the events query enforces.
    expect(screen.queryByText('View')).not.toBeInTheDocument();
    expect(screen.getAllByText('Request access').length).toBe(3);
    fireEvent.click(screen.getByText('Entire organization'));
    expect(baseProps.onSelectOrganization).toHaveBeenCalled();
  });

  it('pins already-granted calendars on top, most recently opened first', () => {
    render(
      <SharedCalendarDialog
        {...baseProps}
        availableCalendars={[
          { userId: 'u-2', name: 'Maya Chen', grantedAt: 10, lastViewedAt: 20 },
          { userId: 'u-1', name: 'Anna Petrova', grantedAt: 5, lastViewedAt: 90 },
        ]}
      />,
    );
    expect(screen.getByText('Calendars you can open')).toBeInTheDocument();
    const names = screen.getAllByText(/Anna Petrova|Maya Chen/).map((node) => node.textContent);
    // Anna was opened later, so she leads; neither is repeated in a department.
    expect(names).toEqual(['Anna Petrova', 'Maya Chen']);
    expect(screen.queryByText('Finance')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByText('View')[1]);
    expect(baseProps.onSelectPerson).toHaveBeenCalledWith('u-2');
  });

  it('revokes access from the second tab', () => {
    render(
      <SharedCalendarDialog
        {...baseProps}
        viewers={[
          {
            _id: 'access-1' as never,
            viewerId: 'u-9',
            viewerName: 'Karen Movsisyan',
            scope: 'person' as const,
            grantedAt: 3,
          },
        ]}
      />,
    );
    // The list is behind its own tab, so the picker stays the default view.
    expect(screen.queryByText('Karen Movsisyan')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Who sees mine (1)'));
    expect(screen.getByText('Karen Movsisyan')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Revoke'));
    expect(baseProps.onRevokeViewer).toHaveBeenCalledWith('access-1');
  });

  it('tells the owner when nobody has access to their calendar', () => {
    render(<SharedCalendarDialog {...baseProps} />);
    fireEvent.click(screen.getByText('Who sees mine'));
    expect(screen.getByText('Nobody can see your calendar yet.')).toBeInTheDocument();
  });

  it('hides the organization entry from viewers without approval', () => {
    render(<SharedCalendarDialog {...baseProps} />);
    expect(screen.queryByText('Entire organization')).not.toBeInTheDocument();
  });

  it('returns to the personal calendar from the dialog', () => {
    render(<SharedCalendarDialog {...baseProps} />);
    fireEvent.click(screen.getByText('My calendar'));
    expect(baseProps.onSelectMine).toHaveBeenCalled();
    expect(baseProps.onClose).toHaveBeenCalled();
  });
});
