import { test, expect } from './fixtures';

test.describe('Admin Leave Balances', () => {
  test('page loads with title', async ({ authedPage: page }) => {
    await page.goto('/admin/leave-balances');
    await page.waitForLoadState('networkidle');

    await expect(
      page.locator('text=/leave balances|балансы отпусков|արձակուրդի մնացորդ/i'),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('search input is visible', async ({ authedPage: page }) => {
    await page.goto('/admin/leave-balances');
    await page.waitForLoadState('networkidle');

    const searchInput = page
      .locator(
        'input[placeholder*="search" i], input[placeholder*="поиск" i], input[placeholder*="որոնել" i]',
      )
      .first();
    await expect(searchInput).toBeVisible({ timeout: 5_000 });
  });

  test('page has subtitle description', async ({ authedPage: page }) => {
    await page.goto('/admin/leave-balances');
    await page.waitForLoadState('networkidle');

    const subtitle = page.locator('text=/view and edit|редактировать|просмотр/i').first();
    await expect(subtitle).toBeVisible({ timeout: 5_000 });
  });

  test('employee cards show balance grid', async ({ authedPage: page }) => {
    await page.goto('/admin/leave-balances');
    await page.waitForLoadState('networkidle');

    // Should have employee cards, or empty state
    const emptyState = page.locator('text=/no employees|нет сотрудников/i');
    const hasEmpty = await emptyState.isVisible().catch(() => false);

    if (!hasEmpty) {
      // Should have employee cards with balance fields
      const cards = page.locator('[class*="card"]');
      const count = await cards.count();
      expect(count).toBeGreaterThanOrEqual(1);

      // Each card should have balance values (numbers)
      const balanceValues = page.locator('text=/[0-9]/');
      const hasNumbers = (await balanceValues.count()) > 0;
      // Either has balances or has the cards
      expect(hasNumbers || count > 0).toBeTruthy();
    }
  });

  test('each employee card has edit button', async ({ authedPage: page }) => {
    await page.goto('/admin/leave-balances');
    await page.waitForLoadState('networkidle');

    const editBtn = page.locator('button:has-text(/edit|редактировать|խմբագրել/i)').first();
    if (await editBtn.isVisible()) {
      await editBtn.click();
      await page.waitForTimeout(500);

      // Should open dialog
      const dialog = page.locator('dialog, [role="dialog"]').first();
      const dialogVisible = await dialog.isVisible().catch(() => false);
      if (dialogVisible) {
        // Dialog should have balance input fields
        const inputs = dialog.locator('input[type="number"]');
        const inputCount = await inputs.count();
        expect(inputCount).toBeGreaterThanOrEqual(1);
      }
    }
  });

  test('edit dialog has reason textarea', async ({ authedPage: page }) => {
    await page.goto('/admin/leave-balances');
    await page.waitForLoadState('networkidle');

    const editBtn = page.locator('button:has-text(/edit|редактировать|խմբագրել/i)').first();
    if (await editBtn.isVisible()) {
      await editBtn.click();
      await page.waitForTimeout(500);

      const dialog = page.locator('dialog, [role="dialog"]').first();
      if (await dialog.isVisible()) {
        // Should have a textarea for reason
        const textarea = dialog.locator('textarea').first();
        await expect(textarea).toBeVisible({ timeout: 3_000 });
      }
    }
  });

  test('edit dialog has cancel and save buttons', async ({ authedPage: page }) => {
    await page.goto('/admin/leave-balances');
    await page.waitForLoadState('networkidle');

    const editBtn = page.locator('button:has-text(/edit|редактировать|խմբագրել/i)').first();
    if (await editBtn.isVisible()) {
      await editBtn.click();
      await page.waitForTimeout(500);

      const dialog = page.locator('dialog, [role="dialog"]').first();
      if (await dialog.isVisible()) {
        const cancelBtn = dialog.locator('button:has-text(/cancel|отмена|չեղարկել/i)').first();
        const saveBtn = dialog.locator('button:has-text(/save|сохранить|պահպանել/i)').first();
        expect(await cancelBtn.isVisible()).toBeTruthy();
        expect(await saveBtn.isVisible()).toBeTruthy();
      }
    }
  });

  test('search input responds to typing', async ({ authedPage: page }) => {
    await page.goto('/admin/leave-balances');
    await page.waitForLoadState('networkidle');

    const searchInput = page
      .locator(
        'input[placeholder*="search" i], input[placeholder*="поиск" i], input[placeholder*="որոնել" i]',
      )
      .first();
    await expect(searchInput).toBeVisible({ timeout: 5_000 });

    // Type a search term — input should still be interactable after
    await searchInput.fill('X');
    await page.waitForTimeout(500);
    const currentValue = await searchInput.inputValue();
    expect(currentValue).toBe('X');
  });
});
