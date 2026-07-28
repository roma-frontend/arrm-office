/**
 * Tests for cssMotion.tsx — CSS-based animation components (framer-motion replacement)
 *
 * Tests: MotionDiv render with various animation states, MotionButton, MotionSpan,
 * AnimatePresence, motion export object, exit animations, hover/tap interactions.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MotionDiv, MotionButton, MotionSpan, AnimatePresence, motion } from '@/lib/cssMotion';

describe('MotionDiv', () => {
  it('renders children correctly', () => {
    render(<MotionDiv>Hello World</MotionDiv>);
    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });

  it('applies className prop', () => {
    render(<MotionDiv className="custom-class">Test</MotionDiv>);
    const el = screen.getByText('Test');
    expect(el.className).toContain('custom-class');
  });

  it('renders as a div element by default', () => {
    render(<MotionDiv>Div Element</MotionDiv>);
    const el = screen.getByText('Div Element');
    expect(el.tagName).toBe('DIV');
  });

  it('applies layout class when layout prop is true', () => {
    render(<MotionDiv layout>Layout</MotionDiv>);
    const el = screen.getByText('Layout');
    expect(el.className).toContain('transition-all');
    expect(el.className).toContain('duration-300');
  });

  it('handles onClick handler', () => {
    const handleClick = jest.fn();
    render(<MotionDiv onClick={handleClick}>Click Me</MotionDiv>);
    fireEvent.click(screen.getByText('Click Me'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('applies animate style for opacity: 1', () => {
    render(<MotionDiv animate={{ opacity: 1 }}>Fade In</MotionDiv>);
    const el = screen.getByText('Fade In');
    expect(el.style.opacity).toBe('1');
  });

  it('applies animate style for translateX', () => {
    render(<MotionDiv animate={{ x: 100 }}>Slide Right</MotionDiv>);
    const el = screen.getByText('Slide Right');
    expect(el.style.transform).toContain('translateX');
  });

  it('applies animate style for translateY', () => {
    render(<MotionDiv animate={{ y: 50 }}>Slide Down</MotionDiv>);
    const el = screen.getByText('Slide Down');
    expect(el.style.transform).toContain('translateY');
  });

  it('applies animate scale class', () => {
    render(<MotionDiv animate={{ scale: 1.5 }}>Scale</MotionDiv>);
    const el = screen.getByText('Scale');
    expect(el.className).toContain('animate-scale-in');
  });

  it('applies initial opacity style', () => {
    render(
      <MotionDiv initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        Initial
      </MotionDiv>,
    );
    const el = screen.getByText('Initial');
    // Should have opacity from initial state but then animate to 1
    expect(el.style.opacity).toBe('1');
  });

  it('uses variants objects for animate', () => {
    const variants = {
      hidden: { opacity: 0 },
      visible: { opacity: 1 },
    };
    render(
      <MotionDiv initial="hidden" animate="visible" variants={variants}>
        Variants
      </MotionDiv>,
    );
    const el = screen.getByText('Variants');
    expect(el.style.opacity).toBe('1');
  });

  it('uses variants objects for exit', () => {
    const variants = {
      hidden: { opacity: 0 },
      visible: { opacity: 1 },
      exit: { opacity: 0 },
    };
    // Initial render — exit animation won't play yet
    render(
      <MotionDiv initial="hidden" animate="visible" exit="exit" variants={variants}>
        Exit Variants
      </MotionDiv>,
    );
    expect(screen.getByText('Exit Variants')).toBeInTheDocument();
  });

  it('passes additional HTML attributes via restProps', () => {
    render(
      <MotionDiv data-testid="motion-div" aria-label="Test">
        ARIA
      </MotionDiv>,
    );
    const el = screen.getByText('ARIA');
    expect(el.getAttribute('data-testid')).toBe('motion-div');
    expect(el.getAttribute('aria-label')).toBe('Test');
  });

  it('applies transition duration as inline style', () => {
    render(
      <MotionDiv animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
        Transition
      </MotionDiv>,
    );
    const el = screen.getByText('Transition');
    expect(el.style.transitionDuration).toBe('500ms');
  });

  it('applies transition delay as inline style', () => {
    render(
      <MotionDiv animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
        Delay
      </MotionDiv>,
    );
    const el = screen.getByText('Delay');
    expect(el.style.transitionDelay).toBe('200ms');
  });

  it('handles whileHover scale', () => {
    render(<MotionDiv whileHover={{ scale: 1.05 }}>Hover</MotionDiv>);
    const el = screen.getByText('Hover');
    expect(el.className).toContain('hover:scale');
  });

  it('handles whileTap scale', () => {
    render(<MotionDiv whileTap={{ scale: 0.95 }}>Tap</MotionDiv>);
    const el = screen.getByText('Tap');
    expect(el.className).toContain('active:scale');
  });

  it('handles number-based x and y transforms in animate', () => {
    render(<MotionDiv animate={{ x: 50, y: 30 }}>Transform</MotionDiv>);
    const el = screen.getByText('Transform');
    // Should contain both translateX and translateY
    const transform = el.style.transform || '';
    expect(transform).toContain('translateX');
    expect(transform).toContain('translateY');
  });

  it('handles string-based x transform in animate', () => {
    render(<MotionDiv animate={{ x: '-100%' }}>StringX</MotionDiv>);
    const el = screen.getByText('StringX');
    expect(el.className).toContain('animate-slide-in-left');
  });

  it('handles width animation', () => {
    render(<MotionDiv animate={{ width: '50%' }}>WidthAnimate</MotionDiv>);
    const el = screen.getByText('WidthAnimate');
    expect(el.style.width).toBe('50%');
  });
});

describe('MotionButton', () => {
  it('renders as a button element', () => {
    render(<MotionButton>Button</MotionButton>);
    const btn = screen.getByText('Button');
    expect(btn.tagName).toBe('BUTTON');
  });

  it('handles click events', () => {
    const handleClick = jest.fn();
    render(<MotionButton onClick={handleClick}>Click</MotionButton>);
    fireEvent.click(screen.getByText('Click'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('applies whileHover scale class', () => {
    render(<MotionButton whileHover={{ scale: 1.1 }}>HoverBtn</MotionButton>);
    const btn = screen.getByText('HoverBtn');
    expect(btn.className).toContain('hover:scale');
  });

  it('applies whileTap scale class', () => {
    render(<MotionButton whileTap={{ scale: 0.9 }}>TapBtn</MotionButton>);
    const btn = screen.getByText('TapBtn');
    expect(btn.className).toContain('active:scale');
  });

  it('applies custom className', () => {
    render(<MotionButton className="custom-btn">Custom</MotionButton>);
    expect(screen.getByText('Custom').className).toContain('custom-btn');
  });

  it('is disabled when disabled prop is set', () => {
    render(<MotionButton disabled>Disabled</MotionButton>);
    const btn = screen.getByText('Disabled') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('has type submit by default (HTML default for buttons)', () => {
    render(<MotionButton>DefaultType</MotionButton>);
    const btn = screen.getByText('DefaultType') as HTMLButtonElement;
    // The default type for a button element in HTML is 'submit'
    // since no explicit type prop is passed
    expect(btn.type).toBe('submit');
  });
});

describe('MotionSpan', () => {
  it('renders as a span element', () => {
    render(<MotionSpan>Span Text</MotionSpan>);
    const el = screen.getByText('Span Text');
    expect(el.tagName).toBe('SPAN');
  });

  it('applies className', () => {
    render(<MotionSpan className="span-class">Styled</MotionSpan>);
    expect(screen.getByText('Styled').className).toContain('span-class');
  });

  it('applies whileHover scale class', () => {
    render(<MotionSpan whileHover={{ scale: 1.2 }}>ScaleSpan</MotionSpan>);
    expect(screen.getByText('ScaleSpan').className).toContain('hover:scale');
  });
});

describe('AnimatePresence', () => {
  it('renders children', () => {
    render(
      <AnimatePresence>
        <div>Child</div>
      </AnimatePresence>,
    );
    expect(screen.getByText('Child')).toBeInTheDocument();
  });

  it('renders multiple children', () => {
    render(
      <AnimatePresence>
        <div key="a">A</div>
        <div key="b">B</div>
      </AnimatePresence>,
    );
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('accepts mode prop without crashing', () => {
    render(
      <AnimatePresence mode="wait">
        <div key="1">Mode Wait</div>
      </AnimatePresence>,
    );
    expect(screen.getByText('Mode Wait')).toBeInTheDocument();
  });

  it('renders null children gracefully', () => {
    render(
      <AnimatePresence>
        {null}
        <div key="c">C</div>
        {undefined}
      </AnimatePresence>,
    );
    expect(screen.getByText('C')).toBeInTheDocument();
  });
});

describe('motion export object', () => {
  it('exports motion.div as MotionDiv', () => {
    expect(motion.div).toBe(MotionDiv);
  });

  it('exports motion.button as MotionButton', () => {
    expect(motion.button).toBe(MotionButton);
  });

  it('exports motion.span as MotionSpan', () => {
    expect(motion.span).toBe(MotionSpan);
  });

  it('exports all common HTML tags', () => {
    const tags = [
      'p',
      'aside',
      'header',
      'main',
      'section',
      'article',
      'nav',
      'footer',
      'form',
      'input',
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
    tags.forEach((tag) => {
      expect(motion[tag as keyof typeof motion]).toBe(MotionDiv);
    });
  });
});
