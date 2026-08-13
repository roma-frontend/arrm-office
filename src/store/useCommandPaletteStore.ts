import { create } from 'zustand';

/**
 * Open state for the ⌘K palette.
 *
 * Kept in a store rather than inside the palette component because the palette
 * is mounted once in the app shell while the things that open it — the dashboard
 * search button, the navbar, the mobile menu — live all over the tree. The
 * alternative (synthesising a keydown event) works but couples callers to a
 * keyboard binding they have no reason to know about.
 */
interface CommandPaletteState {
  open: boolean;
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;
}

export const useCommandPaletteStore = create<CommandPaletteState>((set) => ({
  open: false,
  openPalette: () => set({ open: true }),
  closePalette: () => set({ open: false }),
  togglePalette: () => set((state) => ({ open: !state.open })),
}));
