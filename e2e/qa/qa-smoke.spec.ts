import { test, expect } from '../fixtures';

// Every HR module route. The smoke check opens each one, verifies it renders
// real content (no 404, no error boundary, no page crash), and records any
// console errors — the findings table is what matters for the QA report.
const ROUTES: { route: string; module: string }[] = [
  { route: '/dashboard', module: 'Dashboard' },
  { route: '/employees', module: 'Employees' },
  { route: '/employees/departments', module: 'Departments' },
  { route: '/employees/positions', module: 'Positions' },
  { route: '/attendance', module: 'Attendance' },
  { route: '/leaves', module: 'Leaves' },
  { route: '/calendar', module: 'Calendar' },
  { route: '/rooms', module: 'Rooms' },
  { route: '/tasks', module: 'Tasks' },
  { route: '/projects', module: 'Projects' },
  { route: '/performance', module: 'Performance' },
  { route: '/goals', module: 'Goals' },
  { route: '/strategy', module: 'Strategy map' },
  { route: '/signatures', module: 'Signatures' },
  { route: '/recognition', module: 'Recognition' },
  { route: '/recruitment', module: 'Recruitment' },
  { route: '/onboarding', module: 'Onboarding' },
  { route: '/offboarding', module: 'Offboarding' },
  { route: '/learning', module: 'Learning' },
  { route: '/payroll', module: 'Payroll' },
  { route: '/compensation', module: 'Compensation' },
  { route: '/expenses', module: 'Expenses' },
  { route: '/reports', module: 'Reports' },
  { route: '/analytics', module: 'Analytics' },
  { route: '/org-chart', module: 'Org chart' },
  { route: '/documents', module: 'Documents' },
  { route: '/documents/library', module: 'Document library' },
  { route: '/assets', module: 'Assets' },
  { route: '/news', module: 'News' },
  { route: '/approvals', module: 'Approvals' },
  { route: '/surveys', module: 'Surveys' },
  { route: '/settings', module: 'Settings' },
  { route: '/profile', module: 'Profile' },
  { route: '/admin/leave-settings', module: 'Admin: leave settings' },
  { route: '/admin/holidays', module: 'Admin: holidays' },
  { route: '/admin/leave-balances', module: 'Admin: leave balances' },
  { route: '/admin/events', module: 'Admin: events' },
  { route: '/admin/join-requests', module: 'Join requests' },
  { route: '/compliance', module: 'Compliance' },
  { route: '/admin/ai-governance', module: 'AI governance' },
];

test.describe('QA: HR module smoke', () => {
  test('every HR route renders without page errors', async ({ adminPage: page }) => {
    test.setTimeout(600_000);
    const findings: Record<string, { ok: boolean; notes: string }> = {};

    for (const { route, module } of ROUTES) {
      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];
      const onConsole = (msg: { type: () => string; text: () => string }) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      };
      const onPageError = (e: Error) => pageErrors.push(e.message);
      page.on('console', onConsole);
      page.on('pageerror', onPageError);

      await page.goto(route, { waitUntil: 'domcontentloaded' });
      // Let the client shell hydrate and fetch from Convex.
      await page
        .locator('main, h1, h2, [class*="card"], [role="alert"]')
        .first()
        .waitFor({ state: 'visible', timeout: 20_000 })
        .catch(() => {});
      await page.waitForTimeout(1_800);

      let bodyText =
        (await page
          .locator('body')
          .innerText()
          .catch(() => '')) || '';
      // Hydration can detach/replace the DOM mid-read, which our catch above
      // swallows into ''. Retry once before declaring the page empty — a real
      // blank page stays blank across retries, a busy page does not.
      if (bodyText.trim().length < 30) {
        await page.waitForTimeout(1_500);
        bodyText =
          (await page
            .locator('body')
            .innerText()
            .catch(() => '')) || '';
      }
      const is404 = /404|not found|страниц.*не найдена|не найдено/i.test(bodyText.slice(0, 400));
      const isDenied = /access denied|доступ запрещен|unauthorized|нет доступа/i.test(
        bodyText.slice(0, 400),
      );
      // Scan the whole document for the app's error boundary (heading + Try
      // again button) — it can appear anywhere in the body, not just the first
      // screenful, and would otherwise be masked by the sidebar text.
      const errorBoundaryCount =
        (await page
          .getByRole('heading', {
            name: /something went wrong|что-то пошло не так|непредвиденная ошибка/i,
          })
          .count()) +
        (await page
          .getByRole('button', { name: /try again|попробовать снова|повторить/i })
          .count());
      const isErrorBoundary = errorBoundaryCount > 0;
      const empty = bodyText.trim().length < 30;

      const notes: string[] = [];
      if (pageErrors.length) notes.push(`PAGEERROR: ${pageErrors.join(' | ').slice(0, 300)}`);
      if (is404) notes.push('404/not-found page');
      if (isDenied) notes.push('access denied (role-gated)');
      if (isErrorBoundary) notes.push('error boundary text');
      if (empty) notes.push('page body almost empty');
      const errs = consoleErrors.filter(
        (e) =>
          !/Failed to load resource|net::|favicon|sockjs|websocket|ERR_CONNECTION|aborted/i.test(
            e,
          ) &&
          // Sentry telemetry noise: the browser SDK tries to POST events to the
          // configured DSN, which is unreachable from localhost. Not an app bug.
          !/Sentry|transport request/i.test(e) &&
          // Vercel Analytics / Speed Insights: injected into production builds,
          // but their /_vercel/* script endpoints return HTML 404 on localhost,
          // so the browser refuses to execute them (strict MIME check). Telemetry
          // noise, not an app bug — the pages themselves render fine.
          !/_vercel\/(speed-)?insights/i.test(e),
      );
      if (errs.length) notes.push(`console: ${errs.slice(0, 3).join(' | ').slice(0, 300)}`);

      findings[module] = {
        ok: pageErrors.length === 0 && !is404 && !isErrorBoundary && !empty && notes.length === 0,
        notes: notes.join('; ') || bodyText.trim().slice(0, 120).replace(/\n/g, ' ') || '—',
      };

      page.off('console', onConsole);
      page.off('pageerror', onPageError);
    }

    // Human-readable QA table (printed in the test output).
    // eslint-disable-next-line no-console
    console.log(
      '\n===== HR SMOKE RESULTS =====\n' +
        Object.entries(findings)
          .map(([k, v]) => `${v.ok ? 'PASS' : 'FAIL'}  ${k.padEnd(26)} ${v.notes}`)
          .join('\n') +
        '\n============================',
    );

    const failures = Object.entries(findings).filter(([, v]) => !v.ok);
    expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
  });
});
