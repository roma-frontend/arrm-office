'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/useAuthStore';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BookOpen, GraduationCap, Award, BarChart3, Plus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { CourseCatalog } from './CourseCatalog';
import { MyCourses } from './MyCourses';
import { CourseDetailDialog } from './CourseDetailDialog';
import { LessonPlayerDialog } from './LessonPlayerDialog';
import { LessonFormDialog } from './LessonFormDialog';
import { CreateCourseDialog } from './CreateCourseDialog';
import { TeamOverview } from './TeamOverview';
import { CertificatesTab } from './CertificatesTab';

type CourseWithLessons = {
  _id: Id<'courses'>;
  _creationTime: number;
  organizationId: Id<'organizations'>;
  title: string;
  description?: string;
  category: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedHours?: number;
  thumbnailUrl?: string;
  createdBy: Id<'users'>;
  isPublished?: boolean;
  isMandatory?: boolean;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
  creatorName: string;
  lessonCount: number;
};

type EnrollmentWithCourse = {
  _id: Id<'enrollments'>;
  _creationTime: number;
  organizationId: Id<'organizations'>;
  userId: Id<'users'>;
  courseId: Id<'courses'>;
  status: 'not_started' | 'in_progress' | 'completed' | 'expired';
  progress?: number;
  enrolledBy?: Id<'users'>;
  startedAt?: number;
  completedAt?: number;
  expiresAt?: number;
  createdAt: number;
  updatedAt: number;
  courseTitle: string;
  course?:
    | (Omit<CourseWithLessons, 'creatorName' | 'lessonCount'> & {
        creatorName?: string;
        lessonCount?: number;
      })
    | null;
};

type Lesson = {
  _id: Id<'lessons'>;
  _creationTime: number;
  courseId: Id<'courses'>;
  title: string;
  description?: string;
  order: number;
  contentType: 'video' | 'text' | 'quiz' | 'mixed';
  videoUrl?: string;
  textContent?: string;
  durationMinutes?: number;
  isPreview?: boolean;
};

type CourseWithLessonsDetail = CourseWithLessons & {
  lessons: Lesson[];
};

export default function LearningClient() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const selectedOrgId = useSelectedOrganization();
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  const effectiveOrgId = selectedOrgId ?? user?.organizationId;

  const [activeTab, setActiveTab] = useState('catalog');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [difficultyFilter, setDifficultyFilter] = useState('all');
  const [selectedCourse, setSelectedCourse] = useState<CourseWithLessons | null>(null);
  const [showCourseDetail, setShowCourseDetail] = useState(false);
  const [showCreateCourse, setShowCreateCourse] = useState(false);
  const [courseForm, setCourseForm] = useState({
    title: '',
    description: '',
    category: '',
    difficulty: 'beginner' as 'beginner' | 'intermediate' | 'advanced',
    estimatedHours: '',
    isMandatory: false,
    tags: '',
  });

  // Lesson player state
  const [showLessonPlayer, setShowLessonPlayer] = useState(false);
  const [activeLessonIndex, setActiveLessonIndex] = useState(0);
  const [courseLessons, setCourseLessons] = useState<Lesson[]>([]);
  const [lessonProgress, setLessonProgress] = useState<Record<string, boolean>>({});
  const [startTime, setStartTime] = useState<number>(0);

  // Quiz state
  const [showQuiz, setShowQuiz] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizResult, setQuizResult] = useState<any>(null);
  const [quizStartTime, setQuizStartTime] = useState<number>(0);

  // Lesson management state
  const [showCreateLesson, setShowCreateLesson] = useState(false);
  const [showEditLesson, setShowEditLesson] = useState(false);
  const [editingLesson, setEditingLesson] = useState<any>(null);
  const [lessonForm, setLessonForm] = useState({
    title: '',
    description: '',
    contentType: 'text' as 'video' | 'text' | 'quiz' | 'mixed',
    videoUrl: '',
    textContent: '',
    durationMinutes: '',
    isPreview: false,
  });

  // Fetch data
  const courses = useQuery(
    api.learning.listCourses,
    effectiveOrgId && user?.id
      ? {
          organizationId: effectiveOrgId as Id<'organizations'>,
          includeUnpublished: isAdmin,
        }
      : 'skip',
  );

  const myEnrollments = useQuery(
    api.learning.getMyEnrollments,
    effectiveOrgId && user?.id
      ? {
          organizationId: effectiveOrgId as Id<'organizations'>,
        }
      : 'skip',
  );

  const teamOverview = useQuery(
    api.learning.getTeamLearningOverview,
    effectiveOrgId && user?.id && isAdmin
      ? {
          organizationId: effectiveOrgId as Id<'organizations'>,
        }
      : 'skip',
  );

  // Fetch lessons when course detail is open
  const courseWithLessons = useQuery(
    api.learning.getCourseWithLessons,
    showCourseDetail && selectedCourse && effectiveOrgId && user?.id
      ? {
          organizationId: effectiveOrgId as Id<'organizations'>,
          courseId: selectedCourse._id,
        }
      : 'skip',
  );

  // Fetch lesson progress for the active lesson in the player
  const activeLessonProgress = useQuery(
    api.learning.getLessonProgress,
    showLessonPlayer && courseLessons.length > 0 && effectiveOrgId && user?.id
      ? {
          organizationId: effectiveOrgId as Id<'organizations'>,
          lessonId: courseLessons[activeLessonIndex]?._id as Id<'lessons'>,
        }
      : 'skip',
  );

  // Mutations
  const enrollMutation = useMutation(api.learning.enrollInCourse);
  const createCourseMutation = useMutation(api.learning.createCourse);
  const updateLessonProgressMutation = useMutation(api.learning.updateLessonProgress);
  const createLessonMutation = useMutation(api.learning.createLesson);
  const updateLessonMutation = useMutation(api.learning.updateLesson);
  const deleteLessonMutation = useMutation(api.learning.deleteLesson);
  const updateCourseMutation = useMutation(api.learning.updateCourse);
  const submitQuizAttemptMutation = useMutation(api.learning.submitQuizAttempt);

  // Fetch quiz data when viewing a quiz lesson
  const currentLesson = courseLessons[activeLessonIndex];
  const quizDataResult = useQuery(
    api.learning.getQuizByLesson,
    showLessonPlayer &&
      currentLesson &&
      currentLesson?.contentType === 'quiz' &&
      effectiveOrgId &&
      user?.id
      ? {
          organizationId: effectiveOrgId as Id<'organizations'>,
          lessonId: currentLesson._id as Id<'lessons'>,
        }
      : 'skip',
  );

  // Fetch certificates
  const myCertificates = useQuery(
    api.learning.getMyCertificates,
    effectiveOrgId && user?.id
      ? {
          organizationId: effectiveOrgId as Id<'organizations'>,
        }
      : 'skip',
  );

  const handleEnroll = async (courseId: Id<'courses'>) => {
    if (!effectiveOrgId || !user?.id) return;

    try {
      const result = await enrollMutation({
        organizationId: effectiveOrgId as Id<'organizations'>,
        courseId,
      });

      if (result.success) {
        toast.success(t('learning.enrollSuccess', 'Successfully enrolled in course'));
      } else {
        toast.info(result.message || t('learning.alreadyEnrolled', 'Already enrolled'));
      }
    } catch {
      toast.error(t('learning.enrollError', 'Failed to enroll in course'));
    }
  };

  const handleCreateCourse = async () => {
    if (!effectiveOrgId || !user?.id) return;
    if (!courseForm.title.trim()) {
      toast.error(t('errors.required', 'Title is required'));
      return;
    }
    if (!courseForm.category.trim()) {
      toast.error(t('errors.required', 'Category is required'));
      return;
    }

    try {
      await createCourseMutation({
        organizationId: effectiveOrgId as Id<'organizations'>,
        title: courseForm.title.trim(),
        description: courseForm.description.trim() || undefined,
        category: courseForm.category.trim(),
        difficulty: courseForm.difficulty,
        estimatedHours: courseForm.estimatedHours
          ? parseInt(courseForm.estimatedHours, 10)
          : undefined,
        isMandatory: courseForm.isMandatory,
        tags: courseForm.tags
          ? courseForm.tags
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean)
          : undefined,
      });

      toast.success(t('learning.courseCreated', 'Course created successfully'));
      setShowCreateCourse(false);
      setCourseForm({
        title: '',
        description: '',
        category: '',
        difficulty: 'beginner',
        estimatedHours: '',
        isMandatory: false,
        tags: '',
      });
    } catch {
      toast.error(t('learning.courseCreateError', 'Failed to create course'));
    }
  };

  const openLessonPlayer = async (
    course: CourseWithLessons,
    lessons: Lesson[],
    lessonIndex: number = 0,
  ) => {
    if (!effectiveOrgId || !user?.id) return;

    setCourseLessons(lessons);
    setActiveLessonIndex(lessonIndex);
    setShowLessonPlayer(true);
    setStartTime(Date.now());

    const progressMap: Record<string, boolean> = {};
    for (const lesson of lessons) {
      progressMap[lesson._id] = false;
    }
    setLessonProgress(progressMap);
  };

  const handleCompleteLesson = async () => {
    if (!effectiveOrgId || !user?.id || courseLessons.length === 0) return;

    const currentLessonData = courseLessons[activeLessonIndex];
    if (!currentLessonData) return;

    const timeSpent = Math.floor((Date.now() - startTime) / 1000);

    try {
      await updateLessonProgressMutation({
        organizationId: effectiveOrgId as Id<'organizations'>,
        lessonId: currentLessonData._id as Id<'lessons'>,
        courseId: currentLessonData.courseId as Id<'courses'>,
        isCompleted: true,
        timeSpentSeconds: timeSpent,
        lastPosition: 0,
      });

      setLessonProgress((prev) => ({
        ...prev,
        [currentLessonData._id]: true,
      }));

      toast.success(t('learning.lessonCompleted', 'Lesson completed!'));

      if (activeLessonIndex < courseLessons.length - 1) {
        setActiveLessonIndex((prev) => prev + 1);
        setStartTime(Date.now());
      } else {
        setShowLessonPlayer(false);
        toast.success(t('learning.courseCompleted', 'Course completed!'));
      }
    } catch {
      toast.error(t('learning.lessonCompleteError', 'Failed to complete lesson'));
    }
  };

  const handleNextLesson = () => {
    if (activeLessonIndex < courseLessons.length - 1) {
      setActiveLessonIndex((prev) => prev + 1);
      setStartTime(Date.now());
    }
  };

  const handlePrevLesson = () => {
    if (activeLessonIndex > 0) {
      setActiveLessonIndex((prev) => prev - 1);
      setStartTime(Date.now());
    }
  };

  const resetLessonForm = () => {
    setLessonForm({
      title: '',
      description: '',
      contentType: 'text',
      videoUrl: '',
      textContent: '',
      durationMinutes: '',
      isPreview: false,
    });
  };

  const handleCreateLesson = async () => {
    if (!effectiveOrgId || !user?.id || !selectedCourse) return;
    if (!lessonForm.title.trim()) {
      toast.error(t('errors.required', 'Title is required'));
      return;
    }

    try {
      await createLessonMutation({
        organizationId: effectiveOrgId as Id<'organizations'>,
        courseId: selectedCourse._id,
        title: lessonForm.title.trim(),
        description: lessonForm.description.trim() || undefined,
        order: courseLessons.length,
        contentType: lessonForm.contentType,
        videoUrl: lessonForm.videoUrl.trim() || undefined,
        textContent: lessonForm.textContent.trim() || undefined,
        durationMinutes: lessonForm.durationMinutes
          ? parseInt(lessonForm.durationMinutes, 10)
          : undefined,
        isPreview: lessonForm.isPreview,
      });

      toast.success(t('learning.lessonCreated', 'Lesson created successfully'));
      setShowCreateLesson(false);
      resetLessonForm();
    } catch {
      toast.error(t('learning.lessonCreateError', 'Failed to create lesson'));
    }
  };

  const handleEditLesson = async () => {
    if (!editingLesson) return;
    if (!lessonForm.title.trim()) {
      toast.error(t('errors.required', 'Title is required'));
      return;
    }

    try {
      await updateLessonMutation({
        lessonId: editingLesson._id,
        title: lessonForm.title.trim(),
        description: lessonForm.description.trim() || undefined,
        contentType: lessonForm.contentType,
        videoUrl: lessonForm.videoUrl.trim() || undefined,
        textContent: lessonForm.textContent.trim() || undefined,
        durationMinutes: lessonForm.durationMinutes
          ? parseInt(lessonForm.durationMinutes, 10)
          : undefined,
        isPreview: lessonForm.isPreview,
      });

      toast.success(t('learning.lessonUpdated', 'Lesson updated successfully'));
      setShowEditLesson(false);
      setEditingLesson(null);
      resetLessonForm();
    } catch {
      toast.error(t('learning.lessonUpdateError', 'Failed to update lesson'));
    }
  };

  const handleDeleteLesson = async (lessonId: Id<'lessons'>) => {
    if (!user?.id) return;

    try {
      await deleteLessonMutation({
        lessonId,
      });

      toast.success(t('learning.lessonDeleted', 'Lesson deleted successfully'));
    } catch {
      toast.error(t('learning.lessonDeleteError', 'Failed to delete lesson'));
    }
  };

  const handlePublishCourse = async () => {
    if (!selectedCourse || !user?.id) return;
    if (!courseWithLessons?.lessons || courseWithLessons.lessons.length === 0) {
      toast.error(t('learning.noLessonsToPublish', 'Add at least one lesson before publishing'));
      return;
    }

    try {
      await updateCourseMutation({
        courseId: selectedCourse._id,
        isPublished: true,
      });

      toast.success(t('learning.coursePublished', 'Course published successfully'));
      setShowCourseDetail(false);
    } catch {
      toast.error(t('learning.coursePublishError', 'Failed to publish course'));
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const openEditLessonDialog = (lesson: any) => {
    setEditingLesson(lesson);
    setLessonForm({
      title: lesson.title || '',
      description: lesson.description || '',
      contentType: lesson.contentType || 'text',
      videoUrl: lesson.videoUrl || '',
      textContent: lesson.textContent || '',
      durationMinutes: lesson.durationMinutes?.toString() || '',
      isPreview: lesson.isPreview || false,
    });
    setShowEditLesson(true);
  };

  const handleStartQuiz = () => {
    if (!quizDataResult) return;
    setShowQuiz(true);
    setCurrentQuestionIndex(0);
    setUserAnswers({});
    setQuizSubmitted(false);
    setQuizResult(null);
    setQuizStartTime(Date.now());
  };

  const handleAnswerChange = (questionId: string, answer: string) => {
    setUserAnswers((prev) => ({ ...prev, [questionId]: answer }));
  };

  const handleSubmitQuiz = async () => {
    if (!quizDataResult || !effectiveOrgId || !user?.id) return;

    const answers = quizDataResult.questions.map((q) => ({
      questionId: q._id,
      userAnswer: userAnswers[q._id] || '',
    }));

    try {
      const result = await submitQuizAttemptMutation({
        organizationId: effectiveOrgId as Id<'organizations'>,
        quizId: quizDataResult.quiz._id,
        answers,
      });

      setQuizSubmitted(true);
      setQuizResult(result);

      if (result.passed) {
        toast.success(t('learning.quizPassed', 'Congratulations! You passed the quiz'));
        if (currentLesson) {
          await updateLessonProgressMutation({
            organizationId: effectiveOrgId as Id<'organizations'>,
            lessonId: currentLesson._id as Id<'lessons'>,
            courseId: currentLesson.courseId as Id<'courses'>,
            isCompleted: true,
            timeSpentSeconds: Math.floor((Date.now() - quizStartTime) / 1000),
            lastPosition: 0,
          });
          setLessonProgress((prev) => ({
            ...prev,
            [currentLesson._id]: true,
          }));
        }
      } else {
        toast.info(t('learning.quizFailed', 'You did not pass the quiz. Try again.'));
      }
    } catch {
      toast.error(t('learning.quizSubmitError', 'Failed to submit quiz'));
    }
  };

  const isEnrolled = (courseId: Id<'courses'>) => {
    return myEnrollments?.some((e) => e.courseId === courseId);
  };

  // Loading state
  if (courses === undefined) {
    return (
      <div className="flex items-center justify-center h-96">
        <ShieldLoader message={t('learning.loading', 'Loading courses...')} />
      </div>
    );
  }

  return (
    <div className="mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-(--text-primary)">
              {t('learning.title', 'Learning Center')}
            </h2>
            <p className="text-(--text-muted) text-sm mt-1">
              {t('learning.subtitle', 'Develop your skills and grow your career')}
            </p>
          </div>
          {isAdmin && (
            <Button onClick={() => setShowCreateCourse(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('learning.createCourse', 'Create Course')}
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      {isAdmin && teamOverview && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <BookOpen className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{teamOverview.totalCourses}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('learning.totalCourses', 'Total Courses')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{teamOverview.totalEnrollments}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('learning.totalEnrollments', 'Total Enrollments')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <BarChart3 className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{teamOverview.completionRate}%</p>
                  <p className="text-sm text-muted-foreground">
                    {t('learning.completionRate', 'Completion Rate')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Award className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{teamOverview.mandatoryCourses}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('learning.mandatoryCourses', 'Mandatory Courses')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList
          className={`w-full mb-4 gap-2 bg-transparent p-0 h-auto ${isAdmin ? 'grid grid-cols-2 md:grid-cols-4' : 'grid grid-cols-2 md:grid-cols-3'}`}
        >
          <TabsTrigger
            value="catalog"
            className="w-full px-4 py-2.5 rounded-xl data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center gap-2"
          >
            <BookOpen className="h-4 w-4" />
            {t('learning.courseCatalog', 'Course Catalog')}
          </TabsTrigger>
          <TabsTrigger
            value="my-courses"
            className="w-full px-4 py-2.5 rounded-xl data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center gap-2"
          >
            <GraduationCap className="h-4 w-4" />
            {t('learning.myCourses', 'My Courses')}
          </TabsTrigger>
          <TabsTrigger
            value="certificates"
            className="w-full px-4 py-2.5 rounded-xl data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center gap-2"
          >
            <Award className="h-4 w-4" />
            {t('learning.certificates', 'Certificates')}
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger
              value="team"
              className="w-full px-4 py-2.5 rounded-xl data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center gap-2"
            >
              <BarChart3 className="h-4 w-4" />
              {t('learning.teamOverview', 'Team Overview')}
            </TabsTrigger>
          )}
        </TabsList>

        {/* Course Catalog Tab */}
        <TabsContent value="catalog" className="space-y-6">
          <CourseCatalog
            courses={courses}
            myEnrollments={myEnrollments}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            difficultyFilter={difficultyFilter}
            setDifficultyFilter={setDifficultyFilter}
            onEnroll={handleEnroll}
            onSelectCourse={(course) => {
              setSelectedCourse(course);
              setShowCourseDetail(true);
            }}
          />
        </TabsContent>

        {/* My Courses Tab */}
        <TabsContent value="my-courses" className="space-y-6">
          <MyCourses
            myEnrollments={myEnrollments}
            onOpenCourse={(course) => {
              setSelectedCourse(course as CourseWithLessons | null);
              setShowCourseDetail(true);
            }}
            onGoToCatalog={() => setActiveTab('catalog')}
          />
        </TabsContent>

        {/* Team Overview Tab (Admin Only) */}
        {isAdmin && (
          <TabsContent value="team" className="space-y-6">
            <TeamOverview teamOverview={teamOverview} />
          </TabsContent>
        )}

        {/* Certificates Tab */}
        <TabsContent value="certificates" className="space-y-6">
          <CertificatesTab certificates={myCertificates} />
        </TabsContent>
      </Tabs>

      {/* Course Detail Dialog */}
      <CourseDetailDialog
        open={showCourseDetail}
        onOpenChange={setShowCourseDetail}
        course={selectedCourse}
        courseWithLessons={courseWithLessons as CourseWithLessonsDetail | undefined}
        isAdmin={isAdmin}
        isEnrolled={selectedCourse ? !!isEnrolled(selectedCourse._id) : false}
        onEnroll={handleEnroll}
        onPublishCourse={handlePublishCourse}
        onOpenLessonPlayer={openLessonPlayer}
        onOpenCreateLesson={() => {
          resetLessonForm();
          setShowCreateLesson(true);
        }}
        onOpenEditLesson={openEditLessonDialog}
        onDeleteLesson={handleDeleteLesson}
      />

      {/* Lesson Player Dialog */}
      <LessonPlayerDialog
        open={showLessonPlayer}
        onOpenChange={setShowLessonPlayer}
        lessons={courseLessons}
        activeLessonIndex={activeLessonIndex}
        setActiveLessonIndex={setActiveLessonIndex}
        lessonProgress={lessonProgress}
        onCompleteLesson={handleCompleteLesson}
        onNextLesson={handleNextLesson}
        onPrevLesson={handlePrevLesson}
        quizData={quizDataResult}
        showQuiz={showQuiz}
        setShowQuiz={setShowQuiz}
        quizSubmitted={quizSubmitted}
        setQuizSubmitted={setQuizSubmitted}
        quizResult={quizResult}
        onSubmitQuiz={handleSubmitQuiz}
        onAnswerChange={handleAnswerChange}
        userAnswers={userAnswers}
        onRetryQuiz={handleStartQuiz}
        onBackToLesson={() => {
          setShowQuiz(false);
          setQuizSubmitted(false);
          setQuizResult(null);
        }}
      />

      {/* Create Lesson Dialog */}
      <LessonFormDialog
        open={showCreateLesson}
        onOpenChange={setShowCreateLesson}
        form={lessonForm}
        setForm={setLessonForm}
        isEdit={false}
        onSubmit={handleCreateLesson}
        onCancel={() => {
          setShowCreateLesson(false);
          resetLessonForm();
        }}
      />

      {/* Edit Lesson Dialog */}
      <LessonFormDialog
        open={showEditLesson}
        onOpenChange={setShowEditLesson}
        form={lessonForm}
        setForm={setLessonForm}
        isEdit={true}
        onSubmit={handleEditLesson}
        onCancel={() => {
          setShowEditLesson(false);
          setEditingLesson(null);
          resetLessonForm();
        }}
      />

      {/* Create Course Dialog */}
      <CreateCourseDialog
        open={showCreateCourse}
        onOpenChange={setShowCreateCourse}
        form={courseForm}
        setForm={setCourseForm}
        onSubmit={handleCreateCourse}
      />
    </div>
  );
}
