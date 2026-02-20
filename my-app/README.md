my-leave-tracker/
├── app/
│   ├── (auth)/                     # Группа маршрутов для неавторизованных пользователей
│   │   ├── login/
│   │   │   └── page.tsx            # Страница входа
│   │   └── layout.tsx               # Лейаут для страниц авторизации (без сайдбара)
│   ├── (dashboard)/                 # Группа защищённых маршрутов
│   │   ├── dashboard/
│   │   │   └── page.tsx            # Основная страница с календарём
│   │   ├── analytics/
│   │   │   └── page.tsx            # Страница аналитики (если нужна отдельная)
│   │   └── layout.tsx               # Лейаут дашборда (с сайдбаром и хедером)
│   ├── api/
│   │   └── auth/
│   │       └── [...nextauth]/
│   │           └── route.ts         # NextAuth API роут
│   ├── convex/                       # Convex backend (внутри app для удобства)
│   │   ├── schema.ts                 # Схема базы данных
│   │   ├── auth.ts                    # Мутации/запросы для аутентификации
│   │   ├── employees.ts                # Мутации/запросы для сотрудников
│   │   ├── assignments.ts              # Мутации/запросы для назначений
│   │   ├── users.ts                    # Дополнительные запросы для пользователей
│   │   └── _generated/                  # Автогенерируемые Convex типы
│   ├── favicon.ico
│   ├── globals.css
│   ├── layout.tsx                      # Корневой лейаут (включает провайдеры)
│   └── page.tsx                         # Редирект на /login или /dashboard
├── components/
│   ├── ui/                               # shadcn/ui компоненты (генерируются автоматически)
│   ├── employees/                         # Компоненты для управления сотрудниками
│   │   ├── EmployeeList.tsx
│   │   ├── EmployeeModal.tsx
│   │   ├── AddEmployeeButton.tsx
│   │   └── EmployeeItem.tsx
│   ├── calendar/                          # Компоненты календаря
│   │   ├── CalendarView.tsx
│   │   ├── WeekView.tsx
│   │   ├── MonthView.tsx
│   │   ├── DayCell.tsx
│   │   └── CalendarHeader.tsx
│   ├── assignment/                        # Компоненты для модалки назначения
│   │   ├── AssignmentModal.tsx
│   │   ├── RangePicker.tsx
│   │   └── AssignmentForm.tsx
│   ├── analytics/                         # Компоненты аналитики
│   │   ├── AnalyticsModal.tsx
│   │   ├── SummaryTable.tsx
│   │   ├── CommentsList.tsx
│   │   └── Chart.tsx
│   ├── layout/                             # Компоненты лейаута
│   │   ├── Header.tsx
│   │   ├── Sidebar.tsx
│   │   └── ThemeToggle.tsx
│   └── providers/                          # Провайдеры для оборачивания приложения
│       ├── ThemeProvider.tsx                # next-themes провайдер
│       └── ConvexProvider.tsx               # Convex клиент провайдер
├── hooks/                                   # Кастомные React хуки
│   ├── useEmployees.ts
│   ├── useAssignments.ts
│   ├── useAuth.ts
│   ├── useAssignmentModal.ts                 # Управление состоянием модалки
│   └── useTheme.ts                           # (опционально, если нужно)
├── lib/                                      # Вспомогательные модули
│   ├── convexClient.ts                        # Singleton клиента Convex
│   ├── utils.ts                                # Общие функции
│   ├── validators.ts                            # Валидация данных (email и т.д.)
│   └── constants.ts                              # Константы (типы отпусков, цвета)
├── types/                                     # Глобальные типы TypeScript
│   └── global.d.ts                              # Общие интерфейсы (Employee, Assignment и т.д.)
├── public/                                    # Статические файлы
│   ├── images/
│   └── ...
├── .env.local                                 # Переменные окружения
├── .eslintrc.json
├── .gitignore
├── components.json                             # Конфигурация shadcn
├── convex.json                                  # Конфигурация Convex (URL, deployment)
├── next.config.ts                               # Next.js конфиг (TypeScript)
├── package.json
├── postcss.config.mjs
├── tailwind.config.ts
└── tsconfig.json