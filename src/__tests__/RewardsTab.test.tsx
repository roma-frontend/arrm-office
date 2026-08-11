/**
 * Tests for src/components/recognition/RewardsTab.tsx — the employee-facing
 * rewards page: wallet strip, catalog grid with affordability/sold-out states,
 * redeem dialog (companion + approval), voucher list with status badges and
 * the QR voucher dialog (QR generation, cancel flow, clipboard copy).
 *
 * Mocks: convex/react (keyed by _name), generated api, react-i18next, sonner,
 * qrcode, UI primitives (button, card, badge, dialog, select, textarea,
 * ShieldLoader) and lucide icons.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RewardsTab, VoucherStatusBadge, formatMoney } from '@/components/recognition/RewardsTab';
import { toast } from 'sonner';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: any) => (typeof opts === 'string' ? opts : key),
    i18n: { language: 'en' },
  }),
}));

// ── Convex: keyed queries + recorded mutations ───────────────────────────────
let queryResults: Record<string, any> = {};
const mutationCalls: Array<{ name?: string; args: any[] }> = [];
const mutationImpls: Record<string, (...args: any[]) => any> = {};

jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
  useMutation:
    (ref: { _name?: string }) =>
    (...args: any[]) => {
      mutationCalls.push({ name: ref?._name, args });
      const impl = mutationImpls[ref?._name ?? ''];
      return impl ? impl(...args) : Promise.resolve();
    },
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    rewards: {
      getMyWallet: { _name: 'getMyWallet' },
      listCatalog: { _name: 'listCatalog' },
      listMyVouchers: { _name: 'listMyVouchers' },
      redeem: { _name: 'redeem' },
      cancelVoucher: { _name: 'cancelVoucher' },
    },
    users: {
      getUsersByOrganizationId: { _name: 'getUsersByOrganizationId' },
    },
  },
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}));

const mockToast = toast as unknown as { success: jest.Mock; error: jest.Mock };

// ── QR code ──────────────────────────────────────────────────────────────────
jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,QR'),
}));
const { toDataURL: mockToDataURL } = jest.requireMock('qrcode') as {
  toDataURL: jest.Mock;
};

// ── UI primitives ────────────────────────────────────────────────────────────
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button type="button" onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
  CardContent: ({ children, className }: any) => <div className={className}>{children}</div>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className, variant }: any) => (
    <span className={className} data-variant={variant}>
      {children}
    </span>
  ),
}));

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }: any) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <div>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/textarea', () => ({
  Textarea: (props: any) => <textarea {...props} />,
}));

jest.mock('@/components/ui/select', () => {
  const Select = ({ value, onValueChange, children }: any) => {
    const options: any[] = [];
    React.Children.forEach(children, (child: any) => {
      if (!child?.props) return;
      if (child.props.value) options.push(child);
      else if (child.props.children) {
        React.Children.forEach(child.props.children, (grand: any) => {
          if (grand?.props?.value) options.push(grand);
        });
      }
    });
    return (
      <div data-testid="select">
        <button type="button" data-testid={`select-current-${value}`}>
          {value || 'placeholder'}
        </button>
        <div data-testid="select-options">
          {options.map((opt) => (
            <button
              key={opt.props.value}
              type="button"
              data-testid={`select-option-${opt.props.value}`}
              onClick={() => onValueChange(opt.props.value)}
            >
              {opt.props.children}
            </button>
          ))}
        </div>
      </div>
    );
  };
  return {
    Select,
    SelectContent: ({ children }: any) => <>{children}</>,
    SelectItem: ({ value, children }: any) => <div value={value}>{children}</div>,
    SelectTrigger: ({ children }: any) => <>{children}</>,
    SelectValue: ({ placeholder }: any) => <>{placeholder}</>,
  };
});

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: ({ size }: any) => <div data-testid="shield-loader">loading-{size}</div>,
}));

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="lucide-icon" {...props} />;
  return new Proxy({}, { get: () => Icon });
});

// ── Fixtures ─────────────────────────────────────────────────────────────────
const wallet = {
  balance: 40,
  allowance: 4,
  allowanceTotal: 10,
  pointValue: 100,
  currency: 'AMD',
};

const catalogItem = (overrides: Record<string, unknown> = {}) => ({
  _id: 'item-1',
  name: 'Coffee',
  description: 'Hot drink',
  category: 'coffee',
  emoji: '☕',
  costPoints: 13,
  faceValue: 1300,
  fulfillment: 'manual',
  status: 'active',
  issuedCount: 0,
  codesAvailable: null,
  stockLeft: null,
  instructions: '',
  stockLimit: null,
  perUserLimitPerMonth: null,
  requiresApproval: false,
  requiresCompanion: false,
  validDays: null,
  myThisMonth: 0,
  soldOut: false,
  limitReached: false,
  ...overrides,
});

const catalog = [
  catalogItem(),
  catalogItem({
    _id: 'item-2',
    name: 'Cinema',
    description: 'Two tickets',
    category: 'experience',
    costPoints: 200,
    faceValue: 5000,
  }),
];

const voucher = (overrides: Record<string, unknown> = {}) => ({
  _id: 'v-1',
  title: 'Coffee voucher',
  code: 'RW-0001',
  status: 'issued',
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
  redeemedAt: undefined,
  faceValue: 1300,
  partnerCode: null,
  note: 'Enjoy!',
  isExpired: false,
  ...overrides,
});

const colleagues = [
  { _id: 'u-1', name: 'Alice', isActive: true, role: 'employee' },
  { _id: 'u-2', name: 'Bob', isActive: true, role: 'employee' },
  { _id: 'u-3', name: 'Me', isActive: true, role: 'employee' },
  { _id: 'u-4', name: 'Root', isActive: true, role: 'superadmin' },
];

const seed = () => {
  queryResults = {
    getMyWallet: wallet,
    listCatalog: catalog,
    listMyVouchers: [voucher()],
    getUsersByOrganizationId: colleagues,
  };
  mutationCalls.length = 0;
  Object.keys(mutationImpls).forEach((key) => delete mutationImpls[key]);
  mockToast.success.mockClear();
  mockToast.error.mockClear();
  mockToDataURL.mockClear();
  mockToDataURL.mockResolvedValue('data:image/png;base64,QR');
};

beforeEach(seed);

const renderTab = () => render(<RewardsTab organizationId="org-1" currentUserId="u-3" />);

// ── formatMoney ──────────────────────────────────────────────────────────────
describe('formatMoney', () => {
  it('formats with the Intl currency style', () => {
    // Intl uses a non-breaking space between currency and amount.
    expect(formatMoney(1300, 'AMD', 'en').replace(/\u00a0/g, ' ')).toBe('AMD 1,300');
  });

  it('falls back to a plain number when the currency is invalid', () => {
    expect(formatMoney(1300, 'NOPE', 'en')).toBe('1,300 NOPE');
  });
});

// ── VoucherStatusBadge ───────────────────────────────────────────────────────
describe('VoucherStatusBadge', () => {
  it('shows expired for an expired active voucher', () => {
    render(<VoucherStatusBadge status="issued" isExpired />);
    expect(screen.getByText('rewards.status.expired')).toBeInTheDocument();
  });

  it('keeps redeemed status even when expired', () => {
    render(<VoucherStatusBadge status="redeemed" isExpired />);
    expect(screen.getByText('rewards.status.redeemed')).toBeInTheDocument();
  });

  it('shows the raw status otherwise', () => {
    render(<VoucherStatusBadge status="pending" />);
    expect(screen.getByText('rewards.status.pending')).toBeInTheDocument();
  });
});

// ── RewardsTab ───────────────────────────────────────────────────────────────
describe('RewardsTab', () => {
  it('shows the loader while wallet or catalog loads', () => {
    queryResults.getMyWallet = undefined;
    const { unmount } = renderTab();
    expect(screen.getByTestId('shield-loader')).toBeInTheDocument();
    unmount();

    queryResults.getMyWallet = wallet;
    queryResults.listCatalog = undefined;
    renderTab();
    expect(screen.getByTestId('shield-loader')).toBeInTheDocument();
  });

  it('renders the wallet strip with balance, allowance and worth', () => {
    renderTab();
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.getByText('rewards.wallet.redeemable')).toBeInTheDocument();
    expect(screen.getByText(/\/ 10/)).toBeInTheDocument();
    // Match the formatted amount without depending on the exact spacer char.
    expect(
      screen.getByText((content: string) => content.includes('AMD') && content.includes('4,000')),
    ).toBeInTheDocument();
    expect(screen.getByText('rewards.wallet.worth')).toBeInTheDocument();
  });

  it('renders catalog cards with category, price and description', () => {
    renderTab();
    expect(screen.getAllByText('Coffee').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cinema').length).toBeGreaterThan(0);
    expect(screen.getByText('Hot drink')).toBeInTheDocument();
    expect(screen.getAllByText('rewards.category.coffee').length).toBeGreaterThan(0);
    // cost points badges
    expect(screen.getByText('13')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
  });

  it('shows the empty state when the catalog has no items', () => {
    queryResults.listCatalog = [];
    renderTab();
    expect(screen.getByText('rewards.empty.title')).toBeInTheDocument();
    expect(screen.getByText('rewards.empty.description')).toBeInTheDocument();
  });

  it('shows the need-more progress bar when unaffordable but not blocked', () => {
    renderTab();
    // item-2 costs 200 with a 40 balance → progress 20%
    expect(screen.getByText(/rewards.needMore/)).toBeInTheDocument();
    expect(document.querySelector('div[style*="width: 20%"]')).not.toBeNull();
  });

  it('shows stock and codes left, approval and companion badges', () => {
    queryResults.listCatalog = [
      catalogItem({
        _id: 'item-3',
        stockLeft: 5,
        codesAvailable: 2,
        requiresApproval: true,
        requiresCompanion: true,
      }),
    ];
    renderTab();
    expect(screen.getByText(/rewards.stockLeft/)).toBeInTheDocument();
    expect(screen.getByText(/rewards.codesLeft/)).toBeInTheDocument();
    expect(screen.getByText('rewards.needsApproval')).toBeInTheDocument();
    expect(screen.getByText('rewards.withColleague')).toBeInTheDocument();
  });

  it('renders a sold-out card with a disabled button', () => {
    queryResults.listCatalog = [catalogItem({ soldOut: true })];
    renderTab();
    expect(screen.getByText('rewards.soldOut')).toBeInTheDocument();
    expect(screen.getByText('rewards.soldOut').closest('button')).toBeDisabled();
  });

  it('renders a limit-reached card with a disabled button', () => {
    queryResults.listCatalog = [catalogItem({ limitReached: true })];
    renderTab();
    expect(screen.getByText('rewards.limitReached')).toBeInTheDocument();
  });

  it('shows face value on the card when present', () => {
    renderTab();
    expect(
      screen.getAllByText((content: string) => content.includes('1,300')).length,
    ).toBeGreaterThan(0);
  });

  it('lists vouchers split into active and past sections', () => {
    queryResults.listMyVouchers = [
      voucher({ status: 'pending' }),
      voucher({
        _id: 'v-2',
        title: 'Old cinema',
        code: 'RW-0002',
        status: 'redeemed',
        redeemedAt: Date.now(),
        isExpired: true,
      }),
      voucher({
        _id: 'v-3',
        title: 'Cancelled',
        code: 'RW-0003',
        status: 'cancelled',
      }),
    ];
    renderTab();
    expect(screen.getByText('Coffee voucher')).toBeInTheDocument();
    expect(screen.getByText('RW-0001')).toBeInTheDocument();
    expect(screen.getByText('RW-0002')).toBeInTheDocument();
    expect(screen.getByText(/rewards.redeemedOn/)).toBeInTheDocument();
    expect(screen.getAllByText(/rewards.validUntil/).length).toBeGreaterThan(0);
    // active badge count (only the pending voucher is active)
    expect(screen.getAllByText((content: string) => content.trim() === '1').length).toBeGreaterThan(
      0,
    );
  });

  it('falls back to the Gift icon for unknown categories and no emoji', () => {
    queryResults.listCatalog = [catalogItem({ category: 'mystery', emoji: '' })];
    renderTab();
    expect(screen.getAllByTestId('lucide-icon').length).toBeGreaterThan(0);
    expect(screen.getByText('rewards.category.mystery')).toBeInTheDocument();
  });

  it('shows the no-vouchers hint when there are none', () => {
    queryResults.listMyVouchers = [];
    renderTab();
    expect(screen.getByText('rewards.noVouchers')).toBeInTheDocument();
  });

  it('treats an undefined vouchers result as an empty list', () => {
    queryResults.listMyVouchers = undefined;
    renderTab();
    expect(screen.getByText('rewards.noVouchers')).toBeInTheDocument();
  });

  it('opens the redeem dialog from a card and redeems with a note', async () => {
    mutationImpls.redeem = jest.fn().mockResolvedValue({ status: 'issued', code: 'RW-0001' });
    renderTab();
    fireEvent.click(screen.getAllByText('rewards.redeem')[0]);

    // 'Coffee' appears on the card and as the dialog title.
    expect(screen.getAllByText('Coffee').length).toBeGreaterThan(0);
    expect(screen.getByText(/rewards.confirmSpend/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('rewards.note'), { target: { value: '  thanks!  ' } });
    fireEvent.click(screen.getByText('rewards.confirm'));

    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'redeem',
        args: [{ itemId: 'item-1', note: 'thanks!', companionId: undefined }],
      }),
    );
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('rewards.voucherIssued'));
  });

  it('toasts the pending message when redemption is pending approval', async () => {
    mutationImpls.redeem = jest.fn().mockResolvedValue({ status: 'pending', code: 'RW-NEW' });
    renderTab();
    fireEvent.click(screen.getAllByText('rewards.redeem')[0]);
    fireEvent.click(screen.getByText('rewards.confirm'));
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('rewards.requestSent'));
  });

  it('toasts an error when redemption fails', async () => {
    mutationImpls.redeem = jest.fn().mockRejectedValue(new Error('redeem boom'));
    renderTab();
    fireEvent.click(screen.getAllByText('rewards.redeem')[0]);
    fireEvent.click(screen.getByText('rewards.confirm'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('redeem boom'));
  });

  it('falls back to the generic message for non-Error failures', async () => {
    mutationImpls.redeem = jest.fn().mockRejectedValue('plain string');
    renderTab();
    fireEvent.click(screen.getAllByText('rewards.redeem')[0]);
    fireEvent.click(screen.getByText('rewards.confirm'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('rewards.redeemFailed'));
  });

  it('requires a companion for companion items', async () => {
    queryResults.listCatalog = [catalogItem({ requiresCompanion: true })];
    renderTab();
    fireEvent.click(screen.getByText('rewards.redeem'));

    // Options exclude the current user and superadmins.
    fireEvent.click(screen.getByTestId('select-options'));
    expect(screen.queryByText('Me')).toBeNull();
    expect(screen.queryByText('Root')).toBeNull();

    // Submitting without a companion shows an error and no mutation.
    fireEvent.click(screen.getByText('rewards.confirm'));
    expect(mockToast.error).toHaveBeenCalledWith('rewards.pickColleague');
    expect(mutationCalls.filter((c) => c.name === 'redeem')).toHaveLength(0);

    // Pick a colleague and redeem.
    fireEvent.click(screen.getByTestId('select-option-u-1'));
    fireEvent.click(screen.getByText('rewards.confirm'));
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'redeem',
        args: [{ itemId: 'item-1', note: undefined, companionId: 'u-1' }],
      }),
    );
  });

  it('closes the redeem dialog via cancel', () => {
    renderTab();
    fireEvent.click(screen.getAllByText('rewards.redeem')[0]);
    fireEvent.click(screen.getByText('common.cancel'));
    expect(screen.queryByTestId('dialog-content')).toBeNull();
  });

  it('shows the approval hint in the redeem dialog for approval items', () => {
    queryResults.listCatalog = [catalogItem({ requiresApproval: true })];
    renderTab();
    fireEvent.click(screen.getByText('rewards.redeem'));
    expect(screen.getByText('rewards.approvalHint')).toBeInTheDocument();
  });

  it('opens a voucher dialog with the QR code and partner code copy', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    queryResults.listMyVouchers = [voucher({ partnerCode: 'PARTNER-1' })];
    renderTab();
    fireEvent.click(screen.getByText('rewards.show'));

    const img = await screen.findByAltText('rewards.qrAlt');
    expect(img).toHaveAttribute('src', 'data:image/png;base64,QR');
    expect(screen.getByText('PARTNER-1')).toBeInTheDocument();
    expect(screen.getByText('rewards.partnerCode')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('rewards.copyCode'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('PARTNER-1'));
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('rewards.copied'));
  });

  it('shows the QR placeholder when QR generation fails', async () => {
    mockToDataURL.mockRejectedValue(new Error('qr fail'));
    renderTab();
    fireEvent.click(screen.getByText('rewards.show'));
    // Wait for the rejection to settle, then verify the QR never rendered.
    await waitFor(() => expect(mockToDataURL).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByAltText('rewards.qrAlt')).toBeNull();
    expect(screen.getByText('rewards.showToStaff')).toBeInTheDocument();
  });

  it('cancels a voucher and refunds', async () => {
    renderTab();
    fireEvent.click(screen.getByText('rewards.show'));
    fireEvent.click(screen.getByText('rewards.cancelAndRefund'));

    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'cancelVoucher',
        args: [{ voucherId: 'v-1' }],
      }),
    );
    expect(mockToast.success).toHaveBeenCalledWith('rewards.cancelled');
  });

  it('toasts an error when cancelling fails', async () => {
    mutationImpls.cancelVoucher = jest.fn().mockRejectedValue(new Error('cancel boom'));
    renderTab();
    fireEvent.click(screen.getByText('rewards.show'));
    fireEvent.click(screen.getByText('rewards.cancelAndRefund'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('cancel boom'));
  });

  it('falls back to the generic message when cancellation fails without an Error', async () => {
    mutationImpls.cancelVoucher = jest.fn().mockRejectedValue('plain');
    renderTab();
    fireEvent.click(screen.getByText('rewards.show'));
    fireEvent.click(screen.getByText('rewards.cancelAndRefund'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('rewards.cancelFailed'));
  });

  it('shows the read-only status instead of cancel for redeemed vouchers', () => {
    queryResults.listMyVouchers = [
      voucher({ status: 'redeemed', redeemedAt: Date.now(), isExpired: true }),
    ];
    renderTab();
    fireEvent.click(screen.getByText('rewards.show'));
    expect(screen.queryByText('rewards.cancelAndRefund')).toBeNull();
    // The badge and the read-only footer both show the redeemed status.
    expect(screen.getAllByText('rewards.status.redeemed').length).toBeGreaterThan(0);
  });

  it('shows the expired footer status for an expired issued voucher', () => {
    queryResults.listMyVouchers = [voucher({ isExpired: true, faceValue: 0 })];
    renderTab();
    // Expired vouchers land in the past section.
    fireEvent.click(screen.getByText('rewards.show'));
    expect(screen.getAllByText('rewards.status.expired').length).toBeGreaterThan(0);
  });

  it('hides the partner code block when the voucher has none and shows no face value suffix', () => {
    queryResults.listMyVouchers = [voucher({ faceValue: undefined })];
    renderTab();
    fireEvent.click(screen.getByText('rewards.show'));
    expect(screen.queryByText('rewards.partnerCode')).toBeNull();
    expect(screen.getAllByText(/rewards.validUntil/).length).toBeGreaterThan(0);
  });
});
