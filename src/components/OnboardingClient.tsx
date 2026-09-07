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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
} from '@/components/ui/sheet';
import { WizardStepper } from '@/components/ui/wizard-stepper';
import { UserPicker } from '@/components/ui/UserPicker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  Rocket,
  CheckCircle2,
  Circle,
  SkipForward,
  Users,
  ClipboardList,
  FileText,
  Pencil,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import { EmployeeHoverCard } from '@/components/employees/EmployeeHoverCard';

// ─── Types ───────────────────────────────────────────────────
type TemplateTask = {
  key: string;
  title: string;
  description?: string;
  assigneeType: 'new_hire' | 'buddy' | 'manager' | 'hr' | 'it';
  category: 'documentation' | 'access' | 'training' | 'equipment' | 'intro' | 'other';
  dayOffset: number;
};

type EditableTemplate = {
  _id: Id<'onboardingTemplates'>;
  name: string;
  description?: string;
  department?: string;
  tasks: TemplateTask[];
};

const CATEGORIES = ['documentation', 'access', 'training', 'equipment', 'intro', 'other'] as const;
const ASSIGNEE_TYPES = ['new_hire', 'buddy', 'manager', 'hr', 'it'] as const;

/**
 * Title of an onboarding task in the viewer's language.
 *
 * Task titles are stored as plain text, so the built-in checklist landed in the
 * database in English and stayed English whatever language was selected — the
 * labels around it (assignee, category) were translated, which made the mix look
 * like a bug. Rows created from the built-in list keep their blueprint key
 * (`default_paperwork`, …), so that key is what gets translated; a task an
 * organization wrote itself has no such key and falls back to its stored text,
 * which is the only correct answer for free-form input.
 */
function taskTitle(
  t: TFunction,
  task: { title: string; templateTaskKey?: string | undefined },
): string {
  const key = task.templateTaskKey;
  if (key && key.startsWith('default_')) {
    return t(`onboarding.defaultTasks.${key}`, task.title);
  }
  return task.title;
}

// ─── Main Component ──────────────────────────────────────────
export default function OnboardingClient() {
  const { t } = useTranslation();
  const mainRef = useMainRef();
  const { user } = useAuthStore();
  // Superadmins are staff everywhere on the backend (`assertOrgStaff`), so
  // leaving them out here hid the start and template buttons from the one role
  // that can act in every organization.
  const isAdmin =
    user?.role === 'admin' || user?.role === 'supervisor' || user?.role === 'superadmin';

  // Follow the superadmin org selector, like the rest of the dashboard. Reading
  // `user.organizationId` directly pinned this screen to the viewer's own
  // organization, so switching orgs left the programs and templates unchanged —
  // and the create mutations below wrote into the wrong tenant.
  const selectedOrgId = useSelectedOrganization();
  const orgId = (selectedOrgId ?? user?.organizationId ?? undefined) as
    | Id<'organizations'>
    | undefined;

  const programs = useQuery(
    api.onboarding.listPrograms,
    orgId ? { organizationId: orgId } : 'skip',
  );
  const templates = useQuery(
    api.onboarding.listTemplates,
    orgId ? { organizationId: orgId } : 'skip',
  );
  const myOnboarding = useQuery(
    api.onboarding.getMyOnboarding,
    user?.id ? { userId: user.id as Id<'users'> } : 'skip',
  );
  const myMentees = useQuery(
    api.onboarding.getMyMenteePrograms,
    user?.id ? { userId: user.id as Id<'users'> } : 'skip',
  );

  const [showStartWizard, setShowStartWizard] = useState(false);
  const [showTemplateWizard, setShowTemplateWizard] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EditableTemplate | null>(null);
  const [selectedProgram, setSelectedProgram] = useState<Id<'onboardingPrograms'> | null>(null);

  const activeCount = programs?.filter((p) => p.status === 'active').length ?? 0;
  const completedCount = programs?.filter((p) => p.status === 'completed').length ?? 0;

  return (
    <div className="">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{t('onboarding.title', 'Onboarding')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('onboarding.subtitle', 'Manage new hire onboarding workflows')}
            </p>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const mainEl = mainRef.current;
                  if (mainEl) {
                    mainEl.scrollTo({ top: 0, behavior: 'smooth' });
                  }
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                  setShowTemplateWizard(true);
                }}
              >
                <FileText className="h-4 w-4 mr-1" />
                {t('onboarding.newTemplate', 'New Template')}
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  const mainEl = mainRef.current;
                  if (mainEl) {
                    mainEl.scrollTo({ top: 0, behavior: 'smooth' });
                  }
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                  setShowStartWizard(true);
                }}
              >
                <Rocket className="h-4 w-4 mr-1" />
                {t('onboarding.startOnboarding', 'Start Onboarding')}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-4">
        <Card className="glass-panel shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{activeCount}</p>
            <p className="text-xs text-muted-foreground">
              {t('onboarding.stats.active', 'Active')}
            </p>
          </CardContent>
        </Card>
        <Card className="glass-panel shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{completedCount}</p>
            <p className="text-xs text-muted-foreground">
              {t('onboarding.stats.completed', 'Completed')}
            </p>
          </CardContent>
        </Card>
        <Card className="glass-panel shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{templates?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground">
              {t('onboarding.stats.templates', 'Templates')}
            </p>
          </CardContent>
        </Card>
        <Card className="glass-panel shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{myMentees?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground">
              {t('onboarding.stats.mentees', 'My Mentees')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue={myOnboarding ? 'my' : 'programs'}>
        <TabsList className="w-full my-4 gap-2 bg-transparent p-0 h-auto grid grid-cols-3">
          {myOnboarding && (
            <TabsTrigger value="my">{t('onboarding.tabs.my', 'My Onboarding')}</TabsTrigger>
          )}
          <TabsTrigger
            className="w-full px-4 py-2.5 rounded-xl data-[state=active]:bg-(--brand) data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center"
            value="programs"
          >
            {t('onboarding.tabs.programs', 'Programs')}
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger
              className="w-full px-4 py-2.5 rounded-xl data-[state=active]:bg-(--brand) data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center"
              value="templates"
            >
              {t('onboarding.tabs.templates', 'Templates')}
            </TabsTrigger>
          )}
        </TabsList>

        {/* My Onboarding Tab */}
        {myOnboarding && (
          <TabsContent value="my" className="mt-4">
            <MyOnboardingView program={myOnboarding} t={t} user={user} />
          </TabsContent>
        )}

        {/* Programs Tab */}
        <TabsContent value="programs" className="mt-4">
          {!programs ? (
            <ShieldLoader />
          ) : programs.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Rocket className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="font-medium">{t('onboarding.empty', 'No onboarding programs yet')}</p>
                {isAdmin && (
                  <Button className="mt-4" onClick={() => setShowStartWizard(true)}>
                    <Plus className="h-4 w-4 mr-1" />{' '}
                    {t('onboarding.startOnboarding', 'Start Onboarding')}
                  </Button>
                )}
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
                                ? 'bg-(--brand-quiet) text-(--brand-text)'
                                : prog.status === 'completed'
                                  ? 'bg-(--success-quiet) text-(--success-text)'
                                  : 'bg-(--surface-3) text-(--text-3)'
                            }
                          >
                            {String(t(`onboarding.status.${prog.status}`, prog.status))}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                          {prog.buddyName && (
                            <span>
                              <Users className="h-3 w-3 inline mr-0.5" />
                              {prog.buddyName}
                            </span>
                          )}
                          <span>
                            {t('onboarding.started', 'Started')}:{' '}
                            {new Date(prog.startDate).toLocaleDateString()}
                          </span>
                        </div>
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
                            className="h-full rounded-full bg-primary transition-all"
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

        {/* Templates Tab */}
        {isAdmin && (
          <TabsContent value="templates" className="mt-4">
            {!templates ? (
              <ShieldLoader />
            ) : templates.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <ClipboardList className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                  <p className="font-medium">{t('onboarding.noTemplates', 'No templates yet')}</p>
                  <Button className="mt-4" onClick={() => setShowTemplateWizard(true)}>
                    <Plus className="h-4 w-4 mr-1" /> {t('onboarding.newTemplate', 'New Template')}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {templates.map((tpl) => (
                  <Card key={tpl._id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium">{tpl.name}</p>
                          {tpl.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {tpl.description}
                            </p>
                          )}
                          <div className="flex gap-2 mt-2">
                            {tpl.department && (
                              <Badge variant="outline" className="text-xs">
                                {tpl.department}
                              </Badge>
                            )}
                            <Badge variant="outline" className="text-xs">
                              {tpl.tasks.length} {t('onboarding.tasks', 'tasks')}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            className={
                              tpl.isActive
                                ? 'bg-(--success-quiet) text-(--success-text)'
                                : 'bg-(--surface-3) text-(--text-3)'
                            }
                          >
                            {tpl.isActive
                              ? t('onboarding.active', 'Active')
                              : t('onboarding.inactive', 'Inactive')}
                          </Badge>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            title={t('common.edit', 'Edit')}
                            aria-label={t('onboarding.editTemplate', 'Edit onboarding template')}
                            onClick={() => {
                              setEditingTemplate(tpl as EditableTemplate);
                              setShowTemplateWizard(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* Dialogs */}
      {showStartWizard && (
        <StartOnboardingWizard
          open={showStartWizard}
          onClose={() => setShowStartWizard(false)}
          templates={templates ?? []}
          user={user}
          t={t}
        />
      )}
      {showTemplateWizard && (
        <CreateTemplateWizard
          open={showTemplateWizard}
          onClose={() => {
            setShowTemplateWizard(false);
            setEditingTemplate(null);
          }}
          user={user}
          t={t}
          initialTemplate={editingTemplate}
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

// ─── My Onboarding View ──────────────────────────────────────
function MyOnboardingView({
  program,
  t,
  user,
}: {
  program: NonNullable<ReturnType<typeof useQuery<typeof api.onboarding.getMyOnboarding>>>;
  t: TFunction;
  user: User | null;
}) {
  const complete = useMutation(api.onboarding.completeTask);

  const handleComplete = async (taskId: Id<'onboardingTasks'>) => {
    if (!user?.id) return;
    await complete({ taskId });
    toast.success(t('onboarding.taskCompleted', 'Task completed!'));
  };

  if (!program) return null;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm text-muted-foreground">
                {t('onboarding.yourProgress', 'Your Progress')}
              </p>
              <p className="text-3xl font-bold">{program.progress}%</p>
            </div>
            <div className="text-right text-sm text-muted-foreground">
              <p>
                {program.completedTasks}/{program.totalTasks} {t('onboarding.tasks', 'tasks')}
              </p>
              {program.buddyName && (
                <p>
                  {t('onboarding.buddy', 'Buddy')}: {program.buddyName}
                </p>
              )}
            </div>
          </div>
          <div className="w-full h-3 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${program.progress}%` }}
            />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {program.tasks.map((task) => (
          <Card key={task._id} className={task.status === 'completed' ? 'opacity-60' : ''}>
            <CardContent className="p-3 flex items-center gap-3">
              {task.status === 'completed' ? (
                <CheckCircle2 className="h-5 w-5 text-(--success-text) shrink-0" />
              ) : task.status === 'skipped' ? (
                <SkipForward className="h-5 w-5 text-muted-foreground shrink-0" />
              ) : (
                <button onClick={() => handleComplete(task._id)} className="shrink-0">
                  <Circle className="h-5 w-5 text-muted-foreground hover:text-primary transition-colors" />
                </button>
              )}
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm font-medium ${task.status === 'completed' ? 'line-through' : ''}`}
                >
                  {taskTitle(t, task)}
                </p>
                {task.description && (
                  <p className="text-xs text-muted-foreground truncate">{task.description}</p>
                )}
              </div>
              <Badge variant="outline" className="text-xs shrink-0">
                {t(`onboarding.category.${task.category}`, task.category)}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>
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
  programId: Id<'onboardingPrograms'>;
  onClose: () => void;
  user: User | null;
  t: TFunction;
}) {
  const program = useQuery(api.onboarding.getProgram, { programId });
  const complete = useMutation(api.onboarding.completeTask);
  const skip = useMutation(api.onboarding.skipTask);
  const completeProgram = useMutation(api.onboarding.completeProgram);
  const isAdmin =
    user?.role === 'admin' || user?.role === 'supervisor' || user?.role === 'superadmin';

  const handleComplete = async (taskId: Id<'onboardingTasks'>) => {
    if (!user?.id) return;
    await complete({ taskId });
    toast.success(t('onboarding.taskCompleted', 'Task completed!'));
  };

  const handleSkip = async (taskId: Id<'onboardingTasks'>) => {
    if (!user?.id) return;
    await skip({ taskId });
  };

  const handleCompleteProgram = async () => {
    await completeProgram({ programId });
    toast.success(t('onboarding.programCompleted', 'Onboarding completed!'));
    onClose();
  };

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent side="right" size="lg" closeLabel={t('common.close', 'Close')}>
        <SheetHeader>
          <SheetTitle>
            {program?.employeeName ?? '...'} — {t('onboarding.title', 'Onboarding')}
          </SheetTitle>
        </SheetHeader>

        <SheetBody>
          {!program ? (
            <ShieldLoader size="sm" />
          ) : (
            <div className="space-y-4">
              {/* Progress */}
              <div className="flex items-center gap-4">
                <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${program.progress}%` }}
                  />
                </div>
                <span className="text-sm font-medium">{program.progress}%</span>
              </div>

              {/* Info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">
                    {t('onboarding.manager', 'Manager')}:
                  </span>{' '}
                  {program.managerName}
                </div>
                <div>
                  <span className="text-muted-foreground">{t('onboarding.buddy', 'Buddy')}:</span>{' '}
                  {program.buddyName || '—'}
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {t('onboarding.started', 'Started')}:
                  </span>{' '}
                  {new Date(program.startDate).toLocaleDateString()}
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {t('onboarding.status.label', 'Status')}:
                  </span>{' '}
                  {t(`onboarding.status.${program.status}`, program.status)}
                </div>
              </div>

              {/* Tasks */}
              <div className="space-y-2 pt-2 border-t">
                <p className="text-sm font-semibold">
                  {t('onboarding.tasks', 'Tasks')} ({program.completedTasks}/{program.totalTasks})
                </p>
                {program.tasks.map((task) => (
                  <div
                    key={task._id}
                    className={`flex items-center gap-3 p-2.5 rounded-lg border ${task.status === 'completed' ? 'opacity-60 bg-muted/30' : ''}`}
                  >
                    {task.status === 'completed' ? (
                      <CheckCircle2 className="h-4 w-4 text-(--success-text) shrink-0" />
                    ) : task.status === 'skipped' ? (
                      <SkipForward className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <button onClick={() => handleComplete(task._id)} className="shrink-0">
                        <Circle className="h-4 w-4 text-muted-foreground hover:text-primary transition-colors" />
                      </button>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${task.status === 'completed' ? 'line-through' : ''}`}>
                        {taskTitle(t, task)}
                      </p>
                      <div className="flex gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">
                          {t(`onboarding.assigneeType.${task.assigneeType}`, task.assigneeType)}
                        </span>
                        {task.assigneeName && (
                          <EmployeeHoverCard
                            userId={
                              (task as Record<string, unknown>).assigneeId as string | undefined
                            }
                            name={task.assigneeName}
                          >
                            <span className="text-xs cursor-pointer underline-offset-2 hover:underline">
                              • {task.assigneeName}
                            </span>
                          </EmployeeHoverCard>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge variant="outline" className="text-[10px]">
                        {t(`onboarding.category.${task.category}`, task.category)}
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

              {/* Complete program button */}
              {isAdmin && program.status === 'active' && program.progress >= 80 && (
                <Button className="w-full" onClick={handleCompleteProgram}>
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  {t('onboarding.completeProgram', 'Complete Onboarding')}
                </Button>
              )}
            </div>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

// ─── Start Onboarding Wizard ─────────────────────────────────
function StartOnboardingWizard({
  open,
  onClose,
  templates,
  user,
  t,
}: {
  open: boolean;
  onClose: () => void;
  templates: { _id: Id<'onboardingTemplates'>; name: string; department?: string }[];
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
  const [templateId, setTemplateId] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0] ?? '');
  const [buddyId, setBuddyId] = useState('');
  const [managerId, setManagerId] = useState('');

  const startOnboarding = useMutation(api.onboarding.startOnboarding);

  // Fetch available courses for onboarding
  const courses = useQuery(
    api.learning.listCourses,
    orgId ? { organizationId: orgId, includeUnpublished: false } : 'skip',
  );
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);

  const steps = [
    { id: 'employee', title: t('onboarding.wizard.step1', 'Employee') },
    { id: 'template', title: t('onboarding.wizard.step2', 'Template') },
    { id: 'courses', title: t('onboarding.wizard.stepCourses', 'Courses') },
    { id: 'details', title: t('onboarding.wizard.step3', 'Details') },
  ];

  const handleSubmit = async () => {
    // Guard on the organization being acted on, not the viewer's own: a
    // superadmin has no organizationId of their own and would never get past
    // this check while looking at someone else's org.
    if (!orgId || !employeeId || !managerId) return;
    try {
      await startOnboarding({
        organizationId: orgId,
        employeeId: employeeId as Id<'users'>,
        templateId: templateId ? (templateId as Id<'onboardingTemplates'>) : undefined,
        startDate: new Date(startDate || Date.now()).getTime(),
        buddyId: buddyId ? (buddyId as Id<'users'>) : undefined,
        managerId: managerId as Id<'users'>,
        courseIds:
          selectedCourseIds.length > 0 ? (selectedCourseIds as Id<'courses'>[]) : undefined,
      });
      toast.success(t('onboarding.wizard.success', 'Onboarding started!'));
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('common.error', 'Error'));
    }
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" size="lg" closeLabel={t('common.close', 'Close')} className="p-0">
        <SheetHeader className="gap-3.5">
          <SheetTitle>{t('onboarding.wizard.title', 'Start Onboarding')}</SheetTitle>
          <WizardStepper
            steps={steps}
            current={step}
            onStepClick={(i) => {
              // Backwards is always safe; forward only from step 0 once the
              // employee is picked, mirroring the footer button's guard.
              if (i < step || (i === 1 && employeeId)) setStep(i);
            }}
          />
        </SheetHeader>

        {/* Step content */}
        <SheetBody className="px-5 py-5">
          {step === 0 && (
            <div className="space-y-4">
              <UserPicker
                organizationId={orgId}
                value={employeeId}
                onChange={setEmployeeId}
                label={t('onboarding.fields.employee', 'New hire')}
                hint={t(
                  'onboarding.fields.employeeHint',
                  'The user must already exist in the system',
                )}
              />
            </div>
          )}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">
                  {t('onboarding.fields.template', 'Template')}
                </label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue
                      placeholder={t(
                        'onboarding.fields.selectTemplate',
                        'Select a template (optional)',
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.length === 0 ? (
                      // An empty dropdown reads as a broken control. Say why it is
                      // empty and that the step can be skipped.
                      <p className="px-2 py-3 text-sm text-muted-foreground max-w-[18rem]">
                        {t(
                          'onboarding.fields.noTemplatesHint',
                          'No templates yet — create one on the Templates tab, or continue without one.',
                        )}
                      </p>
                    ) : (
                      templates.map((tpl) => (
                        <SelectItem key={tpl._id} value={tpl._id}>
                          {tpl.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {t(
                    'onboarding.fields.templateHint',
                    'Optional. Without a template the built-in checklist is used.',
                  )}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium">
                  {t('onboarding.fields.startDate', 'Start Date')}
                </label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t(
                  'onboarding.fields.coursesHint',
                  'Select courses that the new hire must complete during onboarding.',
                )}
              </p>
              {!courses ? (
                <p className="text-sm text-muted-foreground">Loading courses...</p>
              ) : courses.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t(
                    'onboarding.fields.noCourses',
                    'No published courses available. Create courses in the Learning module first.',
                  )}
                </p>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {courses.map((course) => (
                    <label
                      key={course._id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedCourseIds.includes(course._id)
                          ? 'border-(--brand) bg-(--brand-quiet)'
                          : 'border-(--border) hover:bg-muted/50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedCourseIds.includes(course._id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedCourseIds([...selectedCourseIds, course._id]);
                          } else {
                            setSelectedCourseIds(
                              selectedCourseIds.filter((id) => id !== course._id),
                            );
                          }
                        }}
                        className="h-4 w-4 rounded border-(--border)"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{course.title}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{course.category}</span>
                          {course.isMandatory && (
                            <Badge variant="destructive" className="text-[10px]">
                              {t('learning.mandatory', 'Mandatory')}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
              {selectedCourseIds.length > 0 && (
                <p className="text-xs text-(--brand-text)">
                  {selectedCourseIds.length} {t('onboarding.coursesSelected', 'course(s) selected')}
                </p>
              )}
            </div>
          )}
          {step === 3 && (
            <div className="space-y-5">
              <UserPicker
                organizationId={orgId}
                value={managerId}
                onChange={setManagerId}
                label={t('onboarding.fields.manager', 'Manager')}
                excludeUserId={employeeId ? (employeeId as Id<'users'>) : undefined}
                listHeight={200}
              />
              <UserPicker
                organizationId={orgId}
                value={buddyId}
                onChange={setBuddyId}
                label={t('onboarding.fields.buddy', 'Buddy / mentor (optional)')}
                excludeUserId={employeeId ? (employeeId as Id<'users'>) : undefined}
                listHeight={200}
              />
            </div>
          )}
        </SheetBody>

        {/* Footer */}
        <SheetFooter className="justify-between">
          <Button variant="ghost" onClick={() => (step > 0 ? setStep(step - 1) : onClose())}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            {step > 0 ? t('common.back', 'Back') : t('common.cancel', 'Cancel')}
          </Button>
          {step < steps.length - 1 ? (
            <Button onClick={() => setStep(step + 1)} disabled={step === 0 && !employeeId}>
              {t('common.next', 'Next')} <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={!employeeId || !managerId}>
              <Rocket className="h-4 w-4 mr-1" /> {t('onboarding.wizard.start', 'Start')}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ─── Create Template Wizard ──────────────────────────────────
function CreateTemplateWizard({
  open,
  onClose,
  user,
  t,
  initialTemplate,
}: {
  open: boolean;
  onClose: () => void;
  user: User | null;
  t: TFunction;
  initialTemplate?: EditableTemplate | null;
}) {
  const [step, setStep] = useState(0);
  // Create into the organization the screen is showing, not the viewer's own.
  const selectedOrgId = useSelectedOrganization();
  const orgId = (selectedOrgId ?? user?.organizationId ?? undefined) as
    | Id<'organizations'>
    | undefined;
  const [name, setName] = useState(initialTemplate?.name ?? '');
  const [description, setDescription] = useState(initialTemplate?.description ?? '');
  const [department, setDepartment] = useState(initialTemplate?.department ?? '');
  const [tasks, setTasks] = useState<TemplateTask[]>(initialTemplate?.tasks ?? []);
  const [newTask, setNewTask] = useState<Partial<TemplateTask>>({
    assigneeType: 'new_hire',
    category: 'other',
    dayOffset: 0,
  });

  const createTemplate = useMutation(api.onboarding.createTemplate);
  const updateTemplate = useMutation(api.onboarding.updateTemplate);

  const steps = [
    { id: 'basic', title: t('onboarding.templateWizard.step1', 'Basic Info') },
    { id: 'tasks', title: t('onboarding.templateWizard.step2', 'Tasks') },
    { id: 'review', title: t('onboarding.templateWizard.step3', 'Review') },
  ];

  const addTask = () => {
    if (!newTask.title) return;
    setTasks([
      ...tasks,
      {
        key: `task_${Date.now()}`,
        title: newTask.title || '',
        description: newTask.description,
        assigneeType: newTask.assigneeType as TemplateTask['assigneeType'],
        category: newTask.category as TemplateTask['category'],
        dayOffset: newTask.dayOffset ?? 0,
      },
    ]);
    setNewTask({ assigneeType: 'new_hire', category: 'other', dayOffset: 0 });
  };

  const removeTask = (idx: number) => {
    setTasks(tasks.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!orgId || !name || tasks.length === 0) return;
    try {
      if (initialTemplate) {
        await updateTemplate({
          templateId: initialTemplate._id,
          name,
          description: description || undefined,
          department: department || undefined,
          tasks,
        });
      } else {
        await createTemplate({
          organizationId: orgId,
          name,
          description: description || undefined,
          department: department || undefined,
          tasks,
        });
      }
      toast.success(
        initialTemplate
          ? t('onboarding.templateWizard.updated', 'Template updated!')
          : t('onboarding.templateWizard.success', 'Template created!'),
      );
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('common.error', 'Error'));
    }
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" size="lg" closeLabel={t('common.close', 'Close')} className="p-0">
        <SheetHeader className="gap-3.5">
          <SheetTitle>
            {initialTemplate
              ? t('onboarding.templateWizard.editTitle', 'Edit Template')
              : t('onboarding.templateWizard.title', 'Create Template')}
          </SheetTitle>
          <WizardStepper
            steps={steps}
            current={step}
            onStepClick={(i) => (i < step ? setStep(i) : undefined)}
          />
        </SheetHeader>

        {/* Step content */}
        <SheetBody className="px-5 py-5">
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">
                  {t('onboarding.fields.templateName', 'Template Name')}
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t(
                    'onboarding.fields.templateNamePlaceholder',
                    'e.g. Engineering Onboarding',
                  )}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">
                  {t('onboarding.fields.description', 'Description')}
                </label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('onboarding.fields.descPlaceholder', 'What is this template for?')}
                  className="mt-1"
                  rows={2}
                />
              </div>
              <div>
                <label className="text-sm font-medium">
                  {t('onboarding.fields.department', 'Department')}
                </label>
                <Input
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder={t('onboarding.fields.deptPlaceholder', 'e.g. Engineering')}
                  className="mt-1"
                />
              </div>
            </div>
          )}
          {step === 1 && (
            <div className="space-y-4">
              {/* Existing tasks */}
              {tasks.length > 0 && (
                <div className="space-y-2">
                  {tasks.map((task, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded border text-sm">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{task.title}</p>
                        <p className="text-xs text-muted-foreground">
                          Day {task.dayOffset} • {task.assigneeType} • {task.category}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-(--danger-text)"
                        onClick={() => removeTask(i)}
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add new task form */}
              <div className="p-3 rounded-lg border border-dashed space-y-3">
                <Input
                  value={newTask.title || ''}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  placeholder={t('onboarding.fields.taskTitle', 'Task title')}
                />
                <div className="grid grid-cols-3 gap-2">
                  <Select
                    value={newTask.assigneeType}
                    onValueChange={(v) =>
                      setNewTask({ ...newTask, assigneeType: v as TemplateTask['assigneeType'] })
                    }
                  >
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ASSIGNEE_TYPES.map((at) => (
                        <SelectItem key={at} value={at}>
                          {t(`onboarding.assigneeType.${at}`, at)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={newTask.category}
                    onValueChange={(v) =>
                      setNewTask({ ...newTask, category: v as TemplateTask['category'] })
                    }
                  >
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {t(`onboarding.category.${c}`, c)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    value={newTask.dayOffset ?? 0}
                    onChange={(e) =>
                      setNewTask({ ...newTask, dayOffset: parseInt(e.target.value) || 0 })
                    }
                    placeholder={t('onboarding.fields.dayPlaceholder', 'Day')}
                    className="text-xs"
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addTask}
                  disabled={!newTask.title}
                  className="w-full"
                >
                  <Plus className="h-3 w-3 mr-1" /> {t('onboarding.addTask', 'Add Task')}
                </Button>
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="font-medium">{name}</p>
                {description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                )}
                {department && (
                  <Badge variant="outline" className="mt-1 text-xs">
                    {department}
                  </Badge>
                )}
              </div>
              <p className="text-sm font-medium">
                {tasks.length} {t('onboarding.tasks', 'tasks')}:
              </p>
              <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                {tasks.map((task, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm p-2 rounded border">
                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">
                      {i + 1}
                    </span>
                    <span className="flex-1 truncate">{task.title}</span>
                    <span className="text-xs text-muted-foreground">D+{task.dayOffset}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SheetBody>

        {/* Footer */}
        <SheetFooter className="justify-between">
          <Button variant="ghost" onClick={() => (step > 0 ? setStep(step - 1) : onClose())}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            {step > 0 ? t('common.back', 'Back') : t('common.cancel', 'Cancel')}
          </Button>
          {step < steps.length - 1 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={(step === 0 && !name) || (step === 1 && tasks.length === 0)}
            >
              {t('common.next', 'Next')} <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit}>
              <CheckCircle2 className="h-4 w-4 mr-1" />{' '}
              {initialTemplate
                ? t('common.save', 'Save')
                : t('onboarding.templateWizard.create', 'Create')}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
