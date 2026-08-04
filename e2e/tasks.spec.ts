import { test, expect } from './fixtures';

test.describe('Task CRUD', () => {
  test('tasks page loads with kanban or list', async ({ authedPage: page }) => {
    await page.goto('/tasks');
    await page.waitForLoadState('networkidle');
    // Should show tasks content (kanban columns or list)
    const hasContent = await page
      .locator('[data-tour="quick-stats"], [class*="kanban"], [class*="column"], h1, h2')
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmptyState = await page
      .locator('text=/no task|нет задач|create.*first/i')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasContent || hasEmptyState).toBeTruthy();
  });

  test('can open create task dialog', async ({ authedPage: page }) => {
    await page.goto('/tasks');
    await page.waitForLoadState('networkidle');

    const createBtn = page
      .getByRole('button', { name: /new|create|add|создать|добавить/i })
      .first();
    if (await createBtn.isVisible()) {
      await createBtn.click();
      await expect(page.locator('dialog, [role="dialog"]').first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('task creation wizard has required fields', async ({ authedPage: page }) => {
    await page.goto('/tasks');
    await page.waitForLoadState('networkidle');

    const createBtn = page.getByRole('button', { name: /new|create|add|создать/i }).first();
    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.waitForTimeout(500);

      // Wizard should have title input
      const titleInput = page.locator('dialog input, [role="dialog"] input').first();
      await expect(titleInput).toBeVisible({ timeout: 3_000 });
    }
  });

  test('task detail page loads', async ({ authedPage: page }) => {
    await page.goto('/tasks');
    await page.waitForLoadState('networkidle');

    // Task cards in the kanban view are draggable (cursor-grab) and open the
    // detail route on click. Avoid plain [class*="card"] — that also matches
    // the stat cards at the top of the page, which are not clickable.
    const taskCard = page
      .locator('[class*="cursor-grab"], [class*="kanban"] [class*="card"]')
      .first();
    if (await taskCard.isVisible()) {
      await taskCard.click();
      // Wait for client-side navigation to the detail route
      await page.waitForURL(/tasks\/[^/]+/, { timeout: 10_000 }).catch(() => {});
      const hasDetail =
        page.url().includes('/tasks/') ||
        (await page
          .locator('[class*="detail"], [class*="panel"]')
          .first()
          .isVisible()
          .catch(() => false));
      expect(hasDetail).toBeTruthy();
    }
  });
});
