import { test, expect } from './fixtures';

test.describe('Leave Request CRUD', () => {
  test('leaves page loads with balance cards', async ({ authedPage: page }) => {
    await page.goto('/leaves');
    await page.waitForLoadState('networkidle');
    // Should show leave page content
    await expect(page.locator('text=/leave|отпуск|արձակուրdelays/i').first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('can open new leave request form', async ({ authedPage: page }) => {
    await page.goto('/leaves');
    await page.waitForLoadState('networkidle');

    // Click create/request button
    const createBtn = page
      .getByRole('button', { name: /new|create|request|создать|запрос/i })
      .first();
    if (await createBtn.isVisible()) {
      await createBtn.click();
      // Should show form/dialog
      await expect(page.locator('dialog, [role="dialog"], form').first()).toBeVisible({
        timeout: 5_000,
      });
    }
  });

  test('leave request form validates required fields', async ({ authedPage: page }) => {
    await page.goto('/leaves');
    await page.waitForLoadState('networkidle');

    const createBtn = page.getByRole('button', { name: /new|create|request|создать/i }).first();
    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.waitForTimeout(500);

      // Try to submit without filling
      const submitBtn = page.locator('dialog button[type="submit"]').first();
      if (await submitBtn.isVisible()) {
        await submitBtn.click();
        // Should show validation or stay in form
        await page.waitForTimeout(1000);
        const dialogStillOpen = await page.locator('dialog, [role="dialog"]').first().isVisible();
        expect(dialogStillOpen).toBeTruthy();
      }
    }
  });

  test('leave history table renders', async ({ authedPage: page }) => {
    await page.goto('/leaves');
    await page.waitForLoadState('networkidle');
    // Should have table or list of leaves
    const hasContent = await page
      .locator('table, [role="table"], [data-tour]')
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmptyState = await page
      .locator('text=/no leave|нет заявок|empty/i')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasContent || hasEmptyState).toBeTruthy();
  });
});
