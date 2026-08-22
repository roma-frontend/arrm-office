/**
 * Tests for ShareViewMenu — the Share popover on the task board.
 *
 * The popover itself is a thin Radix wrapper (excluded from coverage), so it is
 * mocked to render its content inline; what matters here is that each action
 * produces the right artefact, that a clipboard refusal is reported instead of
 * flashing a false "Copied", and that the summary tells the truth about what a
 * recipient will land on.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ── i18n mock: resolves the inline default and interpolates {{vars}} ─────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, second?: unknown) => {
      let template = key;
      let vars: Record<string, unknown> = {};
      if (typeof second === 'string') template = second;
      else if (second && typeof second === 'object') {
        vars = second as Record<string, unknown>;
        template = (vars.defaultValue as string) ?? key;
      }
      return template.replace(/\{\{(\w+)\}\}/g, (_m, name) => String(vars[name] ?? ''));
    },
    i18n: { language: 'en' },
  }),
}));

// ── Thin UI wrappers ────────────────────────────────────────────────────────
jest.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: any) => <div data-testid="popover">{children}</div>,
  PopoverTrigger: ({ children }: any) => <div data-testid="popover-trigger">{children}</div>,
  PopoverContent: ({ children }: any) => <div data-testid="popover-content">{children}</div>,
}));

jest.mock('lucide-react', () => {
  const MockIcon = (props: any) => <span data-testid="lucide-icon" {...props} />;
  return new Proxy({}, { get: () => MockIcon });
});

const toastSuccess = jest.fn();
const toastError = jest.fn();
jest.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }));

const copyText = jest.fn<(text: string) => Promise<boolean>>();
const downloadTextFile = jest.fn();
jest.mock('@/lib/copyText', () => ({
  copyText: (text: string) => copyText(text),
  downloadTextFile: (...args: unknown[]) => downloadTextFile(...args),
}));

import { ShareViewMenu, type ShareViewMenuProps } from '@/components/tasks/ShareViewMenu';

const LINK = 'https://hr.example.com/tasks?view=kanban&status=review';

function renderMenu(overrides: Partial<ShareViewMenuProps> = {}) {
  const props: ShareViewMenuProps = {
    link: LINK,
    taskCount: 7,
    activeFilterLabels: ['Status: In progress'],
    buildMarkdown: jest.fn(() => '# My tasks'),
    buildCsv: jest.fn(() => 'a,b'),
    fileStem: 'my-tasks-2026-08-22',
    shareTitle: 'My tasks',
    ...overrides,
  };
  render(<ShareViewMenu {...props} />);
  return props;
}

describe('ShareViewMenu', () => {
  beforeEach(() => {
    copyText.mockReset();
    copyText.mockResolvedValue(true);
    downloadTextFile.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  });

  it('shows the link in a readonly field', () => {
    renderMenu();
    const input = screen.getByLabelText('View link') as HTMLInputElement;
    expect(input.value).toBe(LINK);
    expect(input.readOnly).toBe(true);
  });

  it('states how many tasks the link covers and which filters are on', () => {
    renderMenu();
    expect(screen.getByText('7 tasks')).toBeTruthy();
    expect(screen.getByText('Status: In progress')).toBeTruthy();
  });

  it('says the link is the whole board when nothing is filtered', () => {
    renderMenu({ activeFilterLabels: [] });
    expect(screen.getByText('No filters — the whole board')).toBeTruthy();
    expect(screen.queryByText('Status: In progress')).toBeNull();
  });

  it('copies the link and confirms it', async () => {
    renderMenu();
    fireEvent.click(screen.getByText('Copy'));
    await waitFor(() => expect(copyText).toHaveBeenCalledWith(LINK));
    await waitFor(() => expect(screen.getByText('Copied')).toBeTruthy());
    expect(toastSuccess).toHaveBeenCalledWith('View link copied');
  });

  it('reports a clipboard refusal instead of flashing "Copied"', async () => {
    copyText.mockResolvedValue(false);
    renderMenu();
    fireEvent.click(screen.getByText('Copy'));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(screen.queryByText('Copied')).toBeNull();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('builds the Markdown only when that action is used', async () => {
    const props = renderMenu();
    expect(props.buildMarkdown).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Copy as Markdown checklist'));
    await waitFor(() => expect(copyText).toHaveBeenCalledWith('# My tasks'));
    expect(toastSuccess).toHaveBeenCalledWith('Checklist copied as Markdown');
  });

  it('downloads the CSV under the dated file stem', () => {
    const props = renderMenu();
    expect(props.buildCsv).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Download CSV'));
    expect(downloadTextFile).toHaveBeenCalledWith(
      'my-tasks-2026-08-22.csv',
      'a,b',
      'text/csv;charset=utf-8',
    );
    expect(toastSuccess).toHaveBeenCalledWith('CSV downloaded');
  });

  it('hides the native share action when the device has no share sheet', () => {
    renderMenu();
    expect(screen.queryByText('Share via…')).toBeNull();
  });

  it('offers the native share sheet where it exists', async () => {
    const share = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    renderMenu();
    const action = await waitFor(() => screen.getByText('Share via…'));
    fireEvent.click(action);
    expect(share).toHaveBeenCalledWith({ title: 'My tasks', url: LINK });
  });

  it('stays quiet when the share sheet is dismissed', async () => {
    Object.defineProperty(navigator, 'share', {
      value: jest.fn<() => Promise<void>>().mockRejectedValue(new Error('AbortError')),
      configurable: true,
    });
    renderMenu();
    fireEvent.click(await waitFor(() => screen.getByText('Share via…')));
    await waitFor(() => expect(toastError).not.toHaveBeenCalled());
  });

  it('opens the view in a new tab without leaking the opener', () => {
    const open = jest.fn();
    Object.defineProperty(window, 'open', { value: open, configurable: true });
    renderMenu();
    fireEvent.click(screen.getByText('Open in a new tab'));
    expect(open).toHaveBeenCalledWith(LINK, '_blank', 'noopener,noreferrer');
  });

  it('spells out that a link cannot widen what the recipient may see', () => {
    renderMenu();
    expect(
      screen.getByText('Recipients still only see the tasks their own access allows.'),
    ).toBeTruthy();
  });
});
