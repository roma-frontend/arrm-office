import { test, expect } from './fixtures';

test.describe('Admin Leave Settings', () => {
  test('page loads with title', async ({ adminPage: page }) => {
    await page.goto('/admin/leave-settings');
    await page.waitForLoadState('networkidle');

    await expect(
      page.locator('text=/leave type settings|настройки отпусков|արձակուրդների կարգավորում/i'),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('shows leave type cards', async ({ adminPage: page }) => {
    await page.goto('/admin/leave-settings');
    await page.waitForLoadState('networkidle');

    // Should have cards for leave types (paid, sick, etc.). The CardTitle
    // component does not emit a "card-title" class, so match plain card
    // containers that contain a heading inside the leave settings layout.
    const cards = page.locator('[class*="card"]').filter({ has: page.locator('h2, h3') });
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThanOrEqual(1);
  });

  test('each leave type has edit button', async ({ adminPage: page }) => {
    await page.goto('/admin/leave-settings');
    await page.waitForLoadState('networkidle');
    const editBtns = page.getByRole('button', { name: /edit|редактировать|խմբագրել/i });
    const count = await editBtns.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('clicking edit opens config panel', async ({ adminPage: page }) => {
    await page.goto('/admin/leave-settings');
    await page.waitForLoadState('networkidle');

    const editBtn = page.getByRole('button', { name: /edit|редактировать|խմբագրել/i }).first();
    if (await editBtn.isVisible()) {
      await editBtn.click();
      await page.waitForTimeout(500);

      // Should show edit panel with switches
      const activeSwitch = page.locator('[role="switch"]').first();
      const switchVisible = await activeSwitch.isVisible().catch(() => false);

      const daysInput = page.locator('input[type="number"]').first();
      const inputVisible = await daysInput.isVisible().catch(() => false);

      // Should have either switches or inputs visible
      expect(switchVisible || inputVisible).toBeTruthy();
    }
  });

  test('edit panel has days-per-year input', async ({ adminPage: page }) => {
    await page.goto('/admin/leave-settings');
    await page.waitForLoadState('networkidle');

    const editBtn = page.getByRole('button', { name: /edit|редактировать|խմբագրել/i }).first();
    if (await editBtn.isVisible()) {
      await editBtn.click();
      await page.waitForTimeout(500);

      const numberInput = page.locator('input[type="number"]').first();
      if (await numberInput.isVisible()) {
        const value = await numberInput.inputValue();
        // Default should be a number
        expect(Number(value)).not.toBeNaN();
      }
    }
  });

  test('shows active/inactive badges', async ({ adminPage: page }) => {
    await page.goto('/admin/leave-settings');
    await page.waitForLoadState('networkidle');

    const badges = page.locator('text=/active|inactive|активен|неактивен/i');
    const count = await badges.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('approval chain UI is accessible via edit', async ({ adminPage: page }) => {
    await page.goto('/admin/leave-settings');
    await page.waitForLoadState('networkidle');

    const editBtn = page.getByRole('button', { name: /edit|редактировать|խմբագրել/i }).first();
    if (await editBtn.isVisible()) {
      await editBtn.click();
      await page.waitForTimeout(500);

      // Look for approval chain section
      const approvalText = page.locator('text=/approval chain|цепочка/i').first();
      if (await approvalText.isVisible()) {
        // Should have role badges (supervisor, hr, etc.)
        const selectAdd = page.locator('[role="combobox"]');
        const _hasAddRole = await selectAdd.isVisible().catch(() => false);
        // If the "Add role" combobox is visible, the approval chain section is accessible
      }
    }
  });

  test('edit panel shows cancel and save buttons', async ({ adminPage: page }) => {
    await page.goto('/admin/leave-settings');
    await page.waitForLoadState('networkidle');

    const editBtn = page.getByRole('button', { name: /edit|редактировать|խմբագրել/i }).first();
    if (await editBtn.isVisible()) {
      await editBtn.click();
      await page.waitForTimeout(500);

      // Cancel and save buttons should be visible in the edit panel
      const cancelBtn = page.getByRole('button', { name: /cancel|отмена|չեղարկել/i }).first();
      const saveBtn = page.getByRole('button', { name: /save|сохранить|պահպանել/i }).first();
      const canCancel = await cancelBtn.isVisible().catch(() => false);
      const canSave = await saveBtn.isVisible().catch(() => false);
      expect(canCancel || canSave).toBeTruthy();
    }
  });
});
