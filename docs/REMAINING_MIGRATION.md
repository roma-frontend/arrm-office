# Remaining withAuth Migration — Manual Work

**Created:** 2026-05-28  
**Execute after:** 2026-06-04 (7 days, when old sessions expire)  
**Status:** pending

## Context

84% of handlers (674/799) are already wrapped with `withAuth({ allowUnauthenticated: true })`.
The remaining 93 handlers use destructuring patterns (`{ userId, orgId }`) that break TypeScript
when wrapped automatically. They need manual migration.

## Pre-requisites before starting

1. Verify bridge works: `fetch('/api/auth/convex-token').then(r=>r.json()).then(console.log)` → should return token
2. Verify `ctx.auth.getUserIdentity()` returns identity in Convex (use a test query)
3. All users have re-logged in (old sessions expired after 7 days)

## Step 1: Remove `allowUnauthenticated: true` from all existing handlers

Replace in all convex files:

```
withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
```

With:

```
withAuth({}, async (ctx, args: any, _caller) => {
```

This makes all 674 already-migrated handlers **strictly require auth**.

## Step 2: Migrate remaining 93 handlers

For each handler below, change:

```ts
handler: async (ctx, { userId, organizationId }) => {
```

To:

```ts
handler: withAuth({}, async (ctx, args: any, _caller) => {
  const { userId, organizationId } = args;
```

And fix the closing `},` → `}),`

### Files to migrate (sorted by count):

| File                                 | Handlers | Priority |
| ------------------------------------ | -------- | -------- |
| `convex/users/queries.ts`            | 11       | HIGH     |
| `convex/leaves/mutations.ts`         | 9        | HIGH     |
| `convex/productivity.ts`             | 6        | HIGH     |
| `convex/users/admin.ts`              | 5        | HIGH     |
| `convex/admin.ts`                    | 4        | MED      |
| `convex/departments.ts`              | 4        | MED      |
| `convex/positions.ts`                | 4        | MED      |
| `convex/security.ts`                 | 4        | MED      |
| `convex/backups.ts`                  | 3        | MED      |
| `convex/leaves/queries.ts`           | 3        | MED      |
| `convex/messenger/messages.ts`       | 3        | MED      |
| `convex/sla.ts`                      | 3        | MED      |
| `convex/tasks.ts`                    | 3        | MED      |
| `convex/analytics.ts`                | 2        | LOW      |
| `convex/automation.ts`               | 2        | LOW      |
| `convex/chat/queries.ts`             | 2        | LOW      |
| `convex/compliance.ts`               | 2        | LOW      |
| `convex/organizationRequests.ts`     | 2        | LOW      |
| `convex/payroll/mutations.ts`        | 2        | LOW      |
| `convex/recruitment.ts`              | 2        | LOW      |
| `convex/subscriptions.ts`            | 2        | LOW      |
| `convex/automationMutations.ts`      | 1        | LOW      |
| `convex/drivers/shifts_mutations.ts` | 1        | LOW      |
| `convex/faceRecognition.ts`          | 1        | LOW      |
| `convex/onboarding.ts`               | 1        | LOW      |
| `convex/organizationJoinRequests.ts` | 1        | LOW      |
| `convex/organizations/main.ts`       | 1        | LOW      |
| `convex/performance.ts`              | 1        | LOW      |
| `convex/recognition.ts`              | 1        | LOW      |
| `convex/sharepointSync.ts`           | 1        | LOW      |
| `convex/subscriptions_admin.ts`      | 1        | LOW      |
| `convex/superadmin/emergency.ts`     | 1        | LOW      |
| `convex/superadmin/search.ts`        | 1        | LOW      |
| `convex/tickets.ts`                  | 1        | LOW      |
| `convex/users/mutations.ts`          | 1        | LOW      |

## Step 3: Remove `requesterId` from args validators

After all handlers use `_caller` from withAuth, remove `requesterId` from:

- `args: { requesterId: v.id('users'), ... }` → `args: { ... }`
- Client-side calls that pass `requesterId`

## Step 4: Cleanup

1. Delete `convex/lib/requireRequester.ts`
2. Remove all `as any` casts added during migration (see Step 5)
3. Remove `allowUnauthenticated` option from `withAuth` interface
4. Run `npx convex dev` to regenerate types
5. Fix any remaining client-side type errors

## Step 5: Remove `as any` casts (969 occurrences)

After Steps 1-4 are done and `args` has proper types again:

1. Remove `args: any` → let Convex infer from validator
2. Remove `_caller` unused param where not needed
3. Remove `as any` from `ctx.db.get()` calls — they'll have proper return types
4. Remove `as any` from `.map()/.filter()` callbacks — they'll infer from array type
5. Remove `// @ts-expect-error` comments

This is ~2-3 days of manual work across 60+ files. Do it file by file,
running `npx tsc --noEmit --skipLibCheck` after each to verify.

## TypeScript issue to be aware of

When wrapping handlers with `withAuth`, `ctx.db.get(someId)` returns a union type
because TypeScript loses the table inference. Fix with `as any`:

```ts
const user = (await ctx.db.get(args.userId)) as any;
```

## Verification

After migration:

```bash
# Should be 0
node -e "..." # (check unprotected count)

# Should compile
npx tsc --noEmit --skipLibCheck

# Should deploy
npx convex dev --once

# Should work in browser
# Login → Dashboard → all pages load data
```
