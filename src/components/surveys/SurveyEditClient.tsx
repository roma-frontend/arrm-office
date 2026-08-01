'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { useShallow } from 'zustand/shallow';
import { useState, useEffect, Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  ClipboardList,
  Plus,
  CheckCircle,
  Save,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Star,
  MessageSquare,
  ThumbsUp,
  Hash,
  BarChart3,
  LucideIcon,
  GripVertical,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
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

type QuestionType = 'rating' | 'multiple_choice' | 'text' | 'yes_no' | 'nps';

interface QuestionDraft {
  _id?: Id<'surveyQuestions'>;
  type: QuestionType;
  text: string;
  description?: string;
  options?: string[];
  isRequired: boolean;
}

const QUESTION_TYPE_CONFIG: Record<QuestionType, { icon: LucideIcon; labelKey: string }> = {
  rating: { icon: Star, labelKey: 'surveys.questionType.rating' },
  multiple_choice: { icon: Hash, labelKey: 'surveys.questionType.multipleChoice' },
  text: { icon: MessageSquare, labelKey: 'surveys.questionType.text' },
  yes_no: { icon: ThumbsUp, labelKey: 'surveys.questionType.yesNo' },
  nps: { icon: BarChart3, labelKey: 'surveys.questionType.nps' },
};

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

export default function SurveyEditClient() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore(useShallow((state) => ({ user: state.user })));
  const { t } = useTranslation();
  const surveyId = params.id as Id<'surveys'>;

  const survey = useQuery(api.surveys.getSurveyWithQuestions, { surveyId });

  const updateSurveyMutation = useMutation(api.surveys.updateSurvey);
  const updateQuestionsMutation = useMutation(api.surveys.updateSurveyQuestions);

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

  useEffect(() => {
    if (survey && survey.questions) {
      setTitle(survey.title);
      setDescription(survey.description || '');
      setIsAnonymous(survey.isAnonymous);
      setQuestions(
        survey.questions.map((q) => ({
          _id: q._id,
          type: q.type,
          text: q.text,
          description: q.description,
          options: q.options,
          isRequired: q.isRequired,
        })),
      );
    }
  }, [survey]);

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

  const removeOption = (optIdx: number) => {
    setNewQuestion((prev) => ({
      ...prev,
      options: prev.options?.filter((_, i) => i !== optIdx),
    }));
  };

  const handleSubmit = async () => {
    if (!user || !survey) return;
    setIsSubmitting(true);
    try {
      await updateSurveyMutation({
        surveyId,
        organizationId: survey.organizationId as Id<'organizations'>,
        title: title.trim(),
        description: description.trim() || undefined,
        isAnonymous,
      });

      await updateQuestionsMutation({
        surveyId,
        organizationId: survey.organizationId as Id<'organizations'>,
        questions: questions.map((q) => ({
          type: q.type,
          text: q.text,
          description: q.description,
          options: q.options,
          isRequired: q.isRequired,
        })),
      });

      toast.success(t('surveys.updated'));
      router.push(`/surveys/${surveyId}`);
    } catch (error: unknown) {
      toast.error((error as Error).message || t('surveys.errors.updateFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const progress = ((currentStep + 1) / steps.length) * 100;

  if (!survey) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (survey.status !== 'draft') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => router.push(`/surveys/${surveyId}`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{t('surveys.edit')}</h1>
          </div>
        </div>
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">{t('surveys.errors.cannotEditPublished')}</p>
            <Button className="mt-4" onClick={() => router.push(`/surveys/${surveyId}`)}>
              {t('common.back')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.push(`/surveys/${surveyId}`)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{t('surveys.edit')}</h1>
          <p className="text-muted-foreground">{survey.title}</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {/* Progress bar + Step indicators */}
          <div className="px-5 pt-5 pb-3">
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
                  <Fragment key={step.id}>
                    <div className="flex flex-col items-center flex-1 min-w-0">
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
                      <span
                        className={`text-[10px] font-medium mt-1.5 text-center truncate w-full px-1 ${
                          isCompleted || isCurrent ? 'text-primary' : 'text-muted-foreground'
                        }`}
                      >
                        {step.title}
                      </span>
                    </div>
                    {idx < steps.length - 1 && (
                      <div className="flex-1 h-0.5 bg-muted mx-1 max-w-6 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            isCompleted ? 'bg-primary' : 'bg-transparent'
                          }`}
                          style={{ width: isCompleted ? '100%' : '0%' }}
                        />
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>
          </div>

          {/* Step Content */}
          <div className="px-5 py-4 min-h-[300px]">
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
                      Object.entries(QUESTION_TYPE_CONFIG) as [
                        QuestionType,
                        (typeof QUESTION_TYPE_CONFIG)[QuestionType],
                      ][]
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
                            <Badge
                              key={idx}
                              variant="secondary"
                              className="text-xs flex items-center gap-1"
                            >
                              {opt}
                              <button
                                type="button"
                                onClick={() => removeOption(idx)}
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
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
                      <p className="text-xs text-muted-foreground">
                        {t('surveys.form.description')}
                      </p>
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
                          <p className="text-sm font-medium">{q.text}</p>
                          {q.description && (
                            <p className="text-xs text-muted-foreground">{q.description}</p>
                          )}
                          {q.options && q.options.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {q.options.map((opt, optIdx) => (
                                <Badge key={optIdx} variant="outline" className="text-[10px]">
                                  {opt}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <Badge
                          variant={q.isRequired ? 'default' : 'secondary'}
                          className="text-[10px] shrink-0"
                        >
                          {q.isRequired ? t('surveys.form.required') : t('surveys.form.optional')}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="px-5 py-4 border-t flex justify-between">
            <Button variant="outline" onClick={handleBack} disabled={currentStep === 0}>
              <ChevronLeft className="w-4 h-4 mr-1" />
              {t('common.back')}
            </Button>
            <Button onClick={handleNext} disabled={!canGoNext() || isSubmitting}>
              {currentStep === steps.length - 1 ? (
                <>
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin mr-2 h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                      {t('common.saving')}
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-1" />
                      {t('common.save')}
                    </>
                  )}
                </>
              ) : (
                <>
                  {t('common.next')}
                  <ChevronRight className="w-4 h-4 ml-1" />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
