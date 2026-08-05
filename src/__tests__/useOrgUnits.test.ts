/**
 * Tests for useOrgUnits — departments/positions for dropdowns.
 *
 * Mocks: convex/react (useQuery).
 */
jest.mock('convex/react', () => ({
  useQuery: jest.fn(),
}));

import { renderHook } from '@testing-library/react';
import { useOrgUnits } from '@/hooks/useOrgUnits';
import { useQuery } from 'convex/react';

const departments = [
  { _id: 'dep_1', name: 'Engineering' },
  { _id: 'dep_2', name: 'Sales' },
];

const positions = [
  { _id: 'pos_1', title: 'Developer', departmentId: 'dep_1' },
  { _id: 'pos_2', title: 'Sales Manager', departmentId: 'dep_2' },
  { _id: 'pos_3', title: 'General Manager' }, // no department — always visible
];

describe('useOrgUnits', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips queries when no organization id is given', () => {
    const { result } = renderHook(() => useOrgUnits(null));
    expect(useQuery).toHaveBeenCalledWith(expect.anything(), 'skip');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.departments).toBeUndefined();
    expect(result.current.positions).toBeUndefined();
  });

  it('reports loading while either query is pending', () => {
    (useQuery as jest.Mock).mockReturnValueOnce(undefined).mockReturnValueOnce(positions);
    const { result } = renderHook(() => useOrgUnits('org_1'));
    expect(result.current.isLoading).toBe(true);
  });

  it('returns departments and all positions when no department filter is set', () => {
    (useQuery as jest.Mock).mockReturnValueOnce(departments).mockReturnValueOnce(positions);
    const { result } = renderHook(() => useOrgUnits('org_1'));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.departments).toEqual(departments);
    expect(result.current.positions).toEqual(positions);
    expect(result.current.allPositions).toEqual(positions);
  });

  it('filters positions by department while keeping department-less ones', () => {
    (useQuery as jest.Mock).mockReturnValueOnce(departments).mockReturnValueOnce(positions);
    const { result } = renderHook(() => useOrgUnits('org_1', 'dep_1'));
    expect(result.current.positions?.map((p) => p._id)).toEqual(['pos_1', 'pos_3']);
  });

  it('passes the organization id to both queries', () => {
    (useQuery as jest.Mock).mockReturnValue(departments);
    renderHook(() => useOrgUnits('org_42'));
    const calls = (useQuery as jest.Mock).mock.calls;
    expect(calls[0][1]).toEqual({ organizationId: 'org_42' });
    expect(calls[1][1]).toEqual({ organizationId: 'org_42' });
  });
});
