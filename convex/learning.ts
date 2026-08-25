import { v } from 'convex/values';
import { query, mutation, type QueryCtx, type MutationCtx } from './_generated/server';
import type { Id, Doc } from './_generated/dataModel';
import { MAX_PAGE_SIZE } from './pagination';
import { isSuperadmin } from './lib/auth';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP } from './lib/limits';
import { getAuthCaller } from './lib/getAuthCaller';
import { assertModuleAccess } from './lib/entitlements';

// ─── Helper: Check permissions ───────────────────────────────────────────────
// Identity is derived from the verified JWT (getAuthCaller), never from client args.
async function checkAccess(ctx: QueryCtx | MutationCtx, organizationId: Id<'organizations'>) {
  const caller = await getAuthCaller(ctx);
  if (!caller) throw new Error('Not authenticated');
  const requester = await ctx.db.get(caller._id);
  if (!requester) throw new Error('Requester not found');
  const userIsSuperadmin = isSuperadmin(requester);
  if (!userIsSuperadmin && requester.organizationId !== organizationId) {
    throw new Error('Access denied');
  }
  return {
    requester,
    requesterId: caller._id,
    isSuperadmin: userIsSuperadmin || requester.role === 'admin',
  };
}

interface QuizAnswerInput {
  userAnswer: string;
}

// ─── COURSES ─────────────────────────────────────────────────────────────────

export const listCourses = query({
  args: {
    organizationId: v.id('organizations'),
    category: v.optional(v.string()),
    difficulty: v.optional(v.string()),
    search: v.optional(v.string()),
    includeUnpublished: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { isSuperadmin } = await checkAccess(ctx, args.organizationId);

    let courses = await ctx.db
      .query('courses')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .take(MAX_PAGE_SIZE);

    if (!args.includeUnpublished || !isSuperadmin) {
      courses = courses.filter((c) => c.isPublished);
    }

    if (args.category) courses = courses.filter((c) => c.category === args.category);
    if (args.difficulty) courses = courses.filter((c) => c.difficulty === args.difficulty);
    if (args.search) {
      const lower = args.search.toLowerCase();
      courses = courses.filter(
        (c) =>
          c.title.toLowerCase().includes(lower) || c.description?.toLowerCase().includes(lower),
      );
    }

    const enriched = await Promise.all(
      courses.map(async (course) => {
        const lessons = await ctx.db
          .query('lessons')
          .withIndex('by_course', (q) =>
            q.eq('organizationId', args.organizationId).eq('courseId', course._id),
          )
          .take(DEFAULT_LIST_CAP);
        const creator = await ctx.db.get(course.createdBy);
        return { ...course, creatorName: creator?.name ?? 'Unknown', lessonCount: lessons.length };
      }),
    );

    return enriched;
  },
});

export const getCourse = query({
  args: {
    organizationId: v.id('organizations'),
    courseId: v.id('courses'),
  },
  handler: async (ctx, args) => {
    await checkAccess(ctx, args.organizationId);
    const course = await ctx.db.get(args.courseId);
    if (!course || course.organizationId !== args.organizationId) {
      throw new Error('Course not found');
    }
    return course;
  },
});

export const getCourseWithLessons = query({
  args: {
    organizationId: v.id('organizations'),
    courseId: v.id('courses'),
  },
  handler: async (ctx, args) => {
    await checkAccess(ctx, args.organizationId);
    const course = await ctx.db.get(args.courseId);
    if (!course || course.organizationId !== args.organizationId) {
      throw new Error('Course not found');
    }
    const lessons = await ctx.db
      .query('lessons')
      .withIndex('by_course', (q) =>
        q.eq('organizationId', args.organizationId).eq('courseId', course._id),
      )
      .order('asc')
      .take(DEFAULT_LIST_CAP);

    return { course, lessons };
  },
});

export const createCourse = mutation({
  args: {
    organizationId: v.id('organizations'),
    title: v.string(),
    description: v.optional(v.string()),
    category: v.string(),
    difficulty: v.union(v.literal('beginner'), v.literal('intermediate'), v.literal('advanced')),
    estimatedHours: v.optional(v.number()),
    thumbnailUrl: v.optional(v.string()),
    isMandatory: v.optional(v.boolean()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'learning');
    const { requesterId, isSuperadmin } = await checkAccess(ctx, args.organizationId);
    if (!isSuperadmin) throw new Error('Only admins can create courses');

    const now = Date.now();
    return await ctx.db.insert('courses', {
      organizationId: args.organizationId,
      title: args.title,
      description: args.description,
      category: args.category,
      difficulty: args.difficulty,
      estimatedHours: args.estimatedHours,
      thumbnailUrl: args.thumbnailUrl,
      createdBy: requesterId,
      isPublished: false,
      isMandatory: args.isMandatory ?? false,
      tags: args.tags ?? [],
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateCourse = mutation({
  args: {
    courseId: v.id('courses'),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    difficulty: v.optional(
      v.union(v.literal('beginner'), v.literal('intermediate'), v.literal('advanced')),
    ),
    estimatedHours: v.optional(v.number()),
    thumbnailUrl: v.optional(v.string()),
    isPublished: v.optional(v.boolean()),
    isMandatory: v.optional(v.boolean()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'learning');
    const course = await ctx.db.get(args.courseId);
    if (!course) throw new Error('Course not found');
    const { isSuperadmin } = await checkAccess(ctx, course.organizationId);
    if (!isSuperadmin) throw new Error('Only admins can update courses');

    const patch: Partial<Doc<'courses'>> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = args.title;
    if (args.description !== undefined) patch.description = args.description;
    if (args.category !== undefined) patch.category = args.category;
    if (args.difficulty !== undefined) patch.difficulty = args.difficulty;
    if (args.estimatedHours !== undefined) patch.estimatedHours = args.estimatedHours;
    if (args.thumbnailUrl !== undefined) patch.thumbnailUrl = args.thumbnailUrl;
    if (args.isPublished !== undefined) patch.isPublished = args.isPublished;
    if (args.isMandatory !== undefined) patch.isMandatory = args.isMandatory;
    if (args.tags !== undefined) patch.tags = args.tags;

    await ctx.db.patch(args.courseId, patch);
    return { success: true };
  },
});

export const deleteCourse = mutation({
  args: {
    courseId: v.id('courses'),
  },
  handler: async (ctx, args) => {
    const course = await ctx.db.get(args.courseId);
    if (!course) throw new Error('Course not found');
    await checkAccess(ctx, course.organizationId);

    const lessons = await ctx.db
      .query('lessons')
      .withIndex('by_course', (q) =>
        q.eq('organizationId', course.organizationId).eq('courseId', course._id),
      )
      .take(SMALL_LIST_CAP);
    for (const lesson of lessons) await ctx.db.delete(lesson._id);

    const enrollments = await ctx.db
      .query('enrollments')
      .withIndex('by_course', (q) =>
        q.eq('organizationId', course.organizationId).eq('courseId', course._id),
      )
      .take(DEFAULT_LIST_CAP);
    for (const enrollment of enrollments) await ctx.db.delete(enrollment._id);

    await ctx.db.delete(args.courseId);
    return { success: true };
  },
});

// ─── LESSONS ─────────────────────────────────────────────────────────────────

export const createLesson = mutation({
  args: {
    organizationId: v.id('organizations'),
    courseId: v.id('courses'),
    title: v.string(),
    description: v.optional(v.string()),
    order: v.number(),
    contentType: v.union(
      v.literal('video'),
      v.literal('text'),
      v.literal('quiz'),
      v.literal('mixed'),
    ),
    videoUrl: v.optional(v.string()),
    textContent: v.optional(v.string()),
    durationMinutes: v.optional(v.number()),
    isPreview: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { isSuperadmin } = await checkAccess(ctx, args.organizationId);
    if (!isSuperadmin) throw new Error('Only admins can create lessons');

    const now = Date.now();
    return await ctx.db.insert('lessons', {
      organizationId: args.organizationId,
      courseId: args.courseId,
      title: args.title,
      description: args.description,
      order: args.order,
      contentType: args.contentType,
      videoUrl: args.videoUrl,
      textContent: args.textContent,
      durationMinutes: args.durationMinutes,
      isPreview: args.isPreview ?? false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateLesson = mutation({
  args: {
    lessonId: v.id('lessons'),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    order: v.optional(v.number()),
    contentType: v.optional(
      v.union(v.literal('video'), v.literal('text'), v.literal('quiz'), v.literal('mixed')),
    ),
    videoUrl: v.optional(v.string()),
    textContent: v.optional(v.string()),
    durationMinutes: v.optional(v.number()),
    isPreview: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const lesson = await ctx.db.get(args.lessonId);
    if (!lesson) throw new Error('Lesson not found');
    await checkAccess(ctx, lesson.organizationId);

    const patch: Partial<Doc<'lessons'>> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = args.title;
    if (args.description !== undefined) patch.description = args.description;
    if (args.order !== undefined) patch.order = args.order;
    if (args.contentType !== undefined) patch.contentType = args.contentType;
    if (args.videoUrl !== undefined) patch.videoUrl = args.videoUrl;
    if (args.textContent !== undefined) patch.textContent = args.textContent;
    if (args.durationMinutes !== undefined) patch.durationMinutes = args.durationMinutes;
    if (args.isPreview !== undefined) patch.isPreview = args.isPreview;

    await ctx.db.patch(args.lessonId, patch);
    return { success: true };
  },
});

export const deleteLesson = mutation({
  args: {
    lessonId: v.id('lessons'),
  },
  handler: async (ctx, args) => {
    const lesson = await ctx.db.get(args.lessonId);
    if (!lesson) throw new Error('Lesson not found');
    await checkAccess(ctx, lesson.organizationId);

    const progress = await ctx.db
      .query('lessonProgress')
      .withIndex('by_user_course', (q) => q.eq('organizationId', lesson.organizationId))
      .filter((q) => q.eq(q.field('lessonId'), lesson._id))
      .take(DEFAULT_LIST_CAP);
    for (const p of progress) await ctx.db.delete(p._id);

    await ctx.db.delete(args.lessonId);
    return { success: true };
  },
});

// ─── ENROLLMENTS ─────────────────────────────────────────────────────────────

export const getMyEnrollments = query({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    const { requesterId } = await checkAccess(ctx, args.organizationId);
    const enrollments = await ctx.db
      .query('enrollments')
      .withIndex('by_user', (q) =>
        q.eq('organizationId', args.organizationId).eq('userId', requesterId),
      )
      .take(DEFAULT_LIST_CAP);

    const enriched = await Promise.all(
      enrollments.map(async (enrollment) => {
        const course = await ctx.db.get(enrollment.courseId);
        return { ...enrollment, courseTitle: course?.title ?? 'Unknown Course', course };
      }),
    );

    return enriched;
  },
});

export const getCourseEnrollments = query({
  args: {
    organizationId: v.id('organizations'),
    courseId: v.id('courses'),
  },
  handler: async (ctx, args) => {
    await checkAccess(ctx, args.organizationId);
    const enrollments = await ctx.db
      .query('enrollments')
      .withIndex('by_course', (q) =>
        q.eq('organizationId', args.organizationId).eq('courseId', args.courseId),
      )
      .take(DEFAULT_LIST_CAP);

    const enriched = await Promise.all(
      enrollments.map(async (enrollment) => {
        const user = await ctx.db.get(enrollment.userId);
        return { ...enrollment, userName: user?.name ?? 'Unknown', userEmail: user?.email };
      }),
    );

    return enriched;
  },
});

export const enrollInCourse = mutation({
  args: {
    organizationId: v.id('organizations'),
    courseId: v.id('courses'),
    enrolledBy: v.optional(v.id('users')),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'learning');
    const { requesterId } = await checkAccess(ctx, args.organizationId);

    const existing = await ctx.db
      .query('enrollments')
      .withIndex('by_user_course', (q) =>
        q
          .eq('organizationId', args.organizationId)
          .eq('userId', requesterId)
          .eq('courseId', args.courseId),
      )
      .first();

    if (existing) {
      if (existing.status === 'completed') {
        return { success: false, message: 'Course already completed' };
      }
      return { success: false, message: 'Already enrolled' };
    }

    const now = Date.now();
    await ctx.db.insert('enrollments', {
      organizationId: args.organizationId,
      userId: requesterId,
      courseId: args.courseId,
      status: 'not_started',
      progress: 0,
      enrolledBy: args.enrolledBy,
      createdAt: now,
      updatedAt: now,
    });

    return { success: true };
  },
});

export const bulkEnrollUsers = mutation({
  args: {
    organizationId: v.id('organizations'),
    courseId: v.id('courses'),
    userIds: v.array(v.id('users')),
  },
  handler: async (ctx, args) => {
    const { requesterId, isSuperadmin } = await checkAccess(ctx, args.organizationId);
    if (!isSuperadmin) throw new Error('Only admins can bulk enroll users');

    const now = Date.now();
    let enrolledCount = 0;

    for (const userId of args.userIds) {
      const existing = await ctx.db
        .query('enrollments')
        .withIndex('by_user_course', (q) =>
          q
            .eq('organizationId', args.organizationId)
            .eq('userId', userId)
            .eq('courseId', args.courseId),
        )
        .first();

      if (!existing) {
        await ctx.db.insert('enrollments', {
          organizationId: args.organizationId,
          userId,
          courseId: args.courseId,
          status: 'not_started',
          progress: 0,
          enrolledBy: requesterId,
          createdAt: now,
          updatedAt: now,
        });
        enrolledCount++;
      }
    }

    return { success: true, enrolledCount };
  },
});

export const updateEnrollmentStatus = mutation({
  args: {
    enrollmentId: v.id('enrollments'),
    status: v.union(
      v.literal('not_started'),
      v.literal('in_progress'),
      v.literal('completed'),
      v.literal('expired'),
    ),
    progress: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const enrollment = await ctx.db.get(args.enrollmentId);
    if (!enrollment) throw new Error('Enrollment not found');
    await checkAccess(ctx, enrollment.organizationId);

    const patch: Partial<Doc<'enrollments'>> = { status: args.status, updatedAt: Date.now() };
    if (args.progress !== undefined) patch.progress = args.progress;
    if (args.status === 'in_progress' && !enrollment.startedAt) patch.startedAt = Date.now();
    if (args.status === 'completed') {
      patch.completedAt = Date.now();
      patch.progress = 100;
    }

    await ctx.db.patch(args.enrollmentId, patch);
    return { success: true };
  },
});

// ─── LESSON PROGRESS ─────────────────────────────────────────────────────────

export const getLessonProgress = query({
  args: {
    organizationId: v.id('organizations'),
    lessonId: v.id('lessons'),
  },
  handler: async (ctx, args) => {
    const { requesterId } = await checkAccess(ctx, args.organizationId);
    return await ctx.db
      .query('lessonProgress')
      .withIndex('by_user_lesson', (q) =>
        q
          .eq('organizationId', args.organizationId)
          .eq('userId', requesterId)
          .eq('lessonId', args.lessonId),
      )
      .first();
  },
});

export const updateLessonProgress = mutation({
  args: {
    organizationId: v.id('organizations'),
    lessonId: v.id('lessons'),
    courseId: v.id('courses'),
    isCompleted: v.boolean(),
    timeSpentSeconds: v.optional(v.number()),
    lastPosition: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { requesterId } = await checkAccess(ctx, args.organizationId);

    const existing = await ctx.db
      .query('lessonProgress')
      .withIndex('by_user_lesson', (q) =>
        q
          .eq('organizationId', args.organizationId)
          .eq('userId', requesterId)
          .eq('lessonId', args.lessonId),
      )
      .first();

    const now = Date.now();
    if (existing) {
      const patch: Partial<Doc<'lessonProgress'>> = {
        isCompleted: args.isCompleted,
        updatedAt: now,
      };
      if (args.timeSpentSeconds !== undefined) {
        patch.timeSpentSeconds = (existing.timeSpentSeconds ?? 0) + args.timeSpentSeconds;
      }
      if (args.lastPosition !== undefined) patch.lastPosition = args.lastPosition;
      if (args.isCompleted && !existing.completedAt) patch.completedAt = now;
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert('lessonProgress', {
        organizationId: args.organizationId,
        userId: requesterId,
        lessonId: args.lessonId,
        courseId: args.courseId,
        isCompleted: args.isCompleted,
        timeSpentSeconds: args.timeSpentSeconds ?? 0,
        lastPosition: args.lastPosition,
        completedAt: args.isCompleted ? now : undefined,
        createdAt: now,
        updatedAt: now,
      });
    }

    // ─── Recalculate enrollment progress ───────────────────────────────────
    const allLessons = await ctx.db
      .query('lessons')
      .withIndex('by_course', (q) =>
        q.eq('organizationId', args.organizationId).eq('courseId', args.courseId),
      )
      .take(DEFAULT_LIST_CAP);

    const allLessonIds = new Set(allLessons.map((l) => l._id));

    const allProgress = await ctx.db
      .query('lessonProgress')
      .withIndex('by_user_course', (q) =>
        q.eq('organizationId', args.organizationId).eq('userId', requesterId),
      )
      .take(DEFAULT_LIST_CAP);

    const completedLessons = allProgress.filter(
      (p) => p.isCompleted && allLessonIds.has(p.lessonId),
    ).length;

    const totalLessons = allLessons.length;
    const progressPercent =
      totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

    // Update enrollment progress
    const enrollment = await ctx.db
      .query('enrollments')
      .withIndex('by_user_course', (q) =>
        q
          .eq('organizationId', args.organizationId)
          .eq('userId', requesterId)
          .eq('courseId', args.courseId),
      )
      .first();

    if (enrollment) {
      const enrollmentPatch: Partial<Doc<'enrollments'>> = {
        progress: progressPercent,
        updatedAt: now,
      };

      // Auto-transition status
      if (progressPercent > 0 && enrollment.status === 'not_started') {
        enrollmentPatch.status = 'in_progress';
        enrollmentPatch.startedAt = now;
      }

      // Auto-complete when all lessons done
      if (progressPercent === 100 && enrollment.status !== 'completed') {
        enrollmentPatch.status = 'completed';
        enrollmentPatch.completedAt = now;
      }

      await ctx.db.patch(enrollment._id, enrollmentPatch);

      // Auto-issue certificate on course completion
      if (progressPercent === 100 && enrollment.status !== 'completed') {
        const existingCert = await ctx.db
          .query('certificates')
          .withIndex('by_user_course', (q) =>
            q
              .eq('organizationId', args.organizationId)
              .eq('userId', requesterId)
              .eq('courseId', args.courseId),
          )
          .first();

        if (!existingCert) {
          const certId = `CERT-${args.organizationId}-${requesterId}-${args.courseId}-${now}`;
          await ctx.db.insert('certificates', {
            organizationId: args.organizationId,
            userId: requesterId,
            courseId: args.courseId,
            certificateId: certId,
            issuedAt: now,
            createdAt: now,
          });
        }
      }
    }

    return { success: true, progress: progressPercent };
  },
});

// ─── QUIZZES ─────────────────────────────────────────────────────────────────

export const getQuiz = query({
  args: {
    organizationId: v.id('organizations'),
    quizId: v.id('quizzes'),
  },
  handler: async (ctx, args) => {
    await checkAccess(ctx, args.organizationId);
    const quiz = await ctx.db.get(args.quizId);
    if (!quiz || quiz.organizationId !== args.organizationId) {
      throw new Error('Quiz not found');
    }

    const questions = await ctx.db
      .query('quizQuestions')
      .withIndex('by_quiz', (q) =>
        q.eq('organizationId', args.organizationId).eq('quizId', quiz._id),
      )
      .order('asc')
      .take(DEFAULT_LIST_CAP);

    return { quiz, questions };
  },
});

export const getQuizByLesson = query({
  args: {
    organizationId: v.id('organizations'),
    lessonId: v.id('lessons'),
  },
  handler: async (ctx, args) => {
    await checkAccess(ctx, args.organizationId);

    const quiz = await ctx.db
      .query('quizzes')
      .withIndex('by_lesson', (q) =>
        q.eq('organizationId', args.organizationId).eq('lessonId', args.lessonId),
      )
      .first();

    if (!quiz) return null;

    const questions = await ctx.db
      .query('quizQuestions')
      .withIndex('by_quiz', (q) =>
        q.eq('organizationId', args.organizationId).eq('quizId', quiz._id),
      )
      .order('asc')
      .take(DEFAULT_LIST_CAP);

    return { quiz, questions };
  },
});

export const getQuizAttemptsForUser = query({
  args: {
    organizationId: v.id('organizations'),
    quizId: v.id('quizzes'),
  },
  handler: async (ctx, args) => {
    const { requesterId } = await checkAccess(ctx, args.organizationId);

    return await ctx.db
      .query('quizAttempts')
      .withIndex('by_user_quiz', (q) =>
        q
          .eq('organizationId', args.organizationId)
          .eq('userId', requesterId)
          .eq('quizId', args.quizId),
      )
      .order('desc')
      .take(DEFAULT_LIST_CAP);
  },
});

export const createQuiz = mutation({
  args: {
    organizationId: v.id('organizations'),
    courseId: v.optional(v.id('courses')),
    lessonId: v.optional(v.id('lessons')),
    title: v.string(),
    description: v.optional(v.string()),
    passingScore: v.number(),
    timeLimitMinutes: v.optional(v.number()),
    maxAttempts: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { isSuperadmin } = await checkAccess(ctx, args.organizationId);
    if (!isSuperadmin) throw new Error('Only admins can create quizzes');

    const now = Date.now();
    return await ctx.db.insert('quizzes', {
      organizationId: args.organizationId,
      courseId: args.courseId,
      lessonId: args.lessonId,
      title: args.title,
      description: args.description,
      passingScore: args.passingScore,
      timeLimitMinutes: args.timeLimitMinutes,
      maxAttempts: args.maxAttempts,
      isPublished: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const createQuizQuestion = mutation({
  args: {
    organizationId: v.id('organizations'),
    quizId: v.id('quizzes'),
    questionText: v.string(),
    questionType: v.union(
      v.literal('multiple_choice'),
      v.literal('true_false'),
      v.literal('short_answer'),
    ),
    options: v.optional(v.array(v.string())),
    correctAnswer: v.string(),
    points: v.optional(v.number()),
    explanation: v.optional(v.string()),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    const { isSuperadmin } = await checkAccess(ctx, args.organizationId);
    if (!isSuperadmin) throw new Error('Only admins can create quiz questions');

    const now = Date.now();
    return await ctx.db.insert('quizQuestions', {
      organizationId: args.organizationId,
      quizId: args.quizId,
      questionText: args.questionText,
      questionType: args.questionType,
      options: args.options,
      correctAnswer: args.correctAnswer,
      points: args.points ?? 1,
      explanation: args.explanation,
      order: args.order,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const submitQuizAttempt = mutation({
  args: {
    organizationId: v.id('organizations'),
    quizId: v.id('quizzes'),
    answers: v.any(),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'learning');
    const { requesterId } = await checkAccess(ctx, args.organizationId);

    const quiz = await ctx.db.get(args.quizId);
    if (!quiz) throw new Error('Quiz not found');

    const questions = await ctx.db
      .query('quizQuestions')
      .withIndex('by_quiz', (q) =>
        q.eq('organizationId', args.organizationId).eq('quizId', quiz._id),
      )
      .take(SMALL_LIST_CAP);

    if (questions.length === 0) throw new Error('Quiz has no questions');

    const totalPoints = questions.reduce((sum, q) => sum + (q.points ?? 1), 0);
    let earnedPoints = 0;

    const answers = args.answers as QuizAnswerInput[];
    const answerResults = answers.map((answer, idx) => {
      const question = questions[idx];
      if (!question) return { questionId: null, userAnswer: answer.userAnswer, isCorrect: false };
      const isCorrect = answer.userAnswer === question.correctAnswer;
      if (isCorrect) earnedPoints += question.points ?? 1;
      return {
        questionId: question._id,
        userAnswer: answer.userAnswer,
        isCorrect,
      };
    });

    const score = Math.round((earnedPoints / totalPoints) * 100);
    const passed = score >= quiz.passingScore;

    const attemptCount = await ctx.db
      .query('quizAttempts')
      .withIndex('by_user_quiz', (q) =>
        q
          .eq('organizationId', args.organizationId)
          .eq('userId', requesterId)
          .eq('quizId', quiz._id),
      )
      .take(SMALL_LIST_CAP);

    const attemptNumber = attemptCount.length + 1;

    if (quiz.maxAttempts && attemptNumber > quiz.maxAttempts) {
      throw new Error(`Maximum attempts (${quiz.maxAttempts}) exceeded`);
    }

    const now = Date.now();
    await ctx.db.insert('quizAttempts', {
      organizationId: args.organizationId,
      userId: requesterId,
      quizId: quiz._id,
      score,
      passed,
      answers: answerResults,
      startedAt: now,
      completedAt: now,
      attemptNumber,
      createdAt: now,
    });

    return { success: true, score, passed, attemptNumber };
  },
});

// ─── CERTIFICATES ────────────────────────────────────────────────────────────

export const getMyCertificates = query({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    const { requesterId } = await checkAccess(ctx, args.organizationId);
    const certificates = await ctx.db
      .query('certificates')
      .withIndex('by_user', (q) =>
        q.eq('organizationId', args.organizationId).eq('userId', requesterId),
      )
      .take(DEFAULT_LIST_CAP);

    const enriched = await Promise.all(
      certificates.map(async (cert) => {
        const course = await ctx.db.get(cert.courseId);
        return { ...cert, courseTitle: course?.title ?? 'Unknown Course' };
      }),
    );

    return enriched;
  },
});

export const getOrgCertificates = query({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    const { isSuperadmin } = await checkAccess(ctx, args.organizationId);
    if (!isSuperadmin) throw new Error('Only admins can view org certificates');

    const certificates = await ctx.db
      .query('certificates')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .take(DEFAULT_LIST_CAP);

    return certificates;
  },
});

export const issueCertificate = mutation({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
    courseId: v.id('courses'),
    templateId: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'learning');
    const { isSuperadmin } = await checkAccess(ctx, args.organizationId);
    if (!isSuperadmin) throw new Error('Only admins can issue certificates');

    const existing = await ctx.db
      .query('certificates')
      .withIndex('by_user_course', (q) =>
        q
          .eq('organizationId', args.organizationId)
          .eq('userId', args.userId)
          .eq('courseId', args.courseId),
      )
      .first();

    if (existing) {
      return { success: false, message: 'Certificate already issued for this course' };
    }

    const certificateId = `CERT-${args.organizationId}-${args.userId}-${args.courseId}-${Date.now()}`;
    const now = Date.now();

    await ctx.db.insert('certificates', {
      organizationId: args.organizationId,
      userId: args.userId,
      courseId: args.courseId,
      certificateId,
      templateId: args.templateId,
      issuedAt: now,
      expiresAt: args.expiresAt,
      metadata: args.metadata as Record<string, unknown> | undefined,
      createdAt: now,
    });

    return { success: true, certificateId };
  },
});

// ─── COURSE CATEGORIES ───────────────────────────────────────────────────────

export const getCourseCategories = query({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    await checkAccess(ctx, args.organizationId);
    return await ctx.db
      .query('courseCategories')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .order('asc')
      .take(DEFAULT_LIST_CAP);
  },
});

export const createCourseCategory = mutation({
  args: {
    organizationId: v.id('organizations'),
    name: v.string(),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { isSuperadmin } = await checkAccess(ctx, args.organizationId);
    if (!isSuperadmin) throw new Error('Only admins can create categories');

    const now = Date.now();
    return await ctx.db.insert('courseCategories', {
      organizationId: args.organizationId,
      name: args.name,
      description: args.description,
      icon: args.icon,
      color: args.color,
      order: args.order ?? 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// ─── TEAM/ADMIN LEARNING OVERVIEW ────────────────────────────────────────────

export const getTeamLearningOverview = query({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    const { isSuperadmin } = await checkAccess(ctx, args.organizationId);
    if (!isSuperadmin) throw new Error('Only admins can view team overview');

    const enrollments = await ctx.db
      .query('enrollments')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .take(DEFAULT_LIST_CAP);

    const courses = await ctx.db
      .query('courses')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .take(DEFAULT_LIST_CAP);

    const totalEnrollments = enrollments.length;
    const completedEnrollments = enrollments.filter((e) => e.status === 'completed').length;
    const inProgressEnrollments = enrollments.filter((e) => e.status === 'in_progress').length;
    const totalCourses = courses.length;
    const mandatoryCourses = courses.filter((c) => c.isMandatory).length;

    const completionRate =
      totalEnrollments > 0 ? Math.round((completedEnrollments / totalEnrollments) * 100) : 0;

    return {
      totalEnrollments,
      completedEnrollments,
      inProgressEnrollments,
      totalCourses,
      mandatoryCourses,
      completionRate,
    };
  },
});

// ─── ENROLLMENT DETAILS (for stat card drills) ──────────────────────────────

/** Detailed enrollment list for a stat card drill-down. */
export const getEnrollmentDetails = query({
  args: {
    organizationId: v.id('organizations'),
    filter: v.union(
      v.literal('all'),
      v.literal('completed'),
      v.literal('in_progress'),
      v.literal('not_started'),
      v.literal('mandatory'),
    ),
  },
  handler: async (ctx, args) => {
    const { isSuperadmin } = await checkAccess(ctx, args.organizationId);
    if (!isSuperadmin) throw new Error('Only admins can view enrollment details');

    let enrollments = await ctx.db
      .query('enrollments')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .take(DEFAULT_LIST_CAP);

    if (args.filter === 'completed') {
      enrollments = enrollments.filter((e) => e.status === 'completed');
    } else if (args.filter === 'in_progress') {
      enrollments = enrollments.filter((e) => e.status === 'in_progress');
    } else if (args.filter === 'not_started') {
      enrollments = enrollments.filter((e) => e.status === 'not_started');
    } else if (args.filter === 'mandatory') {
      const mandatoryCourseIds = (
        await ctx.db
          .query('courses')
          .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
          .take(DEFAULT_LIST_CAP)
      )
        .filter((c) => c.isMandatory)
        .map((c) => c._id);
      enrollments = enrollments.filter((e) => mandatoryCourseIds.includes(e.courseId));
    }

    const enriched = await Promise.all(
      enrollments.map(async (enrollment) => {
        const user = await ctx.db.get(enrollment.userId);
        const course = await ctx.db.get(enrollment.courseId);
        return {
          _id: enrollment._id,
          userId: enrollment.userId,
          courseId: enrollment.courseId,
          userName: user?.name ?? 'Unknown',
          userEmail: user?.email ?? '',
          userDepartment: user?.department,
          courseTitle: course?.title ?? 'Unknown',
          courseIsMandatory: course?.isMandatory ?? false,
          status: enrollment.status,
          progress: enrollment.progress ?? 0,
          enrolledAt: enrollment.createdAt,
          startedAt: enrollment.startedAt,
          completedAt: enrollment.completedAt,
        };
      }),
    );

    return enriched;
  },
});

/** Course list with enrollment counts. */
export const getCoursesWithCounts = query({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    const { isSuperadmin } = await checkAccess(ctx, args.organizationId);
    if (!isSuperadmin) throw new Error('Only admins can view course details');

    const courses = await ctx.db
      .query('courses')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .take(DEFAULT_LIST_CAP);

    const allEnrollments = await ctx.db
      .query('enrollments')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .take(DEFAULT_LIST_CAP);

    return courses.map((course) => {
      const courseEnrollments = allEnrollments.filter((e) => e.courseId === course._id);
      return {
        _id: course._id,
        title: course.title,
        category: course.category,
        isMandatory: course.isMandatory,
        isPublished: course.isPublished,
        enrollmentCount: courseEnrollments.length,
        completedCount: courseEnrollments.filter((e) => e.status === 'completed').length,
        inProgressCount: courseEnrollments.filter((e) => e.status === 'in_progress').length,
      };
    });
  },
});
