/**
 * Tests for convex/lib/date.ts — safe date/time string extraction helpers.
 */

import { describe, it, expect, jest, afterEach } from '@jest/globals';

import { toDateString, parseTime, extractDatePart } from '../../convex/lib/date';

afterEach(() => {
  jest.useRealTimers();
});

describe('toDateString', () => {
  it('extracts YYYY-MM-DD from an ISO date', () => {
    expect(toDateString(new Date('2024-01-15T12:00:00Z'))).toBe('2024-01-15');
  });

  it('defaults to the current date when no argument is passed', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-07T09:00:00Z'));
    expect(toDateString()).toBe('2026-08-07');
  });
});

describe('parseTime', () => {
  it('parses hours and minutes', () => {
    expect(parseTime('09:30')).toEqual({ hours: 9, minutes: 30 });
  });

  it('parses midnight and noon', () => {
    expect(parseTime('00:00')).toEqual({ hours: 0, minutes: 0 });
    expect(parseTime('12:00')).toEqual({ hours: 12, minutes: 0 });
  });

  it('defaults missing parts to zero', () => {
    expect(parseTime('09')).toEqual({ hours: 9, minutes: 0 });
    expect(parseTime('')).toEqual({ hours: 0, minutes: 0 });
  });

  it('coerces numeric strings', () => {
    expect(parseTime('23:59')).toEqual({ hours: 23, minutes: 59 });
  });
});

describe('extractDatePart', () => {
  it('extracts the date part from an ISO date-time string', () => {
    expect(extractDatePart('2024-01-15T10:30:00Z')).toBe('2024-01-15');
  });

  it('returns the input unchanged when there is no T separator', () => {
    expect(extractDatePart('2024-01-15')).toBe('2024-01-15');
  });

  it('handles empty strings', () => {
    expect(extractDatePart('')).toBe('');
  });
});
