# Redesign — state, decisions, what is left

Working document for the Spark-inspired redesign. Read the **Palette** section
before touching any colour: several of the choices in it look wrong until you
know which alternatives were already tried and rejected.

---

## 1. Where things stand

### Foundation (done)

| Piece                            | File                                                              |
| -------------------------------- | ----------------------------------------------------------------- |
| Design tokens (3 layers)         | `src/styles/tokens.css`                                           |
| Depth / glass / motion / focus   | `src/styles/spark.css`                                            |
| Dark-mode palette compatibility  | `src/styles/dark-compat.css`                                      |
| Import order + Tailwind `@theme` | `src/app/globals.css`                                             |
| Chart colours (single source)    | `src/lib/chart-theme.ts`                                          |
| Navigation model                 | `src/lib/nav.ts`                                                  |
| Slide-over primitive             | `src/components/ui/sheet.tsx`, `ui/detail-sheet.tsx`              |
| Shared wizard stepper            | `src/components/ui/wizard-stepper.tsx`                            |
| Command palette (⌘K / Ctrl+K)    | `src/components/search/CommandPalette.tsx`                        |
| Contextual AI on text fields     | `src/components/ai/AiTextActions.tsx`, `api/ai/rewrite`           |
| "Today's focus" dashboard lead   | `src/components/dashboard/FocusFeed.tsx`                          |
| "Draft saved. Restore?" prompt   | `src/components/ui/DraftResumeBar.tsx`, `hooks/useDraftResume.ts` |

### Primitives rebuilt

`button`, `card`, `badge`, `input`, `textarea`, `wizard`, `WizardDraftNotice`.
Ripple removed in favour of `.press-subtle` (a 90ms scale — no DOM work, and it
respects `prefers-reduced-motion`).

### Converted from centred dialog → slide-over

Calendar: `CreateEventModal`, `LeaveRequestModal`, `DriverRequestModal`,
`DayDetailsModal`, `EventTimelineModal`.
Employees: `AddEmployeeModal`, `EditEmployeeModal`, `EditExtendedProfileModal`,
department + position wizards (4 files), `EmployeeSheet`.
Tasks: create wizard, `TaskSheet`. Leaves: `LeaveSheet`.
Monoliths: candidate detail + vacancy wizard (`RecruitmentClient`), objective
detail + objective wizard (`GoalsClient`), asset wizard (`AssetsClient`).

Confirmation dialogs stay centred on purpose — a confirm has no context to
preserve, so a panel would be the wrong affordance.

### Verification

Everything below passes as of this commit:

```
npm run lint                                        # eslint
npx prettier --check "**/*.{ts,tsx,js,jsx,json,css,md}"
npm run check:locales
npx tsc --noEmit
npm run test:coverage -- --ci                       # 402 suites / 9205 tests
npm run build
```

Coverage sits just above the floor in `jest.config.js`
(statements 70.9 / 61 · branches 62.6 / 61 · functions 65.4 / 63 · lines 72.0 / 70).
**Adding a large untested component can push it under and fail CI** — check
locally with `npm run test:coverage` before pushing.

---

## 2. Palette — read this first

### Light theme: the original, restored

An earlier pass replaced the light palette with true neutrals. That was
reverted. The light theme is deliberately **blue-tinted**: `#f0f6ff` canvas,
`#c7d9f5` borders, `#0c1a2e / #1e3a6e / #3d6196` ink, brand-tinted shadows. The
tint is the product's identity, not an accident. Do not neutralise it.

### Dark theme: the original navy, restored

Saturated navy — `#060e1e` canvas, `#0d1e38` cards, hue ~220° at 55–70%
saturation, ink `#e8f0fe / #bdd4fa / #7ab3f5`.

Four alternatives were built and rejected, in this order:

1. **Neutral graphite** (`#17191f`) — read as "the lights are off".
2. **Mid-tone blue slate** (`#232b3a`) — too washed out.
3. **Windows 11 Settings-like** (`#1b2027` page, `#272c36` cards) — same problem.
4. **Half-saturated navy** (`#0f1727`, 40%) — read as dark grey.

The conclusion that matters: **the saturation is the identity.** Every attempt to
lower it was rejected on sight. If eye strain comes up again, the levers are
_not_ the surface saturation — they are the things layered on top of it:

- large brand fills (see `--brand-panel` below),
- stray bright light-palette utilities (see `dark-compat.css` below),
- `--input-border: #2563eb` — a saturated blue edge on every input at rest.
  Moving it to `--border-strong` and keeping blue only on `:focus` is the
  cheapest remaining win if it is raised again.

### `--brand-panel` — the one addition to the restored palette

Area changes what a colour does. `--brand` is correct on a 36px button and reads
as a lit slab across a 200px banner, which is why the profile hero and the Time
Tracker header stood out from everything else. Those use `.brand-panel`
(spark.css) → `--brand-panel`, the same hue two steps deeper.

**Use `.brand-panel`, not `.btn-gradient`, for anything larger than a button.**
Applied so far: `EmployeeProfileHero`, `CheckInOutWidget` header.

### `dark-compat.css` — migration shim, not an API

~3800 raw Tailwind palette utilities remain in the app (`bg-green-100
text-green-800` chips, `text-gray-600` labels). They look fine on the light theme
and are illegible or garish on the dark one. The shim maps them onto semantic
tokens **in dark mode only**, and skips any element that already declares its own
`dark:` variant (`:not([class*='dark:bg-'])`).

Deliberately excluded: `bg-white` and `border-white`. An audit found most bare
uses are switch knobs, QR codes and signature pads, which must stay white or
they stop working.

New code reads tokens (`bg-(--success-quiet)`, `text-(--text-secondary)`). The
shim exists so the old code does not have to be rewritten in one pass.

---

## 3. What is left

Ordered by user-visible impact.

### 3.1 Retire the palette shim, file by file (large, mechanical, safe)

The shim makes the dark theme correct; it does not make the code good. Highest
concentrations of raw palette classes:

| Count | File                                                         |
| ----- | ------------------------------------------------------------ |
| 104   | `src/components/strategy-map/BalancedScorecardDashboard.tsx` |
| 80    | `src/components/ui/SmartBanner.tsx`                          |
| 71    | `src/components/tasks/TaskDetailClient.tsx`                  |
| 70    | `src/components/strategy-map/StrategyMapsClient.tsx`         |
| 67    | `src/app/(dashboard)/superadmin/support/page.tsx`            |
| 66    | `src/components/goals/GoalDetailClient.tsx`                  |
| 62    | `src/components/recognition/RewardsTab.tsx`                  |
| 59    | `src/components/RecruitmentClient.tsx`                       |

Pattern to apply: `bg-X-100 text-X-800` → `bg-(--X-quiet) text-(--X-text)`, or
better, a `Badge variant`. Delete lines from `dark-compat.css` as call sites are
converted; the file is the checklist.

### 3.2 Remaining centred dialogs (89 `DialogContent` left)

The create/edit flows are converted. What remains is mostly correct as a dialog
(confirms, small pickers) plus a handful that should be panels:

- `HiringPacketPanel.tsx:1039` — document preview at `max-w-4xl`.
- `OnboardingClient.tsx` / `OffboardingClient.tsx` — multi-step, both still
  centred and both still carry their own hand-rolled stepper.
- `DocumentUploadWizard.tsx` / `DocumentTemplateWizard.tsx` — same.
- `SurveysClient.tsx`, `compensation/*Wizard.tsx` (4 files) — same.

All of these should also drop their local stepper for `WizardStepper`.

### 3.3 Steppers still duplicated

`WizardStepper` replaced the copies in `ui/wizard`, `LeaveRequestWizard`,
`CreateEventModal`, `RecruitmentClient` and `GoalsClient`. Still hand-rolled:
`OnboardingClient`, `OffboardingClient`, `DocumentUploadWizard`.

### 3.4 Draft-restore prompt: wire up the rest

`DraftResumeBar` + `useDraftResume(key, !isOpen)` is live on the calendar (event

- leave), tasks board and employees list. Draft keys with no prompt yet:
  `create-survey`, `create-asset`, `create-leave`, `create-vacancy`,
  `create-objective`, `document-template`, `document-upload`, `request-driver`,
  `driver-block-time`, `bonus-program`, `compensation-band`,
  `compensation-record`, `review-cycle`, `service-broadcast`,
  `create-department`, `create-position`.

Two lines per page: the hook next to the modal's `open` state, and the bar next
to the modal.

### 3.5 Imperative focus styling

`onFocus={(e) => (e.target.style.borderColor = '#2563eb')}` was removed from the
four auth pages, the employee modals and `NewConversationModal` in favour of the
`Input` primitive. Remaining: `register-org/request/page.tsx` and
`onboarding/select-organization/page.tsx` (search field).

### 3.6 Calendar UX from the original brief, not yet started

- Attendee avatars inside the month grid, with a hover card.
- Smart Time Finder — "free for all three: 15:30–16:00". The data is already
  there: `slotAvailability` in `src/lib/meetingRooms.ts` and the leave list
  `CreateEventModal` already receives.
- Drag & resize events to change time.

### 3.7 Floating AI assistant

`AiTextActions` covers in-context rewriting on task descriptions and the news
composer. The brief also asked for a persistent floating assistant available on
any page with a keyboard shortcut. `useGlobalShortcut` and the command palette
give the plumbing; `ChatWidgetButton` / `ChatWidgetWindow` exist but are not
wired to a global shortcut.

---

## 4. Conventions

- **Tokens, never hex.** `bg-(--surface-2)`, `text-(--text-muted)`,
  `border-(--border-default)`. Semantic radius: `rounded-field/control/card/panel/sheet/pill`.
- **Type scale:** `text-caption/label/body/heading/title/display`. Max weight 600.
- **Elevation:** resting content is flat. Only one thing is raised, and only
  while hovered. `.hover-elev` raises exactly one step and never scales.
- **Glass** (`.glass`, `.glass-strong`) on floating layers only — navbar,
  command palette, sheet header, dock. Never on cards.
- **Numbers** get `.num` (tabular figures), or dashboards twitch as values tick.
- **Sheets:** `SheetHeader` / `SheetBody` / `SheetFooter`. Body is the only
  scrolling region. Pass either a `SheetTitle` child _or_ the `label` prop, never
  both — two elements would share one id.
- **Tests follow intent, not pixels.** Assert `data-slot`, `aria-*` and Badge
  variants; never a hex or a utility class. When a test asserted
  `style.borderColor`, the fix was `aria-invalid`, not a new colour literal.

## 5. Local checks before pushing

CI runs lint → type-check → unit tests (with coverage thresholds) → build → e2e.
The two that actually catch redesign work:

```bash
npx prettier --check "**/*.{ts,tsx,js,jsx,json,css,md}"   # blocks on any file
npm run test:coverage -- --ci                              # blocks under threshold
```

`CalendarClient.test.tsx` is slow (~90s under coverage) and has been seen to
flake on a driver-row assertion under parallel load. Re-run it alone before
assuming a real break.

---

## 6. Dashboard redesign — every frequently-used tool one glance away

Status: **planned**. The landing and the app shell are done; the dashboard is the
next surface users actually live in, and it is still a vertical stack of widgets
that buries the tools people reach for every day under scroll.

### 6.1 The problem

- The dashboard is a **single scrolling column**: FocusFeed → banners →
  check-in → 2 stat tiles → leave charts → recent leaves → activity → strategy
  → quick actions. Anything below the fold needs scroll, and the order is the
  same for a driver, an employee and a superadmin.
- All ~60 destinations live in the sidebar under 8 groups. The command palette
  (⌘K) already solves "I know the name" — but **discovery of what is mine
  today** still takes hunting.
- There is no notion of "what I use a lot". A payroll admin scrolls past the
  same leave charts every morning to reach the tools they actually open.

### 6.2 Principles (from dashboard-UX research)

1. **Actionable beats informative.** A dashboard answers "what needs me today"
   and lets the answer be acted on in place (FocusFeed already does this — keep
   it as the lead block, it is the one part that is already right).
2. **Frequent tools are surfaced, not discovered.** Recency + frequency should
   drive what is prominent, not a hardcoded editorial order.
3. **Zero hunting.** The top of the dashboard must be a self-serve map of the
   modules, so a first-day user sees the whole product at once.
4. **One role, one layout.** Employee, manager and admin dashboards differ in
   substance, so the default layout must differ too — and users can pin the
   order that fits their week.
5. **Progressive disclosure.** One glance shows the map; depth is one click
   away. Never recreate a whole module on the dashboard.

### 6.3 The plan — a "module dock" at the top of the dashboard

Add a compact, always-visible **tool dock** between the header and the Focus
Feed (or merged into the header row on desktop):

- **Every module as a small tile** (icon + label), role-filtered, in a
  responsive grid — 8–12 tiles on desktop, horizontally scrollable row on
  mobile. This replaces the current `QuickActions` card at the bottom of the
  page.
- **Frequency-aware ordering**: tiles sort by "recency × frequency" per user
  (see 6.4), with a stable "Core" group first (Tasks, Leaves, Attendance,
  Calendar — the four most-used tools for every role).
- **Pin/unpin** (persisted in `localStorage`) so power users can lock their
  own order; the unpinned tail follows the frequency heuristic.
- **Today's context inside the dock**: badges on tiles that carry live state
  (Tasks → overdue count, Leaves → pending approvals, Attendance → not checked
  in yet). This is what makes the dock feel alive instead of a menu.

### 6.4 The frequency heuristic (no backend needed)

Track clicks in `localStorage` per user id: `{ moduleHref: { count, lastUsed } }`
(one small helper, ~40 lines — see `src/lib/nav.ts` as the single source of
module hrefs). Score = recency-decayed count:

```
score = count * 0.7^(days since last use)
```

Ordering = Core (pinned set) → sorted by score. This gives the "I always use
Payroll on Fridays" behaviour for free, with zero analytics infrastructure and
no privacy concerns (stays on the device).

### 6.5 Tasks first — the biggest lever

Tasks is the first genuinely productive tool for most roles, and it currently
sits mid-page on the employee dashboard (`MyTasksWidget` in the 3-widget row)
and is only a tile in the bottom `QuickActions` for managers.

- **Move Tasks directly under the dock** on both dashboards, as a real widget:
  next 3 due/overdue tasks with check-off inline, "+ New task" and "View all".
  Reuse the existing `MyTasksWidget` and `api.dashboard.getMyTasks` — no new
  queries needed.
- Overdue tasks render with a danger tone and a count in the dock badge, so
  "I owe someone a task" is visible before any scroll.
- For managers add the **assignee view** in the same widget (tasks I assigned,
  still open), which is the manager-side counterpart of the same tool.

### 6.6 Role-aware default stacks

| Role       | Top of dashboard (after dock + FocusFeed)                          |
| ---------- | ------------------------------------------------------------------ |
| Employee   | Tasks → Check-in → My leave money → attendance stats               |
| Manager    | Tasks (mine + assignee) → Approvals → Strategy/OKR → team on leave |
| Admin      | Tasks → Approvals → Leave charts → Payroll banner → activity       |
| Superadmin | Tasks → Security widget → activity → enterprise widgets            |

### 6.7 Work items (in order)

1. `QuickActions` → **ToolDock**: move the card to the top, add the frequency
   heuristic + pinning, keep role filtering. (~1 component, reuses `nav.ts`.)
2. **Tasks widget** on both dashboards, directly under the dock.
3. **Live badges** on dock tiles (overdue tasks, pending approvals, un-checked
   in) — reuse the queries FocusFeed already runs.
4. Collapse `LeaveCharts` / `RecentLeavesCard` / `ActivityFeed` behind the fold
   or into tabs on the employee dashboard — reference material, not action.
5. Remove the bottom `QuickActions` once the dock replaces it; keep the ⌘K
   button in the header as the universal "jump to anything".

### 6.8 Non-goals (for now)

- No drag-and-drop grid framework — pin/unpin via a small "pin" control is
  enough; a full grid engine is a maintenance tax.
- No server-side analytics — localStorage scoring is private and costs nothing.
- No per-widget configuration UI — the dock + pinned set covers 90% of the
  need; custom dashboards come later if users ask.

---

## 7. Competitive landing blocks — benchmarked against BambooHR / spark.work /

Deel / Personio / Rippling / Lattice / Huly / Payfit / Monday (Aug 2026)

Status: **7.1–7.5 done (Aug 2026)**. The landing already beats the category on
motion and pricing (it has a live ROI calculator; BambooHR doesn't even have
one); the trust blocks competitors shared are now built. Each block reuses
existing infra — no new providers, no new design language.

### 7.1 Meet AI — live chat demo on the landing ✅

`src/components/landing/MeetAISection.tsx` sits right after the hero (BambooHR's
"Meet Bamboo AI™" position). Left copy + three capability rows + prompt chips;
right side a **live chat window** seeded with a welcome + a sample exchange.
Sending a message POSTs to `src/app/api/landing-demo/route.ts`, which runs the
real Gemini → Groq → OpenRouter chain (`generateWithFallback`) with a locked
product-only system prompt — no auth, no org data, no memory. Replies follow
the visitor's language. i18n: `landing.meetAi*` in all 4 locales.

### 7.2 Logo cloud + Trust & Security band ✅

`src/components/landing/TrustBandSection.tsx` after LiveStats:

- **Logo marquee** — pure-CSS infinite track (`@keyframes trust-marquee`),
  duplicated track, `prefers-reduced-motion` pause, edge fade via CSS mask.
  Token-styled wordmarks, no images → zero CLS.
- **Trust strip** — SOC 2, GDPR, encryption at rest, EU hosting, 99.9% uptime
  as a 5-up card grid with icon + one-liner.

### 7.3 Case-study numbers inside testimonials ✅

Each testimonial card now carries an outcome metric chip ("40% less time on HR
admin", "$70k saved in year one") — `testimonials.testimonialN.metric*` keys in
all 4 locales. Falls back to nothing when a locale has no metric.

### 7.4 Full `/pricing` page ✅

`src/app/pricing/page.tsx` + `src/components/pricing/PricingClient.tsx` —
reuses `PricingPreview` (cards + savings calculator + billing toggle), adds FAQ
and a final CTA. Navbar/Footer "Pricing" links are pathname-aware: `/#pricing`
on the landing, `/pricing` elsewhere. SSR metadata via `getServerTranslation`.

### 7.5 Per-module SEO pages ✅ (attendance, okr, payroll, drivers)

`src/components/features/ModuleSeoPage.tsx` generalises the leave-types pattern:
hero badge + icon, title/subtitle, 3 proof stats, description + 4 benefits,
auth-aware CTA. Four routes: `/features/attendance`, `/features/okr`,
`/features/payroll`, `/features/drivers` — each with SSR metadata. Content lives
in `featuresPage.modules.<module>.*` + `meta.<module>.*` in all 4 locales.
Strategy / recruitment / surveys pages can be added the same way (one route +
one i18n block, no component changes).

### 7.6 Live data behind the logo cloud and testimonials ✅

Placeholder copy is now driven by real data end-to-end:

- **`convex/schema/landing.ts`** — new `landingShowcase` table: a row references
  a **real organization** (`organizationId`) and is either a `logo` (marquee
  entry; name/logo come from the org) or a `testimonial` (quote in 4 languages,
  author, role, optional outcome metric). Indexed by `isVisible` + `kind`.
- **`convex/landing.ts`** — public `getShowcase({ lang })` (serves only
  `isVisible` rows whose org is active, quotes resolved by the visitor's
  language with EN fallback, batch-loaded orgs, stable `sortOrder` ordering)
  plus superadmin-only curation mutations: `listShowcase`, `createShowcase`,
  `updateShowcase`, `deleteShowcase`.
- **`TrustBandSection`** — real client logos (org `logoUrl` when present, else
  a deterministic wordmark) win over the i18n placeholders.
- **`TestimonialsSection`** — curated quotes/companies/authors/metrics win over
  the i18n placeholder cards; the i18n wall remains the fresh-install fallback.

Tests: `TestimonialsSection.test.tsx` (placeholder vs curated vs loading vs
play/pause) and `TrustBandSection.test.tsx` (real logo + marquee/trust strip).

### 7.7 /about + /blog + /changelog (not started)

/about in landing style; changelog can be generated from git history. Lower
priority than 7.1–7.5.
