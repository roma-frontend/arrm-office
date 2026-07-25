/**
 * Tests for utility functions (src/lib/utils.ts)
 * Tests: cn (clsx + tailwind-merge)
 */

import { cn } from '@/lib/utils';

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('px-4', 'py-2')).toBe('px-4 py-2');
  });

  it('handles conditional classes', () => {
    const isActive = true;
    const isDisabled = false;
    expect(cn('base', isActive && 'active', isDisabled && 'disabled')).toBe('base active');
  });

  it('handles undefined and null values', () => {
    expect(cn('foo', undefined, null, 'bar')).toBe('foo bar');
  });

  it('handles empty inputs', () => {
    expect(cn()).toBe('');
  });

  it('handles object syntax', () => {
    expect(cn({ foo: true, bar: false, baz: true })).toBe('foo baz');
  });

  it('tailwind-merge: resolves conflicting classes', () => {
    // tailwind-merge should keep only the last px class
    const result = cn('px-4', 'px-6');
    expect(result).toBe('px-6');
  });

  it('tailwind-merge: resolves padding conflicts', () => {
    const result = cn('p-4', 'p-6');
    expect(result).toBe('p-6');
  });

  it('tailwind-merge: merges different properties', () => {
    const result = cn('p-4', 'm-2', 'text-center');
    expect(result).toBe('p-4 m-2 text-center');
  });

  it('tailwind-merge: handles array syntax', () => {
    const result = cn(['foo', 'bar'], 'baz');
    expect(result).toBe('foo bar baz');
  });

  it('tailwind-merge: handles complex conditional compositions', () => {
    const result = cn(
      'fixed inset-0 z-50 flex items-center justify-center',
      'bg-black/50 backdrop-blur-sm',
      'data-[state=open]:animate-in data-[state=closed]:animate-out',
      'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
    );
    expect(result).toContain('fixed');
    expect(result).toContain('backdrop-blur-sm');
  });
});
