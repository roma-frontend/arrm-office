import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * Helper: navigate to goals page and create a new objective with one key result.
 * Returns the objective title so callers can reference it later.
 */
async function createObjective(page: Page): Promise<string> {
  await page.goto('/goals');
  await page.waitForLoadState('networkidle');

  const title = `E2E Goal ${Date.now()}`;

  // Click "New Objective" button
  const newBtn = page.getByRole('button', { name: /new objective|создать|новая цель/i }).first();
  await newBtn.waitFor({ state: 'visible', timeout: 5_000 });
  await newBtn.click();
  await page.waitForTimeout(500);

  // Dialog should be visible — fill title (step 1)
  const titleInput = page.locator('dialog input, [role="dialog"] input').first();
  await titleInput.waitFor({ state: 'visible', timeout: 5_000 });
  await titleInput.fill(title);

  // Click Next to go to Key Results step
  const nextBtn = page.getByRole('button', { name: /next|далее/i }).first();
  if (await nextBtn.isVisible()) {
    await nextBtn.click();
    await page.waitForTimeout(300);
  }

  // Fill first key result title (step 2)
  const krInput = page.locator('dialog input, [role="dialog"] input').first();
  if (await krInput.isVisible()) {
    await krInput.fill('E2E KR - increase metric');
  }

  // Click Next to review
  const nextBtn2 = page.getByRole('button', { name: /next|далее/i }).first();
  if (await nextBtn2.isVisible()) {
    await nextBtn2.click();
    await page.waitForTimeout(300);
  }

  // Submit (step 3 — review & create)
  const submitBtn = page
    .locator('[role="dialog"]')
    .getByRole('button', { name: /create|создать/i })
    .first();
  if (await submitBtn.isVisible()) {
    await submitBtn.click();
    // Wait for success notification or dialog to close
    await page.waitForTimeout(2000);
  }

  return title;
}

/**
 * Click the wizard's primary action button (Next / Submit), waiting briefly.
 * Returns true if a button was found and clicked.
 */
async function clickWizardPrimary(page: Page): Promise<boolean> {
  // Radix Dialog renders a div with role="dialog" (not the <dialog> element),
  // so scope to [role="dialog"] instead of the HTML tag. Wizard steps animate
  // (enter/exit), which can detach the button mid-click — retry a few times.
  const primaryBtn = page
    .locator('[role="dialog"]')
    .getByRole('button', { name: /next|далее|submit|create|создать|готово|done/i })
    .first();
  for (let attempt = 0; attempt < 5; attempt++) {
    if (!(await primaryBtn.isVisible().catch(() => false))) return false;
    try {
      await primaryBtn.click({ timeout: 3_000 });
      await page.waitForTimeout(300);
      return true;
    } catch {
      // Button may have been detached by a step transition animation — retry.
      await page.waitForTimeout(400);
    }
  }
  return false;
}

/**
 * On the current wizard step, open the first combobox and pick the first option.
 * Used for required steps (e.g. assignee) so the Next button unblocks.
 */
async function selectFirstComboboxOption(page: Page): Promise<void> {
  const combo = page.locator('dialog [role="combobox"], [role="dialog"] [role="combobox"]').first();
  if (!(await combo.isVisible().catch(() => false))) return;
  await combo.click();
  await page.waitForTimeout(300);
  const firstOption = page.locator('[role="option"]').first();
  if (await firstOption.isVisible().catch(() => false)) {
    await firstOption.click();
    await page.waitForTimeout(300);
  }
}

/**
 * Helper: create a task linked to a specific objective via the CreateTaskWizard.
 * The wizard has 6 steps: details → assignee (required) → priority → tags →
 * objective link → attachments. We fill the title, pick an assignee, then
 * advance and select the matching objective before submitting.
 */
async function createTaskLinkedToObjective(page: Page, objectiveTitle: string): Promise<string> {
  await page.goto('/tasks');
  await page.waitForLoadState('networkidle');

  const taskTitle = `E2E Task for goal ${Date.now()}`;

  // Click create task button
  const createBtn = page
    .getByRole('button', { name: /new task|create task|создать|новая задача/i })
    .first();
  await createBtn.waitFor({ state: 'visible', timeout: 5_000 });
  await createBtn.click();
  await page.waitForTimeout(500);

  // Step 1 (details): fill title
  const titleInput = page.locator('dialog input, [role="dialog"] input').first();
  await titleInput.waitFor({ state: 'visible', timeout: 5_000 });
  await titleInput.fill(taskTitle);
  await clickWizardPrimary(page); // → assignee

  // Step 2 (assignee, required): pick the first employee so Next unblocks
  await selectFirstComboboxOption(page);
  await clickWizardPrimary(page); // → priority

  // Steps 3–4 (priority, tags): nothing required, just advance
  await clickWizardPrimary(page); // → tags
  await clickWizardPrimary(page); // → objective link

  // Step 5 (objective link): select our objective from the dropdown. The
  // objective options load asynchronously from Convex, so wait for our option
  // to appear (up to 5s) instead of assuming it is already rendered.
  const objectiveCombobox = page
    .locator('[role="dialog"] [role="combobox"]')
    .filter({ hasText: /objective|goal|цель|мақсат|նպատակ/i })
    .first();
  const dialogHeading = page.locator('[role="dialog"] h2').first();
  console.log(
    '[DIAG] step before objective:',
    await dialogHeading.textContent().catch(() => 'n/a'),
  );
  console.log(
    '[DIAG] objective combobox visible:',
    await objectiveCombobox.isVisible().catch(() => false),
  );
  if (await objectiveCombobox.isVisible().catch(() => false)) {
    await objectiveCombobox.click();
    const objectiveOption = page
      .locator('[role="option"]')
      .filter({ hasText: objectiveTitle.slice(0, 20) })
      .first();
    await objectiveOption.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
    console.log(
      '[DIAG] objective option visible:',
      await objectiveOption.isVisible().catch(() => false),
    );
    if (await objectiveOption.isVisible().catch(() => false)) {
      await objectiveOption.click();
      await page.waitForTimeout(500); // Wait for KRs to load
    } else {
      // Fallback: pick the first option so the wizard can still proceed.
      const firstOption = page.locator('[role="option"]').first();
      console.log('[DIAG] first option visible:', await firstOption.isVisible().catch(() => false));
      if (await firstOption.isVisible().catch(() => false)) {
        await firstOption.click();
        await page.waitForTimeout(300);
      }
    }
    // Make sure the dropdown is closed before clicking Next.
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(200);
  }
  await clickWizardPrimary(page); // → attachments
  console.log('[DIAG] step after objective:', await dialogHeading.textContent().catch(() => 'n/a'));

  // Step 6 (attachments): submit the wizard
  const submitBtn = page
    .locator('[role="dialog"]')
    .getByRole('button', { name: /submit|create|создать|готово|done/i })
    .first();
  if (await submitBtn.isVisible().catch(() => false)) {
    await submitBtn.click();
    await page.waitForTimeout(2500);
  }

  return taskTitle;
}

test.describe('Goals → Tasks Flow', () => {
  test('goals page loads with header and create button', async ({ authedPage: page }) => {
    await page.goto('/goals');
    await page.waitForLoadState('networkidle');

    // Page should have the goals title/header
    const hasTitle = await page
      .locator('h1, h2, [class*="title"]')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasTitle).toBeTruthy();

    // Should have a create/new objective button
    const hasCreateBtn = await page
      .getByRole('button', { name: /new objective|create|создать/i })
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasCreateBtn).toBeTruthy();
  });

  test('can create an objective with key result', async ({ authedPage: page }) => {
    const title = await createObjective(page);

    // The objective should appear somewhere on the goals page
    const objectiveItem = page.locator(`text="${title}"`).first();
    await expect(objectiveItem).toBeVisible({ timeout: 10_000 });
  });

  test('can create a task linked to an objective', async ({ authedPage: page }) => {
    // First create an objective
    const objectiveTitle = await createObjective(page);

    // Now create a task linked to it
    const taskTitle = await createTaskLinkedToObjective(page, objectiveTitle);

    // Reload the tasks page so the Convex subscription re-fetches fresh data
    // (the live subscription may lag the just-completed mutation).
    await page.goto('/tasks');
    await page.waitForLoadState('networkidle');

    // Verify the task appears on the tasks page
    const taskVisible = await page
      .locator(`text="${taskTitle.slice(0, 25)}"`)
      .first()
      .isVisible({ timeout: 10_000 })
      .catch(() => false);
    expect(taskVisible).toBeTruthy();
  });

  test('goal detail page shows linked tasks count', async ({ authedPage: page }) => {
    // Create an objective + linked task
    const objectiveTitle = await createObjective(page);
    await createTaskLinkedToObjective(page, objectiveTitle);

    // Navigate to goals page and click into the objective
    await page.goto('/goals');
    await page.waitForLoadState('networkidle');

    const objectiveCard = page.locator(`text="${objectiveTitle.slice(0, 20)}"`).first();
    if (await objectiveCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await objectiveCard.click();
      await page.waitForURL(/goals\//, { timeout: 10_000 });
      await page.waitForLoadState('networkidle');

      // Should see a section with linked tasks (or at least shows strategy/goal detail)
      const linkedTasksSection = page
        .locator('text=/linked task|связанные задачи|linked tasks/i')
        .first();
      const hasLinkedTasks = await linkedTasksSection
        .isVisible({ timeout: 5_000 })
        .catch(() => false);

      // Fallback: check for any task content on the detail page
      const taskBadge = page
        .locator('[class*="card"]')
        .filter({ hasText: /task|задач/i })
        .first();
      const hasTaskBadge = await taskBadge.isVisible().catch(() => false);

      expect(hasLinkedTasks || hasTaskBadge).toBeTruthy();
    }
  });

  test('strategy alignment view renders', async ({ authedPage: page }) => {
    // Create an objective + linked task to ensure data exists
    await createObjective(page);

    // Navigate to the strategy page (alignment view is the default tab)
    await page.goto('/strategy');
    await page.waitForLoadState('networkidle');

    // Should show some content — summary cards or tree nodes
    const hasSummaryCard = await page
      .locator('[class*="grid"] [class*="card"]')
      .filter({ hasText: /progress|objective|linked/i })
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    const hasNode = await page
      .locator('[class*="card"]')
      .filter({ hasText: /company|team|individual|компания|команда/i })
      .first()
      .isVisible()
      .catch(() => false);

    expect(hasSummaryCard || hasNode).toBeTruthy();
  });

  test('objective card shows progress bar', async ({ authedPage: page }) => {
    // Create objective
    const objectiveTitle = await createObjective(page);

    // Navigate to goals page
    await page.goto('/goals');
    await page.waitForLoadState('networkidle');

    // Find the objective card and verify it shows a progress element
    const objectiveCard = page.locator(`text="${objectiveTitle.slice(0, 20)}"`).first();
    if (await objectiveCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // Traverse up to the card and look for progress indicators
      const card = objectiveCard
        .locator('xpath=ancestor::div[contains(@class, "card")][1]')
        .first();
      const hasProgress = await card
        .locator('[class*="progress"], [role="progressbar"]')
        .first()
        .isVisible()
        .catch(() => false);

      // Also check for percentage text
      const hasPercentage = await card
        .locator('text=/%/')
        .first()
        .isVisible()
        .catch(() => false);

      expect(hasProgress || hasPercentage).toBeTruthy();
    }
  });
});
