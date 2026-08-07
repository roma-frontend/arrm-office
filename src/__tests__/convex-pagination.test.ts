/**
 * Tests for convex/pagination.ts — cursor encode/decode and page-size
 * normalization. Pure functions, no Convex backend required.
 */

import { describe, it, expect } from '@jest/globals';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  normalizePageSize,
  decodeCursor,
  decodeCreationTimeCursor,
  encodeCursor,
  paginationArgs,
} from '../../convex/pagination';

describe('normalizePageSize', () => {
  it('returns the default page size when nothing is passed', () => {
    expect(normalizePageSize(undefined)).toBe(DEFAULT_PAGE_SIZE);
    expect(normalizePageSize()).toBe(DEFAULT_PAGE_SIZE);
  });

  it('returns the default for falsy/zero values', () => {
    expect(normalizePageSize(0)).toBe(DEFAULT_PAGE_SIZE);
    expect(normalizePageSize(NaN)).toBe(DEFAULT_PAGE_SIZE);
  });

  it('clamps sizes below 1 up to 1', () => {
    expect(normalizePageSize(-5)).toBe(1);
    expect(normalizePageSize(0.5)).toBe(1);
  });

  it('clamps sizes above the max down to the max', () => {
    expect(normalizePageSize(MAX_PAGE_SIZE + 1)).toBe(MAX_PAGE_SIZE);
    expect(normalizePageSize(1000)).toBe(MAX_PAGE_SIZE);
  });

  it('passes through valid sizes', () => {
    expect(normalizePageSize(1)).toBe(1);
    expect(normalizePageSize(20)).toBe(20);
    expect(normalizePageSize(99)).toBe(99);
  });
});

describe('encodeCursor / decodeCursor', () => {
  it('round-trips a cursor', () => {
    const data = { _id: 'task_123', _creationTime: 1700000000000 };
    const encoded = encodeCursor(data);
    expect(typeof encoded).toBe('string');
    expect(encoded.length).toBeGreaterThan(0);
    expect(decodeCursor(encoded)).toEqual(data);
  });

  it('handles string values that look like ids', () => {
    const encoded = encodeCursor({ _id: 'user_1' });
    expect(decodeCursor(encoded)).toEqual({ _id: 'user_1' });
  });

  it('returns an empty object for invalid base64', () => {
    expect(decodeCursor('!!!not-base64!!!')).toEqual({});
  });

  it('returns an empty object for base64 that is not JSON', () => {
    // "not json" base64-decodes to garbage that fails JSON.parse
    expect(decodeCursor(Buffer.from('not json', 'utf-8').toString('base64'))).toEqual({});
  });

  it('returns an empty object for an empty cursor', () => {
    expect(decodeCursor('')).toEqual({});
  });
});

describe('decodeCreationTimeCursor', () => {
  it('extracts a numeric _creationTime', () => {
    const encoded = encodeCursor({ _creationTime: 123456789 });
    expect(decodeCreationTimeCursor(encoded)).toBe(123456789);
  });

  it('returns undefined when _creationTime is missing', () => {
    const encoded = encodeCursor({ _id: 'task_1' });
    expect(decodeCreationTimeCursor(encoded)).toBeUndefined();
  });

  it('returns undefined when _creationTime is not a number', () => {
    const encoded = encodeCursor({ _creationTime: '2026-08-07' });
    expect(decodeCreationTimeCursor(encoded)).toBeUndefined();
  });

  it('returns undefined for a malformed cursor', () => {
    expect(decodeCreationTimeCursor('garbage')).toBeUndefined();
  });
});

describe('paginationArgs', () => {
  it('exposes optional pageSize and cursor validators', () => {
    expect(paginationArgs).toHaveProperty('pageSize');
    expect(paginationArgs).toHaveProperty('cursor');
  });
});
