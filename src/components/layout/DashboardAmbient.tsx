'use client';

/**
 * Ambient background for the product shell.
 *
 * Three huge, slowly-drifting colour orbs pinned behind the scrollable content
 * (the orbs live at z-index 0; `.main-scrollable` sits at z-index 1 above them).
 * This is the same depth the landing page has — the dashboard used to sit on a
 * flat background, which made the marketing site and the product feel like two
 * different companies. Motion is CSS-only, respects prefers-reduced-motion, and
 * is pointer-transparent so nothing behind it becomes unclickable.
 */
export default function DashboardAmbient() {
  return (
    <div className="dashboard-ambient" aria-hidden="true">
      <div className="ambient-orb ambient-orb-1" />
      <div className="ambient-orb ambient-orb-2" />
      <div className="ambient-orb ambient-orb-3" />
    </div>
  );
}
