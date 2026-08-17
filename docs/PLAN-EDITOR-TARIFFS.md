# PLAN-EDITOR — система тарифов и планов (суперадмин-конструктор) + LiveKit Фаза 2

> **Статус:** план для реализации (следующий рабочий день).
> **Стек:** Next.js (App Router) + Convex + react-i18next (en/ru/de/hy) + Tailwind v4 (design tokens).
> **Цель:** суперадмин управляет тарифами **Starter / Pro / Enterprise** полностью из UI — какие модули входят, какие лимиты у каждого модуля, цены, CTA — **без единого изменения кода**. Изменения мгновенно (в реальном времени) появляются на лендинге и действуют по всей системе. Заявленное в тарифе = исполняемое в продукте.

---

## 0. TL;DR

| Проблема                                       | Решение                                                                                                  |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Модули добавляются, а тарифы «зашиты» в код    | **Каталог модулей** (`billingModules`) — все модули, включая будущие (`status: coming`)                  |
| Цены/лимиты хардкодом на лендинге и в коде     | **Таблицы планов и прав** — один источник истины, лендинг читает их live                                 |
| «Написано 50 сотрудников, а можно завести 500» | **Enforcement-движок**: серверные проверки `assertModuleAccess` / `assertQuota` + счётчики использования |
| Клиент видел один план, а мы поменяли — молча  | **Версионирование планов**: орг привязана к версии плана, которую видела при подписке                    |
| Ошибка суперадмина улетает в прод              | **Draft/Publish** (механика уже есть в лендинг-редакторе) + аудит изменений                              |

---

## 1. Почему это критично (планы = деньги)

- **Доверие клиента:** если на лендинге «до 50 сотрудников», система обязана блокировать 51-го с внятным upgrade-экраном, а не молча разрешать.
- **Масштабируемость:** запуск нового модуля (например, видеоконференции) не должен требовать релиза — суперадмин включает его в тарифы в конструкторе за минуту.
- **Юридическая чистота:** версия плана, которую клиент видел при подписке, фиксируется — изменение тарифов не отменяет обещанное задним числом.
- **Каждый чекбокс действует:** включение модуля в план = доступ по всей системе; лимит = реальное ограничение; выключение = блокировка с upgrade-предложением.

---

## 2. Данные (Convex schema)

### 2.1. `billingModules` — каталог ВСЕХ модулей (включая будущие)

```ts
billingModules: defineTable({
  key: v.string(), // 'employees', 'attendance', 'videoConferences', ...
  name: v.string(), // default (EN); переводы в i18n по key
  description: v.optional(v.string()),
  icon: v.optional(v.string()), // lucide icon key
  category: v.string(), // People | Finance | Performance | Communication | ...
  status: v.union(v.literal('active'), v.literal('beta'), v.literal('coming')), // 'coming' = будущие
  isCore: v.boolean(), // always in every plan (dashboard, profile...)
  featureToggleKey: v.optional(v.string()), // связь с существующей системой featureToggles (операторская консоль)
  /** JSON-schema опций модуля — что суперадмин сможет настраивать в редакторе:
   *  { "seats": { "type": "number", "label": "...", "unit": "seats", "min": 1 },
   *    "faceKiosks": { "type": "number", "unit": "devices" },
   *    "aiAssistant": { "type": "boolean" } }
   */
  settingsSchema: v.optional(v.string()), // JSON string
  sortOrder: v.optional(v.number()),
})
  .index('by_category', ['category'])
  .index('by_status', ['status']);
```

**Seed-каталог (первая версия, ~50 модулей):** employees, departments, positions, attendance (biometric/face), timeTracking, leaves, calendar, meetingRooms, videoConferences _(новый, active)_, chat, tasks, projects, drivers, payroll, compensation, performance (OKR), reviews, recruitment, onboarding, offboarding, surveys, recognition, rewards, learning, documents, signatures, assets, expenses, news, approvals, reports, analytics, orgchart, aiAssistant, aiSiteEditor, securityCenter, compliance (GDPR), integrations, automation, newsletter, backups, probation, supportTickets, ... — плюс **будущие** (`coming`): aiMeetingAgent, breakoutRooms, guestAccess, mobileApp, apiAccess.

> Ключевое: модуль `coming` уже конфигурируется в тарифах сегодня, а «оживает» автоматически, когда выходит в прод (проверка `status !== 'coming'` в enforcement).

### 2.2. `billingPlans` — планы

```ts
billingPlans: defineTable({
  key: v.union(v.literal('starter'), v.literal('pro'), v.literal('enterprise')),
  name: v.string(), // 'Starter', 'Pro', 'Enterprise' (i18n-оверрайды)
  tagline: v.optional(v.string()), // подзаголовок на карточке лендинга
  priceMonthly: v.optional(v.number()), // USD/мес; undefined = 'Contact us' (Enterprise)
  priceYearly: v.optional(v.number()), // USD/мес при годовой оплате (для анимации переключения)
  currency: v.string(),
  isActive: v.boolean(),
  isPopular: v.boolean(), // подсветка «Хит» на лендинге
  isCustom: v.boolean(), // Enterprise → CTA «Contact sales»
  ctaLabel: v.optional(v.string()),
  sortOrder: v.number(),
  createdBy: v.id('users'),
  updatedAt: v.number(),
}).index('by_active', ['isActive']);
```

### 2.3. `billingPlanEntitlements` — матрица «модуль × план» (главная таблица)

```ts
billingPlanEntitlements: defineTable({
  planId: v.id('billingPlans'),
  moduleKey: v.string(),
  included: v.boolean(), // модуль доступен на тарифе?
  /** Лимит из settingsSchema модуля: { seats: 50, faceKiosks: 2, aiAssistant: true } */
  limits: v.optional(v.string()), // JSON blob — значения опций для ЭТОГО тарифа
  overLimit: v.union(v.literal('block'), v.literal('warn'), v.literal('allow')),
  updatedAt: v.number(),
})
  .index('by_plan', ['planId'])
  .index('by_module', ['moduleKey']);
```

### 2.4. `billingPlanVersions` — опубликованные снапшоты (что реально «продаётся»)

```ts
billingPlanVersions: defineTable({
  planId: v.id('billingPlans'),
  version: v.number(), // 1, 2, 3...
  /** Полный снапшот плана + entitlements на момент публикации (JSON) */
  snapshot: v.string(),
  publishedBy: v.id('users'),
  publishedAt: v.number(),
}).index('by_plan_version', ['planId', 'version']);
```

### 2.5. `billingUsageCounters` — фактическое использование (для лимитов)

```ts
billingUsageCounters: defineTable({
  organizationId: v.id('organizations'),
  moduleKey: v.string(),
  usageKey: v.string(), // 'seats', 'faceKiosks', 'apiCalls'...
  period: v.string(), // '2026-08' для месячных лимитов | 'total' для абсолютных
  count: v.number(),
}).index('by_org_module_period', ['organizationId', 'moduleKey', 'period']);
```

### 2.6. `subscriptions` (существующая таблица — расширить)

```ts
// + subscription.planId: v.id('billingPlans')
// + subscription.planVersion: v.number()   // версия, на которой клиент подписался
// + subscription.overrides: v.optional(v.string())  // JSON: персональные лимиты/скидки
// + subscription.status: active | trial | past_due | canceled
```

---

## 3. Enforcement-движок («написано — значит действует»)

Всё проверяется **на сервере** (Convex), клиент никогда не решает сам.

### 3.1. Хелперы в `convex/lib/entitlements.ts`

```ts
getOrgEntitlements(ctx, organizationId); // → { plan, planVersion, moduleMap: { key: { included, limits, overLimit } } }
// Кэш: mtime-подобный ре-резолв только при изменении подписки/версии плана.

assertModuleAccess(ctx, moduleKey); // бросает 'Module "X" is not included in your plan'
// 1) featureToggle включён (глобально/для орг) → иначе 'Feature disabled'
// 2) модуль активен (не 'coming') → иначе 'Coming soon'
// 3) entitlement.included === true     → иначе upgrade-ошибка с planKey

assertQuota(ctx, moduleKey, usageKey, (delta = 1));
// 1) assertModuleAccess
// 2) limit = entitlement.limits[usageKey]; undefined/0 → unlimited
// 3) счётчик за период + delta <= limit  → ок (и инкремент в той же мутации)
// 4) иначе: overLimit === 'block' → Error('Quota exceeded…') | 'warn' → возврат { warning } | 'allow' → пропуск
```

### 3.2. Примеры внедрения по модулям

| Модуль           | Где ставим проверку                   | Пример                                                                 |
| ---------------- | ------------------------------------- | ---------------------------------------------------------------------- |
| employees        | `users:create`, `invites`             | `assertQuota('employees','seats')` перед созданием пользователя        |
| drivers          | `drivers:create`                      | лимит водителей                                                        |
| documents        | `documents:create`                    | лимит документов/месяц                                                 |
| attendance       | query списка                          | `assertModuleAccess` — скрыть блок                                     |
| videoConferences | `meetings:ensureRoom`                 | лимит создаваемых комнат                                               |
| aiAssistant      | mutation запросов                     | лимит запросов/месяц (счётчик `usageKey: 'queries'`, период `2026-08`) |
| Sidebar/модули   | клиентский хук `useOrgEntitlements()` | скрыть/показать пункты меню + бейдж «Upgrade»                          |

### 3.3. UI-реакции (клиент)

- **Хук `useOrgEntitlements()`** — публикует `{ plan, moduleMap, isTrial }` всем компонентам.
- **Sidebar / модульные сетки** — пункты вне плана скрыты или с замочком + «Upgrade».
- **Upgrade-модалка** — при `Quota exceeded` / `Module not included`: красивая карточка с планами (данные из Convex live) и CTA.
- **Баннер** — «У вас тариф Pro, лимит сотрудников 50/50 — освободите место или перейдите на Enterprise».

---

## 4. Draft/Publish — как в лендинг-редакторе (уже проверено)

- **Draft** — суперадмин редактирует в конструкторе, изменения видны только в превью.
- **Publish** — атомарно: создаётся `billingPlanVersions` (снапшот) + `billingPlans`/`billingPlanEntitlements` помечаются published.
- **Лендинг и система читают только published** — полуготовый черновик никогда не «утекает» в прод (механика 1-в-1 из `landingTexts`, включая `bindI18nStore` для live-обновления).
- **Откат** — «Restore» к любой предыдущей версии плана.

---

## 5. Editor UX — `/superadmin/plans` (красиво, умно, модно)

### 5.1. Три колонки-«карточки планов» (верх)

- Inline-редактирование как в лендинг-редакторе: клик по цене/названию/CTA → contentEditable.
- **Живой калькулятор цены:** переключатель Monthly/Yearly анимирует цену на карточке и на лендинге-превью.
- Переключатель «Хит» (isPopular) — на карточке появляется glow-подсветка.

### 5.2. Матрица «Модуль × План» (центр) — главный инструмент

- Строки = модули (группировка по категориям, секция **«Будущие модули»** внизу с бейджами `coming`).
- Колонки = Starter / Pro / Enterprise.
- Клетка = **тумблер + степпер лимита** (если у модуля есть опции):
  - выкл → пустая клетка;
  - вкл без лимита → галочка;
  - вкл с лимитом → число (степпер/инпут) + юнит (seats/devices/запросы/мес).
- **Умные жесты:** drag по строке вправо = «включить во все планы»; heatmap-подсветка строк, где хотя бы один план отличается; иконка «копировать настройки модуля с Pro на Enterprise».
- Действия зависят от `settingsSchema` модуля — **редактор сам знает, какие контролы показать** (никакого хардкода под модули).

### 5.3. Drawer модуля (сбоку)

- Описание, категория, статус, связь с feature-toggle (линк на операторскую консоль).
- Schema-driven форма опций + превью карточки модуля на лендинге.

### 5.4. Превью лендинга в реальном времени

- Встроенный фрейм лендинга (как в лендинг-редакторе) с переключателем «Draft / Published» — сразу видно, как изменится прайсинг.

### 5.5. Аудит и версии

- Лента «кто и когда изменил/опубликовал» (существующая `auditLogs`).
- История версий плана + «Restore».

---

## 6. Лендинг — живой прайсинг

- Текущая секция прайсинга (хардкод цен/фич) заменяется на **`useQuery(api.billing.getPublishedPlans)`** — published версии.
- SSR: первичный рендер — серверный fetch (тот же паттерн, что у `getPublishedLandingTexts`); клиент подписывается на изменения → публикация суперадмином обновляет лендинг **в реальном времени** (уже проверенный `bindI18nStore`-механизм).
- Карточка плана: цена + анимация Monthly/Yearly, список модулей (чипы с иконками), бейджи «Хит» / «Contact us», кнопка регистрации с `planKey`.
- Кнопки «Start free trial» / «Contact sales» логика: гость → регистрация; авторизованный сотрудник без активной подписки → страница выбора плана; с подпиской → в приложение (фикс существующей проблемы на `/features`).

---

## 7. Где ещё «объявлены» тарифы (инвентаризация перед внедрением)

- [ ] Лендинг — секция Pricing (`/`, `/features`, `/pricing`).
- [ ] `/features` CTA-блок («Start free trial» vs «Go to dashboard» — уже частично).
- [ ] Регистрация организации — выбор плана при онбординге.
- [ ] `IntegrationSettings` / настройки подписки (существующая `subscriptions`).
- [ ] Sidebar и модульные сетки (гейтинг по плану).
- [ ] Upgrade-модалки в каждом модуле при лимите.

---

## 8. LiveKit Фаза 2 (продолжение, по LIVEKIT-INTEGRATION-PLAN.md)

### 8.1. Ядро встреч (Фаза 2 из плана LiveKit)

- [ ] Чат комнаты + приватные сообщения (уже есть в `VideoConference` — донастроить тему).
- [ ] Реакции, «поднять руку», управление участниками (mute/выгнать/передать роль).
- [ ] Вебинар-режим: waiting room (lobby), роли host/presenter/viewer (токен уже выдаёт viewer-грант).
- [ ] Виртуальные комнаты в модуле meetingRooms (`isVirtual`, `livekitRoomName`) — гибридные собрания.
- [ ] PIN-код + lobby для гостей; гости без аккаунта (вход по ссылке с именем).

### 8.2. Запись и прозрачность (Фаза 3)

- [ ] Egress-запись в Cloudinary → `videoRecordingUrl` на событии + webhook-статусы.
- [ ] Статус встречи: запланирована → идёт → запись доступна (уже есть `setStatus`).
- [ ] .ics экспорт с видеоссылкой.
- [ ] (Опц.) LiveKit Agents: транскрипция + авто-саммари.

### 8.3. Связь с тарифами

- Модуль `videoConferences` — **первый кандидат** на проверку «модуль → план → лимит»: сколько комнат/мес на тарифе, запись только на Pro+, вебинар-режим только на Enterprise.

---

## 9. Дизайн-идеи (модно, умно, оригинально)

1. **Матрица с heatmap:** строки с отличиями между планами подсвечены мягким градиентом — «здесь планы отличаются, обрати внимание».
2. **Drag-to-enable:** потянул тумблер строки вправо — модуль включился во все планы (с плавной анимацией каскада).
3. **Живые карточки планов:** цена «тикает» при переключении Monthly/Yearly; популярный план имеет лёгкое свечение (орб), не кричащее в тёмной теме.
4. **Бейджи статусов модулей:** `active` — зелёный, `beta` — янтарный, `coming` — фиолетовый пунктир «скоро»; будущие модули уже с настроенными лимитами.
5. **Upgrade-модалка в стиле премиум:** три карточки, анимированный выбор, «что вы получаете» списком модулей, без агрессии — клиент чувствует ценность.
6. **Тёмная тема:** редактор строится на тех же токенах (surface/canvas/brand) — единый язык с остальным продуктом, ничего не режет глаза.

---

## 10. План работ по фазам

### Фаза A — Фундамент (1–2 дня)

- [ ] Schema: `billingModules`, `billingPlans`, `billingPlanEntitlements`, `billingPlanVersions`, `billingUsageCounters` + расширение `subscriptions`.
- [ ] Seed-каталог ~50 модулей (включая `coming`) + `settingsSchema`.
- [ ] Convex: `lib/entitlements.ts` (`getOrgEntitlements`, `assertModuleAccess`, `assertQuota`) + счётчики.
- [ ] Конфиг-гейтинг: `featureToggles` ↔ модули (модуль выключен глобально → недоступен даже на Enterprise).

### Фаза B — Конструктор (3–5 дней)

- [ ] `/superadmin/plans`: карточки планов (inline-редактирование), матрица, drawer модуля, draft/publish, версии+restore, аудит.
- [ ] Превью лендинга в редакторе (Draft/Published).
- [ ] Переводы en/ru/de/hy (все новые ключи в common.json по конвенции проекта).

### Фаза C — Лендинг и подписки (2–3 дня)

- [ ] Прайсинг лендинга на live-данных + анимация цен + CTA по статусу пользователя.
- [ ] Онбординг: выбор плана при регистрации организации; trial.
- [ ] `subscriptions` ↔ планы: активная подписка орг, план-версия, overrides.

### Фаза D — Enforcement по системе (3–5 дней)

- [ ] Sidebar/модульные сетки через `useOrgEntitlements()` + замочки.
- [ ] Точечные `assertQuota` на ключевых мутациях (employees, drivers, documents, videoConferences, aiAssistant).
- [ ] Upgrade-модалка + баннеры лимитов.

### Фаза E — LiveKit Фазы 2–3 (продолжение, параллельно)

- [ ] Вебинар/waiting room/управление участниками, виртуальные комнаты, запись.

---

## 11. Риски и решения

| Риск                                           | Решение                                                                       |
| ---------------------------------------------- | ----------------------------------------------------------------------------- |
| Клиент обходит лимит (прямой вызов Convex)     | Все проверки серверные (`assertQuota` в мутациях), клиент ничего не решает    |
| Изменение тарифа задним числом ломает обещания | `billingPlanVersions`: орг привязана к версии плана при подписке              |
| Суперадмин ошибся → сломал лендинг             | Draft/Publish + Restore + аудит; лендинг читает только published              |
| Много модулей → матрица нечитаема              | Группировка по категориям, heatmap различий, поиск по модулям, drag-to-enable |
| Модуль-«coming» случайно попал в продакшн-план | `status: 'coming'` исключается enforcement-движком до релиза                  |
| Производительность резолва прав                | Кэш entitlements на уровне орг + версии плана (mtime-подход), без N+1         |

---

## 12. Файлы (карта изменений)

| Файл                                        | Что                                                   |
| ------------------------------------------- | ----------------------------------------------------- |
| `convex/schema/billing.ts`                  | 5 новых таблиц                                        |
| `convex/schema/settings.ts`                 | расширение `subscriptions`                            |
| `convex/lib/entitlements.ts`                | движок прав + счётчики                                |
| `convex/billing/*.ts`                       | queries/mutations: планы, entitlements, версии, usage |
| `convex/billingActions.ts`                  | publish/restore (draft→snapshot)                      |
| `src/components/superadmin/PlansClient.tsx` | конструктор `/superadmin/plans`                       |
| `src/components/landing/PricingSection.tsx` | live-прайсинг                                         |
| `src/hooks/useOrgEntitlements.ts`           | клиентский хук прав                                   |
| `src/components/billing/UpgradeModal.tsx`   | апгрейд-модалка                                       |
| `public/locales/{en,ru,de,hy}/common.json`  | ключи (секции `billing`, `plans`, `upgrade`)          |
| `src/lib/nav.ts`, `SuperadminHubClient.tsx` | пункт «Планы и тарифы»                                |

---

## 13. Приёмка (Definition of Done)

- [ ] Суперадмин создаёт/редактирует план без кода; публикация мгновенно обновляет лендинг (проверено в браузере).
- [ ] На тарифе Starter с лимитом «50 сотрудников» 51-й сотрудник не создаётся (серверная блокировка + upgrade-экран).
- [ ] Выключение модуля для плана убирает его из sidebar/модулей и блокирует мутации.
- [ ] Клиент, подписавшийся на версию 1, не теряет прав при публикации версии 2 (снапшот).
- [ ] Все ключи переведены на 4 языка; светлая и тёмная темы консистентны.
- [ ] tsc/eslint/jest/build зелёные; CI проходит.
