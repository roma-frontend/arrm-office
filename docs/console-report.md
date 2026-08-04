# 📋 Отчёт: console-вызовы в приложении

> Дата: 2026-08-04 · Собран статическим анализом исходников (`src/` + `convex/`)

## 📊 Сводка

| Тип             | Кол-во                                | Кол-во уникальных сообщений |
| --------------- | ------------------------------------- | --------------------------- |
| `console.error` | **52** (было 235)                     | 44                          |
| `console.warn`  | **11** (было 30)                      | 9                           |
| `console.log`   | **4**                                 | —                           |
| `console.info`  | **1**                                 | —                           |
| `console.debug` | **1**                                 | —                           |
| **Итого**       | **69** в **32 файлах** (было 271/151) | —                           |

> Обновление 2026-08-04: удалены отладочные `console.warn` из `convex/admin.ts` (sendServiceBroadcast, −17) и `convex/birthdays.ts` (−2); `console.error` в `src/app/api/**` и `src/components/**` заменены на `logger.error` из `src/lib/logger.ts` (−183 в 117 файлах).

> **Важно:** `next.config.js` настраивает `removeConsole: { exclude: ['error', 'warn'] }` — в **production `console.log/info/debug` вырезаются компилятором**, а `error` и `warn` остаются. Отчёт ниже отражает dev-источник.

---

## 🔴 console.error — 235 (201 уникальных)

### 1. API-роуты (≈80) — `src/app/api/**`

Все — стандартный паттерн `catch (e) { console.error('...Error:', e) }` в catch-блоках:

| Роут                   | Сообщения                                                                                                                                                                                                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api/auth/*`           | login, logout, forgot-password (×2), refresh-session, create-session, convex-token, oauth-session (×2), imid-callback (×4: «CONVEX_URL is not set», session verification, Convex query, Unexpected), saml, totp setup/status, impersonation start/end, clear-session |
| `api/calendar/*`       | outlook auth/sync/callback, google auth/events/sync/callback                                                                                                                                                                                                         |
| `api/chat/*`           | route («❌ Chat API error», «❌ Both providers failed»), create-task (×2), conflict-check, book-leave, book-driver (×3), weekly-digest, smart-reply, restore-backup, insights, full-context, context, backup-org, backup-employee                                    |
| `api/ai-site-editor/*` | route.ts (×8, **в т.ч. многострочный лог**: `Stack:`, `Message:`, `Full error:`, `=== AI Site Editor Error ===`), apply (×3)                                                                                                                                         |
| `api/stripe/*`         | checkout, transactions (×2)                                                                                                                                                                                                                                          |
| прочие                 | `events/scan-conflicts`, `drivers/available`                                                                                                                                                                                                                         |

### 2. Convex-бэкенд (≈25)

- **`convex/admin.ts` — 17 ошибок** (рекордсмен, см. раздел «Ключевые находки»)
- `convex/security.ts` (×2) — «User not found for suspicious activity», «Superadmin not found for notification»
- `convex/newsletter.ts` — «Email batch error»
- `convex/chatAction.ts` (×2) — «GROQ API error», «Error fetching user/team data»

### 3. Чат / AI (≈30)

- **`AIChatClient.tsx` — 10**: Create conversation, Update title, Save message, Save AI message, Delete conversation, CSRF token fetch/refresh, Auto-rename, общий «AI Chat Page Error»
- **`CallModal.tsx` — 7**: in_call status, media, offer/answer processing, end call, ICE candidate
- `ChatWindow.tsx` (×3), `ThreadPanel`, `MessageBubble`, `ConversationList`, `ConversationInfoPanel`, `NewConversationModal`, `IncomingCallProvider`, `VoiceMessageRecorder`, `BackgroundPicker`, `useChatWidgetAI`, `SiteEditorChat`

### 4. Аутентификация (≈30)

- **`FaceRegistration.tsx` — 8** и **`FaceLogin.tsx` — 6** (в основном — `❌ videoRef is null`, webcam, face models, detection loop)
- `src/auth.ts` — 4 («[Auth.js] ❌ Missing required environment variables» и др.)
- `WebAuthnButton` (×2), `ImidSignInButton`, `GoogleSignInButton`, `useAuthSync` (×2)
- `(auth)/login/page.tsx` (×3), error-страницы: `global-error`, `error`, `(auth)/error`, `(dashboard)/error`, `(dashboard)/analytics/error`

### 5. Superadmin / Admin (≈20)

- `superadmin/support/page.tsx` (×5), `manage-admins` (×2), `organizations/[id]/edit`, `create-org`, `security/page.tsx`, `ImpersonationClient` (×2), `BulkActionsClient` (×2)
- `admin/events/page.tsx` (×3), `HolidayCalendarSync.tsx` (×5: Outlook/Google sync+auth, Export), `ServiceBroadcastsManager`

### 6. Профиль / Настройки

- `(dashboard)/profile/page.tsx` (×4), `(dashboard)/settings/page.tsx`, `LocalizationSettings`, `SecurityMonitor`, `MonitoringProvider` (Sentry init)

### 7. Фичевые компоненты (~60)

- **`src/lib/redis.ts` — 9**: «❌ Failed to initialize Redis», rate limit, login log, security log, cache set/invalidate/delete, block/unblock
- Leaves (×3), Tasks (×3), Expenses (×4), Compensation (×4), Drivers (×6 + geocode ×2), Documents (×4), Surveys, OrgChart, Workflow, `wizard-step-components` (Upload error), `OnboardingTour`, `Navbar` (Logout error), `UpgradeModal`, `SettlementPreviewDialog`, `MyLeaveMoneyCard`, `LeaveConflictAlerts`, `BreakReminderService` (×2), ErrorBoundary/GlobalErrorBoundary

---

## 🟡 console.warn — 30

| Файл                                   | Что логирует                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| ~~`convex/admin.ts` — 17~~             | ~~Дебáг-лог `sendServiceBroadcast`~~ — **удалено 2026-08-04** ✅               |
| ~~`convex/birthdays.ts` — 2~~          | ~~«[Birthday Check]…»~~ — **удалено 2026-08-04** ✅                            |
| `convex/recruitment.ts`                | «Failed to auto-create onboarding program»                                     |
| `src/lib/redis.ts`                     | «⚠️ Redis not configured. Falling back to in-memory…»                          |
| `src/lib/stripe-config.ts`             | «Unknown price ID»                                                             |
| `src/lib/notificationSound.ts` — 3     | play/send failures                                                             |
| `src/lib/logger.ts`                    | `isDev`-гейт (попадёт в прод)                                                  |
| `app/test-i18n/TestI18nClient.tsx` — 4 | «i18n initialized», «Current language»… — **отладочная страница `/test-i18n`** |

---

## 🟢 console.log / info / debug — 6

| Файл                                   | Описание                                                                                             |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/lib/logger.ts` (×4)               | Утилита `logger` — `log/info/debug/warn` **все за `if (isDev)`**, безопасно                          |
| `src/proxy.ts:25`, `src/lib/jwt.ts:10` | НЕ вызовы — **текст инструкций** в сообщениях об ошибках («Generate with: node -e console.log(...)») |

---

## ⚠️ Ключевые находки

1. ~~**`convex/admin.ts` (17×error + 17×warn)** — отладочный вывод `sendServiceBroadcast` (`console.warn` с именами/emails пользователей)~~ — **удалено 2026-08-04** ✅
2. **«❌ CONVEX_URL is not set»** в `imid-callback/route.ts` — признак незаданного env, стоит проверить.
3. **Многострочный лог** в `ai-site-editor/route.ts` — засоряет консоль, лучше вынести в `logger`/Sentry.
4. **`test-i18n` (4×warn)** и **FaceLogin/FaceRegistration (14×error)** — кандидаты на чистку: либо тихий возврат ошибки пользователю, либо `logger`.
5. Всё остальное — **легитимные catch-блоки** с единым паттерном «Сообщение: err». Структура одинаковая, перенос на `logger`/Sentry — безопасный рефакторинг.

---

## 🧹 Рекомендации

- [x] ~~Убрать отладочные `console.warn` с PII из `convex/admin.ts` (`sendServiceBroadcast`) и `convex/birthdays.ts`~~ — **готово 2026-08-04**
- [x] ~~Заменить прямые `console.error` в API-роутах и компонентах на единую утилиту `src/lib/logger.ts`~~ — **готово 2026-08-04** (117 файлов, 183 вызова)
- [ ] Заменить оставшиеся `console.error` вне `src/app/api`/`src/components` (convex, pages, hooks, actions)
- [ ] Проверить «❌ CONVEX_URL is not set» в `api/auth/imid-callback/route.ts`
- [ ] Сократить многострочный лог в `api/ai-site-editor/route.ts`
- [ ] Удалить отладочную страницу `/test-i18n` или закрыть её в production
