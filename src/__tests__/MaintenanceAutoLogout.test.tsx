/**
 * Tests for MaintenanceAutoLogout — invisible wrapper that triggers
 * auto-logout when maintenance mode is detected.
 */

import React from 'react';
import { describe, it, expect, jest } from '@jest/globals';
import { render } from '@testing-library/react';

jest.mock('@/hooks/useMaintenanceAutoLogout', () => ({
  useMaintenanceAutoLogout: jest.fn(),
}));

jest.mock('@/lib/convex', () => ({
  useConvexAuthReady: () => true,
}));

import { MaintenanceAutoLogout } from '@/components/MaintenanceAutoLogout';
import { useMaintenanceAutoLogout } from '@/hooks/useMaintenanceAutoLogout';

describe('MaintenanceAutoLogout', () => {
  it('renders nothing', () => {
    const { container } = render(<MaintenanceAutoLogout />);
    expect(container).toBeEmptyDOMElement();
  });

  it('activates the auto-logout hook', () => {
    render(<MaintenanceAutoLogout />);
    expect(useMaintenanceAutoLogout).toHaveBeenCalled();
  });

  it('renders null even when Convex is not ready', () => {
    const useConvexAuthReadyMock = jest.requireMock('@/lib/convex');
    useConvexAuthReadyMock.useConvexAuthReady = () => false;
    const { container } = render(<MaintenanceAutoLogout />);
    expect(container).toBeEmptyDOMElement();
  });
});
