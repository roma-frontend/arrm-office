'use client';

import React, { useState } from 'react';
import { localizedTaskTitle } from '@/lib/taskTitle';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { NewTaskSheet } from '@/components/tasks/NewTaskSheet';
import { TaskSheet } from '@/components/tasks/TaskSheet';
import { TaskEditSheet } from '@/components/tasks/TaskEditSheet';
import { ProjectEditSheet } from '@/components/projects/ProjectEditSheet';
import { ProjectTaskGrid } from '@/components/projects/ProjectTaskGrid';
import { ArrowLeft, Calendar, Users, CheckCircle2, Trash2, Pencil, Plus } from 'lucide-react';

type LabelStyle = { label: string; color: string };

const STATUS_CONFIG: Record<string, LabelStyle> = {
  planning: { label: 'Planning', color: 'text-(--brand-text)' },
  active: { label: 'Active', color: 'text-(--success-text)' },
  on_hold: { label: 'On Hold', color: 'text-(--warning-text)' },
  completed: { label: 'Completed', color: 'text-(--success-text)' },
  cancelled: { label: 'Cancelled', color: 'text-(--danger-text)' },
};

const PRIORITY_CONFIG: Record<string, LabelStyle> = {
  low: { label: 'Low', color: 'text-(--text-muted)' },
  medium: { label: 'Medium', color: 'text-(--brand-text)' },
  high: { label: 'High', color: 'text-(--warning-text)' },
  urgent: { label: 'Urgent', color: 'text-(--danger-text)' },
};

const STATUS_FALLBACK: LabelStyle = { label: 'Planning', color: 'text-(--brand-text)' };
const PRIORITY_FALLBACK: LabelStyle = { label: 'Medium', color: 'text-(--brand-text)' };

export default function ProjectDetailClient({
  projectId,
  userId,
  userRole,
}: {
  projectId: string;
  userId: string;
  userRole: 'superadmin' | 'admin' | 'supervisor' | 'employee' | 'driver';
}) {
  const { t } = useTranslation();
  const router = useRouter();

  const project = useQuery(api.projects.getProject, { projectId: projectId as Id<'projects'> });
  const deleteProject = useMutation(api.projects.deleteProject);

  const [editOpen, setEditOpen] = useState(false);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<{ id: Id<'tasks'>; title: string } | null>(null);
  const [editingTask, setEditingTask] = useState<{ id: Id<'tasks'>; title: string } | null>(null);

  if (!project) return <ShieldLoader />;

  /**
   * What the viewer may do to the grid.
   *
   * The same split as the board: staff manage, an employee may still create and
   * edit their own work (the server enforces which rows), a driver reads. Every
   * write is checked again server-side — this only decides which affordances are
   * worth drawing.
   */
  const canManage = userRole === 'admin' || userRole === 'supervisor' || userRole === 'superadmin';
  const canEdit = canManage || userRole === 'employee';

  /**
   * `getProject` returns recurring series next to the tasks. The grid takes both
   * and renders only the tasks; the strip below it renders only the series, so
   * the narrowing happens once, here, with the query's own discriminant.
   */
  type ProjectEntry = NonNullable<typeof project>['tasks'][number];
  const recurringSeries = project.tasks.filter(
    (entry): entry is Extract<ProjectEntry, { type: 'recurring' }> => entry.type === 'recurring',
  );

  const statusCfg = STATUS_CONFIG[project.status] ?? STATUS_FALLBACK;
  const priorityCfg = PRIORITY_CONFIG[project.priority] ?? PRIORITY_FALLBACK;

  const deadlineDate = project.deadline ? new Date(project.deadline) : null;
  const isOverdue =
    deadlineDate &&
    deadlineDate < new Date() &&
    project.status !== 'completed' &&
    project.status !== 'cancelled';

  const handleDelete = async () => {
    if (
      !confirm(
        t('projects.deleteConfirm', 'Delete this project? All linked tasks will be unlinked.'),
      )
    )
      return;
    try {
      await deleteProject({ projectId: project._id });
      toast.success(t('projects.deleted', 'Project deleted'));
      router.push('/projects');
    } catch (e) {
      toast.error(String(e));
    }
  };

  return (
    <div className="my-6">
      {/* Navigation */}
      <button
        onClick={() => router.push('/projects')}
        className="flex items-center gap-1 text-sm text-(--text-muted) hover:text-(--text-primary) transition-colors my-6"
      >
        <ArrowLeft className="w-4 h-4" /> {t('common.back', 'Back to Projects')}
      </button>

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold truncate">{project.name}</h1>
            <Badge className={statusCfg.color}>
              {t(`projects.status.${project.status}`, statusCfg.label)}
            </Badge>
            <Badge variant="outline" className={priorityCfg.color}>
              {t(`projects.priority.${project.priority}`, priorityCfg.label)}
            </Badge>
          </div>
          {project.description && (
            <p className="text-sm text-(--text-muted)">{project.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="w-4 h-4 mr-1" /> {t('common.edit', 'Edit')}
          </Button>
          <Button size="sm" variant="destructive" onClick={handleDelete}>
            <Trash2 className="w-4 h-4 mr-1" />
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle2 className="w-5 h-5 mx-auto mb-1 text-(--success-text)" />
            <p className="text-xl font-bold">
              {project.completedTasks}/{project.taskCount}
            </p>
            <p className="text-xs text-(--text-muted)">{t('projects.tasks', 'Tasks')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="w-5 h-5 mx-auto mb-1 text-(--brand-text)" />
            <p className="text-xl font-bold">{project.members?.length ?? 0}</p>
            <p className="text-xs text-(--text-muted)">{t('projects.members', 'Members')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Calendar
              className={`w-5 h-5 mx-auto mb-1 ${isOverdue ? 'text-(--danger-text)' : 'text-(--brand-text)'}`}
            />
            <p className={`text-sm font-bold ${isOverdue ? 'text-(--danger-text)' : ''}`}>
              {deadlineDate ? deadlineDate.toLocaleDateString() : '—'}
            </p>
            <p className="text-xs text-(--text-muted)">{t('projects.deadline', 'Deadline')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="w-full mb-2">
              <Progress value={project.progress} className="h-2" />
            </div>
            <p className="text-xl font-bold text-(--success-text)">{project.progress}%</p>
            <p className="text-xs text-(--text-muted)">{t('common.progress', 'Progress')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tasks Section */}
      <div>
        <div className="flex items-center justify-between my-3">
          <h2 className="text-lg font-semibold">{t('projects.tasks', 'Tasks')}</h2>
          <Button size="sm" onClick={() => setNewTaskOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> {t('projects.addTask', 'Add Task')}
          </Button>
        </div>

        {/* The board's grid, scoped to this project — ClickUp's "List" page. The
            wizard button above it stays: a row typed into the grid is a title and
            a status, and plenty of tasks want a description, a deadline and an
            attachment before they are worth having. */}
        <ProjectTaskGrid
          projectId={project._id}
          tasks={project.tasks}
          viewerId={userId}
          canEdit={canEdit}
          canManage={canManage}
          onOpenTask={(id, title) => setSelectedTask({ id: id as Id<'tasks'>, title })}
        />

        {/* Recurring series are not rows in the grid — a series lives in
            `recurringTasks` and has no task document to edit — so they keep their
            own strip, and clicking one goes to the tab that manages them. */}
        {recurringSeries.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-(--text-muted)">
              {t('projects.recurringSeries', 'Recurring series')}
            </p>
            {recurringSeries.map((series) => (
              <button
                key={series._id}
                type="button"
                onClick={() => router.push('/tasks?tab=recurring')}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-(--border) bg-(--card) p-3 text-left transition-all hover:shadow-sm"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {localizedTaskTitle(t, series)}
                  </span>
                  <span className="block text-xs text-(--text-muted)">
                    {series.assignedToUser?.name ?? t('projects.unassigned', 'Unassigned')}
                  </span>
                </span>
                <Badge variant="secondary" className="shrink-0 text-xs">
                  🔁 {String(t(`recurringTasks.frequency.${series.frequency}`) || series.frequency)}
                </Badge>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Members Section */}
      {project.members && project.members.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">{t('projects.members', 'Members')}</h2>
          <div className="flex flex-wrap gap-2">
            {project.members.map((member) => (
              <Badge key={member._id} variant="secondary" className="text-sm px-3 py-1.5">
                {member.name}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Add task in a slide-over, not a full page: the project stays put. */}
      <NewTaskSheet
        open={newTaskOpen}
        onClose={() => setNewTaskOpen(false)}
        currentUserId={userId}
        userRole={userRole}
        projectId={project._id}
      />

      {/* Edit in a slide-over too — the form ships straight from the project
          page, so re-orientation after saving is zero. */}
      <ProjectEditSheet open={editOpen} onClose={() => setEditOpen(false)} project={project} />

      {/* Task detail in a slide-over. */}
      <TaskSheet
        taskId={selectedTask?.id ?? null}
        taskTitle={selectedTask?.title}
        onClose={() => setSelectedTask(null)}
        onEdit={(id) => {
          setSelectedTask(null);
          setEditingTask({ id, title: selectedTask?.title ?? '' });
        }}
      />

      {/* Task edit in a slide-over. */}
      <TaskEditSheet
        taskId={editingTask?.id ?? null}
        taskTitle={editingTask?.title}
        onClose={() => setEditingTask(null)}
      />
    </div>
  );
}
