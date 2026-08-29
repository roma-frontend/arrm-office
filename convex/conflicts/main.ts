/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CONFLICT SERVICE — Единая система обнаружения конфликтов
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Централизованный сервис для обнаружения всех типов конфликтов:
 * - Отпуска ↔ Мероприятия
 * - Отпуска ↔ Отпуска (department overlap)
 * - Водители ↔ Поездки
 * - Задачи ↔ Дедлайны/Отпуска
 * - Мероприятия ↔ Праздники
 *
 * Используется AI Ассистентом для умных предупреждений
 */

import { v } from 'convex/values';
import { api } from '../_generated/api';
import { query } from '../_generated/server';
import type { QueryCtx } from '../_generated/server';
import type { Id, Doc } from '../_generated/dataModel';
import { MAX_PAGE_SIZE } from '../pagination';
import { getProfile } from '../lib/userProfile';
import { getAuthCaller } from '../lib/getAuthCaller';
import { isSuperadmin } from '../lib/auth';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type ConflictType =
  | 'leave_event' // Отпуск пересекается с мероприятием
  | 'leave_department' // Слишком много людей из отдела в отпуске
  | 'driver_schedule' // Водитель уже забронирован
  | 'task_deadline' // Дедлайн задачи во время отпуска
  | 'task_assignment' // Задача назначена человеку в отпуске
  | 'holiday_conflict' // Мероприятие в праздник
  | 'blackout_period'; // Запрос в запретный период

export type ConflictSeverity = 'critical' | 'warning' | 'info';

export interface Conflict {
  id: string;
  type: ConflictType;
  severity: ConflictSeverity;
  title: string;
  message: string;
  suggestion: string;
  date: string;
  affectedUsers: Id<'users'>[];
  affectedDepartments?: string[];
  relatedEventId?: Id<'companyEvents'>;
  relatedTaskId?: Id<'tasks'>;
  relatedRequestId?: Id<'driverRequests'>;
  metadata?: Record<string, unknown>;
}

/** Free-form metadata accepted by `checkConflictsForRequest`. */
interface RequestMetadata {
  driverId?: Id<'drivers'>;
  assigneeId?: Id<'users'>;
  taskId?: Id<'tasks'>;
  leaveType?: string;
}

/** Shape returned by `getConflictSummaryForAI`. */
export interface ConflictSummary {
  total: number;
  critical: number;
  warnings: number;
  messages: Array<{
    type: ConflictType;
    severity: ConflictSeverity;
    title: string;
    message: string;
    suggestion: string;
  }>;
  hasBlockingConflicts: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

const THRESHOLDS = {
  DEPARTMENT_CRITICAL: 0.5, // 50% отдела — критический уровень
  DEPARTMENT_WARNING: 0.3, // 30% отдела — предупреждение
  CHECK_DAYS_BEFORE: 14, // Проверять конфликты за 2 недели
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN CONFLICT DETECTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Обнаружить ВСЕ типы конфликтов для организации
 * Используется AI Ассистентом для комплексной проверки
 */
export const detectAllConflicts = query({
  args: {
    organizationId: v.id('organizations'),
    startDate: v.number(),
    endDate: v.number(),
    userId: v.optional(v.id('users')),
    conflictTypes: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const conflicts: Conflict[] = [];

    // Определяем, какие типы конфликтов проверять
    const typesToCheck = args.conflictTypes || [
      'leave_event',
      'leave_department',
      'driver_schedule',
      'task_deadline',
      'task_assignment',
    ];

    // 1. Leave-Event конфликты
    if (typesToCheck.includes('leave_event')) {
      const leaveEventConflicts = await detectLeaveEventConflicts(ctx, args);
      conflicts.push(...leaveEventConflicts);
    }

    // 2. Department overlap конфликты
    if (typesToCheck.includes('leave_department')) {
      const deptConflicts = await detectDepartmentConflicts(ctx, args);
      conflicts.push(...deptConflicts);
    }

    // 3. Driver schedule конфликты
    if (typesToCheck.includes('driver_schedule')) {
      const driverConflicts = await detectDriverConflicts(ctx, args);
      conflicts.push(...driverConflicts);
    }

    // 4. Task conflicts
    if (typesToCheck.includes('task_deadline') || typesToCheck.includes('task_assignment')) {
      const taskConflicts = await detectTaskConflicts(ctx, args);
      conflicts.push(...taskConflicts);
    }

    // Сортируем: критические сначала, затем по дате
    return conflicts.sort((a, b) => {
      if (a.severity === 'critical' && b.severity !== 'critical') return -1;
      if (b.severity === 'critical' && a.severity !== 'critical') return 1;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
  },
});

/**
 * Быстрая проверка для конкретного запроса
 * Используется при создании/редактировании сущности
 */
export const checkConflictsForRequest = query({
  args: {
    organizationId: v.id('organizations'),
    requestType: v.union(
      v.literal('leave'),
      v.literal('driver'),
      v.literal('task'),
      v.literal('event'),
    ),
    userId: v.id('users'),
    startDate: v.number(),
    endDate: v.number(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];
    if (
      caller._id !== args.userId &&
      !isSuperadmin(caller) &&
      caller.role !== 'admin' &&
      caller.role !== 'supervisor'
    )
      return [];
    const conflicts: Conflict[] = [];
    const metadata = (args.metadata ?? {}) as RequestMetadata;

    if (args.requestType === 'leave') {
      // Проверка конфликтов отпуска
      const user = await ctx.db.get(args.userId);
      if (!user) return { conflicts: [], hasCritical: false };

      const profile = await getProfile(ctx, args.userId);
      const userDepartment = (profile?.department ?? user.department) || '';

      // 1. Проверка мероприятий
      const events = await ctx.db
        .query('companyEvents')
        .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
        .take(MAX_PAGE_SIZE);

      for (const event of events) {
        const overlaps = args.startDate <= event.endDate && args.endDate >= event.startDate;

        if (!overlaps) continue;

        const isRequiredDept = event.requiredDepartments.some(
          (dept) => dept.toLowerCase() === userDepartment.toLowerCase(),
        );
        const isRequiredEmployee = event.requiredEmployeeIds?.includes(args.userId);

        if (isRequiredDept || isRequiredEmployee) {
          conflicts.push({
            id: `leave-event-${event._id}`,
            type: 'leave_event',
            severity: event.priority === 'high' ? 'critical' : 'warning',
            title: isRequiredEmployee
              ? 'Вы лично требуется на мероприятии'
              : `Ваш отдел "${userDepartment}" требуется на мероприятии`,
            message: `Мероприятие "${event.name}" (${new Date(event.startDate).toLocaleDateString()}) требует вашего присутствия или присутствия сотрудников вашего отдела.`,
            suggestion: isRequiredEmployee
              ? 'Рекомендуем перенести отпуск или обсудить с руководителем возможность отсутствия.'
              : 'Обсудите с командой, кто может представлять отдел на мероприятии.',
            date: new Date(event.startDate).toISOString(),
            affectedUsers: [args.userId],
            affectedDepartments: [userDepartment],
            relatedEventId: event._id,
            metadata: {
              eventName: event.name,
              eventStartDate: event.startDate,
              eventEndDate: event.endDate,
              eventType: event.eventType,
            },
          });
        }
      }

      // 2. Проверка department overlap
      const deptConflicts = await detectDepartmentConflicts(ctx, {
        ...args,
        userId: args.userId,
      });
      conflicts.push(...deptConflicts);
    }

    if (args.requestType === 'driver') {
      // Проверка конфликтов водителя
      const driverId = metadata.driverId;

      if (driverId) {
        const existingTrips = await ctx.db
          .query('driverSchedules')
          .withIndex('by_driver', (q) => q.eq('driverId', driverId))
          .take(MAX_PAGE_SIZE);

        for (const trip of existingTrips) {
          const overlaps = args.startDate <= trip.endTime && args.endDate >= trip.startTime;

          if (overlaps && trip.status !== 'cancelled') {
            conflicts.push({
              id: `driver-schedule-${trip._id}`,
              type: 'driver_schedule',
              severity: 'critical',
              title: 'Водитель уже забронирован',
              message: `Водитель уже забронирован на это время: ${trip.tripInfo?.purpose || 'Поездка'}`,
              suggestion: 'Выберите другого водителя или измените время поездки.',
              date: new Date(trip.startTime).toISOString(),
              affectedUsers: [],
              metadata: {
                tripId: trip._id,
                tripPurpose: trip.tripInfo?.purpose,
              },
            });
          }
        }
      }
    }

    if (args.requestType === 'task') {
      // Проверка конфликтов задач
      const assigneeId = metadata.assigneeId;

      if (assigneeId) {
        // Проверяем, не в отпуске ли исполнитель
        const leaveRequests = await ctx.db
          .query('leaveRequests')
          .withIndex('by_user', (q) => q.eq('userId', assigneeId))
          .take(MAX_PAGE_SIZE);

        for (const leave of leaveRequests) {
          const overlaps =
            args.startDate <= new Date(leave.endDate).getTime() &&
            args.endDate >= new Date(leave.startDate).getTime();

          if (overlaps && leave.status === 'approved') {
            conflicts.push({
              id: `task-leave-${leave._id}`,
              type: 'task_assignment',
              severity: 'warning',
              title: 'Исполнитель в отпуске',
              message: `Назначенный исполнитель будет в отпуске (${leave.type}) в период выполнения задачи.`,
              suggestion:
                'Переназначьте задачу на другого сотрудника или измените срок выполнения.',
              date: leave.startDate,
              affectedUsers: [assigneeId],
              relatedTaskId: metadata.taskId,
              metadata: {
                leaveId: leave._id,
                leaveType: leave.type,
                leaveStartDate: leave.startDate,
                leaveEndDate: leave.endDate,
              },
            });
          }
        }
      }
    }

    return {
      conflicts,
      hasCritical: conflicts.some((c) => c.severity === 'critical'),
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// LEAVE EVENT CONFLICTS
// ─────────────────────────────────────────────────────────────────────────────

async function detectLeaveEventConflicts(
  ctx: QueryCtx,
  args: { organizationId: Id<'organizations'>; startDate: number; endDate: number },
): Promise<Conflict[]> {
  const conflicts: Conflict[] = [];

  // Получаем все мероприятия в периоде
  const events = await ctx.db
    .query('companyEvents')
    .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
    .take(MAX_PAGE_SIZE);

  // Получаем все одобренные отпуска в периоде
  const leaves = await ctx.db
    .query('leaveRequests')
    .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
    .take(MAX_PAGE_SIZE);

  const approvedLeaves = leaves.filter((l) => l.status === 'approved');

  // Batch-load all unique user IDs upfront to avoid N+1 queries
  const uniqueUserIds = [...new Set(approvedLeaves.map((l) => l.userId))];
  const usersForLeaves = await Promise.all(uniqueUserIds.map((id) => ctx.db.get(id)));
  const userMap = new Map(
    usersForLeaves.filter((u): u is Doc<'users'> => u !== null).map((u) => [u._id, u] as const),
  );
  const profilesForLeaves = await Promise.all(uniqueUserIds.map((id) => getProfile(ctx, id)));
  const profileMapForLeaves = new Map(
    uniqueUserIds.map((id, i) => [id, profilesForLeaves[i]] as const),
  );

  for (const event of events) {
    for (const leave of approvedLeaves) {
      const overlaps =
        new Date(leave.startDate).getTime() <= event.endDate &&
        new Date(leave.endDate).getTime() >= event.startDate;

      if (!overlaps) continue;

      const user = userMap.get(leave.userId);
      if (!user) continue;

      const profile = profileMapForLeaves.get(leave.userId);
      const userDepartment = (profile?.department ?? user.department) || '';
      const isRequiredDept = event.requiredDepartments.some(
        (dept) => dept.toLowerCase() === userDepartment.toLowerCase(),
      );
      const isRequiredEmployee = event.requiredEmployeeIds?.includes(leave.userId);

      if (isRequiredDept || isRequiredEmployee) {
        conflicts.push({
          id: `leave-event-${event._id}-${leave._id}`,
          type: 'leave_event',
          severity: event.priority === 'high' ? 'critical' : 'warning',
          title: isRequiredEmployee
            ? `${user.name} лично требуется на мероприятии`
            : `Сотрудник из "${userDepartment}" требуется на мероприятии`,
          message: `${user.name} в отпуске (${leave.type}) во время мероприятия "${event.name}".`,
          suggestion: 'Рассмотрите возможность переноса отпуска или найдите замену сотруднику.',
          date: new Date(event.startDate).toISOString(),
          affectedUsers: [leave.userId],
          affectedDepartments: [userDepartment],
          relatedEventId: event._id,
          metadata: {
            leaveId: leave._id,
            eventName: event.name,
            eventType: event.eventType,
          },
        });
      }
    }
  }

  return conflicts;
}

// ─────────────────────────────────────────────────────────────────────────────
// DEPARTMENT OVERLAP CONFLICTS
// ─────────────────────────────────────────────────────────────────────────────

async function detectDepartmentConflicts(
  ctx: QueryCtx,
  args: {
    organizationId: Id<'organizations'>;
    startDate: number;
    endDate: number;
    userId?: Id<'users'>;
  },
): Promise<Conflict[]> {
  const conflicts: Conflict[] = [];

  // Get all users in organization
  const users = (
    await ctx.db
      .query('users')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .take(MAX_PAGE_SIZE)
  ).filter((u) => u.role !== 'superadmin');

  // Load profiles in parallel for department field
  const profiles = await Promise.all(users.map((u) => getProfile(ctx, u._id)));
  const profileMap = new Map<string, Awaited<ReturnType<typeof getProfile>>>(
    users.map((u, i) => [u._id, profiles[i]!]),
  );

  // Get all approved leaves
  const leaves = await ctx.db
    .query('leaveRequests')
    .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
    .take(MAX_PAGE_SIZE);

  const approvedLeaves = leaves.filter((l) => l.status === 'approved');

  // Build department user counts
  const deptUserCounts = new Map<string, number>();
  for (const user of users) {
    const p = profileMap.get(user._id);
    const dept = (p?.department ?? user.department) || 'Unknown';
    deptUserCounts.set(dept, (deptUserCounts.get(dept) || 0) + 1);
  }

  // Build user map for O(1) lookups
  type UserDoc = { _id: Id<'users'>; department?: string; name: string };
  const userMap = new Map<Id<'users'>, UserDoc>(users.map((u) => [u._id, u]));

  // OPTIMIZED: Use interval-based approach instead of daily iteration
  // Collect all "events" (leave start/end) and process only at change points
  const events: { date: number; type: 'start' | 'end'; dept: string; userId: Id<'users'> }[] = [];

  for (const leave of approvedLeaves) {
    const leaveStart = new Date(leave.startDate).getTime();
    const leaveEnd = new Date(leave.endDate).getTime();
    const user = userMap.get(leave.userId);
    if (!user) continue;
    const p = profileMap.get(leave.userId);
    const dept = (p?.department ?? user.department) || 'Unknown';

    events.push({ date: leaveStart, type: 'start', dept, userId: leave.userId });
    events.push({ date: leaveEnd + 86400000, type: 'end', dept, userId: leave.userId }); // +1 day to make end inclusive
  }

  // Sort events by date
  events.sort((a, b) => a.date - b.date);

  // Track active leaves per department using a map
  const activeLeavesPerDept = new Map<string, Set<Id<'users'>>>();
  let eventIndex = 0;

  // Process events at each unique date point
  const uniqueDates = [...new Set(events.map((e) => e.date))].sort((a, b) => a - b);

  for (const date of uniqueDates) {
    // Process all events at this date
    while (eventIndex < events.length && events[eventIndex]!.date === date) {
      const event = events[eventIndex]!;
      if (!activeLeavesPerDept.has(event.dept)) {
        activeLeavesPerDept.set(event.dept, new Set());
      }
      const activeSet = activeLeavesPerDept.get(event.dept)!;

      if (event.type === 'start') {
        activeSet.add(event.userId);
      } else {
        activeSet.delete(event.userId);
      }
      eventIndex++;
    }

    // Check if this date falls within the requested range
    if (date < args.startDate || date > args.endDate) continue;

    // Only check departments that have active leaves
    for (const [dept, activeSet] of activeLeavesPerDept.entries()) {
      const outCount = activeSet.size;
      const deptSize = deptUserCounts.get(dept) || 0;
      if (deptSize === 0 || outCount === 0) continue;

      const percentage = outCount / deptSize;

      // If specific userId is provided, only check their department
      if (args.userId) {
        const currentUser = userMap.get(args.userId);
        const currentProfile = profileMap.get(args.userId);
        if (((currentProfile?.department ?? currentUser?.department) || 'Unknown') !== dept)
          continue;
      }

      // Only generate conflict if threshold is met
      if (percentage < THRESHOLDS.DEPARTMENT_WARNING) continue;

      const dateStr = new Date(date).toISOString().split('T')[0];
      if (!dateStr) continue;

      const severity = percentage >= THRESHOLDS.DEPARTMENT_CRITICAL ? 'critical' : 'warning';
      const affectedUsers = [...activeSet];

      conflicts.push({
        id: `dept-${severity}-${dept}-${dateStr}`,
        type: 'leave_department',
        severity,
        title:
          severity === 'critical'
            ? `Критическая нехватка в "${dept}"`
            : `Внимание: ${outCount} из "${dept}" в отпуске`,
        message: `${outCount}/${deptSize} сотрудников (${(percentage * 100).toFixed(0)}%) в отпуске. ${severity === 'critical' ? 'Работа отдела может быть парализована.' : 'Возможны задержки.'}`,
        suggestion:
          severity === 'critical'
            ? 'Рекомендуем отозвать кого-то из отпуска или перераспределить задачи.'
            : 'Планируйте нагрузка с учётом отсутствия сотрудников.',
        date: dateStr,
        affectedUsers,
        affectedDepartments: [dept],
        metadata: {
          percentage: Math.round(percentage * 100),
          departmentSize: deptSize,
        },
      });
    }
  }

  return conflicts;
}

// ─────────────────────────────────────────────────────────────────────────────
// DRIVER CONFLICTS
// ─────────────────────────────────────────────────────────────────────────────

async function detectDriverConflicts(
  ctx: QueryCtx,
  args: { organizationId: Id<'organizations'>; startDate: number; endDate: number },
): Promise<Conflict[]> {
  const conflicts: Conflict[] = [];

  // Получаем все поездки в периоде
  const schedules = await ctx.db
    .query('driverSchedules')
    .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
    .take(MAX_PAGE_SIZE);

  const activeSchedules = schedules.filter(
    (s) => s.status === 'scheduled' || s.status === 'in_progress',
  );

  // Группируем по водителям и проверяем пересечения
  const driverTrips = new Map<Id<'drivers'>, Doc<'driverSchedules'>[]>();

  for (const schedule of activeSchedules) {
    if (!driverTrips.has(schedule.driverId)) {
      driverTrips.set(schedule.driverId, []);
    }
    driverTrips.get(schedule.driverId)!.push(schedule);
  }

  for (const [driverId, trips] of driverTrips.entries()) {
    // Проверяем на пересечения по времени
    for (let i = 0; i < trips.length; i++) {
      for (let j = i + 1; j < trips.length; j++) {
        // Loop bounds guarantee these indices exist.
        const trip1 = trips[i]!;
        const trip2 = trips[j]!;

        const overlaps = trip1.startTime <= trip2.endTime && trip1.endTime >= trip2.startTime;

        if (overlaps) {
          conflicts.push({
            id: `driver-overlap-${trip1._id}-${trip2._id}`,
            type: 'driver_schedule',
            severity: 'critical',
            title: 'Двойная бронь водителя',
            message: `Водитель забронирован одновременно на две поездки: "${trip1.tripInfo?.purpose || 'Поездка'}" и "${trip2.tripInfo?.purpose || 'Поездка'}".`,
            suggestion: 'Переназначьте одну из поездок на другого водителя.',
            date: new Date(trip1.startTime).toISOString(),
            affectedUsers: [trip1.userId, trip2.userId],
            metadata: {
              driverId,
              trip1Id: trip1._id,
              trip2Id: trip2._id,
            },
          });
        }
      }
    }
  }

  return conflicts;
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK CONFLICTS
// ─────────────────────────────────────────────────────────────────────────────

async function detectTaskConflicts(
  ctx: QueryCtx,
  args: { organizationId: Id<'organizations'>; startDate: number; endDate: number },
): Promise<Conflict[]> {
  const conflicts: Conflict[] = [];

  // Получаем все задачи
  const tasks = await ctx.db
    .query('tasks')
    .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
    .take(MAX_PAGE_SIZE);

  const activeTasks = tasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled');

  // Получаем все отпуска
  const leaves = await ctx.db
    .query('leaveRequests')
    .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
    .take(MAX_PAGE_SIZE);

  const approvedLeaves = leaves.filter((l) => l.status === 'approved');

  // Batch-load all unique assignee IDs upfront
  const uniqueAssigneeIds = [...new Set(activeTasks.map((t) => t.assignedTo))];
  const assigneeUsers = await Promise.all(uniqueAssigneeIds.map((id) => ctx.db.get(id)));
  const assigneeMap = new Map(
    assigneeUsers.filter((u): u is Doc<'users'> => u !== null).map((u) => [u._id, u] as const),
  );

  // Проверяем каждую задачу
  for (const task of activeTasks) {
    const assignee = assigneeMap.get(task.assignedTo);
    if (!assignee) continue;

    const taskDeadline = task.deadline;

    // Проверяем, не попадает ли дедлайн в период отпусков
    if (taskDeadline) {
      for (const leave of approvedLeaves) {
        if (leave.userId !== task.assignedTo) continue;

        const leaveStart = new Date(leave.startDate).getTime();
        const leaveEnd = new Date(leave.endDate).getTime();

        if (taskDeadline >= leaveStart && taskDeadline <= leaveEnd) {
          conflicts.push({
            id: `task-deadline-${task._id}-${leave._id}`,
            type: 'task_deadline',
            severity: 'warning',
            title: 'Дедлайн задачи во время отпуска',
            message: `Дедлайн задачи "${task.title}" попадает на период отпуска исполнителя.`,
            suggestion: 'Перенесите дедлайн или переназначьте задачу.',
            date: new Date(taskDeadline).toISOString(),
            affectedUsers: [task.assignedTo],
            relatedTaskId: task._id,
            metadata: {
              taskId: task._id,
              taskTitle: task.title,
              leaveId: leave._id,
            },
          });
        }
      }
    }
  }

  return conflicts;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFLICT SUMMARY FOR AI
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Краткая сводка конфликтов для AI Ассистента
 * Возвращает human-readable сообщения
 */
export const getConflictSummaryForAI = query({
  args: {
    organizationId: v.id('organizations'),
    userId: v.optional(v.id('users')),
    startDate: v.number(),
    endDate: v.number(),
  },
  // Explicit return type breaks the circular `api` type inference that
  // `ctx.runQuery(api.conflicts.detectAllConflicts, ...)` would otherwise create.
  handler: async (ctx, args): Promise<ConflictSummary> => {
    const conflicts = await ctx.runQuery(api.conflicts.detectAllConflicts, {
      organizationId: args.organizationId,
      startDate: args.startDate,
      endDate: args.endDate,
      userId: args.userId,
    });

    const critical = conflicts.filter((c) => c.severity === 'critical');
    const warnings = conflicts.filter((c) => c.severity === 'warning');

    return {
      total: conflicts.length,
      critical: critical.length,
      warnings: warnings.length,
      messages: conflicts.map((c) => ({
        type: c.type,
        severity: c.severity,
        title: c.title,
        message: c.message,
        suggestion: c.suggestion,
      })),
      hasBlockingConflicts: critical.length > 0,
    };
  },
});
