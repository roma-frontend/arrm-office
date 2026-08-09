import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RewardsAdminPanel } from '@/components/recognition/RewardsAdminPanel';
import { toast } from 'sonner';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: any) => (typeof opts === 'string' ? opts : key),
    i18n: { language: 'en' },
  }),
}));

const queryResults: Record<string, any> = {};
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
      getSummary: { _name: 'getSummary' },
      listCatalog: { _name: 'listCatalog' },
      createItem: { _name: 'createItem' },
      setItemStatus: { _name: 'setItemStatus' },
      removeItem: { _name: 'removeItem' },
      updateItem: { _name: 'updateItem' },
      listCodes: { _name: 'listCodes' },
      uploadCodes: { _name: 'uploadCodes' },
      voidCode: { _name: 'voidCode' },
      updateSettings: { _name: 'updateSettings' },
      findVoucherByCode: { _name: 'findVoucherByCode' },
      markRedeemed: { _name: 'markRedeemed' },
      listVouchers: { _name: 'listVouchers' },
      approveVoucher: { _name: 'approveVoucher' },
      cancelVoucher: { _name: 'cancelVoucher' },
    },
  },
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const mockToast = toast as unknown as { success: jest.Mock; error: jest.Mock };

jest.mock('@/components/ui/button', () => ({
  Button: (props: any) => (
    <button type={props.type || 'button'} {...props}>
      {props.children}
    </button>
  ),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
  CardContent: ({ children, className }: any) => <div className={className}>{children}</div>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className }: any) => <span className={className}>{children}</span>,
}));

jest.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

jest.mock('@/components/ui/textarea', () => ({
  Textarea: (props: any) => <textarea {...props} />,
}));

jest.mock('@/components/ui/label', () => ({
  Label: (props: any) => <label {...props} />,
}));

jest.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, onCheckedChange, id }: any) => (
    <input
      type="checkbox"
      id={id}
      checked={checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
    />
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

jest.mock('@/components/ui/select', () => {
  const Select = ({ value, onValueChange, children, disabled }: any) => {
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
      <div data-testid="select" data-disabled={!!disabled}>
        <button type="button" data-testid={`select-current-${value}`}>
          {value}
        </button>
        <div data-testid="select-options">
          {options.map((opt) => (
            <button
              key={opt.props.value}
              type="button"
              data-testid={`select-option-${opt.props.value}`}
              onClick={() => onValueChange(opt.props.value)}
            >
              {opt.props.value}
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
    SelectValue: () => null,
  };
});

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: ({ size }: any) => <div data-testid="shield-loader">loading-{size}</div>,
}));

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return new Proxy({}, { get: () => Icon });
});

const baseSettings = {
  currency: 'AMD',
  pointValue: 1,
  monthlyAllowance: 100,
  kudosCost: 10,
  receiverReward: 5,
  attendanceReward: 3,
  reviewReward: 2,
  maxKudosPerColleaguePerMonth: 20,
  voucherValidDays: 30,
  monthlyBudgetCap: 30000,
};

const summary = {
  monthSpend: 12000,
  monthlyBudgetCap: 30000,
  outstandingValue: 5000,
  outstandingPoints: 10,
  counts: { pending: 1, issued: 2, redeemed: 3, expired: 0, cancelled: 1 },
  settings: baseSettings,
};

const catalog = [
  {
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
    instructions: '',
    stockLimit: null,
    perUserLimitPerMonth: null,
    requiresApproval: false,
    requiresCompanion: false,
    validDays: null,
  },
  {
    _id: 'item-2',
    name: 'Cinema',
    description: 'Two tickets',
    category: 'experience',
    emoji: '🎬',
    costPoints: 50,
    faceValue: 5000,
    fulfillment: 'code_pool',
    status: 'archived',
    issuedCount: 0,
    codesAvailable: 0,
    instructions: '',
    stockLimit: null,
    perUserLimitPerMonth: null,
    requiresApproval: false,
    requiresCompanion: false,
    validDays: null,
  },
  {
    _id: 'item-3',
    name: 'Merch',
    description: '',
    category: 'merch',
    emoji: '',
    costPoints: 30,
    faceValue: undefined,
    fulfillment: 'manual',
    status: 'active',
    issuedCount: 5,
    codesAvailable: null,
    instructions: '',
    stockLimit: null,
    perUserLimitPerMonth: null,
    requiresApproval: false,
    requiresCompanion: false,
    validDays: null,
  },
];

const codes = [
  { _id: 'code-1', code: 'AAA-111', status: 'available' },
  { _id: 'code-2', code: 'BBB-222', status: 'assigned' },
];

const issuedVoucher = {
  _id: 'v-1',
  title: 'Cinema ticket',
  recipient: { name: 'Alice' },
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
  status: 'issued',
  isExpired: false,
  instructions: 'Bring your ID',
  note: 'Enjoy!',
  code: 'RW-0001',
  faceValue: 5000,
};

const vouchers = [
  issuedVoucher,
  {
    _id: 'v-2',
    title: 'Coffee',
    recipient: null,
    expiresAt: new Date(Date.now() + 86400000 * 2).toISOString(),
    status: 'pending',
    isExpired: false,
    instructions: '',
    note: '',
    code: 'RW-0002',
    faceValue: 1300,
  },
  {
    _id: 'v-3',
    title: 'Old merch',
    recipient: { name: 'Bob' },
    expiresAt: new Date(Date.now() - 86400000).toISOString(),
    status: 'redeemed',
    isExpired: true,
    instructions: '',
    note: '',
    code: 'RW-0003',
    faceValue: undefined,
  },
];

const seed = () => {
  queryResults.getSummary = summary;
  queryResults.listCatalog = catalog;
  queryResults.listCodes = codes;
  queryResults.findVoucherByCode = undefined;
  queryResults.listVouchers = vouchers;
  mutationCalls.length = 0;
  Object.keys(mutationImpls).forEach((key) => delete mutationImpls[key]);
  mockToast.success.mockClear();
  mockToast.error.mockClear();
};

const renderPanel = () => render(<RewardsAdminPanel organizationId="org-1" as any />);

beforeEach(seed);

describe('RewardsAdminPanel', () => {
  it('shows the loader while the catalog loads', () => {
    queryResults.listCatalog = undefined;
    renderPanel();
    expect(screen.getByTestId('shield-loader')).toBeInTheDocument();
  });

  it('shows the loader while the summary loads', () => {
    queryResults.getSummary = undefined;
    renderPanel();
    expect(screen.getByTestId('shield-loader')).toBeInTheDocument();
  });

  it('shows the no-access message when the summary is null', () => {
    queryResults.getSummary = null;
    renderPanel();
    expect(screen.getByText('rewards.admin.noAccess')).toBeInTheDocument();
  });

  it('renders budget, outstanding and voucher stats', () => {
    renderPanel();
    expect(screen.getByText('rewards.admin.monthSpend')).toBeInTheDocument();
    expect(screen.getAllByText(/12,000/).length).toBeGreaterThan(0);
    expect(screen.getByText('rewards.admin.outstanding')).toBeInTheDocument();
    expect(screen.getAllByText(/5,000/).length).toBeGreaterThan(0);
    expect(screen.getByText('rewards.admin.vouchers')).toBeInTheDocument();
    expect(screen.getByText('rewards.status.pending: 1')).toBeInTheDocument();
    expect(screen.getByText('rewards.status.issued: 2')).toBeInTheDocument();
    expect(screen.getByText('rewards.status.redeemed: 3')).toBeInTheDocument();
    expect(screen.getByText('rewards.status.cancelled: 1')).toBeInTheDocument();
  });

  it('renders the budget bar at the right width', () => {
    renderPanel();
    expect(document.querySelector('div[style*="width: 40%"]')).not.toBeNull();
  });

  it('renders a destructive budget bar above 85% usage', () => {
    queryResults.getSummary = { ...summary, monthSpend: 29000 };
    renderPanel();
    expect(document.querySelector('.bg-destructive')).not.toBeNull();
  });

  it('omits the budget bar when no cap is set', () => {
    queryResults.getSummary = { ...summary, monthlyBudgetCap: undefined };
    renderPanel();
    expect(document.querySelector('div[style*="width:"]')).toBeNull();
  });

  it('opens the create-item dialog', () => {
    renderPanel();
    fireEvent.click(screen.getByText('rewards.admin.newItem'));
    expect(screen.getAllByText('rewards.admin.newItem').length).toBe(2);
    expect(screen.getByLabelText('rewards.admin.name')).toBeInTheDocument();
  });

  it('opens the economy settings dialog', () => {
    renderPanel();
    fireEvent.click(screen.getByText('rewards.admin.economy'));
    expect(screen.getAllByText('rewards.admin.economy').length).toBe(2);
    expect(screen.getByLabelText('rewards.admin.currency')).toHaveValue('AMD');
  });

  it('seeds the starter catalog when empty', async () => {
    queryResults.listCatalog = [];
    renderPanel();
    expect(screen.getByText('rewards.admin.emptyTitle')).toBeInTheDocument();
    expect(screen.getByText('rewards.admin.emptyDescription')).toBeInTheDocument();
    fireEvent.click(screen.getByText('rewards.admin.addStarter'));
    await waitFor(() =>
      expect(mockToast.success).toHaveBeenCalledWith('rewards.admin.starterAdded'),
    );
    const creates = mutationCalls.filter((call) => call.name === 'createItem');
    expect(creates).toHaveLength(6);
    expect(creates[0].args[0]).toEqual(
      expect.objectContaining({
        organizationId: 'org-1',
        name: 'rewards.starter.coffee.name',
        category: 'coffee',
        emoji: '☕',
        costPoints: 13,
        faceValue: 1300,
        fulfillment: 'manual',
      }),
    );
    expect(creates[4].args[0]).toEqual(
      expect.objectContaining({
        name: 'rewards.starter.earlyFriday.name',
        category: 'time_off',
        requiresApproval: true,
        perUserLimitPerMonth: 1,
        faceValue: 0,
      }),
    );
    expect(creates[5].args[0]).toEqual(
      expect.objectContaining({
        name: 'rewards.starter.dinnerForTwo.name',
        category: 'meal',
        requiresApproval: true,
        requiresCompanion: true,
        faceValue: 16500,
      }),
    );
  });

  it('disables the starter button while seeding', () => {
    queryResults.listCatalog = [];
    mutationImpls.createItem = jest.fn(() => new Promise(() => {}));
    renderPanel();
    fireEvent.click(screen.getByText('rewards.admin.addStarter'));
    expect(screen.getByText('common.sending')).toBeInTheDocument();
    expect(screen.queryByText('rewards.admin.addStarter')).not.toBeInTheDocument();
  });

  it('toasts an error when seeding fails', async () => {
    queryResults.listCatalog = [];
    mutationImpls.createItem = jest.fn().mockRejectedValue('seed boom');
    renderPanel();
    fireEvent.click(screen.getByText('rewards.admin.addStarter'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('rewards.admin.saveFailed'));
  });

  it('falls back to the Gift icon for unknown categories', () => {
    queryResults.listCatalog = [{ ...catalog[2], category: 'mystery' }];
    renderPanel();
    expect(screen.getAllByTestId('icon').length).toBeGreaterThan(0);
  });

  it('renders catalog rows with badges, prices and counts', () => {
    renderPanel();
    expect(screen.getAllByText('Coffee').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cinema').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Merch').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1,300/).length).toBeGreaterThan(0);
    expect(screen.getByText('rewards.admin.archived')).toBeInTheDocument();
    expect(screen.getByText('rewards.admin.poolEmpty')).toBeInTheDocument();
    expect(
      screen.getAllByText((content) => content.includes('rewards.codesLeft')).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText((content) => content.includes('rewards.admin.issuedCount')).length,
    ).toBe(3);
  });

  it('opens the edit dialog prefilled and disables the fulfillment select', () => {
    renderPanel();
    fireEvent.click(screen.getAllByLabelText('common.edit')[0]);
    expect(screen.getByText('rewards.admin.editItem')).toBeInTheDocument();
    expect(screen.getByLabelText('rewards.admin.name')).toHaveValue('Coffee');
    const selects = screen.getAllByTestId('select');
    expect(selects[2]).toHaveAttribute('data-disabled', 'true');
  });

  it('archives an active item and restores an archived one', async () => {
    renderPanel();
    fireEvent.click(screen.getAllByLabelText('rewards.admin.archive')[0]);
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'setItemStatus',
        args: [{ itemId: 'item-1', status: 'archived' }],
      }),
    );
    expect(screen.getAllByLabelText('rewards.admin.restore').length).toBe(1);
    fireEvent.click(screen.getByLabelText('rewards.admin.restore'));
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'setItemStatus',
        args: [{ itemId: 'item-2', status: 'active' }],
      }),
    );
  });

  it('toasts an error when archiving fails', async () => {
    mutationImpls.setItemStatus = jest.fn().mockRejectedValue('arch fail');
    renderPanel();
    fireEvent.click(screen.getAllByLabelText('rewards.admin.archive')[0]);
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('rewards.admin.saveFailed'));
  });

  it('deletes items without issued vouchers and hides delete for issued ones', async () => {
    renderPanel();
    expect(screen.getAllByLabelText('common.delete').length).toBe(2);
    fireEvent.click(screen.getAllByLabelText('common.delete')[0]);
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({ name: 'removeItem', args: [{ itemId: 'item-1' }] }),
    );
    expect(mockToast.success).toHaveBeenCalledWith('rewards.admin.deleted');
  });

  it('toasts an error when deletion fails', async () => {
    mutationImpls.removeItem = jest.fn().mockRejectedValue('del fail');
    renderPanel();
    fireEvent.click(screen.getAllByLabelText('common.delete')[0]);
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('rewards.admin.saveFailed'));
  });

  it('opens the code pool dialog and uploads deduplicated codes', async () => {
    mutationImpls.uploadCodes = jest.fn().mockResolvedValue({ added: 2, skipped: 1 });
    renderPanel();
    fireEvent.click(screen.getByLabelText('rewards.admin.codes'));
    expect(screen.getAllByText('Cinema').length).toBeGreaterThan(0);
    expect(screen.getByText('rewards.admin.codesAvailable')).toBeInTheDocument();
    expect(screen.getByText('rewards.admin.codesAssigned')).toBeInTheDocument();

    const upload = screen.getByText('rewards.admin.upload').closest('button')!;
    expect(upload).toBeDisabled();

    fireEvent.change(screen.getByLabelText('rewards.admin.pasteCodes'), {
      target: { value: 'CODE1, CODE1; code2' },
    });
    expect(upload).not.toBeDisabled();
    fireEvent.click(upload);

    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'uploadCodes',
        args: [{ itemId: 'item-2', codes: ['CODE1', 'code2'], note: undefined }],
      }),
    );
    expect(mockToast.success).toHaveBeenCalledWith('rewards.admin.codesUploaded');
  });

  it('sends the batch note with uploaded codes', async () => {
    mutationImpls.uploadCodes = jest.fn().mockResolvedValue({ added: 1, skipped: 0 });
    renderPanel();
    fireEvent.click(screen.getByLabelText('rewards.admin.codes'));
    fireEvent.change(screen.getByLabelText('rewards.admin.pasteCodes'), {
      target: { value: 'X1' },
    });
    fireEvent.change(screen.getByLabelText('rewards.admin.batchNote'), {
      target: { value: 'batch 3' },
    });
    fireEvent.click(screen.getByText('rewards.admin.upload'));
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'uploadCodes',
        args: [{ itemId: 'item-2', codes: ['X1'], note: 'batch 3' }],
      }),
    );
  });

  it('toasts an error when code upload fails', async () => {
    mutationImpls.uploadCodes = jest.fn().mockRejectedValue('up fail');
    renderPanel();
    fireEvent.click(screen.getByLabelText('rewards.admin.codes'));
    fireEvent.change(screen.getByLabelText('rewards.admin.pasteCodes'), {
      target: { value: 'X1' },
    });
    fireEvent.click(screen.getByText('rewards.admin.upload'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('rewards.admin.saveFailed'));
  });

  it('voids an available code', async () => {
    renderPanel();
    fireEvent.click(screen.getByLabelText('rewards.admin.codes'));
    fireEvent.click(screen.getByLabelText('rewards.admin.voidCode'));
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({ name: 'voidCode', args: [{ codeId: 'code-1' }] }),
    );
  });

  it('toasts an error when voiding fails', async () => {
    mutationImpls.voidCode = jest.fn().mockRejectedValue('void fail');
    renderPanel();
    fireEvent.click(screen.getByLabelText('rewards.admin.codes'));
    fireEvent.click(screen.getByLabelText('rewards.admin.voidCode'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('rewards.admin.saveFailed'));
  });

  it('renders the code pool dialog with no codes loaded yet', () => {
    queryResults.listCodes = undefined;
    renderPanel();
    fireEvent.click(screen.getByLabelText('rewards.admin.codes'));
    expect(screen.getByText('rewards.admin.codesAvailable')).toBeInTheDocument();
    expect(screen.getByText('rewards.admin.codesAssigned')).toBeInTheDocument();
    expect(screen.queryByText('AAA-111')).not.toBeInTheDocument();
  });

  it('closes the code pool dialog', () => {
    renderPanel();
    fireEvent.click(screen.getByLabelText('rewards.admin.codes'));
    fireEvent.click(screen.getByText('common.close'));
    expect(screen.queryByText('rewards.admin.pasteCodes')).not.toBeInTheDocument();
  });

  it('creates an item from the dialog with every field', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('rewards.admin.newItem'));
    fireEvent.change(screen.getByLabelText('rewards.admin.name'), { target: { value: 'Pizza' } });
    fireEvent.change(screen.getByLabelText('rewards.admin.emoji'), { target: { value: '🍕' } });
    fireEvent.change(screen.getByLabelText('rewards.admin.description'), {
      target: { value: 'Slice' },
    });
    fireEvent.change(screen.getByLabelText('rewards.admin.costPoints'), {
      target: { value: '20' },
    });
    fireEvent.change(screen.getByLabelText('rewards.admin.faceValue'), {
      target: { value: '2000' },
    });
    fireEvent.change(screen.getByLabelText('rewards.admin.instructions'), {
      target: { value: 'Pickup' },
    });
    fireEvent.change(screen.getByLabelText('rewards.admin.stockLimit'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('rewards.admin.perUserLimit'), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText('rewards.admin.validDays'), { target: { value: '7' } });
    fireEvent.click(screen.getByTestId('select-option-meal'));
    fireEvent.click(screen.getByTestId('select-option-code_pool'));
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getAllByRole('checkbox')[1]);

    fireEvent.click(screen.getByText('common.save'));
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'createItem',
        args: [
          expect.objectContaining({
            organizationId: 'org-1',
            name: 'Pizza',
            emoji: '🍕',
            description: 'Slice',
            category: 'meal',
            fulfillment: 'code_pool',
            costPoints: 20,
            faceValue: 2000,
            instructions: 'Pickup',
            stockLimit: 5,
            perUserLimitPerMonth: 2,
            requiresApproval: true,
            requiresCompanion: true,
            validDays: 7,
          }),
        ],
      }),
    );
    expect(mockToast.success).toHaveBeenCalledWith('rewards.admin.saved');
  });

  it('disables save until a name is entered', () => {
    renderPanel();
    fireEvent.click(screen.getByText('rewards.admin.newItem'));
    expect(screen.getByText('common.save').closest('button')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('rewards.admin.name'), { target: { value: 'Pizza' } });
    expect(screen.getByText('common.save').closest('button')).not.toBeDisabled();
  });

  it('toasts an error when creating fails', async () => {
    mutationImpls.createItem = jest.fn().mockRejectedValue('create fail');
    renderPanel();
    fireEvent.click(screen.getByText('rewards.admin.newItem'));
    fireEvent.change(screen.getByLabelText('rewards.admin.name'), { target: { value: 'Pizza' } });
    fireEvent.click(screen.getByText('common.save'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('rewards.admin.saveFailed'));
  });

  it('falls back to 1 cost point when cleared on create', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('rewards.admin.newItem'));
    fireEvent.change(screen.getByLabelText('rewards.admin.name'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('rewards.admin.costPoints'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByText('common.save'));
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'createItem',
        args: [expect.objectContaining({ costPoints: 1 })],
      }),
    );
  });

  it('falls back to the existing cost points when cleared on edit', async () => {
    renderPanel();
    fireEvent.click(screen.getAllByLabelText('common.edit')[0]);
    fireEvent.change(screen.getByLabelText('rewards.admin.costPoints'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByText('common.save'));
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'updateItem',
        args: [expect.objectContaining({ costPoints: 13 })],
      }),
    );
  });

  it('updates an existing item preserving its fulfillment', async () => {
    renderPanel();
    fireEvent.click(screen.getAllByLabelText('common.edit')[0]);
    fireEvent.change(screen.getByLabelText('rewards.admin.costPoints'), {
      target: { value: '25' },
    });
    fireEvent.click(screen.getByText('common.save'));
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'updateItem',
        args: [
          expect.objectContaining({
            itemId: 'item-1',
            name: 'Coffee',
            category: 'coffee',
            costPoints: 25,
            faceValue: 1300,
            instructions: '',
            stockLimit: null,
            perUserLimitPerMonth: null,
            requiresApproval: false,
            requiresCompanion: false,
            validDays: null,
          }),
        ],
      }),
    );
  });

  it('cancels the create dialog', () => {
    renderPanel();
    fireEvent.click(screen.getByText('rewards.admin.newItem'));
    fireEvent.click(screen.getByText('common.cancel'));
    expect(screen.queryByLabelText('rewards.admin.name')).not.toBeInTheDocument();
  });

  it('saves economy settings with parsed numbers and null budget cap', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('rewards.admin.economy'));
    expect(screen.getByLabelText('rewards.admin.pointValue')).toHaveValue('1');
    expect(screen.getByText('rewards.admin.forecast')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('rewards.admin.pointValue'), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText('rewards.admin.budgetCap'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByText('common.save'));
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'updateSettings',
        args: [
          expect.objectContaining({
            organizationId: 'org-1',
            currency: 'AMD',
            pointValue: 2,
            monthlyAllowance: 100,
            kudosCost: 10,
            receiverReward: 5,
            attendanceReward: 3,
            reviewReward: 2,
            maxKudosPerColleaguePerMonth: 20,
            voucherValidDays: 30,
            monthlyBudgetCap: null,
          }),
        ],
      }),
    );
    expect(mockToast.success).toHaveBeenCalledWith('rewards.admin.saved');
  });

  it('keeps an explicit budget cap value', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('rewards.admin.economy'));
    fireEvent.change(screen.getByLabelText('rewards.admin.budgetCap'), {
      target: { value: '45000' },
    });
    fireEvent.click(screen.getByText('common.save'));
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'updateSettings',
        args: [expect.objectContaining({ monthlyBudgetCap: 45000 })],
      }),
    );
  });

  it('toasts an error when settings save fails', async () => {
    mutationImpls.updateSettings = jest.fn().mockRejectedValue('set fail');
    renderPanel();
    fireEvent.click(screen.getByText('rewards.admin.economy'));
    fireEvent.click(screen.getByText('common.save'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('rewards.admin.saveFailed'));
  });

  it('shows not-found for an unknown redemption code', () => {
    queryResults.findVoucherByCode = null;
    renderPanel();
    fireEvent.change(screen.getByLabelText('rewards.admin.voucherCode'), {
      target: { value: 'rw-9999' },
    });
    fireEvent.click(screen.getByText('rewards.admin.find'));
    expect(screen.getByText('rewards.admin.notFound')).toBeInTheDocument();
  });

  it('finds a voucher and marks it redeemed', async () => {
    queryResults.findVoucherByCode = issuedVoucher;
    renderPanel();
    fireEvent.change(screen.getByLabelText('rewards.admin.voucherCode'), {
      target: { value: '  rw-0001  ' },
    });
    fireEvent.click(screen.getByText('rewards.admin.find'));
    expect(screen.getAllByText('Cinema ticket').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Alice/).length).toBeGreaterThan(0);
    expect(screen.getByText('Bring your ID')).toBeInTheDocument();
    expect(screen.getByText(/Enjoy!/)).toBeInTheDocument();

    const redeem = screen.getByText('rewards.admin.markRedeemed').closest('button')!;
    expect(redeem).not.toBeDisabled();
    fireEvent.click(redeem);
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'markRedeemed',
        args: [{ voucherId: 'v-1' }],
      }),
    );
    expect(mockToast.success).toHaveBeenCalledWith('rewards.admin.markedRedeemed');
  });

  it('disables redemption for expired vouchers', () => {
    queryResults.findVoucherByCode = { ...issuedVoucher, isExpired: true };
    renderPanel();
    fireEvent.change(screen.getByLabelText('rewards.admin.voucherCode'), {
      target: { value: 'RW-0001' },
    });
    fireEvent.click(screen.getByText('rewards.admin.find'));
    expect(screen.getByText('rewards.admin.markRedeemed').closest('button')).toBeDisabled();
  });

  it('toasts an error when redemption fails', async () => {
    queryResults.findVoucherByCode = issuedVoucher;
    mutationImpls.markRedeemed = jest.fn().mockRejectedValue('redeem fail');
    renderPanel();
    fireEvent.change(screen.getByLabelText('rewards.admin.voucherCode'), {
      target: { value: 'RW-0001' },
    });
    fireEvent.click(screen.getByText('rewards.admin.find'));
    fireEvent.click(screen.getByText('rewards.admin.markRedeemed'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('rewards.admin.saveFailed'));
  });

  it('renders the voucher registry with filters', () => {
    renderPanel();
    expect(screen.getByText('rewards.admin.registry')).toBeInTheDocument();
    expect(screen.getByText('Cinema ticket')).toBeInTheDocument();
    expect(screen.getByText('RW-0001')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('select-option-pending'));
    fireEvent.change(screen.getByPlaceholderText('rewards.admin.searchPlaceholder'), {
      target: { value: 'coffee' },
    });
  });

  it('shows the loader and empty state for vouchers', () => {
    queryResults.listVouchers = undefined;
    const { rerender } = render(<RewardsAdminPanel organizationId="org-1" as any />);
    expect(screen.getAllByTestId('shield-loader').length).toBeGreaterThan(0);
    queryResults.listVouchers = [];
    rerender(<RewardsAdminPanel organizationId="org-1" as any />);
    expect(screen.getByText('rewards.admin.noVouchers')).toBeInTheDocument();
  });

  it('approves a pending voucher', async () => {
    renderPanel();
    fireEvent.click(screen.getByLabelText('rewards.admin.approve'));
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'approveVoucher',
        args: [{ voucherId: 'v-2' }],
      }),
    );
    expect(mockToast.success).toHaveBeenCalledWith('rewards.admin.approved');
  });

  it('toasts an error when approving fails', async () => {
    mutationImpls.approveVoucher = jest.fn().mockRejectedValue('appr fail');
    renderPanel();
    fireEvent.click(screen.getByLabelText('rewards.admin.approve'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('rewards.admin.saveFailed'));
  });

  it('cancels an issued voucher and hides actions for redeemed ones', async () => {
    renderPanel();
    expect(screen.getAllByLabelText('rewards.admin.cancel').length).toBe(2);
    fireEvent.click(screen.getAllByLabelText('rewards.admin.cancel')[0]);
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'cancelVoucher',
        args: [{ voucherId: 'v-1' }],
      }),
    );
    expect(mockToast.success).toHaveBeenCalledWith('rewards.admin.cancelledRefunded');
  });

  it('toasts an error when cancelling fails', async () => {
    mutationImpls.cancelVoucher = jest.fn().mockRejectedValue('cancel fail');
    renderPanel();
    fireEvent.click(screen.getAllByLabelText('rewards.admin.cancel')[0]);
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('rewards.admin.saveFailed'));
  });
});
