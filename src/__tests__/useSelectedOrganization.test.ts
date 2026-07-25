/**
 * Tests for useSelectedOrganization hook
 */

import { renderHook, act } from '@testing-library/react';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';

// ── Mocks with mutable state ─────────────────────────────────────────────────
let mockOrgState: any = { selectedOrgId: null };
let mockAuthUser: any = {};

jest.mock('@/store/useOrgSelectorStore', () => ({
  useOrgSelectorStore: (selector: Function) => selector(mockOrgState),
}));

jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: (selector?: Function) => {
    const state = { user: mockAuthUser };
    return selector ? selector(state) : state;
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockOrgState = { selectedOrgId: null };
  mockAuthUser = {};
});

describe('useSelectedOrganization', () => {
  it('returns selectedOrgId for superadmin after hydration', async () => {
    mockAuthUser = { role: 'superadmin', organizationId: 'org_1' };
    mockOrgState = { selectedOrgId: 'org_2' };

    const { result } = renderHook(() => useSelectedOrganization());

    await act(async () => {});
    expect(result.current).toBe('org_2');
  });

  it('returns null for superadmin with no selected org', async () => {
    mockAuthUser = { role: 'superadmin', organizationId: 'org_1' };
    mockOrgState = { selectedOrgId: null };

    const { result } = renderHook(() => useSelectedOrganization());
    await act(async () => {});
    expect(result.current).toBeNull();
  });

  it('returns user organizationId for non-superadmin', async () => {
    mockAuthUser = { role: 'admin', organizationId: 'my_org' };
    mockOrgState = { selectedOrgId: 'some_org' };

    const { result } = renderHook(() => useSelectedOrganization());
    await act(async () => {});
    expect(result.current).toBe('my_org');
  });

  it('returns user organizationId for employee', async () => {
    mockAuthUser = { role: 'employee', organizationId: 'emp_org' };

    const { result } = renderHook(() => useSelectedOrganization());
    await act(async () => {});
    expect(result.current).toBe('emp_org');
  });

  it('returns null for user without organizationId', async () => {
    mockAuthUser = { role: 'employee' };

    const { result } = renderHook(() => useSelectedOrganization());
    await act(async () => {});
    expect(result.current).toBeNull();
  });
});
