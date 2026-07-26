# Strata — Project Roadmap & Status

> **Last updated:** 2026-05-10 (Full audit completed, Recruitment emails implemented, Cron jobs verified)
> **Stack:** Next.js 16 (App Router) + Convex + Shadcn/ui + Tailwind CSS
> **i18n:** EN / RU / HY (Armenian)
> **Auth:** Convex Auth (session-based)
> **RBAC Roles:** superadmin, admin, supervisor, employee, driver

---

## Status Legend

| Symbol | Meaning                                                |
| ------ | ------------------------------------------------------ |
| ✅     | Fully implemented (schema + backend + UI + i18n + nav) |
| ⚠️     | Mostly implemented, minor gaps remain                  |
| 🔲     | Not started                                            |
| 🚧     | In progress                                            |

---

## Phase 1 — Core HR Features (MVP Complete)

### 1.1 Performance Reviews / 360° Feedback

**Status:** ✅ Fully implemented

| Layer   | Status | Files                                                                                                                                                                                                                                                                                                |
| ------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema  | ✅     | `convex/schema/performance.ts`                                                                                                                                                                                                                                                                       |
| Backend | ✅     | `convex/performance.ts`                                                                                                                                                                                                                                                                              |
| UI      | ✅     | `src/components/PerformanceClient.tsx`, `src/components/performance/CreateCycleWizard.tsx`, `src/components/performance/FillReviewDialog.tsx`, `src/components/performance/LaunchCycleDialog.tsx`, `src/components/performance/ResultsDialog.tsx`, `src/components/performance/CycleSummaryCard.tsx` |
| Route   | ✅     | `src/app/(dashboard)/performance/page.tsx`                                                                                                                                                                                                                                                           |
| i18n    | ⚠️     | EN ✅, RU ✅, HY 🔲                                                                                                                                                                                                                                                                                  |
| Sidebar | ✅     | Nav item added                                                                                                                                                                                                                                                                                       |

**Features implemented:**

- Review cycles, templates, assignments, responses, ratings
- 3-step CreateCycleWizard (Basic Info → Review Types → Competencies)
- FillReviewDialog (1-5 rating per competency + comments + strengths/improvements)
- LaunchCycleDialog (select participants, auto-assign self/manager)
- ResultsDialog (overall score, competency bars, grouped by type)
- CycleSummaryCard (all employees ranked by score)
- Mirror manager reviews → supervisorRatings (backward compat)
- Immutable competency snapshot at cycle creation
- Peer anonymity threshold (configurable, default 2)
- Deadline notifications (cron: `checkDeadlineNotifications`)

**TODO:**

- [ ] Export results (PDF/CSV)
- [ ] HY translations

---

### 1.2 OKR / Goals Management

**Status:** ⚠️ Mostly implemented

| Layer   | Status | Files                                                                                                                                                                          |
| ------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Schema  | ✅     | `convex/schema/goals.ts`                                                                                                                                                       |
| Backend | ✅     | `convex/goals.ts`                                                                                                                                                              |
| UI      | ✅     | `src/components/GoalsClient.tsx`, `src/components/goals/CreateObjectiveWizard.tsx`, `src/components/goals/CheckinDialog.tsx`, `src/components/goals/ObjectiveDetailDialog.tsx` |
| Route   | ✅     | `src/app/(dashboard)/goals/page.tsx`                                                                                                                                           |
| i18n    | ⚠️     | EN ✅, RU ✅, HY 🔲                                                                                                                                                            |
| Sidebar | ✅     | Crosshair icon                                                                                                                                                                 |

**Features implemented:**

- Objectives, keyResults, goalCheckins
- 3-step CreateObjectiveWizard
- CheckinDialog (update KR value + confidence + note)
- ObjectiveDetailDialog (KRs with progress bars + check-in history + aligned goals)
- Progress bar per KR (0-100%) with direction (increase/decrease)
- Goal tree (company → team → individual) via parentObjectiveId
- Filtering by period (Q1-Q4, H1-H2, FY) and year
- Team progress visualization (stats cards)
- Team scope via department field
- Weekly check-in reminders (cron: `sendWeeklyCheckinReminders`)

**TODO:**

- [ ] HY translations
- [ ] Link OKR with Performance Reviews

---

### 1.3 Recruitment / ATS

**Status:** ⚠️ Mostly implemented

| Layer       | Status | Files                                      |
| ----------- | ------ | ------------------------------------------ |
| Schema      | ✅     | `convex/schema/recruitment.ts`             |
| Backend     | ✅     | `convex/recruitment.ts`                    |
| UI          | ✅     | `src/components/RecruitmentClient.tsx`     |
| Route       | ✅     | `src/app/(dashboard)/recruitment/page.tsx` |
| Public page | ✅     | `src/app/careers/[slug]/page.tsx`          |
| i18n        | ⚠️     | EN ✅, RU ✅, HY 🔲                        |

**Features implemented:**

- Vacancies CRUD
- Kanban pipeline (Applied → Screening → Interview → Offer → Hired)
- Candidate cards (resume, contacts, notes)
- Interview scheduling
- Scorecard for interviewers
- Public careers page with application form

**TODO:**

- [ ] Recruitment funnel analytics
- [ ] HY translations

---

### 1.4 Onboarding Workflows

**Status:** ⚠️ Mostly implemented

| Layer   | Status | Files                                     |
| ------- | ------ | ----------------------------------------- |
| Schema  | ✅     | `convex/schema/onboarding.ts`             |
| Backend | ✅     | `convex/onboarding.ts`                    |
| UI      | ✅     | `src/components/OnboardingClient.tsx`     |
| Route   | ✅     | `src/app/(dashboard)/onboarding/page.tsx` |
| i18n    | ✅     | EN, RU                                    |

**Features implemented:**

- Onboarding templates, programs, tasks
- Templates by department/position
- Automatic checklists (spawn from template)
- Buddy/mentor assignment
- Progress tracker (% completion, server-side)
- Auto tasks for IT/HR/manager (assigneeType + dayOffset)
- Welcome page (My Onboarding tab)

**Features implemented:**

- Onboarding templates, programs, tasks
- Templates by department/position
- Automatic checklists (spawn from template)
- Buddy/mentor assignment
- Progress tracker (% completion, server-side)
- Auto tasks for IT/HR/manager (assigneeType + dayOffset)
- Welcome page (My Onboarding tab)
- Cron jobs for task activation and overdue reminders (`activateOnboardingTasks`, `sendOnboardingOverdueReminders`)

**TODO:**

- [ ] Integration with Tasks module (auto-create tasks)
- [ ] Link with Recruitment (auto-trigger on hired)

---

### 1.5 Offboarding Workflows

**Status:** ✅ Fully implemented

| Layer   | Status | Files                                      |
| ------- | ------ | ------------------------------------------ |
| Schema  | ✅     | `convex/schema/offboarding.ts`             |
| Backend | ✅     | `convex/offboarding.ts`                    |
| UI      | ✅     | `src/components/OffboardingClient.tsx`     |
| Route   | ✅     | `src/app/(dashboard)/offboarding/page.tsx` |
| i18n    | ✅     | EN, RU                                     |

**Features implemented:**

- Offboarding programs, tasks, exitInterviews
- 8 default tasks (access revoke, equipment return, knowledge transfer, etc.)
- Exit Interview form (5-point experience, recommend, feedback, improvements)
- Retention analytics (reason breakdown, avg experience, recommend rate)
- StartOffboardingWizard (3-step)
- ProgramDetailDialog (checklist + exit interview panel)

---

### 1.6 E-Signatures

**Status:** ✅ Fully implemented

| Layer   | Status | Files                                     |
| ------- | ------ | ----------------------------------------- |
| Schema  | ✅     | `convex/schema/signatures.ts`             |
| Backend | ✅     | `convex/signatures.ts`                    |
| UI      | ✅     | `src/components/ESignaturesClient.tsx`    |
| Route   | ✅     | `src/app/(dashboard)/signatures/page.tsx` |
| i18n    | ✅     | EN ✅, RU ✅, HY ✅                       |

**Features implemented:**

- Document templates, signature documents, signature requests, audit log
- 3-step CreateDocumentWizard
- SignDocumentDialog (Canvas signature pad, mouse + touch)
- DocumentDetailDialog (status, signers progress, audit log, PDF export)
- TemplateManager (CRUD with categories: NDA, Offer, Contract, Policy, Custom)
- Immutable document snapshot on send (content hash)
- Sequential signing order enforcement
- Audit log (created, sent, viewed, signed, declined, cancelled, reminder_sent)
- PDF generation of signed documents (pdfmake with signers table, audit trail, metadata)

**TODO:**

- [ ] Digital certificate integration (optional enhancement)
- [ ] Watermark on PDF exports (optional enhancement)

---

### 1.7 Employee Engagement / Pulse Surveys

**Status:** ✅ Fully implemented

| Layer   | Status | Files                                  |
| ------- | ------ | -------------------------------------- |
| Schema  | ✅     | `convex/schema/surveys.ts`             |
| Backend | ✅     | `convex/surveys.ts`                    |
| UI      | ✅     | `src/components/SurveysClient.tsx`     |
| Route   | ✅     | `src/app/(dashboard)/surveys/page.tsx` |
| i18n    | ✅     | EN, RU, HY                             |

**Features implemented:**

- Surveys, surveyQuestions, surveyResponses, surveyAnswers
- Question types: rating, multiple_choice, text, yes_no, nps
- Anonymous responses
- eNPS (0-10 scale)
- Create survey wizard with drag-and-drop question ordering
- TakeSurveyDialog, ResultsDialog
- Results Dashboard with trends (`/surveys/[id]/results`)
- Department segmentation
- CSV export
- Individual response viewer (for named surveys)
- Automatic pulse surveys (cron: hourly activation/closure)

**TODO:**

- [ ] Quiz taking UI with timer (if needed for surveys)
- [ ] Cross-survey trend analytics over time

---

### 1.8 Recognition & Kudos

**Status:** ⚠️ Mostly implemented

| Layer   | Status | Files                                              |
| ------- | ------ | -------------------------------------------------- |
| Schema  | ✅     | `convex/schema/recognition.ts`                     |
| Backend | ✅     | `convex/recognition.ts`                            |
| UI      | ✅     | `src/components/recognition/RecognitionClient.tsx` |
| Route   | ✅     | `src/app/(dashboard)/recognition/page.tsx`         |
| i18n    | ⚠️     | EN ✅, RU ✅, HY 🔲                                |

**Features implemented:**

- Kudos feed, leaderboard, stats cards
- SendKudos Wizard (3-step)
- Points Economy (userPoints + pointTransactions)
- Points: -3 for sending kudos, +1 for attendance, +3 for positive review ≥4★
- Badge system (kudosBadges, kudosBadgeAwards)

**TODO:**

- [ ] HY translations

---

## Phase 2 — Competitive Edge (Not Started)

### 2.1 Learning Management System (LMS)

**Status:** ✅ Fully implemented

| Layer   | Status | Files                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema  | ✅     | `convex/schema/learning.ts`                                                                                                                                                                                                                                                                                                                                                                                                         |
| Backend | ✅     | `convex/learning.ts`                                                                                                                                                                                                                                                                                                                                                                                                                |
| UI      | ✅     | `src/components/learning/LearningClient.tsx`, `src/components/learning/CourseCatalog.tsx`, `src/components/learning/MyCourses.tsx`, `src/components/learning/TeamOverview.tsx`, `src/components/learning/CreateCourseDialog.tsx`, `src/components/learning/LessonFormDialog.tsx`, `src/components/learning/LessonPlayerDialog.tsx`, `src/components/learning/CourseDetailDialog.tsx`, `src/components/learning/CertificatesTab.tsx` |
| Route   | ✅     | `src/app/(dashboard)/learning/page.tsx`                                                                                                                                                                                                                                                                                                                                                                                             |
| i18n    | ✅     | EN ✅, RU ✅, HY ✅                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Sidebar | ✅     | GraduationCap icon                                                                                                                                                                                                                                                                                                                                                                                                                  |

**Features implemented:**

- Course catalog with search, category & difficulty filters
- Course enrollment (self + admin bulk enroll)
- Lesson progress tracking (video/text/quiz/mixed content types)
- Quiz system with multiple question types (multiple choice, true/false, short answer)
- Score tracking, passing thresholds, attempt limits
- Certificate issuance on course completion
- Team learning overview for admins (stats dashboard)
- Course categories management
- Mandatory compliance training support
- Difficulty levels (beginner, intermediate, advanced)
- Three-tab interface: Catalog, My Courses, Team Overview (Surveys-style tabs)
- CreateCourseDialog (course creation)
- LessonFormDialog (lesson management)
- LessonPlayerDialog (content viewer)
- CourseDetailDialog
- CertificatesTab

**TODO:**

- [ ] Quiz taking UI with timer
- [ ] Certificate download/view UI
- [ ] Drag-and-drop lesson ordering
- [ ] Course completion cron jobs (expiry notifications)
- [ ] Manager course assignment UI

---

### 2.2 Compensation Management

**Status:** ⚠️ Mostly implemented

| Layer   | Status | Files                                                                                                                                                                                                                                                                                 |
| ------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema  | ✅     | `convex/schema/compensation.ts`                                                                                                                                                                                                                                                       |
| Backend | ✅     | `convex/compensation.ts`                                                                                                                                                                                                                                                              |
| UI      | ✅     | `src/components/compensation/CompensationClient.tsx`, `src/components/compensation/CompensationRecordWizard.tsx`, `src/components/compensation/CompensationBandWizard.tsx`, `src/components/compensation/BonusProgramWizard.tsx`, `src/components/compensation/ReviewCycleWizard.tsx` |
| Route   | ✅     | `src/app/(dashboard)/compensation/page.tsx`                                                                                                                                                                                                                                           |
| i18n    | ⚠️     | EN ✅, RU ✅, HY 🔲                                                                                                                                                                                                                                                                   |
| Sidebar | ✅     | Nav item added                                                                                                                                                                                                                                                                        |

**Features implemented:**

- Salary bands by position (min/mid/max)
- Employee position visualization within band
- Compensation review cycles
- Bonuses and premiums
- Create compensation records wizard
- Compensation band management wizard
- Bonus program wizard
- Review cycle wizard
- Surveys-style tab interface (Catalog, My Records, Team Overview, Settings)
- Portal-rendered modals (no clipping)

**TODO:**

- [ ] HY translations
- [ ] Raise budgeting UI
- [ ] Market benchmarking integration
- [ ] Compensation history export (PDF/CSV)
- [ ] Deadline notifications for review cycles

**Competitors with this:** Rippling, BambooHR

---

### 2.3 Benefits Administration

**Status:** 🔲 Not started

**Required files:**

- Schema: `convex/schema/benefits.ts` (benefitPlans, benefitEnrollments, claims)
- Backend: `convex/benefits.ts`
- UI: `src/components/benefits/BenefitsClient.tsx`
- Route: `src/app/(dashboard)/benefits/page.tsx`

**Features to implement:**

- Benefits catalog (insurance, fitness, education)
- Self-service enrollment
- Flexible benefits budget
- Claims submission and approval
- Payroll integration for reimbursements

**Competitors with this:** Rippling, Deel, BambooHR

---

### 2.4 Visual Org Chart

**Status:** ✅ Fully implemented

| Layer   | Status | Files                                        |
| ------- | ------ | -------------------------------------------- |
| Schema  | ✅     | `convex/schema/orgchart.ts`                  |
| Backend | ✅     | `convex/orgchart.ts`                         |
| UI      | ✅     | `src/components/orgchart/OrgChartClient.tsx` |
| Route   | ✅     | `src/app/(dashboard)/org-chart/page.tsx`     |
| i18n    | ✅     | EN ✅, RU ✅, HY ✅                          |

**Features implemented:**

- Interactive visualization (React Flow/@xyflow)
- Proper tree layout algorithm (subtree-centering)
- Hierarchy: company → department → team → person
- Search and filter
- Click → mini employee profile (email, phone, department, position)
- Drag-and-drop reorg (admin only)
- Export to SVG
- Auto-generate org chart from employee data
- Save/load user-specific layouts
- Add/Edit/Delete nodes with dialogs
- Move node with circular reference prevention
- Node types: person, department, group
- Color-coded nodes by type
- Fix departments mutation (auto-correct parent-child relationships)

**TODO:**

- [ ] Export to PDF/PNG (in addition to SVG)

---

### 2.5 Document Management System

**Status:** ⚠️ Mostly implemented

| Layer   | Status | Files                                                                                               |
| ------- | ------ | --------------------------------------------------------------------------------------------------- |
| Schema  | ✅     | `convex/schema/documents.ts`                                                                        |
| Backend | ✅     | `convex/documents.ts`                                                                               |
| UI      | ✅     | `src/components/documents/DocumentsClient.tsx`, `src/components/documents/DocumentUploadWizard.tsx` |
| Route   | ✅     | `src/app/(dashboard)/documents/page.tsx`                                                            |
| i18n    | ⚠️     | EN ✅, RU ✅, HY 🔲                                                                                 |
| Sidebar | ✅     | Nav item added                                                                                      |

**Features implemented:**

- Document management with tabbed interface (Surveys-style tabs)
- Document upload wizard
- Folder organization
- Access control (who can view/edit)
- Document versioning support
- Full-text search

**Features implemented:**

- Document management with tabbed interface (Surveys-style tabs)
- Document upload wizard
- Document template wizard
- Document detail view
- Folder organization
- Access control (who can view/edit)
- Document versioning support
- Full-text search

**TODO:**

- [ ] HY translations
- [ ] E-Signatures integration
- [ ] Bulk download/export
- [ ] Document preview UI

**Competitors with this:** Rippling, BambooHR

---

### 2.6 Expense Management

**Status:** 🔲 Not started

**Required files:**

- Schema: `convex/schema/expenses.ts` (expenseReports, expenseItems, receipts, expensePolicies)
- Backend: `convex/expenses.ts`
- UI: `src/components/expenses/ExpensesClient.tsx`
- Route: `src/app/(dashboard)/expenses/page.tsx`

**Features to implement:**

- Expense submission (receipt photo, amount, category)
- Manager approval workflow
- Expense policies (category limits)
- Reports by department/period
- Payroll integration (reimbursement)

**Competitors with this:** Rippling

---

### 2.7 Succession Planning

**Status:** 🔲 Not started

**Required files:**

- Schema: `convex/schema/succession.ts` (keyPositions, successors, developmentPlans, nineBoxRatings)
- Backend: `convex/succession.ts`
- UI: `src/components/succession/SuccessionClient.tsx`
- Route: `src/app/(dashboard)/succession/page.tsx`

**Features to implement:**

- 9-Box Grid (Performance vs Potential)
- Key position identification
- Successor assignment
- Development plans (linked to LMS)
- Risk assessment (what if someone leaves)

**Competitors with this:** Leapsome, HiBob

---

## Phase 3 — Differentiation (Not Started)

### 3.1 Mobile App (PWA)

**Status:** 🔲 Not started

**Required files:**

- `public/manifest.json`
- `public/sw.js` (service worker)
- `src/app/(dashboard)/layout.tsx` — add PWA registration

**Features to implement:**

- PWA manifest + service worker
- Responsive design for all modules
- Push notifications (Web Push API)
- Offline mode (caching)
- Quick actions: approve leave, mark attendance
- Alternative: React Native (iOS + Android)

---

### 3.2 Compliance & Audit Trail

**Status:** ⚠️ Partially implemented

**Existing:**

- Schema: `convex/schema/security.ts`
- Backend: `convex/security.ts`
- `convex/admin.ts` — auditLogs query

**TODO:**

- [ ] Full audit logging for ALL actions (who, what, when, IP, before/after)
- [ ] Audit log UI with filters (user, action, date)
- [ ] GDPR tools (data export, right to delete)
- [ ] Compliance dashboard
- [ ] Data retention policies

---

### 3.3 Asset / IT Equipment Management

**Status:** 🔲 Not started

**Required files:**

- Schema: `convex/schema/assets.ts` (assets, assetAssignments, assetCategories)
- Backend: `convex/assets.ts`
- UI: `src/components/assets/AssetsClient.tsx`
- Route: `src/app/(dashboard)/assets/page.tsx`

**Features to implement:**

- Equipment inventory (laptops, phones, keys)
- Assignment/return (linked to onboarding/offboarding)
- Statuses: available, assigned, repair, retired
- QR codes for quick scanning
- Return reminders

---

### 3.4 Company News Feed / Announcements

**Status:** 🔲 Not started

**Required files:**

- Schema: `convex/schema/news.ts` (announcements, reactions, comments)
- Backend: `convex/news.ts`
- UI: `src/components/news/NewsClient.tsx`
- Route: `src/app/(dashboard)/news/page.tsx`

**Features to implement:**

- Company news feed
- Categories: news, events, birthdays, achievements
- Rich-text editor for posts
- Reactions and comments
- Pin important announcements
- Targeting (by department, role)

---

### 3.5 Custom Workflow Builder (Visual)

**Status:** ⚠️ Partially implemented (backend only, no UI)

**Existing:**

- Schema: `convex/schema/automation.ts`
- Backend: `convex/automation.ts`, `convex/automationActions.ts`, `convex/automationMutations.ts`, `convex/automationTest.ts`

**TODO:**

- [ ] Visual drag-and-drop builder (React Flow / xyflow)
- [ ] Route: `src/app/(dashboard)/automation/page.tsx`
- [ ] UI: `src/components/automation/AutomationClient.tsx`
- [ ] Nodes: trigger → condition → action
- [ ] Triggers: new employee, leave approved, birthday, etc.
- [ ] Actions: send email, create task, notify, update field
- [ ] Workflow templates
- [ ] Execution logging

---

### 3.6 Employee Directory

**Status:** ✅ Fully implemented

**Existing:**

- `src/app/(dashboard)/employees/page.tsx` — Employee list
- `src/app/(dashboard)/employees/[id]/page.tsx` — Employee profile
- `src/app/(dashboard)/employees/departments/page.tsx` — Department management
- `src/app/(dashboard)/employees/positions/page.tsx` — Position management
- `src/components/employees/EmployeesClient.tsx` — Main UI
- `src/components/employees/EmployeeProfilePageClient.tsx` — Profile view
- `src/components/employees/DepartmentsClient.tsx` — Department UI
- `src/components/employees/PositionsClient.tsx` — Position UI
- `src/components/employees/EmployeeHoverCard.tsx` — Quick view card
- `src/components/employees/AddEmployeeModal.tsx` — Add employee
- `src/components/employees/EditEmployeeModal.tsx` — Edit employee
- `src/components/employees/TeamSidebar.tsx` — Team sidebar
- `convex/schema/employees.ts` — Employee schema
- `convex/employees.ts` — Employee backend
- `convex/departments.ts` — Department backend
- `convex/positions.ts` — Position backend

---

### 3.7 PDF Reports / Export

**Status:** 🔲 Not started

**Required files:**

- `src/lib/pdf.ts` (react-pdf or puppeteer wrapper)
- Export utilities for each module

**Features to implement:**

- Export: employee profile, payslip, leave report
- Export: attendance report, team report
- Customizable report templates
- Bulk export (multiple employees)
- Scheduled reports (auto-email)

---

### 3.8 Career Development Paths

**Status:** 🔲 Not started

**Required files:**

- Schema: `convex/schema/careers.ts` (skillMatrices, careerTracks, gapAnalyses, mentorships)
- Backend: `convex/careers.ts`
- UI: `src/components/careers/CareersClient.tsx`
- Route: `src/app/(dashboard)/careers/page.tsx`

**Features to implement:**

- Skill Matrix (skills by position)
- Career tracks (Junior → Mid → Senior → Lead)
- Gap analysis (what's needed for promotion)
- LMS integration (recommended courses)
- Mentorship assignments

---

### 3.9 Shift Scheduling

**Status:** 🔲 Not started

**Required files:**

- Schema: `convex/schema/shifts.ts` (shifts, shiftTemplates, shiftSwaps)
- Backend: `convex/shifts.ts`
- UI: `src/components/shifts/ShiftsClient.tsx`
- Route: `src/app/(dashboard)/shifts/page.tsx`

**Features to implement:**

- Visual shift schedule (week/month view)
- Shift templates (morning, evening, night)
- Swap requests
- Auto-distribution
- Change notifications
- Attendance tracking integration

---

## Already Implemented (Not in Roadmap)

### Dashboard

**Status:** ✅ Fully implemented

- Route: `src/app/(dashboard)/dashboard/page.tsx`
- Component: `src/components/dashboard/DashboardClient.tsx`

### Employees

**Status:** ✅ Fully implemented

- Routes: `src/app/(dashboard)/employees/page.tsx`, `src/app/(dashboard)/employees/[id]/page.tsx`
- Components: `src/components/employees/EmployeesClient.tsx`, `src/components/employees/EmployeeProfilePageClient.tsx`
- Schema: `convex/schema/employees.ts`

### Leaves

**Status:** ✅ Fully implemented

- Route: `src/app/(dashboard)/leaves/page.tsx`
- Component: `src/components/leaves/LeavesClient.tsx`
- Schema: `convex/schema/leaves.ts`
- Backend: `convex/leaves.ts`

### Attendance / Time Tracking

**Status:** ✅ Fully implemented

- Route: `src/app/(dashboard)/attendance/page.tsx`
- Component: `src/components/attendance/AttendanceDashboard.tsx`
- Backend: `convex/timeTracking.ts`

### Tasks

**Status:** ✅ Fully implemented

- Route: `src/app/(dashboard)/tasks/page.tsx`
- Component: `src/components/tasks/TasksClient.tsx`
- Schema: `convex/schema/tasks.ts`
- Backend: `convex/tasks.ts`

### Chat

**Status:** ✅ Fully implemented

- Route: `src/app/(dashboard)/chat/page.tsx`
- Component: `src/components/chat/ChatClient.tsx`
- Schema: `convex/schema/chat.ts`
- Backend: `convex/chat.ts`, `convex/chatAction.ts`

### Calendar

**Status:** ✅ Fully implemented

- Route: `src/app/(dashboard)/calendar/page.tsx`
- Component: `src/components/calendar/CalendarClient.tsx`
- Schema: `convex/schema/calendar.ts`

### Analytics

**Status:** ✅ Fully implemented

- Route: `src/app/(dashboard)/analytics/page.tsx`
- Backend: `convex/analytics.ts`
- Components: LeavesTrendChart, DepartmentStats, LeaveHeatmap, StatsCard

### Payroll

**Status:** ✅ Fully implemented

- Routes: `src/app/(dashboard)/payroll/page.tsx`, `payroll/[id]/page.tsx`, `payroll/runs/page.tsx`, `payroll/settings/page.tsx`
- Schema: `convex/schema/payroll.ts`
- Components: PayrollDashboard, PayrollRecordsTable, PayrollCalculator, PayrollRunDialogs, EditPayrollRecordDialog, PayrollRunDetailClient

### Drivers

**Status:** ✅ Fully implemented (unique feature)

- Routes: `src/app/(dashboard)/drivers/page.tsx`, `drivers/dashboard/page.tsx`, `drivers/favorites/page.tsx`
- Schema: `convex/schema/drivers.ts`
- Backend: `convex/drivers.ts`, `convex/driverAI.ts`
- Components: 40+ files in `src/components/drivers/`

### Approvals

**Status:** ✅ Fully implemented

- Route: `src/app/(dashboard)/approvals/page.tsx`
- Component: `src/components/approvals/ApprovalsClient.tsx`

### AI Chat

**Status:** ✅ Fully implemented

- Route: `src/app/(dashboard)/ai-chat/page.tsx`
- Component: `src/components/ai-chat/AIChatClient.tsx`
- Schema: `convex/schema/ai.ts`
- Backend: `convex/aiChat.ts`, `convex/aiChatMutations.ts`

### Help / Tickets

**Status:** ✅ Fully implemented

- Route: `src/app/(dashboard)/help/page.tsx`
- Schema: `convex/schema/tickets.ts`, `convex/schema/sla.ts`
- Backend: `convex/tickets.ts`, `convex/sla.ts`
- Component: `src/components/help/CreateTicketWizard.tsx`

### Settings

**Status:** ✅ Fully implemented

- Route: `src/app/(dashboard)/settings/page.tsx`
- Schema: `convex/schema/settings.ts`
- Backend: `convex/settings.ts`
- Components: 10 sub-components (Appearance, Cookie, Security, Localization, Integration, Advanced Security, Dashboard Customization, Profile, Productivity, Notification)

### Profile

**Status:** ✅ Fully implemented

- Route: `src/app/(dashboard)/profile/page.tsx`

### Organization Management

**Status:** ✅ Fully implemented

- Schema: `convex/schema/organizations.ts`
- Backend: `convex/organizations.ts`, `convex/organizationJoinRequests.ts`, `convex/organizationRequests.ts`
- Routes: `src/app/(dashboard)/join-requests/page.tsx`, `src/app/(dashboard)/org-requests/page.tsx`

### Admin Panel

**Status:** ✅ Fully implemented

- Routes: `src/app/(dashboard)/admin/page.tsx`, `admin/events/page.tsx`, `admin/join-requests/page.tsx`
- Backend: `convex/admin.ts`, `convex/events.ts`

### Superadmin Panel

**Status:** ✅ Fully implemented

- Routes: 15+ pages (users, organizations, subscriptions, security, automation, impersonation, emergency, bulk actions, create-org, support, stripe-dashboard)
- Backend: `convex/superadmin.ts`, `convex/subscriptions.ts`, `convex/subscriptions_admin.ts`, `convex/security.ts`, `convex/automation*.ts`

### Birthdays

**Status:** ✅ Fully implemented

- Backend: `convex/birthdays.ts`

### Conflicts

**Status:** ✅ Fully implemented

- Backend: `convex/conflicts/main.ts`

---

## Implementation Priority Order

```
PHASE 2 (Competitive Edge — highest impact first):
  2.4 Visual Org Chart ............... ✅ DONE (full i18n, tree layout)
  2.1 LMS ............................ ✅ DONE (full i18n, all core features)
  2.2 Compensation Management ........ ⚠️ DONE (core + UI, HY + budgeting pending)
  2.5 Document Management ............ ⚠️ DONE (core + UI + templates, HY pending)
  3.6 Employee Directory ............. ✅ DONE (full CRUD, departments, positions)
  2.6 Expense Management ............. 🔲 ~3-4 days
  2.3 Benefits Administration ........ 🔲 ~3-4 days
  2.7 Succession Planning ............ 🔲 ~3-4 days

PHASE 3 (Differentiation):
  3.7 PDF Reports .................... 🔲 ~2-3 days  (quick win)
  3.4 Company News Feed .............. 🔲 ~2-3 days
  3.2 Compliance & Audit Trail ....... ⚠️ ~3-4 days (partial - backend only)
  3.1 Mobile App (PWA) ............... 🔲 ~5-7 days
  3.3 Asset Management ............... 🔲 ~3-4 days
  3.5 Custom Workflow Builder ........ ⚠️ ~7-10 days (backend only, no UI)
  3.8 Career Development ............. 🔲 ~4-5 days
  3.9 Shift Scheduling ............... 🔲 ~4-5 days

PHASE 1 (Remaining TODOs):
  1.3 Recruitment email templates .... ✅ DONE (Resend integration, 4 templates)
  1.1 Performance notifications ........ ✅ DONE (cron: checkDeadlineNotifications)
  1.2 OKR reminders .................. ✅ DONE (cron: sendWeeklyCheckinReminders)
  1.4 Onboarding integrations ........ ⚠️ DONE (cron: activateOnboardingTasks, sendOnboardingOverdueReminders)
```

---

## Technical Standards for New Modules

Every new module MUST follow these conventions:

### File Structure

```
convex/schema/{module}.ts          — Database schema (defineTable)
convex/{module}.ts                  — Backend queries + mutations
src/app/(dashboard)/{module}/page.tsx — Server wrapper with nextDynamic
src/components/{module}/{Module}Client.tsx — Client component
src/components/{module}/            — Sub-components (wizards, dialogs, cards)
src/i18n/locales/en.json            — English translations
src/i18n/locales/ru.json            — Russian translations
src/i18n/locales/hy.json            — Armenian translations
```

### Server Wrapper Pattern

```tsx
import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/Skeleton';

export const dynamic = 'force-dynamic';

const ModuleClient = nextDynamic(() => import('@/components/module/ModuleClient'), {
  loading: () => <Skeleton className="h-96 w-full" />,
});

export default function ModulePage() {
  return <ModuleClient />;
}
```

### Client Component Rules

- Use `'use client'` directive at top
- Accept NO `params` props — use `useParams()` hook instead
- Import Skeleton from `@/components/ui/Skeleton` (capital S)
- Import Convex API from `@/convex/_generated/api` (alias, not relative)

### Backend Rules

- All queries must filter `role !== 'superadmin'` from user lists
- Use `MAX_PAGE_SIZE` from `convex/pagination`
- Use indexes (`withIndex`) whenever possible, avoid `.collect()` unless necessary
- All mutations must check RBAC permissions
- Use `SUPERADMIN_EMAIL` from `convex/lib/auth` for superadmin checks

### i18n Rules

- Every new module needs EN + RU + HY translations
- Add nav keys to `src/i18n/locales/{en,ru,hy}.json` under `nav.{module}`
- Use `useTranslation()` hook in client components

### RBAC Rules

- Every module must define which roles can access it
- Permission checks in backend mutations
- UI shows/hides features based on role

---

## Competitive Analysis Summary

| Feature                  |    This Project    | Rippling |  HiBob  | BambooHR | Leapsome |  Deel   |
| ------------------------ | :----------------: | :------: | :-----: | :------: | :------: | :-----: |
| Employee Management      |         ✅         |    ✅    |   ✅    |    ✅    |    ❌    |   ✅    |
| Leave Management         |         ✅         |    ✅    |   ✅    |    ✅    |    ✅    |   ✅    |
| Attendance/Time Tracking |         ✅         |    ✅    |   ✅    |    ✅    |    ❌    |   ❌    |
| Task Management          |         ✅         |    ✅    |   ❌    |    ❌    |    ❌    |   ❌    |
| Chat/Messaging           |         ✅         |    ❌    |   ✅    |    ❌    |    ❌    |   ❌    |
| Calendar                 |         ✅         |    ❌    |   ❌    |    ❌    |    ❌    |   ❌    |
| Recruitment/ATS          |         ✅         |    ✅    |   ✅    |    ✅    |    ❌    |   ✅    |
| Recruitment Emails       |         ✅         |    ❌    |   ❌    |    ❌    |    ❌    |   ❌    |
| Onboarding               |         ✅         |    ✅    |   ✅    |    ✅    |    ✅    |   ✅    |
| Offboarding              |         ✅         |    ✅    |   ✅    |    ✅    |    ✅    |   ✅    |
| Performance Reviews      |         ✅         |    ✅    |   ✅    |    ❌    |    ✅    |   ❌    |
| OKR/Goals                |         ✅         |    ❌    |   ❌    |    ❌    |    ✅    |   ❌    |
| E-Signatures             |         ✅         |    ✅    |   ❌    |    ❌    |    ❌    |   ✅    |
| Pulse Surveys            |         ✅         |    ❌    |   ✅    |    ❌    |    ✅    |   ❌    |
| Recognition/Kudos        |         ✅         |    ❌    |   ✅    |    ❌    |    ✅    |   ❌    |
| AI Assistant             |         ✅         |    ✅    |   ❌    |    ❌    |    ❌    |   ❌    |
| Payroll                  |         ✅         |    ✅    |   ❌    |    ❌    |    ❌    |   ✅    |
| Driver Management        |         ✅         |    ❌    |   ❌    |    ❌    |    ❌    |   ❌    |
| Approvals Workflow       |         ✅         |    ✅    |   ✅    |    ✅    |    ❌    |   ❌    |
| Analytics Dashboard      |         ✅         |    ✅    |   ✅    |    ✅    |    ✅    |   ❌    |
| Multi-language (3+)      |         ✅         |    ✅    |   ✅    |    ❌    |    ❌    |   ✅    |
| **LMS**                  |         ✅         |    ✅    |   ❌    |    ❌    |    ✅    |   ❌    |
| **Compensation**         |         ✅         |    ✅    |   ❌    |    ✅    |    ❌    |   ❌    |
| **Benefits**             |         🔲         |    ✅    |   ❌    |    ✅    |    ❌    |   ✅    |
| **Org Chart**            |         ✅         |    ❌    |   ✅    |    ✅    |    ❌    |   ❌    |
| **Documents**            |         ✅         |    ✅    |   ❌    |    ✅    |    ❌    |   ❌    |
| **Expenses**             |         🔲         |    ✅    |   ❌    |    ❌    |    ❌    |   ❌    |
| **Succession**           |         🔲         |    ❌    |   ❌    |    ❌    |    ✅    |   ❌    |
| **PWA/Mobile**           |         🔲         |    ✅    |   ✅    |    ✅    |    ✅    |   ✅    |
| **TOTAL**                | **~~23~~ **~28\*\* | **~16**  | **~14** | **~11**  | **~10**  | **~13** |

**After completing Phase 2:** This project will have **~31 features**, surpassing all competitors.
**After completing Phase 3:** This project will have **~40 features**, becoming the most comprehensive HR platform.

---

## How to Use This File

1. Pick a module number (e.g., "2.1" for LMS)
2. Check the "Required files" section for what needs to be created
3. Follow the "Technical Standards" for file structure and patterns
4. Update this file after completing each module (change 🔲 → ✅)
5. Update the competitive analysis table

> 💡 **Next recommended module:** 2.6 Expense Management (~3-4 days) or 2.3 Benefits Administration (~3-4 days)
