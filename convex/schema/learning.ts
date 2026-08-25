import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const learning = {
  courses: defineTable({
    organizationId: v.id('organizations'),
    title: v.string(),
    description: v.optional(v.string()),
    category: v.string(), // e.g., "onboarding", "compliance", "technical", "soft-skills", "leadership"
    difficulty: v.union(v.literal('beginner'), v.literal('intermediate'), v.literal('advanced')),
    estimatedHours: v.optional(v.number()),
    thumbnailUrl: v.optional(v.string()),
    createdBy: v.id('users'),
    isPublished: v.optional(v.boolean()),
    isMandatory: v.optional(v.boolean()), // mandatory compliance training
    tags: v.optional(v.array(v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_org_published', ['organizationId', 'isPublished'])
    .index('by_creator', ['organizationId', 'createdBy'])
    .index('by_category', ['organizationId', 'category']),

  lessons: defineTable({
    organizationId: v.id('organizations'),
    courseId: v.id('courses'),
    title: v.string(),
    description: v.optional(v.string()),
    order: v.number(), // lesson ordering within course
    contentType: v.union(
      v.literal('video'),
      v.literal('text'),
      v.literal('quiz'),
      v.literal('mixed'),
    ),
    videoUrl: v.optional(v.string()),
    textContent: v.optional(v.string()), // markdown or HTML content
    durationMinutes: v.optional(v.number()),
    isPreview: v.optional(v.boolean()), // free preview lesson
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_course', ['organizationId', 'courseId'])
    .index('by_course_order', ['organizationId', 'courseId', 'order']),

  enrollments: defineTable({
    organizationId: v.id('organizations'),
    userId: v.id('users'),
    courseId: v.id('courses'),
    status: v.union(
      v.literal('not_started'),
      v.literal('in_progress'),
      v.literal('completed'),
      v.literal('expired'),
    ),
    progress: v.optional(v.number()), // 0-100 percentage
    enrolledBy: v.optional(v.id('users')), // null if self-enrolled, user id if assigned by manager
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()), // for compliance training that needs renewal
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_user', ['organizationId', 'userId'])
    .index('by_user_course', ['organizationId', 'userId', 'courseId'])
    .index('by_course', ['organizationId', 'courseId'])
    .index('by_status', ['organizationId', 'status']),

  lessonProgress: defineTable({
    organizationId: v.id('organizations'),
    userId: v.id('users'),
    lessonId: v.id('lessons'),
    courseId: v.id('courses'),
    isCompleted: v.boolean(),
    timeSpentSeconds: v.optional(v.number()),
    lastPosition: v.optional(v.number()), // video timestamp or scroll position
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_user_course', ['organizationId', 'userId', 'courseId'])
    .index('by_user_lesson', ['organizationId', 'userId', 'lessonId'])
    .index('by_course_lesson', ['organizationId', 'courseId', 'lessonId']),

  quizzes: defineTable({
    organizationId: v.id('organizations'),
    courseId: v.optional(v.id('courses')), // null if standalone quiz
    lessonId: v.optional(v.id('lessons')), // quiz as part of a lesson
    title: v.string(),
    description: v.optional(v.string()),
    passingScore: v.number(), // percentage required to pass (0-100)
    timeLimitMinutes: v.optional(v.number()), // null if no time limit
    maxAttempts: v.optional(v.number()), // null if unlimited
    isPublished: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_course', ['organizationId', 'courseId'])
    .index('by_lesson', ['organizationId', 'lessonId']),

  quizQuestions: defineTable({
    organizationId: v.id('organizations'),
    quizId: v.id('quizzes'),
    questionText: v.string(),
    questionType: v.union(
      v.literal('multiple_choice'),
      v.literal('true_false'),
      v.literal('short_answer'),
    ),
    options: v.optional(v.array(v.string())), // for multiple choice
    correctAnswer: v.string(), // index for multiple choice, "true"/"false", or text
    points: v.optional(v.number()), // default 1
    explanation: v.optional(v.string()), // shown after answering
    order: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_quiz', ['organizationId', 'quizId'])
    .index('by_quiz_order', ['organizationId', 'quizId', 'order']),

  quizAttempts: defineTable({
    organizationId: v.id('organizations'),
    userId: v.id('users'),
    quizId: v.id('quizzes'),
    score: v.number(), // percentage
    passed: v.boolean(),
    answers: v.any(), // array of {questionId, userAnswer, isCorrect}
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    attemptNumber: v.number(),
    createdAt: v.number(),
  })
    .index('by_user', ['organizationId', 'userId'])
    .index('by_user_quiz', ['organizationId', 'userId', 'quizId'])
    .index('by_quiz', ['organizationId', 'quizId']),

  certificates: defineTable({
    organizationId: v.id('organizations'),
    userId: v.id('users'),
    courseId: v.id('courses'),
    certificateId: v.string(), // unique certificate number
    templateId: v.optional(v.string()), // certificate template used
    issuedAt: v.number(),
    expiresAt: v.optional(v.number()), // for certificates that expire
    metadata: v.optional(v.any()), // additional data (score, instructor, etc.)
    createdAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_user', ['organizationId', 'userId'])
    .index('by_user_course', ['organizationId', 'userId', 'courseId'])
    .index('by_certificate_id', ['organizationId', 'certificateId']),

  courseCategories: defineTable({
    organizationId: v.id('organizations'),
    name: v.string(),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
    order: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_org', ['organizationId']),
};
