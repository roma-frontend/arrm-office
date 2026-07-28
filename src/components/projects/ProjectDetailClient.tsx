'use client';

import React, { useState, useMemo } from 'react';
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
import {
  ArrowLeft,
  Calendar,
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
  Trash2,
  Pencil,
} from 'lucide-react';

type LabelStyle = { label: string; color: string };

const STATUS_CONFIG: Record<string, LabelStyle> = {
  planning: { label: 'Planning', color: 'text-blue-500' },
  active: { label: 'Active', color: 'text-emerald-500' },
  on_hold: { label: 'On Hold', color: 'text-amber-500' },
  completed: { label: 'Completed', color: 'text-green-500' },
  cancelled: { label: 'Cancelled', color: 'text-rose-500' },
};

const PRIORITY_CONFIG: Record<string, LabelStyle> = {
  low: { label: 'Low', color: 'text-(--text-muted)' },
  medium: { label: 'Medium', color: 'text-blue-500' },
  high: { label: 'High', color: 'text-orange-500' },
  urgent: { label: 'Urgent', color: 'text-rose-500' },
};

const STATUS_FALLBACK: LabelStyle = { label: 'Planning', color: 'text-blue-500' };
const PRIORITY_FALLBACK: LabelStyle = { label: 'Medium', color: 'text-blue-500' };

export default function ProjectDetailClient({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const router = useRouter();

  const project = useQuery(api.projects.getProject, { projectId: projectId as Id<'projects'> });
  const updateProject = useMutation(api.projects.updateProject);
  const deleteProject = useMutation(api.projects.deleteProject);

  const [isEditing, setIsEditing] = useState(false);
  const [editStatus, setEditStatus] = useState('');

  if (!project) return <ShieldLoader />;

  const statusCfg = STATUS_CONFIG[project.status] ?? STATUS_FALLBACK;
  const priorityCfg = PRIORITY_CONFIG[project.priority] ?? PRIORITY_FALLBACK;

  const deadlineDate = project.deadline ? new Date(project.deadline) : null;
  const isOverdue =
    deadlineDate &&
    deadlineDate < new Date() &&
    project.status !== 'completed' &&
    project.status !== 'cancelled';

  const handleStatusChange = async (newStatus: string) => {
    try {
      await updateProject({
        projectId: project._id,
        status: newStatus as any,
      });
      toast.success(t('projects.statusUpdated', 'Status updated'));
      setIsEditing(false);
    } catch (e) {
      toast.error(String(e));
    }
  };

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
    <div className="space-y-6">
      {/* Navigation */}
      <button
        onClick={() => router.push('/projects')}
        className="flex items-center gap-1 text-sm text-(--text-muted) hover:text-(--text-primary) transition-colors"
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
          <Button size="sm" variant="outline" onClick={() => setIsEditing(!isEditing)}>
            <Pencil className="w-4 h-4 mr-1" /> {t('common.edit', 'Edit')}
          </Button>
          <Button size="sm" variant="destructive" onClick={handleDelete}>
            <Trash2 className="w-4 h-4 mr-1" />
          </Button>
        </div>
      </div>

      {/* Status Edit */}
      {isEditing && (
        <Card>
          <CardContent className="p-4 flex flex-wrap gap-2">
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <Button
                key={key}
                size="sm"
                variant={project.status === key ? 'default' : 'outline'}
                onClick={() => handleStatusChange(key)}
              >
                {t(`projects.status.${key}`, cfg.label)}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle2 className="w-5 h-5 mx-auto mb-1 text-emerald-500" />
            <p className="text-xl font-bold">
              {project.completedTasks}/{project.taskCount}
            </p>
            <p className="text-xs text-(--text-muted)">{t('projects.tasks', 'Tasks')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="w-5 h-5 mx-auto mb-1 text-blue-500" />
            <p className="text-xl font-bold">{project.members?.length ?? 0}</p>
            <p className="text-xs text-(--text-muted)">{t('projects.members', 'Members')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Calendar
              className={`w-5 h-5 mx-auto mb-1 ${isOverdue ? 'text-rose-500' : 'text-blue-500'}`}
            />
            <p className={`text-sm font-bold ${isOverdue ? 'text-rose-500' : ''}`}>
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
            <p className="text-xl font-bold text-emerald-500">{project.progress}%</p>
            <p className="text-xs text-(--text-muted)">{t('common.progress', 'Progress')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tasks Section */}
      <div>
        <h2 className="text-lg font-semibold mb-3">{t('projects.tasks', 'Tasks')}</h2>
        {project.tasks && project.tasks.length > 0 ? (
          <div className="space-y-2">
            {project.tasks.map((task: any) => (
              <div
                key={task._id}
                className="flex items-center justify-between p-3 rounded-xl bg-(--card) border border-(--border) hover:shadow-sm cursor-pointer transition-all"
                onClick={() => router.push(`/tasks/${task._id}`)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      task.status === 'completed'
                        ? 'bg-emerald-500'
                        : task.status === 'in_progress'
                          ? 'bg-blue-500'
                          : task.status === 'review'
                            ? 'bg-amber-500'
                            : 'bg-(--text-muted)'
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{task.title}</p>
                    <p className="text-xs text-(--text-muted)">
                      {task.assignedToUser?.name ?? t('projects.unassigned', 'Unassigned')}
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="text-xs shrink-0">
                  {task.status}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-(--text-muted)">
            <Clock className="w-12 h-12 mx-auto mb-3" />
            <p>{t('projects.noTasks', 'No tasks yet')}</p>
            <Button
              size="sm"
              className="mt-3"
              onClick={() => router.push(`/tasks?project=${project._id}`)}
            >
              {t('projects.addTask', 'Add Task')}
            </Button>
          </div>
        )}
      </div>

      {/* Members Section */}
      {project.members && project.members.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">{t('projects.members', 'Members')}</h2>
          <div className="flex flex-wrap gap-2">
            {project.members.map((member: any) => (
              <Badge key={member._id} variant="secondary" className="text-sm px-3 py-1.5">
                {member.name}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
