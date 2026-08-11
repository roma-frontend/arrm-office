'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Hourglass, CalendarClock, CheckCircle2, XCircle, Plus } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';
import i18n from 'i18next';
import { toast } from 'sonner';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import {
  DEFAULT_PROBATION_DAYS,
  MAX_PROBATION_DAYS,
  daysRemaining,
  totalProbationDays,
  isLikelyHr,
} from '@/lib/probation';

const EXTEND_PRESETS = [15, 30, 60];

interface ProbationCardProps {
  employeeId: Id<'users'>;
}

export default function ProbationCard({ employeeId }: ProbationCardProps) {
  const { user: currentUser } = useAuthStore();
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const lang = i18n.language || 'en';
  const dateFnsLocale = lang === 'ru' ? ru : lang === 'hy' ? hy : enUS;

  const employee = useQuery(api.users.queries.getUserById, { userId: employeeId });
  const probation = useQuery(api.probation.getProbationForEmployee, { employeeId });

  const startProbation = useMutation(api.probation.startProbation);
  const extendProbation = useMutation(api.probation.extendProbation);
  const completeProbation = useMutation(api.probation.completeProbation);

  const [extendOpen, setExtendOpen] = useState(false);
  const [outcome, setOutcome] = useState<'passed' | 'failed' | null>(null);
  const [additionalDays, setAdditionalDays] = useState<number>(30);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [withOffboarding, setWithOffboarding] = useState(true);
  const [busy, setBusy] = useState(false);

  const isSameOrg =
    !!currentUser?.organizationId && currentUser.organizationId === employee?.organizationId;
  const isStaff =
    (currentUser?.role === 'admin' ||
      currentUser?.role === 'supervisor' ||
      currentUser?.role === 'superadmin') &&
    (currentUser?.role === 'superadmin' || isSameOrg);
  const canManage =
    isStaff || (isSameOrg && currentUser?.role !== 'superadmin' && isLikelyHr(currentUser));

  const active = probation?.status === 'active' ? probation : null;

  // Reminder links land here with ?probation=extend — open the dialog straight
  // away so HR is one click from the decision.
  useEffect(() => {
    if (searchParams.get('probation') === 'extend' && canManage && active) {
      setExtendOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, !!active]);

  const fmtDate = (ts: number) => format(ts, 'd MMM yyyy', { locale: dateFnsLocale });

  const remaining = active ? daysRemaining(active.endDate) : 0;
  const totalDays = active ? totalProbationDays(active.startDate, active.endDate) : 0;
  const maxAdditional = active ? MAX_PROBATION_DAYS - totalDays : 0;
  const elapsed = active ? Math.max(0, totalDays - Math.max(0, remaining)) : 0;
  const progress =
    active && totalDays > 0 ? Math.min(100, Math.round((elapsed / totalDays) * 100)) : 0;

  const statusBadge = useMemo(() => {
    if (!probation) return null;
    switch (probation.status) {
      case 'active':
        return <Badge variant="warning">{t('employees.probation.active')}</Badge>;
      case 'passed':
        return <Badge variant="success">{t('employees.probation.passed')}</Badge>;
      case 'failed':
        return <Badge variant="destructive">{t('employees.probation.failed')}</Badge>;
      default:
        return <Badge variant="secondary">{t('employees.probation.cancelled')}</Badge>;
    }
  }, [probation, t]);

  if (employee === undefined || probation === undefined) {
    return (
      <Card className="border-(--border)">
        <CardContent className="p-4 flex items-center justify-center">
          <ShieldLoader />
        </CardContent>
      </Card>
    );
  }

  if (!probation) {
    if (!canManage || !employee?.organizationId) return null;
    return (
      <Card className="border-(--border)">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Hourglass className="w-4 h-4 text-blue-500" />
              {t('employees.probation.title')}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-(--text-muted)">
            {t('employees.probation.noPeriod', { days: DEFAULT_PROBATION_DAYS })}
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await startProbation({
                  organizationId: employee.organizationId as Id<'organizations'>,
                  employeeId,
                });
                toast.success(t('employees.probation.startedToast'));
              } catch (e) {
                toast.error(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Plus className="w-4 h-4 mr-1" />
            {t('employees.probation.start')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-(--border)">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Hourglass className="w-4 h-4 text-blue-500" />
            {t('employees.probation.title')}
          </CardTitle>
          {statusBadge}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {active && (
          <>
            <div className="flex items-center justify-between text-xs text-(--text-muted)">
              <span className="flex items-center gap-1">
                <CalendarClock className="w-3.5 h-3.5" />
                {t('employees.probation.period', {
                  start: fmtDate(active.startDate),
                  end: fmtDate(active.endDate),
                })}
              </span>
              <span
                className={
                  remaining <= 5 ? 'text-red-500 font-semibold' : 'text-(--text-secondary)'
                }
              >
                {t('employees.probation.daysLeft', { count: Math.max(0, remaining) })}
              </span>
            </div>
            <Progress value={progress} />
            {active.extensions.length > 0 && (
              <p className="text-[11px] text-(--text-muted)">
                {t('employees.probation.extendedCount', { count: active.extensions.length })}
                {' · '}
                {t('employees.probation.originalEnd', { date: fmtDate(active.originalEndDate) })}
              </p>
            )}
          </>
        )}

        {!active && probation.outcomeNote && (
          <p className="text-xs text-(--text-muted)">{probation.outcomeNote}</p>
        )}
        {!active && probation.completedAt && (
          <p className="text-[11px] text-(--text-muted)">
            {t('employees.probation.decidedOn', { date: fmtDate(probation.completedAt) })}
          </p>
        )}

        {canManage && active && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={() => setExtendOpen(true)}>
              <CalendarClock className="w-4 h-4 mr-1" />
              {t('employees.probation.extend')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-emerald-600"
              onClick={() => setOutcome('passed')}
            >
              <CheckCircle2 className="w-4 h-4 mr-1" />
              {t('employees.probation.pass')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-red-600"
              onClick={() => setOutcome('failed')}
            >
              <XCircle className="w-4 h-4 mr-1" />
              {t('employees.probation.fail')}
            </Button>
          </div>
        )}
      </CardContent>

      {/* Extend dialog */}
      <Dialog open={extendOpen} onOpenChange={setExtendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('employees.probation.extendTitle')}</DialogTitle>
            <DialogDescription>
              {t('employees.probation.extendDesc', { max: MAX_PROBATION_DAYS })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              {EXTEND_PRESETS.map((d) => (
                <Button
                  key={d}
                  size="sm"
                  variant={additionalDays === d ? 'default' : 'outline'}
                  disabled={d > maxAdditional}
                  onClick={() => setAdditionalDays(d)}
                >
                  {t('employees.probation.days', { count: d })}
                </Button>
              ))}
            </div>
            <div className="space-y-1">
              <Label>{t('employees.probation.customDays')}</Label>
              <Input
                type="number"
                min={1}
                max={Math.max(1, maxAdditional)}
                value={additionalDays}
                onChange={(e) => setAdditionalDays(Number(e.target.value))}
              />
              <p className="text-[11px] text-(--text-muted)">
                {t('employees.probation.maxAdditional', { count: Math.max(0, maxAdditional) })}
              </p>
            </div>
            <div className="space-y-1">
              <Label>{t('employees.probation.reason')}</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t('employees.probation.reasonPlaceholder')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExtendOpen(false)}>
              {t('employees.probation.cancel')}
            </Button>
            <Button
              disabled={busy || additionalDays < 1 || additionalDays > maxAdditional}
              onClick={async () => {
                setBusy(true);
                try {
                  await extendProbation({
                    probationId: active!._id,
                    additionalDays,
                    reason: reason.trim() || undefined,
                  });
                  toast.success(t('employees.probation.extendedToast'));
                  setExtendOpen(false);
                  setReason('');
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t('employees.probation.extend')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Outcome dialog */}
      <Dialog open={outcome !== null} onOpenChange={(o) => !o && setOutcome(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {outcome === 'passed'
                ? t('employees.probation.confirmPass')
                : t('employees.probation.confirmFail')}
            </DialogTitle>
            <DialogDescription>
              {outcome === 'passed'
                ? t('employees.probation.confirmPassDesc')
                : t('employees.probation.confirmFailDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label>{t('employees.probation.reason')}</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('employees.probation.reasonPlaceholder')}
            />
          </div>
          {outcome === 'failed' && isStaff && (
            <div className="flex items-start gap-2">
              <Checkbox
                id="probation-offboarding"
                checked={withOffboarding}
                onCheckedChange={(c) => setWithOffboarding(c === true)}
              />
              <label htmlFor="probation-offboarding" className="space-y-0.5 leading-tight">
                <span className="text-sm text-(--text-primary)">
                  {t('employees.probation.startOffboarding')}
                </span>
                <p className="text-[11px] text-(--text-muted)">
                  {t('employees.probation.startOffboardingHint')}
                </p>
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOutcome(null)}>
              {t('employees.probation.cancel')}
            </Button>
            <Button
              variant={outcome === 'failed' ? 'destructive' : 'default'}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await completeProbation({
                    probationId: active!._id,
                    outcome: outcome!,
                    note: note.trim() || undefined,
                    withOffboarding: outcome === 'failed' && isStaff ? withOffboarding : undefined,
                  });
                  toast.success(t('employees.probation.decisionToast'));
                  setOutcome(null);
                  setNote('');
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {outcome === 'passed' ? t('employees.probation.pass') : t('employees.probation.fail')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
