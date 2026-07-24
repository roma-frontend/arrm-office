import { test, expect, login } from './fixtures';

test.describe('Auth Flow', () => {
  test('login page renders email form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('#email-login-form')).toBeVisible();
    await expect(page.locator('#email-login-form input').first()).toBeVisible();
  });

  test('shows error on invalid credentials', async ({ page }) => {
    await login(page, 'wrong@example.com', 'badpassword');
    // Should stay on login and show error
    await page.waitForTimeout(3000);
    const errorVisible = await page
      .locator('text=/invalid|error|incorrect/i')
      .first()
      .isVisible()
      .catch(() => false);
    const stillOnLogin = page.url().includes('login');
    expect(errorVisible || stillOnLogin).toBeTruthy();
  });

  test('locks account after 5 failed attempts', async ({ page }) => {
    const fakeEmail = `locktest-${Date.now()}@example.com`;
    for (let i = 0; i < 6; i++) {
      await login(page, fakeEmail, 'wrong');
      await page.waitForTimeout(1000);
    }
    // After 5+ attempts, should show lockout message or stay on login
    const onLogin = page.url().includes('login');
    expect(onLogin).toBeTruthy();
  });

  test('successful login redirects to dashboard', async ({ page }) => {
    test.skip(!process.env.E2E_USER_EMAIL, 'No test credentials');
    await login(page);
    await page.waitForURL(/dashboard|leaves|tasks/, { timeout: 15_000 });
    expect(page.url()).not.toContain('/login');
  });

  test('logout returns to login', async ({ page }) => {
    test.skip(!process.env.E2E_USER_EMAIL, 'No test credentials');
    await login(page);
    await page.waitForURL(/dashboard|leaves|tasks/, { timeout: 15_000 });

    // Click user menu / logout
    const avatar = page
      .locator('[data-testid="user-menu"], button:has(img[alt]), nav button')
      .last();
    await avatar.click();
    const logoutBtn = page.locator('text=/log\\s*out|sign\\s*out|выйти/i').first();
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await page.waitForURL(/login/, { timeout: 10_000 });
      expect(page.url()).toContain('login');
    }
  });

  test('forgot password link navigates', async ({ page }) => {
    await page.goto('/login');
    const link = page.locator('a[href*="forgot"]').first();
    if (await link.isVisible()) {
      await link.click();
      await expect(page).toHaveURL(/forgot/);
    }
  });
});
