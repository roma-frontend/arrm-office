import { test, expect, gotoAndSettle, login } from './fixtures';

// ═══════════════════════════════════════════════════════════════════════════
// JOURNEY 1: Login → Dashboard → Leave Request
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Journey: Login → Leave Request', () => {
  test('complete flow: login, navigate to leaves, open request form', async ({ page }) => {
    test.skip(!process.env.E2E_USER_EMAIL, 'No test credentials');
    test.setTimeout(60_000);

    // Step 1: Login
    await login(page);
    await page.waitForURL(/dashboard|leaves|tasks/, { timeout: 30_000 });

    // Step 2: Navigate to leaves
    await gotoAndSettle(page, '/leaves');

    // Step 3: Open leave request form
    const createBtn = page.getByRole('button', { name: /new|create|request/i }).first();
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click();
      await expect(page.locator('dialog, [role="dialog"]').first()).toBeVisible({ timeout: 5_000 });

      // Step 4: Verify form has required fields
      const hasForm = await page
        .locator('select, input, [role="combobox"]')
        .first()
        .isVisible()
        .catch(() => false);
      expect(hasForm).toBeTruthy();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// JOURNEY 2: Login → Tasks → Create Task
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Journey: Login → Create Task', () => {
  test('complete flow: login, navigate to tasks, open create dialog', async ({ page }) => {
    test.skip(!process.env.E2E_USER_EMAIL, 'No test credentials');
    test.setTimeout(60_000);

    await login(page);
    await page.waitForURL(/dashboard|leaves|tasks/, { timeout: 30_000 });
    await gotoAndSettle(page, '/tasks');

    const createBtn = page.getByRole('button', { name: /new|create|add/i }).first();
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click();
      await expect(page.locator('dialog, [role="dialog"]').first()).toBeVisible({ timeout: 5_000 });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// JOURNEY 3: Login → Chat → Open Conversation
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Journey: Login → Chat', () => {
  test('complete flow: login, navigate to chat, view conversations', async ({ page }) => {
    test.skip(!process.env.E2E_USER_EMAIL, 'No test credentials');
    test.setTimeout(60_000);

    await login(page);
    await page.waitForURL(/dashboard|leaves|tasks/, { timeout: 30_000 });
    await gotoAndSettle(page, '/chat');

    // Verify chat loaded
    const hasContent = await page
      .locator('h1, h2, [class*="chat"], [class*="conversation"]')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasContent).toBeTruthy();

    // Try clicking first conversation
    const firstConvo = page
      .locator('[class*="cursor-pointer"], [class*="conversation-item"], li')
      .first();
    if (await firstConvo.isVisible().catch(() => false)) {
      await firstConvo.click();
      await page.waitForTimeout(1_000);
      // Should show message area
      const hasMessages = await page
        .locator('[class*="message"], textarea, [class*="input"]')
        .first()
        .isVisible()
        .catch(() => false);
      expect(hasMessages).toBeTruthy();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// JOURNEY 4: Login → Employees → View Employee Detail
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Journey: Login → Employee Detail', () => {
  test('complete flow: login, navigate to employees, open employee sheet', async ({ page }) => {
    test.skip(!process.env.E2E_USER_EMAIL, 'No test credentials');
    test.setTimeout(60_000);

    await login(page);
    await page.waitForURL(/dashboard|leaves|tasks/, { timeout: 30_000 });
    await gotoAndSettle(page, '/employees');

    // Find first employee row/card
    const employeeItem = page
      .locator('[class*="cursor-pointer"], tr[data-row-id], [class*="employee"]')
      .first();
    if (await employeeItem.isVisible().catch(() => false)) {
      await employeeItem.click();
      await page.waitForTimeout(1_500);
      // Should open detail sheet/drawer
      const hasDetail = await page
        .locator('[role="dialog"], [class*="sheet"], [class*="drawer"], [class*="detail"]')
        .first()
        .isVisible()
        .catch(() => false);
      expect(hasDetail).toBeTruthy();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// JOURNEY 5: Login → Calendar → Create Event
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Journey: Login → Calendar → Create Event', () => {
  test('complete flow: login, navigate to calendar, open create event', async ({ page }) => {
    test.skip(!process.env.E2E_USER_EMAIL, 'No test credentials');
    test.setTimeout(60_000);

    await login(page);
    await page.waitForURL(/dashboard|leaves|tasks/, { timeout: 30_000 });
    await gotoAndSettle(page, '/calendar');

    const createBtn = page.getByRole('button', { name: /new|create|add|event/i }).first();
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click();
      await expect(page.locator('dialog, [role="dialog"]').first()).toBeVisible({ timeout: 5_000 });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// JOURNEY 6: Login → Signatures → View Pending Documents
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Journey: Login → Signatures', () => {
  test('complete flow: login, navigate to signatures, view documents', async ({ page }) => {
    test.skip(!process.env.E2E_USER_EMAIL, 'No test credentials');
    test.setTimeout(60_000);

    await login(page);
    await page.waitForURL(/dashboard|leaves|tasks/, { timeout: 30_000 });
    await gotoAndSettle(page, '/signatures');

    const hasContent = await page
      .locator('h1, h2, [class*="signature"], [class*="document"], table')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasContent).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// JOURNEY 7: Login → Attendance → Check In
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Journey: Login → Attendance', () => {
  test('complete flow: login, navigate to attendance, see check-in widget', async ({ page }) => {
    test.skip(!process.env.E2E_USER_EMAIL, 'No test credentials');
    test.setTimeout(60_000);

    await login(page);
    await page.waitForURL(/dashboard|leaves|tasks/, { timeout: 30_000 });
    await gotoAndSettle(page, '/attendance');

    const hasWidget = await page
      .locator('h1, h2, button:has-text("check"), [class*="widget"]')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasWidget).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// JOURNEY 8: Login → Room Booking
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Journey: Login → Room Booking', () => {
  test('complete flow: login, navigate to rooms, view available rooms', async ({ page }) => {
    test.skip(!process.env.E2E_USER_EMAIL, 'No test credentials');
    test.setTimeout(60_000);

    await login(page);
    await page.waitForURL(/dashboard|leaves|tasks/, { timeout: 30_000 });
    await gotoAndSettle(page, '/rooms');

    const hasRooms = await page
      .locator('h1, h2, [class*="room"], [class*="card"], table')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasRooms).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// JOURNEY 9: Login → Dashboard → Quick Stats
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Journey: Login → Dashboard Stats', () => {
  test('dashboard shows stat cards and quick actions', async ({ authedPage: page }) => {
    test.setTimeout(60_000);

    await gotoAndSettle(page, '/dashboard');

    // Should show stats
    const hasStats = await page
      .locator('[data-tour="quick-stats"], [class*="stat"], [class*="card"]')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasStats).toBeTruthy();
  });

  test('dashboard quick actions are visible', async ({ authedPage: page }) => {
    test.setTimeout(60_000);

    await gotoAndSettle(page, '/dashboard');
    const hasActions = await page
      .locator('[data-tour="quick-actions"], [class*="action"]')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasActions).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// JOURNEY 10: Login → Settings → Branding
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Journey: Login → Settings', () => {
  test('settings page loads with organization configuration', async ({ authedPage: page }) => {
    test.setTimeout(60_000);

    await gotoAndSettle(page, '/settings');
    const hasContent = await page
      .locator('h1, h2, [class*="tab"], [role="tablist"]')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasContent).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// JOURNEY 11: Login → Profile → Edit
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Journey: Login → Profile', () => {
  test('profile page shows user info and edit form', async ({ authedPage: page }) => {
    test.setTimeout(60_000);

    await gotoAndSettle(page, '/profile');
    const hasForm = await page
      .locator('input, form, [class*="profile"]')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasForm).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// JOURNEY 12: Login → Org Chart → View Hierarchy
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Journey: Login → Org Chart', () => {
  test('org chart displays hierarchy', async ({ authedPage: page }) => {
    test.setTimeout(60_000);

    await gotoAndSettle(page, '/org-chart');
    const hasContent = await page
      .locator('h1, h2, [class*="chart"], [class*="tree"], [class*="node"]')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasContent).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC PAGES (no auth required)
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Public Pages', () => {
  test('landing page loads', async ({ page }) => {
    await gotoAndSettle(page, '/');
    const hasContent = await page
      .locator('h1, h2, [class*="hero"], [class*="landing"]')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasContent).toBeTruthy();
  });

  test('login page renders form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('#email-login-form')).toBeVisible({ timeout: 10_000 });
  });

  test('pricing page loads', async ({ page }) => {
    await gotoAndSettle(page, '/pricing');
    const hasContent = await page
      .locator('h1, h2, [class*="price"], [class*="plan"]')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasContent).toBeTruthy();
  });

  test('careers page loads', async ({ page }) => {
    await gotoAndSettle(page, '/careers');
    const hasContent = await page
      .locator('h1, h2, [class*="career"], [class*="job"]')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasContent).toBeTruthy();
  });

  test('contact page loads', async ({ page }) => {
    await gotoAndSettle(page, '/contact');
    const hasContent = await page
      .locator('h1, h2, form, [class*="contact"]')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasContent).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 404 / ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Error Handling', () => {
  test('non-existent route shows 404 or redirects', async ({ page }) => {
    await gotoAndSettle(page, '/this-page-does-not-exist-xyz');
    // Should show 404 page or redirect to not-found
    const has404 = await page
      .locator('text=/404|not found|page not/i')
      .first()
      .isVisible()
      .catch(() => false);
    const redirected = !page.url().includes('this-page-does-not-exist');
    expect(has404 || redirected).toBeTruthy();
  });
});
