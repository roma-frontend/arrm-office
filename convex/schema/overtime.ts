import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const overtime = {
  /**
   * Overtime Requests — заявки на переработку
   *
   * Сотрудник отправляет запрос руководителю на конкретную дату и время.
   * После одобрения — сотрудник МОЖЕТ оставаться после окончания рабочего дня.
   * Без одобрения — любая переработка не оплачивается.
   */
  overtimeRequests: defineTable({
    organizationId: v.id('organizations'),
    /** Кто запросил переработку */
    userId: v.id('users'),
    /** Кому отправлен запрос (ближайший руководитель в reporting line) */
    supervisorId: v.id('users'),
    /** Дата переработки "YYYY-MM-DD" */
    date: v.string(),
    /** Время начала "HH:MM" (например "18:00") */
    startTime: v.string(),
    /** Время окончания "HH:MM" (например "22:00") */
    endTime: v.string(),
    /** Рассчитанное количество часов */
    estimatedHours: v.number(),
    /** Причина переработки */
    reason: v.string(),
    /** Дополнительный комментарий */
    comment: v.optional(v.string()),
    /** Текущий статус */
    status: v.union(
      v.literal('pending'),
      v.literal('approved'),
      v.literal('rejected'),
      v.literal('cancelled'),
    ),
    /** Кто создал запрос (для separation of duties) */
    createdBy: v.optional(v.id('users')),
    /** Кто принял решение */
    reviewedBy: v.optional(v.id('users')),
    /** Комментарий при одобрении/отклонении */
    reviewComment: v.optional(v.string()),
    /** Когда принято решение */
    reviewedAt: v.optional(v.number()),
    /** Прочитано ли руководителем */
    isRead: v.optional(v.boolean()),
    /** Привязка к timeTracking после одобрения */
    approvedTimeTrackingId: v.optional(v.id('timeTracking')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_supervisor', ['supervisorId'])
    .index('by_org_status', ['organizationId', 'status'])
    .index('by_date', ['date'])
    .index('by_user_date', ['userId', 'date'])
    .index('by_user_status', ['userId', 'status'])
    .index('by_org_created', ['organizationId', 'createdAt'])
    .index('by_user_org', ['userId', 'organizationId']),

  /**
   * Overtime Settings — настройки переработок для организации
   *
   * Определяет: включён ли модуль, лимиты, способ оплаты, кто одобряет.
   */
  overtimeSettings: defineTable({
    organizationId: v.id('organizations'),
    /** Включён ли модуль переработок */
    enabled: v.boolean(),
    /** Требуется ли одобрение руководителя */
    requireApproval: v.boolean(),
    /** Максимум часов переработки в неделю (null = без лимита) */
    maxHoursPerWeek: v.optional(v.number()),
    /** Максимум часов переработки в месяц (null = без лимита) */
    maxHoursPerMonth: v.optional(v.number()),
    /** Максимум часов переработки в день (null = без лимита) */
    maxHoursPerDay: v.optional(v.number()),
    /** Способ оплаты */
    paymentType: v.union(
      v.literal('double_rate'), // двойная ставка
      v.literal('compensatory_leave'), // компенсация выходными
      v.literal('policy'), // по policy организации
    ),
    /** Множитель оплаты (1.5, 2.0) — используется при paymentType=double_rate */
    overtimeRate: v.optional(v.number()),
    /** Уведомлять руководителя при новом запросе */
    notifySupervisor: v.boolean(),
    /** Уведомлять HR при новом запросе */
    notifyHR: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_org', ['organizationId']),
};
