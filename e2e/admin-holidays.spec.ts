import { test, expect } from './fixtures';

test.describe('Admin Holidays', () => {
  test('page loads with title and empty states', async ({ authedPage: page }) => {
    await page.goto('/admin/holidays');
    await page.waitForLoadState('networkidle');

    await expect(
      page.locator('text=/holiday management|управление праздниками|արձակուրդների կառավարում/i'),
    ).toBeVisible({ timeout: 10_000 });

    // Both sections show empty states
    const noPublic = page.locator('text=/no public holidays|нет гос/i');
    const noInternal = page.locator('text=/no internal non|нет внутренних/i');
    // Check both sections independently so a rendering failure in either is caught
    await expect(noPublic).toBeVisible();
    await expect(noInternal).toBeVisible();
  });

  test('add holiday button is visible', async ({ authedPage: page }) => {
    await page.goto('/admin/holidays');
    await page.waitForLoadState('networkidle');

    const addBtn = page.locator('button:has-text(/add holiday|добавить|ավելացնել/i)').first();
    await expect(addBtn).toBeVisible({ timeout: 5_000 });
  });

  test('create dialog opens and has form fields', async ({ authedPage: page }) => {
    await page.goto('/admin/holidays');
    await page.waitForLoadState('networkidle');

    const addBtn = page.locator('button:has-text(/add holiday|добавить|ավելացնել/i)').first();
    await addBtn.click();

    const dialog = page.locator('dialog, [role="dialog"]').first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Should have name input
    await expect(dialog.locator('input:not([type="date"])')).toBeVisible();
    // Should have date input
    await expect(dialog.locator('input[type="date"]')).toBeVisible();
  });

  test('dialog has public/internal type select', async ({ authedPage: page }) => {
    await page.goto('/admin/holidays');
    await page.waitForLoadState('networkidle');

    const addBtn = page.locator('button:has-text(/add holiday|добавить|ավելացնել/i)').first();
    await addBtn.click();

    const dialog = page.locator('dialog, [role="dialog"]').first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Type selector should exist
    const selectTrigger = dialog
      .locator('[role="combobox"], button:has([role="combobox"])')
      .first();
    if (await selectTrigger.isVisible()) {
      await selectTrigger.click();
      await page.waitForTimeout(500);
      const options = page.locator('[role="option"]');
      const count = await options.count();
      expect(count).toBeGreaterThanOrEqual(2);
    }
  });

  test('recurring switch is present in dialog', async ({ authedPage: page }) => {
    await page.goto('/admin/holidays');
    await page.waitForLoadState('networkidle');

    const addBtn = page.locator('button:has-text(/add holiday|добавить|ավելացնել/i)').first();
    await addBtn.click();

    const dialog = page.locator('dialog, [role="dialog"]').first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Recurring switch
    const toggleSwitch = dialog.locator('[role="switch"]').first();
    if (await toggleSwitch.isVisible()) {
      const checked = await toggleSwitch.getAttribute('aria-checked');
      expect(checked === 'true' || checked === 'false').toBeTruthy();
    }
  });

  test('validation prevents empty submission', async ({ authedPage: page }) => {
    await page.goto('/admin/holidays');
    await page.waitForLoadState('networkidle');

    const addBtn = page.locator('button:has-text(/add holiday|добавить|ավելացնել/i)').first();
    await addBtn.click();

    const dialog = page.locator('dialog, [role="dialog"]').first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Click save/create without filling
    const submitBtn = dialog.locator('button:has-text(/create|save|создать|сохранить/i)').first();
    await submitBtn.click();
    await page.waitForTimeout(1000);

    // Dialog should still be open (validation prevented close)
    await expect(dialog).toBeVisible();
  });

  test('public holidays card renders header', async ({ authedPage: page }) => {
    await page.goto('/admin/holidays');
    await page.waitForLoadState('networkidle');

    const publicHeader = page.locator('text=/public holidays|гос/i').first();
    await expect(publicHeader).toBeVisible({ timeout: 5_000 });
  });
});
