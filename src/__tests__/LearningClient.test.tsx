/**
 * Tests for LearningClient — the learning-center orchestrator.
 *
 * Covers: the loading gate, admin vs employee chrome (create button, stats
 * cards, team tab), tab switching, enrollment (success / already-enrolled /
 * error / guard), course creation (validation / success / error), publishing
 * (no-lessons guard / success / error), the lesson player (open / next / prev /
 * complete-advance / complete-last / error), lesson CRUD (create / edit /
 * delete), and the quiz flow (start / answer / submit-pass with progress /
 * submit-fail / error / retry / back-to-lesson).
 *
 * Mocks: convex/react (useMutation/useQuery keyed by _name), the generated
 * api, auth store, useSelectedOrganization, react-i18next (fallback strings),
 * sonner, ShieldLoader, button/card/tabs, lucide, and all seven learning
 * sub-components rendered as "dispatcher" stubs that expose the parent's
 * callbacks through data-testids.
 */

import React from 'react';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ── Fixtures ────────────────────────────────────────────────────────────────
const mockCourse = {
  _id: 'course-1',
  _creationTime: 1,
  organizationId: 'org-1',
  title: 'React Fundamentals',
  description: 'Learn React',
  category: 'frontend',
  difficulty: 'beginner',
  estimatedHours: 4,
  createdBy: 'user-1',
  isPublished: true,
  isMandatory: true,
  tags: ['react'],
  createdAt: 1,
  updatedAt: 1,
  creatorName: 'Anna',
  lessonCount: 2,
};

const mockLessons = [
  {
    _id: 'lesson-1',
    _creationTime: 1,
    courseId: 'course-1',
    title: 'Quiz Lesson',
    description: 'q',
    order: 1,
    contentType: 'quiz',
    durationMinutes: 10,
    isPreview: true,
  },
  {
    _id: 'lesson-2',
    _creationTime: 2,
    courseId: 'course-1',
    title: 'Video Lesson',
    order: 2,
    contentType: 'video',
    videoUrl: 'https://v/x.mp4',
    durationMinutes: 15,
    isPreview: false,
  },
];

// ── i18n ─────────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: any) => (typeof fallback === 'object' ? key : (fallback ?? key)),
    i18n: { language: 'en' },
  }),
}));

// ── Convex ───────────────────────────────────────────────────────────────────
const mockMutations: Record<string, jest.Mock> = {};
const mockQueries: Record<string, any> = {};
jest.mock('convex/react', () => ({
  useMutation: (m: any) => mockMutations[m?._name] ?? jest.fn(),
  useQuery: (q: any) => (q?._name in mockQueries ? mockQueries[q._name] : undefined),
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    learning: {
      listCourses: { _name: 'listCourses' },
      getMyEnrollments: { _name: 'getMyEnrollments' },
      getTeamLearningOverview: { _name: 'getTeamLearningOverview' },
      getCourseWithLessons: { _name: 'getCourseWithLessons' },
      getLessonProgress: { _name: 'getLessonProgress' },
      getQuizByLesson: { _name: 'getQuizByLesson' },
      getMyCertificates: { _name: 'getMyCertificates' },
      enrollInCourse: { _name: 'enrollInCourse' },
      createCourse: { _name: 'createCourse' },
      updateLessonProgress: { _name: 'updateLessonProgress' },
      createLesson: { _name: 'createLesson' },
      updateLesson: { _name: 'updateLesson' },
      deleteLesson: { _name: 'deleteLesson' },
      updateCourse: { _name: 'updateCourse' },
      submitQuizAttempt: { _name: 'submitQuizAttempt' },
    },
  },
}));

// ── Auth / org ───────────────────────────────────────────────────────────────
let mockUser: Record<string, unknown> | null = {
  id: 'user-1',
  role: 'employee',
  organizationId: 'org-1',
};
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({ user: mockUser }),
}));

let mockOrg: string | null = 'org-1';
jest.mock('@/hooks/useSelectedOrganization', () => ({
  useSelectedOrganization: () => mockOrg,
}));

// ── Toast / ui ───────────────────────────────────────────────────────────────
jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <div data-testid="shield-loader" />,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button type="button" onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/tabs', () => {
  const ReactMod = require('react');
  const TabsCtx = ReactMod.createContext({ value: '', setValue: (_v: string) => {} });
  return {
    Tabs: ({ defaultValue, value, onValueChange, children }: any) => {
      const [internal, setInternal] = ReactMod.useState(value ?? defaultValue ?? '');
      const active = value !== undefined ? value : internal;
      const setValue = (v: string) => {
        setInternal(v);
        onValueChange?.(v);
      };
      return <TabsCtx.Provider value={{ value: active, setValue }}>{children}</TabsCtx.Provider>;
    },
    TabsList: ({ children }: any) => <div>{children}</div>,
    TabsTrigger: ({ value, children }: any) => {
      const { setValue } = ReactMod.useContext(TabsCtx);
      return (
        <button type="button" onClick={() => setValue(value)}>
          {children}
        </button>
      );
    },
    TabsContent: ({ value, children }: any) => {
      const { value: active } = ReactMod.useContext(TabsCtx);
      return active === value ? <div data-testid={`tab-${value}`}>{children}</div> : null;
    },
  };
});

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return {
    BookOpen: Icon,
    GraduationCap: Icon,
    Award: Icon,
    BarChart3: Icon,
    Plus: Icon,
    Users: Icon,
  };
});

// ── Learning sub-components (prop dispatchers) ──────────────────────────────
jest.mock('@/components/learning/CourseCatalog', () => ({
  CourseCatalog: ({ courses, onEnroll, onSelectCourse }: any) => (
    <div data-testid="course-catalog">
      <span data-testid="catalog-count">{courses?.length ?? 0}</span>
      <button type="button" onClick={() => onEnroll('course-1')}>
        enroll course
      </button>
      <button type="button" onClick={() => onSelectCourse(mockCourse)}>
        select course
      </button>
    </div>
  ),
}));

jest.mock('@/components/learning/MyCourses', () => ({
  MyCourses: ({ myEnrollments, onOpenCourse, onGoToCatalog }: any) => (
    <div data-testid="my-courses">
      <span data-testid="my-count">{myEnrollments?.length ?? 0}</span>
      <button type="button" onClick={() => onOpenCourse(mockCourse)}>
        open my course
      </button>
      <button type="button" onClick={onGoToCatalog}>
        go to catalog
      </button>
    </div>
  ),
}));

jest.mock('@/components/learning/TeamOverview', () => ({
  TeamOverview: ({ teamOverview }: any) => (
    <div data-testid="team-overview">{teamOverview?.totalCourses ?? 0}</div>
  ),
}));

jest.mock('@/components/learning/CertificatesTab', () => ({
  CertificatesTab: ({ certificates }: any) => (
    <div data-testid="certificates-tab">{certificates?.length ?? 0}</div>
  ),
}));

jest.mock('@/components/learning/CourseDetailDialog', () => ({
  CourseDetailDialog: ({
    open,
    course,
    courseWithLessons,
    isAdmin,
    isEnrolled,
    onEnroll,
    onPublishCourse,
    onOpenLessonPlayer,
    onOpenCreateLesson,
    onOpenEditLesson,
    onDeleteLesson,
    onOpenChange,
  }: any) =>
    open ? (
      <div
        data-testid="course-detail"
        data-admin={String(isAdmin)}
        data-enrolled={String(isEnrolled)}
      >
        <span data-testid="detail-title">{course?.title ?? 'none'}</span>
        <span data-testid="detail-lessons">{courseWithLessons?.lessons?.length ?? 0}</span>
        <button type="button" onClick={onEnroll}>
          detail enroll
        </button>
        <button type="button" onClick={onPublishCourse}>
          publish course
        </button>
        <button type="button" onClick={() => onOpenLessonPlayer(mockCourse, mockLessons, 0)}>
          open player
        </button>
        <button type="button" onClick={onOpenCreateLesson}>
          open create lesson
        </button>
        <button type="button" onClick={() => onOpenEditLesson(mockLessons[0])}>
          open edit lesson
        </button>
        <button type="button" onClick={() => onDeleteLesson('lesson-1')}>
          delete lesson
        </button>
        <button type="button" onClick={() => onOpenChange(false)}>
          close detail
        </button>
      </div>
    ) : null,
}));

jest.mock('@/components/learning/LessonPlayerDialog', () => ({
  LessonPlayerDialog: ({
    open,
    lessons,
    activeLessonIndex,
    onCompleteLesson,
    onNextLesson,
    onPrevLesson,
    quizData,
    showQuiz,
    setShowQuiz,
    quizSubmitted,
    quizResult,
    onSubmitQuiz,
    onAnswerChange,
    onRetryQuiz,
    onBackToLesson,
    onOpenChange,
  }: any) =>
    open ? (
      <div data-testid="lesson-player" data-index={activeLessonIndex} data-lessons={lessons.length}>
        <button type="button" onClick={onCompleteLesson}>
          complete lesson
        </button>
        <button type="button" onClick={onNextLesson}>
          next lesson
        </button>
        <button type="button" onClick={onPrevLesson}>
          prev lesson
        </button>
        <button type="button" onClick={() => setShowQuiz(true)}>
          start quiz
        </button>
        <button type="button" onClick={() => onAnswerChange('q1', 'A')}>
          answer q1
        </button>
        <button type="button" onClick={onSubmitQuiz}>
          submit quiz
        </button>
        <button type="button" onClick={onRetryQuiz}>
          retry quiz
        </button>
        <button type="button" onClick={onBackToLesson}>
          back to lesson
        </button>
        <button type="button" onClick={() => onOpenChange(false)}>
          close player
        </button>
        <span data-testid="player-quiz-data">{String(!!quizData)}</span>
        <span data-testid="player-show-quiz">{String(showQuiz)}</span>
        <span data-testid="player-quiz-submitted">{String(quizSubmitted)}</span>
        <span data-testid="player-quiz-result">
          {quizResult ? String(quizResult.passed) : 'none'}
        </span>
      </div>
    ) : null,
}));

jest.mock('@/components/learning/LessonFormDialog', () => ({
  LessonFormDialog: ({ open, form, setForm, isEdit, onSubmit, onCancel }: any) =>
    open ? (
      <div data-testid={isEdit ? 'edit-lesson' : 'create-lesson'}>
        <button
          type="button"
          onClick={() =>
            setForm({
              ...form,
              title: 'Edited Title',
              videoUrl: 'https://v2/x.mp4',
              durationMinutes: '20',
              isPreview: true,
            })
          }
        >
          fill lesson form
        </button>
        <button type="button" onClick={() => setForm({ ...form, title: '' })}>
          clear lesson title
        </button>
        <button type="button" onClick={onSubmit}>
          submit lesson
        </button>
        <button type="button" onClick={onCancel}>
          cancel lesson
        </button>
      </div>
    ) : null,
}));

jest.mock('@/components/learning/CreateCourseDialog', () => ({
  CreateCourseDialog: ({ open, form, setForm, onSubmit }: any) =>
    open ? (
      <div data-testid="create-course">
        <button
          type="button"
          onClick={() =>
            setForm({
              ...form,
              title: 'New Course',
              category: 'backend',
              estimatedHours: '10',
              isMandatory: true,
              tags: 'node, api',
            })
          }
        >
          fill course form
        </button>
        <button type="button" onClick={() => setForm({ ...form, title: 'New Course' })}>
          fill title only
        </button>
        <button type="button" onClick={onSubmit}>
          submit course
        </button>
      </div>
    ) : null,
}));

import LearningClient from '@/components/learning/LearningClient';
import { toast } from 'sonner';

// ── Helpers ──────────────────────────────────────────────────────────────────
const openPlayer = () => {
  fireEvent.click(screen.getByText('select course'));
  fireEvent.click(screen.getByText('open player'));
  expect(screen.getByTestId('lesson-player')).toBeInTheDocument();
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'user-1', role: 'employee', organizationId: 'org-1' };
  mockOrg = 'org-1';
  mockQueries.listCourses = [mockCourse];
  mockQueries.getMyEnrollments = [
    {
      _id: 'enr-1',
      courseId: 'course-1',
      status: 'in_progress',
      organizationId: 'org-1',
      userId: 'user-1',
      createdAt: 1,
      updatedAt: 1,
      courseTitle: 'React Fundamentals',
    },
  ];
  mockQueries.getTeamLearningOverview = {
    totalCourses: 5,
    totalEnrollments: 12,
    completionRate: 43,
    mandatoryCourses: 2,
  };
  mockQueries.getCourseWithLessons = { ...mockCourse, lessons: mockLessons };
  mockQueries.getQuizByLesson = {
    quiz: { _id: 'quiz-1', lessonId: 'lesson-1' },
    questions: [{ _id: 'q1', text: 'What is React?' }],
  };
  mockQueries.getMyCertificates = [{ _id: 'cert-1', title: 'React' }];
  mockMutations.enrollInCourse = jest.fn().mockResolvedValue({ success: true });
  mockMutations.createCourse = jest.fn().mockResolvedValue('course-2');
  mockMutations.updateLessonProgress = jest.fn().mockResolvedValue(undefined);
  mockMutations.createLesson = jest.fn().mockResolvedValue('lesson-9');
  mockMutations.updateLesson = jest.fn().mockResolvedValue(undefined);
  mockMutations.deleteLesson = jest.fn().mockResolvedValue(undefined);
  mockMutations.updateCourse = jest.fn().mockResolvedValue(undefined);
  mockMutations.submitQuizAttempt = jest.fn().mockResolvedValue({
    passed: true,
    score: 100,
    attemptNumber: 1,
  });
});

afterEach(() => {
  (global as any).fetch = undefined;
});

describe('LearningClient', () => {
  // ── Rendering & chrome ──────────────────────────────────────────────────

  it('shows the loader while courses are still loading', () => {
    mockQueries.listCourses = undefined;
    render(<LearningClient />);
    expect(screen.getByTestId('shield-loader')).toBeInTheDocument();
  });

  it('renders the header, catalog tab and employee tab set', () => {
    render(<LearningClient />);
    expect(screen.getByText('Learning Center')).toBeInTheDocument();
    expect(screen.getByTestId('tab-catalog')).toBeInTheDocument();
    expect(screen.queryByText('Create Course')).not.toBeInTheDocument();
    expect(screen.queryByText('Team Overview')).not.toBeInTheDocument();
    expect(screen.queryByTestId('team-overview')).not.toBeInTheDocument();
  });

  it('shows admin chrome: create button, stats cards and team tab', () => {
    mockUser = { id: 'user-1', role: 'admin', organizationId: 'org-1' };
    render(<LearningClient />);
    expect(screen.getByText('Create Course')).toBeInTheDocument();
    // Stats cards
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Total Courses')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Total Enrollments')).toBeInTheDocument();
    expect(screen.getByText('43%')).toBeInTheDocument();
    expect(screen.getByText('Completion Rate')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Mandatory Courses')).toBeInTheDocument();
    // Team tab exists and renders the overview
    fireEvent.click(screen.getByText('Team Overview'));
    expect(screen.getByTestId('team-overview')).toBeInTheDocument();
  });

  it('does not render the team tab or stats for non-admins', () => {
    render(<LearningClient />);
    expect(screen.queryByTestId('team-overview')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('My Courses'));
    expect(screen.getByTestId('my-courses')).toBeInTheDocument();
    expect(screen.getByTestId('my-count')).toHaveTextContent('1');
  });

  it('switches to the certificates tab', () => {
    render(<LearningClient />);
    fireEvent.click(screen.getByText('Certificates'));
    expect(screen.getByTestId('certificates-tab')).toBeInTheDocument();
  });

  it('goes back to the catalog from the my-courses tab', () => {
    render(<LearningClient />);
    fireEvent.click(screen.getByText('My Courses'));
    fireEvent.click(screen.getByText('go to catalog'));
    expect(screen.getByTestId('tab-catalog')).toBeInTheDocument();
  });

  // ── Enrollment ──────────────────────────────────────────────────────────

  it('enrolls in a course and shows a success toast', async () => {
    render(<LearningClient />);
    fireEvent.click(screen.getByText('enroll course'));
    await waitFor(() => expect(mockMutations.enrollInCourse).toHaveBeenCalled());
    expect(mockMutations.enrollInCourse).toHaveBeenCalledWith({
      organizationId: 'org-1',
      courseId: 'course-1',
    });
    expect(toast.success).toHaveBeenCalledWith('Successfully enrolled in course');
  });

  it('shows an info toast when already enrolled', async () => {
    mockMutations.enrollInCourse = jest
      .fn()
      .mockResolvedValue({ success: false, message: 'Already in!' });
    render(<LearningClient />);
    fireEvent.click(screen.getByText('enroll course'));
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith('Already in!'));
  });

  it('shows an error toast when enrollment fails', async () => {
    mockMutations.enrollInCourse = jest.fn().mockRejectedValue(new Error('boom'));
    render(<LearningClient />);
    fireEvent.click(screen.getByText('enroll course'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to enroll in course'));
  });

  it('does nothing on enroll without a user', async () => {
    mockUser = null;
    render(<LearningClient />);
    fireEvent.click(screen.getByText('enroll course'));
    await waitFor(() => expect(mockMutations.enrollInCourse).not.toHaveBeenCalled());
    expect(toast.error).not.toHaveBeenCalled();
  });

  // ── Course creation ─────────────────────────────────────────────────────

  it('opens the create dialog and validates the required title', async () => {
    mockUser = { id: 'user-1', role: 'admin', organizationId: 'org-1' };
    render(<LearningClient />);
    fireEvent.click(screen.getByText('Create Course'));
    expect(screen.getByTestId('create-course')).toBeInTheDocument();
    fireEvent.click(screen.getByText('submit course'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Title is required'));
    expect(mockMutations.createCourse).not.toHaveBeenCalled();
  });

  it('validates the required category when only the title is filled', async () => {
    mockUser = { id: 'user-1', role: 'admin', organizationId: 'org-1' };
    render(<LearningClient />);
    fireEvent.click(screen.getByText('Create Course'));
    fireEvent.click(screen.getByText('fill title only'));
    fireEvent.click(screen.getByText('submit course'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Category is required'));
    expect(mockMutations.createCourse).not.toHaveBeenCalled();
  });

  it('creates a course with the filled form and closes the dialog', async () => {
    mockUser = { id: 'user-1', role: 'admin', organizationId: 'org-1' };
    render(<LearningClient />);
    fireEvent.click(screen.getByText('Create Course'));
    fireEvent.click(screen.getByText('fill course form'));
    fireEvent.click(screen.getByText('submit course'));
    await waitFor(() => expect(mockMutations.createCourse).toHaveBeenCalled());
    expect(mockMutations.createCourse).toHaveBeenCalledWith({
      organizationId: 'org-1',
      title: 'New Course',
      description: undefined,
      category: 'backend',
      difficulty: 'beginner',
      estimatedHours: 10,
      isMandatory: true,
      tags: ['node', 'api'],
    });
    expect(toast.success).toHaveBeenCalledWith('Course created successfully');
    // dialog closes (form reset → title empty again)
    await waitFor(() => expect(screen.queryByTestId('create-course')).not.toBeInTheDocument());
  });

  it('shows an error toast when course creation fails', async () => {
    mockUser = { id: 'user-1', role: 'admin', organizationId: 'org-1' };
    mockMutations.createCourse = jest.fn().mockRejectedValue(new Error('nope'));
    render(<LearningClient />);
    fireEvent.click(screen.getByText('Create Course'));
    fireEvent.click(screen.getByText('fill course form'));
    fireEvent.click(screen.getByText('submit course'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to create course'));
  });

  // ── Course detail & publishing ──────────────────────────────────────────

  it('opens the course detail with enrollment state', () => {
    render(<LearningClient />);
    fireEvent.click(screen.getByText('select course'));
    const detail = screen.getByTestId('course-detail');
    expect(detail).toBeInTheDocument();
    expect(detail).toHaveAttribute('data-admin', 'false');
    expect(detail).toHaveAttribute('data-enrolled', 'true');
    expect(screen.getByTestId('detail-title')).toHaveTextContent('React Fundamentals');
  });

  it('marks the detail as not enrolled when there are no enrollments', () => {
    mockQueries.getMyEnrollments = [];
    render(<LearningClient />);
    fireEvent.click(screen.getByText('select course'));
    expect(screen.getByTestId('course-detail')).toHaveAttribute('data-enrolled', 'false');
  });

  it('refuses to publish a course that has no lessons', async () => {
    mockUser = { id: 'user-1', role: 'admin', organizationId: 'org-1' };
    mockQueries.getCourseWithLessons = { ...mockCourse, lessons: [] };
    render(<LearningClient />);
    fireEvent.click(screen.getByText('select course'));
    fireEvent.click(screen.getByText('publish course'));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Add at least one lesson before publishing'),
    );
    expect(mockMutations.updateCourse).not.toHaveBeenCalled();
  });

  it('publishes a course with lessons and closes the detail', async () => {
    mockUser = { id: 'user-1', role: 'admin', organizationId: 'org-1' };
    render(<LearningClient />);
    fireEvent.click(screen.getByText('select course'));
    fireEvent.click(screen.getByText('publish course'));
    await waitFor(() => expect(mockMutations.updateCourse).toHaveBeenCalled());
    expect(mockMutations.updateCourse).toHaveBeenCalledWith({
      courseId: 'course-1',
      isPublished: true,
    });
    expect(toast.success).toHaveBeenCalledWith('Course published successfully');
    await waitFor(() => expect(screen.queryByTestId('course-detail')).not.toBeInTheDocument());
  });

  it('shows an error toast when publishing fails', async () => {
    mockUser = { id: 'user-1', role: 'admin', organizationId: 'org-1' };
    mockMutations.updateCourse = jest.fn().mockRejectedValue(new Error('pub'));
    render(<LearningClient />);
    fireEvent.click(screen.getByText('select course'));
    fireEvent.click(screen.getByText('publish course'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to publish course'));
  });

  // ── Lesson player ───────────────────────────────────────────────────────

  it('opens the player and navigates lessons', () => {
    render(<LearningClient />);
    openPlayer();
    expect(screen.getByTestId('lesson-player')).toHaveAttribute('data-index', '0');
    expect(screen.getByTestId('lesson-player')).toHaveAttribute('data-lessons', '2');
    fireEvent.click(screen.getByText('next lesson'));
    expect(screen.getByTestId('lesson-player')).toHaveAttribute('data-index', '1');
    fireEvent.click(screen.getByText('prev lesson'));
    expect(screen.getByTestId('lesson-player')).toHaveAttribute('data-index', '0');
    // boundaries are no-ops
    fireEvent.click(screen.getByText('prev lesson'));
    expect(screen.getByTestId('lesson-player')).toHaveAttribute('data-index', '0');
  });

  it('completes a lesson and advances to the next one', async () => {
    render(<LearningClient />);
    openPlayer();
    fireEvent.click(screen.getByText('complete lesson'));
    await waitFor(() => expect(mockMutations.updateLessonProgress).toHaveBeenCalled());
    expect(mockMutations.updateLessonProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        lessonId: 'lesson-1',
        courseId: 'course-1',
        isCompleted: true,
        timeSpentSeconds: expect.any(Number),
        lastPosition: 0,
      }),
    );
    expect(toast.success).toHaveBeenCalledWith('Lesson completed!');
    await waitFor(() =>
      expect(screen.getByTestId('lesson-player')).toHaveAttribute('data-index', '1'),
    );
  });

  it('completes the last lesson and closes the player', async () => {
    render(<LearningClient />);
    openPlayer();
    fireEvent.click(screen.getByText('next lesson')); // → index 1 (last)
    fireEvent.click(screen.getByText('complete lesson'));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Course completed!'));
    expect(screen.queryByTestId('lesson-player')).not.toBeInTheDocument();
  });

  it('shows an error toast when completing a lesson fails', async () => {
    mockMutations.updateLessonProgress = jest.fn().mockRejectedValue(new Error('l'));
    render(<LearningClient />);
    openPlayer();
    fireEvent.click(screen.getByText('complete lesson'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to complete lesson'));
  });

  it('closes the player via onOpenChange', () => {
    render(<LearningClient />);
    openPlayer();
    fireEvent.click(screen.getByText('close player'));
    expect(screen.queryByTestId('lesson-player')).not.toBeInTheDocument();
  });

  // ── Lesson CRUD ─────────────────────────────────────────────────────────

  it('creates a lesson from the detail dialog', async () => {
    mockUser = { id: 'user-1', role: 'admin', organizationId: 'org-1' };
    render(<LearningClient />);
    fireEvent.click(screen.getByText('select course'));
    fireEvent.click(screen.getByText('open create lesson'));
    expect(screen.getByTestId('create-lesson')).toBeInTheDocument();
    fireEvent.click(screen.getByText('fill lesson form'));
    fireEvent.click(screen.getByText('submit lesson'));
    await waitFor(() => expect(mockMutations.createLesson).toHaveBeenCalled());
    expect(mockMutations.createLesson).toHaveBeenCalledWith({
      organizationId: 'org-1',
      courseId: 'course-1',
      title: 'Edited Title',
      description: undefined,
      order: 0,
      contentType: 'text',
      videoUrl: 'https://v2/x.mp4',
      textContent: undefined,
      durationMinutes: 20,
      isPreview: true,
    });
    expect(toast.success).toHaveBeenCalledWith('Lesson created successfully');
  });

  it('validates the lesson title before creating', async () => {
    mockUser = { id: 'user-1', role: 'admin', organizationId: 'org-1' };
    render(<LearningClient />);
    fireEvent.click(screen.getByText('select course'));
    fireEvent.click(screen.getByText('open create lesson'));
    fireEvent.click(screen.getByText('submit lesson'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Title is required'));
    expect(mockMutations.createLesson).not.toHaveBeenCalled();
  });

  it('shows an error toast when lesson creation fails', async () => {
    mockUser = { id: 'user-1', role: 'admin', organizationId: 'org-1' };
    mockMutations.createLesson = jest.fn().mockRejectedValue(new Error('c'));
    render(<LearningClient />);
    fireEvent.click(screen.getByText('select course'));
    fireEvent.click(screen.getByText('open create lesson'));
    fireEvent.click(screen.getByText('fill lesson form'));
    fireEvent.click(screen.getByText('submit lesson'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to create lesson'));
  });

  it('pre-fills and submits the edit lesson form', async () => {
    mockUser = { id: 'user-1', role: 'admin', organizationId: 'org-1' };
    render(<LearningClient />);
    fireEvent.click(screen.getByText('select course'));
    fireEvent.click(screen.getByText('open edit lesson'));
    expect(screen.getByTestId('edit-lesson')).toBeInTheDocument();
    fireEvent.click(screen.getByText('fill lesson form'));
    fireEvent.click(screen.getByText('submit lesson'));
    await waitFor(() => expect(mockMutations.updateLesson).toHaveBeenCalled());
    expect(mockMutations.updateLesson).toHaveBeenCalledWith(
      expect.objectContaining({
        lessonId: 'lesson-1',
        title: 'Edited Title',
        contentType: 'quiz',
        durationMinutes: 20,
        isPreview: true,
        videoUrl: 'https://v2/x.mp4',
      }),
    );
    expect(toast.success).toHaveBeenCalledWith('Lesson updated successfully');
    await waitFor(() => expect(screen.queryByTestId('edit-lesson')).not.toBeInTheDocument());
  });

  it('validates the lesson title when editing', async () => {
    mockUser = { id: 'user-1', role: 'admin', organizationId: 'org-1' };
    render(<LearningClient />);
    fireEvent.click(screen.getByText('select course'));
    fireEvent.click(screen.getByText('open edit lesson'));
    fireEvent.click(screen.getByText('clear lesson title'));
    fireEvent.click(screen.getByText('submit lesson'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Title is required'));
    expect(mockMutations.updateLesson).not.toHaveBeenCalled();
  });

  it('cancels the create lesson dialog', async () => {
    mockUser = { id: 'user-1', role: 'admin', organizationId: 'org-1' };
    render(<LearningClient />);
    fireEvent.click(screen.getByText('select course'));
    fireEvent.click(screen.getByText('open create lesson'));
    expect(screen.getByTestId('create-lesson')).toBeInTheDocument();
    fireEvent.click(screen.getByText('cancel lesson'));
    expect(screen.queryByTestId('create-lesson')).not.toBeInTheDocument();
  });

  it('cancels the edit lesson dialog', async () => {
    mockUser = { id: 'user-1', role: 'admin', organizationId: 'org-1' };
    render(<LearningClient />);
    fireEvent.click(screen.getByText('select course'));
    fireEvent.click(screen.getByText('open edit lesson'));
    expect(screen.getByTestId('edit-lesson')).toBeInTheDocument();
    fireEvent.click(screen.getByText('cancel lesson'));
    expect(screen.queryByTestId('edit-lesson')).not.toBeInTheDocument();
  });

  it('opens a course from the my-courses tab', () => {
    render(<LearningClient />);
    fireEvent.click(screen.getByText('My Courses'));
    fireEvent.click(screen.getByText('open my course'));
    expect(screen.getByTestId('course-detail')).toBeInTheDocument();
    expect(screen.getByTestId('detail-title')).toHaveTextContent('React Fundamentals');
  });

  it('shows an error toast when updating a lesson fails', async () => {
    mockUser = { id: 'user-1', role: 'admin', organizationId: 'org-1' };
    mockMutations.updateLesson = jest.fn().mockRejectedValue(new Error('u'));
    render(<LearningClient />);
    fireEvent.click(screen.getByText('select course'));
    fireEvent.click(screen.getByText('open edit lesson'));
    fireEvent.click(screen.getByText('fill lesson form'));
    fireEvent.click(screen.getByText('submit lesson'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to update lesson'));
  });

  it('deletes a lesson and shows a success toast', async () => {
    mockUser = { id: 'user-1', role: 'admin', organizationId: 'org-1' };
    render(<LearningClient />);
    fireEvent.click(screen.getByText('select course'));
    fireEvent.click(screen.getByText('delete lesson'));
    await waitFor(() => expect(mockMutations.deleteLesson).toHaveBeenCalled());
    expect(mockMutations.deleteLesson).toHaveBeenCalledWith({ lessonId: 'lesson-1' });
    expect(toast.success).toHaveBeenCalledWith('Lesson deleted successfully');
  });

  it('shows an error toast when deleting a lesson fails', async () => {
    mockUser = { id: 'user-1', role: 'admin', organizationId: 'org-1' };
    mockMutations.deleteLesson = jest.fn().mockRejectedValue(new Error('d'));
    render(<LearningClient />);
    fireEvent.click(screen.getByText('select course'));
    fireEvent.click(screen.getByText('delete lesson'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to delete lesson'));
  });

  // ── Quiz flow ───────────────────────────────────────────────────────────

  it('submits a passing quiz, marks progress and shows the pass toast', async () => {
    render(<LearningClient />);
    openPlayer(); // first lesson is a quiz lesson
    fireEvent.click(screen.getByText('start quiz'));
    expect(screen.getByTestId('player-show-quiz')).toHaveTextContent('true');
    fireEvent.click(screen.getByText('answer q1'));
    fireEvent.click(screen.getByText('submit quiz'));
    await waitFor(() => expect(mockMutations.submitQuizAttempt).toHaveBeenCalled());
    expect(mockMutations.submitQuizAttempt).toHaveBeenCalledWith({
      organizationId: 'org-1',
      quizId: 'quiz-1',
      answers: [{ questionId: 'q1', userAnswer: 'A' }],
    });
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Congratulations! You passed the quiz'),
    );
    expect(screen.getByTestId('player-quiz-submitted')).toHaveTextContent('true');
    expect(screen.getByTestId('player-quiz-result')).toHaveTextContent('true');
    // the lesson gets marked complete via updateLessonProgress
    expect(mockMutations.updateLessonProgress).toHaveBeenCalledWith(
      expect.objectContaining({ lessonId: 'lesson-1', isCompleted: true }),
    );
  });

  it('shows an info toast when the quiz is not passed', async () => {
    mockMutations.submitQuizAttempt = jest
      .fn()
      .mockResolvedValue({ passed: false, score: 40, attemptNumber: 2 });
    render(<LearningClient />);
    openPlayer();
    fireEvent.click(screen.getByText('start quiz'));
    fireEvent.click(screen.getByText('submit quiz'));
    await waitFor(() =>
      expect(toast.info).toHaveBeenCalledWith('You did not pass the quiz. Try again.'),
    );
    expect(mockMutations.updateLessonProgress).not.toHaveBeenCalled();
    expect(screen.getByTestId('player-quiz-result')).toHaveTextContent('false');
  });

  it('shows an error toast when the quiz submission fails', async () => {
    mockMutations.submitQuizAttempt = jest.fn().mockRejectedValue(new Error('q'));
    render(<LearningClient />);
    openPlayer();
    fireEvent.click(screen.getByText('start quiz'));
    fireEvent.click(screen.getByText('submit quiz'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to submit quiz'));
  });

  it('retries the quiz after a failed attempt', async () => {
    mockMutations.submitQuizAttempt = jest
      .fn()
      .mockResolvedValue({ passed: false, score: 40, attemptNumber: 2 });
    render(<LearningClient />);
    openPlayer();
    fireEvent.click(screen.getByText('start quiz'));
    fireEvent.click(screen.getByText('submit quiz'));
    await waitFor(() =>
      expect(screen.getByTestId('player-quiz-submitted')).toHaveTextContent('true'),
    );
    fireEvent.click(screen.getByText('retry quiz'));
    expect(screen.getByTestId('player-show-quiz')).toHaveTextContent('true');
    expect(screen.getByTestId('player-quiz-submitted')).toHaveTextContent('false');
    expect(screen.getByTestId('player-quiz-result')).toHaveTextContent('none');
  });

  it('goes back to the lesson from the quiz', async () => {
    render(<LearningClient />);
    openPlayer();
    fireEvent.click(screen.getByText('start quiz'));
    expect(screen.getByTestId('player-show-quiz')).toHaveTextContent('true');
    fireEvent.click(screen.getByText('back to lesson'));
    expect(screen.getByTestId('player-show-quiz')).toHaveTextContent('false');
    expect(screen.getByTestId('player-quiz-submitted')).toHaveTextContent('false');
    expect(screen.getByTestId('player-quiz-result')).toHaveTextContent('none');
  });
});
