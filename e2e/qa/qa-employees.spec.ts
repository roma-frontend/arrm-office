import { test, expect } from '../fixtures';

// Anchored regexes: dev-mode adds an "Open Next.js Dev Tools" button whose
// name contains "Next" — unanchored /next/i would match it too.
const NEXT = /^next$|^далее$|^продолжить$/i;
const SAVE = /^save$|^сохранить$/i;

test.describe('QA: Employees module', () => {
  test('list renders, search filters, profile opens', async ({ adminPage: page }) => {
    await page.goto('/employees');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 25_000 });
    await page.waitForTimeout(3_000);

    // The first h3 on the page is the "💡 Employee Management" info banner, so
    // collect the actual employee names by excluding it.
    const allH3 = await page.locator('main h3').allInnerTexts();
    const employeeNames = allH3.filter(
      (h) => !/employee management|управление сотрудниками/i.test(h.trim()),
    );

    if (employeeNames.length > 0) {
      const firstName = employeeNames[0]!.trim();
      expect(firstName.length).toBeGreaterThan(0);

      // Search by the first employee's name — only that employee should remain.
      await page.locator('main input').first().fill(firstName);
      await page.waitForTimeout(1_500);
      await expect(page.locator('main h3').filter({ hasText: firstName }).first()).toBeVisible({
        timeout: 10_000,
      });

      // Open the profile via the card. Navigation is an SPA pushState (the card
      // calls router.push), which never fires a 'load' event — wait on the
      // pathname instead of waitForURL with its default waitUntil.
      await page.locator('main h3').filter({ hasText: firstName }).first().click();
      await page.waitForFunction(
        () => window.location.pathname.startsWith('/employees/'),
        undefined,
        { timeout: 15_000 },
      );
      await page.waitForTimeout(2_000);
      const body = await page.locator('body').innerText();
      expect(body.trim().length).toBeGreaterThan(50);
    } else {
      // No employees: the empty state must still render properly.
      const empty = await page.locator('text=/no employees|нет сотрудников/i').count();
      expect(empty).toBeGreaterThan(0);
    }
  });

  test('create department via wizard', async ({ adminPage: page }) => {
    const deptName = `QA-Dept-${Date.now()}`;
    await page.goto('/employees/departments');
    await page
      .getByRole('button', { name: /^add$|^добавить$/i })
      .first()
      .click();

    const dialog = page.getByRole('dialog');
    const nameInput = dialog.locator('input[type="text"]').first();
    await nameInput.waitFor({ state: 'visible', timeout: 10_000 });
    await nameInput.fill(deptName);
    // appearance → review; nothing required beyond the name.
    await dialog.getByRole('button', { name: NEXT }).click();
    await page.waitForTimeout(400);
    await dialog.getByRole('button', { name: NEXT }).click();
    await page.waitForTimeout(400);
    await dialog.getByRole('button', { name: /^create department$|^создать отдел$/i }).click();

    await expect(page.getByText(deptName).first()).toBeVisible({ timeout: 20_000 });
  });

  test('create position via wizard', async ({ adminPage: page }) => {
    const posName = `QA-Pos-${Date.now()}`;
    await page.goto('/employees/positions');
    await page
      .getByRole('button', { name: /^add$|^добавить$/i })
      .first()
      .click();

    const dialog = page.getByRole('dialog');
    const nameInput = dialog.locator('input[type="text"]').first();
    await nameInput.waitFor({ state: 'visible', timeout: 10_000 });
    await nameInput.fill(posName);
    // classification → compensation → review; only the title is required.
    await dialog.getByRole('button', { name: NEXT }).click();
    await page.waitForTimeout(400);
    await dialog.getByRole('button', { name: NEXT }).click();
    await page.waitForTimeout(400);
    await dialog.getByRole('button', { name: NEXT }).click();
    await page.waitForTimeout(400);
    await dialog.getByRole('button', { name: /^create position$|^создать должность$/i }).click();

    await expect(page.getByText(posName).first()).toBeVisible({ timeout: 20_000 });
  });

  test('create employee via wizard incl. travel allowance preview', async ({ adminPage: page }) => {
    test.setTimeout(180_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));

    const suffix = Date.now();
    const empName = `QA Employee ${suffix}`;
    const empEmail = `qa.employee.${suffix}@test.com`;

    // ── 1. Enable the travel allowance policy (remember original state) ──
    await page.goto('/payroll/settings');
    const sw = page.locator('#travel-allowance-enabled');
    await sw.waitFor({ state: 'visible', timeout: 30_000 });
    const wasEnabled = (await sw.getAttribute('data-state')) === 'checked';
    if (!wasEnabled) {
      await sw.click();
      await page.waitForTimeout(300);
    }
    await page.locator('#travel-allowance-staff').waitFor({ state: 'visible', timeout: 5_000 });
    await page.locator('#travel-allowance-staff').fill('20000');
    await page.locator('#travel-allowance-contractor').fill('12000');
    await page.getByRole('button', { name: SAVE }).click();
    await page.waitForTimeout(2_000);

    // ── 2. Open the Add Employee wizard ──
    await page.goto('/employees');
    await page
      .getByRole('button', { name: /^add employee$|^добавить сотрудника$/i })
      .first()
      .click();

    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });

    // Superadmin: step 0 is the organization picker. Choose the org shown in
    // the sidebar org selector so the employee lands in the current org.
    const orgCombo = dialog.locator('[role="combobox"]').first();
    await orgCombo.waitFor({ state: 'visible', timeout: 10_000 });
    // The org name in the sidebar only appears once getAllOrganizations resolves
    // (dev is fast, prod can lag behind the dialog opening). Wait for the real
    // name so the modal selects the same org the rest of the test uses.
    const orgButton = page.locator('aside button:has(svg.lucide-building-2)').first();
    await expect(orgButton).not.toContainText(/select organization|выберите организацию/i, {
      timeout: 20_000,
    });
    const orgName = (await orgButton.innerText()).trim();
    await orgCombo.click();
    // The org list is fetched from Convex, so the options can lag the dropdown
    // opening — retry the open once if nothing is there yet.
    let orgOption = page
      .locator('[role="option"]')
      .filter(orgName ? { hasText: orgName } : undefined)
      .first();
    try {
      await orgOption.waitFor({ state: 'visible', timeout: 4_000 });
    } catch {
      await orgCombo.click();
      await page.waitForTimeout(600);
      orgOption = page
        .locator('[role="option"]')
        .filter(orgName ? { hasText: orgName } : undefined)
        .first();
      await orgOption.waitFor({ state: 'visible', timeout: 8_000 });
    }
    await orgOption.click();
    await page.waitForTimeout(400);
    // The org step still needs an explicit Next to advance to personal info.
    await dialog.getByRole('button', { name: NEXT }).click();

    // ── 3. Step 1: personal info ──
    await page.locator('#emp-name').fill(empName);
    await page.locator('#emp-email').fill(empEmail);
    await dialog.getByRole('button', { name: NEXT }).click();

    // ── 4. Step 2: department + position ──
    await page.waitForTimeout(600);
    const deptCombo = dialog.locator('[role="combobox"]').nth(0);
    await deptCombo.click();
    const deptCount = await page.locator('[role="option"]').count();
    expect(deptCount, 'org must have at least one department').toBeGreaterThan(0);
    await page.locator('[role="option"]').first().click();
    await page.waitForTimeout(400);
    const posCombo = dialog.locator('[role="combobox"]').nth(1);
    await posCombo.click();
    const posCount = await page.locator('[role="option"]').count();
    expect(posCount, 'org must have at least one position').toBeGreaterThan(0);
    await page.locator('[role="option"]').first().click();
    await dialog.getByRole('button', { name: NEXT }).click();

    // ── 5. Steps 3–5 (role/type, salary, identity): defaults ──
    await dialog.getByRole('button', { name: NEXT }).click();
    await page.waitForTimeout(300);
    await dialog.getByRole('button', { name: NEXT }).click();
    await page.waitForTimeout(300);
    await dialog.getByRole('button', { name: NEXT }).click();

    // ── 6. Review: travel allowance preview must show the staff amount ──
    await expect(
      page
        .locator('dialog, [role="dialog"]')
        .getByText(/20,000|20 000|20000/)
        .first(),
    ).toBeVisible({
      timeout: 10_000,
    });

    // ── 7. Submit ──
    await dialog.getByRole('button', { name: /^add employee$|^добавить сотрудника$/i }).click();
    await page.waitForTimeout(4_000);

    // ── 8. Verify the new employee appears in the list ──
    await page.locator('main input').first().fill(empEmail);
    await page.waitForTimeout(1_500);
    await expect(page.getByText(empName).first()).toBeVisible({ timeout: 15_000 });

    // ── 9. Restore the travel allowance policy ──
    await page.goto('/payroll/settings');
    await sw.waitFor({ state: 'visible', timeout: 30_000 });
    if (!wasEnabled) {
      await sw.click();
      await page.waitForTimeout(300);
    }
    await page.getByRole('button', { name: SAVE }).click();
    await page.waitForTimeout(1_500);

    expect(pageErrors).toEqual([]);
  });
});
