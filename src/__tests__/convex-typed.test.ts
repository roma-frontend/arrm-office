/**
 * Tests for src/lib/convex-typed.ts — the thin typed wrapper around
 * convex/react. Exercises the re-exports and the useTypedQuery helper
 * against a mocked convex/react so no line of the wrapper is left out.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('convex/react', () => ({
  useQuery: jest.fn(() => 'QUERY_RESULT'),
  useMutation: jest.fn(() => 'MUTATION_FN'),
  useConvex: jest.fn(() => 'CONVEX'),
  usePaginatedQuery: jest.fn(() => 'PAGINATED'),
  useAction: jest.fn(() => 'ACTION_FN'),
}));

import {
  useTypedQuery,
  useQuery,
  useMutation,
  useConvex,
  usePaginatedQuery,
  useAction,
} from '@/lib/convex-typed';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useTypedQuery', () => {
  it('forwards the reference and args to the underlying useQuery and casts the result', () => {
    const ref = { _name: 'listItems' } as Parameters<typeof useQuery>[0];
    const args = { organizationId: 'org_1' };

    const result = useTypedQuery<string[]>(ref, args);

    expect(result).toBe('QUERY_RESULT');
    expect(useQuery).toHaveBeenCalledWith(ref, args);
  });

  it('passes the "skip" sentinel through untouched', () => {
    const ref = { _name: 'listItems' } as Parameters<typeof useQuery>[0];

    useTypedQuery<null>(ref, 'skip');

    expect(useQuery).toHaveBeenCalledWith(ref, 'skip');
  });

  it('re-exports the rest of the convex/react surface', () => {
    const ref = { _name: 'x' } as Parameters<typeof useQuery>[0];

    useMutation(ref);
    useConvex();
    usePaginatedQuery(ref, { numItems: 10 });
    useAction(ref);

    expect(useMutation).toHaveBeenCalledWith(ref);
    expect(useConvex).toHaveBeenCalled();
    expect(usePaginatedQuery).toHaveBeenCalledWith(ref, { numItems: 10 });
    expect(useAction).toHaveBeenCalledWith(ref);
  });
});
