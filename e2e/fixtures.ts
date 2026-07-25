import { test as base, expect, type Page } from '@playwright/test';

// Test credentials from env
const TEST_EMAIL = process.env.E2E_USER_EMAIL || 'test@strata.work';
const TEST_PASSWORD = process.env.E2E_USER_PASSWORD || 'Test123!@#';

/**
 * Login helper — fills email/password form and submits
 */
export async function login(page: Page, email = TEST_EMAIL, password = TEST_PASSWORD) {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

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
 * Extended test fixture with authenticated page
 */

export const test = base.extend<{ authedPage: Page }>({
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
    // Wait for redirect to dashboard
    await page.waitForURL(/dashboard|leaves|tasks/, { timeout: 15_000 });
    await run(page);
  },
});

export { expect };
