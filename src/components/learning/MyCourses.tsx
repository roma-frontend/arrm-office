'use client';

import { useTranslation } from 'react-i18next';
import { Id } from '../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { GraduationCap, Clock, Play } from 'lucide-react';

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

interface MyCoursesProps {
  myEnrollments: EnrollmentWithCourse[] | undefined;
  onOpenCourse: (course: NonNullable<EnrollmentWithCourse['course']>) => void;
  onGoToCatalog: () => void;
}

const statusColors: Record<string, string> = {
  completed:
    'bg-(--success-quiet) text-(--success-text) dark:bg-(--success-solid) dark:text-(--success-text)',
  in_progress: 'bg-(--brand-quiet) text-(--brand-text) dark:bg-(--brand) dark:text-(--brand-text)',
  not_started: 'bg-(--surface-2) text-(--text-3) dark:bg-(--surface-3) dark:text-(--text-3)',
  expired:
    'bg-(--danger-quiet) text-(--danger-text) dark:bg-(--danger-solid) dark:text-(--danger-text)',
};

export function MyCourses({ myEnrollments, onOpenCourse, onGoToCatalog }: MyCoursesProps) {
  const { t } = useTranslation();

  if (!myEnrollments || myEnrollments.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <GraduationCap className="h-16 w-16 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">
            {t('learning.noEnrollments', 'No enrolled courses')}
          </h3>
          <p className="text-muted-foreground">
            {t('learning.noEnrollmentsDesc', 'Browse the course catalog to get started')}
          </p>
          <Button className="mt-4" onClick={onGoToCatalog}>
            <GraduationCap className="h-4 w-4 mr-2" />
            {t('learning.browseCatalog', 'Browse Catalog')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {myEnrollments.map((enrollment) => (
        <Card key={enrollment._id} className="hover:shadow-md transition-shadow">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex-1">
                <h3 className="text-lg font-semibold">{enrollment.courseTitle}</h3>
                <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Badge className={statusColors[enrollment.status]}>
                      {t(`learning.${enrollment.status}`, enrollment.status)}
                    </Badge>
                  </span>
                  {enrollment.startedAt && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {new Date(enrollment.startedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="text-left sm:text-right">
                  <p className="text-2xl font-bold">{enrollment.progress ?? 0}%</p>
                  <p className="text-sm text-muted-foreground">
                    {t('learning.progress', 'Progress')}
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => enrollment.course && onOpenCourse(enrollment.course)}
                >
                  <Play className="h-4 w-4 mr-2" />
                  {enrollment.progress === 0
                    ? t('learning.startCourse', 'Start Course')
                    : enrollment.progress === 100
                      ? t('learning.review', 'Review')
                      : t('learning.continueCourse', 'Continue')}
                </Button>
              </div>
            </div>
            <Progress value={enrollment.progress ?? 0} className="mt-4 h-2" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
