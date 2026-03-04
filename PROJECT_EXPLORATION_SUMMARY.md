# Desktop/office Project - Comprehensive Exploration Summary

## Project Overview
This is a **multi-tenant Employee Management & Productivity Platform** built with:
- **Frontend**: Next.js 14+ (React) with TypeScript
- **Backend**: Convex (serverless database & real-time sync)
- **Authentication**: NextAuth with OAuth (Google), Face ID, and WebAuthn
- **Payment**: Stripe integration for subscription management
- **Infrastructure**: Vercel deployment, OpenTelemetry monitoring, Sentry error tracking

---

## 📊 Directory Structure

```
Desktop/office/
├── convex/                    # Backend (Convex database functions)
│   ├── schema.ts             # Complete data model (23 tables)
│   ├── users.ts              # User management & auth
│   ├── organizations.ts       # Multi-tenant org management
│   ├── leaves.ts             # Leave request workflow
│   ├── tasks.ts              # Task management system
│   ├── timeTracking.ts       # Attendance & check-in/out
│   ├── employeeProfiles.ts   # Employee profiles & documents
│   ├── supervisorRatings.ts  # Performance ratings
│   ├── analytics.ts          # Analytics & dashboards
│   ├── productivity.ts       # Productivity metrics & Pomodoro
│   ├── security.ts           # Security settings & login attempts
│   ├── faceRecognition.ts    # Face ID authentication
│   ├── notifications.ts      # Notification system
│   ├── subscriptions.ts      # Stripe subscription management
│   └── [more backend files]
├── src/
│   ├── app/                  # Next.js app directory (pages & routes)
│   ├── components/           # React components (organized by feature)
│   ├── lib/                  # Utility functions & helpers
│   ├── hooks/               # Custom React hooks
│   ├── store/               # Zustand state management
│   ├── actions/             # Server actions
│   └── types/               # TypeScript type definitions
├── public/                   # Static assets & ML models
└── package.json             # Dependencies
```

---

## 🎯 Core Features & Data Models

### 1. **Authentication & User Management**
**Data Models:**
- `users` - Core user table with 40+ fields
- `webauthnCredentials` - WebAuthn security keys
- `loginAttempts` - Login history with risk scoring
- `deviceFingerprints` - Device tracking
- `keystrokeProfiles` - Keystroke dynamics for biometric auth

**Key Features:**
- ✅ Email/password authentication
- ✅ Google OAuth integration
- ✅ Face ID authentication (with face descriptor storage)
- ✅ WebAuthn (hardware security keys)
- ✅ Adaptive authentication with risk scoring
- ✅ Account suspension/lockout after 5 failed attempts
- ✅ Device fingerprinting & keystroke analysis
- ✅ Session management with expiry tokens

**User Fields:**
```typescript
- email, passwordHash, role (superadmin/admin/supervisor/employee)
- employeeType (staff/contractor)
- department, position, phone, location
- avatarUrl, presenceStatus
- supervisorId (hierarchy)
- isActive, isApproved, isSuspended
- travelAllowance, paidLeaveBalance, sickLeaveBalance, familyLeaveBalance
- faceDescriptor, faceImageUrl, faceRegisteredAt
- focusModeEnabled, workHoursStart/End, breakRemindersEnabled
- language, timezone, dateFormat, timeFormat
- dashboardWidgets customization
```

---

### 2. **Multi-Tenant Organization Management**
**Data Models:**
- `organizations` - Tenant organizations
- `organizationRequests` - Org creation approval workflow
- `organizationInvites` - Employee join requests

**Key Features:**
- ✅ Multi-tenant SaaS with org isolation
- ✅ Org creation requests (for Professional/Enterprise plans)
- ✅ Invite links for new employees
- ✅ Employee limit enforcement per plan
- ✅ Org settings: logo, colors, timezone, country, industry
- ✅ Plan tiers: Starter (10 employees), Professional (50), Enterprise (unlimited)

**Organization Fields:**
```typescript
- name, slug (unique URL-safe identifier)
- plan, isActive
- logoUrl, primaryColor
- timezone, country, industry
- employeeLimit (enforced per plan)
```

---

### 3. **Leave Management System**
**Data Models:**
- `leaveRequests` - Leave request workflows
- `slaConfig` - SLA configuration per org
- `slaMetrics` - SLA compliance tracking

**Key Features:**
- ✅ Leave types: paid, unpaid, sick, family, doctor
- ✅ Leave balance tracking (paid: 24 days, sick: 10 days, family: 5 days)
- ✅ Request approval workflow (pending → approved/rejected)
- ✅ SLA monitoring (response time tracking with warning/critical thresholds)
- ✅ Automatic balance deduction on approval
- ✅ Cross-organization access control
- ✅ Leave deletion with balance restoration
- ✅ Admin comments and review tracking

**Leave Request Fields:**
```typescript
- userId, organizationId
- type (paid/unpaid/sick/family/doctor)
- startDate, endDate, days
- reason, comment
- status (pending/approved/rejected)
- reviewedBy, reviewComment, reviewedAt
- isRead flag for admin notification tracking
```

---

### 4. **Attendance & Time Tracking**
**Data Models:**
- `timeTracking` - Daily check-in/out records
- `workSchedule` - Employee work hours

**Key Features:**
- ✅ Check-in/check-out system
- ✅ Late arrival tracking
- ✅ Early leave detection
- ✅ Overtime calculation
- ✅ Armenia timezone support (UTC+4)
- ✅ Scheduled vs actual time comparison
- ✅ Daily attendance summary
- ✅ Team presence status

**Time Tracking Fields:**
```typescript
- userId, date
- checkInTime, checkOutTime
- scheduledStartTime, scheduledEndTime
- isLate, lateMinutes
- isEarlyLeave, earlyLeaveMinutes
- overtimeMinutes, totalWorkedMinutes
- status (checked_in/checked_out/absent)
- notes
```

---

### 5. **Task Management**
**Data Models:**
- `tasks` - Task records with attachments
- `taskComments` - Task comments with authors

**Key Features:**
- ✅ Task creation and assignment
- ✅ Status workflow: pending → in_progress → review → completed/cancelled
- ✅ Priority levels: low, medium, high, urgent
- ✅ Deadline tracking
- ✅ File attachments (with metadata)
- ✅ Task comments with author tracking
- ✅ Task tags for categorization
- ✅ Supervisor assignment to employees
- ✅ Notifications on status changes

**Task Fields:**
```typescript
- title, description
- assignedTo, assignedBy
- status (pending/in_progress/review/completed/cancelled)
- priority (low/medium/high/urgent)
- deadline
- tags, attachments (array with file metadata)
- completedAt
```

---

### 6. **Employee Profiles & Documentation**
**Data Models:**
- `employeeProfiles` - Extended employee info
- `employeeDocuments` - Document storage with categories
- `employeeNotes` - Manager notes with visibility levels

**Key Features:**
- ✅ Biography: education, certifications, work history, skills, languages
- ✅ Document management: resume, contract, certificates, performance reviews, ID documents
- ✅ Manager notes with sentiment tracking (positive/neutral/negative)
- ✅ Note visibility: private, HR only, manager only, employee visible
- ✅ Document categorization and search
- ✅ Upload timestamp and uploader tracking

**Employee Profile Fields:**
```typescript
- userId, organizationId
- biography (education[], certifications[], workHistory[], skills[], languages[])
```

**Employee Document Fields:**
```typescript
- userId, uploaderId, organizationId
- category (resume/contract/certificate/performance_review/id_document/other)
- fileName, fileUrl, fileSize, description
- uploadedAt
```

**Employee Note Fields:**
```typescript
- employeeId, authorId, organizationId
- type (performance/behavior/achievement/concern/general)
- visibility (private/hr_only/manager_only/employee_visible)
- content, sentiment (positive/neutral/negative)
- tags[]
```

---

### 7. **Performance Management**
**Data Models:**
- `performanceMetrics` - Performance scores
- `supervisorRatings` - 1-on-1 supervisor ratings

**Key Features:**
- ✅ 9-point performance metrics:
  - Punctuality score, absence rate, late arrivals
  - KPI score, project completion, deadline adherence
  - Teamwork rating, communication score, conflict incidents
- ✅ Supervisor ratings (1-5 scale):
  - Quality of work, efficiency, teamwork, initiative, communication, reliability
  - Overall rating (auto-calculated average)
  - Strengths & areas for improvement
  - Rating period tracking (monthly)
- ✅ Performance history (last 12 months by default)
- ✅ Average ratings calculation

**Performance Metrics Fields:**
```typescript
- userId, updatedBy, organizationId
- punctualityScore, absenceRate, lateArrivals
- kpiScore, projectCompletion, deadlineAdherence
- teamworkRating, communicationScore, conflictIncidents
```

---

### 8. **Productivity & Wellness**
**Data Models:**
- `pomodoroSessions` - Pomodoro timer sessions
- `aiSiteEditorSessions` - AI-powered editing sessions

**Key Features:**
- ✅ Pomodoro timer with session tracking
- ✅ Task focus tracking (optional task ID per session)
- ✅ Session completion/interruption tracking
- ✅ Today's stats: hours worked (today & week), tasks completed, deadlines
- ✅ Weekly goal progress (target: 40 hours)
- ✅ Team presence status (available, in_meeting, in_call, out_of_office, busy)
- ✅ Top 3 priority tasks for today

**Pomodoro Session Fields:**
```typescript
- userId, taskId (optional)
- startTime, endTime, duration, actualEndTime
- completed, interrupted
```

---

### 9. **Analytics & Reporting**
**Data Models:**
- `analytics` queries - Read-only aggregations

**Key Features:**
- ✅ Organization overview (total employees, pending approvals, leave stats)
- ✅ Department breakdown and statistics
- ✅ Leave trends (last 6 months)
- ✅ User personal analytics (leave balance, pending days, type breakdown)
- ✅ Team calendar (who's on leave in next 30 days)
- ✅ Approval time calculation (avg hours to approve leaves)
- ✅ Department-level leave averages

**Analytics Outputs:**
```typescript
- totalEmployees, pendingApprovals
- totalLeaves, pendingLeaves, approvedLeaves
- avgApprovalTime (in hours)
- departments breakdown
- users & leaves enriched data
```

---

### 10. **Security & Compliance**
**Data Models:**
- `securitySettings` - Global security feature toggles
- `auditLogs` - Action audit trail
- `loginAttempts` - Login history with risk scoring

**Security Features:**
- ✅ Audit logging (all actions with IP, user, timestamp)
- ✅ Adaptive authentication (risk-based challenges)
- ✅ Device fingerprinting & recognition
- ✅ Keystroke dynamics biometric analysis
- ✅ Continuous face verification (background)
- ✅ Failed login lockout (5 attempts = auto-lock)
- ✅ New device notifications to admins
- ✅ Risk scoring with factors tracking

**Security Settings Keys:**
```
- audit_logging
- adaptive_auth
- device_fingerprinting
- keystroke_dynamics
- continuous_face
- failed_login_lockout
- new_device_alert
```

**Login Attempt Fields:**
```typescript
- email, userId, organizationId
- success, method (password/face_id/webauthn/google)
- ip, userAgent, deviceFingerprint
- riskScore, riskFactors[], blockedReason
- country, city
```

---

### 11. **Notifications System**
**Data Models:**
- `notifications` - User notifications (inbox)

**Key Features:**
- ✅ Notification types:
  - leave_request, leave_approved, leave_rejected
  - employee_added
  - join_request, join_approved, join_rejected
  - security_alert, system
- ✅ Unread tracking per user
- ✅ Notification metadata (JSON) for quick actions
- ✅ Related ID tracking (link to source record)
- ✅ Read/unread status management
- ✅ Batch mark as read

**Notification Fields:**
```typescript
- userId, organizationId
- type, title, message
- isRead
- relatedId (link to source: leave, task, etc.)
- metadata (JSON for quick actions)
```

---

### 12. **Subscription & Billing**
**Data Models:**
- `subscriptions` - Stripe subscription records
- `contactInquiries` - Contact form submissions

**Key Features:**
- ✅ Stripe integration (checkout sessions, webhooks)
- ✅ Subscription management (active, trialing, past_due, canceled, incomplete)
- ✅ Plan tracking (starter, professional, enterprise)
- ✅ Trial period tracking
- ✅ Billing period management
- ✅ Cancel at period end
- ✅ Contact inquiry collection for Enterprise sales

**Subscription Fields:**
```typescript
- organizationId (tenant)
- stripeCustomerId, stripeSubscriptionId, stripeSessionId
- plan, status
- currentPeriodStart, currentPeriodEnd
- trialEnd, cancelAtPeriodEnd
- email, userId
```

---

### 13. **User Preferences & Settings**
**Data Models:**
- `userPreferences` - Key-value preference store
- `users` - Embedded settings fields

**Key Features:**
- ✅ Personalization: language, timezone, date/time format
- ✅ Dashboard customization (widget selection)
- ✅ Productivity settings (focus mode, break reminders, work hours)
- ✅ UI settings (compact mode, refresh rate, default view)
- ✅ Tour completion tracking
- ✅ Theme preferences
- ✅ Notification preferences

**User Preference Keys:**
```
- tour_seen_login-tour
- tour_seen_register-tour
- theme
- notifications_enabled
- [custom settings]
```

---

### 14. **AI Features**
**Data Models:**
- `aiSiteEditorSessions` - AI site editor sessions with plan limits
- `aiSiteEditorUsage` - Monthly usage tracking per plan

**Key Features:**
- ✅ AI-powered site editor with edit history
- ✅ Edit types: design, content, layout, logic, full_control
- ✅ Plan-based limitations:
  - **Starter**: Limited actions (design: 5/mo, content: 10/mo, layout: 2/mo, no logic/full)
  - **Professional**: Unlimited actions
  - **Enterprise**: Unlimited actions
- ✅ Rollback capability
- ✅ Token usage tracking
- ✅ Monthly reset tracking

**AI Session Fields:**
```typescript
- organizationId, userId, plan
- userMessage, aiResponse
- editType (design/content/layout/logic/full_control)
- targetComponent
- changesMade[] (file, type, description, before, after)
- limitType (limited/unlimited)
- tokensUsed, status (pending/completed/failed/rejected)
- canRollback, rolledBack, rolledBackAt
```

---

### 15. **API Routes & Integrations**

**Authentication APIs:**
- `/api/auth/[...nextauth]` - NextAuth handler
- `/api/auth/login`, `/api/auth/forgot-password`, `/api/auth/reset-password`
- `/api/auth/face-login` - Face ID authentication
- `/api/auth/email-login` - Email login
- `/api/auth/oauth-session` - OAuth session creation
- `/api/auth/create-session` - Session creation

**Calendar Integration:**
- `/api/calendar/google/auth`, `/callback`, `/sync`
- `/api/calendar/outlook/auth`, `/callback`, `/sync`

**Chat & AI:**
- `/api/chat` - Main chat endpoint
- `/api/chat/context` - Get chat context
- `/api/chat/full-context` - Full conversation context
- `/api/chat/book-leave` - AI assist for leave booking
- `/api/chat/edit-leave` - AI assist for leave editing
- `/api/chat/delete-leave` - AI assist for leave deletion
- `/api/chat/insights` - Generate insights
- `/api/chat/weekly-digest` - Weekly digest generation
- `/api/ai-site-editor` - AI site editor
- `/api/ai-site-editor/apply` - Apply AI changes

**Security APIs:**
- `/api/security/face-verify` - Face verification
- `/api/security/log-event` - Log security event
- `/api/security/metrics` - Get security metrics
- `/api/security/quick-action` - Quick security action

**Admin APIs:**
- `/api/admin/calendar/export` - Export calendar
- `/api/admin/conflicts` - Detect scheduling conflicts
- `/api/admin/cost-analysis` - Cost analysis
- `/api/admin/smart-suggestions` - Smart suggestions for approvals

**Stripe APIs:**
- `/api/stripe/checkout` - Create checkout session
- `/api/stripe/webhook` - Webhook handler
- `/api/stripe/run-script` - Admin script execution

---

## 🔧 Frontend Components Structure

### Layout & Navigation
```
components/layout/
├── Navbar.tsx              # Top navigation bar
├── Sidebar.tsx             # Main sidebar navigation
├── OrganizationSelector.tsx # Org switcher (multi-tenant)
└── Providers.tsx           # App providers wrapper
```

### Authentication Components
```
components/auth/
├── FaceLogin.tsx           # Face ID login
├── FaceRegistration.tsx    # Face ID registration
├── GoogleSignInButton.tsx  # OAuth button
├── WebAuthnButton.tsx      # WebAuthn registration
├── PasswordStrengthIndicator.tsx
├── SmartEmailInput.tsx
├── SmartPasswordInput.tsx
├── OAuthSyncLoader.tsx
└── SmartErrorMessage.tsx
```

### Dashboard & Analytics
```
components/dashboard/
├── DashboardClient.tsx
├── EmployeeDashboard.tsx
├── PersonalAnalytics.tsx
└── StatsCard.tsx

components/analytics/
├── DepartmentStats.tsx
├── LeaveHeatmap.tsx
├── LeavesTrendChart.tsx
└── StatsCard.tsx
```

### Employee Management
```
components/employees/
├── AddEmployeeModal.tsx
├── EditEmployeeModal.tsx
├── EmployeeHoverCard.tsx
├── EmployeeProfileDetail.tsx
└── EmployeesClient.tsx
```

### Leave Management
```
components/leaves/
├── AILeaveAssistant.tsx    # AI-assisted leave requests
├── LeaveRequestModal.tsx
└── LeavesClient.tsx
```

### Task Management
```
components/tasks/
├── CreateTaskModal.tsx
├── TaskDetailModal.tsx
├── TaskAttachments.tsx
├── AssignSupervisorModal.tsx
└── TasksClient.tsx
```

### Attendance
```
components/attendance/
├── AttendanceDashboard.tsx
├── CheckInOutWidget.tsx
├── EmployeeAttendanceDrawer.tsx
├── AttendanceDetailModal.tsx
└── SupervisorRatingForm.tsx
```

### Productivity
```
components/productivity/
├── PomodoroTimer.tsx
├── FocusMode.tsx
├── FocusModeIndicator.tsx
├── BreakReminderService.tsx
├── QuickStatsWidget.tsx
├── TeamPresence.tsx
├── TodayTasksPanel.tsx
```

### Security & Monitoring
```
components/security/
├── ContinuousFaceVerification.tsx
├── CSRFProtection.tsx
└── SecurityMonitor.tsx

components/admin/
├── ConflictDetection.tsx   # Detect overlapping leaves
├── CostAnalysis.tsx
├── ResponseTimeSLA.tsx
├── SLASettings.tsx
├── SmartSuggestions.tsx
└── HolidayCalendarSync.tsx
```

### Settings
```
components/settings/
├── ProfileSettings.tsx
├── SecuritySettings.tsx
├── AdvancedSecuritySettings.tsx
├── NotificationSettings.tsx
├── ProductivitySettings.tsx
├── LocalizationSettings.tsx
├── IntegrationSettings.tsx
├── AppearanceSettings.tsx
├── DashboardCustomization.tsx
└── CookiePreferences.tsx
```

### AI Features
```
components/ai/
├── ChatWidget.tsx
├── AIRecommendationsCard.tsx
├── SiteEditorChat.tsx
└── WeeklyDigestWidget.tsx
```

---

## 🗂️ Data Model Summary Table

| Table | Purpose | Key Fields | Indexes |
|-------|---------|-----------|---------|
| `users` | Core user data | email, role, organizationId, dept, supervisorId, face data | by_email, by_org, by_role, by_approval |
| `organizations` | Tenant orgs | name, slug, plan, employeeLimit | by_slug, by_plan, by_active |
| `leaveRequests` | Leave workflows | userId, type, status, days, dates | by_org, by_user, by_status |
| `timeTracking` | Attendance | userId, checkIn/Out, isLate, date | by_user, by_date, by_status |
| `tasks` | Task management | title, assignedTo, status, priority, deadline | by_assigned_to, by_status |
| `employeeProfiles` | Extended profiles | userId, biography object | by_user |
| `employeeDocuments` | File storage | userId, category, fileUrl | by_user |
| `performanceMetrics` | Performance scores | userId, 9 metrics | by_user |
| `supervisorRatings` | 1-on-1 ratings | employeeId, supervisorId, 6 ratings | by_employee, by_supervisor |
| `notifications` | User inbox | userId, type, isRead | by_user, by_user_unread |
| `subscriptions` | Stripe data | stripeCustomerId, plan, status | by_stripe_customer |
| `pomodoroSessions` | Timer sessions | userId, duration, completed | by_user |
| `securitySettings` | Feature toggles | key, enabled | by_key |
| `loginAttempts` | Login history | email, userId, success, riskScore | by_email, by_user |
| `auditLogs` | Action history | userId, action, target | by_user |
| `slaMetrics` | SLA tracking | leaveRequestId, responseTime, status | by_leave |

---

## 🔐 Security Architecture

### Authentication Methods
1. **Password-based** (with strength validation)
2. **Face ID** (ML-based facial recognition with descriptor matching)
3. **WebAuthn** (hardware security keys - FIDO2)
4. **OAuth** (Google, with auto-approval)

### Risk-Based Authentication
- Device fingerprinting (track known/unknown devices)
- Keystroke dynamics (biometric typing pattern analysis)
- IP geolocation (detect impossible travel)
- Login attempt tracking with auto-lockout
- Continuous background face verification

### Data Protection
- Organization isolation (cross-org access checks everywhere)
- Role-based access control (superadmin/admin/supervisor/employee)
- Audit logging of all actions
- Encrypted password hashes
- Session token expiry management

---

## 💼 Multi-Tenant Architecture

### Tenant Isolation Strategy
1. **Organization-scoped queries** - Every table with `organizationId` index
2. **Cross-org protection checks** - Verify requester org matches resource org
3. **Superadmin override** - Single account sees all orgs (email: romangulanyan@gmail.com)
4. **Plan enforcement** - Employee limits per plan tier
5. **Invite system** - Controlled employee onboarding

### Plan Tiers
- **Starter**: 10 employees max, limited AI features
- **Professional**: 50 employees, unlimited AI
- **Enterprise**: Unlimited, dedicated support

---

## 🎨 Frontend Pages Structure

```
src/app/
├── (auth)                      # Authentication pages
│   ├── login
│   ├── register
│   ├── forgot-password
│   ├── reset-password
│   └── register-org/          # Org creation flow
│       ├── request
│       ├── create
│       └── pending
├── (dashboard)                # Main app (protected)
│   ├── dashboard              # Main overview
│   ├── employees              # Employee list & detail
│   ├── leaves                 # Leave management
│   ├── attendance             # Time tracking & attendance
│   ├── tasks                  # Task management
│   ├── calendar               # Calendar view
│   ├── analytics              # Analytics & reports
│   ├── approvals              # Leave approvals
│   ├── profile                # User profile
│   ├── settings               # User settings
│   ├── ai-chat                # AI chat interface
│   ├── ai-site-editor         # AI site editor
│   ├── reports                # Reports
│   └── superadmin/            # Superadmin features
│       ├── organizations      # Org management
│       ├── security           # Security monitoring
│       ├── subscriptions      # Subscription management
│       └── stripe-dashboard   # Stripe dashboard
├── api/                       # API routes
├── checkout/success           # Payment success page
├── contact                    # Contact form
├── privacy & terms            # Legal pages
└── test-i18n                  # i18n testing
```

---

## 🌐 Internationalization (i18n)

**Supported Languages:**
- English (en.json)
- Armenian (hy.json)
- Russian (ru.json)

**Configuration:** `src/i18n/config.ts`

**Components:**
- `I18nProvider.tsx` - i18n context
- `LanguageSwitcher.tsx` - Language selector

---

## 📦 Key Dependencies

### Frontend
- Next.js 14+
- React 18+
- TypeScript
- TailwindCSS (styling)
- Convex client (real-time DB)
- NextAuth.js (authentication)
- Stripe.js (payment)
- face-api.js (Face ID ML)

### Backend (Convex)
- Convex CLI
- TypeScript

### DevOps & Monitoring
- OpenTelemetry (tracing)
- Sentry (error tracking)
- Vercel (deployment)

---

## 🚀 Key Features at a Glance

### Employee Features
✅ Face ID / WebAuthn login  
✅ Leave request submission  
✅ Attendance check-in/out  
✅ Task tracking  
✅ Productivity stats (Pomodoro, focus time)  
✅ Personal analytics  
✅ Profile management  

### Manager/Supervisor Features
✅ Leave approval workflow  
✅ Employee performance ratings  
✅ Task assignment & tracking  
✅ Team attendance monitoring  
✅ SLA response time tracking  
✅ Team presence visibility  

### Admin Features
✅ Organization management  
✅ Employee onboarding/approval  
✅ Leave & attendance analytics  
✅ Security monitoring  
✅ User role assignment  
✅ Subscription management  

### Superadmin Features
✅ Multi-org management  
✅ Organization creation  
✅ Subscription & billing  
✅ Security settings (global toggles)  
✅ Stripe dashboard access  

---

## 📝 Notes

1. **Armenia Timezone**: System explicitly handles UTC+4 timezone for Armenia throughout
2. **SLA Monitoring**: Leave approval response times tracked with warning/critical thresholds
3. **AI Integration**: AI-assisted leave booking, editing, and site editing with plan-based limits
4. **Real-time Sync**: Convex provides real-time updates for all changes
5. **Audit Trail**: Complete audit logging of all admin/sensitive actions
6. **Plan Limits**: Enforced throughout (employee count, AI editor sessions per month)

---

## 🎯 Development Focus Areas

The application is production-ready with emphasis on:
- **Security**: Multiple auth methods, risk-based authentication, comprehensive audit logging
- **Scalability**: Multi-tenant architecture, Convex backend for real-time sync
- **UX**: Extensive UI customization, internationalization, responsive design
- **Compliance**: SLA tracking, audit logs, GDPR-friendly design
- **Analytics**: Comprehensive dashboards for employees, managers, and admins

