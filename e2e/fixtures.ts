import { test as base, expect, type Page } from '@playwright/test';

// Test credentials from env
const TEST_EMAIL = process.env.E2E_USER_EMAIL || 'test@strata.work';
const TEST_PASSWORD = process.env.E2E_USER_PASSWORD || 'Test123!@#';

/**
 * Login helper — fills email/password form and submits
 */
export async function login(page: Page, email = TEST_EMAIL, password = TEST_PASSWORD) {
  await page.goto('/login');

  // No waitForLoadState('networkidle') here. The app holds a live Convex
  // subscription, so the network never goes fully idle on its own and the wait
  // burns seconds before timing out. The emailInput.waitFor() below is the
  // real readiness signal — the form being interactive is what we need.

  // Fill email (SmartEmailInput renders an input inside)
  const emailInput = page
    .locator('#email-login-form input[type="email"], #email-login-form input[type="text"]')
    .first();
  await emailInput.waitFor({ state: 'visible', timeout: 10_000 });
  await emailInput.fill(email);

  // Fill password
  const passwordInput = page.locator('#email-login-form input[type="password"]').first();
  await passwordInput.fill(password);

  // Submit
  const submitBtn = page.locator('#email-login-form button[type="submit"]').first();
  await submitBtn.click();
}

/**
 * Select the user's own organization in the org selector so admin pages
 * (holidays / leave-settings / leave-balances) render content instead of
 * the ShieldLoader that superadmins see until an org is picked.
 *
 * The org selector is a zustand persist store ('org-selector-store') keyed by
 * the selected org id. For a superadmin, useSelectedOrganization() returns
 * selectedOrgId ?? null, so without a selection every /admin/* page stays on
 * its loading shield. We seed the store with the user's own organization id
 * (read from the persisted auth store) right after login, before any admin
 * page navigation happens.
 */
export async function selectOrganizationForSuperadmin(page: Page) {
  await page.evaluate(() => {
    try {
      const rawAuth = window.localStorage.getItem('auth-storage');
      if (!rawAuth) return;
      const parsed = JSON.parse(rawAuth) as {
        state?: { user?: { organizationId?: string } };
      };
      const orgId = parsed?.state?.user?.organizationId;
      if (!orgId) return;
      // zustand persist format: { state: ..., version: 1 }
      window.localStorage.setItem(
        'org-selector-store',
        JSON.stringify({ state: { selectedOrgId: orgId }, version: 1 }),
      );
    } catch {
      // Best-effort: ignore storage errors, tests will fail visibly if needed.
    }
  });
}

/**
 * Extended test fixture with authenticated page
 */

export const test = base.extend<{ authedPage: Page; adminPage: Page }>({
  // Override the built-in page so every test starts with the onboarding tour
  // pre-dismissed. On a fresh CI browser the login-tour auto-shows and its
  // full-screen z-[9999] spotlight overlay intercepts clicks on the login
  // form, which otherwise breaks every test that logs in.
  page: async ({ page }, run) => {
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('tour_seen_login-tour', 'true');
      } catch {
        // localStorage may be unavailable before first navigation — ignore.
      }
    });
    await run(page);
  },
  authedPage: async ({ page }, run) => {
    // These tests require a real backend with a seeded test user. Without
    // credentials (e.g. CI running against a placeholder Convex deployment)
    // login cannot succeed, so skip rather than hard-fail — same guard the
    // real-login tests in auth.spec.ts already use.
    test.skip(!process.env.E2E_USER_EMAIL, 'No test credentials configured');
    await login(page);
    // Wait for redirect to dashboard (generous timeout — slow machines / many
    // parallel workers can make login take a while).
    await page.waitForURL(/dashboard|leaves|tasks/, { timeout: 30_000 });
    await run(page);
  },
  // Admin pages for a superadmin render content only after an organization
  // is selected (otherwise they stay on ShieldLoader). This fixture seeds the
  // org selector with the user's own org so /admin/* tests exercise real UI.
  adminPage: async ({ page }, run) => {
    test.skip(!process.env.E2E_USER_EMAIL, 'No test credentials configured');
    await login(page);
    await page.waitForURL(/dashboard|leaves|tasks/, { timeout: 30_000 });
    await selectOrganizationForSuperadmin(page);
    await run(page);
  },
});

export { expect };
