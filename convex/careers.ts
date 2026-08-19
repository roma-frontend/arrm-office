import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP } from './lib/limits';
import { notify } from './lib/notify';
import { generateCandidateToken } from './candidatePortal';

/** Ceiling for an attached CV — matches the document upload limit. */
const MAX_CV_BYTES = 10 * 1024 * 1024;

// Public query: list ALL open vacancies across all organizations (for global /careers page)
export const listAllOpenVacancies = query({
  args: {},
  handler: async (ctx) => {
    const vacancies = await ctx.db
      .query('vacancies')
      .withIndex('by_status', (q) => q.eq('status', 'open'))
      .take(DEFAULT_LIST_CAP);

    // Get unique org IDs
    const orgIds = [...new Set(vacancies.map((v) => v.organizationId))];
    const orgs = await Promise.all(orgIds.map((id) => ctx.db.get(id)));
    const orgMap = Object.fromEntries(orgs.filter(Boolean).map((o) => [o!._id, o!]));

    return vacancies
      .filter((v) => {
        const org = orgMap[v.organizationId];
        return org && org.isActive;
      })
      .map((v) => {
        const org = orgMap[v.organizationId]!;
        return {
          _id: v._id,
          title: v.title,
          department: v.department,
          location: v.location,
          employmentType: v.employmentType,
          salary: v.salary,
          createdAt: v.createdAt,
          excerpt: v.description.length > 200 ? v.description.slice(0, 200) + '...' : v.description,
          org: {
            _id: org._id,
            name: org.name,
            slug: org.slug,
            logoUrl: org.logoUrl,
            industry: org.industry,
          },
        };
      });
  },
});

// Public query: list all active organizations (for careers page filter)
export const listActiveOrganizations = query({
  args: {},
  handler: async (ctx) => {
    const orgs = await ctx.db.query('organizations').take(DEFAULT_LIST_CAP);
    return orgs
      .filter((o) => o.isActive)
      .map((o) => ({
        _id: o._id,
        name: o.name,
        slug: o.slug,
        logoUrl: o.logoUrl,
        industry: o.industry,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

// Public query: list open vacancies for an organization by slug
export const listOpenVacancies = query({
  args: { orgSlug: v.string() },
  handler: async (ctx, { orgSlug }) => {
    const org = await ctx.db
      .query('organizations')
      .withIndex('by_slug', (q) => q.eq('slug', orgSlug))
      .first();
    if (!org || !org.isActive) return { org: null, vacancies: [] };

    const vacancies = await ctx.db
      .query('vacancies')
      .withIndex('by_org_status', (q) => q.eq('organizationId', org._id).eq('status', 'open'))
      .take(DEFAULT_LIST_CAP);

    return {
      org: {
        name: org.name,
        slug: org.slug,
        logoUrl: org.logoUrl,
        primaryColor: org.primaryColor,
        industry: org.industry,
      },
      vacancies: vacancies.map((v) => ({
        _id: v._id,
        title: v.title,
        department: v.department,
        location: v.location,
        employmentType: v.employmentType,
        salary: v.salary,
        createdAt: v.createdAt,
        // Truncated description for cards (first 200 chars)
        excerpt: v.description.length > 200 ? v.description.slice(0, 200) + '...' : v.description,
      })),
    };
  },
});

// Public query: get full vacancy details
export const getVacancyDetails = query({
  args: { vacancyId: v.id('vacancies') },
  handler: async (ctx, { vacancyId }) => {
    const vacancy = await ctx.db.get(vacancyId);
    if (!vacancy || vacancy.status !== 'open') return null;

    const org = await ctx.db.get(vacancy.organizationId);

    return {
      _id: vacancy._id,
      title: vacancy.title,
      department: vacancy.department,
      location: vacancy.location,
      employmentType: vacancy.employmentType,
      description: vacancy.description,
      requirements: vacancy.requirements,
      salary: vacancy.salary,
      createdAt: vacancy.createdAt,
      orgName: org?.name,
    };
  },
});

// Public mutation: apply to a vacancy
export const applyToVacancy = mutation({
  args: {
    vacancyId: v.id('vacancies'),
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    resumeText: v.optional(v.string()),
    /**
     * The CV, already uploaded from the browser.
     *
     * The file itself goes to Cloudinary through the same server action the rest
     * of the product's documents use, which is where the type and size are
     * enforced; what arrives here is the resulting URL plus metadata. The URL is
     * re-checked below because this mutation is public.
     */
    cvFileUrl: v.optional(v.string()),
    cvFileName: v.optional(v.string()),
    cvFileSize: v.optional(v.number()),
    cvMimeType: v.optional(v.string()),
    consentGiven: v.boolean(),
  },
  handler: async (ctx, args) => {
    if (!args.consentGiven) {
      throw new Error('Privacy consent is required');
    }

    // Validate vacancy is open
    const vacancy = await ctx.db.get(args.vacancyId);
    if (!vacancy || vacancy.status !== 'open') {
      throw new Error('This vacancy is no longer accepting applications');
    }

    // Anyone on the internet can call this, so the CV reference is checked rather
    // than trusted: our own storage host, a PDF, and a plausible size.
    if (args.cvFileUrl) {
      if (!/^https:\/\/res\.cloudinary\.com\//.test(args.cvFileUrl)) {
        throw new Error('The CV must be uploaded through this form');
      }
      if (args.cvMimeType && args.cvMimeType !== 'application/pdf') {
        throw new Error('The CV must be a PDF');
      }
      if (args.cvFileSize != null && args.cvFileSize > MAX_CV_BYTES) {
        throw new Error('The CV is too large');
      }
    }

    const orgId = vacancy.organizationId;
    const normalizedEmail = args.email.trim().toLowerCase();

    // Deduplicate candidate profile by email within org
    let candidate = await ctx.db
      .query('candidateProfiles')
      .withIndex('by_org_email', (q) => q.eq('organizationId', orgId).eq('email', normalizedEmail))
      .first();

    if (!candidate) {
      const candidateId = await ctx.db.insert('candidateProfiles', {
        organizationId: orgId,
        name: args.name,
        email: normalizedEmail,
        phone: args.phone,
        resumeText: args.resumeText,
        source: 'career_page',
        createdBy: vacancy.createdBy, // system attribution to vacancy creator
        createdAt: Date.now(),
      });
      candidate = await ctx.db.get(candidateId);
    }

    if (!candidate) throw new Error('Failed to create candidate');

    // Check for duplicate active application (same candidate + vacancy)
    const existingApp = await ctx.db
      .query('applications')
      .withIndex('by_vacancy', (q) => q.eq('vacancyId', args.vacancyId))
      .filter((q) => q.eq(q.field('candidateId'), candidate!._id))
      .filter((q) => q.neq(q.field('stage'), 'rejected'))
      .first();

    if (existingApp) {
      throw new Error('You have already applied to this position');
    }

    // Create application
    const applicationId = await ctx.db.insert('applications', {
      organizationId: orgId,
      candidateId: candidate._id,
      vacancyId: args.vacancyId,
      stage: 'applied',
      ...(args.cvFileUrl
        ? {
            cvFileUrl: args.cvFileUrl,
            cvFileName: args.cvFileName,
            cvFileSize: args.cvFileSize,
            cvMimeType: args.cvMimeType,
            cvUploadedAt: Date.now(),
            // Waiting on HR: this is what holds the candidate at the first stage.
            cvStatus: 'pending' as const,
          }
        : {}),
      createdBy: vacancy.createdBy, // system attribution
      candidateToken: generateCandidateToken(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Record event
    await ctx.db.insert('applicationEvents', {
      applicationId,
      organizationId: orgId,
      toStage: 'applied',
      changedBy: vacancy.createdBy,
      reason: 'Applied via career page',
      createdAt: Date.now(),
    });

    // 🔔 Notify org admins about new application
    const orgAdmins = await ctx.db
      .query('users')
      .withIndex('by_org', (q) => q.eq('organizationId', orgId))
      .filter((q) => q.or(q.eq(q.field('role'), 'admin'), q.eq(q.field('role'), 'superadmin')))
      .take(SMALL_LIST_CAP);

    const now = Date.now();
    for (const admin of orgAdmins) {
      await notify(ctx, {
        organizationId: orgId,
        userId: admin._id,
        type: 'system',
        titleKey: 'notifications.titles.applicationReceived',
        messageKey: 'notifications.messages.applicationReceived',
        params: {
          name: args.name,
          vacancyTitle: vacancy.title,
        },
        fallbackTitle: '📩 New Application Received',
        fallbackMessage: `${args.name} applied for "${vacancy.title}" via the career page`,
        relatedId: applicationId,
        route: '/recruitment',
        createdAt: now,
      });
    }

    // Read back the application to get the candidate token
    const createdApp = await ctx.db.get(applicationId);
    const candidateToken = createdApp?.candidateToken;

    // 🤖 Send portal link via Telegram if candidate has a linked account
    if (candidateToken && candidate.telegramChatId) {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (botToken) {
        const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/candidate/${candidateToken}`;
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: candidate.telegramChatId,
            text: `📋 Заявка принята! / Application received!\n\nВакансия: ${vacancy.title}\nСтатус: Ожидание\n\nОткройте ваш кабинет, чтобы следить за процессом:\nOpen your dashboard to track progress:`,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[{ text: '🚀 Открыть кабинет / Open Dashboard', url: portalUrl }]],
            },
          }),
        }).catch(() => {}); // Non-critical
      }
    }

    return { success: true, applicationId, candidateToken };
  },
});
