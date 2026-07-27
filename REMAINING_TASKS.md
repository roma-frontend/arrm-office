# Remaining Tasks & Known Issues

## Test Failures

- **ReportBuilder.test.tsx** — 12 tests fail (1 suite). These are likely pre-existing and related to ReportBuilder changes from earlier sessions. Check if they were failing before this session's changes.

## Translation Keys

- ✅ All `payroll.*` keys added to en/ru/de/hy locale files (22 new keys)
- `employeeProfile.*` keys exist in `modules.json` / `employees.json` — verify coverage for all used keys

## To Verify

- Run `git stash && npx jest ReportBuilder.test.tsx --no-coverage && git stash pop` to confirm if test failures are pre-existing
- If pre-existing, push is safe
