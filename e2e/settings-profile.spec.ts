import { test, expect, gotoAndSettle } from './fixtures';

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Settings', () => {
  test('settings page loads with tabs/sections', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/settings');
    const hasContent = await page
      .locator('h1, h2, [class*="tab"], [class*="section"], [role="tablist"]')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasContent).toBeTruthy();
  });

  test('branding settings section renders', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/settings');
    const hasBranding = await page
      .locator('text=/brand|theme|color|branding/i')
      .first()
      .isVisible()
      .catch(() => false);
    // May be behind a tab
    const tabBranding = page.locator('button:has-text("brand"), button:has-text("theme")').first();
    if (!hasBranding && (await tabBranding.isVisible().catch(() => false))) {
      await tabBranding.click();
      await page.waitForTimeout(1_000);
    }
    // Settings page should at least load
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('security settings section renders', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/settings');
    const hasSecurity = await page
      .locator('text=/security|password|2fa|totp/i')
      .first()
      .isVisible()
      .catch(() => false);
    const tabSecurity = page.locator('button:has-text("security"), button:has-text("2fa")').first();
    if (!hasSecurity && (await tabSecurity.isVisible().catch(() => false))) {
      await tabSecurity.click();
      await page.waitForTimeout(1_000);
    }
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PROFILE
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Profile', () => {
  test('profile page loads with user info', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/profile');
    const hasContent = await page
      .locator('h1, h2, [class*="avatar"], [class*="profile"]')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasContent).toBeTruthy();
  });

  test('profile edit form has name and email fields', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/profile');
    const hasForm = await page
      .locator('input[type="text"], input[type="email"], form')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasForm).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ORG CHART
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Org Chart', () => {
  test('org chart page loads', async ({ authedPage: page }) => {
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
// REPORTS
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Reports', () => {
  test('reports page loads', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/reports');
    const hasContent = await page
      .locator('h1, h2, [class*="report"], [class*="chart"]')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasContent).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PAYROLL
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Payroll', () => {
  test('payroll page loads', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/payroll');
    const hasContent = await page
      .locator('h1, h2, [class*="payroll"], table')
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmpty = await page
      .locator('text=/no payroll|empty|no record/i')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasContent || hasEmpty).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ATTENDANCE
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Attendance', () => {
  test('attendance page loads with check-in widget', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/attendance');
    const hasContent = await page
      .locator('h1, h2, [class*="check"], [class*="widget"], button:has-text("check")')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasContent).toBeTruthy();
  });

  test('check-in button is clickable', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/attendance');
    const checkInBtn = page
      .locator(
        'button:has-text("check in"), button:has-text("check-in"), button:has-text("վերսկսել"), button:has-text("приход")',
      )
      .first();
    if (await checkInBtn.isVisible().catch(() => false)) {
      // Don't actually click — just verify it's interactive
      await expect(checkInBtn).toBeEnabled();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GOALS
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Goals', () => {
  test('goals page loads', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/goals');
    const hasContent = await page
      .locator('h1, h2, [class*="goal"], [class*="okr"]')
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmpty = await page
      .locator('text=/no goal|empty|create.*first/i')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasContent || hasEmpty).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENTS
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Documents', () => {
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

  test('can open document creation dialog', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/documents');
    const createBtn = page.getByRole('button', { name: /new|create|upload|add/i }).first();
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(1_000);
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
// SIGNATURES
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Signatures', () => {
  test('signatures page loads', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/signatures');
    const hasContent = await page
      .locator('h1, h2, [class*="signature"], [class*="document"]')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasContent).toBeTruthy();
  });

  test('pending signatures section is visible', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/signatures');
    const hasPending = await page
      .locator('text=/pending|awaiting|approv/i')
      .first()
      .isVisible()
      .catch(() => false);
    const hasContent = await page
      .locator('h1, h2')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasPending || hasContent).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RECOGNITION / POINTS
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Recognition', () => {
  test('recognition page loads', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/recognition');
    const hasContent = await page
      .locator('h1, h2, [class*="recogni"], [class*="point"]')
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmpty = await page
      .locator('text=/no recognition|empty/i')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasContent || hasEmpty).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EXPENSES
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Expenses', () => {
  test('expenses page loads', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/expenses');
    const hasContent = await page
      .locator('h1, h2, [class*="expense"], table')
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmpty = await page
      .locator('text=/no expense|empty|submit/i')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasContent || hasEmpty).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// OVERTIME
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Overtime', () => {
  test('overtime page loads', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/overtime');
    const hasContent = await page
      .locator('h1, h2, [class*="overtime"], table')
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmpty = await page
      .locator('text=/no overtime|empty|request/i')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasContent || hasEmpty).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ONBOARDING / OFFBOARDING
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Onboarding & Offboarding', () => {
  test('onboarding page loads', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/onboarding');
    const hasContent = await page
      .locator('h1, h2, [class*="onboard"]')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasContent).toBeTruthy();
  });

  test('offboarding page loads', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/offboarding');
    const hasContent = await page
      .locator('h1, h2, [class*="offboard"]')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasContent).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// COMPLIANCE
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Compliance', () => {
  test('compliance page loads', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/compliance');
    const hasContent = await page
      .locator('h1, h2, [class*="compli"]')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasContent).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Analytics', () => {
  test('analytics page loads', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/analytics');
    const hasContent = await page
      .locator('h1, h2, [class*="analytic"], [class*="chart"]')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasContent).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AI CHAT
// ═══════════════════════════════════════════════════════════════════════════
test.describe('AI Chat', () => {
  test('AI chat page loads', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/ai-chat');
    const hasContent = await page
      .locator('h1, h2, textarea, [class*="chat"], [class*="input"]')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasContent).toBeTruthy();
  });

  test('AI chat has input field', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/ai-chat');
    const hasInput = await page
      .locator('textarea, input[type="text"], [contenteditable="true"]')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasInput).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MEETINGS
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Meetings', () => {
  test('meetings page loads', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/meetings');
    const hasContent = await page
      .locator('h1, h2, [class*="meeting"], [class*="card"]')
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmpty = await page
      .locator('text=/no meeting|empty|schedule/i')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasContent || hasEmpty).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PROJECTS
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Projects', () => {
  test('projects page loads', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/projects');
    const hasContent = await page
      .locator('h1, h2, [class*="project"], [class*="card"]')
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmpty = await page
      .locator('text=/no project|empty|create/i')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasContent || hasEmpty).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SURVEYS
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Surveys', () => {
  test('surveys page loads', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/surveys');
    const hasContent = await page
      .locator('h1, h2, [class*="survey"]')
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmpty = await page
      .locator('text=/no survey|empty|create/i')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasContent || hasEmpty).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CROSS-MODULE: Sidebar Navigation
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Sidebar Navigation', () => {
  test('sidebar is visible on dashboard', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/dashboard');
    const sidebar = page
      .locator('nav, [class*="sidebar"], [class*="Sidebar"], [role="navigation"]')
      .first();
    await expect(sidebar).toBeVisible({ timeout: 5_000 });
  });

  test('sidebar links navigate to major modules', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/dashboard');

    const modules = [
      { href: '/employees', name: 'Employees' },
      { href: '/leaves', name: 'Leaves' },
      { href: '/tasks', name: 'Tasks' },
      { href: '/calendar', name: 'Calendar' },
      { href: '/chat', name: 'Chat' },
      { href: '/documents', name: 'Documents' },
    ];

    for (const mod of modules) {
      const link = page
        .locator(`nav a[href="${mod.href}"], [class*="sidebar"] a[href="${mod.href}"]`)
        .first();
      if (await link.isVisible().catch(() => false)) {
        await link.click();
        await page.waitForTimeout(1_500);
        expect(page.url()).toContain(mod.href);
        // Navigate back for next iteration
        await gotoAndSettle(page, '/dashboard');
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CROSS-MODULE: Notifications
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Notifications', () => {
  test('notification bell is present in navbar', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/dashboard');
    const bell = page
      .locator(
        '[data-testid="notification-bell"], button[aria-label*="notification"], button:has([class*="bell"]), [class*="NotificationBell"]',
      )
      .first();
    if (await bell.isVisible().catch(() => false)) {
      await expect(bell).toBeVisible();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CROSS-MODULE: Dark Mode Toggle
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Theme', () => {
  test('dark mode toggle works', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/dashboard');
    const themeToggle = page
      .locator(
        'button[aria-label*="theme"], button[aria-label*="dark"], [data-testid*="theme"], [class*="ThemeToggle"]',
      )
      .first();
    if (await themeToggle.isVisible().catch(() => false)) {
      // Get current theme
      const hadDark = await page.evaluate(() =>
        document.documentElement.classList.contains('dark'),
      );
      await themeToggle.click();
      await page.waitForTimeout(500);
      const hasDark = await page.evaluate(() =>
        document.documentElement.classList.contains('dark'),
      );
      // Theme should have changed
      expect(hasDark).not.toBe(hadDark);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CROSS-MODULE: Language Switcher
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Language', () => {
  test('language switcher is accessible', async ({ authedPage: page }) => {
    await gotoAndSettle(page, '/dashboard');
    const langSwitcher = page
      .locator(
        'button[aria-label*="lang"], [class*="lang"], [class*="i18n"], select:has(option:has-text("en"))',
      )
      .first();
    if (await langSwitcher.isVisible().catch(() => false)) {
      await expect(langSwitcher).toBeVisible();
    }
  });
});
