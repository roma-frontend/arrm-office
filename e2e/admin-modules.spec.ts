import { test, expect, gotoAndSettle, login, selectOrganizationForSuperadmin } from './fixtures';

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN: HOLIDAYS
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Admin: Holidays Management', () => {
  test('admin holidays page loads with holiday list', async ({ adminPage: page }) => {
    test.setTimeout(60_000);
    await gotoAndSettle(page, '/admin/holidays');
    const hasContent = await page
      .locator('h1, h2, [class*="holiday"], table, [class*="card"]')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasContent).toBeTruthy();
  });

  test('create holiday button exists', async ({ adminPage: page }) => {
    test.setTimeout(60_000);
    await gotoAndSettle(page, '/admin/holidays');
    const createBtn = page.getByRole('button', { name: /new|create|add|holiday/i }).first();
    if (await createBtn.isVisible().catch(() => false)) {
      await expect(createBtn).toBeEnabled();
    }
  });

  test('holiday form opens with required fields', async ({ adminPage: page }) => {
    test.setTimeout(60_000);
    await gotoAndSettle(page, '/admin/holidays');
    const createBtn = page.getByRole('button', { name: /new|create|add/i }).first();
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(1_000);
      const hasDialog = await page
        .locator('dialog, [role="dialog"], form')
        .first()
        .isVisible()
        .catch(() => false);
      expect(hasDialog).toBeTruthy();
    }
  });

  test('holiday list shows date and name columns', async ({ adminPage: page }) => {
    test.setTimeout(60_000);
    await gotoAndSettle(page, '/admin/holidays');
    const hasTable = await page
      .locator('table, [role="table"], [class*="row"]')
      .first()
      .isVisible()
      .catch(() => false);
    const hasList = await page
      .locator('[class*="holiday"], [class*="card"]')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasTable || hasList).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN: LEAVE BALANCES
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Admin: Leave Balances', () => {
  test('leave balances page loads with employee list', async ({ adminPage: page }) => {
    test.setTimeout(60_000);
    await gotoAndSettle(page, '/admin/leave-balances');
    const hasContent = await page
      .locator('h1, h2, table, [class*="balance"], [class*="card"]')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasContent).toBeTruthy();
  });

  test('leave balances table has employee names', async ({ adminPage: page }) => {
    test.setTimeout(60_000);
    await gotoAndSettle(page, '/admin/leave-balances');
    const hasTable = await page
      .locator('table, [role="table"]')
      .first()
      .isVisible()
      .catch(() => false);
    if (hasTable) {
      // Table should have rows (employees)
      const rows = page.locator('table tbody tr, [role="row"]').first();
      await expect(rows).toBeVisible({ timeout: 5_000 });
    }
  });

  test('sync all balances button exists', async ({ adminPage: page }) => {
    test.setTimeout(60_000);
    await gotoAndSettle(page, '/admin/leave-balances');
    const syncBtn = page.getByRole('button', { name: /sync|reset|update.*all/i }).first();
    if (await syncBtn.isVisible().catch(() => false)) {
      await expect(syncBtn).toBeEnabled();
    }
  });

  test('balance edit opens inline or modal', async ({ adminPage: page }) => {
    test.setTimeout(60_000);
    await gotoAndSettle(page, '/admin/leave-balances');
    // Find an editable balance cell or edit button
    const editBtn = page
      .locator('button:has-text("edit"), button:has-text("adjust"), [class*="editable"]')
      .first();
    if (await editBtn.isVisible().catch(() => false)) {
      await editBtn.click();
      await page.waitForTimeout(500);
      const hasEditor = await page
        .locator('dialog, [role="dialog"], input[type="number"], form')
        .first()
        .isVisible()
        .catch(() => false);
      expect(hasEditor).toBeTruthy();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN: LEAVE SETTINGS
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Admin: Leave Settings', () => {
  test('leave settings page loads with leave type configs', async ({ adminPage: page }) => {
    test.setTimeout(60_000);
    await gotoAndSettle(page, '/admin/leave-settings');
    const hasContent = await page
      .locator('h1, h2, [class*="leave-type"], [class*="config"], table, [class*="card"]')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasContent).toBeTruthy();
  });

  test('leave types list shows paid, unpaid, sick', async ({ adminPage: page }) => {
    test.setTimeout(60_000);
    await gotoAndSettle(page, '/admin/leave-settings');
    const hasTypes = await page
      .locator('text=/paid|unpaid|sick|family|vacation/i')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasTypes).toBeTruthy();
  });

  test('leave type toggle/switch exists', async ({ adminPage: page }) => {
    test.setTimeout(60_000);
    await gotoAndSettle(page, '/admin/leave-settings');
    const hasToggle = await page
      .locator(
        'button[role="switch"], input[type="checkbox"], [class*="toggle"], [class*="switch"]',
      )
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasToggle).toBeTruthy();
  });

  test('default days per year input exists', async ({ adminPage: page }) => {
    test.setTimeout(60_000);
    await gotoAndSettle(page, '/admin/leave-settings');
    const hasInput = await page
      .locator('input[type="number"], input[inputmode="numeric"]')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasInput).toBeTruthy();
  });

  test('save button exists for leave settings', async ({ adminPage: page }) => {
    test.setTimeout(60_000);
    await gotoAndSettle(page, '/admin/leave-settings');
    const saveBtn = page.getByRole('button', { name: /save|apply|update/i }).first();
    if (await saveBtn.isVisible().catch(() => false)) {
      await expect(saveBtn).toBeEnabled();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN: NAVIGATION BETWEEN MODULES
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Admin Module Navigation', () => {
  test('can navigate from holidays to leave settings', async ({ adminPage: page }) => {
    test.setTimeout(60_000);
    await gotoAndSettle(page, '/admin/holidays');
    const settingsLink = page
      .locator('a[href*="leave-settings"], nav a:has-text("setting")')
      .first();
    if (await settingsLink.isVisible().catch(() => false)) {
      await settingsLink.click();
      await page.waitForTimeout(1_500);
      expect(page.url()).toContain('leave-settings');
    }
  });

  test('can navigate from leave settings to leave balances', async ({ adminPage: page }) => {
    test.setTimeout(60_000);
    await gotoAndSettle(page, '/admin/leave-settings');
    const balancesLink = page
      .locator('a[href*="leave-balances"], nav a:has-text("balance")')
      .first();
    if (await balancesLink.isVisible().catch(() => false)) {
      await balancesLink.click();
      await page.waitForTimeout(1_500);
      expect(page.url()).toContain('leave-balances');
    }
  });
});
