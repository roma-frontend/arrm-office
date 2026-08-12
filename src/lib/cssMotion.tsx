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
 * Composes a CSS `transform` from the transform-ish keys of a motion state.
 *
 * Returns `undefined` when the state declares no transform keys, and the string
 * `'none'` when it declares keys that all happen to be identity values. The
 * distinction matters: `'none'` is used to actively clear a transform inherited
 * from `initial`, while `undefined` means "this state has nothing to say about
 * transforms".
 */
function buildTransform(state: {
  x?: number | string;
  y?: number | string;
  scale?: number;
  rotate?: number;
}): string | undefined {
  const parts: string[] = [];

  if (state.x !== undefined && state.x !== 0) {
    parts.push(`translateX(${typeof state.x === 'number' ? `${state.x}px` : state.x})`);
  }
  if (state.y !== undefined && state.y !== 0) {
    parts.push(`translateY(${typeof state.y === 'number' ? `${state.y}px` : state.y})`);
  }
  if (state.scale !== undefined && state.scale !== 1) {
    parts.push(`scale(${state.scale})`);
  }
  if (state.rotate !== undefined && state.rotate !== 0) {
    parts.push(`rotate(${state.rotate}deg)`);
  }

  const declaresTransform =
    state.x !== undefined ||
    state.y !== undefined ||
    state.scale !== undefined ||
    state.rotate !== undefined;

  if (!declaresTransform) return undefined;
  return parts.length > 0 ? parts.join(' ') : 'none';
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
  // Non-DOM props that must not reach the element
  fill: _fill,
  rx: _rx,
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
    const target = exiting && exitState ? exitState : animateState;

    if (!target) return style;

    if (target.width !== undefined) {
      style.width = typeof target.width === 'number' ? `${target.width}px` : target.width;
    }
    if (target.opacity !== undefined) style.opacity = target.opacity;

    // The resting transform is owned entirely by the animate/exit target, and is
    // written even when the target declares no transform at all. Otherwise the
    // `initial` transform (which is merged in underneath this style object)
    // leaks into the resting state: `initial={{ scale: 0.95 }}` with
    // `animate={{ scale: 1 }}` used to render permanently at scale(0.95),
    // because `scale` was never read here.
    //
    // `none` matters beyond cosmetics — any transform other than `none` makes
    // the element a stacking context, which traps the z-index of absolutely
    // positioned children (e.g. a row dropdown ending up underneath a
    // full-screen click-catcher overlay).
    style.transform = buildTransform(target) ?? 'none';

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
    const transform = buildTransform(initialState);
    if (transform) style.transform = transform;

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
  layout,
  // Framer-motion-specific props are stripped here so React never tries to
  // write them to the DOM (e.g. `Received \`true\` for a non-boolean attribute \`layout\``).
  initial: _initial,
  animate: _animate,
  exit: _exit,
  transition: _transition,
  variants: _variants,
  onAnimationComplete: _onAnimationComplete,
  fill: _fill,
  rx: _rx,
  ...restProps
}: MotionProps) {
  const hoverClass = whileHover?.scale ? 'hover:scale-110 transition-transform' : '';
  const tapClass = whileTap?.scale ? 'active:scale-90 transition-transform' : '';
  const layoutClass = layout ? 'transition-all duration-300' : '';

  return (
    <button
      className={`${className} ${hoverClass} ${tapClass} ${layoutClass}`.trim()}
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
  layout,
  // Framer-motion-specific props are stripped here so React never tries to
  // write them to the DOM.
  initial: _initial,
  animate: _animate,
  exit: _exit,
  transition: _transition,
  variants: _variants,
  onAnimationComplete: _onAnimationComplete,
  type: _type,
  disabled: _disabled,
  fill: _fill,
  rx: _rx,
  ...restProps
}: MotionProps) {
  const hoverClass = whileHover?.scale ? 'hover:scale-110 transition-transform' : '';
  const tapClass = whileTap?.scale ? 'active:scale-90 transition-transform' : '';
  const layoutClass = layout ? 'transition-all duration-300' : '';

  return (
    <span
      className={`${className} ${hoverClass} ${tapClass} ${layoutClass}`.trim()}
      {...(restProps as React.HTMLAttributes<HTMLSpanElement>)}
    >
      {children}
    </span>
  );
}

/**
 * MotionForm - Renders as an actual <form> element.
 *
 * Must not fall back to MotionDiv: a <div> never fires submit events, so
 * `onSubmit` would silently never run and nested `type="submit"` buttons
 * would have no form owner and do nothing when clicked.
 */
export function MotionForm({
  children,
  className = '',
  whileHover,
  whileTap,
  layout,
  // Framer-motion-specific props are stripped here so React never tries to
  // write them to the DOM.
  initial: _initial,
  animate: _animate,
  exit: _exit,
  transition: _transition,
  variants: _variants,
  onAnimationComplete: _onAnimationComplete,
  type: _type,
  disabled: _disabled,
  fill: _fill,
  rx: _rx,
  ...restProps
}: MotionProps) {
  const hoverClass = whileHover?.scale ? 'hover:scale-110 transition-transform' : '';
  const tapClass = whileTap?.scale ? 'active:scale-90 transition-transform' : '';
  const layoutClass = layout ? 'transition-all duration-300' : '';

  return (
    <form
      className={`${className} ${hoverClass} ${tapClass} ${layoutClass}`.trim()}
      {...(restProps as React.FormHTMLAttributes<HTMLFormElement>)}
    >
      {children}
    </form>
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
  form: MotionForm,
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
