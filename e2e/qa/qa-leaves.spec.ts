import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';

// Anchored regexes — dev-mode's "Open Next.js Dev Tools" button would match an
// unanchored /next/i.
const NEXT = /^next$|^далее$|^продолжить$/i;

/**
 * ISO date N days from today, built from LOCAL date components (the wizard's
 * date inputs have min=today). toISOString() would shift the date back a day
 * for UTC+ timezones near midnight and split('T')[0] is `string | undefined`
 * under noUncheckedIndexedAccess.
 */
function isoDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Full wizard flow for a superadmin: employee → type → dates → details.
 * Creates a unique leave request and waits for the modal to close.
 */
async function createLeaveRequest(page: Page, reason: string) {
  await page.goto('/leaves');
  await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 25_000 });
  await page.waitForTimeout(2_000);

  await page
    .getByRole('button', { name: /new request|новая заявка|новый запрос/i })
    .first()
    .click();

  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible', timeout: 10_000 });

  // Step 1: employee (superadmins get this step; list comes from the org the
  // adminPage fixture selected). Pick the first member.
  const empCombo = dialog.locator('[role="combobox"]').first();
  await empCombo.waitFor({ state: 'visible', timeout: 10_000 });
  await empCombo.click();
  const empOptions = page.locator('[role="option"]');
  expect(await empOptions.count(), 'employee list must not be empty').toBeGreaterThan(0);
  await empOptions.first().click();
  await dialog.getByRole('button', { name: NEXT }).click();

  // Step 2: leave type — Paid Leave.
  await page.waitForTimeout(500);
  await dialog.getByRole('button', { name: /^paid leave|^оплачиваемый/i }).click();
  await dialog.getByRole('button', { name: NEXT }).click();

  // Step 3: dates — tomorrow → day after.
  await page.waitForTimeout(500);
  const dateInputs = dialog.locator('input[type="date"]');
  await dateInputs.nth(0).fill(isoDate(1));
  await dateInputs.nth(1).fill(isoDate(2));
  await dialog.getByRole('button', { name: NEXT }).click();

  // Step 4: reason (required) + submit.
  await page.waitForTimeout(500);
  await dialog.locator('textarea').first().fill(reason);
  await dialog.getByRole('button', { name: /submit request|отправить заявку/i }).click();
  await page.waitForTimeout(2_500);
}

/** Search the leaves table by reason and return the matching row. */
async function findLeaveRow(page: Page, reason: string) {
  await page.locator('main input').first().fill(reason);
  await page.waitForTimeout(1_500);
  return page.locator('tbody tr').filter({ hasText: reason });
}

/** Open the request's detail page and delete (cancel) it from there. */
async function deleteLeaveFromDetail(page: Page, reason: string) {
  const row = await findLeaveRow(page, reason);
  await expect(row.first()).toBeVisible({ timeout: 20_000 });
  // Row cells navigate to /leaves/[id] via SPA pushState — wait on the pathname.
  await row.locator('td').first().click();
  await page.waitForFunction(() => /\/leaves\/[^/]+$/.test(window.location.pathname), undefined, {
    timeout: 15_000,
  });
  await page.waitForTimeout(1_500);
  const deleteBtn = page.locator('button:has(svg.lucide-trash-2)').first();
  await deleteBtn.click();
  await page.waitForFunction(() => window.location.pathname === '/leaves', undefined, {
    timeout: 15_000,
  });
  await page.waitForTimeout(1_500);
}

test.describe('QA: Leaves lifecycle', () => {
  test('create leave request via wizard and see Pending in the list', async ({
    adminPage: page,
  }) => {
    test.setTimeout(180_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));

    const reason = `QA Leave ${Date.now()}`;
    await createLeaveRequest(page, reason);

    const row = await findLeaveRow(page, reason);
    await expect(row.first()).toBeVisible({ timeout: 20_000 });
    await expect(row.first()).toContainText(/pending|ожидает/i);
    await expect(row.first()).toContainText(/paid|оплачиваемый/i);

    expect(pageErrors).toEqual([]);
  });

  test('approve a pending leave via superadmin bulk actions', async ({ adminPage: page }) => {
    test.setTimeout(240_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));

    const reason = `QA Approve ${Date.now()}`;
    await createLeaveRequest(page, reason);

    // Bulk actions: superadmins approve pending leaves from here.
    await page.goto('/superadmin/bulk-actions');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 25_000 });
    const card = page.locator('div.p-4').filter({ hasText: reason }).first();
    await card.waitFor({ state: 'visible', timeout: 20_000 });
    await card.click();
    await page.getByRole('button', { name: /approve selected|одобрить выбранн/i }).click();

    const approveDialog = page.getByRole('dialog');
    await approveDialog.waitFor({ state: 'visible', timeout: 10_000 });
    await approveDialog
      .getByRole('button', { name: /approve\s+\d+\s+requests|одобрить\s+\d+/i })
      .click();
    await page.waitForTimeout(3_000);

    // The request must now show as Approved in the leaves table.
    await page.goto('/leaves');
    const row = await findLeaveRow(page, reason);
    await expect(row.first()).toBeVisible({ timeout: 20_000 });
    await expect(row.first()).toContainText(/approved|одобр/i);

    // Cleanup: remove the approved request so repeated runs don't pile up data.
    await deleteLeaveFromDetail(page, reason);
    await page.locator('main input').first().fill(reason);
    await page.waitForTimeout(1_500);
    await expect(page.locator('tbody tr').filter({ hasText: reason })).toHaveCount(0);

    expect(pageErrors).toEqual([]);
  });

  test('cancel a leave request from its detail page', async ({ adminPage: page }) => {
    test.setTimeout(180_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));

    const reason = `QA Cancel ${Date.now()}`;
    await createLeaveRequest(page, reason);

    await deleteLeaveFromDetail(page, reason);

    // After the delete the request must be gone from the list.
    await page.locator('main input').first().fill(reason);
    await page.waitForTimeout(1_500);
    await expect(page.locator('tbody tr').filter({ hasText: reason })).toHaveCount(0);

    expect(pageErrors).toEqual([]);
  });
});
