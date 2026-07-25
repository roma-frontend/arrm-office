/**
 * Tests for ThemeSwitcher component.
 *
 * Mocks: useTheme, react-i18next, lucide-react icons, Radix UI, motion, button.
 */

// ── Mock dependencies ────────────────────────────────────────────────────────
const mockSetTheme = jest.fn();

jest.mock('@/components/ThemeProvider', () => ({
  useTheme: jest.fn(() => ({ theme: 'light', setTheme: mockSetTheme, resolvedTheme: 'light' })),
}));

jest.mock('react-i18next', () => ({
  useTranslation: jest.fn(() => ({
    t: jest.fn((key: string, opts?: { defaultValue?: string }) => opts?.defaultValue || key),
  })),
}));

jest.mock('lucide-react', () => ({
  Sun: () => '🔆',
  Moon: () => '🌙',
  Monitor: () => '🖥️',
}));

jest.mock('@/lib/cssMotion', () => ({
  motion: {
    div: ({ children, ...props }: any) => (
      <div data-motion="div" {...props}>
        {children}
      </div>
    ),
    span: ({ children, ...props }: any) => (
      <span data-motion="span" {...props}>
        {children}
      </span>
    ),
  },
  AnimatePresence: ({ children }: any) => <div data-animate-presence>{children}</div>,
}));

jest.mock('@/components/ui/dropdown-menu', () => {
  const MockDropdownMenu = ({ children }: any) => <div data-testid="dropdown-menu">{children}</div>;
  const MockTrigger = ({ children }: any) => <div data-testid="dropdown-trigger">{children}</div>;
  const MockContent = ({ children }: any) => <div data-testid="dropdown-content">{children}</div>;
  const MockItem = ({ onClick, children, ...props }: any) => (
    <button data-testid="dropdown-item" onClick={onClick} {...props}>
      {children}
    </button>
  );
  return {
    DropdownMenu: MockDropdownMenu,
    DropdownMenuTrigger: MockTrigger,
    DropdownMenuContent: MockContent,
    DropdownMenuItem: MockItem,
    DropdownMenuGroup: ({ children }: any) => <>{children}</>,
    DropdownMenuPortal: ({ children }: any) => <>{children}</>,
    DropdownMenuSub: ({ children }: any) => <>{children}</>,
    DropdownMenuSubContent: ({ children }: any) => <>{children}</>,
    DropdownMenuSubTrigger: ({ children }: any) => <>{children}</>,
    DropdownMenuRadioGroup: ({ children }: any) => <>{children}</>,
    DropdownMenuRadioItem: ({ children }: any) => <>{children}</>,
    DropdownMenuCheckboxItem: ({ children }: any) => <>{children}</>,
    DropdownMenuLabel: ({ children }: any) => <>{children}</>,
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuShortcut: ({ children }: any) => <span>{children}</span>,
  };
});

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: any) => (
    <button data-testid="button" {...props}>
      {children}
    </button>
  ),
}));

import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { useTheme } from '@/components/ThemeProvider';

describe('ThemeSwitcher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useTheme as jest.Mock).mockReturnValue({
      theme: 'light',
      setTheme: mockSetTheme,
      resolvedTheme: 'light',
    });
  });

  it('renders without crashing', () => {
    const { container } = render(<ThemeSwitcher />);
    expect(container).toBeTruthy();
  });

  it('renders a button trigger', () => {
    render(<ThemeSwitcher />);
    expect(screen.getByTestId('button')).toBeInTheDocument();
  });

  it('shows sun icon when resolvedTheme is light', () => {
    render(<ThemeSwitcher />);
    expect(screen.getByTestId('button')).toContainHTML('🔆');
  });

  it('shows moon icon when resolvedTheme is dark', () => {
    (useTheme as jest.Mock).mockReturnValue({
      theme: 'dark',
      setTheme: mockSetTheme,
      resolvedTheme: 'dark',
    });
    render(<ThemeSwitcher />);
    expect(screen.getByTestId('button')).toContainHTML('🌙');
  });

  it('renders available themes (excluding current)', () => {
    render(<ThemeSwitcher />);
    // When theme=light, available: dark, system → 2 items
    const items = screen.getAllByTestId('dropdown-item');
    expect(items.length).toBeGreaterThanOrEqual(2);
  });

  it('renders dropdown menu structure', () => {
    render(<ThemeSwitcher />);
    expect(screen.getByTestId('dropdown-menu')).toBeInTheDocument();
    expect(screen.getByTestId('dropdown-trigger')).toBeInTheDocument();
    expect(screen.getByTestId('dropdown-content')).toBeInTheDocument();
  });

  it('calls setTheme when clicking a theme option', () => {
    render(<ThemeSwitcher />);
    const items = screen.getAllByTestId('dropdown-item');

    // Click first available theme
    fireEvent.click(items[0]);
    expect(mockSetTheme).toHaveBeenCalled();
  });

  it('applies aria-label on the button', () => {
    render(<ThemeSwitcher />);
    expect(screen.getByTestId('button')).toHaveAttribute('aria-label');
  });
});
