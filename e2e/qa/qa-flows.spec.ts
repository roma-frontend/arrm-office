import { test, expect } from '../fixtures';

const NEXT = /^next$|^далее$/i;

test.describe('QA: Tasks / Goals / Attendance / Calendar flows', () => {
  test('create task via wizard and verify on board', async ({ adminPage: page }) => {
    test.setTimeout(180_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));

    const taskTitle = `QA Task ${Date.now()}`;

    await page.goto('/tasks');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 25_000 });
    await page.waitForTimeout(2_000);

    // Open the create-task wizard from the board.
    await page
      .getByRole('button', { name: /new task|новая задача|добавить задачу/i })
      .first()
      .click();

    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });

    // Step 1: title + description.
    const titleInput = dialog.locator('input[type="text"]').first();
    await titleInput.waitFor({ state: 'visible', timeout: 10_000 });
    await titleInput.fill(taskTitle);
    await dialog.getByRole('button', { name: NEXT }).click();

    // Step 2: assignee (required) — pick the first employee.
    await page.waitForTimeout(500);
    const assigneeCombo = dialog.locator('[role="combobox"]').first();
    await assigneeCombo.waitFor({ state: 'visible', timeout: 10_000 });
    await assigneeCombo.click();
    const assigneeOptions = await page.locator('[role="option"]').count();
    expect(assigneeOptions, 'assignee list must not be empty').toBeGreaterThan(0);
    await page.locator('[role="option"]').first().click();
    await dialog.getByRole('button', { name: NEXT }).click();

    // Steps 3–6 (priority, tags, objective link, attachments): all optional.
    await page.waitForTimeout(300);
    await dialog.getByRole('button', { name: NEXT }).click();
    await page.waitForTimeout(300);
    await dialog.getByRole('button', { name: NEXT }).click();
    await page.waitForTimeout(300);
    await dialog.getByRole('button', { name: NEXT }).click();
    await page.waitForTimeout(300);
    await dialog.getByRole('button', { name: /^create task$|^создать задачу$/i }).click();

    // Verify the task shows up on the board.
    await page.waitForTimeout(2_500);
    await expect(page.getByText(taskTitle).first()).toBeVisible({ timeout: 15_000 });

    expect(pageErrors).toEqual([]);
  });

  test('create OKR objective via wizard and verify on list', async ({ adminPage: page }) => {
    test.setTimeout(120_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));

    const goalTitle = `QA Goal ${Date.now()}`;

    await page.goto('/goals');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 25_000 });
    await page.waitForTimeout(2_000);

    await page
      .getByRole('button', { name: /new objective|новая цель|создать цель/i })
      .first()
      .click();

    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });

    // Step 1: title (first textbox in the dialog).
    await dialog.getByRole('textbox').first().fill(goalTitle);
    await dialog.getByRole('button', { name: NEXT }).click();

    // Step 2: key result title (required).
    await page.waitForTimeout(400);
    const krInput = dialog.getByRole('textbox').first();
    await krInput.waitFor({ state: 'visible', timeout: 10_000 });
    await krInput.fill('QA Key Result');
    await dialog.getByRole('button', { name: NEXT }).click();

    // Step 3: review → submit.
    await page.waitForTimeout(400);
    await dialog.getByRole('button', { name: /^create objective$|^создать цель$/i }).click();

    await page.waitForTimeout(2_000);
    await expect(page.getByText(goalTitle).first()).toBeVisible({ timeout: 15_000 });

    expect(pageErrors).toEqual([]);
  });

  test('attendance page shows check-in/out widget', async ({ adminPage: page }) => {
    await page.goto('/attendance');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 25_000 });
    await page.waitForTimeout(2_500);
    // The CheckInOutWidget should render a clock/check-in control.
    const text = await page.locator('body').innerText();
    expect(text).toMatch(/check.?in|check.?out|отметить|присутств|посещаем/i);
  });

  test('calendar renders month grid', async ({ adminPage: page }) => {
    await page.goto('/calendar');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 25_000 });
    await page.waitForTimeout(2_500);
    const text = await page.locator('body').innerText();
    // A real calendar grid shows a month name or weekday headers.
    expect(text).toMatch(
      /january|february|march|april|may|june|july|august|september|october|november|december|январ|феврал|март|апрел|май|июн|июл|август|сентябр|октябр|ноябр|декабр|monday|tuesday|wednesday|thursday|friday|saturday|sunday|понедельник|вторник|сред|четверг|пятниц|суббот|воскрес/i,
    );
  });
});
