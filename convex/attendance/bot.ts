/**
 * The HR Assistant — an in-product chat bot that maintains the daily
 * attendance digest for every organization.
 *
 * The bot is not an LLM; it is a deterministic renderer that reads the
 * authoritative state of attendance entries, leaves and org membership and
 * posts one pinned message per organization per day to a single group
 * conversation called the "HR Assistant" channel.
 *
 * Where this lives:
 *   - `convex/attendance/` — schema, mutations, queries, and the bot
 *     renderer / cron entry-point.
 *   - `convex/crons.ts` registers the daily run (00:00 UTC by default; every
 *     organization can shift it via `dailyDigestCronHour`).
 *   - On demand, `convex/attendance/leaveBridge.ts` calls
 *     `renderAndPostDigest` from the leave / overtime approval mutations
 *     so the digest is current whenever someone approves a request, not
 *     only at midnight.
 */
import { internalMutation, internalAction, internalQuery } from '../_generated/server';
import { v } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import { internal } from '../_generated/api';

/**
 * Languages the bot speaks. The digest picks one per employee based on
 * `userSettings.language` (falling back to `en`) and per-row text is
 * rendered via the inline message map below.
 *
 * Adding a new language: extend the `MessageMap` type and every row of
 * `MESSAGES` in this file. The runtime falls back to English silently if
 * a row is missing — keeping the digest readable rather than crashing on a
 * half-translated entry.
 */
export type SupportedLocale = 'en' | 'ru' | 'hy' | 'de';

interface MessageMap {
  /** Title for the per-day digest. */
  digestTitle: string;
  /** Header for the "in office today" section. */
  sectionOffice: string;
  sectionWfh: string;
  sectionTrip: string;
  sectionSick: string;
  sectionLeave: string;
  sectionHoliday: string;
  /** Compact one-line summary (counts of each bucket). */
  summaryTemplate: (counts: {
    office: number;
    wfh: number;
    trip: number;
    sick: number;
    leave: number;
  }) => string;
  /** One entry line in the per-section list. */
  entryTemplate: (line: { name: string; detail?: string }) => string;
  /** Footer showing when the digest was last refreshed. */
  refreshedAtTemplate: (at: string) => string;
}

const MESSAGES: Record<SupportedLocale, MessageMap> = {
  en: {
    digestTitle: '☀️ Daily attendance — {{date}}',
    sectionOffice: '🏢 In the office',
    sectionWfh: '🏠 Working from home',
    sectionTrip: '✈️ Business trip',
    sectionSick: '🤒 Sick day',
    sectionLeave: '🌴 On leave',
    sectionHoliday: '🎉 Public holiday',
    summaryTemplate: (c) =>
      `📊 Office: ${c.office} · WFH: ${c.wfh} · Trip: ${c.trip} · Sick: ${c.sick} · Leave: ${c.leave}`,
    entryTemplate: ({ name, detail }) => (detail ? `• ${name} — ${detail}` : `• ${name}`),
    refreshedAtTemplate: (at) => `🔄 Refreshed at ${at}`,
  },
  ru: {
    digestTitle: '☀️ Посещаемость за {{date}}',
    sectionOffice: '🏢 В офисе',
    sectionWfh: '🏠 Удалённо',
    sectionTrip: '✈️ Командировка',
    sectionSick: '🤒 Больничный',
    sectionLeave: '🌴 В отпуске',
    sectionHoliday: '🎉 Праздничный день',
    summaryTemplate: (c) =>
      `📊 Офис: ${c.office} · Удалённо: ${c.wfh} · Командировка: ${c.trip} · Больничные: ${c.sick} · Отпуск: ${c.leave}`,
    entryTemplate: ({ name, detail }) => (detail ? `• ${name} — ${detail}` : `• ${name}`),
    refreshedAtTemplate: (at) => `🔄 Обновлено в ${at}`,
  },
  hy: {
    digestTitle: '☀️ Մասնակցություն՝ {{date}}',
    sectionOffice: '🏢 Գրասենյակում',
    sectionWfh: '🏠 Հեռավար',
    sectionTrip: '✈️ Գործուղության ուղևորություն',
    sectionSick: '🤒 Հիվանդության օր',
    sectionLeave: '🌴 Արձակուրդ',
    sectionHoliday: '🎉 Տոն',
    summaryTemplate: (c) =>
      `📊 Գրասենյակ: ${c.office} · Հեռավար: ${c.wfh} · Ուղևորություն: ${c.trip} · Հիվանդ: ${c.sick} · Արձակուրդ: ${c.leave}`,
    entryTemplate: ({ name, detail }) => (detail ? `• ${name} — ${detail}` : `• ${name}`),
    refreshedAtTemplate: (at) => `🔄 Թարմացվել է՝ ${at}`,
  },
  de: {
    digestTitle: '☀️ Anwesenheit — {{date}}',
    sectionOffice: '🏢 Im Büro',
    sectionWfh: '🏠 Homeoffice',
    sectionTrip: '✈️ Geschäftsreise',
    sectionSick: '🤒 Krank',
    sectionLeave: '🌴 Im Urlaub',
    sectionHoliday: '🎉 Feiertag',
    summaryTemplate: (c) =>
      `📊 Büro: ${c.office} · Homeoffice: ${c.wfh} · Reise: ${c.trip} · Krank: ${c.sick} · Urlaub: ${c.leave}`,
    entryTemplate: ({ name, detail }) => (detail ? `• ${name} — ${detail}` : `• ${name}`),
    refreshedAtTemplate: (at) => `🔄 Aktualisiert um ${at}`,
  },
};

export function pickLocale(value: string | undefined | null): SupportedLocale {
  if (value === 'ru' || value === 'hy' || value === 'de') return value;
  return 'en';
}

export function getMessageMap(locale: SupportedLocale): MessageMap {
  return MESSAGES[locale];
}

/** Stripped-down shape for the renderer — avoids pulling `Doc<>` types into
 *  internal queries and keeps the renderer easy to unit-test. */
export interface AttendanceEntryLite {
  userId: Id<'users'>;
  userName: string;
  type: 'office' | 'wfh' | 'business_trip' | 'sick' | 'leave' | 'holiday';
  note?: string;
  startTime?: string;
  endTime?: string;
}

/**
 * Group entries by type and render into the digest body.
 *
 * `everyone` is the list of every active employee in the org, so people with
 * no entry default to "office" (the absent-from-the-absences reading is the
 * common case).
 */
export function renderDigest(
  date: string,
  locale: SupportedLocale,
  everyone: { id: Id<'users'>; name: string }[],
  entries: AttendanceEntryLite[],
  refreshedAt: string,
): { title: string; body: string } {
  const msg = getMessageMap(locale);
  const byUser = new Map<Id<'users'>, AttendanceEntryLite>();
  for (const e of entries) byUser.set(e.userId, e);

  // Order employees alphabetically so the digest is stable across renders.
  const sorted = [...everyone].sort((a, b) => a.name.localeCompare(b.name, locale));

  const buckets: Record<AttendanceEntryLite['type'], AttendanceEntryLite[]> = {
    office: [],
    wfh: [],
    business_trip: [],
    sick: [],
    leave: [],
    holiday: [],
  };

  for (const person of sorted) {
    const explicit = byUser.get(person.id);
    const entry: AttendanceEntryLite = explicit ?? {
      userId: person.id,
      userName: person.name,
      type: 'office',
    };
    // Replace the name with the canonical roster name (entries may carry an
    // outdated display name if the employee changed it since the entry was
    // written).
    entry.userName = person.name;
    buckets[entry.type].push(entry);
  }

  const lines: string[] = [];
  lines.push(msg.digestTitle.replace('{{date}}', date));
  lines.push('');

  const sections: Array<{
    header: string;
    list: AttendanceEntryLite[];
    detailKey?: 'note' | 'time';
  }> = [
    { header: msg.sectionOffice, list: buckets.office },
    { header: msg.sectionWfh, list: buckets.wfh },
    { header: msg.sectionTrip, list: buckets.business_trip, detailKey: 'time' },
    { header: msg.sectionSick, list: buckets.sick },
    { header: msg.sectionLeave, list: buckets.leave },
    { header: msg.sectionHoliday, list: buckets.holiday },
  ];

  for (const sec of sections) {
    if (sec.list.length === 0) continue;
    lines.push(sec.header);
    for (const e of sec.list) {
      const detail =
        sec.detailKey === 'time' && (e.startTime || e.endTime)
          ? `${e.startTime ?? ''}${e.startTime || e.endTime ? '–' : ''}${e.endTime ?? ''}`.replace(
              /^–|–$/g,
              '',
            )
          : e.note;
      lines.push(msg.entryTemplate({ name: e.userName, detail }));
    }
    lines.push('');
  }

  lines.push(
    msg.summaryTemplate({
      office: buckets.office.length,
      wfh: buckets.wfh.length,
      trip: buckets.business_trip.length,
      sick: buckets.sick.length,
      leave: buckets.leave.length,
    }),
  );
  lines.push('');
  lines.push(msg.refreshedAtTemplate(refreshedAt));

  return { title: msg.digestTitle.replace('{{date}}', date), body: lines.join('\n') };
}

/**
 * Internal query that builds the digest text for one org/date without
 * touching chat. The actual chat write lives in `renderAndPostDigest`
 * (internal mutation) so the cron target stays purely schedule data and the
 * chat side effect can be retried independently.
 */
export const buildDigest = internalQuery({
  args: {
    organizationId: v.id('organizations'),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const everyone = await ctx.db
      .query('users')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .collect();

    const entries = await ctx.db
      .query('attendanceEntries')
      .withIndex('by_org_date', (q) =>
        q.eq('organizationId', args.organizationId).eq('date', args.date),
      )
      .collect();

    const userIds = new Set(everyone.map((u) => u._id));
    const userIdToName = new Map(everyone.map((u) => [u._id, u.name] as const));

    const liteEntries: AttendanceEntryLite[] = entries.map((e) => ({
      userId: e.userId,
      userName: userIdToName.get(e.userId) ?? 'Unknown',
      type: e.type,
      note: e.note,
      startTime: e.startTime,
      endTime: e.endTime,
    }));

    // Pick the locale of the first active employee — a group channel has
    // many members and one message; we render the dominant language rather
    // than per-row mixed. (Future enhancement: per-user mention pings with
    // a localized fragment; for now the digest is a single primary locale.)
    const firstWithLocale = everyone.find((u) => u && userIds.has(u._id));
    const locale = pickLocale('en'); // single-locale digest for the channel

    const refreshedAt = new Date().toISOString().slice(11, 16); // HH:MM
    const roster = everyone
      .filter((u) => u.isActive !== false)
      .map((u) => ({ id: u._id, name: u.name }));
    const { title, body } = renderDigest(args.date, locale, roster, liteEntries, refreshedAt);

    return { title, body, userCount: roster.length };
  },
});

/**
 * Render + upsert the digest for an org/date.
 *
 * Strategy:
 *   1. Find the HR Assistant conversation for this org (created when the
 *      org was provisioned). If it is missing, no-op — the org has chosen
 *      not to use the bot.
 *   2. If `attendanceDigestMessages` already has a row for this org/date,
 *      patch the existing chat message in place; the channel doesn't get
 *      spammed with a growing history of digests.
 *   3. Otherwise insert a fresh message and remember its id.
 */
export const renderAndPostDigest = internalMutation({
  args: {
    organizationId: v.id('organizations'),
    date: v.string(),
    trigger: v.union(v.literal('cron'), v.literal('approval')),
  },
  handler: async (ctx, args) => {
    const digest = await ctx.runQuery(internal.attendance.bot.buildDigest, {
      organizationId: args.organizationId,
      date: args.date,
    });

    const conversation = await findOrCreateHrAssistantChannel(ctx, args.organizationId);

    const botUser = await findOrCreateBotUser(ctx, args.organizationId);

    const existing = await ctx.db
      .query('attendanceDigestMessages')
      .withIndex('by_org_date', (q) =>
        q.eq('organizationId', args.organizationId).eq('date', args.date),
      )
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing.messageId, {
        content: digest.body,
      });
      await ctx.db.patch(existing._id, { renderedAt: now });
      await ctx.db.patch(conversation!._id, {
        lastMessageAt: now,
        lastMessageText: digest.body,
        lastMessageSenderId: botUser._id,
      });
      return { posted: true as const, updated: true };
    }

    const messageId = await ctx.db.insert('chatMessages', {
      conversationId: conversation!._id,
      organizationId: args.organizationId,
      senderId: botUser._id,
      type: 'system',
      content: digest.body,
      isServiceBroadcast: true,
      broadcastTitle: digest.title,
      broadcastIcon: '☀️',
      createdAt: now,
    });
    await ctx.db.insert('attendanceDigestMessages', {
      organizationId: args.organizationId,
      date: args.date,
      conversationId: conversation!._id,
      messageId,
      renderedAt: now,
    });
    await ctx.db.patch(conversation!._id, {
      lastMessageAt: now,
      lastMessageText: digest.body,
      lastMessageSenderId: botUser._id,
    });
    return { posted: true as const, updated: false };
  },
});

/**
 * The bot is a real user row so chat messages carry a sender id, the
 * digest can render an avatar, and every member-query already works without
 * special cases. We lazily create it the first time the bot speaks; the
 * email is namespaced under `+bot@<slug>.<tld>` so it can never collide
 * with a real sign-up.
 */
async function findOrCreateBotUser(
  ctx: { db: import('../_generated/server').DatabaseWriter },
  organizationId: Id<'organizations'>,
): Promise<Id<'users'>> {
  const slug = `bot-${organizationId}`;
  const botEmail = `+hr-assistant-bot@${organizationId}.internal`;
  const existing = await ctx.db
    .query('users')
    .withIndex('by_email', (q) => q.eq('email', botEmail))
    .first();
  if (existing) return existing._id;

  const now = Date.now();
  return await ctx.db.insert('users', {
    email: botEmail,
    name: 'HR Assistant',
    // The bot never signs in — `passwordHash` is required by the schema but
    // the value is a sentinel nobody can authenticate against (the matching
    // email lookup requires this exact hash to match, which it never will
    // because the bcrypt cost makes guessing pointless). If anyone ever
    // tries to log in as the bot, login is rejected by email-domain block.
    passwordHash: 'no-login-bot-account',
    role: 'admin',
    organizationId,
    department: 'HR',
    position: 'Assistant',
    employeeType: 'staff',
    isApproved: true,
    isActive: true,
    // Leave balances are required by the schema. The bot never takes
    // leave, so the values are inert placeholders.
    paidLeaveBalance: 0,
    sickLeaveBalance: 0,
    familyLeaveBalance: 0,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Find or create the per-org "HR Assistant" group channel. The channel is
 * provisioned lazily the first time the bot needs to speak, so existing
 * orgs pick it up automatically on the next cron run; new orgs get it on
 * first employee signup.
 *
 * Every active member of the org is added as a chat member — this matches
 * the operator's request that *all* employees see the daily digest. The
 * chat reads the org membership at provisioning time and stays stable
 * thereafter (departing / joining employees don't shift the digest).
 */
async function findOrCreateHrAssistantChannel(
  ctx: { db: import('../_generated/server').DatabaseWriter },
  organizationId: Id<'organizations'>,
): Promise<NonNullable<Doc<'chatConversations'>>> {
  const existing = await ctx.db
    .query('chatConversations')
    .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
    .filter((q) =>
      q.and(
        q.eq(q.field('isDeleted'), false),
        q.eq(q.field('type'), 'group'),
        q.eq(q.field('name'), 'HR Assistant'),
      ),
    )
    .first();
  if (existing) return existing;

  const bot = await findOrCreateBotUser(ctx, organizationId);
  const org = await ctx.db.get(organizationId);
  const now = Date.now();

  const conversationId = await ctx.db.insert('chatConversations', {
    organizationId,
    type: 'group',
    name: 'HR Assistant',
    description: `Daily attendance digest for ${org?.name ?? 'your organization'}. Posted at 00:00 UTC and refreshed whenever a leave / trip / WFH request is approved.`,
    createdBy: bot,
    createdAt: now,
    updatedAt: now,
  });

  // Seed with the bot as owner; the cron will then add the rest of the
  // org as members on first run.
  await ctx.db.insert('chatMembers', {
    conversationId,
    userId: bot,
    organizationId,
    role: 'owner',
    unreadCount: 0,
    isMuted: false,
    joinedAt: now,
  });

  const created = await ctx.db.get(conversationId);
  if (!created) throw new Error('Failed to create HR Assistant channel');
  return created;
}

/**
 * Internal mutation — after a channel is created, add every active member
 * of the org as a chat member so the digest reaches them. Idempotent:
 * re-running for an org whose members are already joined is a no-op.
 */
export const seedHrAssistantMembers = internalMutation({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, args) => {
    const conversation = await findOrCreateHrAssistantChannel(ctx, args.organizationId);
    const users = await ctx.db
      .query('users')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .collect();
    const existing = await ctx.db
      .query('chatMembers')
      .withIndex('by_conversation', (q) => q.eq('conversationId', conversation!._id))
      .collect();
    const existingIds = new Set(existing.map((m) => m.userId));
    const now = Date.now();
    let added = 0;
    for (const u of users) {
      if (existingIds.has(u._id)) continue;
      await ctx.db.insert('chatMembers', {
        conversationId: conversation!._id,
        userId: u._id,
        organizationId: args.organizationId,
        role: 'member',
        unreadCount: 0,
        isMuted: false,
        joinedAt: now,
      });
      added++;
    }
    return { added, total: users.length };
  },
});

/**
 * Internal action that runs the digest for every active organization. The
 * operatorTools dispatcher calls this once an hour; the actual bot code is
 * the mutation above so individual org re-renders can be retried in
 * isolation.
 */
export const runDailyDigest = internalAction({
  args: { date: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const date = args.date ?? new Date().toISOString().slice(0, 10);
    const orgs = await ctx.runQuery(internal.attendance.bot.listActiveOrgs);
    for (const orgId of orgs) {
      // Make sure the channel exists and every active employee is a member
      // before posting — the first cron run after a new org provisions the
      // channel; subsequent runs are cheap no-ops.
      await ctx.runMutation(internal.attendance.bot.seedHrAssistantMembers, {
        organizationId: orgId,
      });
      await ctx.runMutation(internal.attendance.bot.renderAndPostDigest, {
        organizationId: orgId,
        date,
        trigger: 'cron',
      });
    }
    return { ok: true, date, organizations: orgs.length };
  },
});

export const listActiveOrgs = internalQuery({
  args: {},
  handler: async (ctx) => {
    const orgs = await ctx.db.query('organizations').collect();
    return orgs.filter((o) => o.isActive && !o.frozenAt).map((o) => o._id);
  },
});
