/**
 * Birthday Reminders — Напоминания о днях рождения сотрудников
 */

import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { DEFAULT_LIST_CAP } from './lib/limits';
import { getProfile } from './lib/userProfile';
import { withAuth } from './lib/withAuth';

// ... остальной код

/**
 * Проверить дни рождения сегодня и отправить уведомления
 */
export const checkBirthdaysToday = mutation({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { organizationId } = args;
    const today = new Date();
    const currentMonth = today.getMonth() + 1; // 1-12
    const currentDay = today.getDate(); // 1-31

    console.warn(`[Birthday Check] Checking for ${currentDay}.${currentMonth}`);

    // Получить всех сотрудников организации
    const users = (
      await ctx.db
        .query('users')
        .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
        .take(DEFAULT_LIST_CAP)
    ).filter((u: any) => u.role !== 'superadmin');

    // Найти тех, у кого день рождения сегодня
    const birthdayUsers = users.filter((user: any) => {
      if (!user.dateOfBirth) return false;
      const birthDate = new Date(user.dateOfBirth);
      return birthDate.getMonth() + 1 === currentMonth && birthDate.getDate() === currentDay;
    });

    console.warn(`[Birthday Check] Found ${birthdayUsers.length} birthdays today`);

    // Для каждого именинника отправить уведомление коллегам
    for (const birthdayUser of birthdayUsers) {
      const age = today.getFullYear() - new Date(birthdayUser.dateOfBirth!).getFullYear();

      // Отправить уведомление всем сотрудникам (кроме именинника)
      for (const user of users) {
        if (user._id === birthdayUser._id) continue;

        await ctx.db.insert('notifications', {
          organizationId,
          userId: user._id,
          type: 'system',
          title: `🎉 День рождения!`,
          message: `Сегодня день рождения у ${birthdayUser.name}! ${getAgeEmoji(age)}\n\n🎁 Поздравьте коллегу и подарите хорошее настроение!`,
          isRead: false,
          route: '/employees',
          createdAt: Date.now(),
          metadata: JSON.stringify({
            birthdayUserId: birthdayUser._id,
            birthdayUserName: birthdayUser.name,
            age,
          }),
        });
      }

      // Персональное поздравление имениннику
      await ctx.db.insert('notifications', {
        organizationId,
        userId: birthdayUser._id,
        type: 'system',
        title: `🎂 С Днём Рождения!`,
        message: `${birthdayUser.name}, поздравляем Вас с Днём Рождения! 🎉\n\nЖелаем успехов, здоровья и отличного настроения! 🎁\n\nВаш возраст: ${age} ${getAgeWord(age)}`,
        isRead: false,
        route: '/employees',
        createdAt: Date.now(),
        metadata: JSON.stringify({
          isBirthdayPerson: true,
          age,
        }),
      });
    }

    return {
      birthdaysFound: birthdayUsers.length,
      notificationsSent: birthdayUsers.length * users.length,
      birthdayUsers: birthdayUsers.map((u: any) => ({
        id: u._id,
        name: u.name,
        email: u.email,
        department: u.department,
      })),
    };
  }),
});

/**
 * Проверить предстоящие дни рождения (в течение N дней)
 */
export const checkUpcomingBirthdays = mutation({
  args: {
    organizationId: v.id('organizations'),
    daysAhead: v.optional(v.number()), // По умолчанию 7 дней
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { organizationId, daysAhead = 7 } = args;
    const today = new Date();
    const upcomingBirthdays: Array<{
      user: {
        _id: string;
        name: string;
        email: string;
        department?: string;
        dateOfBirth?: string;
      };
      date: string;
      age: number;
      daysUntil: number;
    }> = [];

    // Получить всех сотрудников
    const users = (
      await ctx.db
        .query('users')
        .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
        .take(DEFAULT_LIST_CAP)
    ).filter((u: any) => u.role !== 'superadmin');

    // Проверить следующие N дней
    for (let i = 1; i <= daysAhead; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(today.getDate() + i);

      const checkMonth = checkDate.getMonth() + 1;
      const checkDay = checkDate.getDate();

      const birthdayUsers = users.filter((user: any) => {
        if (!user.dateOfBirth) return false;
        const birthDate = new Date(user.dateOfBirth);
        return birthDate.getMonth() + 1 === checkMonth && birthDate.getDate() === checkDay;
      });

      for (const birthdayUser of birthdayUsers) {
        const age = checkDate.getFullYear() - new Date(birthdayUser.dateOfBirth!).getFullYear();
        const daysUntil = i;
        const dateStr = checkDate.toISOString().split('T')[0];

        if (!dateStr) continue;

        upcomingBirthdays.push({
          user: birthdayUser,
          date: dateStr,
          age,
          daysUntil,
        });

        // Напоминание за 3 дня
        if (i === 3) {
          for (const user of users) {
            await ctx.db.insert('notifications', {
              organizationId,
              userId: user._id,
              type: 'system',
              title: `🎁 Скоро день рождения!`,
              message: `Через 3 дня день рождения у ${birthdayUser.name}! Подумайте о поздравлении. 🎂`,
              isRead: false,
              route: '/employees',
              createdAt: Date.now(),
              metadata: JSON.stringify({
                birthdayUserId: birthdayUser._id,
                daysUntil: 3,
              }),
            });
          }
        }
      }
    }

    return {
      upcomingBirthdays: upcomingBirthdays.map((b: any) => ({
        name: b.user.name,
        email: b.user.email,
        department: b.user.department,
        date: b.date,
        age: b.age,
        daysUntil: b.daysUntil,
      })),
    };
  }),
});

/**
 * Получить список дней рождения на месяц
 */
export const getBirthdaysForMonth = query({
  args: {
    organizationId: v.id('organizations'),
    month: v.optional(v.number()), // 1-12, по умолчанию текущий
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const targetMonth = args.month || new Date().getMonth() + 1;

    const users = (
      await ctx.db
        .query('users')
        .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
        .take(DEFAULT_LIST_CAP)
    ).filter((u: any) => u.role !== 'superadmin');

    const birthdayUsers = users.filter((user: any) => {
      if (!user.dateOfBirth) return false;
      const birthDate = new Date(user.dateOfBirth);
      return birthDate.getMonth() + 1 === targetMonth;
    });

    // Сортировать по дню месяца
    birthdayUsers.sort((a, b) => {
      const dateA = new Date(a.dateOfBirth!).getDate();
      const dateB = new Date(b.dateOfBirth!).getDate();
      return dateA - dateB;
    });

    const today = new Date();
    const currentYear = today.getFullYear();

    const birthdayProfiles = await Promise.all(
      birthdayUsers.map((user: any) => getProfile(ctx, user._id)),
    );

    return birthdayUsers.map((user, i) => {
      const profile = birthdayProfiles[i];
      const dob = profile?.dateOfBirth ?? user.dateOfBirth;
      const birthDate = new Date(dob!);
      const age = currentYear - birthDate.getFullYear();
      const day = birthDate.getDate();
      const isToday = day === today.getDate() && targetMonth === today.getMonth() + 1;
      const isPast = day < today.getDate() && targetMonth === today.getMonth() + 1;

      return {
        id: user._id,
        name: user.name,
        email: user.email,
        department: profile?.department ?? user.department,
        position: profile?.position ?? user.position,
        dateOfBirth: dob,
        birthdayDate: `${day} ${getMonthName(targetMonth)}`,
        age,
        isToday,
        isPast,
        avatarUrl: profile?.avatarUrl ?? user.avatarUrl,
      };
    });
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

function getAgeEmoji(age: number): string {
  if (age < 18) return '🧒';
  if (age < 30) return '🎓';
  if (age < 40) return '👨‍💼';
  if (age < 50) return '👨‍💼';
  if (age < 60) return '👴';
  return '👴';
}

function getAgeWord(age: number): string {
  const lastDigit = age % 10;
  const lastTwoDigits = age % 100;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
    return 'лет';
  }

  if (lastDigit === 1) {
    return 'год';
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return 'года';
  }

  return 'лет';
}

function getMonthName(month: number): string {
  const months = [
    'января',
    'февраля',
    'марта',
    'апреля',
    'мая',
    'июня',
    'июля',
    'августа',
    'сентября',
    'октября',
    'ноября',
    'декабря',
  ];
  return months[month - 1] ?? 'января';
}

/**
 * Scheduled job: проверять дни рождения каждое утро в 9:00
 * Настроить в Convex Dashboard: Functions → birthdays → scheduledBirthdayCheck
 * Schedule: 0 9 * * * (каждое утро в 9:00)
 */
export const scheduledBirthdayCheck = mutation({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { organizationId } = args;
    // Проверить сегодня
    const today = await ctx.runMutation('birthdays:checkBirthdaysToday' as any, {
      organizationId,
    });

    // Проверить предстоящие (через 3 дня для напоминания)
    const upcoming = await ctx.runMutation('birthdays:checkUpcomingBirthdays' as any, {
      organizationId,
      daysAhead: 7,
    });

    return {
      today,
      upcoming,
    };
  }),
});

/**
 * Автоматически создавать scheduled job при деплое
 * Вызывать из migration или setup скрипта
 */
export const setupBirthdayScheduler = mutation({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { organizationId } = args;
    // Создать запись о scheduled job
    const jobId = await ctx.db.insert('scheduledJobs', {
      organizationId,
      functionName: 'birthdays:scheduledBirthdayCheck',
      schedule: '0 9 * * *', // Каждое утро в 9:00
      isActive: true,
      lastRun: undefined,
      nextRun: new Date().setHours(9, 0, 0, 0), // Сегодня в 9:00
      createdAt: Date.now(),
    });

    return {
      jobId,
      message: 'Birthday scheduler setup successfully!',
      schedule: '0 9 * * * (daily at 9:00 AM)',
    };
  }),
});
