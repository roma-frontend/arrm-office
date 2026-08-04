'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Wizard, WizardStep } from '@/components/ui/wizard';
import { TextInputStep, TextareaStep, SelectStep } from '@/components/ui/wizard-step-components';
import {
  FileText,
  Plane,
  Utensils,
  Hotel,
  Car,
  Package,
  Laptop,
  GraduationCap,
  Heart,
  Phone,
  Receipt,
} from 'lucide-react';
import { logger } from '@/lib/logger';

const _CATEGORY_ICONS: Record<string, React.ReactNode> = {
  travel: <Plane className="w-5 h-5" />,
  meals: <Utensils className="w-5 h-5" />,
  accommodation: <Hotel className="w-5 h-5" />,
  transport: <Car className="w-5 h-5" />,
  office_supplies: <Package className="w-5 h-5" />,
  software: <Laptop className="w-5 h-5" />,
  training: <GraduationCap className="w-5 h-5" />,
  health: <Heart className="w-5 h-5" />,
  communication: <Phone className="w-5 h-5" />,
  other: <FileText className="w-5 h-5" />,
};

const _CATEGORY_COLORS: Record<string, string> = {
  travel: 'bg-blue-500/20 text-blue-400',
  meals: 'bg-orange-500/20 text-orange-400',
  accommodation: 'bg-purple-500/20 text-purple-400',
  transport: 'bg-green-500/20 text-green-400',
  office_supplies: 'bg-yellow-500/20 text-yellow-400',
  software: 'bg-cyan-500/20 text-cyan-400',
  training: 'bg-indigo-500/20 text-indigo-400',
  health: 'bg-red-500/20 text-red-400',
  communication: 'bg-teal-500/20 text-teal-400',
  other: 'bg-gray-500/20 text-gray-400',
};

interface CategoryWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: Id<'organizations'>;
  userId: Id<'users'>;
  onSuccess?: () => void;
}

function CategoryInfoStep() {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <TextInputStep
        field="name"
        label={t('expenses.categoryName')}
        placeholder={t('expenses.categoryName')}
        required
      />
      <TextInputStep
        field="key"
        label={t('expenses.categoryKey')}
        placeholder="e.g. travel, meals..."
        required
      />
      <TextareaStep
        field="description"
        label={t('expenses.categoryDescription')}
        placeholder={t('expenses.categoryDescription')}
        rows={3}
      />
    </div>
  );
}

function CategoryLimitsStep() {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <TextInputStep
        field="dailyLimit"
        label={t('expenses.dailyLimit')}
        placeholder="0"
        type="number"
      />
      <TextInputStep
        field="monthlyLimit"
        label={t('expenses.monthlyLimit')}
        placeholder="0"
        type="number"
      />
      <SelectStep
        field="requiresReceipt"
        label={t('expenses.requiresReceipt')}
        options={[
          { value: 'true', label: t('common.yes') },
          { value: 'false', label: t('common.no') },
        ]}
        defaultValue="false"
      />
      <SelectStep
        field="requiresApproval"
        label={t('expenses.requiresApproval')}
        options={[
          { value: 'true', label: t('common.yes') },
          { value: 'false', label: t('common.no') },
        ]}
        defaultValue="true"
      />
    </div>
  );
}

export default function CategoryWizard({
  open,
  onOpenChange,
  organizationId,
  userId,
  onSuccess,
}: CategoryWizardProps) {
  const { t } = useTranslation();
  const [resetKey, setResetKey] = useState(0);
  const createCategory = useMutation(api.expenses.createExpenseCategory);

  const steps: WizardStep[] = [
    {
      id: 'info',
      title: t('expenses.categoryInfo'),
      description: t('expenses.enterCategoryInfo'),
      icon: <Receipt className="w-5 h-5" />,
      content: <CategoryInfoStep />,
      validation: (data) =>
        !!data.name &&
        String(data.name).trim().length > 0 &&
        !!data.key &&
        String(data.key).trim().length > 0,
    },
    {
      id: 'limits',
      title: t('expenses.limitsAndRules'),
      description: t('expenses.setLimitsAndRules'),
      icon: <FileText className="w-5 h-5" />,
      content: <CategoryLimitsStep />,
      validation: () => true,
    },
  ];

  const handleComplete = async (
    data: Record<string, string | number | boolean | null | string[]>,
  ) => {
    try {
      await createCategory({
        organizationId,
        name: String(data.name),
        key: String(data.key),
        description: (data.description as string) || '',
        dailyLimit: data.dailyLimit ? Number(data.dailyLimit) : undefined,
        monthlyLimit: data.monthlyLimit ? Number(data.monthlyLimit) : undefined,
        requiresReceipt: data.requiresReceipt === 'true',
        requiresApproval: data.requiresApproval === 'true',
        isActive: true,
        createdBy: userId,
      });

      toast.success(t('expenses.categoryCreated'));
      onOpenChange(false);
      setResetKey((k) => k + 1);
      onSuccess?.();
    } catch (error) {
      logger.error('Error creating category:', error);
      toast.error(t('expenses.errorCreatingCategory'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] p-0 gap-0 max-h-[90vh] flex flex-col overflow-visible">
        <div className="px-5 py-4 border-b border-(--border) bg-gradient-to-r from-(--primary)/10 to-transparent shrink-0">
          <DialogTitle>{t('expenses.newCategory')}</DialogTitle>
          <DialogDescription>{t('expenses.newCategoryDesc')}</DialogDescription>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <Wizard
            key={resetKey}
            steps={steps}
            onComplete={handleComplete}
            onCancel={() => onOpenChange(false)}
            submitLabel={t('expenses.createCategory')}
            showStepper={false}
            draftKey="expense-category"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
