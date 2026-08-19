/**
 * Telegram bot integration for recruitment.
 *
 * Sends screening instructions to candidates via their Telegram account,
 * handles the "I completed screening" callback, and links candidate profiles
 * to Telegram chat IDs.
 */
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { DEFAULT_LIST_CAP } from './lib/limits';
import { notify } from './lib/notify';
import { resolveOrgStaff } from './lib/orgAccess';

// ── Telegram API helpers ────────────────────────────────────────────────────

const TG_API = 'https://api.telegram.org';

async function tgRequest(
  token: string,
  method: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(`${TG_API}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; result?: unknown; description?: string };
  if (!json.ok) {
    throw new Error(`Telegram API error: ${json.description ?? method}`);
  }
  return json.result;
}

// ── Public action: send screening instructions to a candidate ────────────────

/**
 * Generates AI screening instructions based on the vacancy and sends them to
 * the candidate via Telegram. Called when HR moves a candidate to the
 * "screening" stage.
 */
export const sendScreeningInstructions = action({
  args: {
    applicationId: v.id('applications'),
    language: v.optional(
      v.union(v.literal('en'), v.literal('ru'), v.literal('hy'), v.literal('de')),
    ),
  },
  handler: async (ctx, args): Promise<{ success: boolean; sentTo?: string }> => {
    // Read the application, candidate, and vacancy
    const app = await ctx.runQuery(internal.telegram.getAppForScreening, {
      applicationId: args.applicationId,
    });
    if (!app) throw new Error('Application not found');
    if (!app.candidate?.telegramChatId) {
      throw new Error('Candidate has not linked their Telegram account');
    }

    const lang = args.language || 'en';
    const langInstruction =
      lang === 'en'
        ? ''
        : ` Write ALL content in ${
            lang === 'ru' ? 'Russian' : lang === 'hy' ? 'Armenian' : 'German'
          } language.`;

    // Generate screening instructions via AI
    const prompt = `Generate screening instructions for a job candidate.${langInstruction}

Job Details:
- Title: ${app.vacancy?.title ?? 'Unknown'}
${app.vacancy?.department ? `- Department: ${app.vacancy.department}` : ''}
${app.vacancy?.description ? `- Description: ${app.vacancy.description.slice(0, 1500)}` : ''}
${app.vacancy?.requirements ? `- Requirements: ${app.vacancy.requirements.slice(0, 1000)}` : ''}

Create a brief, professional screening questionnaire. Include:
1. A welcome message confirming their application
2. 3-5 screening questions relevant to this role (experience, skills, availability)
3. Clear instructions on how to respond
4. A note that after completing screening, they will move to the interview stage

Return ONLY the plain text instructions (no JSON), formatted for Telegram (use *bold* for emphasis, not markdown headers). Keep it concise (under 1000 chars).`;

    // Use Gemini via the existing AI infrastructure
    const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    let instructions: string;
    if (apiKey) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [
                {
                  text: 'You are an expert HR professional. Generate concise screening instructions for a job candidate. Return plain text only.',
                },
              ],
            },
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 800,
            },
          }),
        },
      );
      const data = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      instructions =
        data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
        generateFallbackInstructions(app.vacancy?.title, lang);
    } else {
      instructions = generateFallbackInstructions(app.vacancy?.title, lang);
    }

    // Store the instructions on the application
    await ctx.runMutation(internal.telegram.storeScreeningInstructions, {
      applicationId: args.applicationId,
      instructions,
    });

    // Send via Telegram
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN not configured');
    const chatId: string = app.candidate.telegramChatId;
    const callbackData = `screening_done:${args.applicationId}`;

    await tgRequest(botToken, 'sendMessage', {
      chat_id: chatId,
      text: instructions,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '✅ Я завершил скрининг / I completed screening',
              callback_data: callbackData,
            },
          ],
        ],
      },
    });

    return { success: true, sentTo: chatId };
  },
});

/** Fallback when AI is unavailable */
function generateFallbackInstructions(title: string | undefined, lang: string): string {
  if (lang === 'ru') {
    return `👋 Здравствуйте! Спасибо за отклик на позицию *${title ?? 'вакансию'}*.\n\n📋 Скрининг — ответьте, пожалуйста, на вопросы:\n1. Ваш опыт работы в данной области?\n2. Какие ключевые навыки вы считаете наиболее релевантными?\n3. Ваша доступность (дата начала работы)?\n\nОтветьте на этот вопрос, и нажмите кнопку ниже, когда завершите.\n\n✅ Я завершил скрининг`;
  }
  return `👋 Hello! Thank you for applying for the *${title ?? 'position'}* role.\n\n📋 Screening — please answer these questions:\n1. What is your relevant work experience?\n2. What key skills do you consider most relevant for this role?\n3. What is your availability (start date)?\n\nPlease reply to this message with your answers, then press the button below when done.\n\n✅ I completed screening`;
}

// ── Internal mutations/queries ───────────────────────────────────────────────

// ── Interview invite over Telegram ──────────────────────────────────────────

/**
 * Notifies the candidate on Telegram when an interview (and its meeting-room
 * link) is scheduled. Background job: never throws into the scheduling flow.
 */
export const sendInterviewInvite = internalAction({
  args: {
    chatId: v.string(),
    candidateName: v.string(),
    vacancyTitle: v.string(),
    interviewDate: v.string(),
    interviewTime: v.string(),
    interviewType: v.string(),
    interviewerName: v.string(),
    meetingLink: v.optional(v.string()),
    location: v.optional(v.string()),
  },
  handler: async (_, args) => {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return;

    const typeLabel =
      {
        phone: 'телефонное интервью / phone screen',
        video: 'видеоинтервью / video interview',
        onsite: 'очную встречу / on-site interview',
        technical: 'техническое интервью / technical interview',
        hr: 'HR-интервью / HR interview',
      }[args.interviewType] ?? 'интервью / interview';

    const where = args.meetingLink
      ? `\n🎥 Ссылка на комнату / Room link: ${args.meetingLink}`
      : args.location
        ? `\n📍 Место / Location: ${args.location}`
        : '';

    const text =
      `📅 Интервью запланировано / Interview scheduled\n\n` +
      `👤 ${args.candidateName}, вы приглашены на ${typeLabel} по позиции «${args.vacancyTitle}».\n` +
      `🗓 ${args.interviewDate} в ${args.interviewTime}\n` +
      `🤝 Интервьюер / Interviewer: ${args.interviewerName}` +
      `${where}\n\n` +
      `Пожалуйста, подключитесь за 5 минут до начала. Удачи! 🍀\n` +
      `Please join 5 minutes early. Good luck! 🍀`;

    try {
      await tgRequest(botToken, 'sendMessage', { chat_id: args.chatId, text });
    } catch {
      /* notification is best-effort */
    }
  },
});

export const getAppForScreening = internalQuery({
  args: { applicationId: v.id('applications') },
  handler: async (ctx, args) => {
    const app = await ctx.db.get(args.applicationId);
    if (!app) return null;
    const candidate = await ctx.db.get(app.candidateId);
    const vacancy = await ctx.db.get(app.vacancyId);
    const screeningResponses = await ctx.db
      .query('screeningResponses')
      .withIndex('by_application', (q) => q.eq('applicationId', args.applicationId))
      .order('asc')
      .collect();
    return { ...app, candidate, vacancy, screeningResponses };
  },
});

export const storeScreeningInstructions = internalMutation({
  args: {
    applicationId: v.id('applications'),
    instructions: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.applicationId, {
      screeningInstructions: args.instructions,
      screeningStartedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

// ── Handle screening completion callback from Telegram bot ───────────────────

export const completeScreening = action({
  args: { applicationId: v.id('applications') },
  handler: async (ctx, args) => {
    const app = await ctx.runQuery(internal.telegram.getAppForScreening, {
      applicationId: args.applicationId,
    });
    if (!app) return { error: 'Application not found' };

    await ctx.runMutation(internal.telegram.markScreeningComplete, {
      applicationId: args.applicationId,
      organizationId: app.organizationId,
    });

    // Notify HR/admins that screening is complete
    const admins = await ctx.runQuery(internal.telegram.getOrgAdmins, {
      organizationId: app.organizationId,
    });

    const candidateName = app.candidate?.name ?? 'Candidate';
    const vacancyTitle = app.vacancy?.title ?? 'vacancy';

    for (const admin of admins) {
      await ctx.runMutation(internal.telegram.sendNotification, {
        organizationId: app.organizationId,
        userId: admin._id,
        title: '🎯 Screening completed',
        message: `${candidateName} has completed screening for "${vacancyTitle}"`,
        relatedId: args.applicationId,
        route: '/recruitment',
      });
    }

    // Send confirmation to candidate via Telegram
    if (app.candidate?.telegramChatId) {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (botToken) {
        try {
          await tgRequest(botToken, 'sendMessage', {
            chat_id: app.candidate.telegramChatId,
            text: `✅ Скрининг завершен! / Screening completed!\n\nСпасибо за ответы. HR уведомлен и свяжется с вами.\nThank you for your answers. HR has been notified and will contact you.`,
            parse_mode: 'HTML',
          });
        } catch {
          // Non-critical — don't fail the mutation if Telegram is down
        }
      }
    }

    return { success: true };
  },
});

export const markScreeningComplete = internalMutation({
  args: {
    applicationId: v.id('applications'),
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    const app = await ctx.db.get(args.applicationId);
    if (!app) return;

    await ctx.db.patch(args.applicationId, {
      screeningCompletedAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Record event
    await ctx.db.insert('applicationEvents', {
      applicationId: args.applicationId,
      organizationId: args.organizationId,
      fromStage: 'screening',
      toStage: 'screening',
      changedBy: app.candidateId as unknown as Id<'users'>, // system event
      reason: 'Screening completed via Telegram',
      createdAt: Date.now(),
    });
  },
});

export const getOrgAdmins = internalQuery({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('users')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .filter((q) => q.or(q.eq(q.field('role'), 'admin'), q.eq(q.field('role'), 'superadmin')))
      .take(SMALL_LIST_CAP);
  },
});

export const sendNotification = internalMutation({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
    title: v.string(),
    message: v.string(),
    relatedId: v.optional(v.string()),
    route: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await notify(ctx, {
      organizationId: args.organizationId,
      userId: args.userId,
      type: 'system',
      titleKey: 'notifications.titles.screeningComplete',
      messageKey: 'notifications.messages.screeningComplete',
      params: {},
      fallbackTitle: args.title,
      fallbackMessage: args.message,
      relatedId: args.relatedId as Id<'applications'> | undefined,
      route: args.route ?? '/recruitment',
      createdAt: Date.now(),
    });
  },
});

// ── Link Telegram account to candidate profile ──────────────────────────────

export const linkTelegramAccount = internalMutation({
  args: {
    organizationId: v.id('organizations'),
    email: v.string(),
    telegramChatId: v.string(),
    telegramUsername: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const normalizedEmail = args.email.trim().toLowerCase();
    const profile = await ctx.db
      .query('candidateProfiles')
      .withIndex('by_org_email', (q) =>
        q.eq('organizationId', args.organizationId).eq('email', normalizedEmail),
      )
      .first();

    if (!profile) return false;

    await ctx.db.patch(profile._id, {
      telegramChatId: args.telegramChatId,
      telegramUsername: args.telegramUsername,
    });
    return true;
  },
});

// ── Candidate self-service linking from the bot ─────────────────────────────

export const getCandidateByToken = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const app = await ctx.db
      .query('applications')
      .withIndex('by_candidateToken', (q) => q.eq('candidateToken', args.token))
      .first();
    if (!app) return null;
    const candidate = await ctx.db.get(app.candidateId);
    if (!candidate) return null;
    return { candidateId: candidate._id, name: candidate.name };
  },
});

export const attachTelegramToCandidate = internalMutation({
  args: {
    candidateId: v.id('candidateProfiles'),
    chatId: v.string(),
    username: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.candidateId, {
      telegramChatId: args.chatId,
      telegramUsername: args.username,
    });
  },
});

/**
 * Public entry point for the bot's `/start cand_<token>` deep link: ties the
 * candidate profile to the Telegram chat so screening, interview invites and
 * status updates can reach them.
 */
export const linkCandidateTelegram = action({
  args: {
    token: v.string(),
    chatId: v.string(),
    username: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ success: boolean; name?: string }> => {
    const info = await ctx.runQuery(internal.telegram.getCandidateByToken, {
      token: args.token,
    });
    if (!info) return { success: false };
    await ctx.runMutation(internal.telegram.attachTelegramToCandidate, {
      candidateId: info.candidateId,
      chatId: args.chatId,
      username: args.username,
    });
    return { success: true, name: info.name };
  },
});

/**
 * Public wrapper so the webhook can store a candidate's free-text screening
 * answer without exposing the internal mutation.
 */
export const submitScreeningResponse = action({
  args: { chatId: v.string(), text: v.string() },
  handler: async (ctx, args): Promise<{ saved: boolean }> => {
    const app = await ctx.runQuery(internal.telegram.findActiveScreeningApp, {
      telegramChatId: args.chatId,
    });
    if (!app) return { saved: false };
    await ctx.runMutation(internal.telegram.saveScreeningResponse, {
      applicationId: app._id,
      organizationId: app.organizationId,
      message: args.text,
      telegramChatId: args.chatId,
    });
    return { saved: true };
  },
});

// ── Lookup candidate by Telegram chat ID ────────────────────────────────────

export const findCandidateByTelegramChat = internalQuery({
  args: { telegramChatId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('candidateProfiles')
      .withIndex('by_telegramChatId', (q) => q.eq('telegramChatId', args.telegramChatId))
      .first();
  },
});

// ── Screening responses ─────────────────────────────────────────────────────

/**
 * Save a candidate's screening response from Telegram.
 * Called from the HTTP webhook when a candidate sends a text message
 * while their application is in the screening stage.
 */
export const saveScreeningResponse = internalMutation({
  args: {
    applicationId: v.id('applications'),
    organizationId: v.id('organizations'),
    message: v.string(),
    telegramChatId: v.string(),
    telegramMessageId: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('screeningResponses', {
      applicationId: args.applicationId,
      organizationId: args.organizationId,
      message: args.message,
      telegramChatId: args.telegramChatId,
      telegramMessageId: args.telegramMessageId,
      sender: 'candidate',
      createdAt: Date.now(),
    });
  },
});

/**
 * Find the active screening application for a Telegram chat.
 * Returns the first application in 'screening' stage for this candidate
 * that has screening started but not yet completed.
 */
export const findActiveScreeningApp = internalQuery({
  args: { telegramChatId: v.string() },
  handler: async (ctx, args) => {
    // Find the candidate profile by Telegram chat ID
    const profile = await ctx.db
      .query('candidateProfiles')
      .withIndex('by_telegramChatId', (q) => q.eq('telegramChatId', args.telegramChatId))
      .first();
    if (!profile) return null;

    // Find their active screening applications
    const apps = await ctx.db
      .query('applications')
      .withIndex('by_candidate', (q) => q.eq('candidateId', profile._id))
      .collect();

    // Return the first one that's in screening stage and not yet completed
    const screening = apps.find((a) => a.stage === 'screening' && !a.screeningCompletedAt);
    if (!screening) return null;

    const vacancy = await ctx.db.get(screening.vacancyId);
    return { ...screening, vacancy, candidate: profile };
  },
});

/**
 * Send an HR reply to a candidate via Telegram and save it to screeningResponses.
 * Called from the candidate detail panel when HR types a reply.
 */
export const sendHrReply = action({
  args: {
    applicationId: v.id('applications'),
    message: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    // Look up the application to get candidate's Telegram chat ID
    const app = await ctx.runQuery(internal.telegram.getAppForScreening, {
      applicationId: args.applicationId,
    });
    if (!app) throw new Error('Application not found');
    if (!app.candidate?.telegramChatId) {
      throw new Error('Candidate has no Telegram account linked');
    }

    const chatId: string = app.candidate.telegramChatId;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN not configured');

    // Send via Telegram
    await tgRequest(botToken, 'sendMessage', {
      chat_id: chatId,
      text: `📩 Сообщение от HR / Message from HR:\n\n${args.message}`,
      parse_mode: 'HTML',
    });

    // Save to DB
    await ctx.runMutation(internal.telegram.saveHrMessage, {
      applicationId: args.applicationId,
      organizationId: app.organizationId,
      message: args.message,
      telegramChatId: chatId,
    });

    return { success: true };
  },
});

/**
 * Save an HR message to screeningResponses.
 */
export const saveHrMessage = internalMutation({
  args: {
    applicationId: v.id('applications'),
    organizationId: v.id('organizations'),
    message: v.string(),
    telegramChatId: v.string(),
  },
  handler: async (ctx, args) => {
    // Get the caller's user ID from the auth context
    // Since this is an internal mutation called from an action,
    // we store null for sentBy — the action caller is the HR user
    await ctx.db.insert('screeningResponses', {
      applicationId: args.applicationId,
      organizationId: args.organizationId,
      message: args.message,
      telegramChatId: args.telegramChatId,
      sender: 'hr',
      createdAt: Date.now(),
    });
  },
});

/**
 * Save the AI score to all screening responses for an application.
 */
export const saveScreeningScore = internalMutation({
  args: {
    applicationId: v.id('applications'),
    score: v.number(),
    verdict: v.union(v.literal('pass'), v.literal('conditional'), v.literal('fail')),
    reasoning: v.string(),
    strengths: v.array(v.string()),
    concerns: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    // Find all screening responses for this application
    const responses = await ctx.db
      .query('screeningResponses')
      .withIndex('by_application', (q) => q.eq('applicationId', args.applicationId))
      .collect();

    const aiScore = {
      score: args.score,
      verdict: args.verdict,
      reasoning: args.reasoning,
      strengths: args.strengths,
      concerns: args.concerns,
    };

    // Update all responses with the same score (they're all from the same screening)
    for (const resp of responses) {
      await ctx.db.patch(resp._id, { aiScore });
    }

    // Also update the application's screeningScore field
    await ctx.db.patch(args.applicationId, {
      screeningScore: args.score,
      updatedAt: Date.now(),
    });
  },
});

/**
 * List all screening responses for an application.
 * Used by the candidate detail panel to show the conversation.
 */
export const listScreeningResponses = query({
  args: { applicationId: v.id('applications') },
  handler: async (ctx, args) => {
    const app = await ctx.db.get(args.applicationId);
    if (!app) return [];
    const scope = await resolveOrgStaff(ctx, app.organizationId);
    if (!scope) return [];

    return await ctx.db
      .query('screeningResponses')
      .withIndex('by_application', (q) => q.eq('applicationId', args.applicationId))
      .order('asc')
      .take(DEFAULT_LIST_CAP);
  },
});

const SMALL_LIST_CAP = 20;
