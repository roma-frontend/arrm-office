/**
 * Tests for HolidayCalendarSync — the admin calendar export/sync panel:
 * loading state, stats, iCal export (success/error/empty), Google/Outlook
 * connect flows (auth redirect, connection URL params, sync POST success and
 * failure, no-events info), and plan gating via usePlanFeatures + upgrade
 * modal.
 *
 * Mocks: convex/react, api, react-i18next, calendar-sync helpers,
 * usePlanFeatures (mutable canAccess), useUpgradeModal, sonner, UI
 * primitives, lucide, ShieldLoader, logger, and window.location/history.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: any) => (typeof fallback === 'object' ? key : (fallback ?? key)),
    i18n: { language: 'en' },
  }),
}));

let queryResults: Record<string, unknown> = {};

jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    admin: {
      getCalendarExportData: { _name: 'getCalendarExportData' },
    },
  },
}));

const mockGenerateICalendar = jest.fn();
const mockDownloadICalFile = jest.fn();
const mockGetGoogleAuthUrl = jest.fn();
const mockGetOutlookAuthUrl = jest.fn();

jest.mock('@/lib/calendar-sync', () => ({
  generateICalendar: (...args: any[]) => mockGenerateICalendar(...args),
  downloadICalFile: (...args: any[]) => mockDownloadICalFile(...args),
  getGoogleCalendarAuthUrl: (...args: any[]) => mockGetGoogleAuthUrl(...args),
  getOutlookAuthUrl: (...args: any[]) => mockGetOutlookAuthUrl(...args),
}));

let mockCanAccess: boolean = true;
jest.mock('@/hooks/usePlanFeatures', () => ({
  usePlanFeatures: () => ({ canAccess: () => mockCanAccess }),
}));

let mockOpenModal: jest.Mock;
jest.mock('@/components/subscription/PlanGate', () => ({
  useUpgradeModal: () => ({
    openModal: (opts: any) => mockOpenModal(opts),
    modal: <div data-testid="upgrade-modal">upgrade</div>,
  }),
}));

jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn(), info: jest.fn() },
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() },
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, variant, className }: any) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant} className={className}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: any) => <span>{children}</span>,
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <div data-testid="shield-loader" />,
}));

jest.mock('lucide-react', () => {
  const icons = ['Calendar', 'Download', 'ExternalLink', 'CheckCircle2', 'Lock'];
  const mocks: Record<string, any> = {};
  for (const name of icons)
    mocks[name] = (props: any) => <span data-testid={`icon-${name}`} {...props} />;
  return mocks;
});

import HolidayCalendarSync from '@/components/admin/HolidayCalendarSync';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

const EVENTS = [
  {
    id: 'e-1',
    title: 'Vacation',
    startDate: '2026-05-01',
    endDate: '2026-05-05',
    description: 'PTO',
    userName: 'Anna',
    department: 'Eng',
    type: 'leave',
  },
];

const originalReplaceState = window.history.replaceState;

describe('HolidayCalendarSync', () => {
  let replaceStateSpy: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    queryResults = { getCalendarExportData: EVENTS };
    mockCanAccess = true;
    mockOpenModal = jest.fn();
    mockGenerateICalendar.mockReturnValue('BEGIN:VCALENDAR');
    mockGetGoogleAuthUrl.mockReturnValue('https://accounts.google.com/auth?x=1');
    mockGetOutlookAuthUrl.mockReturnValue('https://login.microsoftonline.com/auth?x=1');
    // jsdom cannot redefine window.location; drive the connection params
    // through the real history API instead.
    window.history.replaceState({}, '', '/admin');
    replaceStateSpy = jest.spyOn(window.history, 'replaceState') as unknown as jest.Mock;
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: async () => ({ message: 'Synced OK' }) }),
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/admin');
    replaceStateSpy.mockRestore();
    cleanup();
  });

  it('shows a loader while calendar data loads', () => {
    queryResults = { getCalendarExportData: undefined };
    render(<HolidayCalendarSync organizationId="org-1" />);
    expect(screen.getByTestId('shield-loader')).toBeInTheDocument();
  });

  it('renders the title and the number of upcoming leaves', () => {
    render(<HolidayCalendarSync organizationId="org-1" />);
    expect(screen.getByText('calendarSync.title')).toBeInTheDocument();
    expect(screen.getByText('calendarSync.upcomingLeaves')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('exports and downloads the iCal file', async () => {
    render(<HolidayCalendarSync organizationId="org-1" />);
    fireEvent.click(screen.getByText('calendarSync.downloadIcal'));

    await waitFor(() => {
      expect(mockGenerateICalendar).toHaveBeenCalledWith(EVENTS);
    });
    expect(mockDownloadICalFile).toHaveBeenCalledWith(
      'BEGIN:VCALENDAR',
      'calendarSync.icsFilename',
    );
    expect(toast.success).toHaveBeenCalledWith('iCal file downloaded successfully');
  });

  it('toasts an error when the export fails', async () => {
    mockGenerateICalendar.mockImplementation(() => {
      throw new Error('boom');
    });
    render(<HolidayCalendarSync organizationId="org-1" />);
    fireEvent.click(screen.getByText('calendarSync.downloadIcal'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to export calendar'));
    expect(logger.error).toHaveBeenCalled();
  });

  it('disables the export button when there are no events', () => {
    queryResults = { getCalendarExportData: [] };
    render(<HolidayCalendarSync organizationId="org-1" />);
    expect(screen.getByText('calendarSync.downloadIcal').closest('button')).toBeDisabled();
    expect(screen.getByText('calendarSync.noUpcoming')).toBeInTheDocument();
  });

  it('redirects to Google auth when not connected', () => {
    render(<HolidayCalendarSync organizationId="org-1" />);
    fireEvent.click(screen.getByText('calendarSync.connectGoogle'));
    expect(mockGetGoogleAuthUrl).toHaveBeenCalledWith(
      `${window.location.origin}/api/calendar/google/callback`,
    );
  });

  it('redirects to Outlook auth when not connected', () => {
    render(<HolidayCalendarSync organizationId="org-1" />);
    fireEvent.click(screen.getByText('calendarSync.connectOutlook'));
    expect(mockGetOutlookAuthUrl).toHaveBeenCalledWith(
      `${window.location.origin}/api/calendar/outlook/callback`,
    );
  });

  it('toasts an error when Google auth config throws', async () => {
    mockGetGoogleAuthUrl.mockImplementation(() => {
      throw new Error('no config');
    });
    render(<HolidayCalendarSync organizationId="org-1" />);
    fireEvent.click(screen.getByText('calendarSync.connectGoogle'));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Google Calendar is not configured'),
    );
  });

  it('toasts an error when Outlook auth config throws', async () => {
    mockGetOutlookAuthUrl.mockImplementation(() => {
      throw new Error('no config');
    });
    render(<HolidayCalendarSync organizationId="org-1" />);
    fireEvent.click(screen.getByText('calendarSync.connectOutlook'));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Outlook Calendar is not configured'),
    );
  });

  it('syncs events to Google when already connected', async () => {
    window.history.replaceState({}, '', '/admin?google_calendar=connected');
    render(<HolidayCalendarSync organizationId="org-1" />);

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('calendarSync.googleSuccess'));
    expect(screen.getByText('calendarSync.syncWithGoogle')).toBeInTheDocument();

    fireEvent.click(screen.getByText('calendarSync.syncWithGoogle'));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/calendar/google/sync',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(toast.success).toHaveBeenCalledWith('Synced OK');
  });

  it('syncs events to Outlook when already connected', async () => {
    window.history.replaceState({}, '', '/admin?outlook_calendar=connected');
    render(<HolidayCalendarSync organizationId="org-1" />);

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('calendarSync.outlookSuccess'));
    fireEvent.click(screen.getByText('calendarSync.syncWithOutlook'));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/calendar/outlook/sync',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(toast.success).toHaveBeenCalledWith('Synced OK');
  });

  it('toasts an error and resets connection when the Google sync fails', async () => {
    window.history.replaceState({}, '', '/admin?google_calendar=connected');
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    render(<HolidayCalendarSync organizationId="org-1" />);

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    fireEvent.click(screen.getByText('calendarSync.syncWithGoogle'));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Failed to sync with Google Calendar'),
    );
    // Connection badge is gone after the failure.
    expect(screen.queryByText('calendarSync.connected')).toBeNull();
    expect(screen.getByText('calendarSync.connectGoogle')).toBeInTheDocument();
  });

  it('uses a default message when the Google sync response has none', async () => {
    window.history.replaceState({}, '', '/admin?google_calendar=connected');
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });
    render(<HolidayCalendarSync organizationId="org-1" />);
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    fireEvent.click(screen.getByText('calendarSync.syncWithGoogle'));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Synced'));
  });

  it('uses a default message when the Outlook sync response has none', async () => {
    window.history.replaceState({}, '', '/admin?outlook_calendar=connected');
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });
    render(<HolidayCalendarSync organizationId="org-1" />);
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    fireEvent.click(screen.getByText('calendarSync.syncWithOutlook'));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Synced'));
  });

  it('toasts an error and resets connection when the Outlook sync fails', async () => {
    window.history.replaceState({}, '', '/admin?outlook_calendar=connected');
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    render(<HolidayCalendarSync organizationId="org-1" />);

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    fireEvent.click(screen.getByText('calendarSync.syncWithOutlook'));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Failed to sync with Outlook Calendar'),
    );
    expect(screen.queryByText('calendarSync.connected')).toBeNull();
  });

  it('does not allow syncing when connected but there are no events', async () => {
    window.history.replaceState({}, '', '/admin?google_calendar=connected');
    queryResults = { getCalendarExportData: [] };
    render(<HolidayCalendarSync organizationId="org-1" />);

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    // The sync button stays disabled while there is nothing to sync.
    expect(screen.getByText('calendarSync.syncWithGoogle').closest('button')).toBeDisabled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('cleans the URL after handling connection params', async () => {
    window.history.replaceState({}, '', '/admin?error=denied');
    render(<HolidayCalendarSync organizationId="org-1" />);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to connect to calendar'));
    expect(replaceStateSpy).toHaveBeenCalled();
  });

  it('opens the upgrade modal for Google sync on free plans', () => {
    mockCanAccess = false;
    render(<HolidayCalendarSync organizationId="org-1" />);
    expect(screen.getAllByText('calendarSync.pro').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText('calendarSync.connectGoogle'));
    expect(mockOpenModal).toHaveBeenCalledWith(
      expect.objectContaining({ recommendedPlan: 'professional' }),
    );
    expect(screen.getByTestId('upgrade-modal')).toBeInTheDocument();
  });

  it('opens the upgrade modal for Outlook sync on free plans', () => {
    mockCanAccess = false;
    render(<HolidayCalendarSync organizationId="org-1" />);
    fireEvent.click(screen.getByText('calendarSync.connectOutlook'));
    expect(mockOpenModal).toHaveBeenCalledWith(
      expect.objectContaining({ recommendedPlan: 'professional' }),
    );
  });

  it('does not navigate when the plan gates the sync', () => {
    mockCanAccess = false;
    render(<HolidayCalendarSync organizationId="org-1" />);
    fireEvent.click(screen.getByText('calendarSync.connectGoogle'));
    expect(mockGetGoogleAuthUrl).not.toHaveBeenCalled();
    expect(mockOpenModal).toHaveBeenCalled();
  });
});
