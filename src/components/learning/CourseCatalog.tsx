'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Id } from '../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BookOpen, Search, Clock, Users, Plus, ChevronRight, Filter } from 'lucide-react';
import { EmployeeHoverCard } from '@/components/employees/EmployeeHoverCard';

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

interface CourseCatalogProps {
  courses: CourseWithLessons[] | undefined;
  myEnrollments: EnrollmentWithCourse[] | undefined;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  categoryFilter: string;
  setCategoryFilter: (category: string) => void;
  difficultyFilter: string;
  setDifficultyFilter: (difficulty: string) => void;
  onEnroll: (courseId: Id<'courses'>) => void;
  onSelectCourse: (course: CourseWithLessons) => void;
}

const difficultyColors: Record<string, string> = {
  beginner:
    'bg-(--success-quiet) text-(--success-text) dark:bg-(--success-solid) dark:text-(--success-text)',
  intermediate:
    'bg-(--warning-quiet) text-(--warning-text) dark:bg-(--warning-solid) dark:text-(--warning-text)',
  advanced:
    'bg-(--danger-quiet) text-(--danger-text) dark:bg-(--danger-solid) dark:text-(--danger-text)',
};

export function CourseCatalog({
  courses,
  myEnrollments,
  searchQuery,
  setSearchQuery,
  categoryFilter,
  setCategoryFilter,
  difficultyFilter,
  setDifficultyFilter,
  onEnroll,
  onSelectCourse,
}: CourseCatalogProps) {
  const { t } = useTranslation();

  const filteredCourses = useMemo(() => {
    if (!courses) return [];
    let result = courses;

    if (searchQuery) {
      const lower = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.title.toLowerCase().includes(lower) || c.description?.toLowerCase().includes(lower),
      );
    }

    if (categoryFilter !== 'all') {
      result = result.filter((c) => c.category === categoryFilter);
    }

    if (difficultyFilter !== 'all') {
      result = result.filter((c) => c.difficulty === difficultyFilter);
    }

    return result;
  }, [courses, searchQuery, categoryFilter, difficultyFilter]);

  const categories = useMemo(() => {
    if (!courses) return [];
    return [...new Set(courses.map((c) => c.category))];
  }, [courses]);

  const isEnrolled = (courseId: Id<'courses'>) => {
    return myEnrollments?.some((e) => e.courseId === courseId);
  };

  const getEnrollmentProgress = (courseId: Id<'courses'>) => {
    const enrollment = myEnrollments?.find((e) => e.courseId === courseId);
    return enrollment?.progress ?? 0;
  };

  if (!courses || courses.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <BookOpen className="h-16 w-16 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">
            {t('learning.noCourses', 'No courses available')}
          </h3>
          <p className="text-muted-foreground">
            {t('learning.noCoursesDesc', 'Check back later or contact your admin')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="relative flex-1 min-w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('learning.searchCourses', 'Search courses...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Filter className="hidden sm:block h-4 w-4 text-muted-foreground" />
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder={t('learning.allCategories', 'All Categories')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t('learning.allCategories', 'All Categories')}
                  </SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder={t('learning.allDifficulties', 'All Levels')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('learning.allDifficulties', 'All Levels')}</SelectItem>
                  <SelectItem value="beginner">{t('learning.beginner', 'Beginner')}</SelectItem>
                  <SelectItem value="intermediate">
                    {t('learning.intermediate', 'Intermediate')}
                  </SelectItem>
                  <SelectItem value="advanced">{t('learning.advanced', 'Advanced')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Course Grid */}
      {filteredCourses.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <BookOpen className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {t('learning.noCourses', 'No courses match your filters')}
            </h3>
            <p className="text-muted-foreground">
              {t('learning.noCoursesDesc', 'Try adjusting your search or filter criteria')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCourses.map((course) => (
            <Card
              key={course._id}
              className="hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => onSelectCourse(course)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg line-clamp-2">{course.title}</CardTitle>
                  {course.isMandatory && (
                    <Badge variant="destructive" className="text-xs">
                      {t('learning.mandatory', 'Mandatory')}
                    </Badge>
                  )}
                </div>
                <CardDescription className="line-clamp-2">
                  {course.description || t('learning.noDescription', 'No description available')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <BookOpen className="h-4 w-4" />
                    {course.lessonCount} {t('learning.lessons', 'lessons')}
                  </span>
                  {course.estimatedHours && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {course.estimatedHours}h
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    <EmployeeHoverCard
                      userId={course.createdBy as string}
                      name={course.creatorName}
                    >
                      <span className="cursor-pointer underline-offset-2 hover:underline">
                        {course.creatorName}
                      </span>
                    </EmployeeHoverCard>
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Badge className={difficultyColors[course.difficulty]}>
                    {t(`learning.${course.difficulty}`, course.difficulty)}
                  </Badge>
                  <Badge variant="outline">{course.category}</Badge>
                </div>

                {isEnrolled(course._id) && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {t('learning.progress', 'Progress')}
                      </span>
                      <span className="font-medium">{getEnrollmentProgress(course._id)}%</span>
                    </div>
                    <Progress value={getEnrollmentProgress(course._id)} className="h-2" />
                  </div>
                )}

                <div className="flex gap-2">
                  {!isEnrolled(course._id) ? (
                    <Button
                      className="w-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEnroll(course._id);
                      }}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      {t('learning.enroll', 'Enroll')}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectCourse(course);
                      }}
                    >
                      {getEnrollmentProgress(course._id) === 0
                        ? t('learning.startCourse', 'Start Course')
                        : getEnrollmentProgress(course._id) === 100
                          ? t('learning.completed', 'Completed')
                          : t('learning.continueCourse', 'Continue')}
                      <ChevronRight className="h-4 w-4 ml-2" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
