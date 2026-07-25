/**
 * Tests for useMainRef hook with document.querySelector mock.
 */
import { renderHook } from '@testing-library/react';
import { useMainRef } from '@/hooks/useMainRef';

describe('useMainRef', () => {
  beforeEach(() => {
    // Mock document.querySelector
    document.querySelector = jest.fn().mockReturnValue(document.createElement('main'));
  });

  it('returns a ref object', () => {
    const { result } = renderHook(() => useMainRef());
    expect(result.current).toHaveProperty('current');
  });

  it('ref.current is populated with main element after effect runs', () => {
    const { result } = renderHook(() => useMainRef());
    // renderHook runs effects synchronously, so the ref is already populated
    expect(result.current.current).not.toBeNull();
  });

  it('queries for the main element', () => {
    const querySpy = jest.spyOn(document, 'querySelector');
    renderHook(() => useMainRef());
    expect(querySpy).toHaveBeenCalledWith('main');
    querySpy.mockRestore();
  });
});
