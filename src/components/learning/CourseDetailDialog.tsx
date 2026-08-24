'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Id } from '../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetBody,
  SheetFooter,
} from '@/components/ui/sheet';
import { Plus, ChevronRight, Video, FileText, HelpCircle, Play } from 'lucide-react';
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
  onOpenEditCourse: (course: CourseWithLessons) => void;
  onOpenLessonPlayer: (course: CourseWithLessons, lessons: Lesson[], index: number) => void;
  onOpenCreateLesson: () => void;
  onOpenEditLesson: (lesson: Lesson) => void;
  onDeleteLesson: (lessonId: Id<'lessons'>) => void;
}

const difficultyColors: Record<string, string> = {
  beginner:
    'bg-(--success-quiet) text-(--success-text) dark:bg-(--success-solid) dark:text-(--success-text)',
  intermediate:
    'bg-(--warning-quiet) text-(--warning-text) dark:bg-(--warning-solid) dark:text-(--warning-text)',
  advanced:
    'bg-(--danger-quiet) text-(--danger-text) dark:bg-(--danger-solid) dark:text-(--danger-text)',
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
  onOpenEditCourse,
  onOpenLessonPlayer,
  onOpenCreateLesson,
  onOpenEditLesson,
  onDeleteLesson,
}: CourseDetailDialogProps) {
  const { t } = useTranslation();
  const [previewLesson, setPreviewLesson] = useState<Lesson | null>(null);

  const getEmbedUrl = (url: string): string => {
    if (!url) return url;
    const youtubeMatch = url.match(
      /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([\w-]{11})/,
    );
    if (youtubeMatch) {
      return `https://www.youtube.com/embed/${youtubeMatch[1]}?autoplay=1&mute=1`;
    }
    // For direct video URLs, return as-is
    return url;
  };

  if (!course) return null;

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg" closeLabel={t('common.close', 'Close')}>
        <SheetHeader>
          <SheetTitle>{course.title}</SheetTitle>
        </SheetHeader>
        <SheetBody className="space-y-4">
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
              <EmployeeHoverCard userId={course.createdBy as string} name={course.creatorName}>
                <p className="text-muted-foreground cursor-pointer underline-offset-2 hover:underline">
                  {course.creatorName}
                </p>
              </EmployeeHoverCard>
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
                    <div className="flex items-center gap-1">
                      {lesson.contentType === 'video' && lesson.videoUrl && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1 text-(--brand-text)"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewLesson(lesson);
                          }}
                        >
                          <Play className="h-3 w-3" />
                          {t('learning.preview', 'Preview')}
                        </Button>
                      )}
                      {isAdmin ? (
                        <>
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
                        </>
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t('learning.noLessons', 'No lessons added yet')}
              </p>
            )}
          </div>

          <SheetFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.close', 'Close')}
            </Button>
            {isAdmin && (
              <Button variant="outline" onClick={() => onOpenEditCourse(course)}>
                {t('common.edit', 'Edit')}
              </Button>
            )}
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
          </SheetFooter>
        </SheetBody>
      </SheetContent>

    </Sheet>

      {/* Video Preview Modal — rendered via portal to escape the Sheet's stacking context */}
      {previewLesson && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setPreviewLesson(null)}
        >
          <div
            className="relative bg-(--card) rounded-2xl border border-(--border) shadow-2xl overflow-hidden w-full max-w-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-(--border)">
              <div className="flex items-center gap-2">
                <Play className="h-4 w-4 text-(--brand-text)" />
                <span className="font-medium text-sm text-(--text-primary)">{previewLesson.title}</span>
              </div>
              <button
                onClick={() => setPreviewLesson(null)}
                className="p-1 rounded-lg hover:bg-(--background-subtle) transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {/* Video */}
            <div className="aspect-video bg-black">
              <iframe
                src={getEmbedUrl(previewLesson.videoUrl ?? '')}
                className="w-full h-full"
                allow="autoplay; encrypted-media"
                allowFullScreen
                title={previewLesson.title}
              />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
