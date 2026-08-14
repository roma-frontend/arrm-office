'use client';

import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

type CourseForm = {
  title: string;
  description: string;
  category: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedHours: string;
  isMandatory: boolean;
  tags: string;
};

interface CreateCourseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: CourseForm;
  setForm: (form: CourseForm) => void;
  onSubmit: () => void;
}

export function CreateCourseDialog({
  open,
  onOpenChange,
  form,
  setForm,
  onSubmit,
}: CreateCourseDialogProps) {
  const { t } = useTranslation();

  return (
    <Sheet
      open={open}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) {
          setForm({
            title: '',
            description: '',
            category: '',
            difficulty: 'beginner',
            estimatedHours: '',
            isMandatory: false,
            tags: '',
          });
        }
      }}
    >
      <SheetContent side="right" size="md" closeLabel={t('common.close', 'Close')}>
        <SheetHeader>
          <SheetTitle>{t('learning.createCourse', 'Create Course')}</SheetTitle>
        </SheetHeader>
        <SheetBody className="space-y-4">
          <div>
            <label className="text-sm font-medium">{t('orgChart.nodeName', 'Name')} *</label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={t('learning.courseTitle', 'Course title')}
            />
          </div>
          <div>
            <label className="text-sm font-medium">
              {t('learning.courseDescription', 'Description')}
            </label>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder={t('learning.courseDescription', 'Course description')}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">{t('learning.category', 'Category')} *</label>
              <Input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder={t('learning.enterCategory', 'e.g. Compliance, Technical')}
              />
            </div>
            <div>
              <label className="text-sm font-medium">
                {t('learning.difficulty', 'Difficulty')}
              </label>
              <Select
                value={form.difficulty}
                onValueChange={(value) =>
                  setForm({
                    ...form,
                    difficulty: value as 'beginner' | 'intermediate' | 'advanced',
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="beginner">{t('learning.beginner', 'Beginner')}</SelectItem>
                  <SelectItem value="intermediate">
                    {t('learning.intermediate', 'Intermediate')}
                  </SelectItem>
                  <SelectItem value="advanced">{t('learning.advanced', 'Advanced')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">
                {t('learning.estimatedHours', 'Estimated Hours')}
              </label>
              <Input
                type="number"
                min="0"
                value={form.estimatedHours}
                onChange={(e) => setForm({ ...form, estimatedHours: e.target.value })}
                placeholder={t('learning.estimatedHours', 'Estimated Hours')}
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t('learning.tags', 'Tags')}</label>
              <Input
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder={t('learning.commaSeparated', 'Comma separated')}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isMandatory"
              checked={form.isMandatory}
              onChange={(e) => setForm({ ...form, isMandatory: e.target.checked })}
              className="h-4 w-4 rounded border-(--border-strong)"
            />
            <label htmlFor="isMandatory" className="text-sm font-medium">
              {t('learning.mandatory', 'Mandatory')}
            </label>
          </div>
        </SheetBody>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={onSubmit}>
            <Plus className="h-4 w-4 mr-2" />
            {t('learning.createCourse', 'Create Course')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
