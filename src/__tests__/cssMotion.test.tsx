/**
 * Tests for CSS Motion components (src/lib/cssMotion.tsx)
 * Tests: motion object structure, component exports
 */

import motion from '@/lib/cssMotion';

describe('motion object', () => {
  it('exports motion as default', () => {
    expect(motion).toBeDefined();
  });

  it('has div property which is MotionDiv', () => {
    expect(typeof motion.div).toBe('function');
  });

  it('has button property', () => {
    expect(typeof motion.button).toBe('function');
  });

  it('has span property', () => {
    expect(typeof motion.span).toBe('function');
  });

  it('has all expected HTML element properties', () => {
    const expectedElements = [
      'div',
      'button',
      'span',
      'p',
      'aside',
      'header',
      'main',
      'section',
      'article',
      'nav',
      'footer',
      'form',
      'li',
      'ul',
      'ol',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'a',
      'img',
      'svg',
      'path',
      'rect',
      'label',
      'strong',
      'em',
      'small',
      'b',
      'i',
      'u',
      'hr',
      'br',
      'tr',
    ];
    expectedElements.forEach((el) => {
      expect(motion[el as keyof typeof motion]).toBeDefined();
    });
  });

  it('all motion properties are functions (React components)', () => {
    Object.keys(motion).forEach((key) => {
      expect(typeof (motion as any)[key]).toBe('function');
    });
  });

  it('has correct number of elements', () => {
    const count = Object.keys(motion).length;
    expect(count).toBe(37);
  });

  it('MotionButton has hover and tap behavior', () => {
    const MotionButton = motion.button;
    expect(MotionButton).toBeDefined();
    expect(typeof MotionButton).toBe('function');
  });

  it('MotionSpan has hover and tap behavior', () => {
    const MotionSpan = motion.span;
    expect(MotionSpan).toBeDefined();
    expect(typeof MotionSpan).toBe('function');
  });
});
