'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Wizard, WizardStep } from '@/components/ui/wizard';
import {
  TextInputStep,
  TextareaStep,
  SelectStep,
  CardSelectionStep,
} from '@/components/ui/wizard-step-components';
import {
  Receipt,
  Plane,
  Utensils,
  Hotel,
  Car,
  Package,
  Laptop,
  GraduationCap,
  Heart,
  Phone,
  FileText,
} from 'lucide-react';

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
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

const CATEGORY_COLORS: Record<string, string> = {
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

interface ExpenseWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: Id<'organizations'>;
  userId: Id<'users'>;
  onSuccess?: () => void;
}

function CategoryStep() {
  const { t } = useTranslation();

  const categoryOptions = Object.keys(CATEGORY_ICONS).map((key) => ({
    value: key,
    title: t(`expenses.categoryNames.${key}`) || key,
    description: '',
    icon: CATEGORY_ICONS[key],
    color: CATEGORY_COLORS[key],
  }));

  return (
    <CardSelectionStep
      field="category"
      label={t('expenses.category')}
      options={categoryOptions}
      required
      columns={2}
    />
  );
}

function DetailsStep() {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <TextInputStep
        field="title"
        label={t('expenses.expenseTitle')}
        placeholder={t('expenses.expenseTitle')}
        required
      />
      <TextareaStep
        field="description"
        label={t('expenses.expenseDescription')}
        placeholder={t('expenses.expenseDescription')}
        rows={3}
      />
    </div>
  );
}

function AmountStep() {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <TextInputStep
        field="amount"
        label={t('expenses.amount')}
        placeholder="0.00"
        type="number"
        required
      />
      <SelectStep
        field="currency"
        label={t('expenses.currency')}
        options={[
          { value: 'AMD', label: 'AMD' },
          { value: 'USD', label: 'USD' },
          { value: 'EUR', label: 'EUR' },
          { value: 'RUB', label: 'RUB' },
        ]}
        defaultValue="AMD"
      />
      <TextInputStep
        field="expenseDate"
        label={t('expenses.date')}
        type="date"
        defaultValue={new Date().toISOString().split('T')[0]}
        required
      />
    </div>
  );
}

export default function ExpenseWizard({
  open,
  onOpenChange,
  organizationId,
  userId,
  onSuccess,
}: ExpenseWizardProps) {
  const { t } = useTranslation();
  const [resetKey, setResetKey] = useState(0);
  const createExpense = useMutation(api.expenses.createExpense);
  const submitExpense = useMutation(api.expenses.submitExpense);

  const steps: WizardStep[] = [
    {
      id: 'category',
      title: t('expenses.category'),
      description: t('expenses.selectCategory'),
      icon: <Receipt className="w-5 h-5" />,
      content: <CategoryStep />,
      validation: (data) => !!data.category && String(data.category).trim().length > 0,
    },
    {
      id: 'details',
      title: t('expenses.expenseDetails'),
      description: t('expenses.enterDetails'),
      icon: <FileText className="w-5 h-5" />,
      content: <DetailsStep />,
      validation: (data) => !!data.title && String(data.title).trim().length > 0,
    },
    {
      id: 'amount',
      title: t('expenses.amount'),
      description: t('expenses.enterAmount'),
      icon: <Receipt className="w-5 h-5" />,
      content: <AmountStep />,
      validation: (data) => {
        const amount = Number(data.amount);
        return !isNaN(amount) && amount > 0 && !!data.currency && !!data.expenseDate;
      },
    },
  ];

  const handleComplete = async (
    data: Record<string, string | number | boolean | null | string[]>,
  ) => {
    try {
      const amount = Number(data.amount);
      const expenseDate = new Date(data.expenseDate as string).getTime();

      const expenseId = await createExpense({
        organizationId,
        userId,
        title: String(data.title),
        description: (data.description as string) || '',
        category: String(data.category) as
          | 'travel'
          | 'meals'
          | 'accommodation'
          | 'transport'
          | 'office_supplies'
          | 'software'
          | 'training'
          | 'health'
          | 'communication'
          | 'other',
        amount,
        currency: String(data.currency),
        expenseDate,
        createdBy: userId,
      });

      await submitExpense({ expenseId });

      toast.success(t('expenses.expenseSubmitted'));
      onOpenChange(false);
      setResetKey((k) => k + 1);
      onSuccess?.();
    } catch (error) {
      console.error('Error creating expense:', error);
      toast.error(t('expenses.errorSubmitting'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] p-0 gap-0 max-h-[90vh] flex flex-col overflow-visible">
        <div className="px-5 py-4 border-b border-(--border) bg-gradient-to-r from-(--primary)/10 to-transparent shrink-0">
          <DialogTitle>{t('expenses.newExpense')}</DialogTitle>
          <DialogDescription>{t('expenses.subtitle')}</DialogDescription>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <Wizard
            key={resetKey}
            steps={steps}
            onComplete={handleComplete}
            onCancel={() => onOpenChange(false)}
            submitLabel={t('expenses.submit')}
            defaultStepData={{
              currency: 'AMD',
              expenseDate: new Date().toISOString().split('T')[0] ?? '',
            }}
            showStepper={false}
            draftKey="create-expense"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
