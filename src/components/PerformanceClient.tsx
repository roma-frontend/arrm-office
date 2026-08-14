'use client';
import Image from 'next/image';
import React, { useState } from 'react';
import { useMainRef } from '@/hooks/useMainRef';
import { useTranslation } from 'react-i18next';
import {
  Target,
  Plus,
  BarChart3,
  Users,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Send,
  Eye,
  Trash2,
  Play,
  XCircle,
  Star,
  Clock,
  TrendingUp,
  Calendar,
  UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation } from '@/lib/convex-typed';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
} from '@/components/ui/sheet';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/store/useAuthStore';
import { useShallow } from 'zustand/shallow';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';

// ── Types ────────────────────────────────────────────────────────────────────

interface CompetencyDraft {
  id: string;
  name: string;
  description: string;
  weight: number;
}

// ══════════════════════════════════════════════════════════════════════════════
// CREATE CYCLE WIZARD
// ══════════════════════════════════════════════════════════════════════════════

function CreateCycleWizard({
  open,
  onClose,
  organizationId,
  userId,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: Id<'organizations'>;
  userId: Id<'users'>;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [sending, setSending] = useState(false);

  // Step 0: Basic info
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'quarterly' | 'semi_annual' | 'annual' | 'custom'>('quarterly');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Step 1: 360° settings
  const [includesSelf, setIncludesSelf] = useState(true);
  const [includesPeer, setIncludesPeer] = useState(true);
  const [includesManager, setIncludesManager] = useState(true);
  const [includesDirectReport, setIncludesDirectReport] = useState(false);
  const [peerThreshold, setPeerThreshold] = useState(2);

  // Step 2: Competencies
  const [competencies, setCompetencies] = useState<CompetencyDraft[]>([
    { id: 'quality', name: 'Quality of Work', description: 'Accuracy and reliability', weight: 20 },
    {
      id: 'communication',
      name: 'Communication',
      description: 'Clarity and effectiveness',
      weight: 20,
    },
    { id: 'teamwork', name: 'Teamwork', description: 'Collaboration and support', weight: 20 },
    {
      id: 'initiative',
      name: 'Initiative',
      description: 'Proactiveness and innovation',
      weight: 20,
    },
    { id: 'leadership', name: 'Leadership', description: 'Guiding and accountability', weight: 20 },
  ]);

  const createCycle = useMutation(api.performance.createCycle);

  const steps = [
    t('performance.wizard.basicInfo'),
    t('performance.wizard.reviewTypes'),
    t('performance.wizard.competencies'),
  ];

  const canGoNext = () => {
    if (step === 0) return title.trim() && startDate && endDate;
    if (step === 1) return includesSelf || includesPeer || includesManager || includesDirectReport;
    if (step === 2) return competencies.length > 0;
    return false;
  };

  const handleSubmit = async () => {
    setSending(true);
    try {
      await createCycle({
        organizationId,
        title: title.trim(),
        description: description.trim() || undefined,
        type,
        startDate: new Date(startDate).getTime(),
        endDate: new Date(endDate).getTime(),
        includesSelf,
        includesPeer,
        includesManager,
        includesDirectReport,
        competencies,
        peerAnonymityThreshold: peerThreshold,
        showPeerIdentity: false,
        createdBy: userId,
      });
      toast.success(t('performance.cycleCreated'));
      onClose();
      resetForm();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setSending(false);
    }
  };

  const resetForm = () => {
    setStep(0);
    setTitle('');
    setDescription('');
    setStartDate('');
    setEndDate('');
  };

  const addCompetency = () => {
    const id = `comp_${Date.now()}`;
    setCompetencies([...competencies, { id, name: '', description: '', weight: 0 }]);
  };

  const removeCompetency = (id: string) => {
    setCompetencies(competencies.filter((c) => c.id !== id));
  };

  const updateCompetency = (id: string, field: keyof CompetencyDraft, value: string | number) => {
    setCompetencies(competencies.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" size="md" closeLabel={t('common.close', 'Close')}>
        {/* Header */}
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            {t('performance.createCycle')}
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-col min-h-0 flex-1">
          {/* Progress bar + Step indicators */}
          <div className="px-5 pt-4 pb-3">
            <div className="relative h-1.5 bg-muted rounded-full overflow-hidden mb-4">
              <div
                className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all duration-300 ease-in-out"
                style={{ width: `${((step + 1) / steps.length) * 100}%` }}
              />
            </div>
            <div className="flex items-center justify-between gap-1">
              {steps.map((label, idx) => {
                const isCompleted = idx < step;
                const isCurrent = idx === step;
                return (
                  <React.Fragment key={idx}>
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
                        {isCompleted ? <CheckCircle className="w-4 h-4" /> : idx + 1}
                      </div>
                      <p
                        className={`text-[10px] font-medium mt-1.5 text-center truncate w-full px-1 ${
                          isCurrent ? 'text-primary' : 'text-muted-foreground'
                        }`}
                      >
                        {label}
                      </p>
                    </div>
                    {idx < steps.length - 1 && (
                      <div className="flex-1 h-0.5 bg-muted mx-1 max-w-8 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            isCompleted ? 'bg-blue-500' : 'bg-transparent'
                          }`}
                          style={{ width: isCompleted ? '100%' : '0%' }}
                        />
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Step Content */}
          <SheetBody className="min-h-[280px]">
            {/* Step 0: Basic Info */}
            {step === 0 && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">{t('performance.fields.title')}</label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t('performance.fields.titlePlaceholder')}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">
                    {t('performance.fields.description')}
                  </label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t('performance.fields.descriptionPlaceholder')}
                    rows={3}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">{t('performance.fields.type')}</label>
                  <CustomSelect
                    value={type}
                    onChange={(v) =>
                      setType(v as 'quarterly' | 'semi_annual' | 'annual' | 'custom')
                    }
                    fullWidth
                    options={[
                      { value: 'quarterly', label: t('performance.types.quarterly') },
                      { value: 'semi_annual', label: t('performance.types.semiAnnual') },
                      { value: 'annual', label: t('performance.types.annual') },
                      { value: 'custom', label: t('performance.types.custom') },
                    ]}
                    triggerClassName="w-full mt-1 px-3 py-2 border rounded-md bg-background text-sm"
                    dropdownClassName="bg-background border text-foreground"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">
                      {t('performance.fields.startDate')}
                    </label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">{t('performance.fields.endDate')}</label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 1: Review Types */}
            {step === 1 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {t('performance.wizard.selectTypes')}
                </p>
                {[
                  {
                    key: 'self',
                    label: t('performance.reviewType.self'),
                    desc: t('performance.reviewType.selfDesc'),
                    value: includesSelf,
                    set: setIncludesSelf,
                  },
                  {
                    key: 'manager',
                    label: t('performance.reviewType.manager'),
                    desc: t('performance.reviewType.managerDesc'),
                    value: includesManager,
                    set: setIncludesManager,
                  },
                  {
                    key: 'peer',
                    label: t('performance.reviewType.peer'),
                    desc: t('performance.reviewType.peerDesc'),
                    value: includesPeer,
                    set: setIncludesPeer,
                  },
                  {
                    key: 'direct',
                    label: t('performance.reviewType.directReport'),
                    desc: t('performance.reviewType.directReportDesc'),
                    value: includesDirectReport,
                    set: setIncludesDirectReport,
                  },
                ].map((item) => (
                  <label
                    key={item.key}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      item.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={item.value}
                      onChange={(e) => item.set(e.target.checked)}
                      className="mt-0.5 rounded"
                    />
                    <div>
                      <div className="font-medium text-sm">{item.label}</div>
                      <div className="text-xs text-muted-foreground">{item.desc}</div>
                    </div>
                  </label>
                ))}
                {includesPeer && (
                  <div className="mt-3 p-3 bg-muted/30 rounded-lg">
                    <label className="text-sm font-medium">
                      {t('performance.fields.peerThreshold')}
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={peerThreshold}
                      onChange={(e) => setPeerThreshold(Number(e.target.value))}
                      className="w-24 mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('performance.fields.peerThresholdHint')}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Competencies */}
            {step === 2 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {t('performance.wizard.defineCompetencies')}
                </p>
                {competencies.map((comp) => (
                  <div key={comp.id} className="flex items-start gap-2 p-3 border rounded-lg">
                    <div className="flex-1 space-y-2">
                      <Input
                        value={comp.name}
                        onChange={(e) => updateCompetency(comp.id, 'name', e.target.value)}
                        placeholder={t('performance.fields.competencyName')}
                        className="text-sm"
                      />
                      <Input
                        value={comp.description}
                        onChange={(e) => updateCompetency(comp.id, 'description', e.target.value)}
                        placeholder={t('performance.fields.competencyDesc')}
                        className="text-xs"
                      />
                    </div>
                    <div className="w-16">
                      <Input
                        type="number"
                        value={comp.weight}
                        onChange={(e) =>
                          updateCompetency(comp.id, 'weight', Number(e.target.value))
                        }
                        min={0}
                        max={100}
                        className="text-sm"
                      />
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeCompetency(comp.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addCompetency}>
                  <Plus className="h-4 w-4 mr-1" /> {t('performance.addCompetency')}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {t('performance.totalWeight')}: {competencies.reduce((s, c) => s + c.weight, 0)}%
                </p>
              </div>
            )}
          </SheetBody>

          {/* Footer */}
          <SheetFooter className="justify-between">
            <Button
              variant="ghost"
              onClick={step > 0 ? () => setStep(step - 1) : onClose}
              disabled={sending}
              size="sm"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              {step > 0 ? t('common.back') : t('common.cancel')}
            </Button>
            {step < steps.length - 1 ? (
              <Button
                onClick={() => setStep(step + 1)}
                disabled={!canGoNext()}
                size="sm"
                className="gap-1"
              >
                {t('common.next')}
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={!canGoNext() || sending}
                size="sm"
                className="gap-1"
              >
                <Send className="h-4 w-4" />
                {sending ? t('common.sending') : t('performance.createCycle')}
              </Button>
            )}
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// FILL REVIEW WIZARD
// ══════════════════════════════════════════════════════════════════════════════

interface ReviewAssignment {
  _id: Id<'reviewAssignments'>;
  cycleId: Id<'reviewCycles'>;
  reviewerId: Id<'users'>;
  revieweeId: Id<'users'>;
  organizationId?: Id<'organizations'>;
  status: string;
  type: string;
  competencies: CompetencyDraft[];
  revieweeName?: string;
  cycleName?: string;
  cycleStatus?: string;
}

function FillReviewDialog({
  open,
  onClose,
  assignment,
}: {
  open: boolean;
  onClose: () => void;
  assignment: ReviewAssignment;
}) {
  const { t } = useTranslation();
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [strengths, setStrengths] = useState('');
  const [improvements, setImprovements] = useState('');
  const [generalComments, setGeneralComments] = useState('');
  const [sending, setSending] = useState(false);
  const [showObjectives, setShowObjectives] = useState(false);

  const submitReview = useMutation(api.performance.submitReview);
  const competencies: CompetencyDraft[] = assignment.competencies || [];

  // Fetch reviewee's OKRs linked to this review period
  const revieweeObjectives = useQuery(
    api.goals.getRevieweeObjectivesWithReviews,
    assignment?.organizationId && assignment?.revieweeId
      ? {
          organizationId: assignment.organizationId,
          userId: assignment.revieweeId,
        }
      : 'skip',
  );

  const allRated = competencies.every((c) => ratings[c.id] && ratings[c.id]! >= 1);

  const handleSubmit = async () => {
    setSending(true);
    try {
      await submitReview({
        assignmentId: assignment._id,
        ratings: competencies.map((c) => ({
          competencyId: c.id,
          competencyName: c.name,
          score: ratings[c.id] || 3,
          comment: comments[c.id] || undefined,
        })),
        strengths: strengths.trim() || undefined,
        improvements: improvements.trim() || undefined,
        generalComments: generalComments.trim() || undefined,
      });
      toast.success(t('performance.reviewSubmitted'));
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setSending(false);
    }
  };

  const typeLabel =
    {
      self: t('performance.reviewType.self'),
      peer: t('performance.reviewType.peer'),
      manager: t('performance.reviewType.manager'),
      direct_report: t('performance.reviewType.directReport'),
    }[assignment?.type as string] || '';

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" size="lg" closeLabel={t('common.close', 'Close')}>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Star className="h-5 w-5" />
            {t('performance.fillReview')} — {typeLabel}
          </SheetTitle>
          <p className="text-sm text-muted-foreground">
            {t('performance.reviewingEmployee')}: <strong>{assignment?.revieweeName}</strong>
          </p>
        </SheetHeader>

        <SheetBody className="space-y-6">
          {/* Aligned Objectives */}
          {revieweeObjectives && revieweeObjectives.length > 0 && (
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
              <button
                onClick={() => setShowObjectives(!showObjectives)}
                className="flex items-center justify-between w-full text-left"
              >
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-blue-500" />
                  <span className="text-sm font-semibold">
                    {t('goals.title')} ({revieweeObjectives.length})
                  </span>
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-muted-foreground transition-transform ${
                    showObjectives ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {showObjectives && (
                <div className="mt-3 space-y-2">
                  {revieweeObjectives.map((obj) => (
                    <div
                      key={obj._id}
                      className="rounded-lg bg-background border border-border/50 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate">{obj.title}</p>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5">
                              {t(`goals.level.${obj.level}`)}
                            </Badge>
                            <span>
                              {obj.periodType} {obj.periodYear}
                            </span>
                            <span>·</span>
                            <span>
                              {obj.keyResultsCount} {t('goals.stats.keyResults')}
                            </span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p
                            className={`text-sm font-bold ${
                              obj.progress >= 70
                                ? 'text-(--success-text)'
                                : obj.progress >= 40
                                  ? 'text-(--warning-text)'
                                  : 'text-(--danger-text)'
                            }`}
                          >
                            {obj.progress}%
                          </p>
                          <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden mt-0.5">
                            <div
                              className={`h-full rounded-full ${
                                obj.progress >= 70
                                  ? 'bg-emerald-500'
                                  : obj.progress >= 40
                                    ? 'bg-amber-500'
                                    : 'bg-red-500'
                              }`}
                              style={{ width: `${obj.progress}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Key results mini list */}
                      {obj.keyResults?.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {obj.keyResults.slice(0, 3).map((kr) => (
                            <div key={kr._id} className="flex items-center gap-2 text-[10px]">
                              <div className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                              <span className="text-muted-foreground flex-1 truncate">
                                {kr.title}
                              </span>
                              <span className="font-medium">{kr.progress}%</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Task stats */}
                      {obj.taskCount > 0 && (
                        <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>
                            📋 {obj.completedTaskCount}/{obj.taskCount}{' '}
                            {t('tasks.title').toLowerCase()}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Competency Ratings */}
          {competencies.map((comp) => (
            <div key={comp.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-sm">{comp.name}</span>
                  <p className="text-xs text-muted-foreground">{comp.description}</p>
                </div>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((score) => (
                    <button
                      key={score}
                      onClick={() => setRatings({ ...ratings, [comp.id]: score })}
                      className={`w-8 h-8 rounded-full text-sm font-medium transition-colors ${
                        ratings[comp.id] === score
                          ? 'bg-primary text-primary-foreground'
                          : ratings[comp.id] && ratings[comp.id]! >= score
                            ? 'bg-primary/20 text-primary'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      {score}
                    </button>
                  ))}
                </div>
              </div>
              <Textarea
                value={comments[comp.id] || ''}
                onChange={(e) => setComments({ ...comments, [comp.id]: e.target.value })}
                placeholder={t('performance.fields.competencyComment')}
                rows={1}
                className="text-xs"
              />
            </div>
          ))}

          {/* Overall Feedback */}
          <div className="border-t pt-4 space-y-3">
            <div>
              <label className="text-sm font-medium">{t('performance.fields.strengths')}</label>
              <Textarea
                value={strengths}
                onChange={(e) => setStrengths(e.target.value)}
                placeholder={t('performance.fields.strengthsPlaceholder')}
                rows={2}
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t('performance.fields.improvements')}</label>
              <Textarea
                value={improvements}
                onChange={(e) => setImprovements(e.target.value)}
                placeholder={t('performance.fields.improvementsPlaceholder')}
                rows={2}
              />
            </div>
            <div>
              <label className="text-sm font-medium">
                {t('performance.fields.generalComments')}
              </label>
              <Textarea
                value={generalComments}
                onChange={(e) => setGeneralComments(e.target.value)}
                placeholder={t('performance.fields.generalCommentsPlaceholder')}
                rows={2}
              />
            </div>
          </div>
        </SheetBody>

        <SheetFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!allRated || sending}>
            <Send className="h-4 w-4 mr-1" />
            {sending ? t('common.sending') : t('performance.submitReview')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// LAUNCH CYCLE DIALOG
// ══════════════════════════════════════════════════════════════════════════════

function LaunchCycleDialog({
  open,
  onClose,
  cycleId,
  organizationId,
  userId,
}: {
  open: boolean;
  onClose: () => void;
  cycleId: Id<'reviewCycles'>;
  organizationId: Id<'organizations'>;
  userId: Id<'users'>;
}) {
  const { t } = useTranslation();
  const [sending, setSending] = useState(false);
  const [selectedParticipants, setSelectedParticipants] = useState<Id<'users'>[]>([]);

  const participants = useQuery(api.performance.getEligibleParticipants, { organizationId });
  const launchCycle = useMutation(api.performance.launchCycle);

  const toggleParticipant = (id: Id<'users'>) => {
    setSelectedParticipants((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

  const selectAll = () => {
    if (participants) {
      setSelectedParticipants(participants.map((p) => p._id));
    }
  };

  const handleLaunch = async () => {
    if (selectedParticipants.length === 0) {
      toast.error(t('performance.selectParticipants'));
      return;
    }
    setSending(true);
    try {
      await launchCycle({
        cycleId,
        launchedBy: userId,
        participants: selectedParticipants,
      });
      toast.success(t('performance.cycleLaunched'));
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" size="md" closeLabel={t('common.close', 'Close')}>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Play className="h-5 w-5" />
            {t('performance.launchCycle')}
          </SheetTitle>
        </SheetHeader>

        <SheetBody className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {t('performance.selectParticipantsHint')}
            </p>
            <Button variant="outline" size="sm" onClick={selectAll}>
              {t('common.selectAll')}
            </Button>
          </div>

          <div className="space-y-2 max-h-[40vh] overflow-y-auto">
            {participants?.map((p) => (
              <label
                key={p._id}
                className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-colors ${
                  selectedParticipants.includes(p._id)
                    ? 'border-primary bg-primary/5'
                    : 'border-border'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedParticipants.includes(p._id)}
                  onChange={() => toggleParticipant(p._id)}
                />
                <div className="flex-1">
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.position || p.role} {p.department ? `• ${p.department}` : ''}
                  </div>
                </div>
              </label>
            ))}
          </div>

          <p className="text-sm">
            {t('performance.selectedCount')}: <strong>{selectedParticipants.length}</strong>
          </p>
        </SheetBody>

        <SheetFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleLaunch} disabled={sending || selectedParticipants.length === 0}>
            <Play className="h-4 w-4 mr-1" />
            {sending ? t('common.sending') : t('performance.launchCycle')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// RESULTS DIALOG
// ══════════════════════════════════════════════════════════════════════════════

function ResultsDialog({
  open,
  onClose,
  cycleId,
  revieweeId,
}: {
  open: boolean;
  onClose: () => void;
  cycleId: Id<'reviewCycles'>;
  revieweeId: Id<'users'>;
}) {
  const { t } = useTranslation();
  const results = useQuery(api.performance.getRevieweeResults, { cycleId, revieweeId });

  if (!results) return null;

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" size="lg" closeLabel={t('common.close', 'Close')}>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            {t('performance.results')} — {results.reviewee?.name}
          </SheetTitle>
        </SheetHeader>

        <SheetBody className="space-y-6">
          {/* Overall Score */}
          <div className="text-center p-4 bg-muted/50 rounded-lg">
            <div className="text-3xl font-bold">{results.overallScore}</div>
            <div className="text-sm text-muted-foreground">{t('performance.overallScore')}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {results.totalResponses} {t('performance.reviewsCompleted')}
            </div>
          </div>

          {/* Competency Scores */}
          <div>
            <h4 className="text-sm font-medium mb-3">{t('performance.competencyScores')}</h4>
            <div className="space-y-2">
              {results.competencyAverages.map((c) => (
                <div key={c.id} className="flex items-center gap-3">
                  <span className="text-sm w-40 truncate">{c.name}</span>
                  <div className="flex-1 bg-muted rounded-full h-2">
                    <div
                      className="bg-primary rounded-full h-2 transition-all"
                      style={{ width: `${(c.average / 5) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium w-10 text-right">{c.average}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Self Review */}
          {results.selfReview && (
            <div>
              <h4 className="text-sm font-medium mb-2">{t('performance.reviewType.self')}</h4>
              <Card>
                <CardContent className="p-3 text-sm space-y-1">
                  <div>
                    <strong>{t('performance.fields.score')}:</strong>{' '}
                    {results.selfReview.overallScore}/5
                  </div>
                  {results.selfReview.strengths && (
                    <div>
                      <strong>{t('performance.fields.strengths')}:</strong>{' '}
                      {results.selfReview.strengths}
                    </div>
                  )}
                  {results.selfReview.improvements && (
                    <div>
                      <strong>{t('performance.fields.improvements')}:</strong>{' '}
                      {results.selfReview.improvements}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Manager Reviews */}
          {results.managerReviews.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">{t('performance.reviewType.manager')}</h4>
              {results.managerReviews.map((r, i) => (
                <Card key={i} className="mb-2">
                  <CardContent className="p-3 text-sm space-y-1">
                    <div>
                      <strong>{t('performance.fields.score')}:</strong> {r.overallScore}/5
                    </div>
                    {r.strengths && (
                      <div>
                        <strong>{t('performance.fields.strengths')}:</strong> {r.strengths}
                      </div>
                    )}
                    {r.improvements && (
                      <div>
                        <strong>{t('performance.fields.improvements')}:</strong> {r.improvements}
                      </div>
                    )}
                    {r.generalComments && (
                      <div>
                        <strong>{t('performance.fields.generalComments')}:</strong>{' '}
                        {r.generalComments}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Peer Reviews */}
          {results.peerReviews ? (
            <div>
              <h4 className="text-sm font-medium mb-2">
                {t('performance.reviewType.peer')} ({results.peerCount})
              </h4>
              {results.peerReviews.map((r, i) => (
                <Card key={i} className="mb-2">
                  <CardContent className="p-3 text-sm space-y-1">
                    <div>
                      <strong>{t('performance.fields.score')}:</strong> {r.overallScore}/5
                    </div>
                    {r.strengths && (
                      <div>
                        <strong>{t('performance.fields.strengths')}:</strong> {r.strengths}
                      </div>
                    )}
                    {r.improvements && (
                      <div>
                        <strong>{t('performance.fields.improvements')}:</strong> {r.improvements}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : results.peerCount > 0 ? (
            <div className="text-sm text-muted-foreground italic">
              {t('performance.peerAnonymityNotMet', {
                threshold: results.peerThreshold,
                current: results.peerCount,
              })}
            </div>
          ) : null}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN CLIENT
// ══════════════════════════════════════════════════════════════════════════════

export function PerformanceClient() {
  const { t } = useTranslation();
  const mainRef = useMainRef();
  const { currentUser, organizationId: userOrgId } = useAuthStore(
    useShallow((s) => ({ currentUser: s.user, organizationId: s.user?.organizationId })),
  );
  const selectedOrgId = useSelectedOrganization();
  const organizationId = (selectedOrgId ?? userOrgId ?? undefined) as
    | Id<'organizations'>
    | undefined;

  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<ReviewAssignment | null>(null);
  const [launchCycleId, setLaunchCycleId] = useState<Id<'reviewCycles'> | null>(null);
  const [viewResults, setViewResults] = useState<{
    cycleId: Id<'reviewCycles'>;
    revieweeId: Id<'users'>;
  } | null>(null);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superadmin';
  const isSupervisor = currentUser?.role === 'supervisor';
  const canManageCycles = isAdmin || isSupervisor;

  const cycles = useQuery(
    api.performance.listCycles,
    organizationId ? { organizationId: organizationId as Id<'organizations'> } : 'skip',
  );

  const myAssignments = useQuery(
    api.performance.getMyAssignments,
    currentUser?.id ? { userId: currentUser.id as Id<'users'> } : 'skip',
  );

  const closeCycle = useMutation(api.performance.closeCycle);
  const cancelCycle = useMutation(api.performance.cancelCycle);
  const deleteCycle = useMutation(api.performance.deleteCycle);

  if (!currentUser || !organizationId) {
    return <ShieldLoader />;
  }

  const pendingAssignments =
    myAssignments?.filter((a) => a.status === 'pending' || a.status === 'in_progress') || [];

  const statusBadge = (status: string) => {
    const map: Record<
      string,
      { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }
    > = {
      draft: { variant: 'outline', label: t('performance.status.draft') },
      active: { variant: 'default', label: t('performance.status.active') },
      completed: { variant: 'secondary', label: t('performance.status.completed') },
      cancelled: { variant: 'destructive', label: t('performance.status.cancelled') },
    };
    const s = map[status] || { variant: 'outline' as const, label: status };
    return <Badge variant={s.variant}>{s.label}</Badge>;
  };

  return (
    <div className="">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 py-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              {t('performance.title')}
            </h1>
            <p className="text-muted-foreground text-sm">{t('performance.subtitle')}</p>
          </div>
          {canManageCycles && (
            <Button
              onClick={() => {
                const mainEl = mainRef.current;
                if (mainEl) {
                  mainEl.scrollTo({ top: 0, behavior: 'smooth' });
                }
                window.scrollTo({ top: 0, behavior: 'smooth' });
                setShowCreateWizard(true);
              }}
              className="w-full sm:w-auto"
            >
              <Plus className="h-4 w-4 mr-1" /> {t('performance.createCycle')}
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
              <Clock className="h-5 w-5 text-(--warning-text)" />
            </div>
            <div>
              <div className="text-2xl font-bold">{pendingAssignments.length}</div>
              <div className="text-xs text-muted-foreground">{t('performance.stats.pending')}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
              <CheckCircle className="h-5 w-5 text-(--success-text)" />
            </div>
            <div>
              <div className="text-2xl font-bold">
                {myAssignments?.filter((a) => a.status === 'submitted').length || 0}
              </div>
              <div className="text-xs text-muted-foreground">
                {t('performance.stats.completed')}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <TrendingUp className="h-5 w-5 text-(--brand-text)" />
            </div>
            <div>
              <div className="text-2xl font-bold">
                {cycles?.filter((c) => c.status === 'active').length || 0}
              </div>
              <div className="text-xs text-muted-foreground">
                {t('performance.stats.activeCycles')}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="my-reviews">
        <TabsList className="w-full my-4 gap-2 bg-transparent p-0 h-auto grid grid-cols-3">
          <TabsTrigger
            className="w-full px-4 py-2.5 rounded-xl data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center"
            value="my-reviews"
          >
            <UserCheck className="h-4 w-4 mr-1" />
            {t('performance.tabs.myReviews')}
          </TabsTrigger>
          {canManageCycles && (
            <TabsTrigger
              className="w-full px-4 py-2.5 rounded-xl data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center"
              value="cycles"
            >
              <Calendar className="h-4 w-4 mr-1" />
              {t('performance.tabs.cycles')}
            </TabsTrigger>
          )}
          {canManageCycles && (
            <TabsTrigger
              className="w-full px-4 py-2.5 rounded-xl data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center"
              value="results"
            >
              <BarChart3 className="h-4 w-4 mr-1" />
              {t('performance.tabs.results')}
            </TabsTrigger>
          )}
        </TabsList>

        {/* My Reviews Tab */}
        <TabsContent value="my-reviews" className="space-y-4">
          {pendingAssignments.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <CheckCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>{t('performance.noReviewsPending')}</p>
              </CardContent>
            </Card>
          ) : (
            pendingAssignments.map((a) => (
              <Card key={a._id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                      {a.revieweeAvatar ? (
                        <Image
                          src={a.revieweeAvatar}
                          width={40}
                          height={40}
                          unoptimized
                          className="w-10 h-10 rounded-full object-cover"
                          alt=""
                        />
                      ) : (
                        <Users className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{a.revieweeName}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {a.cycleName} •{' '}
                        {
                          {
                            self: t('performance.reviewType.self'),
                            peer: t('performance.reviewType.peer'),
                            manager: t('performance.reviewType.manager'),
                            direct_report: t('performance.reviewType.directReport'),
                          }[a.type]
                        }
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                    <Badge variant="outline" className="text-xs">
                      <Clock className="h-3 w-3 mr-1" />
                      {new Date(a.dueDate).toLocaleDateString()}
                    </Badge>
                    <Button size="sm" onClick={() => setSelectedAssignment(a)}>
                      <Star className="h-4 w-4 mr-1" /> {t('performance.fillReview')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Cycles Tab */}
        {canManageCycles && (
          <TabsContent value="cycles" className="space-y-4">
            {!cycles || cycles.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <Target className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>{t('performance.noCycles')}</p>
                </CardContent>
              </Card>
            ) : (
              cycles.map((cycle) => (
                <Card key={cycle._id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <div className="font-medium">{cycle.title}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                        {statusBadge(cycle.status)}
                        <span>
                          {new Date(cycle.startDate).toLocaleDateString()} —{' '}
                          {new Date(cycle.endDate).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {cycle.status === 'draft' && (
                        <>
                          <Button size="sm" onClick={() => setLaunchCycleId(cycle._id)}>
                            <Play className="h-4 w-4 mr-1" /> {t('performance.launch')}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={async () => {
                              await deleteCycle({ cycleId: cycle._id });
                              toast.success(t('common.deleted'));
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      {cycle.status === 'active' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              await closeCycle({ cycleId: cycle._id });
                              toast.success(t('performance.cycleClosed'));
                            }}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" /> {t('performance.close')}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={async () => {
                              await cancelCycle({ cycleId: cycle._id });
                              toast.success(t('performance.cycleCancelled'));
                            }}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        )}

        {/* Results Tab */}
        {canManageCycles && (
          <TabsContent value="results" className="space-y-4">
            {cycles
              ?.filter((c) => c.status === 'completed' || c.status === 'active')
              .map((cycle) => (
                <CycleSummaryCard
                  key={cycle._id}
                  cycleId={cycle._id}
                  title={cycle.title}
                  status={cycle.status}
                  onViewResults={(revieweeId) => setViewResults({ cycleId: cycle._id, revieweeId })}
                />
              ))}
          </TabsContent>
        )}
      </Tabs>

      {/* Dialogs */}
      <CreateCycleWizard
        open={showCreateWizard}
        onClose={() => setShowCreateWizard(false)}
        organizationId={organizationId as Id<'organizations'>}
        userId={currentUser.id as Id<'users'>}
      />

      {selectedAssignment && (
        <FillReviewDialog
          open={!!selectedAssignment}
          onClose={() => setSelectedAssignment(null)}
          assignment={selectedAssignment}
        />
      )}

      {launchCycleId && (
        <LaunchCycleDialog
          open={!!launchCycleId}
          onClose={() => setLaunchCycleId(null)}
          cycleId={launchCycleId}
          organizationId={organizationId as Id<'organizations'>}
          userId={currentUser.id as Id<'users'>}
        />
      )}

      {viewResults && (
        <ResultsDialog
          open={!!viewResults}
          onClose={() => setViewResults(null)}
          cycleId={viewResults.cycleId}
          revieweeId={viewResults.revieweeId}
        />
      )}
    </div>
  );
}

// ── Cycle Summary Card (shows employees and their scores) ────────────────────
function CycleSummaryCard({
  cycleId,
  title,
  status,
  onViewResults,
}: {
  cycleId: Id<'reviewCycles'>;
  title: string;
  status: string;
  onViewResults: (revieweeId: Id<'users'>) => void;
}) {
  const { t } = useTranslation();
  const summary = useQuery(api.performance.getCycleSummary, { cycleId });

  if (!summary) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>{title}</span>
          <Badge variant={status === 'active' ? 'default' : 'secondary'}>
            {status === 'active'
              ? t('performance.status.active')
              : t('performance.status.completed')}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {summary.summaries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('performance.noResults')}</p>
        ) : (
          summary.summaries.map((s) => (
            <div
              key={s.revieweeId}
              className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 cursor-pointer"
              onClick={() => onViewResults(s.revieweeId as Id<'users'>)}
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                  {s.avatar ? (
                    <Image
                      src={s.avatar}
                      width={32}
                      height={32}
                      unoptimized
                      className="w-8 h-8 object-cover"
                      alt=""
                    />
                  ) : (
                    <Users className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <span className="text-sm">{s.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{s.averageScore}/5</span>
                <Badge variant="outline" className="text-xs">
                  {s.reviewCount} {t('performance.reviews')}
                </Badge>
                <Eye className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
