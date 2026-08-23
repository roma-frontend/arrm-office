import { test, expect, gotoAndSettle } from './fixtures';

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

/**
 * The Table view and its saved views.
 *
 * A saved view is the feature these tests are really about: the board state
 * (mode, grouping, filters, columns) stored under a name and reopened later.
 * Round-tripping it through a real backend is the only place that gets checked —
 * `taskViewState.test.ts` covers the encoding, but not that Convex stores the
 * blob and hands the same board back.
 *
 * The tolerant `isVisible()` guards match the rest of this file: these run
 * against a seeded deployment whose task list may be empty, and an empty board
 * is a legitimate state rather than a failure.
 */
test.describe('Table view and saved views', () => {
  test('table view renders the grid', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/tasks?view=table');

    const grid = page.getByRole('grid').first();
    const hasGrid = await grid.isVisible().catch(() => false);
    const hasEmptyState = await page
      .locator('text=/no task|нет задач|create.*first/i')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasGrid || hasEmptyState).toBeTruthy();
  });

  test('saves the current board under a name and reopens it', async ({ authedPage: page }) => {
    // Grouped by status and narrowed to one priority: enough state that getting
    // it back proves the whole blob round-tripped, not just the view mode.
    await gotoAndSettle(page, '/tasks?view=table&group=status&priority=high');

    const name = `E2E view ${Date.now()}`;
    const addView = page.getByRole('button', { name: /^\+?\s*(view|вид)$/i }).first();
    if (!(await addView.isVisible().catch(() => false))) {
      test.skip(true, 'Saved-view strip not available for this account');
      return;
    }

    await addView.click();
    const nameInput = page.getByLabel(/view name|название вида/i).first();
    await nameInput.waitFor({ state: 'visible', timeout: 5_000 });
    await nameInput.fill(name);
    await page.getByRole('button', { name: /save view|сохранить вид/i }).click();

    // The new tab appears and is selected — the view id lands in the URL so the
    // link is shareable.
    // `exact: false` — the tab's accessible name also carries the unsaved dot.
    const tab = page.getByRole('button', { name, exact: false }).first();
    await expect(tab).toBeVisible({ timeout: 10_000 });

    // Leave the view, then come back to it: the board must be restored from
    // storage rather than from whatever the URL happened to keep.
    await page
      .getByRole('button', { name: /all tasks|все задачи/i })
      .first()
      .click();
    await page.waitForTimeout(500);
    await tab.click();
    await page.waitForTimeout(1_000);

    const url = page.url();
    expect(url).toContain('view=table');
    expect(url).toContain('group=status');
    expect(url).toContain('priority=high');

    // Best-effort cleanup so repeat runs do not pile views up on the account.
    await tab.hover().catch(() => {});
    const menu = page.getByRole('button', { name: /view options|параметры вида/i }).first();
    if (await menu.isVisible().catch(() => false)) {
      await menu.click().catch(() => {});
      await page
        .getByRole('button', { name: /^(delete|удалить)/i })
        .first()
        .click()
        .catch(() => {});
    }
  });
});
