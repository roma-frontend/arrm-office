# Convex Auth Bridging Proposal

**Status:** draft for discussion · **Owner:** TBD · **Created:** 2026-05-27

## TL;DR

Today our Convex functions can't independently verify the caller's identity:
`ctx.auth.getUserIdentity()` always returns `null` because the browser
`ConvexProvider` is not wrapped in `ConvexProviderWithAuth`. As a result, every
Convex function that takes `requesterId: Id<'users'>` (in `lib/rbac.ts`,
`lib/requireRequester.ts`, ~30 callsites) trusts whatever `requesterId` the
client passes — a browser caller can spoof it to read or mutate any user's data.

**The good news:** the supporting infrastructure is already in the repo:

- `scripts/generateKeys.mjs` generates an RS256 key pair.
- `convex/http.ts` serves `/.well-known/jwks.json` from a `JWKS` env var.
- `convex/auth.config.ts` declares an OIDC provider pointing at our own
  `CONVEX_SITE_URL`.

The only missing pieces are: (a) the app must sign tokens with the matching
RS256 private key (today it signs HS256 with `JWT_SECRET`), and (b) the React
client needs `ConvexProviderWithAuth` so it can hand that token to Convex.

This doc lays out the migration. Estimated effort: 1 short PR for the wiring,
then 3–5 small follow-up PRs to migrate callsites to `withAuth`.

---

## Current state

### What we have

| Piece                | Location                                               | Purpose                                                                   |
| -------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------- |
| RS256 key generator  | `scripts/generateKeys.mjs`                             | Produces `CONVEX_AUTH_PRIVATE_KEY` + `JWKS`                               |
| JWKS endpoint        | `convex/http.ts` (`/.well-known/jwks.json`)            | Serves the public key Convex will use to verify tokens                    |
| OIDC discovery       | `convex/http.ts` (`/.well-known/openid-configuration`) | Required by Convex's OIDC validator                                       |
| Auth provider config | `convex/auth.config.ts`                                | Tells Convex "trust JWTs whose `iss` matches `CONVEX_SITE_URL`"           |
| App-side JWT signing | `src/lib/jwt.ts` (`signJWT`)                           | **Currently HS256 with `JWT_SECRET`** — not what `auth.config.ts` expects |
| Edge auth check      | `src/proxy.ts` (`isValidJWT`)                          | Verifies `hr-auth-token` cookie via the same `JWT_SECRET`                 |
| Convex client        | `src/lib/convex.tsx`                                   | Uses bare `ConvexProvider` — no auth bridge                               |
| `withAuth` helper    | `convex/lib/withAuth.ts`                               | Already written, but unusable while `getUserIdentity()` returns null      |

### What it would take

The two infrastructure halves don't talk to each other today. Concretely:

1. The app signs tokens with HS256 (`JWT_SECRET`).
2. Convex expects RS256-signed tokens it can verify against `JWKS`.
3. The browser never sends the token to Convex anyway, because there is no
   auth bridge in the React provider.

Closing the gap means switching app-issued JWTs from HS256 to RS256 and
plugging the JWT into `ConvexProviderWithAuth` so the Convex SDK sends it on
every request.

---

## Migration plan

### Phase 1 — Wire the bridge (1 PR, ~half a day)

**Goal:** `ctx.auth.getUserIdentity()?.email` returns the logged-in user's
email in every Convex query/mutation. No callsite migrations yet.

**Steps:**

1. **Generate the key pair (once, ops):**

   ```powershell
   node scripts/generateKeys.mjs > keys.tmp
   ```

   Out comes two env values. Set:
   - In Convex (via `npx convex env set`): `JWKS=<...>`
   - In Vercel project env (Production + Preview): `CONVEX_AUTH_PRIVATE_KEY=<...>`,
     `CONVEX_SITE_URL=https://<deployment>.convex.site`
   - Local `.env.local`: same two values (use a separate dev key pair).

2. **Add an RS256 signer alongside the existing HS256 one in
   `src/lib/jwt.ts`.** Keep the HS256 path so the edge middleware
   (`src/proxy.ts`) keeps working without re-architecting:

   ```ts
   // existing — HS256, used by middleware to verify hr-auth-token cookie
   export async function signJWT(payload, expiresIn = '7d') {
     /* … */
   }

   // NEW — RS256, used by Convex auth (issued with the same payload)
   export async function signConvexJWT(payload, expiresIn = '7d') {
     const pk = await importPKCS8(process.env.CONVEX_AUTH_PRIVATE_KEY!, 'RS256');
     return new SignJWT({ ...payload })
       .setProtectedHeader({ alg: 'RS256' })
       .setIssuer(process.env.CONVEX_SITE_URL!)
       .setAudience('convex')
       .setSubject(payload.userId)
       .setIssuedAt()
       .setExpirationTime(expiresIn)
       .sign(pk);
   }
   ```

3. **Wherever we set `hr-auth-token` cookie, also issue a Convex token and
   set a separate cookie `convex-auth-token`** (httpOnly, sameSite: 'lax',
   secure in prod). Affected files:
   - `src/app/api/auth/login/route.ts`
   - `src/app/api/auth/face-login/route.ts`
   - `src/app/api/auth/oauth-session/route.ts`
   - `src/app/api/auth/create-session/route.ts`
   - `src/actions/auth.ts` (refresh + login paths)
   - `src/actions/update-profile.ts` (if profile fields go into the payload)

4. **Wrap the React tree in `ConvexProviderWithAuth`** in `src/lib/convex.tsx`:

   ```tsx
   import { ConvexProviderWithAuth, ConvexReactClient } from 'convex/react';

   function useAuthForConvex() {
     // Read convex-auth-token from a non-httpOnly mirror cookie OR fetch
     // /api/auth/convex-token. The latter is cleaner — keeps the Convex
     // token httpOnly. Cache the fetch result; refresh when it 401s.
     return {
       isLoading: false,
       isAuthenticated: !!token,
       fetchAccessToken: async () => token,
     };
   }
   ```

   The detail to design: how does the browser actually obtain the token if
   the cookie is httpOnly? Two options:
   - **Mirror cookie**: set `convex-auth-token-public` (non-httpOnly) with
     the same value. Slightly weaker — XSS can read it.
   - **Token endpoint**: `GET /api/auth/convex-token` returns the current
     token to the same-origin browser session. Stronger; needs a tiny
     handler that reads the httpOnly cookie and returns it.

   I recommend the token endpoint.

5. **Smoke-test on staging.** Add a temporary log in any Convex query:
   ```ts
   console.log('[auth-bridge]', await ctx.auth.getUserIdentity());
   ```
   Confirm it returns `{ email, sub, ... }` for a logged-in user.

**Out of scope for Phase 1:** zero callsite changes. We're only proving the
bridge works.

### Phase 2 — Migrate one domain as the reference (1 PR, ~half a day)

Pick the smallest existing consumer of the trusted-userId pattern:

- **`convex/productivity.ts`** — 1 callsite (`requireRequester`).
- **`convex/faceRecognition.ts`** — 1 callsite, but auth-critical, save for last.

For each `requireRequester(ctx, requesterId)` callsite, replace with `withAuth`:

```ts
// before
export const myQuery = query({
  args: { requesterId: v.id('users') },
  handler: async (ctx, { requesterId }) => {
    const requester = await requireRequester(ctx, requesterId);
    // …
  },
});

// after
export const myQuery = query({
  args: {}, // requesterId no longer needed
  handler: withAuth({}, async (ctx, _args, caller) => {
    // caller is { _id, role, email, organizationId, name }
    // …
  }),
});
```

Update the React client side to drop `requesterId` from `useQuery` args.

### Phase 3 — Roll the migration through every domain (~5 PRs)

In order of risk (easiest → riskiest):

1. `convex/productivity.ts`
2. `convex/orgchart.ts` (4 callsites)
3. `convex/analytics.ts` (4 callsites)
4. `convex/leaves/queries.ts` (4 callsites) + `leaves/mutations.ts`
5. `convex/users/queries.ts` (4 callsites) + `users/mutations.ts`
6. `convex/tasks.ts` (3 callsites)
7. `convex/documents.ts`
8. `convex/faceRecognition.ts` (auth-critical — last)

Each PR has a strict "no behavior change" rule: same data returned, same
errors thrown for unauthenticated callers. The only difference is _who_ is
trusted (verified identity instead of arbitrary `requesterId` arg).

Across PRs, also delete `convex/lib/requireRequester.ts` and replace
`convex/lib/rbac.ts` with re-exports from `withAuth.ts` (keep the file as a
shim during transition so unmigrated callsites still compile).

### Phase 4 — Cleanup (1 PR)

- Delete `lib/requireRequester.ts` once unreferenced.
- Delete `lib/rbac.ts` shim.
- Remove the legacy `requesterId` arg validators across the whole codebase.
- Delete vestigial `oauth-session` cookie reads from API routes (the
  `chore/security-and-i18n-quick-wins` PR already removed the auth bypass
  in `proxy.ts`; the API-route fallbacks remain harmless dead code).

---

## Risks & mitigations

| Risk                                                   | Mitigation                                                                                                                                                                                            |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Breaking auth in production during Phase 1 wiring      | Stage the rollout: add the new cookie, watch logs; keep the old `hr-auth-token` flow running in parallel. The bridge does not gate any existing call until Phase 2.                                   |
| Browser fails to obtain the Convex token after sign-in | The `useAuthForConvex` hook should poll `/api/auth/convex-token` after login. If 401, return `isAuthenticated: false` and let the user be redirected to login normally.                               |
| Token rotation / refresh                               | Use the same 7-day expiry as `hr-auth-token`. Add a refresh endpoint that re-issues both cookies given a still-valid `hr-session-token`. Already exists for `hr-auth-token` in `src/actions/auth.ts`. |
| RS256 key compromise                                   | The private key lives only in Vercel + Convex env. Rotation procedure: re-run `scripts/generateKeys.mjs`, update both env vars, redeploy. Old tokens invalidate on next refresh; users re-login.      |
| Edge runtime can't import PKCS8                        | `jose`'s `importPKCS8` is Edge-compatible. `proxy.ts` already imports `jose`.                                                                                                                         |
| Existing callsites break before migration              | They don't — Phase 1 only adds a new path. Old code keeps using `requesterId`. Migration is opt-in per callsite in Phase 2/3.                                                                         |

## Verification

For each phase, a checklist:

**Phase 1:**

- [ ] `npx convex env list` shows `JWKS` set.
- [ ] Vercel env shows `CONVEX_AUTH_PRIVATE_KEY` and `CONVEX_SITE_URL`.
- [ ] After login, `document.cookie` shows `convex-auth-token` (or the
      `/api/auth/convex-token` endpoint returns a valid JWT).
- [ ] In a temp Convex query, `ctx.auth.getUserIdentity()?.email` matches
      the logged-in user.
- [ ] All 255 unit tests still pass.
- [ ] All 4 e2e specs still pass on staging.

**Phase 2 (per migrated callsite):**

- [ ] Function works for the legitimate caller (own `userId`).
- [ ] Function rejects with "Not authenticated" if called without the cookie.
- [ ] Function rejects with "Forbidden: requires <role>" if a low-role user
      hits an admin-only function.
- [ ] No regression in the page that consumes the function (manual smoke).

## Open questions for the team

1. **Who owns key rotation?** The RS256 private key is shared between Convex
   and Vercel envs. Document the rotation runbook before Phase 1 lands.
2. **Should we have separate dev / staging / prod key pairs?** Strongly yes
   — losing dev keys to a teammate's laptop must not affect production.
3. **Should we deprecate `hr-auth-token` over time and use the Convex token
   for everything (including middleware)?** That would simplify the auth
   surface to one cookie. But it requires the Edge middleware to verify
   RS256 — `jose.jwtVerify` already supports it, so this is feasible. Out
   of scope for the initial migration; revisit after Phase 4.

---

## Implementation snippets (copy-paste ready)

### 1. `src/lib/jwt.ts` — add `signConvexJWT`

Add after the existing `verifyJWT` export. No changes to existing functions.

```ts
import { importPKCS8 } from 'jose'; // already in package.json

export async function signConvexJWT(
  payload: JWTPayload,
  expiresIn: string = '7d',
): Promise<string> {
  const rawKey = process.env.CONVEX_AUTH_PRIVATE_KEY;
  if (!rawKey) throw new Error('CONVEX_AUTH_PRIVATE_KEY is not set');
  const pk = await importPKCS8(rawKey.replace(/\\n/g, '\n'), 'RS256');
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(process.env.CONVEX_SITE_URL!)
    .setAudience('convex')
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(pk);
}
```

### 2. `src/lib/set-auth-cookies.ts` — shared helper (new file)

Centralises cookie-setting so every login path issues both tokens atomically.

```ts
import { cookies } from 'next/headers';
import { signJWT, signConvexJWT, type JWTPayload } from './jwt';

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 7, // 7 days
};

export async function setAuthCookies(payload: JWTPayload) {
  const [hrToken, convexToken] = await Promise.all([signJWT(payload), signConvexJWT(payload)]);
  const jar = await cookies();
  jar.set('hr-auth-token', hrToken, COOKIE_OPTS);
  jar.set('convex-auth-token', convexToken, COOKIE_OPTS);
}

export async function clearAuthCookies() {
  const jar = await cookies();
  jar.delete('hr-auth-token');
  jar.delete('convex-auth-token');
}
```

Then replace the inline `cookies().set('hr-auth-token', ...)` calls in:

- `src/app/api/auth/login/route.ts`
- `src/app/api/auth/face-login/route.ts`
- `src/app/api/auth/oauth-session/route.ts`
- `src/app/api/auth/create-session/route.ts`
- `src/app/api/auth/refresh-session/route.ts`
- `src/actions/auth.ts` (login + refresh paths)

with `await setAuthCookies(payload)`.

### 3. `src/app/api/auth/convex-token/route.ts` — token endpoint (new file)

The browser calls this to get the Convex token without it being readable via JS
(the `convex-auth-token` cookie stays httpOnly).

```ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, signConvexJWT } from '@/lib/jwt';

export async function GET(_req: NextRequest) {
  const jar = await cookies();

  // Fast path: Convex token already set
  const existing = jar.get('convex-auth-token')?.value;
  if (existing) return NextResponse.json({ token: existing });

  // Fallback: re-derive from hr-auth-token (handles sessions created before
  // the bridge was deployed)
  const hrToken = jar.get('hr-auth-token')?.value;
  if (!hrToken) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const payload = await verifyJWT(hrToken);
  if (!payload) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const convexToken = await signConvexJWT(payload);
  return NextResponse.json({ token: convexToken });
}
```

### 4. `src/lib/convex.tsx` — wrap with `ConvexProviderWithAuth`

```tsx
'use client';

import { ConvexProviderWithAuth, ConvexReactClient } from 'convex/react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

let convexInstance: ConvexReactClient | null = null;
function getConvexClient() {
  if (!convexInstance) {
    convexInstance = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!, {
      unsavedChangesWarning: false,
    });
  }
  return convexInstance;
}

function useAuthForConvex() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  const fetchToken = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/convex-token');
      if (!res.ok) {
        setToken(null);
        return null;
      }
      const { token: t } = await res.json();
      setToken(t);
      return t as string;
    } catch {
      setToken(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetchToken();
    }
  }, [fetchToken]);

  return {
    isLoading: loading,
    isAuthenticated: !!token,
    fetchAccessToken: fetchToken,
  };
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const client = getConvexClient();
  return (
    <ConvexProviderWithAuth client={client} useAuth={useAuthForConvex}>
      {children}
    </ConvexProviderWithAuth>
  );
}

export function useConvexAuthReady(): boolean {
  return true;
}
```

### 5. Smoke-test query (temporary, delete after Phase 1 verification)

Add to any existing Convex query file, call it from the browser console:

```ts
// convex/debug.ts  ← delete this file after Phase 1 is verified
import { query } from './_generated/server';

export const whoAmI = query({
  args: {},
  handler: async (ctx) => ctx.auth.getUserIdentity(),
});
```

```ts
// Browser console (after login):
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
const identity = useQuery(api.debug.whoAmI);
console.log(identity); // should print { email, sub, ... }
```

---

## Env var checklist

| Variable                  | Where to set                                       | How to get                                                 |
| ------------------------- | -------------------------------------------------- | ---------------------------------------------------------- |
| `CONVEX_AUTH_PRIVATE_KEY` | Vercel env (all envs) + `.env.local`               | `node scripts/generateKeys.mjs`                            |
| `JWKS`                    | Convex dashboard (`npx convex env set JWKS '...'`) | same script output                                         |
| `CONVEX_SITE_URL`         | Vercel env + `.env.local`                          | Convex dashboard → Deployment URL (ends in `.convex.site`) |

Use **separate key pairs** for dev, preview, and production.
