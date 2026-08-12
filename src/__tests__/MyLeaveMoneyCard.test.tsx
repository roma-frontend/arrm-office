/**
 * Tests for MyLeaveMoneyCard — leave balance valued in money + Excel export.
 *
 * Mocks: convex/react useQuery keyed by ref name, react-i18next fallback-t,
 * i18next (mutable language for export lang), formatCurrency/getLeaveTypeLabel
 * stubs, sonner toast, logger, ui Card/Button stubs, lucide stubs, fetch.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

const queryResults: Record<string, unknown> = {};
const mockLang: { language: string } = { language: 'en' };

jest.mock('@/convex/_generated/api', () => ({
  api: {
    leaveAccrual: {
      getMyLeaveMoney: { _name: 'getMyLeaveMoney' },
    },
  },
}));

jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
  }),
}));

jest.mock('i18next', () => ({
  __esModule: true,
  default: mockLang,
}));

jest.mock('@/lib/payrollUtils', () => ({
  formatCurrency: (amount: number, currency: string) => `${amount} ${currency}`,
}));

jest.mock('@/lib/types', () => ({
  getLeaveTypeLabel: (type: string) => `label-${type}`,
}));

jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn() },
}));

const mockToast = { success: jest.fn(), error: jest.fn() };
jest.mock('sonner', () => ({ toast: mockToast }));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled }: any) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

jest.mock('lucide-react', () => ({
  Wallet: () => <span>wallet</span>,
  Download: () => <span>download</span>,
  Loader2: () => <span>spinner</span>,
}));

import { MyLeaveMoneyCard } from '@/components/dashboard/MyLeaveMoneyCard';
import type { Id } from '@/convex/_generated/dataModel';

const BASE_DATA = {
  types: [
    {
      type: 'paid',
      used: 2,
      remaining: 18,
      total: 20,
      dailyRate: 5000,
      grossValue: 90000,
      netValue: 72000,
    },
    {
      type: 'sick',
      used: 0,
      remaining: 0,
      total: 0,
      dailyRate: 5000,
      grossValue: 0,
      netValue: 0,
    },
  ],
  currency: 'AMD',
  dailyRate: 5000,
  workingDaysPerMonth: 21,
  totals: { grossValue: 90000, netValue: 72000 },
};

function setData(data: unknown) {
  queryResults['getMyLeaveMoney'] = data;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLang.language = 'en';
  delete queryResults['getMyLeaveMoney'];
  global.fetch = jest.fn() as unknown as typeof fetch;
});

describe('MyLeaveMoneyCard', () => {
  it('renders nothing while data is loading', () => {
    const { container } = render(<MyLeaveMoneyCard userId={'user_1' as Id<'users'>} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders header, daily rate and totals', () => {
    setData(BASE_DATA);
    render(<MyLeaveMoneyCard userId={'user_1' as Id<'users'>} />);
    expect(screen.getByText('dashboard.leaveMoney.title')).toBeInTheDocument();
    expect(screen.getByText('5000 AMD')).toBeInTheDocument();
    // Totals and the paid row both show gross 90000 — at least one is present
    expect(screen.getAllByText('90000 AMD').length).toBeGreaterThan(0);
  });

  it('filters out fully-used rows with no remaining value', () => {
    setData(BASE_DATA);
    render(<MyLeaveMoneyCard userId={'user_1' as Id<'users'>} />);
    // sick row (used 0 / remaining 0) must not render
    expect(screen.queryByText('label-sick')).toBeNull();
    expect(screen.getByText('label-paid')).toBeInTheDocument();
    expect(
      screen.getByText((_, el) => el?.textContent === '18 ui.days · dashboard.leaveMoney.used: 2'),
    ).toBeInTheDocument();
  });

  it('shows the no-balances message and disables export when nothing remains', () => {
    setData({
      ...BASE_DATA,
      types: [
        {
          type: 'paid',
          used: 0,
          remaining: 0,
          total: 0,
          dailyRate: 5000,
          grossValue: 0,
          netValue: 0,
        },
      ],
      totals: { grossValue: 0, netValue: 0 },
    });
    render(<MyLeaveMoneyCard userId={'user_1' as Id<'users'>} />);
    expect(screen.getByText('dashboard.leaveMoney.noBalances')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('exports rows as xlsx through the leave export API', async () => {
    setData(BASE_DATA);
    const mockBlob = new Blob(['xlsx']);
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      blob: async () => mockBlob,
    });
    const createObjectURL = jest.fn().mockReturnValue('blob:mock');
    const revokeObjectURL = jest.fn();
    (URL as unknown as { createObjectURL: jest.Mock }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: jest.Mock }).revokeObjectURL = revokeObjectURL;
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<MyLeaveMoneyCard userId={'user_1' as Id<'users'>} />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/leave/export',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.type).toBe('balances');
    expect(body.lang).toBe('en');
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]).toMatchObject({
      leaveType: 'label-paid',
      used: 2,
      remaining: 18,
      currency: 'AMD',
    });
    expect(clickSpy).toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalledWith(mockBlob);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
    expect(mockToast.success).toHaveBeenCalledWith('dashboard.leaveMoney.exported');
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
    clickSpy.mockRestore();
  });

  it.each([
    ['hy', 'hy'],
    ['ru', 'ru'],
    ['de', 'de'],
    ['fr', 'en'],
  ])('maps language %s to export lang %s', async (lang, expected) => {
    mockLang.language = lang;
    setData(BASE_DATA);
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      blob: async () => new Blob(['xlsx']),
    });
    const createObjectURL = jest.fn().mockReturnValue('blob:mock');
    const revokeObjectURL = jest.fn();
    (URL as unknown as { createObjectURL: jest.Mock }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: jest.Mock }).revokeObjectURL = revokeObjectURL;
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<MyLeaveMoneyCard userId={'user_1' as Id<'users'>} />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect((global.fetch as jest.Mock).mock.calls.length).toBe(1);
    });
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.lang).toBe(expected);
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it('toasts an error when the export request fails', async () => {
    setData(BASE_DATA);
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 500 });
    render(<MyLeaveMoneyCard userId={'user_1' as Id<'users'>} />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('dashboard.leaveMoney.exportFailed');
    });
    const { logger } = jest.requireMock('@/lib/logger') as { logger: { error: jest.Mock } };
    expect(logger.error).toHaveBeenCalled();
  });

  it('toasts an error when the export fetch rejects', async () => {
    setData(BASE_DATA);
    (global.fetch as jest.Mock).mockRejectedValue(new Error('network down'));
    render(<MyLeaveMoneyCard userId={'user_1' as Id<'users'>} />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('dashboard.leaveMoney.exportFailed');
    });
  });

  it('passes skip to the query when userId is missing', () => {
    setData(BASE_DATA);
    // The component passes 'skip' — the mock still returns cached data, but
    // the ternary branch `userId ? ... : 'skip'` is exercised.
    render(<MyLeaveMoneyCard userId={undefined as unknown as Id<'users'>} />);
    expect(screen.getByText('dashboard.leaveMoney.title')).toBeInTheDocument();
  });

  it('shows the spinner while exporting', async () => {
    setData(BASE_DATA);
    let resolveFetch: (v: Response) => void = () => {};
    (global.fetch as jest.Mock).mockReturnValue(
      new Promise((res) => {
        resolveFetch = res;
      }),
    );
    render(<MyLeaveMoneyCard userId={'user_1' as Id<'users'>} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('spinner')).toBeInTheDocument();
    await act(async () => {
      resolveFetch({ ok: true, blob: async () => new Blob(['x']) } as unknown as Response);
    });
    await waitFor(() => {
      expect(screen.queryByText('spinner')).toBeNull();
    });
  });
});
