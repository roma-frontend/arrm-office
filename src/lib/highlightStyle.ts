import type { CSSProperties } from 'react';

/**
 * Ring + wash that flashes the row a notification sent the user to.
 *
 * Inline styles rather than a class: the highlighted rows are table rows, kanban
 * cards and calendar chips whose own `className` is already composed
 * conditionally, and `style` composes with all of them without fighting
 * specificity. Pair with `useHighlightedEntity`, which supplies both arguments.
 *
 * @param isHighlighted this row is the target
 * @param pulse         blink phase; the dimmer variant is the "off" beat
 */
export function highlightRowStyle(isHighlighted: boolean, pulse = true): CSSProperties {
  if (!isHighlighted) return {};
  return pulse
    ? {
        boxShadow: '0 0 0 2px rgba(44,140,213,0.5), 0 0 20px rgba(44,140,213,0.25)',
        backgroundColor: 'rgba(44,140,213,0.1)',
        transition: 'all 0.3s ease',
      }
    : { backgroundColor: 'rgba(44,140,213,0.05)', transition: 'all 0.3s ease' };
}
