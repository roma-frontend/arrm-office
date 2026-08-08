/**
 * Tests for Wizard — multi-step form shell with stepper, progress bar,
 * validation-gated navigation, draft persistence wiring (mocked hook), submit,
 * cancel and start-over flows.
 *
 * Mocks: react-i18next, cssMotion, lucide, Button, WizardDraftNotice,
 * useWizardDraft (controllable), and simple step content.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: { language: 'en' },
  }),
}));

jest.mock('@/lib/cssMotion', () => {
  const ReactMod = require('react');
  const Elem =
    (tag: string) =>
    ({ children, ...props }: any) => (
      <div data-testid={`motion-${tag}`} {...props}>
        {children}
      </div>
    );
  return {
    motion: { div: Elem('div') },
    AnimatePresence: ({ children }: any) => <ReactMod.Fragment>{children}</ReactMod.Fragment>,
  };
});

jest.mock('lucide-react', () => {
  const icons = ['ChevronLeft', 'ChevronRight', 'CheckCircle'];
  const mocks: Record<string, any> = {};
  for (const name of icons) {
    mocks[name] = (props: any) => <span data-testid={`icon-${name}`} {...props} />;
  }
  return mocks;
});

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button type="button" onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

// Controllable draft hook mock.
let mockDraft: {
  restored: boolean;
  restoredStep: number;
  clearDraft: jest.Mock;
};
jest.mock('@/hooks/useWizardDraft', () => ({
  useWizardDraft: (opts: any) => {
    if (mockDraft.restored) {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      React.useEffect(() => {
        // the Wizard passes handleRestoreDraft as onRestore — call it so the
        // real restore logic runs against our controllable draft state
        opts.onRestore?.({ draft: 'restored' }, mockDraft.restoredStep);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
    }
    return {
      restored: mockDraft.restored,
      restoredStep: mockDraft.restoredStep,
      clearDraft: mockDraft.clearDraft,
      dismissNotice: jest.fn(),
    };
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

import { Wizard, useWizardContext } from '@/components/ui/wizard';

function DummyInput({ field, label }: { field: string; label: string }) {
  const { stepData, updateStepData } = useWizardContext();
  return (
    <label>
      {label}
      <input
        value={(stepData[field] as string) ?? ''}
        onChange={(e) => updateStepData(field, e.target.value)}
      />
    </label>
  );
}

const STEPS = [
  {
    id: 's1',
    title: 'Step one',
    description: 'First step',
    content: <DummyInput field="a" label="A" />,
  },
  {
    id: 's2',
    title: 'Step two',
    content: <DummyInput field="b" label="B" />,
    validation: (data: any) => !!data.b,
  },
  { id: 's3', title: 'Step three', content: <DummyInput field="c" label="C" /> },
];

describe('Wizard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDraft = {
      restored: false,
      restoredStep: 0,
      clearDraft: jest.fn(),
    };
  });

  it('renders the first step, title and stepper', () => {
    render(<Wizard steps={STEPS} />);
    // step titles and descriptions appear both in the stepper and the content
    expect(screen.getByRole('heading', { name: 'Step one' })).toBeInTheDocument();
    expect(screen.getAllByText('First step').length).toBeGreaterThan(0);
    expect(screen.getByText('A')).toBeInTheDocument();
    // stepper circles: 1, 2, 3
    expect(screen.getAllByText('2')[0]).toBeInTheDocument();
  });

  it('navigates next and back', () => {
    render(<Wizard steps={STEPS} />);
    const next = () => screen.getByText('Next');
    fireEvent.click(next());

    expect(screen.getByRole('heading', { name: 'Step two' })).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByRole('heading', { name: 'Step one' })).toBeInTheDocument();
  });

  it('keeps the next button disabled while a step validation fails', () => {
    render(<Wizard steps={STEPS} />);
    fireEvent.click(screen.getByText('Next')); // to step two
    const nextBtn = screen.getByText('Next').closest('button') as HTMLButtonElement;
    expect(nextBtn.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('B'), { target: { value: 'x' } });
    expect((screen.getByText('Next').closest('button') as HTMLButtonElement).disabled).toBe(false);
  });

  it('submits the accumulated data on the last step', async () => {
    const onComplete = jest.fn().mockResolvedValue(undefined);
    render(<Wizard steps={STEPS} onComplete={onComplete} submitLabel="Finish" />);

    fireEvent.change(screen.getByLabelText('A'), { target: { value: '1' } });
    fireEvent.click(screen.getByText('Next'));
    fireEvent.change(screen.getByLabelText('B'), { target: { value: '2' } });
    fireEvent.click(screen.getByText('Next'));
    fireEvent.change(screen.getByLabelText('C'), { target: { value: '3' } });

    fireEvent.click(screen.getByText('Finish'));

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith({ a: '1', b: '2', c: '3' }));
    expect(mockDraft.clearDraft).toHaveBeenCalled();
  });

  it('shows Processing while submitting', async () => {
    let resolve!: (v: unknown) => void;
    const onComplete = jest.fn(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    render(<Wizard steps={STEPS} onComplete={onComplete} />);
    fireEvent.click(screen.getByText('Next'));
    fireEvent.change(screen.getByLabelText('B'), { target: { value: 'x' } });
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Submit'));

    expect(screen.getByText('Processing...')).toBeInTheDocument();
    await act(async () => {
      resolve(undefined);
    });
    expect(screen.queryByText('Processing...')).not.toBeInTheDocument();
  });

  it('cancels and clears the draft', () => {
    const onCancel = jest.fn();
    render(<Wizard steps={STEPS} onCancel={onCancel} cancelLabel="Abort" />);
    fireEvent.click(screen.getByText('Abort'));
    expect(onCancel).toHaveBeenCalled();
    expect(mockDraft.clearDraft).toHaveBeenCalled();
  });

  it('hides the stepper when showStepper is false', () => {
    render(<Wizard steps={STEPS} showStepper={false} />);
    expect(screen.queryByText('2')).not.toBeInTheDocument();
  });

  it('restores a draft and resets from the notice', async () => {
    mockDraft = {
      restored: true,
      restoredStep: 2,
      clearDraft: jest.fn(),
    };
    render(<Wizard steps={STEPS} />);

    const notice = screen.getByTestId('draft-notice');
    expect(notice).toHaveAttribute('data-step', '2');
    // restore jumps to the saved step after the hook's restore effect fires
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Step three' })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByText('Start over'));
    expect(mockDraft.clearDraft).toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Step one' })).toBeInTheDocument();
  });

  it('syncs step data when defaultStepData changes', () => {
    const { rerender } = render(<Wizard steps={STEPS} defaultStepData={{ a: '1' }} />);
    expect((screen.getByLabelText('A') as HTMLInputElement).value).toBe('1');

    rerender(<Wizard steps={STEPS} defaultStepData={{ a: '9' }} />);
    expect((screen.getByLabelText('A') as HTMLInputElement).value).toBe('9');
  });

  it('does not render a cancel button without onCancel', () => {
    render(<Wizard steps={STEPS} />);
    expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
  });
});
