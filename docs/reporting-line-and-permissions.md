# Reporting line, positions and permissions

**Status:** design proposal, nothing implemented yet.
**Trigger:** Profix has three `admin` accounts — Tigran, Karine, Lusine — but Tigran is the
CEO. Karine and Lusine report to him, as does everyone else. Admins must file attendance and
request leave like anyone else, and the CEO needs leave balances and a salary because he is an
employee too. The org chart must follow the reporting line and be labelled by Position.

The app cannot express any of that today. Not because of missing features, but because one
field — `users.role` — is being asked to mean five different things at once.

---

## 1. What `role` currently means

`convex/schema/users.ts:23` defines `role` as one of `superadmin | admin | supervisor |
employee | driver`. That single string is read as:

| Meaning                | Where                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Permission tier        | `convex/lib/rbac.ts:15` `ROLE_HIERARCHY`, `requireOrgAdmin:113`, `requireOrgSupervisor:135`                                           |
| Platform-operator flag | `role !== 'superadmin'` filters in ~8 modules (`users/queries.ts:81,112,194`, `orgchart.ts:49,160`, `timeTracking.ts:277,336,397`, …) |
| Approval authority     | `convex/leaves/mutations.ts:178` — any admin/supervisor may approve any leave in the org                                              |
| Visibility ceiling     | `convex/lib/rbac.ts:170` `canAccessUser` — a supervisor may never read an admin                                                       |
| Implicit seniority     | `convex/orgchart.ts:~226` `title: user.position \|\| user.role`; `roleOrder` sort in `reporting.ts` and `AssignManagerModal.tsx`      |
| Job classification     | `driver` is a job, not a privilege, yet it outranks `employee` in `ROLE_HIERARCHY`                                                    |

Because those meanings share one field, "Tigran is more senior than Karine" is inexpressible:
both are `admin`, and rank equality is what the code uses to decide who may act on whom
(`convex/users/mutations.ts:524` — peer admins cannot deactivate each other).

### The reporting line exists but is inert

`users.supervisorId` (`schema/users.ts:38`, indexed `by_supervisor`) is real data. Karine →
Tigran is already storable and `reporting.assignManager` will store it safely. But:

- **No permission decision reads it.** `getUserWithRole` (`rbac.ts:27`) projects the user doc
  down to `{_id, role, email, organizationId}` — it drops `supervisorId`, so no rbac helper
  can reason about the chain even if it wanted to.
- **`canAccessUser` actively contradicts it.** A `supervisor` is blocked from reading an
  `admin`. If Tigran were modelled as `supervisor`, he would lose read access to his own
  admin reports. And an `admin` reads everyone regardless of the line.
- **The rendered org chart ignores it.** `convex/orgchart.ts` `generateOrgChartFromUsers` is
  headed "AUTO-GENERATE ORG CHART … (supervisor relationships)" but never reads
  `supervisorId`. It wipes `orgChartNodes` and rebuilds Company → Department → flat people.
  Depth is always 3. Tigran renders as a leaf beside Karine and Lusine.
- **A correct tree already exists and is unwired.** `convex/reporting.ts:267`
  `getOrgHierarchyTree` builds a real nested tree from `supervisorId`. Repo-wide grep: only
  tests reference it. No component calls it.
- **Top of tree is inferred, not declared.** That builder's `else { roots.push(u) }` makes
  every user with no supervisor a root. Today that is all three admins plus every unassigned
  employee — a forest, not a CEO-rooted tree. Its own comment says as much: _"users with no
  supervisor (org admins/root)"_.

### `supervisorId` drift is real

Two storage locations (`users.supervisorId`, `userProfiles.supervisorId`), four writers, two
reading conventions:

| Writer                                 | Writes                                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------- |
| `reporting.assignManager`              | both (profile only if the row exists — no upsert)                                      |
| `users/mutations.ts updateUser`        | both, but **no cycle guard**                                                           |
| `users/mutations.ts createUser`        | `users` only                                                                           |
| `convex/tasks.ts:398 assignSupervisor` | `users` only — **and no `getAuthCaller`, no role check, no org check, no cycle guard** |

Readers split: `dashboard.ts:209` and `performance.ts:465` prefer the profile;
`getOrgHierarchyTree` and the `by_supervisor` direct-reports query use `users`. So the same
person can have different managers on different screens.

`tasks.assignSupervisor` is a security bug independent of this design: any authenticated
client can set anyone's supervisor to anyone, in any organization.

### Positions are labels, not places

`convex/schema/positions.ts`: `title`, localized titles, `description`, `level` (**free-text
string**), `salaryMin/Max`, `departmentId`. No `reportsToPositionId`, no numeric rank. A
position is a label plus a salary band. `departments` are flat too — no `parentDepartmentId`;
`managerId` exists but nothing reads it for the chart.

So "orient by Position" has no data to stand on yet.

### Approvals are rank-only, with holes

`convex/leaves/mutations.ts:178` (and `:315`, and `bulkApproveLeaves`):

```ts
if (reviewer.role !== 'admin' && reviewer.role !== 'supervisor' && reviewer.role !== 'superadmin') {
  throw new Error('Only admins and supervisors can approve leaves');
}
```

- `supervisorId` appears **zero times** in `convex/leaves/*`.
- **No self-approval guard.** Karine can approve her own leave. `convex/expenses.ts:52`
  already has the pattern to copy: _"nobody signs off on money they claimed, not even an
  admin"_.
- **Notifications fan out to `role === 'admin'`** (`leaves/mutations.ts:59`), so a
  `supervisor`-role manager is never told about their own report's request, and the
  requester's actual supervisor is irrelevant.
- **Queues are org-wide** (`leaves/queries.ts:182`) — a supervisor sees every leave in the
  org, not their team's.
- **`leaveSettings.approvalChain`** is stored (`schema/leaveSettings.ts:24`, seeded
  `['supervisor','hr']`, comment mentions `ceo`) and **never read by any mutation**. Dead
  config that already describes the feature we want.
- `createLeave` never calls `getAuthCaller` — it trusts the `userId` argument, so anyone can
  file on anyone's behalf. Separate bug, same file.

### What already works for the CEO-as-employee half

Good news: the employment side is mostly role-agnostic already.

- `checkIn`/`checkOut` (`timeTracking.ts:44,143`) have **no role gate** — admins can already
  clock in. Only _viewing_ others' attendance is role-gated.
- `calculatePayrollRun` (`payroll/mutations.ts:186`) enumerates every `employeeProfiles` row
  with **no role filter**; it skips only on missing user, no base salary, or below minimum
  wage. An admin with a salary is paid normally.
- `getStartingLeaveBalances` (`lib/leaveBalances.ts:56`) is role-agnostic.
- `leaveAccrual.ts:125` accrues for everyone except `superadmin`.
- Balance fields and `position`/`positionId` are unconditional on `users`.

The one trap: **do not make the CEO `role: 'superadmin'`.** He would stay in payroll (no role
filter) but vanish from the employee roster, the org chart and every attendance list and
statistic — paid but invisible, and the root of a chart that omits him.

---

## 2. How established HR systems model this

Researched to avoid inventing something idiosyncratic. Content below is paraphrased from the
linked sources for licensing compliance.

**Job vs Position.** Oracle and Workday separate a generic _job_ ("Software Engineer", shared
by many people) from a _position_ — a specific instance tied to a department, location and
reporting relationship, normally filled by one person, used for headcount control and
vacancy tracking ([Oracle Fusion HCM: job vs position](https://unogeeks.com/difference-between-job-and-position-in-oracle-fusion-hcm/),
[Oracle: Understanding Position Management](https://docs.oracle.com/cd/E13053_01/hr9pbr1_website_master/eng/psbooks/hhms/htm/hhms03.htm)).
This is exactly the distinction the customer is reaching for with "сориентироваться по
Position".

**Hierarchy lives on the position, via "Reports To".** PeopleSoft builds the org hierarchy by
putting the supervisor's position number in a _Reports To_ field on each position, with a
separate _Dot-Line_ field for indirect/dotted-line relationships
([Oracle: Maintaining Your Organizational Structure](https://docs.oracle.com/cd/F85027_01/hcm92pbr47/eng/hcm/hhms/MaintainingYourOrganizationalStructure-e311bf.html)).

**Approvals route up the position chain by default.** Workday routes an approval step to the
manager of the person's position, then to that manager's manager, and onward up the chain;
position-based routing is the default unless organization-based routing is switched on
([Workday: Approval Chain Step](https://doc.workday.com/admin-guide/en-us/manage-workday/business-processes/business-process-step-types/klq1658852814436.html),
[Workday: Approval Chain Routing](https://doc.workday.com/admin-guide/en-us/manage-workday/business-processes/business-process-framework-concepts/yzb1658777642966.html)).

**The management hierarchy is a first-class object, separate from permissions.** Workday's
supervisory organizations group workers into management hierarchies and report to one another
to form the structure; placing a worker into one is what assigns their manager
([Workday: Superior and Subordinate Organizations](https://doc.workday.com/admin-guide/en-us/manage-workday/organizations/manage-organization-concepts/concept--superior-and-subordinate-organizations.html),
[Workday: Organizations and Hierarchies](https://doc.workday.com/workday-education/en-us/course-manuals/hcm-core-for-administrators/organizations-and-hierarchies.html)).
Permissions come from separate security groups (HR Partner and similar), which is why a
Workday HR admin is not thereby senior to anyone. Multiple managers on one organization are
supported, and a step routes to all of them
([Workday: Assign Multiple Managers](https://doc.workday.com/admin-guide/en-us/human-capital-management/staffing/organization-assignments/dan1406333013986.html)).

**RBAC guidance says the same thing from the security side:** derive roles from actual duties
rather than from reporting lines, keep them small, and enforce least privilege and separation
of duties ([RBAC role design](https://nhimg.org/faq/how-should-security-teams-design-rbac-roles-without-creating-privilege-creep/),
[RBAC best practices](https://censinet.com/perspectives/rbac-best-practices-securing-clinical-applications)).

**Leave-workflow essentials** are consistently listed as centralized intake, balance checks,
direct-manager routing, SLAs, delegation during absence, handover, a shared calendar,
complete records and justified rejections
([leave approval best practices](https://www.cflowapps.com/leave-request-approval-workflow-best-practices/)).
Two of those — direct-manager routing and delegation — are precisely what is missing here.

_Content was rephrased for compliance with licensing restrictions._

---

## 3. Target model

Three orthogonal axes. Nothing in one axis may be inferred from another.

```
PERMISSIONS          REPORTING LINE            POSITION
what you may do      who you answer to         what job you hold
─────────────        ──────────────            ────────────
capability grants    users.supervisorId        positions.reportsToPositionId
per organization     + organizations.headUserId  + positions.rank
```

### 3.1 Everyone in an organization is an employee

One rule, no exceptions: an org membership implies attendance, leave balances, a salary
record and a place in the chart. `superadmin` is **not** an org member — it is the platform
operator, and it stays excluded from org populations as it is today.

Consequence: Tigran keeps `role: 'admin'` (permissions) _and_ gets an `employeeProfiles` row
with a salary, leave balances and a position. Nothing new is needed for payroll or accrual to
pick him up.

### 3.2 An explicit top of the organization

Add `organizations.headUserId: v.optional(v.id('users'))`.

Why on the organization rather than a flag on the user: exactly one head per org, enforced by
cardinality instead of by convention, and "who is the CEO" becomes a fact you can query
rather than something inferred from a missing field. It replaces
`getOrgHierarchyTree`'s "no supervisor ⇒ root" guess. Users with no supervisor who are _not_
the head become an explicit **unassigned** bucket the UI can nag about, instead of silently
becoming co-roots.

### 3.3 Positions gain a hierarchy

```ts
positions: {
  // …existing
  reportsToPositionId: v.optional(v.id('positions')),  // PeopleSoft "Reports To"
  rank: v.optional(v.number()),                        // 0 = CEO; for sorting/labels only
}
```

`rank` is presentational and for tie-breaking sibling order — **never** a permission input.
`level` (free-text) stays for display; do not overload it.

Two-stage adoption:

1. **Person-based line is canonical** (`users.supervisorId`), positions only label the chart.
   This alone solves Profix.
2. **Position-based line optional per org** (`organizations.hierarchyMode: 'person' |
'position'`): derive a person's manager from the holder of their position's
   `reportsToPositionId`. Matches Workday's default position-based routing. Do not build this
   until stage 1 is deployed and stable.

### 3.4 Capability grants instead of rank

Keep `role` as a coarse tier for now — a rename is a large, risky sweep — but stop letting it
imply seniority. Introduce capabilities as the thing code checks:

```ts
orgMemberships: {           // or a capabilities array on users
  userId, organizationId,
  capabilities: v.array(v.string()),  // 'hr.admin' | 'leave.approve' | 'payroll.run' | 'org.manage' | …
}
```

Mapping at introduction: `admin` → all org capabilities; `supervisor` → `leave.approve`
scoped to reports. Then migrate call sites from `requireOrgAdmin` to
`requireCapability(ctx, 'payroll.run', orgId)`. This is the largest piece of work and can
land incrementally, module by module, behind the existing helpers.

### 3.5 Approval routing: chain first, capability second

Replace the rank check in `approveLeave` with:

1. **Never self-approve.** `leave.userId !== reviewerId` and `createdBy !== reviewerId`, per
   the `expenses.ts` precedent.
2. **The approver is the first ancestor in the requester's chain who holds
   `leave.approve`.** Walk `supervisorId` upward (cycle-safe, capped, skipping inactive
   people — the walk already exists in `reporting.getReportingLine`).
3. **Top-of-org fallback,** because the head has no ancestor. Per-org policy on
   `leaveSettings`:
   - `headApproval: 'auto'` — the head's own leave is recorded as approved, with an audit
     entry saying why (smallest change, honest about what happens in a small company);
   - `headApproval: 'delegate'` — `leaveSettings.headApproverUserId` names a specific person
     (board member, HR lead);
   - `headApproval: 'peer'` — anyone else holding `leave.approve` may approve it.
4. **Delegation while away.** `users.delegateUserId` + a window; the resolver substitutes the
   delegate. Named as an essential by every leave-workflow source.
5. **Notify the resolved approver**, not every admin. Removes the `by_org_role` fan-out and
   its `DEFAULT_LIST_CAP` ceiling.
6. **Wire up `approvalChain`.** It already exists, is already seeded, and already contemplates
   `['supervisor','hr','ceo']`. Multi-step is stage 2; single-step chain resolution is stage 1.

### 3.6 Visibility follows the line, not the rank

`canAccessUser` becomes:

- self → always;
- anyone in my subtree (transitive reports) → yes;
- holder of an org-wide read capability (`hr.admin`) → yes for that org;
- platform superadmin → yes;
- otherwise → no.

This drops the "supervisor may not read an admin" rule, which is the single hardest blocker
to Tigran supervising Karine. `getUserWithRole` must stop stripping `supervisorId`, or a
separate `isAncestorOf(ctx, managerId, employeeId)` helper must be added.

### 3.7 One org chart, built from the line

- Build the tree from `organizations.headUserId` + `users.supervisorId` — i.e. finish wiring
  `getOrgHierarchyTree`, which already does this correctly.
- Label nodes from `positionId` → `positions.title` (localized). **Never fall back to
  `role`**; fall back to an empty label or "Position not set".
- Keep `orgChartNodes` only for what the line cannot express: dotted-line relationships,
  vacancies, planned structure. Stop the destructive regenerate-wipes-everything behaviour.
- Departments become a grouping/colour dimension (a roll-up view), not the tree shape.

---

## 4. Profix, concretely

```
                    Tigran — CEO                     organizations.headUserId = Tigran
                    role: admin                      employeeProfiles: salary, balances
                    position: CEO (rank 0)
                          │
        ┌─────────────────┼─────────────────┐
   Karine — HR        Lusine — Admin     …other employees
   role: admin        role: admin        role: employee
   supervisorId:      supervisorId:      supervisorId: Tigran
     Tigran             Tigran
```

Data changes only, no schema needed for the first three:

1. `Karine.supervisorId = Tigran`, `Lusine.supervisorId = Tigran` — via `assignManager`, which
   already guards cycles.
2. Everyone else already points at Tigran; verify none are orphaned.
3. Tigran gets an `employeeProfiles` row (salary) and leave balances; he clocks in like
   anyone else. Nothing blocks this today.
4. `organizations.headUserId = Tigran` — needs the schema field.
5. Positions: CEO rank 0, HR / Admin rank 1, the rest below. Needed only for chart labels
   and sibling ordering.

After that, Karine's leave request routes to Tigran (not to Karine herself and not to
Lusine); Tigran's own request follows the head policy; the chart is Tigran at the top with
everyone beneath, labelled by position.

---

## 5. Work plan

Ordered so each phase is deployable on its own and nothing depends on a later phase.

**Phase 0 — bugs that are wrong regardless of this design**

| #   | Fix                                                                                                                                                  | Where                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 0.1 | `tasks.assignSupervisor` has no auth at all — add `getAuthCaller`, org check, cycle guard, or delete it and route the UI through `assignManager`     | `convex/tasks.ts:398`                                         |
| 0.2 | Self-approval of leave                                                                                                                               | `convex/leaves/mutations.ts:178,315` + `bulkApproveLeaves`    |
| 0.3 | `createLeave` trusts `args.userId`                                                                                                                   | `convex/leaves/mutations.ts:14`                               |
| 0.4 | `updateUser` writes `supervisorId` with no cycle guard                                                                                               | `convex/users/mutations.ts:372`                               |
| 0.5 | Pick one canonical `supervisorId` (recommend `users` — it has the reverse index) and make every writer dual-write and every reader read the same one | 4 writers, 5 readers listed in §1                             |
| 0.6 | Two superadmin notions: role-based `isSuperadmin()` vs env-based `isSuperadminEmail()` used as the bypass in `users/mutations.ts`                    | `convex/lib/auth.ts:95`, `users/mutations.ts:147,393,508,593` |

**Phase 1 — declare the top of the org**
`organizations.headUserId`; `getOrgHierarchyTree` roots at it; unassigned users surface as a
list to fix rather than as extra roots; backfill Profix.

**Phase 2 — org chart from the line, labelled by position**
Wire `getOrgHierarchyTree` into `OrgChartClient`; rewrite or retire
`generateOrgChartFromUsers`; drop `title: position || role`; add
`positions.reportsToPositionId` + `rank` for labels and ordering. Retire the role-filtered
`users.getSupervisors` in favour of `reporting.getPotentialManagers` in `EditEmployeeModal`.

**Phase 3 — approvals follow the chain**
Approver resolution walking the line; head-of-org policy; notify the resolved approver;
scope supervisor queues to their subtree; then activate `approvalChain` for multi-step.

**Phase 4 — capabilities replace rank**
`requireCapability`; rewrite `canAccessUser` as subtree + capability; migrate module by
module. Largest and last, because everything above works with `role` untouched.

---

## 6. Open questions for you

1. **Head's own leave** — auto-approve, delegate to a named person, or peer-approve? Default
   proposal: `auto` with an audit note, configurable.
2. **Should a manager without `admin` rank approve?** Under the target model a `supervisor`
   who is the requester's actual manager approves; an `admin` who is _not_ in the chain does
   not (unless they hold an org-wide override). Is that acceptable for Profix, where HR
   (Karine) probably wants to approve everyone's leave? If so she needs an explicit
   `leave.approve.org` capability rather than getting it from rank.
3. **Multiple managers per person** — Workday supports it and routes to all. Do you need it,
   or is one manager plus dotted lines on the chart enough?
4. **Position-based vs person-based line** — stay person-based (stage 1) or move to
   position-based routing later? Position-based needs positions to be genuine single-holder
   instances, which changes how positions are created.
5. **Attendance for the CEO** — he is already counted in the denominator and marked absent if
   he does not check in. Should the head be exempt, or does he clock in like everyone else?
6. **Dotted lines** — needed for Profix now, or defer?

---

## 7. Files that will change

Ranked by how much of the design lands in them.

| File                                                                                      | Why                                                                                                           |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `convex/lib/rbac.ts`                                                                      | `ROLE_HIERARCHY`, `canAccessUser`, `getUserWithRole` projection; where capabilities land                      |
| `convex/reporting.ts`                                                                     | the only real reporting-line code: chain walk, `assignManager`, `getPotentialManagers`, `getOrgHierarchyTree` |
| `convex/orgchart.ts`                                                                      | department-based generator and `title: position \|\| role`                                                    |
| `convex/leaves/mutations.ts` + `queries.ts`                                               | approver resolution, self-approval, notification routing, queue scoping                                       |
| `convex/schema/{users,organizations,positions,leaveSettings}.ts`                          | `headUserId`, `reportsToPositionId`, `rank`, head-approval policy, capabilities                               |
| `convex/users/{mutations,queries}.ts`                                                     | `supervisorId` writes, `getSupervisors`, the superadmin bypass                                                |
| `convex/tasks.ts`                                                                         | unauthenticated `assignSupervisor`                                                                            |
| `src/components/orgchart/OrgChartClient.tsx`                                              | consume the line-based tree                                                                                   |
| `src/components/employees/{ReportingLineWidget,AssignManagerModal,EditEmployeeModal}.tsx` | role-derived icons and role-ordered pickers                                                                   |
