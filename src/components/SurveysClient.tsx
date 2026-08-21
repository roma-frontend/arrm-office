'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useWizardDraft } from '@/hooks/useWizardDraft';
import { WizardDraftNotice } from '@/components/ui/WizardDraftNotice';
import { useDraftResume } from '@/hooks/useDraftResume';
import { DraftResumeBar } from '@/components/ui/DraftResumeBar';
import { useMainRef } from '@/hooks/useMainRef';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useTypedQuery } from '@/lib/convex-typed';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { EmployeeHoverCard } from '@/components/employees/EmployeeHoverCard';
import {
  ClipboardList,
  Plus,
  BarChart3,
  Users,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Send,
  Trash2,
  Play,
  Square,
  Star,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Hash,
  LucideIcon,
  GripVertical,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
} from '@/components/ui/sheet';
import { WizardStepper } from '@/components/ui/wizard-stepper';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/store/useAuthStore';
import { useShallow } from 'zustand/shallow';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
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

// ── Types ────────────────────────────────────────────────────────────────────

type QuestionType = 'rating' | 'multiple_choice' | 'text' | 'yes_no' | 'nps';

interface QuestionDraft {
  type: QuestionType;
  text: string;
  description?: string;
  options?: string[];
  isRequired: boolean;
}

interface QuestionTypeConfig {
  icon: LucideIcon;
  labelKey: string;
}

type AnswerValue = number | string | boolean | string[];

interface SurveyAnswerInput {
  questionId: Id<'surveyQuestions'>;
  ratingValue?: number;
  textValue?: string;
  selectedOptions?: string[];
  booleanValue?: boolean;
}

interface SurveyQuestionResult {
  question: {
    _id: Id<'surveyQuestions'>;
    type: QuestionType;
    text: string;
    description?: string | null;
    isRequired: boolean;
    options?: string[] | null;
  };
  totalResponses: number;
  average?: number;
  distribution?: Record<number, number>;
  optionCounts?: Record<string, number>;
  yesCount?: number;
  noCount?: number;
  textResponses?: (string | null | undefined)[];
}

interface SurveyResultsData {
  survey: { title: string; [key: string]: unknown };
  totalResponses: number;
  questionResults: SurveyQuestionResult[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const QUESTION_TYPE_CONFIG: Record<QuestionType, QuestionTypeConfig> = {
  rating: { icon: Star, labelKey: 'surveys.questionType.rating' },
  multiple_choice: { icon: Hash, labelKey: 'surveys.questionType.multipleChoice' },
  text: { icon: MessageSquare, labelKey: 'surveys.questionType.text' },
  yes_no: { icon: ThumbsUp, labelKey: 'surveys.questionType.yesNo' },
  nps: { icon: BarChart3, labelKey: 'surveys.questionType.nps' },
};

const STATUS_VARIANT: Record<string, 'secondary' | 'success' | 'danger'> = {
  draft: 'secondary',
  active: 'success',
  closed: 'danger',
};

// ── Sortable Question Component ──────────────────────────────────────────────

function SortableQuestion({
  question,
  index,
  onRemove,
  t,
}: {
  question: QuestionDraft;
  index: number;
  onRemove: (idx: number) => void;
  t: TFunction;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `question-${index}`,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const TypeIcon = QUESTION_TYPE_CONFIG[question.type].icon;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 p-2 rounded-md border bg-muted/30"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <TypeIcon className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="text-sm flex-1 truncate">{question.text}</span>
      <Badge variant="secondary" className="text-[10px]">
        {t(QUESTION_TYPE_CONFIG[question.type].labelKey)}
      </Badge>
      <button
        type="button"
        onClick={() => onRemove(index)}
        className="text-destructive hover:text-destructive/80"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Create Survey Wizard ─────────────────────────────────────────────────────

interface CreateSurveyWizardProps {
  open: boolean;
  onClose: () => void;
  organizationId: Id<'organizations'>;
  createdBy: Id<'users'>;
}

function CreateSurveyWizard({ open, onClose, organizationId, createdBy }: CreateSurveyWizardProps) {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  const [newQuestion, setNewQuestion] = useState<QuestionDraft>({
    type: 'rating',
    text: '',
    isRequired: true,
  });
  const [newOption, setNewOption] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createSurveyMutation = useMutation(api.surveys.createSurvey);

  // ── Черновик: правки переживают случайное закрытие диалога ────────────────
  const draftData = useMemo(
    () => ({ title, description, isAnonymous, questions, newQuestion, newOption }),
    [title, description, isAnonymous, questions, newQuestion, newOption],
  );

  const draftDefaults = useMemo(
    () => ({
      title: '',
      description: '',
      isAnonymous: true,
      questions: [] as QuestionDraft[],
      newQuestion: { type: 'rating', text: '', isRequired: true } as QuestionDraft,
      newOption: '',
    }),
    [],
  );

  const handleRestoreDraft = useCallback((d: typeof draftData, savedStep: number) => {
    if (d.title !== undefined) setTitle(d.title);
    if (d.description !== undefined) setDescription(d.description);
    if (typeof d.isAnonymous === 'boolean') setIsAnonymous(d.isAnonymous);
    if (d.questions && d.questions.length > 0) setQuestions(d.questions);
    if (d.newQuestion) setNewQuestion((p) => ({ ...p, ...d.newQuestion }));
    if (d.newOption !== undefined) setNewOption(d.newOption);
    // Three steps: info, questions, review.
    setCurrentStep(Math.min(Math.max(savedStep, 0), 2));
  }, []);

  const draft = useWizardDraft({
    key: 'create-survey',
    enabled: open,
    data: draftData,
    step: currentStep,
    defaults: draftDefaults,
    onRestore: handleRestoreDraft,
  });
  const { clearDraft } = draft;

  const handleStartOver = useCallback(() => {
    clearDraft();
    setTitle('');
    setDescription('');
    setIsAnonymous(true);
    setQuestions([]);
    setNewQuestion({ type: 'rating', text: '', isRequired: true });
    setNewOption('');
    setCurrentStep(0);
  }, [clearDraft]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setQuestions((items) => {
        const oldIndex = items.findIndex((_, idx) => `question-${idx}` === active.id);
        const newIndex = items.findIndex((_, idx) => `question-${idx}` === over.id);

        if (oldIndex !== -1 && newIndex !== -1) {
          return arrayMove(items, oldIndex, newIndex);
        }
        return items;
      });
    }
  };

  const steps = [
    {
      id: 'info',
      title: t('surveys.wizard.surveyInfo'),
      icon: <ClipboardList className="w-4 h-4" />,
    },
    {
      id: 'questions',
      title: t('surveys.wizard.questions'),
      icon: <MessageSquare className="w-4 h-4" />,
    },
    { id: 'review', title: t('surveys.wizard.review'), icon: <CheckCircle className="w-4 h-4" /> },
  ];

  const canGoNext = (): boolean => {
    switch (currentStep) {
      case 0:
        return !!title.trim();
      case 1:
        return questions.length > 0;
      case 2:
        return true;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((p) => p + 1);
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) setCurrentStep((p) => p - 1);
  };

  const addQuestion = () => {
    if (!newQuestion.text.trim()) return;
    setQuestions((prev) => [...prev, { ...newQuestion }]);
    setNewQuestion({ type: 'rating', text: '', isRequired: true });
    setNewOption('');
  };

  const removeQuestion = (idx: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  };

  const addOption = () => {
    if (!newOption.trim()) return;
    setNewQuestion((prev) => ({
      ...prev,
      options: [...(prev.options || []), newOption.trim()],
    }));
    setNewOption('');
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await createSurveyMutation({
        organizationId,
        createdBy,
        title: title.trim(),
        description: description.trim() || undefined,
        isAnonymous,
        questions: questions.map((q) => ({
          type: q.type,
          text: q.text,
          description: q.description,
          options: q.options,
          isRequired: q.isRequired,
        })),
      });
      toast.success(t('surveys.created'));
      clearDraft();
      onClose();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t('surveys.errors.createFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" size="lg" closeLabel={t('common.close', 'Close')} className="p-0">
        <SheetHeader className="gap-3.5">
          <SheetTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            {t('surveys.createSurvey')}
          </SheetTitle>
          <WizardStepper
            steps={steps.map((s) => ({ id: s.id, title: s.title }))}
            current={currentStep}
            onStepClick={(i) => {
              // Backwards is always safe; forward only from step 0 once the
              // title is filled, mirroring the footer button's guard.
              if (i < currentStep || (i === 1 && !!title.trim())) setCurrentStep(i);
            }}
          />
        </SheetHeader>

        {/* Step Content */}
        <SheetBody className="px-5 py-5">
          <WizardDraftNotice
            show={draft.restored}
            step={draft.restoredStep}
            onReset={handleStartOver}
            className="mb-4"
          />

          {/* Step 1: Survey Info */}
          {currentStep === 0 && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  {t('surveys.form.title')} *
                </label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('surveys.form.titlePlaceholder')}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  {t('surveys.form.description')}
                </label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('surveys.form.descriptionPlaceholder')}
                  rows={3}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="anonymous"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="anonymous" className="text-sm text-muted-foreground">
                  {t('surveys.form.anonymous')}
                </label>
              </div>
            </div>
          )}

          {/* Step 2: Questions */}
          {currentStep === 1 && (
            <div className="space-y-4">
              {/* Existing questions */}
              {questions.length > 0 && (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={questions.map((_, idx) => `question-${idx}`)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {questions.map((q, idx) => (
                        <SortableQuestion
                          key={`question-${idx}`}
                          question={q}
                          index={idx}
                          onRemove={removeQuestion}
                          t={t}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}

              {/* Add question form */}
              <div className="border rounded-lg p-3 space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase">
                  {t('surveys.form.addQuestion')}
                </p>
                {/* Question type */}
                <div className="flex flex-wrap gap-1">
                  {(
                    Object.entries(QUESTION_TYPE_CONFIG) as [QuestionType, QuestionTypeConfig][]
                  ).map(([key, config]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        setNewQuestion((p) => ({ ...p, type: key, options: undefined }))
                      }
                      className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-all ${
                        newQuestion.type === key
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                      }`}
                    >
                      <config.icon className="h-3 w-3" />
                      {t(config.labelKey)}
                    </button>
                  ))}
                </div>
                {/* Question text */}
                <Input
                  value={newQuestion.text}
                  onChange={(e) => setNewQuestion((p) => ({ ...p, text: e.target.value }))}
                  placeholder={t('surveys.form.questionTextPlaceholder')}
                  className="text-sm"
                />
                {/* Options for multiple choice */}
                {newQuestion.type === 'multiple_choice' && (
                  <div className="space-y-2">
                    {newQuestion.options && newQuestion.options.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {newQuestion.options.map((opt, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            {opt}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Input
                        value={newOption}
                        onChange={(e) => setNewOption(e.target.value)}
                        placeholder={t('surveys.form.addOption')}
                        className="text-sm flex-1"
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addOption())}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={addOption}
                        disabled={!newOption.trim()}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
                {/* Required toggle */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newQuestion.isRequired}
                    onChange={(e) =>
                      setNewQuestion((p) => ({ ...p, isRequired: e.target.checked }))
                    }
                    className="rounded"
                  />
                  <span className="text-xs text-muted-foreground">
                    {t('surveys.form.required')}
                  </span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={addQuestion}
                  disabled={!newQuestion.text.trim()}
                  className="w-full"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {t('surveys.form.addQuestionBtn')}
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground">{t('surveys.form.title')}</p>
                  <p className="font-medium">{title}</p>
                </div>
                {description && (
                  <div>
                    <p className="text-xs text-muted-foreground">{t('surveys.form.description')}</p>
                    <p className="text-sm">{description}</p>
                  </div>
                )}
                <div className="flex gap-2">
                  <Badge variant={isAnonymous ? 'default' : 'secondary'}>
                    {isAnonymous ? t('surveys.anonymous') : t('surveys.named')}
                  </Badge>
                  <Badge variant="secondary">
                    {questions.length} {t('surveys.questionsCount')}
                  </Badge>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">{t('surveys.wizard.questions')}</p>
                {questions.map((q, idx) => {
                  const TypeIcon = QUESTION_TYPE_CONFIG[q.type].icon;
                  return (
                    <div key={idx} className="flex items-start gap-2 p-2 rounded border">
                      <span className="text-xs text-muted-foreground mt-0.5">{idx + 1}.</span>
                      <TypeIcon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">{q.text}</p>
                        {q.options && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {q.options.join(', ')}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </SheetBody>

        {/* Footer */}
        <SheetFooter className="justify-between">
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
                {isSubmitting ? t('common.sending') : t('surveys.createSurvey')}
              </>
            ) : (
              <>
                {t('common.next')}
                <ChevronRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ── Take Survey Dialog ───────────────────────────────────────────────────────

interface TakeSurveyDialogProps {
  open: boolean;
  onClose: () => void;
  surveyId: Id<'surveys'>;
  organizationId: Id<'organizations'>;
  userId: Id<'users'>;
}

function TakeSurveyDialog({
  open,
  onClose,
  surveyId,
  organizationId,
  userId,
}: TakeSurveyDialogProps) {
  const { t } = useTranslation();
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const surveyData = useQuery(api.surveys.getSurveyWithQuestions, surveyId ? { surveyId } : 'skip');

  const submitMutation = useMutation(api.surveys.submitResponse);

  const handleAnswer = (questionId: string, value: AnswerValue) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleSubmit = async () => {
    if (!surveyData) return;

    const requiredQuestions = surveyData.questions.filter((q) => q.isRequired);
    const missingRequired = requiredQuestions.filter(
      (q) => !answers[q._id] && answers[q._id] !== 0 && answers[q._id] !== false,
    );
    if (missingRequired.length > 0) {
      toast.error(t('surveys.errors.requiredFields'));
      return;
    }

    setIsSubmitting(true);
    try {
      const formattedAnswers = surveyData.questions
        .filter((q) => answers[q._id] !== undefined)
        .map((q) => {
          const answer: SurveyAnswerInput = { questionId: q._id };
          const val = answers[q._id];
          switch (q.type) {
            case 'rating':
            case 'nps':
              answer.ratingValue = val as number;
              break;
            case 'text':
              answer.textValue = val as string;
              break;
            case 'multiple_choice':
              answer.selectedOptions = Array.isArray(val) ? (val as string[]) : [val as string];
              break;
            case 'yes_no':
              answer.booleanValue = val as boolean;
              break;
          }
          return answer;
        });

      await submitMutation({
        organizationId,
        surveyId,
        respondentId: surveyData.isAnonymous ? undefined : userId,
        answers: formattedAnswers,
      });

      toast.success(t('surveys.responseSubmitted'));
      onClose();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t('surveys.errors.submitFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!surveyData) return null;

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" size="lg" closeLabel={t('common.close', 'Close')}>
        <SheetHeader>
          <SheetTitle>{surveyData.title}</SheetTitle>
          {surveyData.description && (
            <p className="text-sm text-muted-foreground mt-1">{surveyData.description}</p>
          )}
        </SheetHeader>

        <SheetBody className="space-y-6">
          {surveyData.questions.map((question, idx) => (
            <div key={question._id} className="space-y-2">
              <div className="flex items-start gap-2">
                <span className="text-xs text-muted-foreground font-mono mt-0.5">{idx + 1}.</span>
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    {question.text}
                    {question.isRequired && <span className="text-destructive ml-1">*</span>}
                  </p>
                  {question.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{question.description}</p>
                  )}
                </div>
              </div>

              {/* Rating input */}
              {question.type === 'rating' && (
                <div className="flex gap-1 ml-5">
                  {[1, 2, 3, 4, 5].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => handleAnswer(question._id, val)}
                      className={`w-9 h-9 rounded-md border flex items-center justify-center transition-all ${
                        answers[question._id] === val
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'hover:bg-muted border-border'
                      }`}
                    >
                      <Star
                        className={`h-4 w-4 ${(answers[question._id] as number) >= val ? 'fill-current' : ''}`}
                      />
                    </button>
                  ))}
                </div>
              )}

              {/* NPS input (0-10) */}
              {question.type === 'nps' && (
                <div className="flex flex-wrap gap-1 ml-5">
                  {Array.from({ length: 11 }, (_, i) => i).map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => handleAnswer(question._id, val)}
                      className={`w-8 h-8 rounded-md border flex items-center justify-center text-xs font-medium transition-all ${
                        answers[question._id] === val
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'hover:bg-muted border-border'
                      }`}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              )}

              {/* Multiple choice */}
              {question.type === 'multiple_choice' && question.options && (
                <div className="space-y-1 ml-5">
                  {question.options.map((option) => {
                    const current = Array.isArray(answers[question._id])
                      ? (answers[question._id] as string[])
                      : [];
                    const selected = current.includes(option);
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => {
                          const updated = selected
                            ? current.filter((o) => o !== option)
                            : [...current, option];
                          handleAnswer(question._id, updated);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-md border text-sm transition-all ${
                          selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'
                        }`}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Yes/No */}
              {question.type === 'yes_no' && (
                <div className="flex gap-2 ml-5">
                  <button
                    type="button"
                    onClick={() => handleAnswer(question._id, true)}
                    className={`flex items-center gap-1 px-4 py-2 rounded-md border text-sm transition-all ${
                      answers[question._id] === true
                        ? 'border-(--success-outline) bg-(--success-quiet) text-(--success-text) dark:bg-(--success-quiet)'
                        : 'border-border hover:bg-muted'
                    }`}
                  >
                    <ThumbsUp className="h-4 w-4" />
                    {t('surveys.yes')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAnswer(question._id, false)}
                    className={`flex items-center gap-1 px-4 py-2 rounded-md border text-sm transition-all ${
                      answers[question._id] === false
                        ? 'border-(--danger-outline) bg-(--danger-quiet) text-(--danger-text) dark:bg-(--danger-quiet)'
                        : 'border-border hover:bg-muted'
                    }`}
                  >
                    <ThumbsDown className="h-4 w-4" />
                    {t('surveys.no')}
                  </button>
                </div>
              )}

              {/* Text input */}
              {question.type === 'text' && (
                <div className="ml-5">
                  <Textarea
                    value={(answers[question._id] as string) || ''}
                    onChange={(e) => handleAnswer(question._id, e.target.value)}
                    placeholder={t('surveys.form.typePlaceholder')}
                    rows={2}
                    className="text-sm"
                  />
                </div>
              )}
            </div>
          ))}
        </SheetBody>

        <SheetFooter>
          <Button variant="ghost" onClick={onClose} size="sm">
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} size="sm" className="gap-1">
            <Send className="h-4 w-4" />
            {isSubmitting ? t('common.sending') : t('surveys.submit')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ── Survey Results Dialog ────────────────────────────────────────────────────

interface SurveyResultsDialogProps {
  open: boolean;
  onClose: () => void;
  surveyId: Id<'surveys'>;
  organizationId: Id<'organizations'>;
}

function SurveyResultsDialog({
  open,
  onClose,
  surveyId,
  organizationId,
}: SurveyResultsDialogProps) {
  const { t } = useTranslation();

  const results = useTypedQuery<SurveyResultsData>(
    api.surveys.getSurveyResults,
    surveyId && organizationId ? { surveyId, organizationId } : 'skip',
  );

  if (!results) return null;

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" size="xl" closeLabel={t('common.close', 'Close')}>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            {results.survey.title} — {t('surveys.results')}
          </SheetTitle>
          <div className="flex items-center gap-3 mt-2">
            <Badge variant="default">
              {results.totalResponses} {t('surveys.responses')}
            </Badge>
            <Badge variant="secondary">
              {results.questionResults.length} {t('surveys.questions')}
            </Badge>
          </div>
        </SheetHeader>

        <SheetBody className="space-y-4">
          {results.questionResults.map((qr, idx) => (
            <Card key={idx}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-start gap-2">
                  <span className="text-xs text-muted-foreground font-mono mt-0.5">{idx + 1}.</span>
                  <span>{qr.question.text}</span>
                </CardTitle>
                {qr.question.description && (
                  <p className="text-xs text-muted-foreground mt-1">{qr.question.description}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Rating / NPS average */}
                {(qr.question.type === 'rating' || qr.question.type === 'nps') && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="text-2xl font-bold text-primary">
                        {qr.average?.toFixed(1)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        / {qr.question.type === 'nps' ? '10' : '5'} avg
                      </div>
                    </div>
                    {/* Distribution bars */}
                    {qr.distribution && (
                      <div className="space-y-1">
                        {Object.entries(qr.distribution)
                          .sort(([a], [b]) => Number(a) - Number(b))
                          .map(([val, count]) => {
                            const pct =
                              qr.totalResponses > 0 ? (Number(count) / qr.totalResponses) * 100 : 0;
                            return (
                              <div key={val} className="flex items-center gap-2">
                                <span className="text-xs w-6 text-right font-mono">{val}</span>
                                <div className="flex-1 bg-muted rounded-full h-3 overflow-hidden">
                                  <div
                                    className="h-full bg-primary/70 rounded-full transition-all duration-300"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className="text-xs text-muted-foreground w-10">
                                  {String(count)} ({Math.round(pct)}%)
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                )}

                {/* Multiple choice bars */}
                {qr.question.type === 'multiple_choice' && qr.optionCounts && (
                  <div className="space-y-2">
                    {Object.entries(qr.optionCounts)
                      .sort(([, a], [, b]) => b - a)
                      .map(([opt, count]) => {
                        const pct = qr.totalResponses > 0 ? (count / qr.totalResponses) * 100 : 0;
                        return (
                          <div key={opt} className="flex items-center gap-2">
                            <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                              <div
                                className="h-full bg-primary/70 rounded-full transition-all duration-300"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs w-24 text-right truncate">{opt}</span>
                            <span className="text-xs text-muted-foreground w-12 text-right">
                              {count} ({Math.round(pct)}%)
                            </span>
                          </div>
                        );
                      })}
                  </div>
                )}

                {/* Yes/No */}
                {qr.question.type === 'yes_no' && (
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-(--success-text) flex items-center gap-1">
                          <ThumbsUp className="h-4 w-4" />
                          {t('surveys.yes')}
                        </span>
                        <span className="text-sm font-bold text-(--success-text)">
                          {qr.totalResponses > 0
                            ? Math.round(((qr.yesCount ?? 0) / qr.totalResponses) * 100)
                            : 0}
                          %
                        </span>
                      </div>
                      <div className="bg-muted rounded-full h-3 overflow-hidden">
                        <div
                          className="h-full bg-(--success-solid) rounded-full transition-all duration-300"
                          style={{
                            width: `${
                              qr.totalResponses > 0
                                ? ((qr.yesCount ?? 0) / qr.totalResponses) * 100
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{qr.yesCount} votes</p>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-(--danger-text) flex items-center gap-1">
                          <ThumbsDown className="h-4 w-4" />
                          {t('surveys.no')}
                        </span>
                        <span className="text-sm font-bold text-(--danger-text)">
                          {qr.totalResponses > 0
                            ? Math.round(((qr.noCount ?? 0) / qr.totalResponses) * 100)
                            : 0}
                          %
                        </span>
                      </div>
                      <div className="bg-muted rounded-full h-3 overflow-hidden">
                        <div
                          className="h-full bg-(--danger-solid) rounded-full transition-all duration-300"
                          style={{
                            width: `${
                              qr.totalResponses > 0
                                ? ((qr.noCount ?? 0) / qr.totalResponses) * 100
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{qr.noCount} votes</p>
                    </div>
                  </div>
                )}

                {/* Text responses */}
                {qr.question.type === 'text' && qr.textResponses && (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {qr.textResponses.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">No text responses yet</p>
                    ) : (
                      qr.textResponses.map((text, i) => (
                        <div
                          key={i}
                          className="text-sm bg-muted/50 p-3 rounded-lg border border-border/50"
                        >
                          {text}
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Response count */}
                <div className="pt-2 border-t border-border/50">
                  <p className="text-xs text-muted-foreground">
                    {qr.totalResponses} {t('surveys.responses')}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function SurveysClient() {
  const { t } = useTranslation();
  const router = useRouter();
  const mainRef = useMainRef();
  const user = useAuthStore(useShallow((s) => s.user));
  const selectedOrgId = useSelectedOrganization();
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const surveyDraft = useDraftResume('create-survey', !showCreateWizard);
  const [takingSurveyId, setTakingSurveyId] = useState<Id<'surveys'> | null>(null);
  const [viewingResultsId, setViewingResultsId] = useState<Id<'surveys'> | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'active' | 'closed'>('all');

  const orgId = (selectedOrgId ?? user?.organizationId ?? undefined) as
    | Id<'organizations'>
    | undefined;
  const isAdmin = user?.role === 'admin' || user?.role === 'supervisor';

  const surveys = useQuery(
    api.surveys.listSurveys,
    orgId
      ? {
          organizationId: orgId,
          ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
        }
      : 'skip',
  );

  const publishMutation = useMutation(api.surveys.publishSurvey);
  const closeMutation = useMutation(api.surveys.closeSurvey);
  const deleteMutation = useMutation(api.surveys.deleteSurvey);

  const handlePublish = async (surveyId: Id<'surveys'>) => {
    if (!orgId) return;
    try {
      await publishMutation({ surveyId, organizationId: orgId });
      toast.success(t('surveys.published'));
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t('surveys.errors.publishFailed'));
    }
  };

  const handleClose = async (surveyId: Id<'surveys'>) => {
    if (!orgId) return;
    try {
      await closeMutation({ surveyId, organizationId: orgId });
      toast.success(t('surveys.closed'));
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t('surveys.errors.closeFailed'));
    }
  };

  const handleDelete = async (surveyId: Id<'surveys'>) => {
    if (!orgId) return;
    try {
      await deleteMutation({ surveyId, organizationId: orgId });
      toast.success(t('surveys.deleted'));
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t('surveys.errors.deleteFailed'));
    }
  };

  if (!user || !orgId) {
    return (
      <div className="flex items-center justify-center h-64">
        <ShieldLoader size="md" />
      </div>
    );
  }

  return (
    <div className="">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 py-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              {t('surveys.title')}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">{t('surveys.subtitle')}</p>
          </div>
          {isAdmin && (
            <Button
              onClick={() => {
                const mainEl = mainRef.current;
                if (mainEl) {
                  mainEl.scrollTo({ top: 0, behavior: 'smooth' });
                }
                window.scrollTo({ top: 0, behavior: 'smooth' });
                setShowCreateWizard(true);
              }}
              className="gap-2 w-full sm:w-auto"
            >
              <Plus className="h-4 w-4" />
              {t('surveys.createSurvey')}
            </Button>
          )}
        </div>
      </div>

      {/* Status filter tabs */}
      <Tabs
        value={statusFilter}
        onValueChange={(v) => setStatusFilter(v as 'all' | 'draft' | 'active' | 'closed')}
      >
        <TabsList className="w-full mb-4 gap-2 bg-transparent p-0 h-auto grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          <TabsTrigger
            className="w-full px-4 py-2.5 rounded-xl data-[state=active]:bg-(--brand) data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center"
            value="all"
          >
            {t('surveys.filter.all')}
          </TabsTrigger>
          <TabsTrigger
            className="w-full px-4 py-2.5 rounded-xl data-[state=active]:bg-(--brand) data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center"
            value="active"
          >
            {t('surveys.filter.active')}
          </TabsTrigger>
          <TabsTrigger
            className="w-full px-4 py-2.5 rounded-xl data-[state=active]:bg-(--brand) data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center"
            value="draft"
          >
            {t('surveys.filter.draft')}
          </TabsTrigger>
          <TabsTrigger
            className="w-full px-4 py-2.5 rounded-xl data-[state=active]:bg-(--brand) data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center"
            value="closed"
          >
            {t('surveys.filter.closed')}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Survey List */}
      <div className="grid gap-4 w-full">
        {!surveys || surveys.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <ClipboardList className="h-12 w-12 text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground">{t('surveys.empty')}</p>
              {isAdmin && (
                <Button
                  variant="outline"
                  className="mt-3"
                  onClick={() => {
                    const mainEl = mainRef.current;
                    if (mainEl) {
                      mainEl.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    setShowCreateWizard(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  {t('surveys.createFirst')}
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          surveys.map((survey) => (
            <Card
              key={survey._id}
              className="hover:shadow-sm transition-shadow cursor-pointer"
              onClick={() => router.push(`/surveys/${survey._id}`)}
            >
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mb-1">
                      <h3 className="font-semibold text-base truncate">{survey.title}</h3>
                      <Badge variant={STATUS_VARIANT[survey.status] || 'secondary'}>
                        {t(`surveys.status.${survey.status}`)}
                      </Badge>
                      {survey.isAnonymous && (
                        <Badge variant="outline" className="text-[10px]">
                          {t('surveys.anonymous')}
                        </Badge>
                      )}
                    </div>
                    {survey.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {survey.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {survey.responseCount} {t('surveys.responses')}
                      </span>
                      {survey.creator && (
                        <EmployeeHoverCard
                          userId={survey.createdBy as string}
                          name={survey.creator.name}
                        >
                          <span className="cursor-pointer underline-offset-2 hover:underline">
                            {t('surveys.createdBy')} {survey.creator.name}
                          </span>
                        </EmployeeHoverCard>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="w-full sm:w-auto flex flex-wrap items-center gap-1 shrink-0 self-start sm:self-auto">
                    {survey.status === 'active' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTakingSurveyId(survey._id);
                        }}
                        className="gap-1"
                      >
                        <Send className="h-3 w-3" />
                        {t('surveys.take')}
                      </Button>
                    )}
                    {isAdmin && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewingResultsId(survey._id);
                          }}
                          title={t('surveys.viewResults')}
                        >
                          <BarChart3 className="h-4 w-4" />
                        </Button>
                        {survey.status === 'draft' && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePublish(survey._id);
                              }}
                              title={t('surveys.publish')}
                            >
                              <Play className="h-4 w-4 text-(--success-text)" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(survey._id);
                              }}
                              title={t('surveys.delete')}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        )}
                        {survey.status === 'active' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleClose(survey._id);
                            }}
                            title={t('surveys.close')}
                          >
                            <Square className="h-4 w-4 text-(--danger-text)" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Modals */}
      <CreateSurveyWizard
        open={showCreateWizard}
        onClose={() => setShowCreateWizard(false)}
        organizationId={orgId}
        createdBy={user.id as Id<'users'>}
      />

      {takingSurveyId && (
        <TakeSurveyDialog
          open={!!takingSurveyId}
          onClose={() => setTakingSurveyId(null)}
          surveyId={takingSurveyId}
          organizationId={orgId}
          userId={user.id as Id<'users'>}
        />
      )}

      {/* "Draft saved. Restore?" — the survey wizard keeps its contents after
          an accidental close; this is what tells the user so. */}
      <DraftResumeBar
        show={surveyDraft.available}
        label={t('surveys.newSurvey', 'New Survey')}
        step={surveyDraft.step}
        onResume={() => {
          surveyDraft.dismiss();
          setShowCreateWizard(true);
        }}
        onDismiss={surveyDraft.dismiss}
        onDiscard={surveyDraft.discard}
      />

      {viewingResultsId && (
        <SurveyResultsDialog
          open={!!viewingResultsId}
          onClose={() => setViewingResultsId(null)}
          surveyId={viewingResultsId}
          organizationId={orgId}
        />
      )}
    </div>
  );
}
