'use client';

import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { useAuthUser } from '@/store/useAuthStore';
import type { Id } from '../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { Input } from '@/components/ui/input';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  Search,
  FolderKanban,
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  ArrowRight,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';

type StatusStyle = { label: string; color: string; bg: string };

const STATUS_FALLBACK: StatusStyle = {
  label: 'Planning',
  color: 'text-blue-500',
  bg: 'bg-blue-500/10',
};

const STATUS_CONFIG: Record<string, StatusStyle> = {
  planning: { label: 'Planning', color: 'text-blue-500', bg: 'bg-blue-500/10' },
  active: { label: 'Active', color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  on_hold: { label: 'On Hold', color: 'text-amber-500', bg: 'bg-amber-500/10' },
  completed: { label: 'Completed', color: 'text-green-500', bg: 'bg-green-500/10' },
  cancelled: { label: 'Cancelled', color: 'text-rose-500', bg: 'bg-rose-500/10' },
};

export default function ProjectsClient({ userRole }: { userId: string; userRole: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const user = useAuthUser();
  const organizationId = useSelectedOrganization() as Id<'organizations'> | undefined;

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    priority: 'medium' as 'low' | 'medium' | 'high' | 'urgent',
    deadline: '',
  });
  const [creating, setCreating] = useState(false);

  const projects = useQuery(
    api.projects.listProjects,
    organizationId ? { organizationId } : 'skip',
  );
  const stats = useQuery(
    api.projects.getProjectStats,
    organizationId ? { organizationId } : 'skip',
  );
  const createProject = useMutation(api.projects.createProject);
  const _users = useQuery(api.tasks.getUsersForAssignment);

  const filtered = useMemo(() => {
    if (!projects) return [];
    return projects.filter((p) => {
      const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'all' || p.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [projects, search, statusFilter]);

  const handleCreate = async () => {
    if (!createForm.name.trim() || !organizationId) return;
    setCreating(true);
    try {
      const projectId = await createProject({
        organizationId,
        name: createForm.name.trim(),
        description: createForm.description.trim() || undefined,
        priority: createForm.priority,
        deadline: createForm.deadline ? new Date(createForm.deadline).getTime() : undefined,
        memberIds: [],
        ownerId: user?.id as Id<'users'> | undefined,
      });
      toast.success(t('projects.created', 'Project created'));
      setShowCreate(false);
      setCreateForm({ name: '', description: '', priority: 'medium', deadline: '' });
      router.push(`/projects/${projectId}`);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setCreating(false);
    }
  };

  const canManage = userRole === 'admin' || userRole === 'superadmin' || userRole === 'supervisor';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 bg-(--background)/95 backdrop-blur border-b border-(--border)">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold">{t('projects.title', 'Projects')}</h1>
            <p className="text-sm text-(--text-muted) mt-1">
              {t('projects.subtitle', 'Manage projects, track progress, and collaborate')}
            </p>
          </div>
          {canManage && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-1" /> {t('projects.create', 'New Project')}
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            {
              id: 'total',
              label: t('projects.total', 'Total'),
              value: stats.total,
              icon: FolderKanban,
              color: '#3b82f6',
            },
            {
              id: 'active',
              label: t('projects.active', 'Active'),
              value: stats.active,
              icon: TrendingUp,
              color: '#10b981',
            },
            {
              id: 'planning',
              label: t('projects.planning', 'Planning'),
              value: stats.planning,
              icon: Clock,
              color: '#f59e0b',
            },
            {
              id: 'completed',
              label: t('projects.completed', 'Completed'),
              value: stats.completed,
              icon: CheckCircle2,
              color: '#22c55e',
            },
            {
              id: 'onHold',
              label: t('projects.onHold', 'On Hold'),
              value: stats.onHold,
              icon: AlertCircle,
              color: '#8b5cf6',
            },
            {
              id: 'tasks',
              label: t('tasksClient.total', 'Tasks'),
              value: stats.totalTasks,
              icon: Users,
              color: '#64748b',
            },
          ].map((s) => (
            <Card key={s.id}>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold" style={{ color: s.color }}>
                  {s.value}
                </p>
                <p className="text-xs text-(--text-muted) mt-1">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Overall Progress */}
      {stats && stats.totalTasks > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">
                {t('projects.overallProgress', 'Overall Progress')}
              </span>
              <span className="text-sm font-bold text-emerald-500">{stats.overallProgress}%</span>
            </div>
            <Progress value={stats.overallProgress} className="h-2" />
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('placeholders.search', 'Search projects...')}
            className="pl-9"
          />
        </div>
        <CustomSelect
          value={statusFilter}
          onChange={(v) => setStatusFilter(v)}
          options={[
            { value: 'all', label: t('projects.allStatuses', 'All Statuses') },
            { value: 'planning', label: t('projects.status.planning', 'Planning') },
            { value: 'active', label: t('projects.status.active', 'Active') },
            { value: 'on_hold', label: t('projects.status.on_hold', 'On Hold') },
            { value: 'completed', label: t('projects.status.completed', 'Completed') },
            { value: 'cancelled', label: t('projects.status.cancelled', 'Cancelled') },
          ]}
          triggerClassName="px-3 py-2 rounded-xl border border-(--border) bg-(--card) text-sm"
          dropdownClassName="bg-(--card) border border-(--border)"
        />
      </div>

      {/* Projects List */}
      {!projects ? (
        <ShieldLoader />
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <FolderKanban className="w-16 h-16 mx-auto mb-4 text-(--text-muted)" />
          <p className="text-(--text-secondary) font-medium">
            {t('projects.noProjects', 'No projects found')}
          </p>
          {canManage && (
            <Button className="mt-4" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-1" />{' '}
              {t('projects.createFirst', 'Create your first project')}
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((project) => {
            const statusCfg = STATUS_CONFIG[project.status] ?? STATUS_FALLBACK;
            return (
              <Card
                key={project._id}
                className="cursor-pointer hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5"
                onClick={() => router.push(`/projects/${project._id}`)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-base truncate">{project.name}</h3>
                      {project.description && (
                        <p className="text-xs text-(--text-muted) mt-1 line-clamp-2">
                          {project.description}
                        </p>
                      )}
                    </div>
                    <Badge className={`ml-2 ${statusCfg.bg} ${statusCfg.color} shrink-0`}>
                      {t(`projects.status.${project.status}`, statusCfg.label)}
                    </Badge>
                  </div>

                  {/* Progress Bar */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-(--text-muted)">
                        {t('common.progress', 'Progress')}
                      </span>
                      <span className="font-medium">{project.progress}%</span>
                    </div>
                    <Progress value={project.progress} className="h-1.5" />
                  </div>

                  <div className="flex items-center justify-between text-xs text-(--text-muted)">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {project.completedTasks}/{project.taskCount}
                      </span>
                      {project.ownerName && (
                        <span className="flex items-center gap-1 truncate max-w-[120px]">
                          <Users className="w-3.5 h-3.5" />
                          {project.ownerName}
                        </span>
                      )}
                    </div>
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('projects.createTitle', 'Create Project')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('projects.name', 'Project Name')} *</Label>
              <Input
                value={createForm.name}
                onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
                placeholder={t('projects.namePlaceholder', 'e.g. Q4 Product Launch')}
              />
            </div>
            <div>
              <Label>{t('projects.description', 'Description')}</Label>
              <Textarea
                value={createForm.description}
                onChange={(e) => setCreateForm((p) => ({ ...p, description: e.target.value }))}
                placeholder={t('projects.descPlaceholder', 'Brief project overview...')}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t('projects.priorityLabel', 'Priority')}</Label>
                <Select
                  value={createForm.priority}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onValueChange={(v) => setCreateForm((p) => ({ ...p, priority: v as any }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">{t('projects.priority.low', 'Low')}</SelectItem>
                    <SelectItem value="medium">
                      {t('projects.priority.medium', 'Medium')}
                    </SelectItem>
                    <SelectItem value="high">{t('projects.priority.high', 'High')}</SelectItem>
                    <SelectItem value="urgent">
                      {t('projects.priority.urgent', 'Urgent')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('projects.deadline', 'Deadline')}</Label>
                <Input
                  type="date"
                  value={createForm.deadline}
                  onChange={(e) => setCreateForm((p) => ({ ...p, deadline: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowCreate(false)}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button onClick={handleCreate} disabled={creating || !createForm.name.trim()}>
                {creating ? t('common.saving', 'Saving...') : t('common.create', 'Create')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
