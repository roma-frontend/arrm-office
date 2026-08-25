'use client';

import { useTranslation } from 'react-i18next';
import { Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetBody,
  SheetFooter,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus } from 'lucide-react';

type LessonForm = {
  title: string;
  description: string;
  contentType: 'video' | 'text' | 'quiz' | 'mixed';
  videoUrl: string;
  textContent: string;
  durationMinutes: string;
  isPreview: boolean;
};

interface LessonFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: LessonForm;
  setForm: (form: LessonForm) => void;
  isEdit: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}

export function LessonFormDialog({
  open,
  onOpenChange,
  form,
  setForm,
  isEdit,
  onSubmit,
  onCancel,
}: LessonFormDialogProps) {
  const { t } = useTranslation();

  const getVideoEmbedUrl = (url: string): string => {
    if (!url) return url;
    const youtubeMatch = url.match(
      /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^\"&?\/\s]{11})/,
    );
    if (youtubeMatch) {
      return `https://www.youtube.com/embed/${youtubeMatch[1]}`;
    }
    return url;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="md" closeLabel={t('common.close', 'Close')}>
        <SheetHeader>
          <SheetTitle>
            {isEdit
              ? t('learning.editLesson', 'Edit Lesson')
              : t('learning.createLesson', 'Create Lesson')}
          </SheetTitle>
        </SheetHeader>
        <SheetBody className="space-y-4">
          <div>
            <label className="text-sm font-medium">
              {t('learning.lessonTitle', 'Lesson Title')} *
            </label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={t('learning.lessonTitlePlaceholder', 'Enter lesson title')}
            />
          </div>
          <div>
            <label className="text-sm font-medium">
              {t('learning.lessonDescription', 'Description')}
            </label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder={t('learning.lessonDescriptionPlaceholder', 'Enter lesson description')}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">
                {t('learning.contentType', 'Content Type')}
              </label>
              <Select
                value={form.contentType}
                onValueChange={(value) =>
                  setForm({
                    ...form,
                    contentType: value as 'video' | 'text' | 'quiz' | 'mixed',
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="video">{t('learning.video', 'Video')}</SelectItem>
                  <SelectItem value="text">{t('learning.text', 'Text')}</SelectItem>
                  <SelectItem value="quiz">{t('learning.quiz', 'Quiz')}</SelectItem>
                  <SelectItem value="mixed">{t('learning.mixed', 'Mixed')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">
                {t('learning.durationMinutes', 'Duration (minutes)')}
              </label>
              <Input
                type="number"
                min="0"
                value={form.durationMinutes}
                onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
                placeholder={t('learning.durationPlaceholder', 'e.g. 30')}
              />
            </div>
          </div>
          {form.contentType === 'video' && (
            <div>
              <label className="text-sm font-medium">{t('learning.videoUrl', 'Video URL')}</label>
              <Input
                value={form.videoUrl}
                onChange={(e) => setForm({ ...form, videoUrl: e.target.value })}
                placeholder={t('learning.videoUrlPlaceholder', 'https://...')}
              />
            </div>
          )}
          {(form.contentType === 'text' || form.contentType === 'mixed') && (
            <div>
              <label className="text-sm font-medium">
                {t('learning.textContent', 'Text Content')}
              </label>
              <Textarea
                value={form.textContent}
                onChange={(e) => setForm({ ...form, textContent: e.target.value })}
                placeholder={t('learning.textContentPlaceholder', 'Enter lesson content')}
                className="min-h-[150px]"
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isPreview"
              checked={form.isPreview}
              onChange={(e) => setForm({ ...form, isPreview: e.target.checked })}
              className="h-4 w-4 rounded border-(--border-strong)"
            />
            <label htmlFor="isPreview" className="text-sm font-medium">
              {t('learning.preview', 'Preview')}
            </label>
          </div>
          {form.isPreview && form.contentType === 'video' && form.videoUrl && (
            <div className="rounded-lg border overflow-hidden">
              <div className="aspect-video bg-black flex items-center justify-center">
                <iframe
                  src={getVideoEmbedUrl(form.videoUrl)}
                  className="w-full h-full"
                  allowFullScreen
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  title={form.title || 'Video preview'}
                />
              </div>
            </div>
          )}
          {form.isPreview && form.contentType === 'video' && !form.videoUrl && (
            <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              <Video className="h-6 w-6 mx-auto mb-1 opacity-50" />
              {t('learning.enterUrlToPreview', 'Enter a video URL to see a preview')}
            </div>
          )}
        </SheetBody>
        <SheetFooter>
          <Button variant="outline" onClick={onCancel}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={onSubmit}>
            <Plus className="h-4 w-4 mr-2" />
            {isEdit
              ? t('learning.updateLesson', 'Update Lesson')
              : t('learning.createLesson', 'Create Lesson')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
