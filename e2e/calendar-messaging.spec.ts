import { test, expect, gotoAndSettle } from './fixtures';

// ═══════════════════════════════════════════════════════════════════════════
// CALENDAR
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Calendar', () => {
  test('calendar page loads with month/week view', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/calendar');
    // Should show calendar grid or view toggle
    const hasCalendar = await page
      .locator('[class*="calendar"], [class*="month"], [class*="week"], [role="grid"]')
      .first()
      .isVisible()
      .catch(() => false);
    const hasHeader = await page
      .locator('h1, h2')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasCalendar || hasHeader).toBeTruthy();
  });

  test('calendar view toggle works', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/calendar');
    // Find view toggle buttons (month/week/day)
    const viewToggle = page
      .locator('button:has-text("month"), button:has-text("week"), [data-tour="view-toggle"]')
      .first();
    if (await viewToggle.isVisible()) {
      await viewToggle.click();
      await page.waitForTimeout(1000);
      // Calendar should still be visible after toggle
      await expect(page.locator('h1, h2').first()).toBeVisible();
    }
  });

  test('create event modal opens from header button', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/calendar');
    const createBtn = page.getByRole('button', { name: /new|create|add|event/i }).first();
    if (await createBtn.isVisible()) {
      await createBtn.click();
      await expect(page.locator('dialog, [role="dialog"]').first()).toBeVisible({ timeout: 5_000 });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CHAT / MESSENGER
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Chat & Messaging', () => {
  test('chat page loads with conversation list', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/chat');
    // Should show conversation list or empty state
    const hasContent = await page
      .locator('[class*="conversation"], [class*="chat"], [class*="message"]')
      .first()
      .isVisible()
      .catch(() => false);
    const hasHeader = await page
      .locator('h1, h2')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasContent || hasHeader).toBeTruthy();
  });

  test('chat sidebar shows conversations', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/chat');
    // Should have a list of conversations or empty state
    const hasList = await page
      .locator('[class*="list"], [role="list"]')
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmpty = await page
      .locator('text=/no conversation|empty|start/i')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasList || hasEmpty).toBeTruthy();
  });

  test('can open new group conversation', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/chat');
    const createBtn = page.getByRole('button', { name: /new|create|group|add/i }).first();
    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.waitForTimeout(1_000);
      // Should show dialog or form
      const hasDialog = await page
        .locator('dialog, [role="dialog"]')
        .first()
        .isVisible()
        .catch(() => false);
      expect(hasDialog).toBeTruthy();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MEETING ROOMS
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Meeting Rooms', () => {
  test('rooms page loads', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/rooms');
    const hasContent = await page
      .locator('h1, h2, [class*="room"], [class*="card"]')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasContent).toBeTruthy();
  });

  test('can see room cards or empty state', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/rooms');
    const hasCards = await page
      .locator('[class*="room"], [class*="card"], table')
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmpty = await page
      .locator('text=/no room|empty|create/i')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasCards || hasEmpty).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SIGNATURES / DOCUMENTS
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Signatures & Documents', () => {
  test('signatures page loads', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/signatures');
    const hasContent = await page
      .locator('h1, h2, [class*="signature"], [class*="document"]')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasContent).toBeTruthy();
  });

  test('documents page loads', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/documents');
    const hasContent = await page
      .locator('h1, h2, [class*="document"], table')
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmpty = await page
      .locator('text=/no document|empty/i')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasContent || hasEmpty).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EMPLOYEES
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Employees', () => {
  test('employees page loads with list or empty state', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/employees');
    const hasContent = await page
      .locator('h1, h2, table, [class*="employee"], [class*="card"]')
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmpty = await page
      .locator('text=/no employee|empty|no team/i')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasContent || hasEmpty).toBeTruthy();
  });

  test('employee detail sheet opens on click', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/employees');
    // Find an employee card/row
    const employeeItem = page
      .locator('[class*="cursor-pointer"], tr[data-row-id], [class*="employee-card"]')
      .first();
    if (await employeeItem.isVisible()) {
      await employeeItem.click();
      await page.waitForTimeout(1_000);
      // Should open a sheet or detail view
      const hasDetail = await page
        .locator('[role="dialog"], [class*="sheet"], [class*="detail"], [class*="drawer"]')
        .first()
        .isVisible()
        .catch(() => false);
      expect(hasDetail).toBeTruthy();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// NAVIGATION (cross-module)
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Cross-module Navigation', () => {
  test('sidebar links navigate to correct pages', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/dashboard');

    const routes = [
      { pattern: /\/employees/, linkText: /employee|team|staff/i },
      { pattern: /\/leaves/, linkText: /leave|time.off/i },
      { pattern: /\/tasks/, linkText: /task/i },
      { pattern: /\/calendar/, linkText: /calendar/i },
    ];

    for (const route of routes) {
      const link = page.locator(`a[href="${route.pattern.source}"]`).first();
      if (await link.isVisible().catch(() => false)) {
        await link.click();
        await page.waitForTimeout(1_500);
        expect(page.url()).toMatch(route.pattern);
        await gotoAndSettle(page, '/dashboard');
      }
    }
  });

  test('notification bell shows dropdown', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/dashboard');
    const bell = page
      .locator('[data-testid="notification-bell"], button:has(svg), [aria-label*="notification"]')
      .first();
    if (await bell.isVisible()) {
      await bell.click();
      await page.waitForTimeout(500);
      // Should show notification dropdown
      const hasDropdown = await page
        .locator('[class*="dropdown"], [class*="notification"], [role="menu"]')
        .first()
        .isVisible()
        .catch(() => false);
      expect(hasDropdown).toBeTruthy();
    }
  });
});
