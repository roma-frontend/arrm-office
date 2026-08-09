/**
 * Tests for landing/MobileMenu — the slide-in navigation drawer for the
 * landing page.
 *
 * Covers: mount gating (not hydrated / closed → nothing), the open/close
 * animation state machine (shouldRender + isPanelOpen via rAF/timeouts),
 * backdrop and Escape closing, body scroll lock + resize unlock, per-item
 * navigation (plain routes, hash links on the landing page vs elsewhere),
 * active-item highlighting (activeSection + hash fallback), theme toggle,
 * LanguageSwitcher render, footer CTAs, and the liquid-hover mousemove
 * tracking.
 *
 * Mocks: react-i18next, next/navigation (useRouter/usePathname mutable),
 * next/link, framer-motion (motion.div → div, useMotionValue/useSpring →
 * plain objects), @/components/ThemeProvider (controllable theme/setTheme),
 * @/hooks/useHydrated, LanguageSwitcher, lucide-react proxy.
 */

import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import MobileMenu, { LiquidHoverBg } from '@/components/landing/MobileMenu';
import { useTheme } from '@/components/ThemeProvider';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: { language: 'en' },
  }),
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockPathname = '/';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  usePathname: () => mockPathname,
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: any) => (
    <a href={typeof href === 'string' ? href : href?.pathname} {...props}>
      {children}
    </a>
  ),
}));

jest.mock('framer-motion', () => {
  const makeMV = (v: number) => ({ get: () => v, set: () => {}, getVelocity: () => 0 });
  return {
    motion: {
      // Drop motion-only props so React doesn't warn about unknown DOM attrs.
      div: ({ children, animate, transition, initial, ...props }: any) => (
        <div {...props}>{children}</div>
      ),
    },
    useMotionValue: (v: number) => makeMV(v),
    useSpring: (v: any) => v,
  };
});

let mockTheme = 'light';
const mockSetTheme = jest.fn();
jest.mock('@/components/ThemeProvider', () => ({
  useTheme: () => ({ theme: mockTheme, setTheme: mockSetTheme, resolvedTheme: mockTheme }),
}));

let mockHydrated = true;
jest.mock('@/hooks/useHydrated', () => ({
  useHydrated: () => mockHydrated,
}));

jest.mock('@/components/LanguageSwitcher', () => ({
  LanguageSwitcher: () => <div data-testid="lang-switcher" />,
}));

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return new Proxy({}, { get: () => Icon });
});

const seed = () => {
  mockPush.mockClear();
  mockReplace.mockClear();
  mockSetTheme.mockClear();
  mockTheme = 'light';
  mockHydrated = true;
  mockPathname = '/';
  window.scrollTo = jest.fn();
  window.scrollY = 0;
  document.body.style.overflow = '';
  document.body.style.position = '';
  document.body.style.width = '';
  document.body.style.top = '';
  // jsdom has no matchMedia; give it one so smoothScrollToY takes the
  // reduced-motion branch deterministically.
  // Reduced-motion branch: window.scrollTo fires synchronously, so no rAF
  // animation loops leak between tests.
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: true,
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
  // Remove any elements a previous test appended to the DOM (e.g. the pricing
  // section stub) so scrollToHash cannot find stale targets.
  document.querySelectorAll('[id]').forEach((el) => el.remove());
};

beforeEach(seed);

/**
 * The panel opens through a double-rAF then a 130ms timeout. `act` + real
 * timers keep the animation state machine honest.
 */
async function openMenu(onClose = jest.fn()) {
  render(<MobileMenu isOpen onClose={onClose} />);
  await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  return onClose;
}

describe('MobileMenu', () => {
  it('renders nothing when not hydrated', () => {
    mockHydrated = false;
    const { container } = render(<MobileMenu isOpen onClose={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when closed', () => {
    const { container } = render(<MobileMenu isOpen={false} onClose={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the panel with navigation, preferences and footer CTAs', async () => {
    await openMenu();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    // The items fade in after a 130ms reveal timer.
    const homeLink = screen.getByText('mobileMenu.home').closest('a') as HTMLElement;
    await waitFor(() => expect(homeLink.style.opacity).toBe('1'));
    expect(screen.getByText('Navigation')).toBeInTheDocument();
    expect(screen.getByText('Preferences')).toBeInTheDocument();
    expect(screen.getByText('Language')).toBeInTheDocument();
    expect(screen.getByTestId('lang-switcher')).toBeInTheDocument();
    // All menu items
    expect(screen.getAllByText('mobileMenu.home').length).toBeGreaterThan(0);
    expect(screen.getByText('mobileMenu.features')).toBeInTheDocument();
    expect(screen.getByText('mobileMenu.analytics')).toBeInTheDocument();
    expect(screen.getByText('mobileMenu.pricing')).toBeInTheDocument();
    expect(screen.getByText('mobileMenu.testimonials')).toBeInTheDocument();
    expect(screen.getByText('mobileMenu.recruitment')).toBeInTheDocument();
    // Branding + footer
    expect(screen.getByText('Smart HR Platform')).toBeInTheDocument();
    expect(screen.getByText('Sign In')).toBeInTheDocument();
    expect(screen.getByText('Get Started Free')).toBeInTheDocument();
    expect(screen.getByText(/Secure & Private/)).toBeInTheDocument();
  });

  it('closes via the X button', async () => {
    const onClose = await openMenu();
    fireEvent.click(screen.getByLabelText('Close menu'));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes via the backdrop click', async () => {
    const onClose = await openMenu();
    const backdrop = screen
      .getByRole('dialog')
      .parentElement?.querySelector('div.fixed.inset-0') as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape', async () => {
    const onClose = await openMenu();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('navigates to a plain route', async () => {
    const onClose = await openMenu();
    fireEvent.click(screen.getByText('mobileMenu.features'));
    expect(onClose).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/features');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('pushes a hash link when not on the target page', async () => {
    mockPathname = '/features';
    const onClose = await openMenu();
    fireEvent.click(screen.getByText('mobileMenu.pricing'));
    expect(mockPush).toHaveBeenCalledWith('/#pricing');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('scrolls to a hash link when already on the landing page', async () => {
    const pricing = document.createElement('div');
    pricing.id = 'pricing';
    pricing.getBoundingClientRect = () =>
      ({ top: 600, left: 0, right: 0, bottom: 0, width: 0, height: 0 }) as DOMRect;
    document.body.appendChild(pricing);
    const onClose = await openMenu();
    fireEvent.click(screen.getByText('mobileMenu.pricing'));
    expect(mockReplace).toHaveBeenCalledWith('/#pricing', { scroll: false });
    await waitFor(() => expect(window.scrollTo).toHaveBeenCalled());
    document.body.removeChild(pricing);
  });

  it('leaves the page unchanged when the hash target is missing', async () => {
    const onClose = await openMenu();
    fireEvent.click(screen.getByText('mobileMenu.pricing'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    // Fire the deferred rAF callback deterministically — with no element it
    // must return without scrolling, though navigation still happened.
    const rafSpy = jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => {
        cb(performance.now());
        return 1;
      });
    await act(async () => {});
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    rafSpy.mockRestore();
  });

  it('runs the smooth-scroll animation when reduced motion is off', async () => {
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
    const pricing = document.createElement('div');
    pricing.id = 'pricing';
    pricing.getBoundingClientRect = () =>
      ({ top: 600, left: 0, right: 0, bottom: 0, width: 0, height: 0 }) as DOMRect;
    document.body.appendChild(pricing);
    await openMenu();
    fireEvent.click(screen.getByText('mobileMenu.pricing'));
    await waitFor(() => expect(window.scrollTo).toHaveBeenCalled());
  });

  it('closes via the brand link', async () => {
    const onClose = await openMenu();
    fireEvent.click(screen.getByText('Smart HR Platform'));
    expect(onClose).toHaveBeenCalled();
  });

  it('highlights the active plain page', async () => {
    mockPathname = '/analytics';
    await openMenu();
    const link = screen.getByText('mobileMenu.analytics').closest('a') as HTMLElement;
    expect(link.querySelector('.w-1')).toBeTruthy();
  });

  it('highlights a hash item from the active section observer', async () => {
    const { rerender } = render(<MobileMenu isOpen onClose={jest.fn()} activeSection="pricing" />);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    rerender(<MobileMenu isOpen onClose={jest.fn()} activeSection="pricing" />);
    const link = screen.getByText('mobileMenu.pricing').closest('a') as HTMLElement;
    expect(link.querySelector('.w-1')).toBeTruthy();
  });

  it('highlights a hash item from the URL hash when no section is active', async () => {
    window.history.pushState({}, '', '/#testimonials');
    window.dispatchEvent(new Event('hashchange'));
    await openMenu();
    const link = screen.getAllByText('mobileMenu.testimonials')[0].closest('a') as HTMLElement;
    expect(link.querySelector('.w-1')).toBeTruthy();
  });

  it('toggles between light and dark theme', async () => {
    await openMenu();
    // Light theme shows the dark-mode label and the moon icon.
    expect(screen.getByText('Dark Mode')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Dark Mode'));
    expect(mockSetTheme).toHaveBeenCalledWith('dark');
  });

  it('renders the light-mode label for the dark theme', async () => {
    mockTheme = 'dark';
    await openMenu();
    expect(screen.getByText('Light Mode')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Light Mode'));
    expect(mockSetTheme).toHaveBeenCalledWith('light');
  });

  it('tracks the pointer position on a menu item', async () => {
    await openMenu();
    const link = screen.getByText('mobileMenu.home').closest('a') as HTMLElement;
    link.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 100, bottom: 40, width: 100, height: 40 }) as DOMRect;
    fireEvent.mouseMove(link, { clientX: 20, clientY: 10 });
    expect((link as HTMLElement & { __lhx?: number }).__lhx).toBe(20);
    expect((link as HTMLElement & { __lhy?: number }).__lhy).toBe(10);
  });

  it('locks body scroll while the panel is open and unlocks on close', async () => {
    const { unmount } = render(<MobileMenu isOpen onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    await waitFor(() => expect(document.body.style.overflow).toBe('hidden'));
    expect(document.body.style.position).toBe('fixed');
    unmount();
    expect(document.body.style.overflow).toBe('');
    expect(document.body.style.position).toBe('');
  });

  it('unlocks body scroll on resize to desktop width', async () => {
    render(<MobileMenu isOpen onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    await waitFor(() => expect(document.body.style.overflow).toBe('hidden'));
    Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
    fireEvent(window, new Event('resize'));
    expect(document.body.style.overflow).toBe('');
  });

  it('keeps the body scroll lock when resized to a mobile width', async () => {
    render(<MobileMenu isOpen onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    await waitFor(() => expect(document.body.style.overflow).toBe('hidden'));
    Object.defineProperty(window, 'innerWidth', { value: 768, configurable: true });
    fireEvent(window, new Event('resize'));
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('ignores non-Escape keys while open', async () => {
    const onClose = await openMenu();
    fireEvent.keyDown(document, { key: 'Enter' });
    fireEvent.keyDown(document, { key: 'a' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('removes the keydown listener when closed', async () => {
    const onClose = jest.fn();
    const { rerender } = render(<MobileMenu isOpen onClose={onClose} />);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    rerender(<MobileMenu isOpen={false} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('runs the close animation and unmounts the panel after isOpen flips to false', async () => {
    const { rerender } = render(<MobileMenu isOpen onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    rerender(<MobileMenu isOpen={false} onClose={jest.fn()} />);
    // The 16ms paint timer flips isPanelOpen, then the 480ms timer unmounts.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(), {
      timeout: 1500,
    });
  });

  it('renders the liquid hover background for active and idle states', () => {
    const { container, rerender } = render(<LiquidHoverBg accent="#22c55e" active />);
    const bg = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(bg).toBeTruthy();
    expect(bg.className).toContain('absolute inset-0 rounded-2xl');
    rerender(<LiquidHoverBg accent="#22c55e" active={false} />);
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });
});
