/**
 * Tests for ServiceBroadcastDialog — the superadmin 4-step broadcast wizard
 * (audience → message → schedule → review) with optional maintenance mode.
 *
 * Mocks: react-i18next, convex/react (org query + sendBroadcast / enableMaintenance
 * mutations), api refs, Dialog (controllable through onOpenChange), CustomSelect
 * (native select), Button/Input/Textarea passthrough, ShieldLoader, cssMotion
 * passthrough, lucide proxy.
 *
 * Unreachable-through-UI defensive branches left uncovered (94.28% lines):
 *  - handleSend guards for "empty title/content" (142-144) and "maintenance
 *    without a date" (148-150) — canProceed disables Next until those fields are
 *    filled, so handleSend can never see them empty.
 *  - the `default: return true` in canProceed (116) and `default: return null`
 *    in renderStep (623) — TS exhaustiveness defaults for the closed StepId union.
 *  - the maintenance-specific success banner text is also dead: setStatus('success')
 *    and setScheduleMaintenance(false) flush in the same React 18 batch, so the
 *    banner always renders sentSuccessfully.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

/* ── Mutable test doubles (read lazily by mock factories — import component at the bottom) ── */

let queryResult: any = undefined;
const queryCalls: { name?: string; args: unknown }[] = [];
const sendBroadcast = jest.fn(async () => {});
const enableMaintenanceMode = jest.fn(async () => {});
const onOpenChange = jest.fn();

const ORGS = [
  { _id: 'org_1', name: 'Acme', activeEmployees: 12 },
  { _id: 'org_2', name: 'Globex', memberCount: 34 },
];

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: string | { defaultValue?: string; count?: number }) => {
      if (typeof opts === 'string') return opts;
      if (opts?.defaultValue) return opts.defaultValue;
      if (typeof opts?.count === 'number') {
        // The component passes { count } to t(), but the keys it uses here
        // contain no {{count}} placeholder, so the org option labels render
        // without the number — the counts are asserted via the org-info block.
        return key.replace('{{count}}', String(opts.count));
      }
      return key;
    },
    i18n: { language: 'en' },
  }),
}));

jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }, args: unknown) => {
    queryCalls.push({ name: ref?._name, args });
    return ref?._name === 'getAllOrganizations' ? queryResult : undefined;
  },
  useMutation: (ref: { _name?: string }) => {
    if (ref?._name === 'sendServiceBroadcast') return sendBroadcast;
    if (ref?._name === 'enableMaintenanceMode') return enableMaintenanceMode;
    return jest.fn(async () => {});
  },
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    organizations: { getAllOrganizations: { _name: 'getAllOrganizations' } },
    admin: {
      sendServiceBroadcast: { _name: 'sendServiceBroadcast' },
      enableMaintenanceMode: { _name: 'enableMaintenanceMode' },
    },
  },
}));

jest.mock('@/components/ui/sheet', () => ({
  Sheet: ({ open, children, onOpenChange: onClose }: any) =>
    open ? (
      <div data-testid="dialog">
        <button type="button" data-testid="dialog-close" onClick={() => onClose(false)}>
          close
        </button>
        {children}
      </div>
    ) : null,
  SheetContent: ({ children, className }: any) => (
    <div data-testid="dialog-content" className={className}>
      {children}
    </div>
  ),
  SheetTitle: ({ children }: any) => <h2 data-testid="dialog-title">{children}</h2>,
  SheetHeader: ({ children }: any) => <div>{children}</div>,
  SheetBody: ({ children }: any) => <div>{children}</div>,
  SheetFooter: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/CustomSelect', () => ({
  CustomSelect: ({ value, onChange, options }: any) => (
    <select data-testid="custom-select" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o: any) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

jest.mock('@/components/ui/textarea', () => ({
  Textarea: (props: any) => <textarea {...props} />,
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <div data-testid="shield-loader" />,
}));

jest.mock('@/lib/cssMotion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

jest.mock('lucide-react', () => {
  const Icon = ({ className, style }: any) => (
    <span data-testid="lucide-icon" className={className} style={style} />
  );
  return new Proxy({}, { get: () => Icon });
});

// ── Draft (controllable) ─────────────────────────────────────────────────────
let mockDraft: {
  restored: boolean;
  restoredStep: number;
  clearDraft: jest.Mock;
  onRestoreData?: Record<string, unknown>;
};
jest.mock('@/hooks/useWizardDraft', () => ({
  useWizardDraft: (opts: any) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    React.useEffect(() => {
      if (mockDraft.restored) {
        opts.onRestore?.(mockDraft.onRestoreData ?? {}, mockDraft.restoredStep);
      }
    }, []);
    return mockDraft;
  },
}));

jest.mock('@/components/ui/WizardDraftNotice', () => ({
  WizardDraftNotice: ({ show, step, onReset }: any) =>
    show ? (
      <div data-testid="draft-notice" data-step={step}>
        Draft restored at step {step + 1}
        <button type="button" onClick={onReset}>
          Start over
        </button>
      </div>
    ) : null,
}));

function Harness({ initialOpen = true, org = 'org_1', uid = 'user_super' }: any) {
  const [open, setOpen] = React.useState(initialOpen);
  return (
    <ServiceBroadcastDialog open={open} onOpenChange={setOpen} organizationId={org} userId={uid} />
  );
}

function renderDialog(overrides: Record<string, unknown> = {}) {
  return render(
    <ServiceBroadcastDialog
      open
      onOpenChange={onOpenChange}
      organizationId="org_1"
      userId="user_super"
      {...overrides}
    />,
  );
}

const nextBtn = () => screen.getByRole('button', { name: 'broadcastDialog.next' });
const backBtn = () => screen.getByRole('button', { name: 'broadcastDialog.back' });
const sendBtn = () => screen.getByRole('button', { name: 'broadcastDialog.sendToAll' });
const dtInput = () => document.querySelector('input[type="datetime-local"]') as HTMLInputElement;

function clickNext() {
  fireEvent.click(nextBtn());
}

function fillMessage(title = 'Maintenance', content = 'Server down tomorrow') {
  fireEvent.change(screen.getByPlaceholderText('broadcastDialog.titlePlaceholder'), {
    target: { value: title },
  });
  fireEvent.change(screen.getByPlaceholderText('broadcastDialog.messagePlaceholder'), {
    target: { value: content },
  });
}

function goToReview() {
  clickNext(); // audience → message (specific org selected by default)
  fillMessage();
  clickNext(); // message → schedule
  clickNext(); // schedule → review
}

beforeEach(() => {
  queryResult = ORGS;
  queryCalls.length = 0;
  jest.clearAllMocks();
  mockDraft = {
    restored: false,
    restoredStep: 0,
    clearDraft: jest.fn(() => {
      mockDraft.restored = false;
    }),
  };
});

describe('rendering & dialog lifecycle', () => {
  it('renders nothing when closed', () => {
    render(<Harness initialOpen={false} />);
    expect(screen.queryByTestId('dialog')).toBeNull();
  });

  it('renders the title and all four progress steps', () => {
    renderDialog();
    expect(screen.getByTestId('dialog')).toBeTruthy();
    expect(screen.getByText('broadcastDialog.serviceBroadcast')).toBeTruthy();
    for (const label of [
      'broadcastDialog.audience',
      'broadcastDialog.message',
      'broadcastDialog.schedule',
      'broadcastDialog.review',
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('starts on the audience step', () => {
    renderDialog();
    expect(screen.getByText('broadcastDialog.whoGetsMessage')).toBeTruthy();
  });

  it('forwards a close through onOpenChange(false)', () => {
    renderDialog();
    fireEvent.click(screen.getByTestId('dialog-close'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('resets the error state when the dialog is closed', async () => {
    renderDialog();
    sendBroadcast.mockRejectedValueOnce(new Error('boom'));
    goToReview();
    fireEvent.click(sendBtn());
    await waitFor(() => expect(screen.getByText('boom')).toBeTruthy());
    fireEvent.click(screen.getByTestId('dialog-close'));
    expect(screen.queryByText('boom')).toBeNull();
  });
});

describe('audience step', () => {
  it('selects "specific organization" by default and renders the org select', () => {
    renderDialog();
    expect(screen.getByTestId('custom-select')).toBeTruthy();
    expect(screen.getByText(/Acme \(broadcastDialog\.employeeCount/)).toBeTruthy();
    expect(screen.getByText(/Globex \(broadcastDialog\.employeeCount/)).toBeTruthy();
  });

  it('shows the selected org info with its employee count', () => {
    renderDialog();
    expect(screen.getByText(/12\s+broadcastDialog\.activeUsersWillReceive/)).toBeTruthy();
  });

  it('switches the selected organization through the select', () => {
    renderDialog();
    fireEvent.change(screen.getByTestId('custom-select'), { target: { value: 'org_2' } });
    expect(screen.getByText(/34\s+broadcastDialog\.activeUsersWillReceive/)).toBeTruthy();
  });

  it('switching to "all organizations" hides the select and shows the count', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /broadcastDialog\.allOrganizations/ }));
    expect(screen.queryByTestId('custom-select')).toBeNull();
    expect(screen.getByText('broadcastDialog.orgCount')).toBeTruthy();
  });

  it('switching back to "specific organization" re-shows the select', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /broadcastDialog\.allOrganizations/ }));
    fireEvent.click(screen.getByRole('button', { name: /broadcastDialog\.specificOrganization/ }));
    expect(screen.getByTestId('custom-select')).toBeTruthy();
  });

  it('disables Back on the first step', () => {
    renderDialog();
    expect(backBtn()).toBeDisabled();
  });

  it('disables Next on "specific" without a selected org', () => {
    renderDialog({ organizationId: undefined });
    expect(nextBtn()).toBeDisabled();
  });

  it('enables Next after switching to "all" even without a selected org', () => {
    renderDialog({ organizationId: undefined });
    fireEvent.click(screen.getByRole('button', { name: /broadcastDialog\.allOrganizations/ }));
    expect(nextBtn()).toBeEnabled();
  });

  it('does not render the org info when the id matches no organization', () => {
    renderDialog({ organizationId: 'org_zzz' });
    expect(screen.queryByText(/activeUsersWillReceive/)).toBeNull();
  });

  it('skips the query when no userId is provided', () => {
    renderDialog({ userId: undefined });
    const last = queryCalls[queryCalls.length - 1];
    expect(last?.args).toBe('skip');
  });

  it('renders zero counts while organizations are still loading', () => {
    queryResult = undefined;
    renderDialog();
    expect(screen.queryByTestId('custom-select')).toBeNull();
    expect(screen.getByText('broadcastDialog.orgCount')).toBeTruthy();
  });
});

describe('message step', () => {
  it('renders the icon grid, title, content and a zero char count', () => {
    renderDialog();
    clickNext();
    expect(screen.getByText('broadcastDialog.messageContent')).toBeTruthy();
    expect(screen.getByTitle('Information')).toBeTruthy();
    expect(screen.getByTitle('Maintenance')).toBeTruthy();
    expect(screen.getByTitle('Security')).toBeTruthy();
    expect(screen.getByText('0 broadcastDialog.characters')).toBeTruthy();
  });

  it('selects an icon and reflects it on the review summary', () => {
    renderDialog();
    clickNext();
    fireEvent.click(screen.getByTitle('Maintenance'));
    fillMessage();
    clickNext();
    clickNext();
    expect(screen.getByText('🔧')).toBeTruthy();
  });

  it('disables Next until both title and content are filled', () => {
    renderDialog();
    clickNext();
    expect(nextBtn()).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('broadcastDialog.titlePlaceholder'), {
      target: { value: 'Maintenance' },
    });
    expect(nextBtn()).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('broadcastDialog.titlePlaceholder'), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByPlaceholderText('broadcastDialog.messagePlaceholder'), {
      target: { value: 'Down' },
    });
    expect(nextBtn()).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('broadcastDialog.titlePlaceholder'), {
      target: { value: 'Maintenance' },
    });
    expect(nextBtn()).toBeEnabled();
  });

  it('updates the char count as the content changes', () => {
    renderDialog();
    clickNext();
    fireEvent.change(screen.getByPlaceholderText('broadcastDialog.messagePlaceholder'), {
      target: { value: 'hello' },
    });
    expect(screen.getByText('5 broadcastDialog.characters')).toBeTruthy();
  });
});

describe('schedule step', () => {
  it('reveals the datetime and duration options when maintenance is toggled on', () => {
    renderDialog();
    clickNext();
    fillMessage();
    clickNext();
    expect(screen.getByText('broadcastDialog.maintenanceSchedule')).toBeTruthy();
    expect(screen.queryByText('broadcastDialog.startTime')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: /broadcastDialog\.scheduleMaintenanceToggle/ }),
    );
    expect(screen.getByText('broadcastDialog.startTime')).toBeTruthy();
    expect(screen.getByText('broadcastDialog.duration30min')).toBeTruthy();
    expect(screen.getByText('broadcastDialog.duration4h')).toBeTruthy();
    expect(screen.getByText('broadcastDialog.durationUnknown')).toBeTruthy();
  });

  it('disables Next on maintenance without a scheduled time', () => {
    renderDialog();
    clickNext();
    fillMessage();
    clickNext();
    fireEvent.click(
      screen.getByRole('button', { name: /broadcastDialog\.scheduleMaintenanceToggle/ }),
    );
    expect(nextBtn()).toBeDisabled();
  });

  it('enables Next once the maintenance time is set and shows the preview', () => {
    renderDialog();
    clickNext();
    fillMessage();
    clickNext();
    fireEvent.click(
      screen.getByRole('button', { name: /broadcastDialog\.scheduleMaintenanceToggle/ }),
    );
    fireEvent.change(dtInput(), { target: { value: '2026-08-10T10:00' } });
    expect(nextBtn()).toBeEnabled();
    expect(screen.getByText(/⏰/)).toBeTruthy();
  });

  it('highlights the selected duration button and resets on "unknown"', () => {
    renderDialog();
    clickNext();
    fillMessage();
    clickNext();
    fireEvent.click(
      screen.getByRole('button', { name: /broadcastDialog\.scheduleMaintenanceToggle/ }),
    );
    const twoHours = screen.getByRole('button', { name: 'broadcastDialog.duration2h' });
    fireEvent.click(twoHours);
    expect(twoHours.className).toContain('border-(--warning-outline)');
    fireEvent.click(screen.getByRole('button', { name: 'broadcastDialog.durationUnknown' }));
    // "unknown" maps to undefined — deselects the highlighted option
    expect(twoHours.className).not.toContain('border-(--warning-outline)');
  });

  it('hides the maintenance fields again when toggled off', () => {
    renderDialog();
    clickNext();
    fillMessage();
    clickNext();
    fireEvent.click(
      screen.getByRole('button', { name: /broadcastDialog\.scheduleMaintenanceToggle/ }),
    );
    expect(screen.getByText('broadcastDialog.startTime')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: /broadcastDialog\.scheduleMaintenanceToggle/ }),
    );
    expect(screen.queryByText('broadcastDialog.startTime')).toBeNull();
    expect(nextBtn()).toBeEnabled();
  });
});

describe('review step', () => {
  it('shows the title, content and specific-org summary', () => {
    renderDialog();
    goToReview();
    expect(screen.getByText('broadcastDialog.checkAndSend')).toBeTruthy();
    expect(screen.getByText('Maintenance')).toBeTruthy();
    expect(screen.getByText('Server down tomorrow')).toBeTruthy();
    expect(screen.getByText(/🏢 Acme/)).toBeTruthy();
  });

  it('shows the all-orgs count in the summary when broadcasting everywhere', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /broadcastDialog\.allOrganizations/ }));
    clickNext();
    fillMessage();
    clickNext();
    clickNext();
    expect(screen.getByText(/📢 broadcastDialog\.allOrganizations \(2\)/)).toBeTruthy();
    expect(screen.getByText('broadcastDialog.allActiveUsersOfAll')).toBeTruthy();
  });

  it('falls back to the generic org label when the org is unknown', () => {
    renderDialog({ organizationId: 'org_zzz' });
    goToReview();
    expect(screen.getByText(/🏢 broadcastDialog\.organization/)).toBeTruthy();
  });

  it('shows the maintenance schedule line on review', () => {
    renderDialog();
    clickNext();
    fillMessage();
    clickNext();
    fireEvent.click(
      screen.getByRole('button', { name: /broadcastDialog\.scheduleMaintenanceToggle/ }),
    );
    fireEvent.change(dtInput(), { target: { value: '2026-08-10T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'broadcastDialog.duration2h' }));
    clickNext();
    expect(screen.getByText(/broadcastDialog\.maintenanceSchedule: .*2 hours/)).toBeTruthy();
  });

  it('replaces Next with the Send button on the review step', () => {
    renderDialog();
    goToReview();
    expect(screen.queryByRole('button', { name: 'broadcastDialog.next' })).toBeNull();
    expect(sendBtn()).toBeTruthy();
  });

  it('walks back through the previous steps', () => {
    renderDialog();
    goToReview();
    fireEvent.click(backBtn());
    expect(screen.getByText('broadcastDialog.maintenanceSchedule')).toBeTruthy();
    fireEvent.click(backBtn());
    expect(screen.getByText('broadcastDialog.messageContent')).toBeTruthy();
    fireEvent.click(backBtn());
    expect(screen.getByText('broadcastDialog.whoGetsMessage')).toBeTruthy();
    expect(backBtn()).toBeDisabled();
  });
});

describe('sending', () => {
  it('sends a broadcast to the specific org with trimmed fields', async () => {
    renderDialog();
    goToReview();
    fireEvent.click(sendBtn());
    await waitFor(() => expect(sendBroadcast).toHaveBeenCalledTimes(1));
    expect(sendBroadcast).toHaveBeenCalledWith({
      organizationId: 'org_1',
      userId: 'user_super',
      title: 'Maintenance',
      content: 'Server down tomorrow',
      icon: '⚠️',
    });
    expect(enableMaintenanceMode).not.toHaveBeenCalled();
  });

  it('sends one broadcast per organization in "all" scope', async () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /broadcastDialog\.allOrganizations/ }));
    clickNext();
    fillMessage();
    clickNext();
    clickNext();
    fireEvent.click(sendBtn());
    await waitFor(() => expect(sendBroadcast).toHaveBeenCalledTimes(2));
    expect(sendBroadcast).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ organizationId: 'org_1' }),
    );
    expect(sendBroadcast).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ organizationId: 'org_2' }),
    );
  });

  it('appends the maintenance text and calls enableMaintenanceMode', async () => {
    renderDialog();
    clickNext();
    fillMessage();
    clickNext();
    fireEvent.click(
      screen.getByRole('button', { name: /broadcastDialog\.scheduleMaintenanceToggle/ }),
    );
    fireEvent.change(dtInput(), { target: { value: '2026-08-10T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'broadcastDialog.duration2h' }));
    clickNext();
    fireEvent.click(screen.getByRole('button', { name: 'broadcastDialog.sendAndSchedule' }));
    await waitFor(() => expect(sendBroadcast).toHaveBeenCalledTimes(1));
    const payload = sendBroadcast.mock.calls[0][0] as {
      content: string;
      icon: string;
      title: string;
    };
    expect(payload.content).toContain('Server down tomorrow');
    expect(payload.content).toContain('broadcastDialog.maintenanceStartsAtContent');
    expect(payload.content).toContain('broadcastDialog.estimatedDurationContent: 2 hours');
    expect(enableMaintenanceMode).toHaveBeenCalledWith({
      organizationId: 'org_1',
      userId: 'user_super',
      title: 'Maintenance',
      message: payload.content,
      startTime: new Date('2026-08-10T10:00').getTime(),
      estimatedDuration: '2 hours',
      icon: payload.icon,
    });
  });

  it('shows the success banner and resets the form fields', async () => {
    renderDialog();
    goToReview();
    fireEvent.click(sendBtn());
    await waitFor(() => expect(screen.getByText('broadcastDialog.sentSuccessfully')).toBeTruthy());
    // close resets the wizard back to the audience step; reopening it shows empty fields
    fireEvent.click(screen.getByTestId('dialog-close'));
    expect(screen.getByText('broadcastDialog.whoGetsMessage')).toBeTruthy();
    clickNext();
    expect(
      (screen.getByPlaceholderText('broadcastDialog.titlePlaceholder') as HTMLInputElement).value,
    ).toBe('');
    expect(screen.getByText('0 broadcastDialog.characters')).toBeTruthy();
  });

  it('shows the success banner (maintenance flag is reset in the same batch, so the generic banner wins)', async () => {
    renderDialog();
    clickNext();
    fillMessage();
    clickNext();
    fireEvent.click(
      screen.getByRole('button', { name: /broadcastDialog\.scheduleMaintenanceToggle/ }),
    );
    fireEvent.change(dtInput(), { target: { value: '2026-08-10T10:00' } });
    clickNext();
    fireEvent.click(screen.getByRole('button', { name: 'broadcastDialog.sendAndSchedule' }));
    await waitFor(() => expect(screen.getByText('broadcastDialog.sentSuccessfully')).toBeTruthy());
  });

  it('enters a loading state while the mutation is in flight', async () => {
    let resolveSend: (value?: unknown) => void = () => {};
    sendBroadcast.mockImplementationOnce(() => new Promise((res) => (resolveSend = res)));
    renderDialog();
    goToReview();
    fireEvent.click(sendBtn());
    expect(screen.getByTestId('shield-loader')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'broadcastDialog.sending' })).toBeDisabled();
    await act(async () => resolveSend(undefined));
    await waitFor(() => expect(screen.getByText('broadcastDialog.sentSuccessfully')).toBeTruthy());
  });

  it('auto-closes and resets the wizard 2.5s after a successful send', async () => {
    jest.useFakeTimers();
    try {
      render(<Harness />);
      goToReview();
      fireEvent.click(sendBtn());
      await waitFor(() => expect(sendBroadcast).toHaveBeenCalledTimes(1));
      act(() => {
        jest.advanceTimersByTime(2500);
      });
      expect(screen.queryByTestId('dialog')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows the mutation error message when it throws an Error', async () => {
    sendBroadcast.mockRejectedValueOnce(new Error('boom'));
    renderDialog();
    goToReview();
    fireEvent.click(sendBtn());
    await waitFor(() => expect(screen.getByText('boom')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'broadcastDialog.sendToAll' })).toBeEnabled();
  });

  it('falls back to the generic error when the mutation rejects with a plain value', async () => {
    sendBroadcast.mockRejectedValueOnce('nope');
    renderDialog();
    goToReview();
    fireEvent.click(sendBtn());
    await waitFor(() => expect(screen.getByText('broadcastDialog.sendError')).toBeTruthy());
  });

  it('blocks the send with userNotLoaded when userId is missing', async () => {
    renderDialog({ userId: undefined, organizationId: 'org_1' });
    goToReview();
    fireEvent.click(sendBtn());
    await waitFor(() => expect(screen.getByText('broadcastDialog.userNotLoaded')).toBeTruthy());
    expect(sendBroadcast).not.toHaveBeenCalled();
  });
});

describe('ServiceBroadcastDialog — wizard draft', () => {
  it('restores a draft on open and shows the notice', async () => {
    mockDraft.restored = true;
    mockDraft.restoredStep = 2;
    mockDraft.onRestoreData = {
      title: 'Restored broadcast',
      content: 'draft text',
      selectedIcon: '⚠️',
      scheduleDateTime: '',
      scheduleMaintenance: false,
      broadcastScope: 'specific',
      selectedOrgId: 'org_1',
    };
    renderDialog();
    await waitFor(() =>
      expect(screen.getByTestId('draft-notice')).toHaveAttribute('data-step', '2'),
    );

    // restored onto the saved step (schedule)
    expect(screen.getByText('broadcastDialog.maintenanceSchedule')).toBeTruthy();
    // back to the message step to see the restored title
    fireEvent.click(backBtn());
    expect(
      (screen.getByPlaceholderText('broadcastDialog.titlePlaceholder') as HTMLInputElement).value,
    ).toBe('Restored broadcast');
  });

  it('start over clears the draft and resets the fields', async () => {
    mockDraft.restored = true;
    mockDraft.restoredStep = 2;
    mockDraft.onRestoreData = {
      title: 'Restored broadcast',
      content: 'draft text',
      selectedIcon: '⚠️',
      scheduleDateTime: '',
      scheduleMaintenance: false,
      broadcastScope: 'specific',
      selectedOrgId: 'org_1',
    };
    renderDialog();
    await waitFor(() => expect(screen.getByTestId('draft-notice')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Start over'));

    expect(mockDraft.clearDraft).toHaveBeenCalled();
    expect(screen.queryByTestId('draft-notice')).toBeNull();
    // back to the audience step with empty fields
    expect(screen.getByText('broadcastDialog.whoGetsMessage')).toBeTruthy();
  });

  it('clears the draft after a successful send', async () => {
    mockDraft.restored = true;
    mockDraft.restoredStep = 0;
    mockDraft.onRestoreData = {
      title: 'Restored broadcast',
      content: 'draft text',
      selectedIcon: '⚠️',
      scheduleDateTime: '',
      scheduleMaintenance: false,
      broadcastScope: 'specific',
      selectedOrgId: 'org_1',
    };
    renderDialog();
    await waitFor(() => expect(sendBroadcast).not.toHaveBeenCalled());
    goToReview();
    fireEvent.click(sendBtn());
    await waitFor(() => expect(screen.getByText('broadcastDialog.sentSuccessfully')).toBeTruthy());

    expect(mockDraft.clearDraft).toHaveBeenCalled();
  });
});

import { ServiceBroadcastDialog } from '@/components/admin/ServiceBroadcastDialog';
