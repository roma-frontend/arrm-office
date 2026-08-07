'use client';

import { useState } from 'react';
import { useMainRef } from '@/hooks/useMainRef';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useAuthStore, User } from '@/store/useAuthStore';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { UserPicker } from '@/components/ui/UserPicker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  UserMinus,
  CheckCircle2,
  Circle,
  SkipForward,
  TrendingDown,
  ChevronRight,
  ChevronLeft,
  Star,
  BarChart3,
  Package,
  ArrowDownLeft,
  Calculator,
} from 'lucide-react';
import { toast } from 'sonner';
import SettlementPreviewDialog from '@/components/settlement/SettlementPreviewDialog';

const REASONS = [
  'resignation',
  'termination',
  'layoff',
  'retirement',
  'contract_end',
  'other',
] as const;

// ─── Main Component ──────────────────────────────────────────
export default function OffboardingClient() {
  const { t } = useTranslation();
  const mainRef = useMainRef();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'supervisor';

  // Follow the superadmin org selector — see the note in OnboardingClient.
  const selectedOrgId = useSelectedOrganization();
  const orgId = (selectedOrgId ?? user?.organizationId ?? undefined) as
    | Id<'organizations'>
    | undefined;

  const programs = useQuery(
    api.offboarding.listPrograms,
    orgId ? { organizationId: orgId } : 'skip',
  );
  const insights = useQuery(
    api.offboarding.getRetentionInsights,
    orgId ? { organizationId: orgId } : 'skip',
  );

  const [showWizard, setShowWizard] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<Id<'offboardingPrograms'> | null>(null);

  const activeCount = programs?.filter((p) => p.status === 'active').length ?? 0;
  const completedCount = programs?.filter((p) => p.status === 'completed').length ?? 0;

  return (
    <div className="">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{t('offboarding.title', 'Offboarding')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('offboarding.subtitle', 'Manage employee departures and exit workflows')}
            </p>
          </div>
          {isAdmin && (
            <Button
              size="sm"
              onClick={() => {
                const mainEl = mainRef.current;
                if (mainEl) {
                  mainEl.scrollTo({ top: 0, behavior: 'smooth' });
                }
                window.scrollTo({ top: 0, behavior: 'smooth' });
                setShowWizard(true);
              }}
            >
              <UserMinus className="h-4 w-4 mr-1" />
              {t('offboarding.startOffboarding', 'Start Offboarding')}
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{activeCount}</p>
            <p className="text-xs text-muted-foreground">
              {t('offboarding.stats.active', 'Active')}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{completedCount}</p>
            <p className="text-xs text-muted-foreground">
              {t('offboarding.stats.completed', 'Completed')}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{insights?.avgExperience ?? '—'}</p>
            <p className="text-xs text-muted-foreground">
              {t('offboarding.stats.avgExperience', 'Avg Experience')}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{insights?.recommendRate ?? 0}%</p>
            <p className="text-xs text-muted-foreground">
              {t('offboarding.stats.recommendRate', 'Would Recommend')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="programs">
        <TabsList className="w-full mb-4 gap-2 bg-transparent p-0 h-auto grid grid-cols-2">
          <TabsTrigger
            className="w-full px-4 py-2.5 rounded-xl data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center"
            value="programs"
          >
            {t('offboarding.tabs.programs', 'Programs')}
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger
              className="w-full px-4 py-2.5 rounded-xl data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center"
              value="insights"
            >
              {t('offboarding.tabs.insights', 'Insights')}
            </TabsTrigger>
          )}
        </TabsList>

        {/* Programs Tab */}
        <TabsContent value="programs" className="mt-4">
          {!programs ? (
            <ShieldLoader />
          ) : programs.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <UserMinus className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="font-medium">{t('offboarding.empty', 'No offboarding programs')}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {programs.map((prog) => (
                <Card
                  key={prog._id}
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => setSelectedProgram(prog._id)}
                >
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{prog.employeeName}</p>
                          <Badge
                            className={
                              prog.status === 'active'
                                ? 'bg-orange-100 text-orange-800'
                                : prog.status === 'completed'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-gray-100 text-gray-600'
                            }
                          >
                            {String(t(`offboarding.status.${prog.status}`, prog.status))}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {String(t(`offboarding.reason.${prog.reason}`, prog.reason))}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {t('offboarding.lastDay', 'Last day')}:{' '}
                          {new Date(prog.lastDay).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-sm font-medium">{prog.progress}%</p>
                          <p className="text-xs text-muted-foreground">
                            {prog.completedTasks}/{prog.totalTasks}
                          </p>
                        </div>
                        <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-orange-500 transition-all"
                            style={{ width: `${prog.progress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Insights Tab */}
        {isAdmin && (
          <TabsContent value="insights" className="mt-4">
            {!insights ? (
              <ShieldLoader />
            ) : (
              <div className="space-y-4">
                <Card>
                  <CardContent className="p-5">
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      {t('offboarding.insights.reasons', 'Departure Reasons')}
                    </h3>
                    {Object.keys(insights.reasons).length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {t('offboarding.insights.noData', 'No data yet')}
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {Object.entries(insights.reasons)
                          .sort(([, a], [, b]) => b - a)
                          .map(([reason, count]) => (
                            <div key={reason} className="flex items-center gap-3">
                              <span className="text-sm w-32 truncate">
                                {t(`offboarding.reason.${reason}`, reason)}
                              </span>
                              <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-orange-400"
                                  style={{ width: `${(count / insights.totalExits) * 100}%` }}
                                />
                              </div>
                              <span className="text-sm font-medium w-8 text-right">{count}</span>
                            </div>
                          ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div className="grid md:grid-cols-2 gap-4">
                  <Card>
                    <CardContent className="p-5 text-center">
                      <Star className="h-8 w-8 mx-auto text-yellow-500 mb-2" />
                      <p className="text-3xl font-bold">{insights.avgExperience}/5</p>
                      <p className="text-sm text-muted-foreground">
                        {t('offboarding.insights.avgScore', 'Average Experience Score')}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-5 text-center">
                      <TrendingDown className="h-8 w-8 mx-auto text-blue-500 mb-2" />
                      <p className="text-3xl font-bold">{insights.totalExits}</p>
                      <p className="text-sm text-muted-foreground">
                        {t('offboarding.insights.totalExits', 'Total Exits')}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* Dialogs */}
      {showWizard && (
        <StartOffboardingWizard
          open={showWizard}
          onClose={() => setShowWizard(false)}
          user={user}
          t={t}
        />
      )}
      {selectedProgram && (
        <ProgramDetailDialog
          programId={selectedProgram}
          onClose={() => setSelectedProgram(null)}
          user={user}
          t={t}
        />
      )}
    </div>
  );
}

// ─── Program Detail Dialog ───────────────────────────────────
function ProgramDetailDialog({
  programId,
  onClose,
  user,
  t,
}: {
  programId: Id<'offboardingPrograms'>;
  onClose: () => void;
  user: User | null;
  t: TFunction;
}) {
  const program = useQuery(api.offboarding.getProgram, { programId });
  const complete = useMutation(api.offboarding.completeTask);
  const skip = useMutation(api.offboarding.skipTask);
  const completeProgram = useMutation(api.offboarding.completeProgram);
  const submitExit = useMutation(api.offboarding.submitExitInterview);
  const isAdmin = user?.role === 'admin' || user?.role === 'supervisor';

  const activeAssets = useQuery(
    api.assets.checkActiveAssignmentsForEmployee,
    program?.organizationId && program?.employeeId
      ? {
          organizationId: program.organizationId as Id<'organizations'>,
          employeeId: program.employeeId as Id<'users'>,
        }
      : 'skip',
  );

  const [showExitForm, setShowExitForm] = useState(false);
  const [showSettlement, setShowSettlement] = useState(false);
  const [exitForm, setExitForm] = useState({
    experience: 3,
    recommend: true,
    reason: '',
    feedback: '',
    improvements: '',
  });

  const handleComplete = async (taskId: Id<'offboardingTasks'>) => {
    if (!user?.id) return;
    await complete({ taskId });
    toast.success(t('offboarding.taskCompleted', 'Task completed'));
  };

  const handleSkip = async (taskId: Id<'offboardingTasks'>) => {
    if (!user?.id) return;
    await skip({ taskId });
  };

  const handleCompleteProgram = async () => {
    try {
      const result = await completeProgram({ programId });
      toast.success(
        t('offboarding.programCompleted', 'Offboarding completed') +
          (result?.deactivated
            ? ` — ${t('offboarding.accountDeactivated', 'account deactivated')}`
            : ''),
      );
      if (result?.approvedFutureLeaves) {
        toast.warning(
          t(
            'offboarding.approvedLeavesRemain',
            '{{count}} approved leave request(s) start after the last working day — review them in the final settlement.',
            { count: result.approvedFutureLeaves },
          ),
        );
      }
      onClose();
    } catch (e: unknown) {
      // Equipment still assigned → offer to finish anyway.
      const message = e instanceof Error ? e.message : t('common.error', 'Error');
      if (message.includes('Equipment is still assigned')) {
        if (
          confirm(
            `${message}\n\n${t('offboarding.forceCompleteConfirm', 'Complete the offboarding anyway?')}`,
          )
        ) {
          await completeProgram({ programId, force: true });
          toast.success(t('offboarding.programCompleted', 'Offboarding completed'));
          onClose();
        }
        return;
      }
      toast.error(message);
    }
  };

  const handleSubmitExit = async () => {
    if (!program?.exitInterview) return;
    await submitExit({
      interviewId: program.exitInterview._id,
      overallExperience: exitForm.experience,
      wouldRecommend: exitForm.recommend,
      primaryReason: exitForm.reason || undefined,
      feedback: exitForm.feedback || undefined,
      improvements: exitForm.improvements || undefined,
    });
    toast.success(t('offboarding.exitSubmitted', 'Exit interview submitted'));
    setShowExitForm(false);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {program?.employeeName ?? '...'} — {t('offboarding.title', 'Offboarding')}
          </DialogTitle>
        </DialogHeader>

        {!program ? (
          <ShieldLoader size="sm" />
        ) : (
          <div className="space-y-4">
            {/* Progress */}
            <div className="flex items-center gap-4">
              <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-orange-500 transition-all"
                  style={{ width: `${program.progress}%` }}
                />
              </div>
              <span className="text-sm font-medium">{program.progress}%</span>
            </div>

            {/* Info */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">
                  {t('offboarding.reason.label', 'Reason')}:
                </span>{' '}
                {t(`offboarding.reason.${program.reason}`, program.reason)}
              </div>
              <div>
                <span className="text-muted-foreground">
                  {t('offboarding.lastDay', 'Last day')}:
                </span>{' '}
                {new Date(program.lastDay).toLocaleDateString()}
              </div>
              <div>
                <span className="text-muted-foreground">
                  {t('offboarding.manager', 'Manager')}:
                </span>{' '}
                {program.managerName}
              </div>
              <div>
                <span className="text-muted-foreground">
                  {t('offboarding.status.label', 'Status')}:
                </span>{' '}
                {t(`offboarding.status.${program.status}`, program.status)}
              </div>
            </div>

            {/* Tasks */}
            <div className="space-y-2 pt-2 border-t">
              <p className="text-sm font-semibold">
                {t('offboarding.checklist', 'Checklist')} ({program.completedTasks}/
                {program.totalTasks})
              </p>
              {program.tasks.map((task) => (
                <div
                  key={task._id}
                  className={`flex items-center gap-3 p-2.5 rounded-lg border ${task.status === 'completed' ? 'opacity-60 bg-muted/30' : ''}`}
                >
                  {task.status === 'completed' ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  ) : task.status === 'skipped' ? (
                    <SkipForward className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <button onClick={() => handleComplete(task._id)} className="shrink-0">
                      <Circle className="h-4 w-4 text-muted-foreground hover:text-orange-500 transition-colors" />
                    </button>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${task.status === 'completed' ? 'line-through' : ''}`}>
                      {task.title}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {t(`offboarding.assigneeType.${task.assigneeType}`, task.assigneeType)}
                      {task.assigneeName ? ` • ${task.assigneeName}` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge variant="outline" className="text-[10px]">
                      {t(`offboarding.category.${task.category}`, task.category)}
                    </Badge>
                    {isAdmin && task.status === 'pending' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSkip(task._id);
                        }}
                      >
                        <SkipForward className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Active Assets */}
            {activeAssets && activeAssets.length > 0 && (
              <div className="pt-2 border-t space-y-2">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  {t('assets.title', 'Assets to Return')} ({activeAssets.length})
                </p>
                {activeAssets.map((a) => (
                  <div
                    key={a.assignmentId}
                    className="flex items-center gap-3 p-2.5 rounded-lg border bg-amber-50/50 dark:bg-amber-950/20"
                  >
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <ArrowDownLeft className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{a.assetName}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.icon} {t(`assets.category.${a.category}`, a.category)} ·{' '}
                        {t('assets.assignedAt', 'Assigned')}:{' '}
                        {new Date(a.assignedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Exit Interview */}
            {program.exitInterview && (
              <div className="pt-2 border-t">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">
                    {t('offboarding.exitInterview', 'Exit Interview')}
                  </p>
                  {program.exitInterview.status === 'scheduled' && isAdmin && (
                    <Button size="sm" variant="outline" onClick={() => setShowExitForm(true)}>
                      {t('offboarding.conductInterview', 'Conduct')}
                    </Button>
                  )}
                </div>
                {program.exitInterview.status === 'completed' && (
                  <div className="mt-2 p-3 rounded-lg bg-muted/50 text-sm space-y-1">
                    <p>
                      {t('offboarding.experience', 'Experience')}:{' '}
                      {'⭐'.repeat(program.exitInterview.overallExperience ?? 0)}
                    </p>
                    {program.exitInterview.feedback && (
                      <p className="text-muted-foreground">{program.exitInterview.feedback}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Exit Interview Form */}
            {showExitForm && (
              <div className="p-4 rounded-lg border space-y-3">
                <p className="text-sm font-semibold">
                  {t('offboarding.exitForm.title', 'Exit Interview Form')}
                </p>
                <div>
                  <label className="text-xs font-medium">
                    {t('offboarding.exitForm.experience', 'Overall Experience (1-5)')}
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={5}
                    value={exitForm.experience}
                    onChange={(e) =>
                      setExitForm({ ...exitForm, experience: parseInt(e.target.value) || 3 })
                    }
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">
                    {t('offboarding.exitForm.recommend', 'Would recommend?')}
                  </label>
                  <Select
                    value={exitForm.recommend ? 'yes' : 'no'}
                    onValueChange={(v) => setExitForm({ ...exitForm, recommend: v === 'yes' })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">{t('common.yes', 'Yes')}</SelectItem>
                      <SelectItem value="no">{t('common.no', 'No')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium">
                    {t('offboarding.exitForm.reason', 'Primary reason for leaving')}
                  </label>
                  <Input
                    value={exitForm.reason}
                    onChange={(e) => setExitForm({ ...exitForm, reason: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">
                    {t('offboarding.exitForm.feedback', 'Feedback')}
                  </label>
                  <Textarea
                    value={exitForm.feedback}
                    onChange={(e) => setExitForm({ ...exitForm, feedback: e.target.value })}
                    rows={2}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">
                    {t('offboarding.exitForm.improvements', 'Suggestions for improvement')}
                  </label>
                  <Textarea
                    value={exitForm.improvements}
                    onChange={(e) => setExitForm({ ...exitForm, improvements: e.target.value })}
                    rows={2}
                    className="mt-1"
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSubmitExit}>
                    {t('offboarding.exitForm.submit', 'Submit')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowExitForm(false)}>
                    {t('common.cancel', 'Cancel')}
                  </Button>
                </div>
              </div>
            )}

            {/* Final Settlement (admins) */}
            {isAdmin && (
              <Button className="w-full" variant="outline" onClick={() => setShowSettlement(true)}>
                <Calculator className="h-4 w-4 mr-1" />
                {t('employees.settlement.openButton', 'Final Settlement')}
              </Button>
            )}

            {/* Complete button */}
            {isAdmin && program.status === 'active' && program.progress >= 80 && (
              <Button className="w-full" variant="destructive" onClick={handleCompleteProgram}>
                <CheckCircle2 className="h-4 w-4 mr-1" />
                {t('offboarding.completeProgram', 'Complete Offboarding')}
              </Button>
            )}
          </div>
        )}
      </DialogContent>

      {/* Final Settlement Dialog */}
      {program && (
        <SettlementPreviewDialog
          employeeId={program.employeeId}
          employeeName={program.employeeName}
          open={showSettlement}
          onClose={() => setShowSettlement(false)}
          defaultLastDay={program.lastDay}
        />
      )}
    </Dialog>
  );
}

// ─── Start Offboarding Wizard ────────────────────────────────
function StartOffboardingWizard({
  open,
  onClose,
  user,
  t,
}: {
  open: boolean;
  onClose: () => void;
  user: User | null;
  t: TFunction;
}) {
  // Create into the organization the screen is showing, not the viewer's own.
  const selectedOrgId = useSelectedOrganization();
  const orgId = (selectedOrgId ?? user?.organizationId ?? undefined) as
    | Id<'organizations'>
    | undefined;
  const [step, setStep] = useState(0);
  const [employeeId, setEmployeeId] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [managerId, setManagerId] = useState('');
  const [managerName, setManagerName] = useState('');
  const [lastDay, setLastDay] = useState('');
  const [reason, setReason] = useState<(typeof REASONS)[number]>('resignation');
  const [reasonNote, setReasonNote] = useState('');

  const startOffboarding = useMutation(api.offboarding.startOffboarding);

  const steps = [
    t('offboarding.wizard.step1', 'Employee'),
    t('offboarding.wizard.step2', 'Details'),
    t('offboarding.wizard.step3', 'Confirm'),
  ];

  const handleSubmit = async () => {
    if (!user?.organizationId || !employeeId || !managerId || !lastDay) return;
    try {
      await startOffboarding({
        organizationId: orgId as Id<'organizations'>,
        employeeId: employeeId as Id<'users'>,
        managerId: managerId as Id<'users'>,
        lastDay: new Date(lastDay).getTime(),
        reason,
        reasonNote: reasonNote || undefined,
      });
      toast.success(t('offboarding.wizard.success', 'Offboarding started'));
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('common.error', 'Error'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="p-0 gap-0 overflow-hidden max-h-[95vh]">
        {/* Stepper */}
        <div className="px-5 pt-5 pb-3">
          <DialogHeader>
            <DialogTitle>{t('offboarding.wizard.title', 'Start Offboarding')}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 mt-4">
            {steps.map((s, i) => (
              <div key={i} className="flex items-center gap-2 flex-1">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i <= step ? 'bg-orange-500 text-white' : 'bg-muted text-muted-foreground'}`}
                >
                  {i + 1}
                </div>
                <span
                  className={`text-xs hidden sm:inline ${i <= step ? 'font-medium' : 'text-muted-foreground'}`}
                >
                  {s}
                </span>
                {i < steps.length - 1 && <div className="flex-1 h-px bg-border" />}
              </div>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="px-5 py-4 min-h-[200px] max-h-[55vh] overflow-y-auto">
          {step === 0 && (
            <div className="space-y-5">
              <UserPicker
                organizationId={user?.organizationId as Id<'organizations'> | undefined}
                value={employeeId}
                onChange={setEmployeeId}
                onSelectUser={(u) => setEmployeeName(u?.name ?? '')}
                label={t('offboarding.fields.employee', 'Departing employee')}
                listHeight={200}
              />
              <UserPicker
                organizationId={user?.organizationId as Id<'organizations'> | undefined}
                value={managerId}
                onChange={setManagerId}
                onSelectUser={(u) => setManagerName(u?.name ?? '')}
                label={t('offboarding.fields.manager', 'Manager')}
                excludeUserId={employeeId ? (employeeId as Id<'users'>) : undefined}
                listHeight={200}
              />
            </div>
          )}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">
                  {t('offboarding.fields.lastDay', 'Last Working Day')}
                </label>
                <Input
                  type="date"
                  value={lastDay}
                  onChange={(e) => setLastDay(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">
                  {t('offboarding.fields.reason', 'Reason')}
                </label>
                <Select value={reason} onValueChange={(v) => setReason(v as typeof reason)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REASONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {t(`offboarding.reason.${r}`, r)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">
                  {t('offboarding.fields.note', 'Note (optional)')}
                </label>
                <Textarea
                  value={reasonNote}
                  onChange={(e) => setReasonNote(e.target.value)}
                  rows={2}
                  className="mt-1"
                  placeholder={t('offboarding.fields.notePlaceholder', 'Additional context...')}
                />
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t('offboarding.wizard.confirm', 'Please confirm the offboarding details:')}
              </p>
              <div className="p-4 rounded-lg bg-muted/50 space-y-2 text-sm">
                <p>
                  <span className="font-medium">
                    {t('offboarding.fields.employee', 'Employee')}:
                  </span>{' '}
                  {employeeName || '—'}
                </p>
                <p>
                  <span className="font-medium">{t('offboarding.fields.manager', 'Manager')}:</span>{' '}
                  {managerName || '—'}
                </p>
                <p>
                  <span className="font-medium">
                    {t('offboarding.fields.lastDay', 'Last Day')}:
                  </span>{' '}
                  {lastDay}
                </p>
                <p>
                  <span className="font-medium">{t('offboarding.fields.reason', 'Reason')}:</span>{' '}
                  {t(`offboarding.reason.${reason}`, reason)}
                </p>
                {reasonNote && (
                  <p>
                    <span className="font-medium">{t('offboarding.fields.note', 'Note')}:</span>{' '}
                    {reasonNote}
                  </p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {t(
                  'offboarding.wizard.autoTasks',
                  'Default checklist tasks will be created automatically.',
                )}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t">
          <Button variant="ghost" onClick={() => (step > 0 ? setStep(step - 1) : onClose())}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            {step > 0 ? t('common.back', 'Back') : t('common.cancel', 'Cancel')}
          </Button>
          {step < steps.length - 1 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={(step === 0 && (!employeeId || !managerId)) || (step === 1 && !lastDay)}
            >
              {t('common.next', 'Next')} <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button variant="destructive" onClick={handleSubmit}>
              <UserMinus className="h-4 w-4 mr-1" /> {t('offboarding.wizard.start', 'Start')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
