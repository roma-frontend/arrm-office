import { create } from 'zustand';
import type { PlanGateInfo } from '@/lib/planGateErrors';

interface UpgradeModalState {
  open: boolean;
  info: PlanGateInfo | null;
  openUpgrade: (info: PlanGateInfo) => void;
  close: () => void;
}

/**
 * Global upgrade-modal store. Opened by the Convex client interceptor
 * (src/lib/convex.tsx) whenever a mutation/action is rejected with a
 * plan-gate error ("Module X is not included in your plan" / "Quota
 * exceeded"), and rendered by <UpgradeModal /> in the dashboard shell.
 */
export const useUpgradeModalStore = create<UpgradeModalState>()((set) => ({
  open: false,
  info: null,
  openUpgrade: (info) => set({ open: true, info }),
  close: () => set({ open: false }),
}));
