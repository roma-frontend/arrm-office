/**
 * Tests for cssMotion.tsx — CSS-based animation components (framer-motion replacement)
 *
 * Tests: MotionDiv render with various animation states, MotionButton, MotionSpan,
 * AnimatePresence, motion export object, exit animations, hover/tap interactions.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  MotionDiv,
  MotionButton,
  MotionSpan,
  AnimatePresence,
  motion,
  default as motionDefault,
} from '@/lib/cssMotion';

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

  it('handles numeric width animation in px', () => {
    render(<MotionDiv animate={{ width: 200 }}>NumWidth</MotionDiv>);
    const el = screen.getByText('NumWidth');
    expect(el.style.width).toBe('200px');
  });

  it('applies slide-up class for positive y in animate', () => {
    render(<MotionDiv animate={{ y: 40 }}>SlideUpY</MotionDiv>);
    expect(screen.getByText('SlideUpY').className).toContain('animate-slide-up');
  });

  it('applies slide-down class for negative string y in animate', () => {
    render(<MotionDiv animate={{ y: '-40px' }}>SlideDownY</MotionDiv>);
    expect(screen.getByText('SlideDownY').className).toContain('animate-slide-down');
  });

  it('applies slide-in-right class for positive string x in animate', () => {
    render(<MotionDiv animate={{ x: '100px' }}>SlideRight</MotionDiv>);
    expect(screen.getByText('SlideRight').className).toContain('animate-slide-in-right');
  });

  it('combines x and y transforms in the animate style', () => {
    render(<MotionDiv animate={{ x: 20, y: 10 }}>ComboTransform</MotionDiv>);
    const el = screen.getByText('ComboTransform');
    expect(el.style.transform).toContain('translateX(20px)');
    expect(el.style.transform).toContain('translateY(10px)');
  });

  it('applies scale from initial state', () => {
    render(<MotionDiv initial={{ scale: 0.5 }}>InitialScale</MotionDiv>);
    const el = screen.getByText('InitialScale');
    expect(el.style.transform).toContain('scale(0.5)');
  });

  it('combines initial x and scale transforms', () => {
    render(<MotionDiv initial={{ x: -20, scale: 0.9 }}>InitialCombo</MotionDiv>);
    const el = screen.getByText('InitialCombo');
    expect(el.style.transform).toContain('translateX(-20px)');
    expect(el.style.transform).toContain('scale(0.9)');
  });

  it('applies initial width as number in px', () => {
    render(<MotionDiv initial={{ width: 300 }}>InitialWidth</MotionDiv>);
    expect(screen.getByText('InitialWidth').style.width).toBe('300px');
  });

  it('applies string initial width verbatim', () => {
    render(<MotionDiv initial={{ width: '80%' }}>InitialWidthPct</MotionDiv>);
    expect(screen.getByText('InitialWidthPct').style.width).toBe('80%');
  });

  it('handles whileHover x translation', () => {
    render(<MotionDiv whileHover={{ x: 10 }}>HoverX</MotionDiv>);
    expect(screen.getByText('HoverX').className).toContain('hover:translate-x');
  });

  it('handles whileHover y translation', () => {
    render(<MotionDiv whileHover={{ y: 10 }}>HoverY</MotionDiv>);
    expect(screen.getByText('HoverY').className).toContain('hover:translate-y');
  });

  it('combines hover and tap classes', () => {
    render(
      <MotionDiv whileHover={{ scale: 1.1, x: 5 }} whileTap={{ scale: 0.9 }}>
        Both
      </MotionDiv>,
    );
    const el = screen.getByText('Both');
    expect(el.className).toContain('hover:scale');
    expect(el.className).toContain('hover:translate-x');
    expect(el.className).toContain('active:scale');
  });

  it('strips framer-motion-only props from the DOM', () => {
    render(
      <MotionDiv initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        Stripped
      </MotionDiv>,
    );
    const el = screen.getByText('Stripped');
    // fill/rx are destructured out; initial/animate/exit never reach the DOM.
    expect(el.getAttribute('initial')).toBeNull();
    expect(el.getAttribute('animate')).toBeNull();
    expect(el.getAttribute('exit')).toBeNull();
  });

  it('passes unknown data attributes through', () => {
    render(<MotionDiv data-custom="yes">CustomAttr</MotionDiv>);
    expect(screen.getByText('CustomAttr').getAttribute('data-custom')).toBe('yes');
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

  it('honours an explicit type prop', () => {
    render(<MotionButton type="button">ExplicitType</MotionButton>);
    const btn = screen.getByText('ExplicitType') as HTMLButtonElement;
    expect(btn.type).toBe('button');
  });

  it('applies layout class', () => {
    render(<MotionButton layout>LayoutBtn</MotionButton>);
    expect(screen.getByText('LayoutBtn').className).toContain('transition-all');
  });

  it('strips framer-motion props from the button element', () => {
    render(
      <MotionButton initial={{ opacity: 0 }} animate={{ opacity: 1 }} layout>
        StrippedBtn
      </MotionButton>,
    );
    const btn = screen.getByText('StrippedBtn');
    expect(btn.getAttribute('layout')).toBeNull();
    expect(btn.getAttribute('initial')).toBeNull();
    expect(btn.getAttribute('animate')).toBeNull();
    expect(btn.getAttribute('exit')).toBeNull();
  });

  it('passes aria attributes through', () => {
    render(<MotionButton aria-label="Save">AriaBtn</MotionButton>);
    expect(screen.getByText('AriaBtn').getAttribute('aria-label')).toBe('Save');
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

  it('applies whileTap scale class', () => {
    render(<MotionSpan whileTap={{ scale: 0.8 }}>TapSpan</MotionSpan>);
    expect(screen.getByText('TapSpan').className).toContain('active:scale');
  });

  it('applies layout class', () => {
    render(<MotionSpan layout>LayoutSpan</MotionSpan>);
    expect(screen.getByText('LayoutSpan').className).toContain('transition-all');
  });

  it('strips framer-motion props from the span element', () => {
    render(
      <MotionSpan initial="hidden" animate="visible" variants={{}} type="button" disabled>
        StrippedSpan
      </MotionSpan>,
    );
    const span = screen.getByText('StrippedSpan');
    expect(span.getAttribute('type')).toBeNull();
    expect(span.getAttribute('disabled')).toBeNull();
    expect(span.getAttribute('initial')).toBeNull();
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
  it('has a default export matching the named motion object', () => {
    expect(motionDefault).toBe(motion);
  });

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
