'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from '@/lib/cssMotion';
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
import {
  Trash2,
  GripVertical,
  Zap,
  GitBranch,
  Settings,
  Play,
  Save,
  Eye,
  AlertCircle,
  ArrowRight,
  Clock,
  CheckCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { logger } from '@/lib/logger';

// ── Types ────────────────────────────────────────────────────────────────────

type StepType = 'trigger' | 'action' | 'condition' | 'delay';

interface WorkflowStep {
  id: string;
  type: StepType;
  label: string;
  config: Record<string, unknown>;
  position: number;
}

interface StepPaletteItem {
  type: StepType;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  defaultConfig: Record<string, unknown>;
}

// ── Constants ────────────────────────────────────────────────────────────────

const STEP_PALETTE: StepPaletteItem[] = [
  {
    type: 'trigger',
    label: 'automation.builder.stepTypes.trigger',
    description: 'automation.builder.stepDescriptions.trigger',
    icon: <Zap className="w-4 h-4" />,
    color: 'amber',
    defaultConfig: { eventType: '', conditions: [] },
  },
  {
    type: 'action',
    label: 'automation.builder.stepTypes.action',
    description: 'automation.builder.stepDescriptions.action',
    icon: <Play className="w-4 h-4" />,
    color: 'blue',
    defaultConfig: { actionType: '', parameters: {} },
  },
  {
    type: 'condition',
    label: 'automation.builder.stepTypes.condition',
    description: 'automation.builder.stepDescriptions.condition',
    icon: <GitBranch className="w-4 h-4" />,
    color: 'purple',
    defaultConfig: { field: '', operator: '', value: '' },
  },
  {
    type: 'delay',
    label: 'automation.builder.stepTypes.delay',
    description: 'automation.builder.stepDescriptions.delay',
    icon: <Clock className="w-4 h-4" />,
    color: 'green',
    defaultConfig: { duration: 0, unit: 'minutes' },
  },
];

const TRIGGER_TYPES = [
  { value: 'leave_created', label: 'automation.builder.triggerTypes.leave_created' },
  { value: 'leave_approved', label: 'automation.builder.triggerTypes.leave_approved' },
  { value: 'leave_rejected', label: 'automation.builder.triggerTypes.leave_rejected' },
  { value: 'user_onboarded', label: 'automation.builder.triggerTypes.user_onboarded' },
  { value: 'user_offboarded', label: 'automation.builder.triggerTypes.user_offboarded' },
  { value: 'ticket_created', label: 'automation.builder.triggerTypes.ticket_created' },
  { value: 'ticket_escalated', label: 'automation.builder.triggerTypes.ticket_escalated' },
  {
    value: 'performance_review_due',
    label: 'automation.builder.triggerTypes.performance_review_due',
  },
  { value: 'contract_expiring', label: 'automation.builder.triggerTypes.contract_expiring' },
  { value: 'custom', label: 'automation.builder.triggerTypes.custom' },
];

const ACTION_TYPES = [
  { value: 'send_email', label: 'automation.builder.actionTypes.send_email' },
  { value: 'send_notification', label: 'automation.builder.actionTypes.send_notification' },
  { value: 'create_task', label: 'automation.builder.actionTypes.create_task' },
  { value: 'update_record', label: 'automation.builder.actionTypes.update_record' },
  { value: 'approve_request', label: 'automation.builder.actionTypes.approve_request' },
  { value: 'reject_request', label: 'automation.builder.actionTypes.reject_request' },
  { value: 'escalate', label: 'automation.builder.actionTypes.escalate' },
  { value: 'assign_user', label: 'automation.builder.actionTypes.assign_user' },
  { value: 'block_user', label: 'automation.builder.actionTypes.block_user' },
  { value: 'webhook', label: 'automation.builder.actionTypes.webhook' },
];

const CONDITION_OPERATORS = [
  { value: 'equals', label: 'automation.builder.conditionOperators.equals' },
  { value: 'not_equals', label: 'automation.builder.conditionOperators.not_equals' },
  { value: 'contains', label: 'automation.builder.conditionOperators.contains' },
  { value: 'greater_than', label: 'automation.builder.conditionOperators.greater_than' },
  { value: 'less_than', label: 'automation.builder.conditionOperators.less_than' },
  { value: 'is_empty', label: 'automation.builder.conditionOperators.is_empty' },
  { value: 'is_not_empty', label: 'automation.builder.conditionOperators.is_not_empty' },
];

const DELAY_UNITS = [
  { value: 'minutes', label: 'automation.builder.delayUnits.minutes' },
  { value: 'hours', label: 'automation.builder.delayUnits.hours' },
  { value: 'days', label: 'automation.builder.delayUnits.days' },
];

// ── Sortable Step Node ───────────────────────────────────────────────────────

function SortableStepNode({
  step,
  isSelected,
  onConfigure,
  onRemove,
}: {
  step: WorkflowStep;
  isSelected: boolean;
  onConfigure: (step: WorkflowStep) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: step.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const paletteItem = STEP_PALETTE.find((p) => p.type === step.type);
  const colorClasses: Record<string, string> = {
    amber: 'border-(--warning-outline) bg-(--warning-quiet)',
    blue: 'border-(--brand-outline) bg-(--brand-quiet)',
    purple: 'border-(--purple-outline) bg-(--purple-quiet)',
    green: 'border-(--success-outline) bg-(--success-quiet)',
  };
  const iconColorClasses: Record<string, string> = {
    amber: 'text-(--warning-text)',
    blue: 'text-(--brand-text)',
    purple: 'text-(--purple-text)',
    green: 'text-(--success-text)',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group border-2 rounded-xl p-4 transition-all duration-200 ${
        isSelected
          ? `${colorClasses[paletteItem?.color || 'blue']} border-2`
          : 'border-(--border) hover:border-(--border-strong)'
      }`}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-(--text-muted) hover:text-(--text-primary) transition-colors"
        >
          <GripVertical className="w-4 h-4" />
        </button>

        <div className={`p-2 rounded-lg ${colorClasses[paletteItem?.color || 'blue']}`}>
          <span className={iconColorClasses[paletteItem?.color || 'blue']}>
            {paletteItem?.icon}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-(--text-primary) truncate">
              {t(step.label) || t(paletteItem?.label || '')}
            </p>
            <Badge variant="secondary" className="text-[10px]">
              {t(`automation.builder.stepTypes.${step.type}`)}
            </Badge>
          </div>
          <p className="text-xs text-(--text-muted) mt-0.5 truncate">
            {t(paletteItem?.description || '')}
          </p>
        </div>

        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onConfigure(step)}
            className="h-8 w-8 p-0"
          >
            <Settings className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRemove(step.id)}
            className="h-8 w-8 p-0 text-destructive hover:text-destructive/80"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {isSelected && (
        <div className="mt-3 pt-3 border-t border-(--border)">
          <pre className="text-xs text-(--text-muted) bg-(--background-subtle) rounded-lg p-3 overflow-x-auto">
            {JSON.stringify(step.config, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Step Configuration Dialog ────────────────────────────────────────────────

function StepConfigDialog({
  step,
  open,
  onClose,
  onSave,
}: {
  step: WorkflowStep | null;
  open: boolean;
  onClose: () => void;
  onSave: (step: WorkflowStep) => void;
}) {
  const { t } = useTranslation();
  const [localConfig, setLocalConfig] = useState<Record<string, unknown>>({});
  const [localLabel, setLocalLabel] = useState('');

  React.useEffect(() => {
    if (step) {
      setLocalConfig(step.config);
      setLocalLabel(step.label);
    }
  }, [step]);

  if (!step) return null;

  const paletteItem = STEP_PALETTE.find((p) => p.type === step.type);

  const handleSave = () => {
    onSave({
      ...step,
      label: localLabel,
      config: localConfig,
    });
    onClose();
  };

  const updateConfig = (key: string, value: unknown) => {
    setLocalConfig((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" size="md" closeLabel={t('common.close', 'Close')}>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {paletteItem?.icon}
            {t('automation.builder.configure')} {t(paletteItem?.label || '')}
          </SheetTitle>
        </SheetHeader>

        <SheetBody className="space-y-4">
          <div>
            <label className="text-sm font-medium text-(--text-primary) mb-1 block">
              {t('automation.builder.stepName')}
            </label>
            <Input
              value={localLabel}
              onChange={(e) => setLocalLabel(e.target.value)}
              placeholder={t('automation.builder.stepNamePlaceholder')}
            />
          </div>

          {step.type === 'trigger' && (
            <div>
              <label className="text-sm font-medium text-(--text-primary) mb-1 block">
                {t('automation.builder.eventType')}
              </label>
              <select
                className="w-full rounded-md border border-(--border) bg-(--background) px-3 py-2 text-sm"
                value={(localConfig.eventType as string) || ''}
                onChange={(e) => updateConfig('eventType', e.target.value)}
              >
                <option value="">{t('automation.builder.selectEvent')}</option>
                {TRIGGER_TYPES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.label)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {step.type === 'action' && (
            <>
              <div>
                <label className="text-sm font-medium text-(--text-primary) mb-1 block">
                  {t('automation.builder.actionType')}
                </label>
                <select
                  className="w-full rounded-md border border-(--border) bg-(--background) px-3 py-2 text-sm"
                  value={(localConfig.actionType as string) || ''}
                  onChange={(e) => updateConfig('actionType', e.target.value)}
                >
                  <option value="">{t('automation.builder.selectAction')}</option>
                  {ACTION_TYPES.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {t(opt.label)}
                    </option>
                  ))}
                </select>
              </div>
              {(localConfig.actionType === 'send_email' ||
                localConfig.actionType === 'send_notification') && (
                <div>
                  <label className="text-sm font-medium text-(--text-primary) mb-1 block">
                    {t('automation.builder.recipient')}
                  </label>
                  <Input
                    value={(localConfig.recipient as string) || ''}
                    onChange={(e) => updateConfig('recipient', e.target.value)}
                    placeholder={t('automation.builder.recipientPlaceholder')}
                  />
                </div>
              )}
            </>
          )}

          {step.type === 'condition' && (
            <>
              <div>
                <label className="text-sm font-medium text-(--text-primary) mb-1 block">
                  {t('automation.builder.field')}
                </label>
                <Input
                  value={(localConfig.field as string) || ''}
                  onChange={(e) => updateConfig('field', e.target.value)}
                  placeholder={t('automation.builder.fieldPlaceholder')}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-(--text-primary) mb-1 block">
                  {t('automation.builder.operator')}
                </label>
                <select
                  className="w-full rounded-md border border-(--border) bg-(--background) px-3 py-2 text-sm"
                  value={(localConfig.operator as string) || ''}
                  onChange={(e) => updateConfig('operator', e.target.value)}
                >
                  <option value="">{t('automation.builder.selectOperator')}</option>
                  {CONDITION_OPERATORS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {t(opt.label)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-(--text-primary) mb-1 block">
                  {t('automation.builder.value')}
                </label>
                <Input
                  value={(localConfig.value as string) || ''}
                  onChange={(e) => updateConfig('value', e.target.value)}
                  placeholder={t('automation.builder.valuePlaceholder')}
                />
              </div>
            </>
          )}

          {step.type === 'delay' && (
            <>
              <div>
                <label className="text-sm font-medium text-(--text-primary) mb-1 block">
                  {t('automation.builder.duration')}
                </label>
                <Input
                  type="number"
                  min="0"
                  value={(localConfig.duration as number) || 0}
                  onChange={(e) => updateConfig('duration', parseInt(e.target.value, 10))}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-(--text-primary) mb-1 block">
                  {t('automation.builder.unit')}
                </label>
                <select
                  className="w-full rounded-md border border-(--border) bg-(--background) px-3 py-2 text-sm"
                  value={(localConfig.unit as string) || 'minutes'}
                  onChange={(e) => updateConfig('unit', e.target.value)}
                >
                  {DELAY_UNITS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {t(opt.label)}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </SheetBody>

        <SheetFooter>
          <Button variant="outline" onClick={onClose}>
            {t('automation.builder.cancel')}
          </Button>
          <Button onClick={handleSave}>
            <Save className="w-4 h-4 mr-2" />
            {t('automation.builder.saveStep')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ── Workflow Palette ─────────────────────────────────────────────────────────

function StepPalette({ onAddStep }: { onAddStep: (type: StepType) => void }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(true);

  return (
    <AnimatePresence mode="wait">
      {visible ? (
        <motion.div
          key="palette"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 'auto', opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          className="shrink-0 overflow-hidden"
        >
          <Card className="w-full md:w-64">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">
                  {t('automation.builder.stepPalette')}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setVisible(false)}
                  className="h-6 w-6 p-0"
                >
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {STEP_PALETTE.map((item) => (
                <button
                  key={item.type}
                  onClick={() => onAddStep(item.type)}
                  className="w-full text-left p-3 rounded-lg border border-(--border) hover:border-(--border-strong) hover:bg-(--background-subtle) transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-md bg-(--background-subtle) group-hover:bg-(--background)">
                      {item.icon}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-(--text-primary)">{t(item.label)}</p>
                      <p className="text-xs text-(--text-muted)">{t(item.description)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <motion.div
          key="collapsed"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 'auto', opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          className="shrink-0 overflow-hidden"
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => setVisible(true)}
            className="w-full md:w-auto"
          >
            <ChevronRight className="w-4 h-4 mr-2" />
            {t('automation.builder.stepPalette')}
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Main Workflow Builder ────────────────────────────────────────────────────

export default function WorkflowBuilderClient() {
  const { t } = useTranslation();
  const [workflowName, setWorkflowName] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [configuringStep, setConfiguringStep] = useState<WorkflowStep | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('builder');

  const createWorkflowMutation = useMutation(api.automationMutations.createWorkflow);
  const existingWorkflows = useQuery(api.automation.getActiveWorkflows) as
    | Array<{
        _id: string;
        name: string;
        description: string;
        isActive: boolean;
        config?: Record<string, unknown>;
      }>
    | undefined;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSteps((items) => {
        const oldIndex = items.findIndex((s) => s.id === active.id);
        const newIndex = items.findIndex((s) => s.id === over.id);
        if (oldIndex !== -1 && newIndex !== -1) {
          return arrayMove(items, oldIndex, newIndex);
        }
        return items;
      });
    }
  }, []);

  const handleAddStep = useCallback(
    (type: StepType) => {
      const paletteItem = STEP_PALETTE.find((p) => p.type === type);
      const newStep: WorkflowStep = {
        id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        type,
        label: t(`automation.builder.stepTypes.${type}`),
        config: paletteItem?.defaultConfig || {},
        position: steps.length,
      };
      setSteps((prev) => [...prev, newStep]);
    },
    [steps.length, t],
  );

  const handleRemoveStep = useCallback((id: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== id));
    setSelectedStepId((prev) => (prev === id ? null : prev));
  }, []);

  const handleConfigureStep = useCallback((step: WorkflowStep) => {
    setConfiguringStep(step);
    setConfigDialogOpen(true);
  }, []);

  const handleSaveStepConfig = useCallback((updatedStep: WorkflowStep) => {
    setSteps((prev) => prev.map((s) => (s.id === updatedStep.id ? updatedStep : s)));
    setConfiguringStep(null);
    setConfigDialogOpen(false);
  }, []);

  const handleSaveWorkflow = useCallback(async () => {
    if (!workflowName.trim()) {
      toast.error(t('automation.builder.nameRequired'));
      return;
    }
    if (steps.length === 0) {
      toast.error(t('automation.builder.addStepRequired'));
      return;
    }

    setIsSaving(true);
    try {
      await createWorkflowMutation({
        name: workflowName,
        description: workflowDescription || undefined,
        config: {
          steps: steps.map((s) => ({
            id: s.id,
            type: s.type,
            label: s.label,
            config: s.config,
            position: s.position,
          })),
          trigger: steps.find((s) => s.type === 'trigger')?.config || null,
          action: steps.find((s) => s.type === 'action')?.config || null,
        },
      });
      toast.success(t('automation.builder.saveSuccess'));
      setWorkflowName('');
      setWorkflowDescription('');
      setSteps([]);
    } catch (error) {
      toast.error(t('automation.builder.saveError'));
      logger.error('Save workflow error:', error);
    } finally {
      setIsSaving(false);
    }
  }, [workflowName, workflowDescription, steps, createWorkflowMutation, t]);

  const _selectedStep = useMemo(
    () => steps.find((s) => s.id === selectedStepId) || null,
    [steps, selectedStepId],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
        <div className="flex flex-col sm:flex-row imtes-start sm:items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-(--text-primary)">
              {t('automation.builder.title')}
            </h1>
            <p className="text-sm text-(--text-muted) mt-1">
              {t('automation.builder.description')}
            </p>
          </div>
          <Button
            onClick={handleSaveWorkflow}
            disabled={isSaving}
            className="flex items-center gap-2 btn-gradient text-white font-medium shadow-md hover:shadow-lg"
          >
            {isSaving ? <ShieldLoader size="xs" variant="inline" /> : <Save className="w-4 h-4" />}
            {isSaving ? t('automation.builder.saving') : t('automation.builder.saveWorkflow')}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="builder">{t('automation.builder.title')}</TabsTrigger>
          <TabsTrigger value="workflows">{t('automation.builder.savedWorkflows')}</TabsTrigger>
        </TabsList>

        <TabsContent value="builder" className="space-y-4 mt-4">
          {/* Workflow Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('automation.builder.workflowDetails')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-(--text-primary) mb-1 block">
                  {t('automation.builder.workflowName')}
                </label>
                <Input
                  value={workflowName}
                  onChange={(e) => setWorkflowName(e.target.value)}
                  placeholder={t('automation.builder.workflowNamePlaceholder')}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-(--text-primary) mb-1 block">
                  {t('automation.builder.workflowDescription')}
                </label>
                <Textarea
                  value={workflowDescription}
                  onChange={(e) => setWorkflowDescription(e.target.value)}
                  placeholder={t('automation.builder.workflowDescriptionPlaceholder')}
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          {/* Builder Canvas */}
          <div className="flex flex-col md:flex-row gap-6">
            {/* Palette */}
            <StepPalette onAddStep={handleAddStep} />

            {/* Canvas */}
            <Card className="flex-1 min-h-[500px]">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Zap className="w-5 h-5 text-(--warning-text)" />
                  {t('automation.builder.steps')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {steps.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <AlertCircle className="w-12 h-12 text-(--text-muted) mb-4" />
                    <p className="text-(--text-muted) mb-2">{t('automation.builder.noSteps')}</p>
                    <p className="text-sm text-(--text-muted)">
                      {t('automation.builder.noStepsHint')}
                    </p>
                  </div>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={() => {}}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={steps.map((s) => s.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-3">
                        {steps.map((step, index) => (
                          <div key={step.id} className="relative">
                            {index > 0 && (
                              <div className="absolute -top-3 left-6 w-px h-3 bg-(--border)">
                                <ArrowRight className="w-3 h-3 -ml-1.5 -mt-1.5 text-(--text-muted)" />
                              </div>
                            )}
                            <SortableStepNode
                              step={step}
                              isSelected={step.id === selectedStepId}
                              onConfigure={handleConfigureStep}
                              onRemove={handleRemoveStep}
                            />
                          </div>
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="workflows" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-(--warning-text)" />
                {t('automation.builder.savedWorkflows')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {existingWorkflows && existingWorkflows.length > 0 ? (
                <div className="space-y-3">
                  {existingWorkflows.map((workflow) => (
                    <div
                      key={workflow._id}
                      className="flex items-center justify-between p-4 rounded-lg border border-(--border) hover:bg-(--background-subtle) transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            workflow.isActive ? 'bg-(--success-solid)' : 'bg-(--surface-3)'
                          }`}
                        />
                        <div>
                          <p className="font-medium text-(--text-primary)">{workflow.name}</p>
                          <p className="text-xs text-(--text-muted)">{workflow.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={workflow.isActive ? 'success' : 'secondary'}>
                          {workflow.isActive
                            ? t('automation.builder.active')
                            : t('automation.builder.inactive')}
                        </Badge>
                        <Button variant="ghost" size="sm">
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <CheckCircle className="w-12 h-12 text-(--text-muted) mb-4" />
                  <p className="text-(--text-muted)">{t('automation.builder.noWorkflowsSaved')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Step Configuration Dialog */}
      <StepConfigDialog
        step={configuringStep}
        open={configDialogOpen}
        onClose={() => {
          setConfigDialogOpen(false);
          setConfiguringStep(null);
        }}
        onSave={handleSaveStepConfig}
      />
    </motion.div>
  );
}
