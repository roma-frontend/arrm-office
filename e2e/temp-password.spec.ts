import { test, expect, login, gotoAndSettle } from './fixtures';

/**
 * Full temporary-password flow (superadmin email-reset fallback):
 *
 *   1. Superadmin opens the target's User 360 profile and issues a
 *      temporary password through the UI.
 *   2. The plaintext is shown exactly once in the dialog — the test captures
 *      it and asserts the human-friendly XXXX-XXXX-XXXX shape.
 *   3. In a fresh browser context the target logs in with the temp password
 *      and is redirected to /change-password instead of the dashboard.
 *   4. The target rotates the temp password into their own credential.
 *   5. The temp password stops working; the new one logs into the dashboard.
 *
 * Requires a real backend plus seeded users:
 *   - E2E_USER_EMAIL / E2E_USER_PASSWORD (or E2E_SUPERADMIN_*) — a superadmin
 *   - E2E_TARGET_EMAIL / E2E_TARGET_PASSWORD — a non-superadmin victim
 */

const SUPERADMIN_EMAIL = process.env.E2E_SUPERADMIN_EMAIL || process.env.E2E_USER_EMAIL;
const SUPERADMIN_PASSWORD = process.env.E2E_SUPERADMIN_PASSWORD || process.env.E2E_USER_PASSWORD;
const TARGET_EMAIL = process.env.E2E_TARGET_EMAIL;
const TARGET_PASSWORD = process.env.E2E_TARGET_PASSWORD;

// Labels are i18n'd (en/ru/hy/de) — match across languages like auth.spec.ts does.
const ISSUE_BUTTON =
  /temporary password|временный пароль|ժամանակավոր գաղտնաբառ|temporäres passwort/i;
const ISSUE_CONFIRM = /issue password|выдать пароль|տրամադրել գաղտնաբառը|passwort ausstellen/i;
const TEMP_PW_SHAPE = /^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/;

test.describe('Temporary password flow', () => {
  test('issue → forced change → login with new password', async ({ browser }) => {
    test.skip(!process.env.E2E_USER_EMAIL, 'No test credentials configured');
    test.skip(
      !TARGET_EMAIL || !TARGET_PASSWORD,
      'No E2E_TARGET_EMAIL / E2E_TARGET_PASSWORD configured',
    );
    if (SUPERADMIN_EMAIL && TARGET_EMAIL && SUPERADMIN_EMAIL === TARGET_EMAIL) {
      test.skip(true, 'Target must be a different user than the issuing superadmin');
    }
    // Five pages + several logins in one flow — well beyond the shared budget.
    test.setTimeout(180_000);

    // ── 1. Superadmin issues the temporary password via User 360 ────────────
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await adminPage.addInitScript(() => {
      try {
        window.localStorage.setItem('tour_seen_login-tour', 'true');
      } catch {}
    });
    await login(adminPage, SUPERADMIN_EMAIL!, SUPERADMIN_PASSWORD!);
    await adminPage.waitForURL(/dashboard|leaves|tasks/, { timeout: 30_000 });

    await gotoAndSettle(adminPage, '/superadmin/users');

    // Find the target row by email and open their profile
    const targetRow = adminPage.locator('button', { hasText: TARGET_EMAIL! }).first();
    await expect(targetRow).toBeVisible({ timeout: 15_000 });
    await targetRow.click();
    await adminPage.waitForURL(/superadmin\/users\//, { timeout: 15_000 });

    // Issue → confirm inside the dialog
    await adminPage.getByRole('button', { name: ISSUE_BUTTON }).first().click();
    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Pick the shortest validity window (8h) to exercise the TTL selector
    await dialog.locator('select').selectOption('8');
    await dialog.getByRole('button', { name: ISSUE_CONFIRM }).click();

    // Plaintext appears exactly once, in the XXXX-XXXX-XXXX shape
    const codeEl = dialog.locator('code');
    await expect(codeEl).toBeVisible({ timeout: 20_000 });
    const tempPassword = (await codeEl.textContent())?.trim() ?? '';
    expect(tempPassword).toMatch(TEMP_PW_SHAPE);
    // No ambiguous glyphs that could be misread when relayed by voice
    expect(tempPassword).not.toMatch(/[0O1lI]/);

    await adminCtx.close();

    // ── 2. Target logs in with the temp password → forced to /change-password
    const userCtx = await browser.newContext();
    const userPage = await userCtx.newPage();
    await userPage.addInitScript(() => {
      try {
        window.localStorage.setItem('tour_seen_login-tour', 'true');
      } catch {}
    });
    await login(userPage, TARGET_EMAIL!, tempPassword);
    await userPage.waitForURL(/change-password/, { timeout: 30_000 });

    // ── 3. Rotation: wrong confirmation is rejected first ───────────────────
    const newPassword = `Rotated-${Date.now()}!aA`;
    const pwInputs = userPage.locator('#change-password-form input[type="password"]');
    await expect(pwInputs).toHaveCount(3);

    await pwInputs.nth(0).fill(tempPassword);
    await pwInputs.nth(1).fill(newPassword);
    await pwInputs.nth(2).fill(`${newPassword}-mismatch`);
    await userPage.locator('#change-password-form button[type="submit"]').click();

    // Still on the form — mismatch error surfaced, no navigation happened
    await userPage.waitForTimeout(2_000);
    expect(userPage.url()).toContain('/change-password');

    // ── 4. Correct rotation succeeds and signs out to /login ───────────────
    await pwInputs.nth(2).fill(newPassword);
    await userPage.locator('#change-password-form button[type="submit"]').click();
    await userPage.waitForURL(/login/, { timeout: 30_000 });

    // ── 5. The temp password no longer works; the new one logs in ──────────
    await login(userPage, TARGET_EMAIL!, tempPassword);
    await userPage.waitForTimeout(3_000);
    expect(userPage.url()).toContain('/login'); // rejected, stays on the form

    await login(userPage, TARGET_EMAIL!, newPassword);
    await userPage.waitForURL(/dashboard|leaves|tasks/, { timeout: 30_000 });

    await userCtx.close();
  });
});
