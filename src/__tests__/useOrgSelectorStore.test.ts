/**
 * Tests for useOrgSelectorStore — simple org selection store.
 */
import { useOrgSelectorStore } from '@/store/useOrgSelectorStore';

describe('useOrgSelectorStore', () => {
  beforeEach(() => {
    useOrgSelectorStore.setState({ selectedOrgId: null });
  });

  describe('initial state', () => {
    it('starts with null selectedOrgId', () => {
      expect(useOrgSelectorStore.getState().selectedOrgId).toBeNull();
    });
  });

  describe('setSelectedOrgId', () => {
    it('sets selectedOrgId to given value', () => {
      useOrgSelectorStore.getState().setSelectedOrgId('org-123');
      expect(useOrgSelectorStore.getState().selectedOrgId).toBe('org-123');
    });

    it('sets selectedOrgId to null when passed null', () => {
      useOrgSelectorStore.getState().setSelectedOrgId('org-123');
      useOrgSelectorStore.getState().setSelectedOrgId(null);
      expect(useOrgSelectorStore.getState().selectedOrgId).toBeNull();
    });

    it('overwrites previous selection', () => {
      useOrgSelectorStore.getState().setSelectedOrgId('org-123');
      useOrgSelectorStore.getState().setSelectedOrgId('org-456');
      expect(useOrgSelectorStore.getState().selectedOrgId).toBe('org-456');
    });
  });

  describe('clearSelection', () => {
    it('resets selectedOrgId to null', () => {
      useOrgSelectorStore.getState().setSelectedOrgId('org-123');
      useOrgSelectorStore.getState().clearSelection();
      expect(useOrgSelectorStore.getState().selectedOrgId).toBeNull();
    });

    it('is safe to call when already null', () => {
      useOrgSelectorStore.getState().clearSelection();
      expect(useOrgSelectorStore.getState().selectedOrgId).toBeNull();
    });
  });

  describe('persist', () => {
    it('persists selectedOrgId to localStorage', () => {
      useOrgSelectorStore.getState().setSelectedOrgId('org-123');
      const persisted = JSON.parse(localStorage.getItem('org-selector-store') || '{}');
      expect(persisted.state.selectedOrgId).toBe('org-123');
    });
  });
});
