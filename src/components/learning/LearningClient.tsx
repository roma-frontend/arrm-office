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
import { TemplatePicker } from './TemplatePicker';
import { CourseEditSheet } from './CourseEditSheet';

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

type _EnrollmentWithCourse = {
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

type QuizResult = {
  passed: boolean;
  score: number;
  attemptNumber: number;
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
  const [_currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
  const [quizStartTime, setQuizStartTime] = useState<number>(0);

  // Lesson management state
  const [showCreateLesson, setShowCreateLesson] = useState(false);
  const [showEditLesson, setShowEditLesson] = useState(false);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [lessonForm, setLessonForm] = useState({
    title: '',
    description: '',
    contentType: 'text' as 'video' | 'text' | 'quiz' | 'mixed',
    videoUrl: '',
    textContent: '',
    durationMinutes: '',
    isPreview: false,
  });

  // Course edit state
  const [showEditCourse, setShowEditCourse] = useState(false);
  const [editingCourse, setEditingCourse] = useState<CourseWithLessons | null>(null);

  // Stats drill-down state
  const [showStatsDetail, setShowStatsDetail] = useState(false);
  const [statsFilter, setStatsFilter] = useState<
    'all' | 'completed' | 'in_progress' | 'not_started' | 'mandatory'
  >('all');

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

  const enrollmentDetails = useQuery(
    api.learning.getEnrollmentDetails,
    showStatsDetail && effectiveOrgId && user?.id && isAdmin
      ? {
          organizationId: effectiveOrgId as Id<'organizations'>,
          filter: statsFilter,
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
  const _activeLessonProgress = useQuery(
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
  const issueCertificateMutation = useMutation(api.learning.issueCertificate);

  const handleEditCourse = (updates: {
    title: string;
    description: string;
    category: string;
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    estimatedHours: number | undefined;
    isMandatory: boolean;
    tags: string[];
    isPublished: boolean;
  }) => {
    if (!editingCourse) return;
    updateCourseMutation({
      courseId: editingCourse._id,
      ...updates,
    })
      .then(() => {
        toast.success(t('learning.courseUpdated', 'Course updated successfully'));
        setShowEditCourse(false);
        setEditingCourse(null);
      })
      .catch(() => {
        toast.error(t('learning.courseUpdateError', 'Failed to update course'));
      });
  };
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

  const orgCertificates = useQuery(
    api.learning.getOrgCertificates,
    effectiveOrgId && user?.role === 'admin'
      ? {
          organizationId: effectiveOrgId as Id<'organizations'>,
        }
      : 'skip',
  );

  const issuedCertSet = new Set((orgCertificates ?? []).map((c) => `${c.userId}-${c.courseId}`));

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

  const [selectedTemplate, setSelectedTemplate] = useState<string>('midnight-gold');
  const [issueCertTarget, setIssueCertTarget] = useState<{ userId: Id<'users'>; courseId: Id<'courses'> } | null>(null);

  const handleIssueCertificate = async (userId: Id<'users'>, courseId: Id<'courses'>, templateId?: string) => {
    if (!effectiveOrgId) return;
    try {
      const result = await issueCertificateMutation({
        organizationId: effectiveOrgId as Id<'organizations'>,
        userId,
        courseId,
        templateId,
      });
      if (result.success) {
        toast.success(t('learning.certificateIssued', 'Certificate issued successfully'));
      } else {
        toast.info(result.message || t('learning.certificateExists', 'Certificate already exists'));
      }
    } catch {
      toast.error(t('learning.certificateError', 'Failed to issue certificate'));
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

  const openEditLessonDialog = (lesson: Lesson) => {
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
          <Card
            className="cursor-pointer hover:border-(--primary)/50 hover:shadow-md transition-all duration-200 ease-out"
            onClick={() => {
              setStatsFilter('all');
              setShowStatsDetail(true);
            }}
          >
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
          <Card
            className="cursor-pointer hover:border-(--primary)/50 hover:shadow-md transition-all duration-200 ease-out"
            onClick={() => {
              setStatsFilter('all');
              setShowStatsDetail(true);
            }}
          >
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
          <Card
            className="cursor-pointer hover:border-(--primary)/50 hover:shadow-md transition-all duration-200 ease-out"
            onClick={() => {
              setStatsFilter('completed');
              setShowStatsDetail(true);
            }}
          >
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
          <Card
            className="cursor-pointer hover:border-(--primary)/50 hover:shadow-md transition-all duration-200 ease-out"
            onClick={() => {
              setStatsFilter('mandatory');
              setShowStatsDetail(true);
            }}
          >
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
            className="w-full px-4 py-2.5 rounded-xl data-[state=active]:bg-(--brand) data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center gap-2"
          >
            <BookOpen className="h-4 w-4" />
            {t('learning.courseCatalog', 'Course Catalog')}
          </TabsTrigger>
          <TabsTrigger
            value="my-courses"
            className="w-full px-4 py-2.5 rounded-xl data-[state=active]:bg-(--brand) data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center gap-2"
          >
            <GraduationCap className="h-4 w-4" />
            {t('learning.myCourses', 'My Courses')}
          </TabsTrigger>
          <TabsTrigger
            value="certificates"
            className="w-full px-4 py-2.5 rounded-xl data-[state=active]:bg-(--brand) data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center gap-2"
          >
            <Award className="h-4 w-4" />
            {t('learning.certificates', 'Certificates')}
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger
              value="team"
              className="w-full px-4 py-2.5 rounded-xl data-[state=active]:bg-(--brand) data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center gap-2"
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
        onOpenEditCourse={(course) => {
          setEditingCourse(course);
          setShowEditCourse(true);
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

      {/* Edit Course Sheet */}
      <CourseEditSheet
        open={showEditCourse}
        onOpenChange={setShowEditCourse}
        course={editingCourse}
        onSave={handleEditCourse}
      />

      {/* Create Course Dialog */}
      <CreateCourseDialog
        open={showCreateCourse}
        onOpenChange={setShowCreateCourse}
        form={courseForm}
        setForm={setCourseForm}
        onSubmit={handleCreateCourse}
      />

      {/* Stats Detail Modal */}
      {showStatsDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setShowStatsDetail(false)}
        >
          <div
            className="bg-(--card) rounded-2xl border border-(--border) shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-(--border)">
              <div>
                <h2 className="text-lg font-bold text-(--text-primary)">
                  {statsFilter === 'completed'
                    ? t('learning.completedEnrollments', 'Completed Enrollments')
                    : statsFilter === 'mandatory'
                      ? t('learning.mandatoryCourses', 'Mandatory Courses')
                      : t('learning.allEnrollments', 'All Enrollments')}
                </h2>
                <p className="text-sm text-(--text-muted)">
                  {enrollmentDetails?.length ?? 0} {t('learning.records', 'records')}
                </p>
              </div>
              <button
                onClick={() => setShowStatsDetail(false)}
                className="p-2 rounded-lg hover:bg-(--background-subtle) transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-2 px-5 pt-4">
              {(
                [
                  { value: 'all', label: t('learning.filterAll', 'All') },
                  { value: 'completed', label: t('learning.filterCompleted', 'Completed') },
                  { value: 'in_progress', label: t('learning.filterInProgress', 'In Progress') },
                  { value: 'not_started', label: t('learning.filterNotStarted', 'Not Started') },
                  { value: 'mandatory', label: t('learning.filterMandatory', 'Mandatory') },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setStatsFilter(opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    statsFilter === opt.value
                      ? 'bg-(--brand) text-white'
                      : 'bg-(--background-subtle) text-(--text-muted) hover:text-(--text-primary)'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto p-5">
              {!enrollmentDetails ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-(--brand)" />
                </div>
              ) : enrollmentDetails.length === 0 ? (
                <div className="text-center py-12 text-(--text-muted)">
                  {t('learning.noData', 'No data available')}
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-(--border)">
                      <th className="text-left py-2 px-3 text-xs font-semibold text-(--text-muted)">
                        {t('learning.employee', 'Employee')}
                      </th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-(--text-muted)">
                        {t('learning.course', 'Course')}
                      </th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-(--text-muted)">
                        {t('common.status', 'Status')}
                      </th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-(--text-muted)">
                        {t('learning.progress', 'Progress')}
                      </th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-(--text-muted)">
                        {t('learning.enrolled', 'Enrolled')}
                      </th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-(--text-muted)">
                        {t('common.actions', 'Actions')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrollmentDetails.map((row) => (
                      <tr
                        key={row._id}
                        className="border-b border-(--border)/50 hover:bg-(--background-subtle)"
                      >
                        <td className="py-2.5 px-3">
                          <div>
                            <p className="text-sm font-medium text-(--text-primary)">
                              {row.userName}
                            </p>
                            <p className="text-xs text-(--text-muted)">{row.userEmail}</p>
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm text-(--text-primary)">{row.courseTitle}</span>
                            {row.courseIsMandatory && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-(--danger-quiet) text-(--danger-text) font-medium">
                                {t('learning.mandatory', 'Required')}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`text-xs font-medium px-2 py-1 rounded-full ${
                              row.status === 'completed'
                                ? 'bg-(--success-quiet) text-(--success-text)'
                                : row.status === 'in_progress'
                                  ? 'bg-(--brand-quiet) text-(--brand-text)'
                                  : 'bg-(--background-subtle) text-(--text-muted)'
                            }`}
                          >
                            {row.status === 'completed'
                              ? t('learning.statusCompleted', 'Completed')
                              : row.status === 'in_progress'
                                ? t('learning.statusInProgress', 'In Progress')
                                : t('learning.statusNotStarted', 'Not Started')}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-(--background-subtle) rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full bg-(--brand)"
                                style={{ width: `${row.progress}%` }}
                              />
                            </div>
                            <span className="text-xs text-(--text-muted)">{row.progress}%</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-xs text-(--text-muted)">
                          {row.enrolledAt ? new Date(row.enrolledAt).toLocaleDateString() : '—'}
                        </td>
                        <td className="py-2.5 px-3">
                          {row.status === 'completed' &&
                            (issuedCertSet.has(`${row.userId}-${row.courseId}`) ? (
                              <span className="text-xs text-(--success-text) font-medium">
                                {t('learning.certified', '✓ Certified')}
                              </span>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="gap-1 text-(--brand-text)"
                                onClick={() => setIssueCertTarget({ userId: row.userId, courseId: row.courseId })}
                              >
                                <Award className="h-3 w-3" />
                                {t('learning.issueCertificate', 'Issue Certificate')}
                              </Button>
                            ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Issue Certificate Template Picker Dialog */}
      {issueCertTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setIssueCertTarget(null)}
        >
          <div
            className="bg-(--card) rounded-2xl border border-(--border) shadow-2xl w-full max-w-xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold mb-4">
              {t('learning.selectTemplate', 'Select Certificate Template')}
            </h2>
            <TemplatePicker
              value={selectedTemplate}
              onChange={setSelectedTemplate}
            />
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setIssueCertTarget(null)}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button
                onClick={() => {
                  handleIssueCertificate(
                    issueCertTarget.userId,
                    issueCertTarget.courseId,
                    selectedTemplate,
                  );
                  setIssueCertTarget(null);
                }}
              >
                {t('learning.issueCertificate', 'Issue Certificate')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
