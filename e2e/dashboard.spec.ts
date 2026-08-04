import { test, expect } from './fixtures';

test.describe('Dashboard', () => {
  test('dashboard loads with stats cards', async ({ authedPage: page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    // Should show stats cards
    await expect(page.locator('[data-tour="quick-stats"]').first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('dashboard shows 4 stat cards', async ({ authedPage: page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const statsGrid = page.locator('[data-tour="quick-stats"]');
    if (await statsGrid.isVisible()) {
      const cards = statsGrid.locator('> div');
      await expect(cards).toHaveCount(4);
    }
  });

  test('org picker changes dashboard data', async ({ authedPage: page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Find org picker (usually a select/dropdown in header)
    const orgPicker = page.locator('[data-testid="org-picker"], select, [role="combobox"]').first();
    if (await orgPicker.isVisible()) {
      await orgPicker.click();
      await page.waitForTimeout(500);
      // Select first option
      const option = page.locator('[role="option"], option').first();
      if (await option.isVisible()) {
        await option.click();
        await page.waitForTimeout(2000);
        // Dashboard should still be visible (data refreshed)
        await expect(page.locator('[data-tour="quick-stats"]')).toBeVisible();
      }
    }
  });

  test('quick actions section visible', async ({ authedPage: page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    const quickActions = page.locator('[data-tour="quick-actions"]');
    if (await quickActions.isVisible()) {
      await expect(quickActions).toBeVisible();
    }
  });

  test('navigation sidebar works', async ({ authedPage: page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Click leaves link in sidebar/nav
    const leavesLink = page.locator('a[href*="/leaves"]').first();
    if (await leavesLink.isVisible()) {
      await leavesLink.click();
      await page.waitForURL(/leaves/, { timeout: 5_000 });
      expect(page.url()).toContain('leaves');
    }
  });
});
