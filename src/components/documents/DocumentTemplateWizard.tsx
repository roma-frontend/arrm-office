'use client';

import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { useShallow } from 'zustand/shallow';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useWizardDraft } from '@/hooks/useWizardDraft';
import { WizardDraftNotice } from '@/components/ui/WizardDraftNotice';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  GripVertical,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type TemplateField = {
  id: string;
  label: string;
  type: 'text' | 'date' | 'signature';
  required: boolean;
  placeholder?: string;
};

type TemplateCategory = 'nda' | 'offer' | 'contract' | 'policy' | 'custom';

function SortableField({
  field,
  index,
  onUpdate,
  onRemove,
  t,
}: {
  field: TemplateField;
  index: number;
  onUpdate: (idx: number, updates: Partial<TemplateField>) => void;
  onRemove: (idx: number) => void;
  t: TFunction;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `field-${index}`,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-2 p-3 rounded-lg border bg-muted/30"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground mt-2"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1 space-y-2">
        <div className="flex gap-2">
          <div className="flex-1">
            <Label className="text-xs">{t('documents.fieldLabel')}</Label>
            <Input
              value={field.label}
              onChange={(e) => onUpdate(index, { label: e.target.value })}
              placeholder={t('documents.fieldPlaceholder', 'Field label')}
              className="text-sm"
            />
          </div>
          <div className="w-32">
            <Label className="text-xs">{t('documents.fieldType')}</Label>
            <Select
              value={field.type}
              onValueChange={(v) => onUpdate(index, { type: v as TemplateField['type'] })}
            >
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Text</SelectItem>
                <SelectItem value="date">Date</SelectItem>
                <SelectItem value="signature">Signature</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <Label className="text-xs">{t('documents.fieldPlaceholder', 'Placeholder')}</Label>
            <Input
              value={field.placeholder || ''}
              onChange={(e) => onUpdate(index, { placeholder: e.target.value })}
              placeholder="Enter placeholder text"
              className="text-sm"
            />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <Checkbox
              checked={field.required}
              onCheckedChange={(c) => onUpdate(index, { required: !!c })}
            />
            <Label className="text-xs">{t('documents.fieldRequired')}</Label>
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onRemove(index)}
        className="text-destructive hover:text-destructive/80 mt-2"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

interface DocumentTemplateWizardProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function DocumentTemplateWizard({
  open,
  onClose,
  onSuccess,
}: DocumentTemplateWizardProps) {
  const { t } = useTranslation();
  const user = useAuthStore(useShallow((s) => s.user));
  const selectedOrgId = useSelectedOrganization();
  const createTemplateMutation = useMutation(api.signatures.createTemplate);

  const [currentStep, setCurrentStep] = useState(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TemplateCategory>('custom');
  const [content, setContent] = useState('');
  const [fields, setFields] = useState<TemplateField[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState<'text' | 'date' | 'signature'>('text');
  const [newFieldRequired, setNewFieldRequired] = useState(true);
  const [newFieldPlaceholder, setNewFieldPlaceholder] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setFields((items) => {
        const oldIndex = items.findIndex((_, idx) => `field-${idx}` === active.id);
        const newIndex = items.findIndex((_, idx) => `field-${idx}` === over.id);
        if (oldIndex !== -1 && newIndex !== -1) {
          return arrayMove(items, oldIndex, newIndex);
        }
        return items;
      });
    }
  };

  const addField = useCallback(() => {
    if (!newFieldLabel.trim()) return;
    setFields((prev) => [
      ...prev,
      {
        id: `field_${Date.now()}`,
        label: newFieldLabel.trim(),
        type: newFieldType,
        required: newFieldRequired,
        placeholder: newFieldPlaceholder.trim() || undefined,
      },
    ]);
    setNewFieldLabel('');
    setNewFieldType('text');
    setNewFieldRequired(true);
    setNewFieldPlaceholder('');
  }, [newFieldLabel, newFieldType, newFieldRequired, newFieldPlaceholder]);

  const updateField = useCallback((idx: number, updates: Partial<TemplateField>) => {
    setFields((prev) => prev.map((f, i) => (i === idx ? { ...f, ...updates } : f)));
  }, []);

  const removeField = useCallback((idx: number) => {
    setFields((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const canGoNext = () => {
    switch (currentStep) {
      case 0:
        return !!title.trim() && !!category;
      case 1:
        return !!content.trim();
      case 2:
        return true;
      default:
        return true;
    }
  };

  // ── Черновик: данные переживают случайное закрытие модалки ─────────────
  const draftData = useMemo(
    () => ({ title, description, category, content, fields }),
    [title, description, category, content, fields],
  );

  const handleRestoreDraft = useCallback((d: typeof draftData, savedStep: number) => {
    setTitle(d.title ?? '');
    setDescription(d.description ?? '');
    if (d.category) setCategory(d.category);
    setContent(d.content ?? '');
    setFields(Array.isArray(d.fields) ? d.fields : []);
    setCurrentStep(Math.min(Math.max(savedStep, 0), 3));
  }, []);

  const draft = useWizardDraft({
    key: 'document-template',
    enabled: open,
    data: draftData,
    step: currentStep,
    defaults: { category: 'custom' as TemplateCategory },
    onRestore: handleRestoreDraft,
  });

  const { clearDraft } = draft;

  const handleStartOver = useCallback(() => {
    clearDraft();
    setTitle('');
    setDescription('');
    setCategory('custom');
    setContent('');
    setFields([]);
    setCurrentStep(0);
  }, [clearDraft]);

  const handleSubmit = async () => {
    if (!user?.id || !selectedOrgId) return;
    setIsSubmitting(true);
    try {
      await createTemplateMutation({
        organizationId: selectedOrgId as Id<'organizations'>,
        createdBy: user.id as Id<'users'>,
        title: title.trim(),
        description: description.trim() || undefined,
        category,
        content: content.trim(),
        fields,
      });
      toast.success(t('documents.templateCreated', 'Template created successfully'));
      clearDraft();
      onSuccess?.();
      onClose();
    } catch (error: unknown) {
      toast.error(
        (error as Error).message || t('documents.templateCreateError', 'Failed to create template'),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNext = () => {
    if (currentStep < 3) setCurrentStep((p) => p + 1);
    else handleSubmit();
  };

  const handleBack = () => {
    if (currentStep > 0) setCurrentStep((p) => p - 1);
  };

  const steps = [
    {
      id: 'info',
      title: t('documents.detailsStep', 'Details'),
      icon: <FileText className="w-4 h-4" />,
    },
    {
      id: 'content',
      title: t('documents.templateContent', 'Content'),
      icon: <FileText className="w-4 h-4" />,
    },
    {
      id: 'fields',
      title: t('documents.templateFields', 'Fields'),
      icon: <Plus className="w-4 h-4" />,
    },
    {
      id: 'review',
      title: t('documents.reviewStep', 'Review'),
      icon: <CheckCircle className="w-4 h-4" />,
    },
  ];

  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden max-h-[95vh]">
        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {t('documents.createTemplate', 'Create Document Template')}
          </DialogTitle>
          <DialogDescription>
            {t('documents.createTemplateDesc', 'Create a reusable template for document signing')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col">
          {/* Progress bar */}
          <div className="px-5 pt-4 pb-3">
            <div className="relative h-1.5 bg-muted rounded-full overflow-hidden mb-4">
              <div
                className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all duration-300 ease-in-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex items-center justify-between gap-1">
              {steps.map((step, idx) => {
                const isCompleted = idx < currentStep;
                const isCurrent = idx === currentStep;
                return (
                  <div key={step.id} className="flex flex-col items-center flex-1 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-200 shrink-0 ${
                        isCompleted
                          ? 'bg-primary border-primary text-primary-foreground'
                          : isCurrent
                            ? 'border-primary bg-background text-primary scale-110'
                            : 'border-muted-foreground/30 bg-background text-muted-foreground'
                      }`}
                    >
                      {isCompleted ? <CheckCircle className="w-4 h-4" /> : step.icon}
                    </div>
                    <p
                      className={`text-[10px] font-medium mt-1.5 text-center truncate w-full px-1 ${
                        isCurrent ? 'text-primary' : 'text-muted-foreground'
                      }`}
                    >
                      {step.title}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Step Content */}
          <div className="px-5 py-4 min-h-[300px] max-h-[50vh] overflow-y-auto">
            <WizardDraftNotice
              show={draft.restored}
              step={draft.restoredStep}
              onReset={handleStartOver}
            />

            {/* Step 1: Template Info */}
            {currentStep === 0 && (
              <div className="space-y-4">
                <div>
                  <Label>{t('documents.title')} *</Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t('documents.titlePlaceholder', 'Enter template title')}
                    autoFocus
                  />
                </div>
                <div>
                  <Label>{t('documents.description')}</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t(
                      'documents.descriptionPlaceholder',
                      'Enter template description',
                    )}
                    rows={3}
                  />
                </div>
                <div>
                  <Label>{t('documents.templateCategory')}</Label>
                  <Select
                    value={category}
                    onValueChange={(v) => setCategory(v as TemplateCategory)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nda">{t('documents.templateNDA', 'NDA')}</SelectItem>
                      <SelectItem value="offer">
                        {t('documents.templateOffer', 'Offer Letter')}
                      </SelectItem>
                      <SelectItem value="contract">
                        {t('documents.templateContract', 'Contract')}
                      </SelectItem>
                      <SelectItem value="policy">
                        {t('documents.templatePolicy', 'Policy')}
                      </SelectItem>
                      <SelectItem value="custom">
                        {t('documents.templateCustom', 'Custom')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Step 2: Content */}
            {currentStep === 1 && (
              <div className="space-y-4">
                <div>
                  <Label>{t('documents.templateContent')} *</Label>
                  <Textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder={t(
                      'documents.templateContentPlaceholder',
                      'Enter the template content here...',
                    )}
                    rows={10}
                    className="font-mono text-sm"
                    autoFocus
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('documents.contentTip', 'You can use markdown-like formatting for sections')}
                </p>
              </div>
            )}

            {/* Step 3: Fields */}
            {currentStep === 2 && (
              <div className="space-y-4">
                {/* Existing fields */}
                {fields.length > 0 && (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={fields.map((_, idx) => `field-${idx}`)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2">
                        {fields.map((field, idx) => (
                          <SortableField
                            key={field.id}
                            field={field}
                            index={idx}
                            onUpdate={updateField}
                            onRemove={removeField}
                            t={t}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}

                {/* Add field form */}
                <div className="border rounded-lg p-3 space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase">
                    {t('documents.addField', 'Add Field')}
                  </p>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Input
                        value={newFieldLabel}
                        onChange={(e) => setNewFieldLabel(e.target.value)}
                        placeholder={t('documents.fieldLabel', 'Field label')}
                        className="text-sm"
                      />
                    </div>
                    <Select
                      value={newFieldType}
                      onValueChange={(v) => setNewFieldType(v as TemplateField['type'])}
                    >
                      <SelectTrigger className="w-32 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="date">Date</SelectItem>
                        <SelectItem value="signature">Signature</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    value={newFieldPlaceholder}
                    onChange={(e) => setNewFieldPlaceholder(e.target.value)}
                    placeholder={t('documents.fieldPlaceholder', 'Placeholder text')}
                    className="text-sm"
                  />
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={newFieldRequired}
                      onCheckedChange={(c) => setNewFieldRequired(!!c)}
                    />
                    <span className="text-xs text-muted-foreground">
                      {t('documents.fieldRequired', 'Required')}
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={addField}
                    disabled={!newFieldLabel.trim()}
                    className="w-full"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    {t('documents.addField', 'Add Field')}
                  </Button>
                </div>
              </div>
            )}

            {/* Step 4: Review */}
            {currentStep === 3 && (
              <div className="space-y-4">
                <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground">{t('documents.title')}</p>
                    <p className="font-medium">{title}</p>
                  </div>
                  {description && (
                    <div>
                      <p className="text-xs text-muted-foreground">{t('documents.description')}</p>
                      <p className="text-sm">{description}</p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Badge variant="default">
                      {t(
                        `documents.template${category.charAt(0).toUpperCase() + category.slice(1)}`,
                        category,
                      )}
                    </Badge>
                    <Badge variant="secondary">
                      {fields.length} {t('documents.templateFields', 'fields')}
                    </Badge>
                  </div>
                </div>

                {/* Content preview */}
                <div>
                  <p className="text-sm font-medium mb-2">{t('documents.templateContent')}</p>
                  <div className="bg-muted/20 rounded-lg p-3 max-h-32 overflow-y-auto">
                    <p className="text-xs whitespace-pre-wrap">{content}</p>
                  </div>
                </div>

                {/* Fields preview */}
                {fields.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">{t('documents.templateFields')}</p>
                    <div className="space-y-1">
                      {fields.map((field, idx) => (
                        <div key={field.id} className="flex items-center gap-2 p-2 rounded border">
                          <span className="text-xs text-muted-foreground font-mono">
                            {idx + 1}.
                          </span>
                          <span className="text-sm flex-1">{field.label}</span>
                          <Badge variant="secondary" className="text-[10px]">
                            {field.type}
                          </Badge>
                          {field.required && (
                            <Badge variant="outline" className="text-[10px]">
                              {t('documents.fieldRequired')}
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-4 border-t bg-muted/30">
            <Button
              variant="ghost"
              onClick={currentStep === 0 ? onClose : handleBack}
              disabled={isSubmitting}
              size="sm"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              {currentStep === 0 ? t('common.cancel') : t('common.back')}
            </Button>
            <Button
              onClick={handleNext}
              disabled={!canGoNext() || isSubmitting}
              size="sm"
              className="gap-1"
            >
              {currentStep === steps.length - 1 ? (
                <>
                  <CheckCircle className="h-4 w-4" />
                  {isSubmitting ? t('common.sending') : t('documents.createTemplate')}
                </>
              ) : (
                <>
                  {t('common.next')}
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
