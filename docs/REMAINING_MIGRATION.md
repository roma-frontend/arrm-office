# Remaining Auth Migration — Manual Work

**Originally created:** 2026-05-28
**Reassessed:** 2026-06-03 (verified against live code)
**Status:** ~90% done — one focused security task left

---

## TL;DR for next session

The auth migration is almost finished. Verified state of `convex/` on 2026-06-03:

| Item                                       | State                                                        |
| ------------------------------------------ | ------------------------------------------------------------ |
| `as any` casts in convex                   | **0** ✅                                                     |
| `convex/lib/requireRequester.ts`           | **deleted** ✅                                               |
| `allowUnauthenticated: true` in handlers   | **0** ✅                                                     |
| `getAuthCaller` adoption                   | **118 handlers** ✅                                          |
| `requesterId: v.id('users')` still in args | **~60 handlers across 11 files** ❌ ← **THE remaining work** |

**The one remaining job:** replace client-supplied `requesterId` with the
server-verified caller from `getAuthCaller(ctx)`. While a handler still reads
`args.requesterId`, the **browser is asserting its own identity** — that is the
last auth-bypass surface to close.

---

## The pattern (before → after)

**Secure reference pattern** (already used in 118 handlers, e.g. `convex/productivity.ts`):

```ts
import { getAuthCaller } from './lib/getAuthCaller';

handler: async (ctx, args) => {
  const requester = await getAuthCaller(ctx); // server-verified, from JWT
  if (!requester) return []; // or throw
  // requester._id, requester.role, requester.email, requester.organizationId
};
```

`getAuthCaller(ctx)` (in `convex/lib/getAuthCaller.ts`) reads
`ctx.auth.getUserIdentity()`, looks the user up by email, checks `isActive`,
and returns `{ _id, role, email, organizationId, name }` or `null`. It does
**not** change the handler signature, so TypeScript inference is preserved.

**Insecure pattern still present** (e.g. `convex/payroll/queries.ts`):

```ts
export const getDashboardStats = query({
  args: {
    requesterId: v.id('users'),                 // ❌ client-supplied identity
    organizationId: v.optional(v.id('organizations')),
  },
  handler: async (ctx, args) => {
    const { requesterId, organizationId } = args;
    await requireOrgSupervisor(ctx, requesterId, organizationId);
    ...
  },
});
```

**Migrate to:**

```ts
export const getDashboardStats = query({
  args: {
    organizationId: v.optional(v.id('organizations')), // requesterId removed
  },
  handler: async (ctx, args) => {
    const { organizationId } = args;
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    await requireOrgSupervisor(ctx, caller._id, organizationId);
    ...
  },
});
```

Then remove `requesterId` from the corresponding **client-side calls**.

---

## Files to migrate (verified counts, 2026-06-03)

Sorted by number of `requesterId: v.id('users')` validator occurrences:

| File                                   | requesterId args | Priority |
| -------------------------------------- | ---------------- | -------- |
| `convex/learning.ts`                   | 27               | HIGH     |
| `convex/payroll/mutations.ts`          | 10               | HIGH     |
| `convex/payroll/queries.ts`            | 8                | HIGH     |
| `convex/orgchart.ts`                   | 7                | HIGH     |
| `convex/users/queries.ts`              | 2                | MED      |
| `convex/aiChatMutations.ts`            | 1                | MED      |
| `convex/chat/mutations.ts`             | 1                | MED      |
| `convex/documents.ts`                  | 1                | MED      |
| `convex/drivers/calendar_mutations.ts` | 1                | MED      |
| `convex/drivers/requests_mutations.ts` | 1                | MED      |
| `convex/faceRecognition.ts`            | 1                | MED      |

> NOTE: `convex/schema/drivers.ts` also matches `requesterId: v.` but that is a
> **schema field definition**, not a handler arg — leave it alone (or rename
> separately if the column is genuinely unused).

---

## Step-by-step procedure (per file)

For each file above, repeat:

1. Add `import { getAuthCaller } from '<relative>/lib/getAuthCaller';` if missing.
2. For every handler that declares `requesterId: v.id('users')` in `args`:
   - Remove the `requesterId` line from the `args` validator.
   - Remove `requesterId` from the destructuring of `args`.
   - Add at the top of the handler body:
     ```ts
     const caller = await getAuthCaller(ctx);
     if (!caller) throw new Error('Not authenticated'); // list queries may `return []` instead
     ```
   - Replace every use of the old `requesterId` with `caller._id`.
3. Update **client callers** of those functions: remove the `requesterId` arg they pass.
   - Find them: `grep -rn "requesterId" src --include=*.ts --include=*.tsx`
4. Run `NODE_OPTIONS="--max-old-space-size=8192" npx tsc --noEmit --skipLibCheck`
   after each file and fix any fallout before moving on.
5. Commit per logical file/group (e.g. `refactor(payroll): use getAuthCaller instead of client requesterId`).

---

## Final cleanup (after all 11 files done)

1. Verify zero remaining: `grep -rn "requesterId: v\." convex --include=*.ts`
   → only `convex/schema/drivers.ts` (schema field) may remain.
2. Remove `allowUnauthenticated` from the `withAuth` interface in
   `convex/lib/withAuth.ts` (lines ~35 and ~50) — no handler passes it anymore.
   (Optional: if `withAuth` itself is fully unused, delete the helper.)
3. `npx convex dev --once` to regenerate types.
4. Full typecheck + deploy.

---

## Verification checklist

```bash
# 1. No client-supplied identity left (only schema/drivers.ts allowed)
grep -rn "requesterId: v\." convex --include=*.ts

# 2. No client code still passing requesterId
grep -rn "requesterId" src --include=*.ts --include=*.tsx

# 3. Compiles
NODE_OPTIONS="--max-old-space-size=8192" npx tsc --noEmit --skipLibCheck

# 4. Deploys
npx convex dev --once

# 5. Manual smoke test in browser:
#    Login (email + Google) → Dashboard → Payroll → Learning → Org chart
#    → confirm every page still loads data (auth now comes from JWT, not args)
```

When all five pass with no `requesterId` left in handler args, the migration is
**100% complete**: every Convex handler derives identity from the verified JWT,
not from client input.

---

## Risk / rollout notes

- These functions are protected by `requireOrgSupervisor` / `requireOrgAdmin`
  RBAC checks today, but those checks trust the **passed** `requesterId`. The
  switch to `getAuthCaller(ctx)` is what makes the RBAC check trustworthy.
- The Convex auth bridge (JWT → `ctx.auth.getUserIdentity()`) is confirmed
  working in production as of 2026-06-03 (all login flows fixed). So
  `getAuthCaller` will resolve correctly for authenticated users.
- Do it file-by-file with a typecheck between each — `payroll/*` and `learning.ts`
  are the largest and most worth doing first.

---

## Historical notes — Step 5 (`as any` removal), completed 2026-06-02

Client-side `as any` audit COMPLETE. ~140 client casts → load-bearing ones removed
via root-cause type fixes; genuine library/boundary/test casts classified and kept.

**Real bugs surfaced by removing load-bearing casts:**

- **Attendance** — `getTodayAllAttendance` did not compute `supervisorName`, so the
  supervisor block in `AttendanceDetailModal` never rendered. Fixed query to resolve supervisor.
- **Support tickets** — `getTicketById` did not return `isOverdue`, so the "overdue" badge in the
  ticket detail dialog never showed. Added the field (same logic as `getAllTickets`).
- **Subscriptions** — `subscriptions` table was missing `stripePriceId` / `metadata` (written by
  `createManualSubscription`) → manual-subscription writes failed at runtime under schema validation;
  and `listAllWithUsers` did not return `organizationName/Slug/employeeCount/isManual` that the UI read.
  Added schema fields + enriched the query.
- **Push notifications** — `applicationServerKey` cast hid a real lib-type mismatch
  (`Uint8Array<ArrayBufferLike>` vs `BufferSource`). Fixed `urlBase64ToUint8Array` return type.

**Lesson:** `get_errors` (language server) can miss lib-type mismatches that full `tsc` catches —
always run a full `tsc` after a batch, not just per-file checks.
