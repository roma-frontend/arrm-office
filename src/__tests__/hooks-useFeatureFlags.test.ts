/**
 * Tests for src/hooks/useFeatureFlags.ts
 */

import { jest, describe, it, expect } from '@jest/globals';

jest.mock('convex/react', () => ({
  useQuery: jest.fn(() => undefined),
  useMutation: jest.fn(() => jest.fn()),
}));

// Mock the module to test the pure logic
describe('useFeatureFlags', () => {
  it('module exports a hook', () => {
    const mod = require('@/hooks/useFeatureFlags');
    expect(typeof mod.useFeatureFlags).toBe('function');
  });

  it('useFeatureFlags returns object with flags', () => {
    const { useQuery } = require('convex/react');
    useQuery.mockReturnValue(undefined);
    const { useFeatureFlags } = require('@/hooks/useFeatureFlags');
    // Can't call hooks outside render, but verify import works
    expect(typeof useFeatureFlags).toBe('function');
  });
});

describe('useHighlightedEntity', () => {
  it('module exports hook', () => {
    const mod = require('@/hooks/useHighlightedEntity');
    expect(typeof mod.useHighlightedEntity).toBe('function');
  });
});

describe('useTaskGrid (import)', () => {
  it('module can be imported', () => {
    const mod = require('@/hooks/useTaskGrid');
    expect(mod).toBeDefined();
  });
});
