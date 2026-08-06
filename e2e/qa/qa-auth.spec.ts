import { test, expect, login } from '../fixtures';

test.describe('QA: Auth & Dashboard', () => {
  // Real-login tests: they can only run against a backend with a seeded test
  // user. CI has no credentials (placeholder Convex deployment), so skip the
  // whole describe there — same guard as e2e/auth.spec.ts.
  test.skip(!process.env.E2E_USER_EMAIL, 'No test credentials configured');

  test('login with provided credentials redirects to dashboard', async ({ page }) => {
    await login(page);
    await page.waitForURL(/dashboard|leaves|tasks/, { timeout: 30_000 });
    expect(page.url()).not.toContain('/login');

    // Dashboard must render real content (not a loading shield forever).
    await expect(page.locator('main, h1, h2, [class*="card"]').first()).toBeVisible({
      timeout: 25_000,
    });
    // Give the client shell a moment to hydrate and pull Convex data before
    // reading the rendered text.
    await page.waitForTimeout(3_000);
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.trim().length).toBeGreaterThan(50);
  });

  test('dashboard does not throw page errors', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await login(page);
    await page.waitForURL(/dashboard|leaves|tasks/, { timeout: 30_000 });
    await page.waitForTimeout(4000);
    expect(pageErrors).toEqual([]);
  });
});
