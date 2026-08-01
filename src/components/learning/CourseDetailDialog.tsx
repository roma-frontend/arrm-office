'use client';

import { useTranslation } from 'react-i18next';
import { Id } from '../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Plus, ChevronRight, Video, FileText, HelpCircle } from 'lucide-react';

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

interface CourseDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course: CourseWithLessons | null;
  courseWithLessons: CourseWithLessonsDetail | undefined;
  isAdmin: boolean;
  isEnrolled: boolean;
  onEnroll: (courseId: Id<'courses'>) => void;
  onPublishCourse: () => void;
  onOpenLessonPlayer: (course: CourseWithLessons, lessons: Lesson[], index: number) => void;
  onOpenCreateLesson: () => void;
  onOpenEditLesson: (lesson: Lesson) => void;
  onDeleteLesson: (lessonId: Id<'lessons'>) => void;
}

const difficultyColors: Record<string, string> = {
  beginner: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  intermediate: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  advanced: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

const contentTypeIcons: Record<string, typeof Video> = {
  video: Video,
  text: FileText,
  quiz: HelpCircle,
  mixed: FileText,
};

export function CourseDetailDialog({
  open,
  onOpenChange,
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
}: CourseDetailDialogProps) {
  const { t } = useTranslation();

  if (!course) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{course.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge className={difficultyColors[course.difficulty]}>
              {t(`learning.${course.difficulty}`, course.difficulty)}
            </Badge>
            <Badge variant="outline">{course.category}</Badge>
            {course.isMandatory && (
              <Badge variant="destructive">{t('learning.mandatory', 'Mandatory')}</Badge>
            )}
          </div>

          <p className="text-muted-foreground">
            {course.description || t('learning.noDescription', 'No description available')}
          </p>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-medium">{t('learning.instructor', 'Instructor')}</p>
              <p className="text-muted-foreground">{course.creatorName}</p>
            </div>
            <div>
              <p className="font-medium">{t('learning.lessons', 'Lessons')}</p>
              <p className="text-muted-foreground">{course.lessonCount}</p>
            </div>
            {course.estimatedHours && (
              <div>
                <p className="font-medium">{t('learning.estimatedHours', 'Estimated Hours')}</p>
                <p className="text-muted-foreground">{course.estimatedHours}h</p>
              </div>
            )}
          </div>

          {/* Lessons List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{t('lessons.title', 'Lessons')}</h3>
              {isAdmin && (
                <Button size="sm" variant="outline" onClick={onOpenCreateLesson}>
                  <Plus className="h-3 w-3 mr-1" />
                  {t('learning.createLesson', 'Add Lesson')}
                </Button>
              )}
            </div>

            {courseWithLessons?.lessons && courseWithLessons.lessons.length > 0 ? (
              courseWithLessons.lessons.map((lesson, index: number) => {
                const ContentTypeIcon = contentTypeIcons[lesson.contentType] || FileText;
                return (
                  <div
                    key={lesson._id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div
                      className="flex items-center gap-3 flex-1 cursor-pointer"
                      onClick={() => onOpenLessonPlayer(course, courseWithLessons.lessons, index)}
                    >
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-medium">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{lesson.title}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <ContentTypeIcon className="h-3 w-3" />
                          <span>{lesson.contentType}</span>
                          {lesson.durationMinutes && (
                            <>
                              <span>•</span>
                              <span>{lesson.durationMinutes} min</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    {isAdmin ? (
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" onClick={() => onOpenEditLesson(lesson)}>
                          {t('common.edit', 'Edit')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => onDeleteLesson(lesson._id)}
                        >
                          {t('common.delete', 'Delete')}
                        </Button>
                      </div>
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t('learning.noLessons', 'No lessons added yet')}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.close', 'Close')}
            </Button>
            {isAdmin &&
              courseWithLessons?.lessons &&
              courseWithLessons.lessons.length > 0 &&
              !course.isPublished && (
                <Button onClick={onPublishCourse}>{t('learning.publish', 'Publish Course')}</Button>
              )}
            {!isEnrolled && (
              <Button onClick={() => onEnroll(course._id)}>
                <Plus className="h-4 w-4 mr-2" />
                {t('learning.enroll', 'Enroll')}
              </Button>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
