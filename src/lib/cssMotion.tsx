/**
 * CSS-based Animation Components
 * Replacement for Framer Motion
 */

import React, { useState, useEffect, useRef } from 'react';

// Тип для совместимости с framer-motion
export type HTMLMotionProps<T extends HTMLElement = HTMLDivElement> = MotionProps &
  React.HTMLAttributes<T>;

interface MotionProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  className?: string;
  layout?: boolean;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  fill?: string;
  rx?: string;
  initial?:
    | {
        opacity?: number;
        x?: number | string;
        y?: number | string;
        scale?: number;
        width?: number | string;
        height?: number | string;
        rotate?: number;
      }
    | string;
  animate?:
    | {
        opacity?: number;
        x?: number | string;
        y?: number | string;
        scale?: number;
        width?: number | string;
        height?: number | string;
        rotate?: number;
        background?: string | string[];
      }
    | string;
  exit?:
    | {
        opacity?: number;
        x?: number | string;
        y?: number | string;
        scale?: number;
        width?: number | string;
        height?: number | string;
        rotate?: number;
      }
    | string;
  transition?: {
    duration?: number;
    delay?: number;
    ease?: 'ease-in' | 'ease-out' | 'ease-in-out' | 'linear' | string | number[];
    type?: 'spring' | 'tween';
    stiffness?: number;
    damping?: number;
    repeat?: number;
  };
  whileHover?: {
    scale?: number;
    x?: number;
    y?: number;
    rotate?: number;
    background?: string;
    opacity?: number;
    transition?: { duration?: number; ease?: string };
  };
  whileTap?: {
    scale?: number;
    rotate?: number;
  };
  onAnimationComplete?: () => void;
  variants?: {
    hidden?: {
      opacity?: number;
      x?: number | string;
      y?: number | string;
      scale?: number;
      width?: number | string;
    };
    visible?: {
      opacity?: number;
      x?: number | string;
      y?: number | string;
      scale?: number;
      width?: number | string;
    };
    exit?: {
      opacity?: number;
      x?: number | string;
      y?: number | string;
      scale?: number;
      width?: number | string;
    };
  };
}

/**
 * MotionDiv - Drop-in replacement for motion.div
 * Uses CSS animations instead of Framer Motion
 */
export function MotionDiv({
  children,
  className = '',
  initial,
  animate,
  exit,
  transition = { duration: 0.3 },
  whileHover,
  whileTap,
  onAnimationComplete,
  layout,
  variants,
  onClick,
  ...restProps
}: MotionProps) {
  const [exiting, _setExiting] = useState(false);
  const elementRef = useRef<HTMLDivElement>(null);
  const [_mounted, setMounted] = useState(false);

  // Handle variants - convert string initial/animate to object
  const initialObj =
    typeof initial === 'string' && variants ? variants[initial as keyof typeof variants] : initial;
  const animateObj =
    typeof animate === 'string' && variants ? variants[animate as keyof typeof variants] : animate;
  const exitObj =
    typeof exit === 'string' && variants ? variants[exit as keyof typeof variants] : exit;

  // Use layout effect to avoid cascading renders
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setMounted(true);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (exitObj && exiting && onAnimationComplete) {
      const timer = setTimeout(onAnimationComplete, (transition.duration || 0.3) * 1000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [exiting, exitObj, onAnimationComplete, transition.duration]);

  // Handle layout animation (simplified - just applies transition)
  const layoutClass = layout ? 'transition-all duration-300' : '';

  // Build animation classes
  const getAnimationClass = () => {
    const exitState = typeof exitObj === 'string' ? undefined : exitObj;
    const animateState = typeof animateObj === 'string' ? undefined : animateObj;

    if (exiting && exitState) {
      if (exitState.opacity === 0) return 'animate-fade-out';
      if (exitState.scale && exitState.scale < 1) return 'animate-scale-out';
      if (exitState.y && typeof exitState.y === 'string' && exitState.y.includes('-'))
        return 'animate-slide-down';
      if (exitState.y) return 'animate-slide-up';
    }

    if (animateState) {
      // Apply animation classes immediately, not waiting for mounted
      if (animateState.opacity === 1) return 'animate-fade-in';
      if (animateState.scale && animateState.scale > 1) return 'animate-scale-in';
      if (animateState.y && typeof animateState.y === 'string' && animateState.y.includes('-'))
        return 'animate-slide-down';
      if (animateState.y) return 'animate-slide-up';
      if (animateState.x && typeof animateState.x === 'string' && animateState.x.includes('-'))
        return 'animate-slide-in-left';
      if (animateState.x) return 'animate-slide-in-right';
    }

    return '';
  };

  // Build hover/tap classes
  const getInteractiveClasses = () => {
    const classes: string[] = [];

    if (whileHover?.scale) {
      classes.push(`hover:scale-[${whileHover.scale}]`);
    }
    if (whileHover?.x) {
      classes.push(`hover:translate-x-[${whileHover.x}px]`);
    }
    if (whileHover?.y) {
      classes.push(`hover:translate-y-[${whileHover.y}px]`);
    }
    if (whileTap?.scale) {
      classes.push(`active:scale-[${whileTap.scale}]`);
    }

    return classes.join(' ');
  };

  // Build inline styles for animate/exit states
  const getAnimateStyle = () => {
    const style: React.CSSProperties = {};
    const exitState = typeof exitObj === 'string' ? undefined : exitObj;
    const animateState = typeof animateObj === 'string' ? undefined : animateObj;

    if (exiting && exitState) {
      if (exitState.width !== undefined) {
        style.width =
          typeof exitState.width === 'number' ? `${exitState.width}px` : exitState.width;
      }
      if (exitState.opacity !== undefined) style.opacity = exitState.opacity;
      if (exitState.x !== undefined) {
        style.transform = `translateX(${typeof exitState.x === 'number' ? `${exitState.x}px` : exitState.x})`;
      }
      if (exitState.y !== undefined) {
        style.transform =
          `${style.transform || ''} translateY(${typeof exitState.y === 'number' ? `${exitState.y}px` : exitState.y})`.trim();
      }
    } else if (animateState) {
      // Apply animate styles immediately, not waiting for mounted
      if (animateState.width !== undefined) {
        style.width =
          typeof animateState.width === 'number' ? `${animateState.width}px` : animateState.width;
      }
      if (animateState.opacity !== undefined) style.opacity = animateState.opacity;
      if (animateState.x !== undefined) {
        style.transform = `translateX(${typeof animateState.x === 'number' ? `${animateState.x}px` : animateState.x})`;
      }
      if (animateState.y !== undefined) {
        style.transform =
          `${style.transform || ''} translateY(${typeof animateState.y === 'number' ? `${animateState.y}px` : animateState.y})`.trim();
      }
    }

    return style;
  };

  // Build inline styles for initial state
  const getInitialStyle = () => {
    const initialState = typeof initialObj === 'string' ? undefined : initialObj;
    if (!initialState || exiting) return {};

    const style: React.CSSProperties = {};
    if (initialState.opacity !== undefined) style.opacity = initialState.opacity;
    if (initialState.width !== undefined) {
      style.width =
        typeof initialState.width === 'number' ? `${initialState.width}px` : initialState.width;
    }
    if (initialState.x !== undefined) {
      style.transform = `translateX(${typeof initialState.x === 'number' ? `${initialState.x}px` : initialState.x})`;
    }
    if (initialState.y !== undefined) {
      style.transform =
        `${style.transform || ''} translateY(${typeof initialState.y === 'number' ? `${initialState.y}px` : initialState.y})`.trim();
    }
    if (initialState.scale !== undefined)
      style.transform = `${style.transform || ''} scale(${initialState.scale})`.trim();

    return style;
  };

  const animationClass = getAnimationClass();
  const interactiveClass = getInteractiveClasses();

  if (exiting) {
    return (
      <div
        ref={elementRef}
        className={`${className} ${animationClass} ${layoutClass}`}
        style={{
          ...getInitialStyle(),
          ...getAnimateStyle(),
          transition: `all ${transition.duration || 0.3}s ${transition.ease || 'ease-in-out'}`,
        }}
        onClick={onClick}
        {...restProps}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      ref={elementRef}
      className={`${className} ${animationClass} ${interactiveClass} ${layoutClass}`}
      style={{
        ...getInitialStyle(),
        ...getAnimateStyle(),
        transitionDuration: `${(transition.duration || 0.3) * 1000}ms`,
        transitionDelay: `${(transition.delay || 0) * 1000}ms`,
      }}
      onClick={onClick}
      {...restProps}
    >
      {children}
    </div>
  );
}

/**
 * AnimatePresence - Replacement for Framer Motion's AnimatePresence
 * Handles exit animations for unmounting components
 */
interface AnimatePresenceProps {
  children: React.ReactNode;
  mode?: 'sync' | 'wait' | 'popLayout';
}

export function AnimatePresence({ children, mode: _mode }: AnimatePresenceProps) {
  return <>{children}</>;
}

/**
 * MotionButton - Renders as actual <button> element
 */
export function MotionButton({
  children,
  className = '',
  whileHover,
  whileTap,
  // Framer-motion-specific props are left in restProps so they don't
  // cause TS errors — React ignores unknown HTML attributes gracefully.
  ...restProps
}: MotionProps) {
  const hoverClass = whileHover?.scale ? 'hover:scale-110 transition-transform' : '';
  const tapClass = whileTap?.scale ? 'active:scale-90 transition-transform' : '';

  return (
    <button
      className={`${className} ${hoverClass} ${tapClass}`.trim()}
      {...(restProps as React.ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {children}
    </button>
  );
}

/**
 * MotionSpan - Renders as actual <span> element
 */
export function MotionSpan({
  children,
  className = '',
  whileHover,
  whileTap,
  // Framer-motion-specific props are left in restProps so they don't
  // cause TS errors — React ignores unknown HTML attributes gracefully.
  ...restProps
}: MotionProps) {
  const hoverClass = whileHover?.scale ? 'hover:scale-110 transition-transform' : '';
  const tapClass = whileTap?.scale ? 'active:scale-90 transition-transform' : '';

  return (
    <span
      className={`${className} ${hoverClass} ${tapClass}`.trim()}
      {...(restProps as React.HTMLAttributes<HTMLSpanElement>)}
    >
      {children}
    </span>
  );
}

// Re-export common motion components as MotionDiv
export const motion = {
  div: MotionDiv,
  button: MotionButton,
  span: MotionSpan,
  p: MotionDiv,
  aside: MotionDiv,
  header: MotionDiv,
  main: MotionDiv,
  section: MotionDiv,
  article: MotionDiv,
  nav: MotionDiv,
  footer: MotionDiv,
  form: MotionDiv,
  input: MotionDiv,
  li: MotionDiv,
  ul: MotionDiv,
  ol: MotionDiv,
  h1: MotionDiv,
  h2: MotionDiv,
  h3: MotionDiv,
  h4: MotionDiv,
  h5: MotionDiv,
  h6: MotionDiv,
  a: MotionDiv,
  img: MotionDiv,
  svg: MotionDiv,
  path: MotionDiv,
  rect: MotionDiv,
  label: MotionDiv,
  strong: MotionDiv,
  em: MotionDiv,
  small: MotionDiv,
  b: MotionDiv,
  i: MotionDiv,
  u: MotionDiv,
  hr: MotionDiv,
  br: MotionDiv,
  tr: MotionDiv,
};

// Default export for compatibility
export default motion;
