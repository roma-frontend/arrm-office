/**
 * Tests for MobileDockBar — the mobile navigation dock.
 *
 * Pure presentation component: tabs render as links in their slots, the centre
 * FAB toggles the menu, badges and the active-route indicator are asserted.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('next/link', () => {
  const ReactMod = require('react');
  return ({ href, children, ...props }: any) =>
    ReactMod.createElement('a', { href, ...props }, children);
});

jest.mock('lucide-react', () => {
  const ReactMod = require('react');
  const names = ['LayoutGrid', 'X', 'Home', 'Calendar', 'Bell', 'User'];
  const out: Record<string, (props: any) => React.ReactElement> = {};
  names.forEach((n) => {
    out[n] = (props: any) =>
      ReactMod.createElement('span', { 'data-testid': `icon-${n}`, ...props });
  });
  return out;
});

import { MobileDockBar, type DockTab } from '@/components/layout/MobileDockBar';
import { Home, Calendar, Bell, User } from 'lucide-react';

const TABS: DockTab[] = [
  { href: '/', icon: Home, label: 'Home', slot: 0 },
  { href: '/calendar', icon: Calendar, label: 'Calendar', slot: 1 },
  { href: '/notifications', icon: Bell, label: 'Notifications', slot: 3, badge: 7 },
  { href: '/profile', icon: User, label: 'Profile', slot: 4 },
];

describe('MobileDockBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all tabs as links with labels', () => {
    render(
      <MobileDockBar
        tabs={TABS}
        activeSlot={null}
        menuOpen={false}
        onMenuToggle={jest.fn()}
        menuLabel="Menu"
        navLabel="Main nav"
      />,
    );
    expect(screen.getByRole('link', { name: /Home/ })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /Calendar/ })).toHaveAttribute('href', '/calendar');
    expect(screen.getByRole('link', { name: /Notifications/ })).toHaveAttribute(
      'href',
      '/notifications',
    );
    expect(screen.getByRole('link', { name: /Profile/ })).toHaveAttribute('href', '/profile');
    expect(screen.getByRole('navigation', { name: 'Main nav' })).toBeInTheDocument();
  });

  it('marks the active tab with aria-current', () => {
    render(
      <MobileDockBar
        tabs={TABS}
        activeSlot={1}
        menuOpen={false}
        onMenuToggle={jest.fn()}
        menuLabel="Menu"
        navLabel="Nav"
      />,
    );
    expect(screen.getByRole('link', { name: /Calendar/ }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.getByRole('link', { name: /Home/ }).getAttribute('aria-current')).toBeNull();
  });

  it('renders a badge with 99+ cap', () => {
    render(
      <MobileDockBar
        tabs={[{ ...TABS[2], badge: 150 }]}
        activeSlot={null}
        menuOpen={false}
        onMenuToggle={jest.fn()}
        menuLabel="Menu"
        navLabel="Nav"
      />,
    );
    expect(screen.getByText('99+')).toBeInTheDocument();
  });

  it('renders the numeric badge when under 100', () => {
    render(
      <MobileDockBar
        tabs={[TABS[2]]}
        activeSlot={null}
        menuOpen={false}
        onMenuToggle={jest.fn()}
        menuLabel="Menu"
        navLabel="Nav"
      />,
    );
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('toggles the menu via the centre FAB', () => {
    const onMenuToggle = jest.fn();
    render(
      <MobileDockBar
        tabs={TABS}
        activeSlot={null}
        menuOpen={false}
        onMenuToggle={onMenuToggle}
        menuLabel="Open menu"
        navLabel="Nav"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(onMenuToggle).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Open menu' }).getAttribute('aria-expanded')).toBe(
      'false',
    );
  });

  it('reflects the open menu state on the FAB', () => {
    render(
      <MobileDockBar
        tabs={TABS}
        activeSlot={null}
        menuOpen
        onMenuToggle={jest.fn()}
        menuLabel="Close menu"
        navLabel="Nav"
      />,
    );
    const fab = screen.getByRole('button', { name: 'Close menu' });
    expect(fab.getAttribute('aria-expanded')).toBe('true');
  });

  it('shows the menu dot when enabled and the menu is closed', () => {
    const { container } = render(
      <MobileDockBar
        tabs={TABS}
        activeSlot={null}
        menuOpen={false}
        onMenuToggle={jest.fn()}
        menuLabel="Menu"
        navLabel="Nav"
        menuDot
      />,
    );
    expect(container.querySelector('.mobile-dock-fab')).not.toBeNull();
    // The dot renders as a child of the FAB.
    const dots = container.querySelectorAll('button span[class*="bg-(--destructive)"]');
    expect(dots.length).toBeGreaterThan(0);
  });

  it('fires onTabClick when a tab is clicked', () => {
    const onTabClick = jest.fn();
    render(
      <MobileDockBar
        tabs={TABS}
        activeSlot={null}
        menuOpen={false}
        onMenuToggle={jest.fn()}
        menuLabel="Menu"
        navLabel="Nav"
        onTabClick={onTabClick}
      />,
    );
    fireEvent.click(screen.getByRole('link', { name: /Home/ }));
    expect(onTabClick).toHaveBeenCalledTimes(1);
  });
});
