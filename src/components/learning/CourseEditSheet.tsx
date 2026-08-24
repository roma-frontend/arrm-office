'use client';

import { useTranslation } from 'react-i18next';
import { Id } from '../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetBody,
  SheetFooter,
} from '@/components/ui/sheet';
import { Save } from 'lucide-react';

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

interface CourseEditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course: CourseWithLessons | null;
  onSave: (updates: {
    title: string;
    description: string;
    category: string;
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    estimatedHours: number | undefined;
    isMandatory: boolean;
    tags: string[];
    isPublished: boolean;
  }) => void;
}

export function CourseEditSheet({ open, onOpenChange, course, onSave }: CourseEditSheetProps) {
  const { t } = useTranslation();

  if (!course) return null;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    onSave({
      title: formData.get('title') as string,
      description: formData.get('description') as string,
      category: formData.get('category') as string,
      difficulty: formData.get('difficulty') as 'beginner' | 'intermediate' | 'advanced',
      estimatedHours: formData.get('estimatedHours')
        ? Number(formData.get('estimatedHours'))
        : undefined,
      isMandatory: formData.get('isMandatory') === 'on',
      tags: (formData.get('tags') as string)
        ? (formData.get('tags') as string)
            .split(',')
            .map((t: string) => t.trim())
            .filter(Boolean)
        : [],
      isPublished: formData.get('isPublished') === 'on',
    });

    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg" closeLabel={t('common.close', 'Close')}>
        <form onSubmit={handleSubmit}>
          <SheetHeader>
            <SheetTitle>{t('learning.editCourse', 'Edit Course')}</SheetTitle>
          </SheetHeader>
          <SheetBody className="space-y-4 mt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-(--text-primary)">
                {t('learning.courseTitle', 'Course Title')} *
              </label>
              <Input
                name="title"
                defaultValue={course.title}
                required
                placeholder={t('learning.courseTitlePlaceholder', 'Enter course title')}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-(--text-primary)">
                {t('learning.description', 'Description')}
              </label>
              <Textarea
                name="description"
                defaultValue={course.description || ''}
                rows={3}
                placeholder={t('learning.descriptionPlaceholder', 'Enter course description')}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-(--text-primary)">
                  {t('learning.category', 'Category')} *
                </label>
                <Input
                  name="category"
                  defaultValue={course.category}
                  required
                  placeholder={t('learning.categoryPlaceholder', 'e.g. HR & Compliance')}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-(--text-primary)">
                  {t('learning.difficulty', 'Difficulty')}
                </label>
                <select
                  name="difficulty"
                  defaultValue={course.difficulty}
                  className="w-full rounded-md border border-(--border) bg-(--background) px-3 py-2 text-sm"
                >
                  <option value="beginner">{t('learning.beginner', 'Beginner')}</option>
                  <option value="intermediate">{t('learning.intermediate', 'Intermediate')}</option>
                  <option value="advanced">{t('learning.advanced', 'Advanced')}</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-(--text-primary)">
                {t('learning.estimatedHours', 'Estimated Hours')}
              </label>
              <Input
                name="estimatedHours"
                type="number"
                min="0"
                defaultValue={course.estimatedHours || ''}
                placeholder={t('learning.estimatedHoursPlaceholder', 'e.g. 4')}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-(--text-primary)">
                {t('learning.tags', 'Tags')}
              </label>
              <Input
                name="tags"
                defaultValue={course.tags?.join(', ') || ''}
                placeholder={t('learning.tagsPlaceholder', 'Comma-separated tags')}
              />
            </div>

            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-(--text-primary)">
                  {t('learning.mandatory', 'Mandatory Course')}
                </label>
                <input
                  type="checkbox"
                  name="isMandatory"
                  defaultChecked={course.isMandatory || false}
                  className="h-4 w-4 rounded border-(--border)"
                />
              </div>

              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-(--text-primary)">
                  {t('learning.published', 'Published')}
                </label>
                <input
                  type="checkbox"
                  name="isPublished"
                  defaultChecked={course.isPublished || false}
                  className="h-4 w-4 rounded border-(--border)"
                />
              </div>
            </div>
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit">
              <Save className="h-4 w-4 mr-2" />
              {t('common.save', 'Save Changes')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
