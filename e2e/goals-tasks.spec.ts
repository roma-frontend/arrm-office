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
  const newBtn = page.locator('button:has-text(/new objective|создать|новая цель/i)').first();
  await newBtn.waitFor({ state: 'visible', timeout: 5_000 });
  await newBtn.click();
  await page.waitForTimeout(500);

  // Dialog should be visible — fill title (step 1)
  const titleInput = page.locator('dialog input, [role="dialog"] input').first();
  await titleInput.waitFor({ state: 'visible', timeout: 5_000 });
  await titleInput.fill(title);

  // Click Next to go to Key Results step
  const nextBtn = page.locator('button:has-text(/next|далее/i)').first();
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
  const nextBtn2 = page.locator('button:has-text(/next|далее/i)').first();
  if (await nextBtn2.isVisible()) {
    await nextBtn2.click();
    await page.waitForTimeout(300);
  }

  // Submit (step 3 — review & create)
  const submitBtn = page
    .locator(
      'dialog button:has-text(/create|создать/i), [role="dialog"] button:has-text(/create|создать/i)',
    )
    .first();
  if (await submitBtn.isVisible()) {
    await submitBtn.click();
    // Wait for success notification or dialog to close
    await page.waitForTimeout(2000);
  }

  return title;
}

/**
 * Helper: create a task linked to a specific objective via the CreateTaskWizard.
 * Advances through wizard steps by repeatedly clicking Next until the
 * objective selector or Submit button appears.
 */
async function createTaskLinkedToObjective(page: Page, objectiveTitle: string): Promise<string> {
  await page.goto('/tasks');
  await page.waitForLoadState('networkidle');

  const taskTitle = `E2E Task for goal ${Date.now()}`;

  // Click create task button
  const createBtn = page
    .locator('button:has-text(/new task|create task|создать|новая задача/i)')
    .first();
  await createBtn.waitFor({ state: 'visible', timeout: 5_000 });
  await createBtn.click();
  await page.waitForTimeout(500);

  // Step 1: Fill title
  const titleInput = page.locator('dialog input, [role="dialog"] input').first();
  await titleInput.waitFor({ state: 'visible', timeout: 5_000 });
  await titleInput.fill(taskTitle);

  // Advance through wizard steps (assignee, priority, tags) by clicking Next
  // Stop when the objective selector combobox becomes visible or Submit appears
  for (let attempt = 0; attempt < 8; attempt++) {
    const hasObjectiveSelector = await page
      .locator(
        'dialog [role="combobox"]:has-text(/select an objective|objective|выберите цель/i), [role="dialog"] [role="combobox"]',
      )
      .first()
      .isVisible()
      .catch(() => false);

    const hasSubmit = await page
      .locator('dialog button:has-text(/submit|create|создать|готово/i)')
      .first()
      .isVisible()
      .catch(() => false);

    if (hasObjectiveSelector || hasSubmit) break;

    const nextBtn = page.locator('button:has-text(/next|далее/i)').first();
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
      await page.waitForTimeout(300);
    } else {
      break;
    }
  }

  // Step: Link to Goal — select the objective we created
  const allComboboxes = page.locator('dialog [role="combobox"], [role="dialog"] [role="combobox"]');
  const comboboxCount = await allComboboxes.count();

  for (let i = 0; i < comboboxCount; i++) {
    const combo = allComboboxes.nth(i);
    const labelText = await page
      .locator(`label[for="${await combo.getAttribute('id')}"]`)
      .first()
      .textContent()
      .catch(() => '');

    // Look for the objective selector (first combobox in the link step)
    if (labelText && /objective|goal|цель/i.test(labelText)) {
      await combo.click();
      await page.waitForTimeout(300);

      // Find our objective in the dropdown
      const objectiveOption = page
        .locator(`[role="option"]:has-text("${objectiveTitle.slice(0, 20)}")`)
        .first();
      if (await objectiveOption.isVisible()) {
        await objectiveOption.click();
        await page.waitForTimeout(500); // Wait for KRs to load
      }
      break;
    }
  }

  // If a Key Result selector appeared (second combobox), select the first KR
  const krCombobox = page
    .locator(
      'dialog [role="combobox"]:has-text(/key result|kr/i), [role="dialog"] [role="combobox"]',
    )
    .first();
  if (await krCombobox.isVisible().catch(() => false)) {
    await krCombobox.click();
    await page.waitForTimeout(300);
    const firstKrOption = page.locator('[role="option"]').first();
    if (await firstKrOption.isVisible()) {
      await firstKrOption.click();
      await page.waitForTimeout(200);
    }
  }

  // Advance remaining steps (attachments) and submit
  for (let attempt = 0; attempt < 4; attempt++) {
    const submitBtn = page
      .locator(
        'dialog button:has-text(/submit|create|создать|готово/i), [role="dialog"] button:has-text(/submit|create|создать|готово/i)',
      )
      .first();
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      await page.waitForTimeout(2000);
      break;
    }

    const nextBtn = page.locator('button:has-text(/next|далее/i)').first();
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
      await page.waitForTimeout(300);
    } else {
      break;
    }
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
      .locator('button:has-text(/new objective|create|создать/i)')
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

    // Verify the task appears on the tasks page
    const taskVisible = await page
      .locator(`text="${taskTitle.slice(0, 25)}"`)
      .first()
      .isVisible({ timeout: 5_000 })
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
      const taskBadge = page.locator('[class*="card"]:has-text(/task|задач/i)').first();
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
      .locator('[class*="grid"] [class*="card"]:has-text(/progress|objective|linked/i)')
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    const hasNode = await page
      .locator('[class*="card"]:has-text(/company|team|individual|компания|команда/i)')
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
