/**
 * Tests for `@/store/useCommandPaletteStore` — ⌘K palette open state.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { useCommandPaletteStore } from '@/store/useCommandPaletteStore';

beforeEach(() => {
  useCommandPaletteStore.setState({ open: false });
});

describe('useCommandPaletteStore', () => {
  it('starts closed', () => {
    expect(useCommandPaletteStore.getState().open).toBe(false);
  });

  it('openPalette opens', () => {
    useCommandPaletteStore.getState().openPalette();
    expect(useCommandPaletteStore.getState().open).toBe(true);
  });

  it('closePalette closes', () => {
    useCommandPaletteStore.getState().openPalette();
    useCommandPaletteStore.getState().closePalette();
    expect(useCommandPaletteStore.getState().open).toBe(false);
  });

  it('togglePalette toggles open→closed', () => {
    useCommandPaletteStore.getState().openPalette();
    useCommandPaletteStore.getState().togglePalette();
    expect(useCommandPaletteStore.getState().open).toBe(false);
  });

  it('togglePalette toggles closed→open', () => {
    useCommandPaletteStore.getState().togglePalette();
    expect(useCommandPaletteStore.getState().open).toBe(true);
  });
});
