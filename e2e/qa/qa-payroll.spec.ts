import { test, expect } from '../fixtures';

test.describe('QA: Payroll', () => {
  test('payroll main page renders', async ({ adminPage: page }) => {
    await page.goto('/payroll');
    await expect(page.locator('h1, h2, [class*="card"]').first()).toBeVisible({
      timeout: 25_000,
    });
    const text = await page.locator('body').innerText();
    expect(text.trim().length).toBeGreaterThan(30);
  });

  test('payroll runs page renders', async ({ adminPage: page }) => {
    await page.goto('/payroll/runs');
    await expect(page.locator('h1, h2, [class*="card"], main').first()).toBeVisible({
      timeout: 25_000,
    });
  });

  test('travel allowance setting round-trips (enable → save → persist → restore)', async ({
    adminPage: page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));

    await page.goto('/payroll/settings');
    const switchEl = page.locator('#travel-allowance-enabled');
    await switchEl.waitFor({ state: 'visible', timeout: 30_000 });

    const initialState = (await switchEl.getAttribute('data-state')) ?? 'unchecked';

    // Ensure it is enabled and set explicit amounts.
    if (initialState !== 'checked') {
      await switchEl.click();
      await page.waitForTimeout(400);
    }
    const staffInput = page.locator('#travel-allowance-staff');
    const contractorInput = page.locator('#travel-allowance-contractor');
    await staffInput.waitFor({ state: 'visible', timeout: 5_000 });
    await staffInput.fill('20000');
    await contractorInput.fill('12000');

    // Save and wait for confirmation.
    await page.getByRole('button', { name: /save|сохранить|хранить/i }).click();
    await page.waitForTimeout(2_500);

    // Reload: values must persist.
    await page.reload();
    await switchEl.waitFor({ state: 'visible', timeout: 30_000 });
    expect(await switchEl.getAttribute('data-state')).toBe('checked');
    await page.locator('#travel-allowance-staff').waitFor({ state: 'visible', timeout: 10_000 });
    expect(await page.locator('#travel-allowance-staff').inputValue()).toBe('20000');
    expect(await page.locator('#travel-allowance-contractor').inputValue()).toBe('12000');

    // Restore original state so the test org is not left modified.
    if (initialState !== 'checked') {
      await switchEl.click();
      await page.waitForTimeout(300);
    }
    await page.getByRole('button', { name: /save|сохранить|хранить/i }).click();
    await page.waitForTimeout(2_500);

    // Confirm restore persisted.
    await page.reload();
    await switchEl.waitFor({ state: 'visible', timeout: 30_000 });
    expect(await switchEl.getAttribute('data-state')).toBe(initialState);

    expect(pageErrors).toEqual([]);
  });
});
