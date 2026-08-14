'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetBody,
  SheetFooter,
} from '@/components/ui/sheet';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Power,
  Users,
  MessageSquare,
  Calendar,
  Send,
  ChevronRight,
  ChevronLeft,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { useWizardDraft } from '@/hooks/useWizardDraft';
import { WizardDraftNotice } from '@/components/ui/WizardDraftNotice';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import { useTranslation } from 'react-i18next';

interface ServiceBroadcastDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId?: Id<'organizations'> | string;
  userId?: Id<'users'> | string;
}

const BROADCAST_ICONS = [
  { icon: 'ℹ️', label: 'Information', color: '#3b82f6' },
  { icon: '⚠️', label: 'Warning', color: '#f59e0b' },
  { icon: '🔧', label: 'Maintenance', color: '#6b7280' },
  { icon: '🚨', label: 'Urgent', color: '#ef4444' },
  { icon: '🎉', label: 'Announcement', color: '#8b5cf6' },
  { icon: '🔒', label: 'Security', color: '#10b981' },
  { icon: '📢', label: 'Broadcast', color: '#ec4899' },
  { icon: '🔄', label: 'Update', color: '#06b6d4' },
];

type StepId = 'audience' | 'message' | 'schedule' | 'review';

export function ServiceBroadcastDialog({
  open,
  onOpenChange,
  organizationId,
  userId,
}: ServiceBroadcastDialogProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ru' ? 'ru-RU' : i18n.language === 'hy' ? 'hy-AM' : 'en-US';

  const DURATION_OPTIONS = [
    { label: t('broadcastDialog.duration30min'), value: '30 minutes' },
    { label: t('broadcastDialog.duration1h'), value: '1 hour' },
    { label: t('broadcastDialog.duration2h'), value: '2 hours' },
    { label: t('broadcastDialog.duration3h'), value: '3 hours' },
    { label: t('broadcastDialog.duration4h'), value: '4 hours' },
    { label: t('broadcastDialog.durationUnknown'), value: undefined },
  ];

  const STEPS = [
    { id: 'audience' as StepId, label: t('broadcastDialog.audience'), icon: Users },
    { id: 'message' as StepId, label: t('broadcastDialog.message'), icon: MessageSquare },
    { id: 'schedule' as StepId, label: t('broadcastDialog.schedule'), icon: Calendar },
    { id: 'review' as StepId, label: t('broadcastDialog.review'), icon: Send },
  ];

  const [currentStep, setCurrentStep] = useState<StepId>('audience');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('⚠️');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // Schedule & Maintenance
  const [scheduleDateTime, setScheduleDateTime] = useState('');
  const [estimatedDuration, setEstimatedDuration] = useState<string | undefined>();
  const [scheduleMaintenance, setScheduleMaintenance] = useState(false);

  // Organization selection
  const [broadcastScope, setBroadcastScope] = useState<'all' | 'specific'>('specific');
  const [selectedOrgId, setSelectedOrgId] = useState<string>(organizationId as string);

  const organizations = useQuery(
    api.organizations.getAllOrganizations,
    userId ? { superadminUserId: userId as Id<'users'> } : 'skip',
  );

  const sendBroadcast = useMutation(api.admin.sendServiceBroadcast);
  const enableMaintenanceMode = useMutation(api.admin.enableMaintenanceMode);

  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep);

  // ── Черновик: введённые данные переживают случайное закрытие модалки ───────
  const draftData = useMemo(
    () => ({
      title,
      content,
      selectedIcon,
      scheduleDateTime,
      estimatedDuration,
      scheduleMaintenance,
      broadcastScope,
      selectedOrgId,
    }),
    [
      title,
      content,
      selectedIcon,
      scheduleDateTime,
      estimatedDuration,
      scheduleMaintenance,
      broadcastScope,
      selectedOrgId,
    ],
  );

  // «Нетронутая форма» — исходные значения, чтобы плашка не появлялась на
  // формах без правок.
  const pristineForm = useMemo(
    () => ({
      title: '',
      content: '',
      selectedIcon: '⚠️',
      scheduleDateTime: '',
      estimatedDuration: undefined as string | undefined,
      scheduleMaintenance: false,
      broadcastScope: 'specific' as 'all' | 'specific',
      selectedOrgId: (organizationId as string) ?? '',
    }),
    [organizationId],
  );
  const handleRestoreDraft = useCallback((d: typeof draftData, savedStep: number) => {
    if (d.title !== undefined) setTitle(d.title);
    if (d.content !== undefined) setContent(d.content);
    if (d.selectedIcon) setSelectedIcon(d.selectedIcon);
    if (d.scheduleDateTime !== undefined) setScheduleDateTime(d.scheduleDateTime);
    if (d.estimatedDuration !== undefined) setEstimatedDuration(d.estimatedDuration);
    if (d.scheduleMaintenance !== undefined) setScheduleMaintenance(d.scheduleMaintenance);
    if (d.broadcastScope) setBroadcastScope(d.broadcastScope);
    if (d.selectedOrgId !== undefined) setSelectedOrgId(d.selectedOrgId);
    const idx = Math.min(Math.max(savedStep, 0), STEPS.length - 1);
    const step = STEPS[idx];
    if (step) setCurrentStep(step.id);
    // STEPS пересоздаётся каждый рендер (зависит от t()), но его id-список
    // стабилен — берём длину из замыкания один раз.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draft = useWizardDraft({
    key: 'service-broadcast',
    enabled: open,
    data: draftData,
    step: currentStepIndex,
    defaults: pristineForm,
    onRestore: handleRestoreDraft,
  });
  const { clearDraft } = draft;

  const handleStartOver = () => {
    clearDraft();
    setTitle('');
    setContent('');
    setSelectedIcon('⚠️');
    setScheduleDateTime('');
    setEstimatedDuration(undefined);
    setScheduleMaintenance(false);
    setBroadcastScope('specific');
    setSelectedOrgId((organizationId as string) ?? '');
    setCurrentStep('audience');
  };

  const selectedOrg = organizations?.find((o) => o._id === selectedOrgId);
  const targetOrgCount = broadcastScope === 'all' ? (organizations?.length ?? 0) : 1;

  const canProceed = useMemo(() => {
    switch (currentStep) {
      case 'audience':
        return broadcastScope === 'all' || (broadcastScope === 'specific' && selectedOrgId);
      case 'message':
        return title.trim().length > 0 && content.trim().length > 0;
      case 'schedule':
        return !scheduleMaintenance || (scheduleMaintenance && scheduleDateTime);
      case 'review':
        return true;
      default:
        return true;
    }
  }, [
    currentStep,
    broadcastScope,
    selectedOrgId,
    title,
    content,
    scheduleMaintenance,
    scheduleDateTime,
  ]);

  const nextStep = () => {
    const idx = STEPS.findIndex((s) => s.id === currentStep);
    const nextStepData = STEPS[idx + 1];
    if (idx >= 0 && nextStepData) setCurrentStep(nextStepData.id);
  };

  const prevStep = () => {
    const idx = STEPS.findIndex((s) => s.id === currentStep);
    const prevStepData = STEPS[idx - 1];
    if (idx > 0 && prevStepData) setCurrentStep(prevStepData.id);
  };

  const handleSend = async () => {
    if (!title.trim() || !content.trim()) {
      setStatus('error');
      setErrorMessage(t('broadcastDialog.fillTitleAndMessage'));
      return;
    }

    if (scheduleMaintenance && !scheduleDateTime) {
      setStatus('error');
      setErrorMessage(t('broadcastDialog.specifyMaintenanceTime'));
      return;
    }

    if (!userId) {
      setStatus('error');
      setErrorMessage(t('broadcastDialog.userNotLoaded'));
      return;
    }

    setLoading(true);
    setStatus('idle');

    try {
      const targetOrgs =
        broadcastScope === 'all'
          ? (organizations?.map((o) => o._id) ?? [])
          : [selectedOrgId as Id<'organizations'>];

      const now = Date.now();
      const scheduledTime = scheduleDateTime ? new Date(scheduleDateTime).getTime() : now;

      let broadcastContent = content.trim();
      if (scheduleMaintenance && scheduleDateTime) {
        const scheduledDate = new Date(scheduledTime);
        const timeStr = scheduledDate.toLocaleString(locale, {
          hour: '2-digit',
          minute: '2-digit',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
        broadcastContent = `${content.trim()}\n\n⏰ ${t('broadcastDialog.maintenanceStartsAtContent', { time: timeStr })}`;
        if (estimatedDuration) {
          broadcastContent += `\n⏱️ ${t('broadcastDialog.estimatedDurationContent')}: ${estimatedDuration}`;
        }
      }

      for (const orgId of targetOrgs) {
        await sendBroadcast({
          organizationId: orgId,
          userId: userId as Id<'users'>,
          title: title.trim(),
          content: broadcastContent,
          icon: selectedIcon,
        });
      }

      if (scheduleMaintenance && scheduleDateTime) {
        for (const orgId of targetOrgs) {
          await enableMaintenanceMode({
            organizationId: orgId,
            userId: userId as Id<'users'>,
            title: title.trim(),
            message: broadcastContent,
            startTime: scheduledTime,
            estimatedDuration: estimatedDuration,
            icon: selectedIcon,
          });
        }
      }

      setStatus('success');
      setTitle('');
      setContent('');
      setSelectedIcon('⚠️');
      setScheduleDateTime('');
      setEstimatedDuration(undefined);
      setScheduleMaintenance(false);
      setBroadcastScope('specific');
      setSelectedOrgId(organizationId as string);
      clearDraft();

      setTimeout(() => {
        onOpenChange(false);
        setStatus('idle');
        setCurrentStep('audience');
      }, 2500);
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : t('broadcastDialog.sendError'));
    } finally {
      setLoading(false);
    }
  };

  const _now = new Date();

  const resetState = () => {
    setCurrentStep('audience');
    setStatus('idle');
    setErrorMessage('');
  };

  // ── Step 1: Audience ────────────────────────────────────────────
  const renderAudienceStep = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="w-16 h-16 rounded-2xl bg-linear-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center mx-auto mb-3">
          <Users className="w-8 h-8 text-blue-400" />
        </div>
        <h3 className="text-lg font-semibold">{t('broadcastDialog.whoGetsMessage')}</h3>
        <p className="text-sm text-(--text-muted) mt-1">{t('broadcastDialog.selectAudience')}</p>
      </div>

      <div className="space-y-3">
        {/* All organizations */}
        <button
          onClick={() => setBroadcastScope('all')}
          className={cn(
            'w-full p-4 rounded-xl border-2 transition-all text-left',
            broadcastScope === 'all'
              ? 'border-blue-500 bg-blue-500/10'
              : 'border-(--border) hover:border-(--border-hover,var(--border))',
          )}
        >
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all',
                broadcastScope === 'all' ? 'border-blue-500 bg-blue-500' : 'border-(--border)',
              )}
            >
              {broadcastScope === 'all' && <Check className="w-3 h-3 text-white" />}
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm">📢 {t('broadcastDialog.allOrganizations')}</p>
              <p className="text-xs text-(--text-muted)">
                {t('broadcastDialog.orgCount', { count: organizations?.length ?? 0 })}
              </p>
            </div>
          </div>
        </button>

        {/* Specific organization */}
        <button
          onClick={() => setBroadcastScope('specific')}
          className={cn(
            'w-full p-4 rounded-xl border-2 transition-all text-left',
            broadcastScope === 'specific'
              ? 'border-blue-500 bg-blue-500/10'
              : 'border-(--border) hover:border-(--border-hover,var(--border))',
          )}
        >
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all',
                broadcastScope === 'specific' ? 'border-blue-500 bg-blue-500' : 'border-(--border)',
              )}
            >
              {broadcastScope === 'specific' && <Check className="w-3 h-3 text-white" />}
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm">🏢 {t('broadcastDialog.specificOrganization')}</p>
              <p className="text-xs text-(--text-muted)">{t('broadcastDialog.selectOneOrg')}</p>
            </div>
          </div>
        </button>

        {broadcastScope === 'specific' && organizations && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="ml-2"
          >
            <CustomSelect
              value={selectedOrgId as string}
              onChange={setSelectedOrgId}
              fullWidth
              options={organizations.map((org) => ({
                value: org._id,
                label: `${org.name} (${t('broadcastDialog.employeeCount', {
                  count: org.activeEmployees ?? org.memberCount ?? 0,
                })} ${t('broadcastDialog.employees', { defaultValue: 'employees' })})`,
              }))}
              triggerClassName="w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              dropdownClassName="border-[var(--border)] bg-[var(--background-subtle)] text-[var(--text-primary)]"
            />{' '}
            {selectedOrg && (
              <div className="mt-2 p-3 rounded-lg bg-(--background-subtle) border border-(--border)">
                <p className="text-xs text-(--text-muted)">
                  📊 {selectedOrg.activeEmployees ?? selectedOrg.memberCount ?? 0}{' '}
                  {t('broadcastDialog.activeUsersWillReceive')}
                </p>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );

  // ── Step 2: Message ─────────────────────────────────────────────
  const renderMessageStep = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="w-16 h-16 rounded-2xl bg-linear-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center mx-auto mb-3">
          <MessageSquare className="w-8 h-8 text-purple-400" />
        </div>
        <h3 className="text-lg font-semibold">{t('broadcastDialog.messageContent')}</h3>
        <p className="text-sm text-(--text-muted) mt-1">{t('broadcastDialog.writeTitleAndText')}</p>
      </div>

      {/* Icon Selection */}
      <div>
        <label className="text-sm font-medium block mb-3">{t('broadcastDialog.messageIcon')}</label>
        <div className="grid grid-cols-4 gap-2">
          {BROADCAST_ICONS.map(({ icon, label, color }) => (
            <button
              key={icon}
              onClick={() => setSelectedIcon(icon)}
              className={cn(
                'p-3 rounded-xl border-2 transition-all text-2xl hover:scale-105 relative',
                selectedIcon === icon
                  ? 'border-transparent'
                  : 'border-transparent hover:border-(--border)',
              )}
              style={{
                backgroundColor: selectedIcon === icon ? `${color}20` : 'var(--background-subtle)',
              }}
              title={label}
            >
              {icon}
              {selectedIcon === icon && (
                <div
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: color }}
                >
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Title */}
      <div>
        <label className="text-sm font-medium block mb-2">{t('broadcastDialog.title')}</label>
        <Input
          placeholder={t('broadcastDialog.titlePlaceholder')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={loading}
          className="text-base"
        />
      </div>

      {/* Content */}
      <div>
        <label className="text-sm font-medium block mb-2">{t('broadcastDialog.messageText')}</label>
        <Textarea
          placeholder={t('broadcastDialog.messagePlaceholder')}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={loading}
          rows={5}
          className="resize-none text-sm"
        />
        <div className="flex items-center justify-between mt-1">
          <p className="text-xs text-(--text-muted)">
            {t('broadcastDialog.allActiveUsersWillReceive')}
          </p>
          <p className="text-xs text-(--text-muted)">
            {content.length} {t('broadcastDialog.characters')}
          </p>
        </div>
      </div>
    </div>
  );

  // ── Step 3: Schedule ────────────────────────────────────────────
  const renderScheduleStep = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="w-16 h-16 rounded-2xl bg-linear-to-br from-orange-500/20 to-red-500/20 flex items-center justify-center mx-auto mb-3">
          <Calendar className="w-8 h-8 text-orange-400" />
        </div>
        <h3 className="text-lg font-semibold">{t('broadcastDialog.maintenanceSchedule')}</h3>
        <p className="text-sm text-(--text-muted) mt-1">
          {t('broadcastDialog.scheduleMaintenanceDesc')}
        </p>
      </div>

      {/* Toggle */}
      <button
        onClick={() => setScheduleMaintenance(!scheduleMaintenance)}
        className={cn(
          'w-full p-4 rounded-xl border-2 transition-all text-left',
          scheduleMaintenance
            ? 'border-orange-500 bg-orange-500/10'
            : 'border-(--border) hover:border-(--border-hover,var(--border))',
        )}
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'w-10 h-6 rounded-full transition-all flex items-center',
              scheduleMaintenance ? 'bg-orange-500 justify-end' : 'bg-(--border) justify-start',
            )}
          >
            <div className="w-5 h-5 rounded-full bg-white shadow-sm mx-0.5" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Power
                className="w-4 h-4"
                style={{ color: scheduleMaintenance ? '#f97316' : 'var(--text-muted)' }}
              />
              <p
                className="font-medium text-sm"
                style={{ color: scheduleMaintenance ? '#f97316' : undefined }}
              >
                {t('broadcastDialog.scheduleMaintenanceToggle')}
              </p>
            </div>
            <p className="text-xs text-(--text-muted) mt-0.5">
              {t('broadcastDialog.sendNowScheduleLater')}
            </p>
          </div>
        </div>
      </button>

      <AnimatePresence>
        {scheduleMaintenance && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-4"
          >
            {/* Schedule Time */}
            <div>
              <label className="text-sm font-medium flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4" />
                {t('broadcastDialog.startTime')}
              </label>
              <Input
                type="datetime-local"
                value={scheduleDateTime}
                onChange={(e) => setScheduleDateTime(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                disabled={loading}
                className="text-base"
              />
              {scheduleDateTime && (
                <div className="mt-2 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                  <p className="text-xs text-orange-400">
                    ⏰{' '}
                    {t('broadcastDialog.maintenanceStartsAt', {
                      time: new Date(scheduleDateTime).toLocaleString(locale, {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      }),
                    })}
                  </p>
                </div>
              )}
            </div>

            {/* Estimated Duration */}
            <div>
              <label className="text-sm font-medium block mb-2">
                {t('broadcastDialog.estimatedDuration')}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {DURATION_OPTIONS.map((option) => (
                  <button
                    key={option.value || 'unknown'}
                    onClick={() => setEstimatedDuration(option.value)}
                    className={cn(
                      'px-3 py-2.5 rounded-xl border-2 text-sm transition-all font-medium',
                      estimatedDuration === option.value
                        ? 'border-orange-500 bg-orange-500/10 text-orange-400'
                        : 'border-(--border) bg-(--background-subtle) text-(--text-secondary) hover:border-(--border-hover,var(--border))',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  // ── Step 4: Review ──────────────────────────────────────────────
  const renderReviewStep = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="w-16 h-16 rounded-2xl bg-linear-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center mx-auto mb-3">
          <Send className="w-8 h-8 text-emerald-400" />
        </div>
        <h3 className="text-lg font-semibold">{t('broadcastDialog.checkAndSend')}</h3>
        <p className="text-sm text-(--text-muted) mt-1">{t('broadcastDialog.makeSureCorrect')}</p>
      </div>

      {/* Summary Card */}
      <div className="rounded-xl border border-(--border) overflow-hidden">
        {/* Header with icon */}
        <div
          className="p-4 flex items-center gap-3"
          style={{
            backgroundColor: `${BROADCAST_ICONS.find((i) => i.icon === selectedIcon)?.color}15`,
          }}
        >
          <span className="text-3xl">{selectedIcon}</span>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm truncate">
              {title || t('broadcastDialog.noTitle')}
            </h4>
            <p className="text-xs text-(--text-muted) truncate">
              {broadcastScope === 'all'
                ? `📢 ${t('broadcastDialog.allOrganizations')} (${targetOrgCount})`
                : `🏢 ${selectedOrg?.name ?? t('broadcastDialog.organization')}`}
            </p>
          </div>
        </div>

        {/* Content preview */}
        <div className="p-4 border-t border-(--border)">
          <p className="text-sm text-(--text-secondary) line-clamp-3">
            {content || t('broadcastDialog.noContent')}
          </p>
        </div>

        {/* Schedule info */}
        {scheduleMaintenance && scheduleDateTime && (
          <div className="p-4 border-t border-(--border) bg-orange-500/5">
            <div className="flex items-center gap-2 text-xs text-orange-400">
              <Clock className="w-3.5 h-3.5" />
              <span>
                {t('broadcastDialog.maintenanceSchedule')}:{' '}
                {new Date(scheduleDateTime).toLocaleString(locale)}
                {estimatedDuration && ` • ${estimatedDuration}`}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Recipients count */}
      <div className="p-3 rounded-lg bg-(--background-subtle) border border-(--border) flex items-center gap-3">
        <Users className="w-5 h-5 text-(--text-muted)" />
        <div>
          <p className="text-sm font-medium">
            {t('broadcastDialog.orgCount', { count: targetOrgCount })}
          </p>
          <p className="text-xs text-(--text-muted)">
            {broadcastScope === 'all'
              ? t('broadcastDialog.allActiveUsersOfAll')
              : t('broadcastDialog.activeUsersOfOrg', { org: selectedOrg?.name })}
          </p>
        </div>
      </div>
    </div>
  );

  const renderStep = () => {
    switch (currentStep) {
      case 'audience':
        return renderAudienceStep();
      case 'message':
        return renderMessageStep();
      case 'schedule':
        return renderScheduleStep();
      case 'review':
        return renderReviewStep();
      default:
        return null;
    }
  };

  const _currentStepData = STEPS[currentStepIndex];

  return (
    <Sheet
      open={open}
      onOpenChange={(val) => {
        if (!val) resetState();
        onOpenChange(val);
      }}
    >
      <SheetContent side="right" size="md" closeLabel={t('common.close', 'Close')}>
        <SheetHeader>
          <SheetTitle>{t('broadcastDialog.serviceBroadcast')}</SheetTitle>
        </SheetHeader>
        {/* Progress Bar */}
        <div className="px-6 pt-2 pb-2 shrink-0">
          <div className="flex items-center justify-between mb-4">
            {STEPS.map((step, idx) => {
              const Icon = step.icon;
              const isActive = step.id === currentStep;
              const isCompleted = STEPS.findIndex((s) => s.id === currentStep) > idx;

              return (
                <React.Fragment key={step.id}>
                  <div className="flex flex-col items-center gap-1.5">
                    <div
                      className={cn(
                        'w-10 h-10 rounded-full flex items-center justify-center transition-all',
                        isActive
                          ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                          : isCompleted
                            ? 'bg-emerald-500 text-white'
                            : 'bg-(--background-subtle) text-(--text-muted)',
                      )}
                    >
                      {isCompleted ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                    </div>
                    <span
                      className={cn(
                        'text-[10px] font-medium hidden sm:block',
                        isActive ? 'text-blue-400' : 'text-(--text-muted)',
                      )}
                    >
                      {step.label}
                    </span>
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div
                      className={cn(
                        'flex-1 h-0.5 rounded-full transition-all mb-5',
                        isCompleted ? 'bg-emerald-500' : 'bg-(--border)',
                      )}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <SheetBody>
          <WizardDraftNotice
            show={draft.restored}
            step={draft.restoredStep}
            onReset={handleStartOver}
          />
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {renderStep()}
            </motion.div>
          </AnimatePresence>

          {/* Status Messages */}
          <AnimatePresence>
            {status === 'error' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 p-3 rounded-lg mt-4"
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  color: 'var(--destructive)',
                }}
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="text-sm">{errorMessage}</span>
              </motion.div>
            )}

            {status === 'success' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 p-3 rounded-lg mt-4"
                style={{
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  color: 'var(--success)',
                }}
              >
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span className="text-sm">
                  {scheduleMaintenance
                    ? t('broadcastDialog.sentWithMaintenance')
                    : t('broadcastDialog.sentSuccessfully')}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </SheetBody>

        {/* Footer Navigation */}
        <SheetFooter className="justify-between">
          <Button
            variant="ghost"
            onClick={prevStep}
            disabled={currentStepIndex === 0 || loading || status === 'success'}
            className="gap-1"
          >
            <ChevronLeft className="w-4 h-4" />
            {t('broadcastDialog.back')}
          </Button>

          <div className="flex items-center gap-2">
            {currentStepIndex < STEPS.length - 1 ? (
              <Button
                onClick={nextStep}
                disabled={!canProceed || loading || status === 'success'}
                className="gap-1"
              >
                {t('broadcastDialog.next')}
                <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                onClick={handleSend}
                disabled={loading || status === 'success'}
                className="gap-2"
                style={{
                  backgroundColor: scheduleMaintenance ? '#f97316' : 'var(--primary)',
                  color: 'white',
                }}
              >
                {loading ? (
                  <>
                    <ShieldLoader size="xs" variant="inline" />
                    {t('broadcastDialog.sending')}
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    {scheduleMaintenance
                      ? t('broadcastDialog.sendAndSchedule')
                      : t('broadcastDialog.sendToAll')}
                  </>
                )}
              </Button>
            )}
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
