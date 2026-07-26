# Changelog

All notable changes to Strata.

## [Unreleased] — 2026-05-16

### ✨ Features

- add changelog generation, Storybook setup, k6 load test (317c282)
- a11y, SEO, PWA, rate limiting, image optimization, perf budgets (95b0762)
- **auth:** migrate 39 mutations to requireAuthUser(ctx) RBAC (c8403ef)
- **auth:** migrate organizations + users to ctx.auth RBAC (d635316)
- **auth:** integrate Convex auth with NextAuth JWT (283d362)

### 🐛 Bug Fixes

- add requireRequester session validation to all queries (4c2f466)
- add missing translations for document templates (RU/HY) (28cc0f2)
- **dashboard:** superadmin 'all orgs' shows all data, not own org (a882be6)
- **dashboard:** convert null orgId to undefined for validator (4772cae)
- **dashboard:** pass selectedOrgId to aggregated queries (49c6809)
- **convex:** remove db.insert from getProfile (queries cannot write) (41ff725)
- **navbar:** use window.location.replace for clean logout (abd61f4)
- **ui:** make feature card description text darker (003a818)
- **navbar:** fix null user crash and restore logout() (b2c451a)
- **ui:** make Learn More link always visible in feature cards (8ae12ae)
- **ui:** hide sign-in buttons during logout transition (e304dab)
- **ui:** hard redirect on logout to prevent navbar flash (488483f)
- **ui:** redirect before clearing store on logout to prevent flash (6dd51af)
- **auth:** use bcrypt sync methods (Convex runtime no setTimeout) (5887fb4)
- revert to stable state (plain ConvexProvider, no ctx.auth mutations) (459e1dc)
- **rbac:** replace isSuperadminEmail with isSuperadmin(role) in rbac.ts (8b37429)
- **auth:** correct CONVEX_SITE_URL (JWT issuer fix) (e82d091)
- remove duplicate error lines in getAllOrganizations (e0bef38)
- restore original getAllOrganizations guard logic (7c9673d)
- **auth:** add requesterId/adminId fallback to all migrated queries (88cb5e6)
- **auth:** add superadminUserId fallback while JWT transition (f501bf4)
- **auth:** graceful auth fallback for queries when JWT not yet available (fed8a68)
- **auth:** getAllOrganizations returns user's org for non-superadmin (af50893)
- **convex:** re-apply isSuperadmin() migration to organizations and users/queries (6fe5499)
- revert dashboard page to 'use client' (fixes superadmin access) (9e5f660)

### ⚡ Performance

- input sanitization, split modules.json, remove getProfile double read (b05e014)
- lazy i18n namespaces, dashboard queries, RSC pages, optimistic tasks (7d33730)
- **face-login:** speed up detection (300ms interval, +34 progress, 2s cooldown) (4dac799)

### ♻️ Refactoring

- **chat:** replace all 41 any types with proper interfaces (877c002)
- **convex:** migrate 35+ files to read profile fields from userProfiles (4904824)
- split users table into userProfiles + userSettings (3dfa364)
- **convex:** complete SUPERADMIN_EMAIL to isSuperadmin() migration (0a2b4ab)

### 📝 Documentation

- finalize migration plan, add next steps roadmap (5f90f56)
- update migration plan with completed tasks (d6a151d)
- update plan with current status and next tasks (881b5e2)
- update migration plan with current status (4239837)

### ✅ Tests

- **e2e:** rewrite Playwright tests with auth fixture and real flows (a929216)

## [Unreleased] — 2026-05-16

### ✨ Features

- a11y, SEO, PWA, rate limiting, image optimization, perf budgets (95b0762)
- **auth:** migrate 39 mutations to requireAuthUser(ctx) RBAC (c8403ef)
- **auth:** migrate organizations + users to ctx.auth RBAC (d635316)
- **auth:** integrate Convex auth with NextAuth JWT (283d362)

### 🐛 Bug Fixes

- add requireRequester session validation to all queries (4c2f466)
- add missing translations for document templates (RU/HY) (28cc0f2)
- **dashboard:** superadmin 'all orgs' shows all data, not own org (a882be6)
- **dashboard:** convert null orgId to undefined for validator (4772cae)
- **dashboard:** pass selectedOrgId to aggregated queries (49c6809)
- **convex:** remove db.insert from getProfile (queries cannot write) (41ff725)
- **navbar:** use window.location.replace for clean logout (abd61f4)
- **ui:** make feature card description text darker (003a818)
- **navbar:** fix null user crash and restore logout() (b2c451a)
- **ui:** make Learn More link always visible in feature cards (8ae12ae)
- **ui:** hide sign-in buttons during logout transition (e304dab)
- **ui:** hard redirect on logout to prevent navbar flash (488483f)
- **ui:** redirect before clearing store on logout to prevent flash (6dd51af)
- **auth:** use bcrypt sync methods (Convex runtime no setTimeout) (5887fb4)
- revert to stable state (plain ConvexProvider, no ctx.auth mutations) (459e1dc)
- **rbac:** replace isSuperadminEmail with isSuperadmin(role) in rbac.ts (8b37429)
- **auth:** correct CONVEX_SITE_URL (JWT issuer fix) (e82d091)
- remove duplicate error lines in getAllOrganizations (e0bef38)
- restore original getAllOrganizations guard logic (7c9673d)
- **auth:** add requesterId/adminId fallback to all migrated queries (88cb5e6)
- **auth:** add superadminUserId fallback while JWT transition (f501bf4)
- **auth:** graceful auth fallback for queries when JWT not yet available (fed8a68)
- **auth:** getAllOrganizations returns user's org for non-superadmin (af50893)
- **convex:** re-apply isSuperadmin() migration to organizations and users/queries (6fe5499)
- revert dashboard page to 'use client' (fixes superadmin access) (9e5f660)

### ⚡ Performance

- input sanitization, split modules.json, remove getProfile double read (b05e014)
- lazy i18n namespaces, dashboard queries, RSC pages, optimistic tasks (7d33730)
- **face-login:** speed up detection (300ms interval, +34 progress, 2s cooldown) (4dac799)

### ♻️ Refactoring

- **chat:** replace all 41 any types with proper interfaces (877c002)
- **convex:** migrate 35+ files to read profile fields from userProfiles (4904824)
- split users table into userProfiles + userSettings (3dfa364)
- **convex:** complete SUPERADMIN_EMAIL to isSuperadmin() migration (0a2b4ab)

### 📝 Documentation

- finalize migration plan, add next steps roadmap (5f90f56)
- update migration plan with completed tasks (d6a151d)
- update plan with current status and next tasks (881b5e2)
- update migration plan with current status (4239837)

### ✅ Tests

- **e2e:** rewrite Playwright tests with auth fixture and real flows (a929216)
