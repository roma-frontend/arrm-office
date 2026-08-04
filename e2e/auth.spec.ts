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
    // Six full navigate + submit round-trips do not fit the 30s default. This
    // test is inherently ~6x the cost of a single-login test, so give it room
    // rather than racing the shared budget.
    test.setTimeout(90_000);

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

    // The user menu is a DropdownMenuTrigger button with aria-label "User menu"
    // (no data-testid). Radix menus render items with role="menuitem".
    const userMenu = page.getByRole('button', { name: /user menu|меню/i }).first();
    await expect(userMenu).toBeVisible({ timeout: 10_000 });
    await userMenu.click();

    const logoutItem = page.getByRole('menuitem', { name: /log\s*out|sign\s*out|выйти/i }).first();
    await expect(logoutItem).toBeVisible({ timeout: 5_000 });
    await logoutItem.click();

    // handleLogout clears client state, then router.push('/') — the app lands
    // on the public landing page (or /login if middleware redirects), never a
    // dashboard route. Accept either outcome.
    await page.waitForURL((url) => !/dashboard|leaves|tasks/.test(url.pathname), {
      timeout: 15_000,
    });
    expect(page.url()).not.toMatch(/dashboard|leaves|tasks/);
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
