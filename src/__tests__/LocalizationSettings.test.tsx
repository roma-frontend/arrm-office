/**
 * Tests for LocalizationSettings (the "Regional" settings tab).
 *
 * Regression coverage for the real-time behavior:
 *  - values come from the reactive `settings.getUserSettings` query (the
 *    source of truth), not from the session user — so saved settings survive
 *    reloads and external changes appear live;
 *  - the date/time preview follows the selected format instead of the locale
 *    default;
 *  - saving mirrors the values into the auth store.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ── i18n mock ────────────────────────────────────────────────────────────────
const mockChangeLanguage = jest.fn().mockResolvedValue(undefined);
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | { defaultValue?: string }) => {
      if (typeof fallback === 'string') return fallback;
      if (fallback && typeof fallback === 'object' && 'defaultValue' in fallback) {
        return fallback.defaultValue ?? key;
      }
      return key;
    },
    i18n: { language: 'en', changeLanguage: mockChangeLanguage },
  }),
}));

// ── Convex mock ──────────────────────────────────────────────────────────────
let queryResults: Record<string, unknown> = {};
const mockUpdateSettings = jest.fn().mockResolvedValue({ success: true });

jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
  useMutation: () => mockUpdateSettings,
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    settings: {
      getUserSettings: { _name: 'getUserSettings' },
      updateLocalizationSettings: { _name: 'updateLocalizationSettings' },
    },
  },
}));

jest.mock('@/lib/logger', () => ({
  logger: { log: jest.fn(), error: jest.fn() },
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

// ── UI mocks ─────────────────────────────────────────────────────────────────
jest.mock('lucide-react', () => {
  const MockIcon = (props: any) => <span data-testid="lucide-icon" {...props} />;
  return new Proxy(
    {},
    {
      get: () => MockIcon,
    },
  );
});

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <div data-testid="shield-loader" />,
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
  CardDescription: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/label', () => ({
  Label: ({ children, htmlFor }: any) => (
    <label htmlFor={htmlFor} data-testid="label">
      {children}
    </label>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled }: any) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

// Radix Select → native <select>, one per field in render order.
jest.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: any) => (
    <select
      value={value}
      onChange={(e) => onValueChange?.(e.target.value)}
      data-testid="radix-select"
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: any) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
}));

// ── Module under test ──
import { LocalizationSettings } from '@/components/settings/LocalizationSettings';
import { useAuthStore } from '@/store/useAuthStore';

const SAVED = {
  language: 'ru',
  timezone: 'Europe/Moscow',
  dateFormat: 'DD.MM.YYYY',
  timeFormat: '24h',
  firstDayOfWeek: 'sunday',
};

function renderTab(overrides: Record<string, unknown> = {}) {
  return render(
    <LocalizationSettings
      userId="user-1"
      user={null}
      onSettingsChange={jest.fn()}
      {...overrides}
    />,
  );
}

function selects(): HTMLSelectElement[] {
  return Array.from(document.querySelectorAll<HTMLSelectElement>('[data-testid="radix-select"]'));
}

describe('LocalizationSettings (Regional tab)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryResults = {};
    mockUpdateSettings.mockResolvedValue({ success: true });
    useAuthStore.getState().logout();
  });

  it('renders defaults while no saved settings are loaded yet', () => {
    queryResults.getUserSettings = undefined;
    renderTab();
    const values = selects().map((s) => s.value);
    expect(values).toEqual(['en', 'UTC', 'DD/MM/YYYY', '24h', 'monday']);
  });

  it('renders the saved settings from the reactive query, not session defaults', () => {
    queryResults.getUserSettings = SAVED;
    renderTab();
    const values = selects().map((s) => s.value);
    expect(values).toEqual(['ru', 'Europe/Moscow', 'DD.MM.YYYY', '24h', 'sunday']);
  });

  it('date preview follows the selected date format', () => {
    queryResults.getUserSettings = { ...SAVED, dateFormat: 'YYYY-MM-DD' };
    renderTab();
    expect(screen.getByText(/Preview: \d{4}-\d{2}-\d{2}/)).toBeInTheDocument();
  });

  it('time preview follows the selected time format', () => {
    queryResults.getUserSettings = { ...SAVED, timeFormat: '12h' };
    renderTab();
    expect(screen.getByText(/Preview: .*\d{1,2}:\d{2}( AM| PM)/i)).toBeInTheDocument();
  });

  it('saving mirrors the values into the auth store', async () => {
    queryResults.getUserSettings = undefined;
    const storeUser = {
      id: 'user-1',
      name: 'Test',
      email: 't@x.test',
      role: 'employee' as const,
    };

    const { container } = renderTab({ user: storeUser });
    fireEvent.change(selects()[0], { target: { value: 'ru' } });
    fireEvent.change(selects()[1], { target: { value: 'Europe/Moscow' } });
    fireEvent.click(container.querySelector('button')!);

    await waitFor(() => {
      expect(useAuthStore.getState().user?.language).toBe('ru');
      expect(useAuthStore.getState().user?.timezone).toBe('Europe/Moscow');
    });
    expect(mockUpdateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'ru', timezone: 'Europe/Moscow' }),
    );
  });
});
