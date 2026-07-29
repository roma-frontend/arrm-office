/**
 * Create Asset Wizard — пошаговая форма создания актива
 * Использует универсальный Wizard компонент
 */
'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Wizard, WizardStep, useWizardContext } from '@/components/ui/wizard';
import { TextInputStep, SelectStep, TextareaStep } from '@/components/ui/wizard-step-components';
import { Monitor, Laptop, Smartphone, Mouse, Sofa, Key, Car, Package } from 'lucide-react';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';

interface AssetWizardProps {
  orgId: Id<'organizations'>;
  userId: Id<'users'>;
  onComplete?: () => void;
  onCancel?: () => void;
}

const CATEGORY_OPTIONS = [
  { value: 'laptop', labelKey: 'assets.category.laptop', icon: <Laptop className="w-5 h-5" /> },
  { value: 'monitor', labelKey: 'assets.category.monitor', icon: <Monitor className="w-5 h-5" /> },
  { value: 'phone', labelKey: 'assets.category.phone', icon: <Smartphone className="w-5 h-5" /> },
  { value: 'tablet', labelKey: 'assets.category.tablet', icon: <Smartphone className="w-5 h-5" /> },
  {
    value: 'peripheral',
    labelKey: 'assets.category.peripheral',
    icon: <Mouse className="w-5 h-5" />,
  },
  { value: 'furniture', labelKey: 'assets.category.furniture', icon: <Sofa className="w-5 h-5" /> },
  {
    value: 'software_license',
    labelKey: 'assets.category.software_license',
    icon: <Key className="w-5 h-5" />,
  },
  { value: 'vehicle', labelKey: 'assets.category.vehicle', icon: <Car className="w-5 h-5" /> },
  { value: 'other', labelKey: 'assets.category.other', icon: <Package className="w-5 h-5" /> },
];

const CONDITION_OPTIONS = [
  { value: 'new', labelKey: 'assets.condition.new' },
  { value: 'good', labelKey: 'assets.condition.good' },
  { value: 'fair', labelKey: 'assets.condition.fair' },
  { value: 'poor', labelKey: 'assets.condition.poor' },
  { value: 'damaged', labelKey: 'assets.condition.damaged' },
];

function ReviewCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-background-subtle border border-border">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value || '—'}</span>
    </div>
  );
}

export default function AssetWizard({ orgId, userId, onComplete, onCancel }: AssetWizardProps) {
  const { t } = useTranslation();
  const createAsset = useMutation(api.assets.createAsset);

  const steps: WizardStep[] = [
    {
      id: 'basic-info',
      title: t('assets.wizard.step1', 'Basic Info'),
      description: t('assets.wizard.step1Desc', 'Asset name and category'),
      validation: (data) => !!data.name && String(data.name).trim().length > 0,
      content: (
        <div className="space-y-4">
          <TextInputStep
            field="name"
            label={t('assets.name')}
            placeholder={t('assets.namePlaceholder')}
            required
          />
          <SelectStep
            field="category"
            label={t('assets.categoryLabel')}
            options={CATEGORY_OPTIONS.map((opt) => ({
              value: opt.value,
              label: t(opt.labelKey),
              icon: opt.icon,
            }))}
            placeholder={t('assets.categoryLabel')}
            defaultValue="laptop"
            required
          />
        </div>
      ),
    },
    {
      id: 'details',
      title: t('assets.wizard.step2', 'Details'),
      description: t('assets.wizard.step2Desc', 'Brand, model, serial number and location'),
      content: (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <TextInputStep
              field="brand"
              label={t('assets.brand')}
              placeholder={t('assets.brandPlaceholder')}
            />
            <TextInputStep
              field="model"
              label={t('assets.model')}
              placeholder={t('assets.modelPlaceholder')}
            />
          </div>
          <TextInputStep
            field="serialNumber"
            label={t('assets.serialNumber')}
            placeholder={t('assets.serialPlaceholder')}
          />
          <TextInputStep
            field="location"
            label={t('assets.location')}
            placeholder={t('assets.locationPlaceholder')}
          />
        </div>
      ),
    },
    {
      id: 'purchase',
      title: t('assets.wizard.step3', 'Purchase & Condition'),
      description: t('assets.wizard.step3Desc', 'Purchase date, price and condition'),
      content: (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <TextInputStep field="purchaseDate" label={t('assets.purchaseDate')} type="date" />
            <TextInputStep
              field="purchasePrice"
              label={t('assets.purchasePrice')}
              type="number"
              placeholder="0"
            />
          </div>
          <SelectStep
            field="condition"
            label={t('assets.conditionLabel', 'Condition')}
            options={CONDITION_OPTIONS.map((opt) => ({
              value: opt.value,
              label: t(opt.labelKey),
            }))}
            defaultValue="new"
          />
          <TextareaStep
            field="notes"
            label={t('assets.notes')}
            placeholder={t('assets.notesPlaceholder')}
            rows={3}
          />
        </div>
      ),
    },
    {
      id: 'review',
      title: t('assets.wizard.step4', 'Review'),
      description: t('assets.wizard.step4Desc', 'Confirm asset details before creating'),
      content: <AssetWizardReview />,
    },
  ];

  const handleSubmit = async (
    data: Record<string, string | number | boolean | string[] | null>,
  ) => {
    try {
      await createAsset({
        organizationId: orgId,
        name: String(data.name).trim(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        category: String(data.category || 'laptop') as any,
        brand: data.brand ? String(data.brand).trim() : undefined,
        model: data.model ? String(data.model).trim() : undefined,
        serialNumber: data.serialNumber ? String(data.serialNumber).trim() : undefined,
        purchaseDate: data.purchaseDate ? new Date(String(data.purchaseDate)).getTime() : undefined,
        purchasePrice: data.purchasePrice ? Number(data.purchasePrice) : undefined,
        location: data.location ? String(data.location).trim() : undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        condition: (data.condition || 'new') as any,
        notes: data.notes ? String(data.notes).trim() : undefined,
        createdBy: userId,
      });
      toast.success(t('assets.createdSuccess'));
      onComplete?.();
    } catch (error) {
      toast.error(t('assets.createdError'));
      console.error(error);
    }
  };

  return (
    <Wizard
      steps={steps}
      onComplete={handleSubmit}
      onCancel={onCancel}
      submitLabel={t('assets.create')}
      cancelLabel={t('common.cancel')}
      defaultStepData={{ category: 'laptop', condition: 'new' }}
    />
  );
}

/** Review step — shows a compact summary of the entered data */
function AssetWizardReview() {
  const { t } = useTranslation();
  const { stepData } = useWizardContext();

  const categoryLabel = t(`assets.category.${stepData.category || 'other'}`);

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          {t('assets.wizard.reviewHint', 'Please review the asset details before creating.')}
        </p>
        <div className="space-y-1.5">
          <ReviewCard label={t('assets.name')} value={String(stepData.name || '')} />
          <ReviewCard label={t('assets.categoryLabel')} value={categoryLabel} />
          <ReviewCard label={t('assets.brand')} value={String(stepData.brand || '')} />
          <ReviewCard label={t('assets.model')} value={String(stepData.model || '')} />
          <ReviewCard
            label={t('assets.serialNumber')}
            value={String(stepData.serialNumber || '')}
          />
          <ReviewCard label={t('assets.location')} value={String(stepData.location || '')} />
          <ReviewCard
            label={t('assets.purchaseDate')}
            value={stepData.purchaseDate ? String(stepData.purchaseDate) : '—'}
          />
          <ReviewCard
            label={t('assets.purchasePrice')}
            value={stepData.purchasePrice ? String(stepData.purchasePrice) : '—'}
          />
          <ReviewCard
            label={t('assets.conditionLabel', 'Condition')}
            value={t(`assets.condition.${stepData.condition || 'new'}`)}
          />
          {stepData.notes && (
            <ReviewCard label={t('assets.notes')} value={String(stepData.notes)} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
