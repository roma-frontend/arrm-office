'use client';

import React, { useState, useMemo } from 'react';
import { useMainRef } from '@/hooks/useMainRef';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import {
  Target,
  Plus,
  TrendingUp,
  ChevronRight,
  ChevronLeft,
  CheckCircle,
  AlertTriangle,
  Crosshair,
  Building2,
  Users,
  User,
  Calendar,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useAuthUser } from '@/store/useAuthStore';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';

// ============ TYPES ============

type PeriodType = 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'H1' | 'H2' | 'FY';
type MetricType = 'percentage' | 'number' | 'currency' | 'boolean';
type Direction = 'increase' | 'decrease';
type ObjectiveLevel = 'company' | 'team' | 'individual';

interface KRInput {
  title: string;
  description: string;
  metricType: MetricType;
  direction: Direction;
  startValue: number;
  targetValue: number;
  unit: string;
  weight: number;
}

// ============ PERIOD HELPERS ============

function getPeriodDates(type: PeriodType, year: number): { start: number; end: number } {
  const y = year;
  switch (type) {
    case 'Q1':
      return { start: new Date(y, 0, 1).getTime(), end: new Date(y, 2, 31).getTime() };
    case 'Q2':
      return { start: new Date(y, 3, 1).getTime(), end: new Date(y, 5, 30).getTime() };
    case 'Q3':
      return { start: new Date(y, 6, 1).getTime(), end: new Date(y, 8, 30).getTime() };
    case 'Q4':
      return { start: new Date(y, 9, 1).getTime(), end: new Date(y, 11, 31).getTime() };
    case 'H1':
      return { start: new Date(y, 0, 1).getTime(), end: new Date(y, 5, 30).getTime() };
    case 'H2':
      return { start: new Date(y, 6, 1).getTime(), end: new Date(y, 11, 31).getTime() };
    case 'FY':
      return { start: new Date(y, 0, 1).getTime(), end: new Date(y, 11, 31).getTime() };
  }
}

function getProgressColor(progress: number): string {
  if (progress >= 70) return 'text-green-600';
  if (progress >= 40) return 'text-yellow-600';
  return 'text-red-600';
}

function getConfidenceBadge(confidence: string) {
  switch (confidence) {
    case 'high':
      return { color: 'bg-green-100 text-green-800', label: 'High' };
    case 'medium':
      return { color: 'bg-yellow-100 text-yellow-800', label: 'Medium' };
    case 'low':
      return { color: 'bg-red-100 text-red-800', label: 'Low' };
    default:
      return { color: 'bg-gray-100 text-gray-600', label: '—' };
  }
}

// ============ CREATE OBJECTIVE WIZARD ============

function CreateObjectiveWizard({
  organizationId,
  userId,
  userRole,
  userDepartment,
  parentOptions,
  onClose,
}: {
  organizationId: Id<'organizations'>;
  userId: Id<'users'>;
  userRole: string;
  userDepartment?: string;
  parentOptions: Array<{ _id: Id<'objectives'>; title: string; level: string }>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const createObjective = useMutation(api.goals.createObjective);

  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [level, setLevel] = useState<ObjectiveLevel>('individual');
  const [department, setDepartment] = useState(userDepartment || '');
  const [periodType, setPeriodType] = useState<PeriodType>('Q2');
  const [periodYear, setPeriodYear] = useState(new Date().getFullYear());
  const [parentId, setParentId] = useState<string>('');
  const [keyResults, setKeyResults] = useState<KRInput[]>([
    {
      title: '',
      description: '',
      metricType: 'number',
      direction: 'increase',
      startValue: 0,
      targetValue: 100,
      unit: '',
      weight: 100,
    },
  ]);
  const [submitting, setSubmitting] = useState(false);

  const canCreateCompany = userRole === 'admin' || userRole === 'superadmin';
  const canCreateTeam = canCreateCompany || userRole === 'supervisor';

  const addKR = () => {
    setKeyResults([
      ...keyResults,
      {
        title: '',
        description: '',
        metricType: 'number',
        direction: 'increase',
        startValue: 0,
        targetValue: 100,
        unit: '',
        weight: 0,
      },
    ]);
  };

  const removeKR = (index: number) => {
    if (keyResults.length <= 1) return;
    setKeyResults(keyResults.filter((_, i) => i !== index));
  };

  const updateKR = (index: number, field: keyof KRInput, value: string | number) => {
    const updated = [...keyResults];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (updated[index] as any)[field] = value;
    setKeyResults(updated);
  };

  const handleSubmit = async () => {
    if (!title.trim() || keyResults.some((kr: any) => !kr.title.trim())) {
      toast.error(t('goals.wizard.fillRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const { start, end } = getPeriodDates(periodType, periodYear);
      await createObjective({
        organizationId,
        title: title.trim(),
        description: description.trim() || undefined,
        ownerId: userId,
        level,
        department: level === 'team' ? department : undefined,
        periodType,
        periodYear,
        periodStart: start,
        periodEnd: end,
        parentObjectiveId: parentId ? (parentId as Id<'objectives'>) : undefined,
        createdBy: userId,
        keyResults: keyResults.map((kr: any) => ({
          title: kr.title.trim(),
          description: kr.description.trim() || undefined,
          metricType: kr.metricType,
          direction: kr.direction,
          startValue: kr.startValue,
          targetValue: kr.targetValue,
          unit: kr.unit || undefined,
          weight: kr.weight,
        })),
      });
      toast.success(t('goals.wizard.success'));
      onClose();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const steps = [
    t('goals.wizard.step1', 'Basic Info'),
    t('goals.wizard.step2', 'Key Results'),
    t('goals.wizard.step3', 'Review'),
  ];

  return (
    <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden max-h-[95vh]">
      {/* Header */}
      <DialogHeader className="px-5 pt-5 pb-0">
        <DialogTitle>{t('goals.wizard.title', 'Create Objective')}</DialogTitle>
      </DialogHeader>

      <div className="flex flex-col">
        {/* Progress bar + Step indicators */}
        <div className="px-5 pt-4 pb-3">
          <div className="relative h-1.5 bg-muted rounded-full overflow-hidden mb-4">
            <div
              className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all duration-300 ease-in-out"
              style={{ width: `${((step + 1) / steps.length) * 100}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-1">
            {steps.map((s, idx) => {
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
                      {s}
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
        <div className="px-5 py-4 min-h-[280px] overflow-y-auto max-h-[50vh]">
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <Label>{t('goals.wizard.titleLabel', 'Objective Title')}</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t(
                    'goals.wizard.titlePlaceholder',
                    'e.g. Increase customer satisfaction',
                  )}
                />
              </div>
              <div>
                <Label>{t('goals.wizard.description', 'Description')}</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t(
                    'goals.wizard.descPlaceholder',
                    'What does achieving this look like?',
                  )}
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>{t('goals.wizard.level', 'Level')}</Label>
                  <Select value={level} onValueChange={(v) => setLevel(v as ObjectiveLevel)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {canCreateCompany && (
                        <SelectItem value="company">
                          {t('goals.level.company', 'Company')}
                        </SelectItem>
                      )}
                      {canCreateTeam && (
                        <SelectItem value="team">{t('goals.level.team', 'Team')}</SelectItem>
                      )}
                      <SelectItem value="individual">
                        {t('goals.level.individual', 'Individual')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {level === 'team' && (
                  <div>
                    <Label>{t('goals.wizard.department', 'Department')}</Label>
                    <Input
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      placeholder={t('goals.wizard.deptPlaceholder', 'e.g. Engineering')}
                    />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>{t('goals.wizard.period', 'Period')}</Label>
                  <Select value={periodType} onValueChange={(v) => setPeriodType(v as PeriodType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Q1">Q1</SelectItem>
                      <SelectItem value="Q2">Q2</SelectItem>
                      <SelectItem value="Q3">Q3</SelectItem>
                      <SelectItem value="Q4">Q4</SelectItem>
                      <SelectItem value="H1">H1</SelectItem>
                      <SelectItem value="H2">H2</SelectItem>
                      <SelectItem value="FY">FY</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t('goals.wizard.year', 'Year')}</Label>
                  <Select
                    value={String(periodYear)}
                    onValueChange={(v) => setPeriodYear(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2025">2025</SelectItem>
                      <SelectItem value="2026">2026</SelectItem>
                      <SelectItem value="2027">2027</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {parentOptions.length > 0 && (
                <div>
                  <Label>{t('goals.wizard.alignTo', 'Align to Parent Objective')}</Label>
                  <Select value={parentId} onValueChange={setParentId}>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={t('goals.wizard.noAlignment', 'None (top-level)')}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">
                        {t('goals.wizard.noAlignment', 'None (top-level)')}
                      </SelectItem>
                      {parentOptions.map((p: any) => (
                        <SelectItem key={p._id} value={p._id}>
                          [{p.level}] {p.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Key Results */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t('goals.wizard.krHint', 'Define measurable outcomes. Weights should sum to 100.')}
              </p>
              {keyResults.map((kr, i) => (
                <Card key={i} className="relative">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {t('goals.wizard.kr', 'Key Result')} #{i + 1}
                      </span>
                      {keyResults.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeKR(i)}
                          className="text-destructive h-7"
                        >
                          &times;
                        </Button>
                      )}
                    </div>
                    <Input
                      value={kr.title}
                      onChange={(e) => updateKR(i, 'title', e.target.value)}
                      placeholder={t('goals.wizard.krTitlePlaceholder', 'e.g. Reach 95% NPS score')}
                    />
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <Label className="text-xs">{t('goals.wizard.metric', 'Metric')}</Label>
                        <Select
                          value={kr.metricType}
                          onValueChange={(v) => updateKR(i, 'metricType', v)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="number">
                              {t('goals.metric.number', 'Number')}
                            </SelectItem>
                            <SelectItem value="percentage">
                              {t('goals.metric.percentage', 'Percentage')}
                            </SelectItem>
                            <SelectItem value="currency">
                              {t('goals.metric.currency', 'Currency')}
                            </SelectItem>
                            <SelectItem value="boolean">
                              {t('goals.metric.boolean', 'Yes/No')}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">
                          {t('goals.wizard.direction', 'Direction')}
                        </Label>
                        <Select
                          value={kr.direction}
                          onValueChange={(v) => updateKR(i, 'direction', v)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="increase">
                              {t('goals.direction.increase', 'Increase')}
                            </SelectItem>
                            <SelectItem value="decrease">
                              {t('goals.direction.decrease', 'Decrease')}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">{t('goals.wizard.start', 'Start')}</Label>
                        <Input
                          type="number"
                          className="h-8 text-xs"
                          value={kr.startValue}
                          onChange={(e) => updateKR(i, 'startValue', Number(e.target.value))}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">{t('goals.wizard.target', 'Target')}</Label>
                        <Input
                          type="number"
                          className="h-8 text-xs"
                          value={kr.targetValue}
                          onChange={(e) => updateKR(i, 'targetValue', Number(e.target.value))}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">{t('goals.wizard.unit', 'Unit')}</Label>
                        <Input
                          className="h-8 text-xs"
                          value={kr.unit}
                          onChange={(e) => updateKR(i, 'unit', e.target.value)}
                          placeholder={t('goals.wizard.unitPlaceholder', 'e.g. %, $, users')}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">{t('goals.wizard.weight', 'Weight %')}</Label>
                        <Input
                          type="number"
                          className="h-8 text-xs"
                          value={kr.weight}
                          onChange={(e) => updateKR(i, 'weight', Number(e.target.value))}
                          min={0}
                          max={100}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              <Button variant="outline" size="sm" onClick={addKR} className="w-full">
                <Plus className="h-4 w-4 mr-1" /> {t('goals.wizard.addKR', 'Add Key Result')}
              </Button>
              {keyResults.reduce((s: any, kr: any) => s + kr.weight, 0) !== 100 && (
                <p className="text-xs text-destructive">
                  {t('goals.wizard.weightWarning', 'Weights must sum to 100. Current: {{sum}}', {
                    sum: keyResults.reduce((s: any, kr: any) => s + kr.weight, 0),
                  })}
                </p>
              )}
            </div>
          )}

          {/* Step 3: Review */}
          {step === 2 && (
            <div className="space-y-4">
              <Card>
                <CardContent className="p-4 space-y-2">
                  <h3 className="font-semibold">{title}</h3>
                  {description && <p className="text-sm text-muted-foreground">{description}</p>}
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline">{level}</Badge>
                    <Badge variant="outline">
                      {periodType} {periodYear}
                    </Badge>
                    {level === 'team' && department && (
                      <Badge variant="outline">{department}</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
              <div className="space-y-2">
                <h4 className="text-sm font-medium">
                  {t('goals.wizard.krSummary', 'Key Results')} ({keyResults.length})
                </h4>
                {keyResults.map((kr, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm p-2 border rounded">
                    <span className="font-medium w-6 shrink-0">#{i + 1}</span>
                    <span className="flex-1 truncate">{kr.title}</span>
                    <Badge variant="secondary" className="text-xs">
                      {kr.startValue} → {kr.targetValue} {kr.unit}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {kr.weight}%
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between px-5 py-4 border-t">
          <Button variant="outline" onClick={() => (step === 0 ? onClose() : setStep(step - 1))}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            {step === 0 ? t('common.cancel', 'Cancel') : t('common.back', 'Back')}
          </Button>
          {step < 2 ? (
            <Button onClick={() => setStep(step + 1)} disabled={step === 0 && !title.trim()}>
              {t('common.next', 'Next')} <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting
                ? t('common.saving', 'Saving...')
                : t('goals.wizard.create', 'Create Objective')}
            </Button>
          )}
        </div>
      </div>
    </DialogContent>
  );
}

// ============ CHECK-IN DIALOG ============

function CheckinDialog({
  krId,
  krTitle,
  currentValue,
  targetValue,
  unit,
  metricType,
  onClose,
}: {
  krId: Id<'keyResults'>;
  krTitle: string;
  currentValue: number;
  targetValue: number;
  unit: string;
  metricType: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const user = useAuthUser();
  const checkinMutation = useMutation(api.goals.checkin);

  const [newValue, setNewValue] = useState(currentValue);
  const [note, setNote] = useState('');
  const [confidence, setConfidence] = useState<'high' | 'medium' | 'low'>('medium');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      await checkinMutation({
        keyResultId: krId,
        userId: user.id as Id<'users'>,
        newValue,
        note: note.trim() || undefined,
        confidence,
      });
      toast.success(t('goals.checkin.success', 'Check-in recorded'));
      onClose();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{t('goals.checkin.title', 'Check-in')}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{krTitle}</p>
        <div className="flex items-center gap-3">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">{t('goals.checkin.current', 'Current')}</p>
            <p className="text-lg font-bold">
              {currentValue}
              {unit}
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
          <div className="flex-1">
            <Label className="text-xs">{t('goals.checkin.newValue', 'New Value')}</Label>
            {metricType === 'boolean' ? (
              <Select value={String(newValue)} onValueChange={(v) => setNewValue(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">{t('goals.checkin.no', 'No')}</SelectItem>
                  <SelectItem value="1">{t('goals.checkin.yes', 'Yes')}</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Input
                type="number"
                value={newValue}
                onChange={(e) => setNewValue(Number(e.target.value))}
              />
            )}
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">{t('goals.checkin.target', 'Target')}</p>
            <p className="text-lg font-bold text-primary">
              {targetValue}
              {unit}
            </p>
          </div>
        </div>
        <div>
          <Label>{t('goals.checkin.confidence', 'Confidence')}</Label>
          <div className="flex gap-2 mt-1">
            {(['high', 'medium', 'low'] as const).map((c: any) => (
              <Button
                key={c}
                size="sm"
                variant={confidence === c ? 'default' : 'outline'}
                onClick={() => setConfidence(c)}
                className={confidence === c ? '' : 'opacity-60'}
              >
                {c === 'high' && '🟢'}
                {c === 'medium' && '🟡'}
                {c === 'low' && '🔴'}
                <span className="ml-1 text-xs capitalize">
                  {String(t(`goals.confidence.${c}`, c))}
                </span>
              </Button>
            ))}
          </div>
        </div>
        <div>
          <Label>{t('goals.checkin.note', 'Note (optional)')}</Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('goals.checkin.notePlaceholder', 'What progress was made?')}
            rows={2}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? '...' : t('goals.checkin.submit', 'Submit Check-in')}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

// ============ OBJECTIVE DETAIL DIALOG ============

function ObjectiveDetailDialog({
  objectiveId,
  onClose,
  onCheckin,
}: {
  objectiveId: Id<'objectives'>;
  onClose: () => void;
  onCheckin: (kr: {
    _id: Id<'keyResults'>;
    title: string;
    currentValue: number;
    targetValue: number;
    unit?: string;
    metricType: string;
  }) => void;
}) {
  const { t } = useTranslation();
  const user = useAuthUser();
  const objective = useQuery(api.goals.getObjective, { objectiveId });
  const deleteObjective = useMutation(api.goals.deleteObjective);
  const completeObjective = useMutation(api.goals.completeObjective);

  if (!objective)
    return (
      <DialogContent className="sm:max-w-2xl">
        <ShieldLoader />
      </DialogContent>
    );

  const isOwner = user?.id === objective.ownerId;
  const isActive = objective.status === 'active';

  return (
    <DialogContent className="sm:max-w-2xl max-h-[95vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          {objective.title}
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        {/* Meta */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{objective.level}</Badge>
          <Badge variant="outline">
            {objective.periodType} {objective.periodYear}
          </Badge>
          <Badge
            className={
              objective.status === 'active'
                ? 'bg-green-100 text-green-800'
                : objective.status === 'completed'
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-gray-100 text-gray-600'
            }
          >
            {t(`goals.status.${objective.status}`, objective.status)}
          </Badge>
        </div>

        {objective.description && (
          <p className="text-sm text-muted-foreground">{objective.description}</p>
        )}

        {/* Overall Progress */}
        <div>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="font-medium">{t('goals.overallProgress', 'Overall Progress')}</span>
            <span className={`font-bold ${getProgressColor(objective.progress)}`}>
              {objective.progress}%
            </span>
          </div>
          <Progress value={objective.progress} className="h-3" />
        </div>

        {/* Key Results */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">{t('goals.keyResults', 'Key Results')}</h4>
          {objective.keyResults.map((kr: any) => {
            const pct = kr.completionPercent;
            return (
              <Card key={kr._id}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <span className="text-sm font-medium">{kr.title}</span>
                    <div className="flex items-center gap-2">
                      <Badge className={getConfidenceBadge(kr.confidence).color + ' text-xs'}>
                        {getConfidenceBadge(kr.confidence).label}
                      </Badge>
                      {isOwner && isActive && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => onCheckin(kr)}
                        >
                          <TrendingUp className="h-3 w-3 mr-1" />
                          {t('goals.checkin.btn', 'Check-in')}
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      {kr.startValue}
                      {kr.unit || ''}
                    </span>
                    <Progress value={pct} className="h-2 flex-1" />
                    <span className="font-medium">
                      {kr.currentValue}
                      {kr.unit || ''}
                    </span>
                    <span>
                      / {kr.targetValue}
                      {kr.unit || ''}
                    </span>
                  </div>
                  {kr.checkins.length > 0 && (
                    <div className="border-t pt-2 mt-2">
                      <p className="text-xs font-medium mb-1">
                        {t('goals.recentCheckins', 'Recent Check-ins')}
                      </p>
                      {kr.checkins.slice(0, 3).map((c: any) => (
                        <div
                          key={c._id}
                          className="text-xs text-muted-foreground flex items-center gap-2"
                        >
                          <Calendar className="h-3 w-3" />
                          <span>{new Date(c.createdAt).toLocaleDateString()}</span>
                          <span>
                            {c.previousValue} → {c.newValue}
                            {kr.unit || ''}
                          </span>
                          {c.note && (
                            <span className="italic truncate max-w-[150px]">{c.note}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Children */}
        {objective.children && objective.children.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-2">
              {t('goals.alignedGoals', 'Aligned Goals')}
            </h4>
            {objective.children.map((child: any) => (
              <div
                key={child._id}
                className="text-sm flex items-center gap-2 p-2 border rounded mb-1"
              >
                <Crosshair className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1 truncate">{child.title}</span>
                <span className={`font-medium ${getProgressColor(child.progress)}`}>
                  {child.progress}%
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        {isOwner && isActive && (
          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  await completeObjective({ objectiveId });
                  toast.success(t('goals.completed', 'Objective completed!'));
                  onClose();
                } catch (e) {
                  toast.error(String(e));
                }
              }}
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              {t('goals.markComplete', 'Mark Complete')}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={async () => {
                try {
                  await deleteObjective({ objectiveId });
                  toast.success(t('goals.deleted', 'Objective deleted'));
                  onClose();
                } catch (e) {
                  toast.error(String(e));
                }
              }}
            >
              {t('common.delete', 'Delete')}
            </Button>
          </div>
        )}
      </div>
    </DialogContent>
  );
}

// ============ MAIN COMPONENT ============

export default function GoalsClient() {
  const { t } = useTranslation();
  const router = useRouter();
  const mainRef = useMainRef();
  const user = useAuthUser();
  const selectedOrgId = useSelectedOrganization();
  const organizationId = (selectedOrgId ?? user?.organizationId ?? undefined) as
    | Id<'organizations'>
    | undefined;
  const userId = user?.id as Id<'users'> | undefined;
  const userRole = user?.role || 'employee';

  const [showWizard, setShowWizard] = useState(false);
  const [selectedTab, setSelectedTab] = useState('my');
  const [filterPeriod, setFilterPeriod] = useState<PeriodType | 'all'>('all');
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [checkinKR, setCheckinKR] = useState<{
    _id: Id<'keyResults'>;
    title: string;
    currentValue: number;
    targetValue: number;
    unit?: string;
    metricType: string;
  } | null>(null);

  const objectives = useQuery(
    api.goals.listObjectives,
    organizationId
      ? {
          organizationId,
          periodYear: filterYear,
          periodType: filterPeriod !== 'all' ? filterPeriod : undefined,
        }
      : 'skip',
  );

  const myObjectives = useQuery(
    api.goals.getMyObjectives,
    organizationId && userId ? { organizationId, userId } : 'skip',
  );

  const teamProgress = useQuery(
    api.goals.getTeamProgress,
    organizationId ? { organizationId, periodYear: filterYear } : 'skip',
  );

  // Parent options for alignment (company & team level objectives)
  const parentOptions = useMemo(() => {
    if (!objectives) return [];
    return objectives
      .filter((o: any) => o.level === 'company' || o.level === 'team')
      .map((o: any) => ({ _id: o._id, title: o.title, level: o.level }));
  }, [objectives]);

  // Filter objectives by tab
  const filteredObjectives = useMemo(() => {
    if (!objectives) return [];
    switch (selectedTab) {
      case 'my':
        return objectives.filter((o: any) => o.ownerId === userId);
      case 'team':
        return objectives.filter((o: any) => o.level === 'team');
      case 'company':
        return objectives.filter((o: any) => o.level === 'company');
      default:
        return objectives;
    }
  }, [objectives, selectedTab, userId]);

  if (!user || !organizationId) return <ShieldLoader />;

  const levelIcons: Record<string, React.ReactNode> = {
    company: <Building2 className="h-4 w-4" />,
    team: <Users className="h-4 w-4" />,
    individual: <User className="h-4 w-4" />,
  };

  return (
    <div className="">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 py-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              {t('goals.title', 'OKR & Goals')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('goals.subtitle', 'Set objectives, track key results, and align your team')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <Select value={String(filterYear)} onValueChange={(v) => setFilterYear(Number(v))}>
              <SelectTrigger className="w-20 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2025">2025</SelectItem>
                <SelectItem value="2026">2026</SelectItem>
                <SelectItem value="2027">2027</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={filterPeriod}
              onValueChange={(v) => setFilterPeriod(v as PeriodType | 'all')}
            >
              <SelectTrigger className="w-20 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('goals.allPeriods', 'All')}</SelectItem>
                <SelectItem value="Q1">Q1</SelectItem>
                <SelectItem value="Q2">Q2</SelectItem>
                <SelectItem value="Q3">Q3</SelectItem>
                <SelectItem value="Q4">Q4</SelectItem>
                <SelectItem value="H1">H1</SelectItem>
                <SelectItem value="H2">H2</SelectItem>
                <SelectItem value="FY">FY</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={() => {
                const mainEl = mainRef.current;
                if (mainEl) {
                  mainEl.scrollTo({ top: 0, behavior: 'smooth' });
                }
                window.scrollTo({ top: 0, behavior: 'smooth' });
                setShowWizard(true);
              }}
              className="flex-1 sm:flex-initial"
            >
              <Plus className="h-4 w-4 mr-1" /> {t('goals.create', 'New Objective')}
            </Button>
          </div>
        </div>
      </div>

      {/* Stats */}
      {teamProgress && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <Target className="w-5 h-5 text-blue-700" />
              </div>
              <div>
                <p className="text-2xl font-bold">{teamProgress.total}</p>
                <p className="text-xs text-muted-foreground">
                  {t('goals.stats.total', 'Total Objectives')}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <TrendingUp className="w-5 h-5 text-green-700" />
              </div>
              <div>
                <p className="text-2xl font-bold">{teamProgress.avgProgress}%</p>
                <p className="text-xs text-muted-foreground">
                  {t('goals.stats.avgProgress', 'Avg Progress')}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100">
                <CheckCircle className="w-5 h-5 text-emerald-700" />
              </div>
              <div>
                <p className="text-2xl font-bold">{teamProgress.onTrack}</p>
                <p className="text-xs text-muted-foreground">
                  {t('goals.stats.onTrack', 'On Track')}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100">
                <AlertTriangle className="w-5 h-5 text-red-700" />
              </div>
              <div>
                <p className="text-2xl font-bold">{teamProgress.atRisk + teamProgress.behind}</p>
                <p className="text-xs text-muted-foreground">
                  {t('goals.stats.atRisk', 'At Risk / Behind')}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="w-full my-4 gap-2 bg-transparent p-0 h-auto grid grid-cols-3">
          <TabsTrigger
            className="w-full px-4 py-2.5 rounded-xl data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center"
            value="my"
          >
            <User className="h-4 w-4 mr-1 hidden sm:inline" />
            {t('goals.tabs.my', 'My Goals')}
            {myObjectives && (
              <Badge variant="warning" className="ml-1 text-xs border-0">
                {myObjectives.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger
            className="w-full px-4 py-2.5 rounded-xl data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center"
            value="team"
          >
            <Users className="h-4 w-4 mr-1 hidden sm:inline" />
            {t('goals.tabs.team', 'Team')}
          </TabsTrigger>
          <TabsTrigger
            className="w-full px-4 py-2.5 rounded-xl data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center"
            value="company"
          >
            <Building2 className="h-4 w-4 mr-1 hidden sm:inline" />
            {t('goals.tabs.company', 'Company')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={selectedTab} className="mt-4">
          {!objectives ? (
            <ShieldLoader />
          ) : filteredObjectives.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Crosshair className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="font-medium">{t('goals.empty', 'No objectives yet')}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('goals.emptyHint', 'Create your first objective to get started')}
                </p>
                <Button
                  className="mt-4"
                  onClick={() => {
                    const mainEl = mainRef.current;
                    if (mainEl) {
                      mainEl.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    setShowWizard(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" /> {t('goals.create', 'New Objective')}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredObjectives.map((obj: any) => (
                <Card
                  key={obj._id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => router.push(`/goals/${obj._id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-lg bg-muted shrink-0">
                          {levelIcons[obj.level]}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{obj.title}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{obj.ownerName}</span>
                            <span>•</span>
                            <span>
                              {obj.periodType} {obj.periodYear}
                            </span>
                            <span>•</span>
                            <span>{obj.keyResultsCount} KRs</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
                        <div className="w-24 sm:w-32">
                          <div className="flex items-center justify-between text-xs mb-0.5">
                            <span className={`font-bold ${getProgressColor(obj.progress)}`}>
                              {obj.progress}%
                            </span>
                          </div>
                          <Progress value={obj.progress} className="h-2" />
                        </div>
                        <Badge
                          className={
                            obj.status === 'active'
                              ? 'bg-green-100 text-green-800'
                              : obj.status === 'completed'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-gray-100 text-gray-600'
                          }
                        >
                          {String(t(`goals.status.${obj.status}`, obj.status))}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <Dialog open={showWizard} onOpenChange={setShowWizard}>
        {showWizard && (
          <CreateObjectiveWizard
            organizationId={organizationId}
            userId={userId!}
            userRole={userRole}
            userDepartment={user?.department}
            parentOptions={parentOptions}
            onClose={() => setShowWizard(false)}
          />
        )}
      </Dialog>

      <Dialog open={!!checkinKR} onOpenChange={() => setCheckinKR(null)}>
        {checkinKR && (
          <CheckinDialog
            krId={checkinKR._id}
            krTitle={checkinKR.title}
            currentValue={checkinKR.currentValue}
            targetValue={checkinKR.targetValue}
            unit={checkinKR.unit || ''}
            metricType={checkinKR.metricType}
            onClose={() => setCheckinKR(null)}
          />
        )}
      </Dialog>
    </div>
  );
}
