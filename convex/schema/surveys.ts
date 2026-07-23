import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const surveys = {
  surveys: defineTable({
    organizationId: v.id('organizations'),
    title: v.string(),
    description: v.optional(v.string()),
    createdBy: v.id('users'),
    status: v.union(v.literal('draft'), v.literal('active'), v.literal('closed')),
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
    responseCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_org_status', ['organizationId', 'status'])
    .index('by_org_created', ['organizationId', 'createdAt'])
    .index('by_created_by', ['createdBy']),

  surveyQuestions: defineTable({
    organizationId: v.id('organizations'),
    surveyId: v.id('surveys'),
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
    order: v.number(),
    createdAt: v.number(),
  })
    .index('by_survey', ['surveyId'])
    .index('by_org', ['organizationId'])
    .index('by_survey_order', ['surveyId', 'order']),

  surveyResponses: defineTable({
    organizationId: v.id('organizations'),
    surveyId: v.id('surveys'),
    respondentId: v.optional(v.id('users')),
    anonymousToken: v.optional(v.string()),
    submittedAt: v.number(),
  })
    .index('by_survey', ['surveyId'])
    .index('by_org', ['organizationId'])
    .index('by_survey_respondent', ['surveyId', 'respondentId'])
    .index('by_anonymous_token', ['anonymousToken']),

  surveyAnswers: defineTable({
    organizationId: v.id('organizations'),
    surveyId: v.id('surveys'),
    responseId: v.id('surveyResponses'),
    questionId: v.id('surveyQuestions'),
    ratingValue: v.optional(v.number()),
    textValue: v.optional(v.string()),
    selectedOptions: v.optional(v.array(v.string())),
    booleanValue: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index('by_response', ['responseId'])
    .index('by_question', ['questionId'])
    .index('by_survey', ['surveyId'])
    .index('by_org', ['organizationId']),
};
