import { v } from 'convex/values';
import { mutation, query, internalMutation } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { MAX_PAGE_SIZE } from './pagination';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP } from './lib/limits';
import { getProfile } from './lib/userProfile';
import { withAuth } from './lib/withAuth';

// ─────────────────────────────────────────────────────────────────────────────
// QUERIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List surveys for an organization, optionally filtered by status
 */
export const listSurveys = query({
  args: {
    organizationId: v.id('organizations'),
    status: v.optional(v.union(v.literal('draft'), v.literal('active'), v.literal('closed'))),
    limit: v.optional(v.number()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { organizationId, status, limit } = args;
    const pageSize = Math.min(limit ?? 50, MAX_PAGE_SIZE);

    let surveyQuery;
    if (status) {
      surveyQuery = ctx.db
        .query('surveys')
        .withIndex('by_org_status', (q) =>
          q.eq('organizationId', organizationId).eq('status', status),
        );
    } else {
      surveyQuery = ctx.db
        .query('surveys')
        .withIndex('by_org_created', (q) => q.eq('organizationId', organizationId));
    }

    const surveys = await surveyQuery.order('desc').take(pageSize);

    // Batch load creators
    const creatorIds = [...new Set(surveys.map((s: any) => s.createdBy))];
    const creators = await Promise.all(creatorIds.map((id: any) => ctx.db.get(id)));
    const creatorMap = new Map(creators.filter(Boolean).map((u: any) => [u!._id, u!]));
    const creatorProfiles = await Promise.all(creatorIds.map((id: any) => getProfile(ctx, id)));
    const creatorProfileMap = new Map(creatorIds.map((id, i) => [id, creatorProfiles[i]]));

    return surveys.map((survey: any) => ({
      ...survey,
      creator: creatorMap.get(survey.createdBy)
        ? {
            name: creatorMap.get(survey.createdBy)!.name,
            avatarUrl:
              creatorProfileMap.get(survey.createdBy)?.avatarUrl ??
              (creatorMap.get(survey.createdBy) as any)?.avatarUrl,
          }
        : null,
    }));
  }),
});

/**
 * Get a single survey with its questions
 */
export const getSurveyWithQuestions = query({
  args: {
    surveyId: v.id('surveys'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { surveyId } = args;
    const survey = (await ctx.db.get(surveyId)) as any;
    if (!survey) return null;

    const questions = await ctx.db
      .query('surveyQuestions')
      .withIndex('by_survey_order', (q) => q.eq('surveyId', surveyId))
      .take(DEFAULT_LIST_CAP);

    const creator = (await ctx.db.get(survey.createdBy)) as any;
    const creatorProfile = await getProfile(ctx, survey.createdBy);

    return {
      ...survey,
      questions,
      creator: creator
        ? {
            name: creator.name,
            avatarUrl: creatorProfile?.avatarUrl ?? (creator as any)?.avatarUrl,
          }
        : null,
    };
  }),
});

/**
 * Get survey results/analytics
 */
export const getSurveyResults = query({
  args: {
    surveyId: v.id('surveys'),
    organizationId: v.id('organizations'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { surveyId, organizationId } = args;
    const survey = (await ctx.db.get(surveyId)) as any;
    if (!survey || survey.organizationId !== organizationId) return null;

    const questions = await ctx.db
      .query('surveyQuestions')
      .withIndex('by_survey_order', (q) => q.eq('surveyId', surveyId))
      .take(DEFAULT_LIST_CAP);

    const responses = await ctx.db
      .query('surveyResponses')
      .withIndex('by_survey', (q) => q.eq('surveyId', surveyId))
      .take(DEFAULT_LIST_CAP);

    const answers = await ctx.db
      .query('surveyAnswers')
      .withIndex('by_survey', (q) => q.eq('surveyId', surveyId))
      .take(DEFAULT_LIST_CAP);

    // Aggregate answers per question
    const questionResults = questions.map((question: any) => {
      const questionAnswers = answers.filter((a: any) => a.questionId === question._id);

      const aggregation: any = { totalResponses: questionAnswers.length };

      switch (question.type) {
        case 'rating':
        case 'nps': {
          const values = questionAnswers
            .map((a: any) => a.ratingValue)
            .filter((v): v is number => v !== undefined);
          aggregation.average =
            values.length > 0 ? values.reduce((sum: any, v: any) => sum + v, 0) / values.length : 0;
          aggregation.distribution = values.reduce(
            (acc, val) => {
              acc[val] = (acc[val] || 0) + 1;
              return acc;
            },
            {} as Record<number, number>,
          );
          break;
        }
        case 'multiple_choice': {
          const optionCounts: Record<string, number> = {};
          questionAnswers.forEach((a: any) => {
            a.selectedOptions?.forEach((opt: any) => {
              optionCounts[opt] = (optionCounts[opt] || 0) + 1;
            });
          });
          aggregation.optionCounts = optionCounts;
          break;
        }
        case 'yes_no': {
          const yesCount = questionAnswers.filter((a: any) => a.booleanValue === true).length;
          const noCount = questionAnswers.filter((a: any) => a.booleanValue === false).length;
          aggregation.yesCount = yesCount;
          aggregation.noCount = noCount;
          break;
        }
        case 'text': {
          aggregation.textResponses = questionAnswers.map((a: any) => a.textValue).filter(Boolean);
          break;
        }
      }

      return {
        question,
        ...aggregation,
      };
    });

    return {
      survey,
      totalResponses: responses.length,
      questionResults,
    };
  }),
});

/**
 * Check if user has already responded to a survey
 */
export const hasUserResponded = query({
  args: {
    surveyId: v.id('surveys'),
    userId: v.id('users'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { surveyId, userId } = args;
    const existing = await ctx.db
      .query('surveyResponses')
      .withIndex('by_survey_respondent', (q) =>
        q.eq('surveyId', surveyId).eq('respondentId', userId),
      )
      .first();
    return !!existing;
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// MUTATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new survey (admin/supervisor only)
 */
export const createSurvey = mutation({
  args: {
    organizationId: v.id('organizations'),
    createdBy: v.id('users'),
    title: v.string(),
    description: v.optional(v.string()),
    isAnonymous: v.boolean(),
    targetRoles: v.optional(
      v.array(
        v.union(
          v.literal('admin'),
          v.literal('supervisor'),
          v.literal('employee'),
          v.literal('driver'),
        ),
      ),
    ),
    targetDepartments: v.optional(v.array(v.string())),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    questions: v.array(
      v.object({
        type: v.union(
          v.literal('rating'),
          v.literal('multiple_choice'),
          v.literal('text'),
          v.literal('yes_no'),
          v.literal('nps'),
        ),
        text: v.string(),
        description: v.optional(v.string()),
        options: v.optional(v.array(v.string())),
        isRequired: v.boolean(),
      }),
    ),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const now = Date.now();

    const surveyId = await ctx.db.insert('surveys', {
      organizationId: args.organizationId,
      title: args.title,
      description: args.description,
      createdBy: args.createdBy,
      status: 'draft',
      isAnonymous: args.isAnonymous,
      targetRoles: args.targetRoles,
      targetDepartments: args.targetDepartments,
      startsAt: args.startsAt,
      endsAt: args.endsAt,
      responseCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    // Create questions
    for (let i = 0; i < args.questions.length; i++) {
      const q = args.questions[i]!;
      await ctx.db.insert('surveyQuestions', {
        organizationId: args.organizationId,
        surveyId,
        type: q.type,
        text: q.text,
        description: q.description,
        options: q.options,
        isRequired: q.isRequired,
        order: i,
        createdAt: now,
      });
    }

    return surveyId;
  }),
});

/**
 * Publish a survey (change status from draft to active)
 */
export const publishSurvey = mutation({
  args: {
    surveyId: v.id('surveys'),
    organizationId: v.id('organizations'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { surveyId, organizationId } = args;
    const survey = (await ctx.db.get(surveyId)) as any;
    if (!survey || survey.organizationId !== organizationId) {
      throw new Error('Survey not found');
    }
    if (survey.status !== 'draft') {
      throw new Error('Only draft surveys can be published');
    }

    await ctx.db.patch(surveyId, {
      status: 'active',
      startsAt: survey.startsAt ?? Date.now(),
      updatedAt: Date.now(),
    });
  }),
});

/**
 * Close a survey
 */
export const closeSurvey = mutation({
  args: {
    surveyId: v.id('surveys'),
    organizationId: v.id('organizations'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { surveyId, organizationId } = args;
    const survey = (await ctx.db.get(surveyId)) as any;
    if (!survey || survey.organizationId !== organizationId) {
      throw new Error('Survey not found');
    }
    if (survey.status !== 'active') {
      throw new Error('Only active surveys can be closed');
    }

    await ctx.db.patch(surveyId, {
      status: 'closed',
      endsAt: Date.now(),
      updatedAt: Date.now(),
    });
  }),
});

/**
 * Delete a survey (admin only, draft surveys only)
 */
export const deleteSurvey = mutation({
  args: {
    surveyId: v.id('surveys'),
    organizationId: v.id('organizations'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { surveyId, organizationId } = args;
    const survey = (await ctx.db.get(surveyId)) as any;
    if (!survey || survey.organizationId !== organizationId) {
      throw new Error('Survey not found');
    }
    if (survey.status !== 'draft') {
      throw new Error('Only draft surveys can be deleted');
    }

    // Delete questions
    const questions = await ctx.db
      .query('surveyQuestions')
      .withIndex('by_survey', (q) => q.eq('surveyId', surveyId))
      .take(SMALL_LIST_CAP);
    for (const question of questions) {
      await ctx.db.delete(question._id);
    }

    await ctx.db.delete(surveyId);
  }),
});

/**
 * Submit a survey response
 */
export const submitResponse = mutation({
  args: {
    organizationId: v.id('organizations'),
    surveyId: v.id('surveys'),
    respondentId: v.optional(v.id('users')),
    answers: v.array(
      v.object({
        questionId: v.id('surveyQuestions'),
        ratingValue: v.optional(v.number()),
        textValue: v.optional(v.string()),
        selectedOptions: v.optional(v.array(v.string())),
        booleanValue: v.optional(v.boolean()),
      }),
    ),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const survey = (await ctx.db.get(args.surveyId)) as any;
    if (!survey || survey.organizationId !== args.organizationId) {
      throw new Error('Survey not found');
    }
    if (survey.status !== 'active') {
      throw new Error('Survey is not active');
    }

    // Check duplicate response
    if (args.respondentId) {
      const existing = await ctx.db
        .query('surveyResponses')
        .withIndex('by_survey_respondent', (q) =>
          q.eq('surveyId', args.surveyId).eq('respondentId', args.respondentId!),
        )
        .first();
      if (existing) {
        throw new Error('You have already responded to this survey');
      }
    }

    const now = Date.now();

    // Create response record
    const responseId = await ctx.db.insert('surveyResponses', {
      organizationId: args.organizationId,
      surveyId: args.surveyId,
      respondentId: args.respondentId,
      anonymousToken: survey.isAnonymous
        ? `anon_${Date.now()}_${Math.random().toString(36).slice(2)}`
        : undefined,
      submittedAt: now,
    });

    // Insert answers
    for (const answer of args.answers) {
      await ctx.db.insert('surveyAnswers', {
        organizationId: args.organizationId,
        surveyId: args.surveyId,
        responseId,
        questionId: answer.questionId,
        ratingValue: answer.ratingValue,
        textValue: answer.textValue,
        selectedOptions: answer.selectedOptions,
        booleanValue: answer.booleanValue,
        createdAt: now,
      });
    }

    // Increment response count
    await ctx.db.patch(args.surveyId, {
      responseCount: survey.responseCount + 1,
      updatedAt: now,
    });

    return responseId;
  }),
});

/**
 * Reorder survey questions (drag-and-drop)
 */
export const reorderQuestions = mutation({
  args: {
    surveyId: v.id('surveys'),
    organizationId: v.id('organizations'),
    questionIds: v.array(v.id('surveyQuestions')),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { surveyId, organizationId, questionIds } = args;
    const survey = (await ctx.db.get(surveyId)) as any;
    if (!survey || survey.organizationId !== organizationId) {
      throw new Error('Survey not found');
    }

    const questions = await ctx.db
      .query('surveyQuestions')
      .withIndex('by_survey', (q) => q.eq('surveyId', surveyId))
      .take(DEFAULT_LIST_CAP);

    const questionMap = new Map(questions.map((q: any) => [q._id, q]));

    for (let i = 0; i < questionIds.length; i++) {
      const questionId = questionIds[i]!;
      const question = questionMap.get(questionId);
      if (question && question.order !== i) {
        await ctx.db.patch(questionId, { order: i });
      }
    }
  }),
});

/**
 * Update an existing question's properties
 */
export const updateQuestion = mutation({
  args: {
    questionId: v.id('surveyQuestions'),
    organizationId: v.id('organizations'),
    text: v.optional(v.string()),
    description: v.optional(v.string()),
    isRequired: v.optional(v.boolean()),
    options: v.optional(v.array(v.string())),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { questionId, organizationId, ...updates } = args;
    const question = (await ctx.db.get(questionId)) as any;
    if (!question || question.organizationId !== organizationId) {
      throw new Error('Question not found');
    }

    const survey = (await ctx.db.get(question.surveyId)) as any;
    if (!survey || survey.status !== 'draft') {
      throw new Error('Can only edit questions in draft surveys');
    }

    const patch: any = {};
    if (updates.text !== undefined) patch.text = updates.text;
    if (updates.description !== undefined) patch.description = updates.description;
    if (updates.isRequired !== undefined) patch.isRequired = updates.isRequired;
    if (updates.options !== undefined) patch.options = updates.options;

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(questionId, patch);
    }
  }),
});

/**
 * Delete a single question from a survey
 */
export const deleteQuestion = mutation({
  args: {
    questionId: v.id('surveyQuestions'),
    organizationId: v.id('organizations'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { questionId, organizationId } = args;
    const question = (await ctx.db.get(questionId)) as any;
    if (!question || question.organizationId !== organizationId) {
      throw new Error('Question not found');
    }

    const survey = (await ctx.db.get(question.surveyId)) as any;
    if (!survey || survey.status !== 'draft') {
      throw new Error('Can only delete questions from draft surveys');
    }

    // Reorder remaining questions
    const remainingQuestions = await ctx.db
      .query('surveyQuestions')
      .withIndex('by_survey', (q) => q.eq('surveyId', question.surveyId))
      .take(DEFAULT_LIST_CAP);

    await ctx.db.delete(questionId);

    for (let i = 0; i < remainingQuestions.length; i++) {
      const q = remainingQuestions[i];
      if (q && q._id !== questionId && q.order !== i) {
        await ctx.db.patch(q._id, { order: i });
      }
    }
  }),
});

/**
 * Update an existing survey (title, description, isAnonymous, target roles/departments, dates)
 */
export const updateSurvey = mutation({
  args: {
    surveyId: v.id('surveys'),
    organizationId: v.id('organizations'),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    isAnonymous: v.optional(v.boolean()),
    targetRoles: v.optional(
      v.array(
        v.union(
          v.literal('admin'),
          v.literal('supervisor'),
          v.literal('employee'),
          v.literal('driver'),
        ),
      ),
    ),
    targetDepartments: v.optional(v.array(v.string())),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { surveyId, organizationId, ...updates } = args;
    const survey = (await ctx.db.get(surveyId)) as any;
    if (!survey || survey.organizationId !== organizationId) {
      throw new Error('Survey not found');
    }
    if (survey.status !== 'draft') {
      throw new Error('Only draft surveys can be updated');
    }

    const patch: any = { updatedAt: Date.now() };
    if (updates.title !== undefined) patch.title = updates.title;
    if (updates.description !== undefined) patch.description = updates.description;
    if (updates.isAnonymous !== undefined) patch.isAnonymous = updates.isAnonymous;
    if (updates.targetRoles !== undefined) patch.targetRoles = updates.targetRoles;
    if (updates.targetDepartments !== undefined)
      patch.targetDepartments = updates.targetDepartments;
    if (updates.startsAt !== undefined) patch.startsAt = updates.startsAt;
    if (updates.endsAt !== undefined) patch.endsAt = updates.endsAt;

    await ctx.db.patch(surveyId, patch);
    return surveyId;
  }),
});

/**
 * Update survey questions (replace all questions)
 */
export const updateSurveyQuestions = mutation({
  args: {
    surveyId: v.id('surveys'),
    organizationId: v.id('organizations'),
    questions: v.array(
      v.object({
        type: v.union(
          v.literal('rating'),
          v.literal('multiple_choice'),
          v.literal('text'),
          v.literal('yes_no'),
          v.literal('nps'),
        ),
        text: v.string(),
        description: v.optional(v.string()),
        options: v.optional(v.array(v.string())),
        isRequired: v.boolean(),
      }),
    ),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { surveyId, organizationId, questions } = args;
    const survey = (await ctx.db.get(surveyId)) as any;
    if (!survey || survey.organizationId !== organizationId) {
      throw new Error('Survey not found');
    }
    if (survey.status !== 'draft') {
      throw new Error('Only draft surveys can be updated');
    }

    // Delete existing questions
    const existingQuestions = await ctx.db
      .query('surveyQuestions')
      .withIndex('by_survey', (q) => q.eq('surveyId', surveyId))
      .take(SMALL_LIST_CAP);

    for (const question of existingQuestions) {
      await ctx.db.delete(question._id);
    }

    // Insert new questions
    const now = Date.now();
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]!;
      await ctx.db.insert('surveyQuestions', {
        organizationId,
        surveyId,
        type: q.type,
        text: q.text,
        description: q.description,
        options: q.options,
        isRequired: q.isRequired,
        order: i,
        createdAt: now,
      });
    }

    return surveyId;
  }),
});

// ── Internal: Auto-activate surveys when startsAt is reached (cron) ─────────
export const activateScheduledSurveys = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Get all organizations
    const orgs = await ctx.db.query('organizations').take(DEFAULT_LIST_CAP);

    for (const org of orgs) {
      // Find draft surveys that should be active now
      const surveysToActivate = await ctx.db
        .query('surveys')
        .withIndex('by_org_status', (q) => q.eq('organizationId', org._id).eq('status', 'draft'))
        .filter((q: any) =>
          q.and(q.lt(q.field('startsAt'), now), q.neq(q.field('startsAt'), undefined)),
        )
        .take(DEFAULT_LIST_CAP);

      for (const survey of surveysToActivate) {
        await ctx.db.patch(survey._id, {
          status: 'active',
          updatedAt: now,
        });

        // Notify creators
        await ctx.db.insert('notifications', {
          organizationId: org._id,
          userId: survey.createdBy,
          type: 'survey_auto_activated',
          title: '📢 Survey Auto-Activated',
          message: `"${survey.title}" has been automatically activated as scheduled.`,
          isRead: false,
          relatedId: survey._id,
          route: '/surveys',
          createdAt: now,
        });
      }
    }
  },
});

// ── Internal: Auto-close surveys when endsAt is reached (cron) ─────────────
export const closeExpiredSurveys = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const orgs = await ctx.db.query('organizations').take(DEFAULT_LIST_CAP);

    for (const org of orgs) {
      const surveysToClose = await ctx.db
        .query('surveys')
        .withIndex('by_org_status', (q) => q.eq('organizationId', org._id).eq('status', 'active'))
        .filter((q: any) =>
          q.and(q.lt(q.field('endsAt'), now), q.neq(q.field('endsAt'), undefined)),
        )
        .take(DEFAULT_LIST_CAP);

      for (const survey of surveysToClose) {
        await ctx.db.patch(survey._id, {
          status: 'closed',
          endsAt: now,
          updatedAt: now,
        });

        await ctx.db.insert('notifications', {
          organizationId: org._id,
          userId: survey.createdBy,
          type: 'survey_auto_closed',
          title: '🔒 Survey Auto-Closed',
          message: `"${survey.title}" has been automatically closed as the end date has passed.`,
          isRead: false,
          relatedId: survey._id,
          route: '/surveys',
          createdAt: now,
        });
      }
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// RESULTS DASHBOARD QUERIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get survey results with department segmentation
 */
export const getSurveyResultsByDepartment = query({
  args: {
    surveyId: v.id('surveys'),
    organizationId: v.id('organizations'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { surveyId, organizationId } = args;
    const survey = (await ctx.db.get(surveyId)) as any;
    if (!survey || survey.organizationId !== organizationId) return null;

    const questions = await ctx.db
      .query('surveyQuestions')
      .withIndex('by_survey_order', (q) => q.eq('surveyId', surveyId))
      .take(DEFAULT_LIST_CAP);

    const responses = await ctx.db
      .query('surveyResponses')
      .withIndex('by_survey', (q) => q.eq('surveyId', surveyId))
      .take(DEFAULT_LIST_CAP);

    // Load respondent departments
    const respondentIds = responses
      .map((r: any) => r.respondentId)
      .filter((id): id is Id<'users'> => id !== undefined);

    const users = await Promise.all(respondentIds.map((id: any) => ctx.db.get(id)));
    const profiles = await Promise.all(respondentIds.map((id: any) => getProfile(ctx, id)));
    const userDepartmentMap = new Map<string, string>();
    users.forEach((user, i) => {
      if (user) {
        // @ts-expect-error - withAuth args: any breaks type inference
        const dept = profiles[i]?.department ?? user.department;
        if (dept) {
          userDepartmentMap.set(user._id, dept);
        }
      }
    });

    // Group responses by department
    const departmentGroups: Record<string, typeof responses> = {};
    responses.forEach((resp: any) => {
      const dept = userDepartmentMap.get(resp.respondentId ?? '') ?? 'Unknown';
      if (!departmentGroups[dept]) departmentGroups[dept] = [];
      departmentGroups[dept].push(resp);
    });

    // Load all answers for this survey upfront
    const allAnswers = await ctx.db
      .query('surveyAnswers')
      .withIndex('by_survey', (q) => q.eq('surveyId', surveyId))
      .take(DEFAULT_LIST_CAP);

    // Aggregate per department per question
    const departmentResults = Object.entries(departmentGroups).map(([dept, deptResponses]) => {
      const deptResponseIds = new Set(deptResponses.map((r: any) => r._id));

      const questionResults = questions.map((question: any) => {
        const questionAnswers = allAnswers.filter(
          (a) => a.questionId === question._id && deptResponseIds.has(a.responseId),
        );

        const aggregation: any = { totalResponses: questionAnswers.length };

        switch (question.type) {
          case 'rating':
          case 'nps': {
            const values = questionAnswers
              .map((a: any) => a.ratingValue)
              .filter((v): v is number => v !== undefined);
            aggregation.average =
              values.length > 0
                ? values.reduce((sum: any, v: any) => sum + v, 0) / values.length
                : 0;
            break;
          }
          case 'yes_no': {
            aggregation.yesCount = questionAnswers.filter(
              (a: any) => a.booleanValue === true,
            ).length;
            aggregation.noCount = questionAnswers.filter(
              (a: any) => a.booleanValue === false,
            ).length;
            break;
          }
        }

        return { questionId: question._id, ...aggregation };
      });

      return {
        department: dept,
        responseCount: deptResponses.length,
        questionResults,
      };
    });

    return {
      survey,
      totalResponses: responses.length,
      departmentResults,
    };
  }),
});

/**
 * Get survey trends across multiple surveys for an organization
 */
export const getSurveyTrends = query({
  args: {
    organizationId: v.id('organizations'),
    months: v.optional(v.number()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { organizationId, months = 6 } = args;
    const cutoffDate = Date.now() - months * 30 * 24 * 60 * 60 * 1000;

    const surveys = await ctx.db
      .query('surveys')
      .withIndex('by_org_created', (q) => q.eq('organizationId', organizationId))
      .filter((q: any) => q.gt(q.field('createdAt'), cutoffDate))
      .take(DEFAULT_LIST_CAP);

    const trends = surveys.map((survey: any) => ({
      surveyId: survey._id,
      title: survey.title,
      status: survey.status,
      responseCount: survey.responseCount,
      createdAt: survey.createdAt,
      isAnonymous: survey.isAnonymous,
    }));

    const totalResponses = trends.reduce((sum: any, t: any) => sum + t.responseCount, 0);
    const avgResponseRate = trends.length > 0 ? totalResponses / trends.length : 0;

    return {
      trends,
      totalSurveys: trends.length,
      totalResponses,
      avgResponseRate,
    };
  }),
});

/**
 * Get individual survey responses (for named surveys only)
 */
export const getSurveyResponses = query({
  args: {
    surveyId: v.id('surveys'),
    organizationId: v.id('organizations'),
    limit: v.optional(v.number()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { surveyId, organizationId, limit = 50 } = args;
    const survey = (await ctx.db.get(surveyId)) as any;
    if (!survey || survey.organizationId !== organizationId) return null;
    if (survey.isAnonymous)
      return { error: 'Anonymous survey - individual responses not available' };

    const responses = await ctx.db
      .query('surveyResponses')
      .withIndex('by_survey', (q) => q.eq('surveyId', surveyId))
      .order('desc')
      .take(limit);

    const responseDetails = await Promise.all(
      responses.map(async (resp) => {
        const user = resp.respondentId ? ((await ctx.db.get(resp.respondentId)) as any) : null;
        const profile = resp.respondentId ? await getProfile(ctx, resp.respondentId) : null;
        const answers = await ctx.db
          .query('surveyAnswers')
          .withIndex('by_response', (q) => q.eq('responseId', resp._id))
          .take(DEFAULT_LIST_CAP);

        return {
          responseId: resp._id,
          respondent: user
            ? {
                name: user.name,
                email: user.email,
                department: profile?.department ?? user.department,
              }
            : null,
          submittedAt: resp.submittedAt,
          answers,
        };
      }),
    );

    return {
      survey,
      responses: responseDetails,
      totalResponses: responses.length,
    };
  }),
});

/**
 * Get CSV export data for a survey
 */
export const getSurveyExportData = query({
  args: {
    surveyId: v.id('surveys'),
    organizationId: v.id('organizations'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { surveyId, organizationId } = args;
    const survey = (await ctx.db.get(surveyId)) as any;
    if (!survey || survey.organizationId !== organizationId) return null;

    const questions = await ctx.db
      .query('surveyQuestions')
      .withIndex('by_survey_order', (q) => q.eq('surveyId', surveyId))
      .take(DEFAULT_LIST_CAP);

    const responses = await ctx.db
      .query('surveyResponses')
      .withIndex('by_survey', (q) => q.eq('surveyId', surveyId))
      .take(DEFAULT_LIST_CAP);

    const exportData = await Promise.all(
      responses.map(async (resp) => {
        const user = resp.respondentId ? ((await ctx.db.get(resp.respondentId)) as any) : null;
        const profile = resp.respondentId ? await getProfile(ctx, resp.respondentId) : null;
        const answers = await ctx.db
          .query('surveyAnswers')
          .withIndex('by_response', (q) => q.eq('responseId', resp._id))
          .take(DEFAULT_LIST_CAP);

        const answerMap: Record<string, any> = {};
        answers.forEach((ans: any) => {
          const question = questions.find((q: any) => q._id === ans.questionId);
          if (question) {
            if (ans.ratingValue !== undefined) answerMap[question.text] = ans.ratingValue;
            else if (ans.textValue !== undefined) answerMap[question.text] = ans.textValue;
            else if (ans.booleanValue !== undefined)
              answerMap[question.text] = ans.booleanValue ? 'Yes' : 'No';
            else if (ans.selectedOptions?.length)
              answerMap[question.text] = ans.selectedOptions.join('; ');
          }
        });

        return {
          respondent: survey.isAnonymous ? 'Anonymous' : (user?.name ?? 'Unknown'),
          department: profile?.department ?? user?.department ?? 'Unknown',
          submittedAt: new Date(resp.submittedAt).toISOString(),
          ...answerMap,
        };
      }),
    );

    return {
      survey: { title: survey.title, status: survey.status, isAnonymous: survey.isAnonymous },
      questions: questions.map((q: any) => q.text),
      exportData,
    };
  }),
});
