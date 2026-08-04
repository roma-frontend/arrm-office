/**
 * Visual regression: the DriverCalendarDialog stays centred on screen.
 *
 * The Radix panel is positioned with `left-[50%] top-[50%]` plus the Tailwind
 * `translate-x-[-50%] translate-y-[-50%]` utilities, which compile to the CSS
 * `translate` property, and is animated by the `dialogContentIn` keyframes in
 * styles/animations.css. Those keyframes must NOT repeat the -50% translation
 * inside `transform`: `translate` and `transform` compose, so a keyframe
 * `translate(-50%, -50%)` stacks on top of the centring and flings the dialog
 * into the top-left corner. That is the bug this test pins.
 *
 * The assertion measures the panel after the open animation finishes and checks
 * both axes against the viewport centre. It is deliberately viewport based
 * rather than class based: jsdom cannot lay out the page, so only a real
 * browser run can catch the double shift.
 */

import { test, expect } from './fixtures';

/** Px the panel centre may drift from the viewport centre (scrollbar, 95vw rounding). */
const CENTER_TOLERANCE_PX = 3;

test.describe('Driver calendar dialog', () => {
  test('opens centred on the viewport', async ({ authedPage: page }) => {
    await page.goto('/drivers');

    // Each driver card carries an icon-only calendar button, tagged with a
    // testid so this selector does not depend on the UI language. No cards
    // render when the seeded org has no drivers, or when the account is not
    // admin/superadmin (the page redirects to /drivers/dashboard) — nothing to
    // measure then, so skip instead of failing the suite.
    const calendarButton = page.getByTestId('driver-calendar-button').first();
    await calendarButton.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
    if (!(await calendarButton.isVisible())) {
      test.skip(true, 'No driver card with a calendar button on /drivers');
      return;
    }

    await calendarButton.click();

    // Radix keeps a dialog mounted while it animates out, and the page hosts
    // other hand-rolled portals, so target the *open* Radix panel by its
    // data-state instead of assuming it is the only dialog on the page.
    const dialog = page.locator('[role="dialog"][data-state="open"]').first();
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // `dialogContentIn` runs 320ms with fill-mode both; measuring during it
    // would catch the 12px rise and the 3% scale and fail the tolerance.
    await page.waitForTimeout(700);

    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();

    const { innerWidth: vw, innerHeight: vh } = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
    }));

    const expectedLeft = (vw - box!.width) / 2;
    const expectedTop = (vh - box!.height) / 2;

    expect(Math.abs(box!.x - expectedLeft)).toBeLessThanOrEqual(CENTER_TOLERANCE_PX);
    expect(Math.abs(box!.y - expectedTop)).toBeLessThanOrEqual(CENTER_TOLERANCE_PX);
  });
});
