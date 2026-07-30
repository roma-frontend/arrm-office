import {
  mutation,
  query,
  action,
  internalAction,
  internalQuery,
  internalMutation,
} from './_generated/server';
import { internal } from './_generated/api';
import { v } from 'convex/values';
import { Resend } from 'resend';
import { WeeklyDigestEmail } from '../src/emails/WeeklyDigestEmail';
import { DEFAULT_LIST_CAP } from './lib/limits';

function getResendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key || key.includes('your_api_key')) return null;
  return new Resend(key);
}

/**
 * Returns the canonical public URL used in newsletter/digest CTAs.
 * We intentionally ignore the legacy `hroffice.com` value that may still
 * live in env vars, because the live deployment is on Vercel.
 */
function getPublicAppUrl(): string {
  const fallback = 'https://hr-project-sigma.vercel.app';
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) return fallback;
  // Ignore the old marketing domain that is no longer in use
  if (/strata\.work/i.test(raw)) return fallback;
  return raw.replace(/\/+$/, '');
}

async function sendTelegramMessage(chatId: string, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const subscribe = mutation({
  args: {
    email: v.string(),
    name: v.optional(v.string()),
    language: v.union(v.literal('en'), v.literal('ru'), v.literal('hy'), v.literal('de')),
    topics: v.optional(
      v.array(
        v.union(
          v.literal('hr-tips'),
          v.literal('leadership'),
          v.literal('wellness'),
          v.literal('tech'),
        ),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('newsletterSubscribers')
      .withIndex('by_email', (q) => q.eq('email', args.email))
      .first();

    if (existing) {
      if (existing.unsubscribed) {
        await ctx.db.patch(existing._id, { unsubscribed: false, subscribedAt: Date.now() });
        return { success: true, alreadySubscribed: false };
      }
      return { success: true, alreadySubscribed: true };
    }

    const unsubscribeToken = Math.random().toString(36).substring(2) + Date.now().toString(36);

    await ctx.db.insert('newsletterSubscribers', {
      email: args.email,
      name: args.name,
      language: args.language,
      topics: args.topics,
      subscribedAt: Date.now(),
      unsubscribed: false,
      unsubscribeToken,
    });

    return { success: true, alreadySubscribed: false };
  },
});

export const unsubscribe = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const subscriber = await ctx.db
      .query('newsletterSubscribers')
      .withIndex('by_token', (q) => q.eq('unsubscribeToken', args.token))
      .first();

    if (!subscriber) return { success: false };
    await ctx.db.patch(subscriber._id, { unsubscribed: true });
    return { success: true };
  },
});

export const subscribeTelegram = mutation({
  args: {
    chatId: v.string(),
    name: v.optional(v.string()),
    language: v.union(v.literal('en'), v.literal('ru'), v.literal('hy'), v.literal('de')),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('newsletterSubscribers')
      .withIndex('by_telegram', (q) => q.eq('telegramChatId', args.chatId))
      .first();

    if (existing) {
      if (existing.unsubscribed) {
        await ctx.db.patch(existing._id, { unsubscribed: false, subscribedAt: Date.now() });
        return { success: true, alreadySubscribed: false };
      }
      return { success: true, alreadySubscribed: true };
    }

    const unsubscribeToken = Math.random().toString(36).substring(2) + Date.now().toString(36);

    await ctx.db.insert('newsletterSubscribers', {
      email: `telegram_${args.chatId}@bot`,
      name: args.name,
      language: args.language,
      subscribedAt: Date.now(),
      unsubscribed: false,
      unsubscribeToken,
      telegramChatId: args.chatId,
      channel: 'telegram',
      referralCode: args.chatId,
    });

    return { success: true, alreadySubscribed: false };
  },
});

export const unsubscribeTelegram = mutation({
  args: { chatId: v.string() },
  handler: async (ctx, args) => {
    const sub = await ctx.db
      .query('newsletterSubscribers')
      .withIndex('by_telegram', (q) => q.eq('telegramChatId', args.chatId))
      .first();
    if (!sub || sub.unsubscribed) return { success: false };
    await ctx.db.patch(sub._id, { unsubscribed: true });
    return { success: true };
  },
});

export const getActiveSubscribers = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const subs = await ctx.db
      .query('newsletterSubscribers')
      .withIndex('by_active', (q) => q.eq('unsubscribed', false))
      .take(DEFAULT_LIST_CAP);
    // Filter out paused subscribers
    return subs.filter((s) => !s.pausedUntil || s.pausedUntil < now);
  },
});

export const generateWeeklyContent = internalAction({
  args: { language: v.optional(v.string()), topics: v.optional(v.array(v.string())) },
  handler: async (_, args) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('OPENROUTER_API_KEY not configured');

    const lang = args.language || 'en';
    const langInstruction =
      lang === 'en'
        ? ''
        : ` Write ALL content in ${lang === 'ru' ? 'Russian' : lang === 'hy' ? 'Armenian' : 'German'} language.`;

    const topicsInstruction = args.topics?.length
      ? ` Focus content on these topics: ${args.topics.join(', ')}.`
      : '';

    const appUrl = getPublicAppUrl();

    const prompt = `Generate a professional HR weekly newsletter in JSON format.${langInstruction}${topicsInstruction} Include:
- subject: catchy email subject line
- greeting: warm opening paragraph
- tips: array of 3 objects with {title, body, emoji} - practical HR tips
- trends: array of 2 objects with {title, body} - current HR industry trends
- quote: object with {text, author} - inspirational leadership quote
- promo: object with {title, body, cta, link} - call to action for Strata platform. The link MUST be: ${appUrl}

Keep content professional, actionable, and concise. Return ONLY valid JSON.`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'Strata',
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-3.3-70b-instruct',
        messages: [
          { role: 'system', content: 'You are an HR content expert. Return only valid JSON.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Failed to parse AI response as JSON');
    const parsed = JSON.parse(jsonMatch[0]);
    // Override promo link to ensure correct URL
    if (parsed.promo) {
      parsed.promo.link = appUrl;
    }
    return parsed;
  },
});

export const sendWeeklyDigest = internalAction({
  args: {},
  handler: async (ctx) => {
    const subscribers = await ctx.runQuery(internal.newsletter.getActiveSubscribers, {});
    if (subscribers.length === 0) {
      console.log('No active subscribers, skipping newsletter');
      return;
    }

    const appUrl = getPublicAppUrl();

    // Group subscribers by language + topics key
    const groups: Record<string, typeof subscribers> = {};
    for (const sub of subscribers) {
      const lang = sub.language || 'en';
      const topicsKey = (sub.topics || []).sort().join(',') || 'general';
      const key = `${lang}|${topicsKey}`;
      (groups[key] ??= []).push(sub);
    }

    for (const [key, subs] of Object.entries(groups)) {
      const [lang, topicsKey] = key.split('|');
      const topics = topicsKey === 'general' ? undefined : topicsKey!.split(',');
      const content = await ctx.runAction(internal.newsletter.generateWeeklyContent, {
        language: lang,
        topics,
      });

      // Email subscribers
      const emailSubs = subs.filter((s) => !s.telegramChatId || s.channel === 'email');
      const resend = getResendClient();
      if (resend && emailSubs.length > 0) {
        for (let i = 0; i < emailSubs.length; i += 100) {
          const batch = emailSubs.slice(i, i + 100);
          const emails = batch.map((sub) => ({
            from: 'Strata <onboarding@resend.dev>',
            to: sub.email,
            subject: content.subject,
            react: WeeklyDigestEmail({
              name: sub.name || 'HR Professional',
              content,
              unsubscribeUrl: `${appUrl}/api/newsletter/unsubscribe?token=${sub.unsubscribeToken}`,
            }),
          }));
          try {
            await resend.batch.send(emails);
          } catch (e) {
            console.error('Email batch error:', e);
          }
        }
      }

      // Telegram subscribers
      const telegramSubs = subs.filter((s) => s.telegramChatId && s.channel === 'telegram');
      if (telegramSubs.length > 0) {
        const tgMessage = formatTelegramNewsletter(content);
        for (const sub of telegramSubs) {
          const ok = await sendTelegramMessage(sub.telegramChatId!, tgMessage);
          await ctx.runMutation(internal.newsletter.trackDelivery, {
            subscriberId: sub._id,
            channel: 'telegram',
            type: 'digest',
            delivered: ok,
          });
        }
      }

      // Update lastSentAt
      for (const sub of subs) {
        await ctx.runMutation(internal.newsletter.updateLastSent, { id: sub._id });
      }
    }

    console.log(
      `Newsletter sent to ${subscribers.length} subscribers in ${Object.keys(groups).length} groups`,
    );
  },
});

export const updateLastSent = internalMutation({
  args: { id: v.id('newsletterSubscribers') },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { lastSentAt: Date.now() });
  },
});

// === DRIP CAMPAIGN ===
const DRIP_MESSAGES = {
  en: [
    "👋 <b>Welcome to Strata!</b>\n\nWe're thrilled to have you. Strata is a platform for aligning strategy with daily execution through OKRs, goals, and performance tracking.\n\n🚀 Get started: https://strata.work",
    '💡 <b>Did you know?</b>\n\nStrata features:\n• Strategy Maps with OKR cascade\n• AI-powered analytics\n• Real-time team chat\n• Goal alignment & performance tracking\n\nExplore all features in your dashboard!',
    '📊 <b>Success Story</b>\n\nCompanies using Strata report:\n• 60% better OKR alignment\n• 95% employee goal engagement\n• Zero strategic drift\n\nReady to transform your strategy?',
    "🎉 <b>Your first digest arrives Monday!</b>\n\nEvery week you'll get AI-curated HR tips, trends, and insights personalized to your interests.\n\nReply /topics to customize what you receive.",
  ],
  ru: [
    '👋 <b>Добро пожаловать в Strata!</b>\n\nМы рады вас видеть. Strata — это платформа для объединения стратегии с ежедневной работой через OKR, цели и отслеживание результатов.\n\n🚀 Начать: https://strata.work',
    '💡 <b>Знаете ли вы?</b>\n\nВозможности Strata:\n• Стратегические карты с каскадированием OKR\n• AI-аналитика\n• Командный чат в реальном времени\n• Согласование целей и отслеживание результатов\n\nИсследуйте все функции!',
    '📊 <b>История успеха</b>\n\nКомпании с Strata отмечают:\n• На 60% лучшее согласование OKR\n• 95% вовлечённость в цели\n• Ноль стратегического дрейфа\n\nГотовы трансформировать стратегию?',
    '🎉 <b>Ваш первый дайджест придёт в понедельник!</b>\n\nКаждую неделю вы будете получать AI-подборку HR советов и трендов.\n\nОтправьте /topics чтобы настроить темы.',
  ],
};

export const processDripCampaign = internalAction({
  args: {},
  handler: async (ctx) => {
    const subscribers = await ctx.runQuery(internal.newsletter.getDripEligible, {});
    for (const sub of subscribers) {
      const step = sub.dripStep ?? -1;
      const nextStep = step + 1;
      if (nextStep > 3) continue;

      const lang = sub.language || 'en';
      const messages = DRIP_MESSAGES[lang as keyof typeof DRIP_MESSAGES] || DRIP_MESSAGES.en;
      const msg = messages[nextStep]!;

      if (sub.telegramChatId && sub.channel === 'telegram') {
        await sendTelegramMessage(sub.telegramChatId, msg);
      }
      // Could also send email drip here if needed

      await ctx.runMutation(internal.newsletter.advanceDrip, { id: sub._id, step: nextStep });
    }
  },
});

export const getDripEligible = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const subs = await ctx.db
      .query('newsletterSubscribers')
      .withIndex('by_active', (q) => q.eq('unsubscribed', false))
      .take(DEFAULT_LIST_CAP);

    // Drip schedule: day 0, day 2, day 4, day 6
    return subs.filter((s) => {
      const step = s.dripStep ?? -1;
      if (step >= 3) return false;
      const daysSinceSubscribe = (now - s.subscribedAt) / (1000 * 60 * 60 * 24);
      const requiredDays = [0, 2, 4, 6];
      const nextStep = step + 1;
      return daysSinceSubscribe >= requiredDays[nextStep]!;
    });
  },
});

export const advanceDrip = internalMutation({
  args: { id: v.id('newsletterSubscribers'), step: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { dripStep: args.step, dripLastSentAt: Date.now() });
  },
});

// === SELF-SERVICE COMMANDS ===
export const updateLanguage = mutation({
  args: {
    chatId: v.string(),
    language: v.union(v.literal('en'), v.literal('ru'), v.literal('hy'), v.literal('de')),
  },
  handler: async (ctx, args) => {
    const sub = await ctx.db
      .query('newsletterSubscribers')
      .withIndex('by_telegram', (q) => q.eq('telegramChatId', args.chatId))
      .first();
    if (!sub) return { success: false };
    await ctx.db.patch(sub._id, { language: args.language });
    return { success: true };
  },
});

export const updateTopics = mutation({
  args: {
    chatId: v.string(),
    topics: v.array(
      v.union(
        v.literal('hr-tips'),
        v.literal('leadership'),
        v.literal('wellness'),
        v.literal('tech'),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const sub = await ctx.db
      .query('newsletterSubscribers')
      .withIndex('by_telegram', (q) => q.eq('telegramChatId', args.chatId))
      .first();
    if (!sub) return { success: false };
    await ctx.db.patch(sub._id, { topics: args.topics });
    return { success: true };
  },
});

export const pauseSubscription = mutation({
  args: { chatId: v.string(), weeks: v.number() },
  handler: async (ctx, args) => {
    const sub = await ctx.db
      .query('newsletterSubscribers')
      .withIndex('by_telegram', (q) => q.eq('telegramChatId', args.chatId))
      .first();
    if (!sub) return { success: false };
    const pausedUntil = Date.now() + args.weeks * 7 * 24 * 60 * 60 * 1000;
    await ctx.db.patch(sub._id, { pausedUntil });
    return { success: true, pausedUntil };
  },
});

export const getSubscriberByChatId = internalQuery({
  args: { chatId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('newsletterSubscribers')
      .withIndex('by_telegram', (q) => q.eq('telegramChatId', args.chatId))
      .first();
  },
});

export const getSubscriberPublic = query({
  args: { chatId: v.string() },
  handler: async (ctx, args) => {
    const sub = await ctx.db
      .query('newsletterSubscribers')
      .withIndex('by_telegram', (q) => q.eq('telegramChatId', args.chatId))
      .first();
    if (!sub) return null;
    return {
      language: sub.language,
      topics: sub.topics,
      referralCode: sub.referralCode,
      referralCount: sub.referralCount || 0,
    };
  },
});

// === REFERRAL SYSTEM ===
export const trackReferral = mutation({
  args: { chatId: v.string(), referrerCode: v.string() },
  handler: async (ctx, args) => {
    const sub = await ctx.db
      .query('newsletterSubscribers')
      .withIndex('by_telegram', (q) => q.eq('telegramChatId', args.chatId))
      .first();
    if (sub) await ctx.db.patch(sub._id, { referredBy: args.referrerCode });

    // Increment referrer's count
    const referrer = await ctx.db
      .query('newsletterSubscribers')
      .withIndex('by_referral', (q) => q.eq('referralCode', args.referrerCode))
      .first();
    if (referrer) {
      await ctx.db.patch(referrer._id, { referralCount: (referrer.referralCount || 0) + 1 });
    }
    return { success: true };
  },
});

// === ANALYTICS ===
export const trackDelivery = internalMutation({
  args: {
    subscriberId: v.id('newsletterSubscribers'),
    channel: v.union(v.literal('email'), v.literal('telegram')),
    type: v.union(v.literal('digest'), v.literal('drip'), v.literal('poll')),
    delivered: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('newsletterAnalytics', {
      subscriberId: args.subscriberId,
      sentAt: Date.now(),
      channel: args.channel,
      type: args.type,
      delivered: args.delivered,
    });
    if (args.delivered) {
      const sub = await ctx.db.get(args.subscriberId);
      if (sub) {
        await ctx.db.patch(args.subscriberId, {
          totalSent: (sub.totalSent || 0) + 1,
          totalDelivered: (sub.totalDelivered || 0) + 1,
        });
      }
    }
  },
});

export const sendTestEmail = action({
  args: { email: v.string(), language: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const resend = getResendClient();
    if (!resend) throw new Error('Resend not configured');

    const content = await ctx.runAction(internal.newsletter.generateWeeklyContent, {
      language: args.language,
    });
    const appUrl = getPublicAppUrl();

    await resend.emails.send({
      from: 'Strata <onboarding@resend.dev>',
      to: args.email,
      subject: content.subject,
      react: WeeklyDigestEmail({
        name: 'Test User',
        content,
        unsubscribeUrl: `${appUrl}/api/newsletter/unsubscribe?token=test`,
      }),
    });

    return { success: true };
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatTelegramNewsletter(content: any): string {
  const appUrl = getPublicAppUrl();
  let msg = `🎯 <b>Strata Weekly Digest</b>\n\n`;
  msg += `${content.greeting}\n\n`;
  msg += `💡 <b>Tips of the Week</b>\n`;
  for (const tip of content.tips || []) {
    msg += `\n${tip.emoji} <b>${tip.title}</b>\n${tip.body}\n`;
  }
  msg += `\n📈 <b>HR Trends</b>\n`;
  for (const trend of content.trends || []) {
    msg += `\n• <b>${trend.title}</b>\n${trend.body}\n`;
  }
  if (content.quote) {
    msg += `\n💬 <i>"${content.quote.text}"</i>\n— ${content.quote.author}\n`;
  }
  if (content.promo) {
    // Always force the CTA link to the canonical app URL — never trust what
    // the LLM returned, otherwise it can drift to outdated domains like
    // `hroffice.com/platform`.
    const ctaLink = appUrl;
    const ctaText = content.promo.cta || 'Explore Now';
    msg += `\n🚀 <b>${content.promo.title}</b>\n${content.promo.body}\n`;
    msg += `\n👉 <a href="${ctaLink}">${ctaText}</a>`;
  }
  return msg;
}

export const sendTestTelegram = action({
  args: { chatId: v.string(), language: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const content = await ctx.runAction(internal.newsletter.generateWeeklyContent, {
      language: args.language,
    });
    const msg = formatTelegramNewsletter(content);
    const ok = await sendTelegramMessage(args.chatId, msg);
    if (!ok) throw new Error('Failed to send Telegram message. Check TELEGRAM_BOT_TOKEN.');
    return { success: true };
  },
});

// === INTERACTIVE POLLS ===
export const createPoll = mutation({
  args: {
    question: v.string(),
    options: v.array(v.string()),
    durationHours: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const duration = (args.durationHours || 48) * 60 * 60 * 1000;
    return await ctx.db.insert('newsletterPolls', {
      question: args.question,
      options: args.options.map((text) => ({ text, votes: 0 })),
      sentAt: now,
      closesAt: now + duration,
      active: true,
    });
  },
});

export const sendPollToSubscribers = internalAction({
  args: { pollId: v.id('newsletterPolls') },
  handler: async (ctx, args) => {
    const poll = await ctx.runQuery(internal.newsletter.getPoll, { pollId: args.pollId });
    if (!poll) return;

    const subscribers = await ctx.runQuery(internal.newsletter.getActiveSubscribers, {});
    const telegramSubs = subscribers.filter((s) => s.telegramChatId && s.channel === 'telegram');

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;

    for (const sub of telegramSubs) {
      const buttons = poll.options.map((opt, i: number) => [
        {
          text: opt.text,
          callback_data: `poll_${poll._id}_${i}`,
        },
      ]);

      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: sub.telegramChatId,
          text: `📊 <b>Poll:</b> ${poll.question}`,
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: buttons },
        }),
      });
    }
  },
});

export const getPoll = internalQuery({
  args: { pollId: v.id('newsletterPolls') },
  handler: async (ctx, args) => await ctx.db.get(args.pollId),
});

export const votePoll = mutation({
  args: { pollId: v.id('newsletterPolls'), chatId: v.string(), optionIndex: v.number() },
  handler: async (ctx, args) => {
    const sub = await ctx.db
      .query('newsletterSubscribers')
      .withIndex('by_telegram', (q) => q.eq('telegramChatId', args.chatId))
      .first();
    if (!sub) return { success: false, error: 'not_subscribed' };

    const poll = await ctx.db.get(args.pollId);
    if (!poll || !poll.active || Date.now() > poll.closesAt)
      return { success: false, error: 'poll_closed' };

    // Check if already voted
    const existing = await ctx.db
      .query('newsletterPollVotes')
      .withIndex('by_subscriber_poll', (q) =>
        q.eq('subscriberId', sub._id).eq('pollId', args.pollId),
      )
      .first();
    if (existing) return { success: false, error: 'already_voted' };

    // Record vote
    await ctx.db.insert('newsletterPollVotes', {
      pollId: args.pollId,
      subscriberId: sub._id,
      optionIndex: args.optionIndex,
      votedAt: Date.now(),
    });

    // Update poll counts
    const options = [...poll.options];
    options[args.optionIndex]!.votes += 1;
    await ctx.db.patch(args.pollId, { options });

    return { success: true, totalVotes: options.reduce((s, o) => s + o.votes, 0) };
  },
});
