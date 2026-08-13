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
