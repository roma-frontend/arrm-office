/**
 * Tests for cookieConsentStore — cookie consent with persist middleware.
 */
import { useCookieConsent } from '@/store/cookieConsentStore';

const defaultPreferences = {
  necessary: true,
  analytics: false,
  marketing: false,
  preferences: false,
};

describe('cookieConsentStore', () => {
  beforeEach(() => {
    useCookieConsent.setState({
      hasConsent: false,
      showBanner: true,
      showSettings: false,
      preferences: defaultPreferences,
    });
  });

  describe('initial state', () => {
    it('starts without consent', () => {
      expect(useCookieConsent.getState().hasConsent).toBe(false);
    });

    it('shows banner by default', () => {
      expect(useCookieConsent.getState().showBanner).toBe(true);
    });

    it('has settings closed by default', () => {
      expect(useCookieConsent.getState().showSettings).toBe(false);
    });

    it('has necessary true and all others false by default', () => {
      expect(useCookieConsent.getState().preferences).toEqual(defaultPreferences);
    });
  });

  describe('acceptAll', () => {
    it('sets hasConsent true and hides banner', () => {
      useCookieConsent.getState().acceptAll();
      expect(useCookieConsent.getState().hasConsent).toBe(true);
      expect(useCookieConsent.getState().showBanner).toBe(false);
    });

    it('enables all preferences', () => {
      useCookieConsent.getState().acceptAll();
      expect(useCookieConsent.getState().preferences).toEqual({
        necessary: true,
        analytics: true,
        marketing: true,
        preferences: true,
      });
    });
  });

  describe('rejectAll', () => {
    it('sets hasConsent true and hides banner', () => {
      useCookieConsent.getState().rejectAll();
      expect(useCookieConsent.getState().hasConsent).toBe(true);
      expect(useCookieConsent.getState().showBanner).toBe(false);
    });

    it('keeps only necessary enabled', () => {
      useCookieConsent.getState().rejectAll();
      expect(useCookieConsent.getState().preferences).toEqual({
        necessary: true,
        analytics: false,
        marketing: false,
        preferences: false,
      });
    });
  });

  describe('savePreferences', () => {
    it('saves given preferences and overwrites analytics/marketing/preferences', () => {
      useCookieConsent.getState().savePreferences({
        necessary: true,
        analytics: true,
        marketing: false,
        preferences: true,
      });
      expect(useCookieConsent.getState().preferences).toEqual({
        necessary: true,
        analytics: true,
        marketing: false,
        preferences: true,
      });
    });

    it('always sets necessary to true even if passed false', () => {
      useCookieConsent.getState().savePreferences({
        necessary: false,
        analytics: true,
        marketing: true,
        preferences: true,
      });
      expect(useCookieConsent.getState().preferences.necessary).toBe(true);
    });

    it('closes settings after saving', () => {
      useCookieConsent.getState().openSettings();
      useCookieConsent.getState().savePreferences(defaultPreferences);
      expect(useCookieConsent.getState().showSettings).toBe(false);
    });
  });

  describe('openSettings / closeSettings', () => {
    it('opens settings', () => {
      useCookieConsent.getState().openSettings();
      expect(useCookieConsent.getState().showSettings).toBe(true);
    });

    it('closes settings', () => {
      useCookieConsent.getState().openSettings();
      useCookieConsent.getState().closeSettings();
      expect(useCookieConsent.getState().showSettings).toBe(false);
    });
  });

  describe('resetConsent', () => {
    it('resets to initial state', () => {
      useCookieConsent.getState().acceptAll();
      useCookieConsent.getState().resetConsent();
      const state = useCookieConsent.getState();
      expect(state.hasConsent).toBe(false);
      expect(state.showBanner).toBe(true);
      expect(state.showSettings).toBe(false);
      expect(state.preferences).toEqual(defaultPreferences);
    });
  });

  describe('persist partialize', () => {
    it('only persists hasConsent and preferences', () => {
      useCookieConsent.getState().acceptAll();
      const persisted = JSON.parse(localStorage.getItem('cookie-consent-storage') || '{}');
      expect(persisted.state.hasConsent).toBe(true);
      expect(persisted.state.preferences).toBeDefined();
      expect(persisted.state.showBanner).toBeUndefined();
      expect(persisted.state.showSettings).toBeUndefined();
    });
  });
});
