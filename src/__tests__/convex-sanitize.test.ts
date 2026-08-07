/**
 * Tests for convex/lib/sanitize.ts — server-side XSS input sanitization.
 */

import { describe, it, expect } from '@jest/globals';
import { stripHtml, sanitizeText, sanitizeTitle } from '../../convex/lib/sanitize';

describe('stripHtml', () => {
  it('removes simple HTML tags', () => {
    expect(stripHtml('<b>bold</b>')).toBe('bold');
    expect(stripHtml('<p>Hello <i>world</i></p>')).toBe('Hello world');
  });

  it('removes tags with attributes', () => {
    expect(stripHtml('<a href="https://evil.example">click</a>')).toBe('click');
    expect(stripHtml('<script src="x.js">alert(1)</script>')).toBe('alert(1)');
  });

  it('leaves plain text untouched', () => {
    expect(stripHtml('no markup here')).toBe('no markup here');
  });

  it('handles empty strings', () => {
    expect(stripHtml('')).toBe('');
  });
});

describe('sanitizeText', () => {
  it('strips HTML and trims whitespace', () => {
    expect(sanitizeText('  <script>alert(1)</script>  hello  ')).toBe('alert(1)  hello');
  });

  it('limits the length to the default maximum', () => {
    const long = 'a'.repeat(20_000);
    expect(sanitizeText(long)).toHaveLength(10_000);
  });

  it('respects a custom maximum length', () => {
    expect(sanitizeText('abcdef', 3)).toBe('abc');
  });

  it('keeps short text intact', () => {
    expect(sanitizeText('hello')).toBe('hello');
  });
});

describe('sanitizeTitle', () => {
  it('strips HTML, trims and limits to 500 chars', () => {
    expect(sanitizeTitle('  <b>Title</b>  ')).toBe('Title');
    expect(sanitizeTitle('x'.repeat(1000))).toHaveLength(500);
  });

  it('keeps short titles intact', () => {
    expect(sanitizeTitle('Quick task')).toBe('Quick task');
  });

  it('applies a custom max length', () => {
    expect(sanitizeTitle('long title here', 5)).toBe('long ');
  });
});
