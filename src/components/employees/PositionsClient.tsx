'use client';

import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from 'convex/react';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import { cn } from '@/lib/utils';
import {
  Briefcase,
  Building2,
  Edit2,
  Trash2,
  Plus,
  Search,
  LayoutGrid,
  List,
  TrendingUp,
  BarChart3,
  Wallet,
  CheckCircle,
  DollarSign,
} from 'lucide-react';
import { useShallow } from 'zustand/shallow';
import { useAuthStore } from '@/store/useAuthStore';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { Button } from '@/components/ui/button';
import { SkeletonTable } from '@/components/ui/skeleton';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Wizard, WizardStep } from '@/components/ui/wizard';
import {
  TextInputStep,
  TextareaStep,
  CardSelectionStep,
} from '@/components/ui/wizard-step-components';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { api } from '@/convex/_generated/api';
import { Id, Doc } from '@/convex/_generated/dataModel';
import { useDraftResume } from '@/hooks/useDraftResume';
import { DraftResumeBar } from '@/components/ui/DraftResumeBar';

const POSITION_LEVELS = [
  {
    value: 'Entry',
    label: 'Entry Level',
    description: '0-2 years experience',
    color: 'bg-(--success-quiet) text-(--success-text)',
  },
  {
    value: 'Mid',
    label: 'Mid Level',
    description: '2-5 years experience',
    color: 'bg-(--brand-quiet) text-(--brand-text)',
  },
  {
    value: 'Senior',
    label: 'Senior Level',
    description: '5-8 years experience',
    color: 'bg-(--purple-quiet) text-(--purple-text)',
  },
  {
    value: 'Lead',
    label: 'Lead',
    description: '8+ years experience',
    color: 'bg-(--warning-quiet) text-(--warning-text)',
  },
  {
    value: 'Manager',
    label: 'Manager',
    description: 'Team management role',
    color: 'bg-(--danger-quiet) text-(--danger-text)',
  },
  {
    value: 'Director',
    label: 'Director',
    description: 'Department leadership',
    color: 'bg-orange-500/10 text-orange-600',
  },
];

interface PositionWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingPosition: Doc<'positions'> | null;
  departments: Doc<'departments'>[] | undefined;
  onComplete: () => void;
}

function PositionWizard({
  open,
  onOpenChange,
  editingPosition,
  departments,
  onComplete,
}: PositionWizardProps) {
  const { t } = useTranslation();
  const selectedOrgId = useSelectedOrganization();
  const createPosition = useMutation(api.positions.create);
  const updatePosition = useMutation(api.positions.update);
  const buildInitialData = React.useCallback(
    (position: Doc<'positions'> | null): Record<string, string | number | boolean | null> =>
      position
        ? {
            title: position.title,
            description: position.description || '',
            departmentId: position.departmentId || '',
            level: position.level || '',
            salaryMin: position.salaryMin?.toString() || '',
            salaryMax: position.salaryMax?.toString() || '',
            isDriverPosition: position.isDriverPosition ?? false,
          }
        : {
            title: '',
            description: '',
            departmentId: '',
            level: '',
            salaryMin: '',
            salaryMax: '',
            isDriverPosition: false,
          },
    [],
  );

  const [wizardData, setWizardData] = useState<Record<string, string | number | boolean | null>>(
    () => buildInitialData(editingPosition),
  );
  const [_isSubmitting, setIsSubmitting] = useState(false);

  // Диалог не размонтируется между открытиями — пересобираем начальные данные
  // при каждом открытии, иначе форма редактирования пустая.
  const editingId = editingPosition?._id ?? null;
  React.useEffect(() => {
    if (!open) return;
    setWizardData(buildInitialData(editingPosition));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingId, buildInitialData]);

  const updateStepData = (key: string, value: string | number | boolean | null) => {
    setWizardData((prev) => ({ ...prev, [key]: value }));
  };

  const departmentOptions =
    departments?.map((dept) => ({
      value: dept._id,
      title: dept.name,
      description: dept.description || '',
      icon: <Building2 className="w-5 h-5" />,
      color: dept.color
        ? `bg-[${dept.color}]/10 text-[${dept.color}]`
        : 'bg-gray-500/10 text-gray-600',
    })) || [];

  const steps: WizardStep[] = [
    {
      id: 'details',
      title: t('positionWizard.steps.details.title'),
      description: t('positionWizard.steps.details.description'),
      icon: <Briefcase className="w-5 h-5" />,
      content: (
        <>
          <TextInputStep
            stepData={wizardData}
            updateStepData={updateStepData}
            field="title"
            label={t('positionWizard.steps.details.titleLabel')}
            placeholder={t('positionWizard.steps.details.titlePlaceholder')}
            required
          />
          <TextareaStep
            stepData={wizardData}
            updateStepData={updateStepData}
            field="description"
            label={t('positionWizard.steps.details.descriptionLabel')}
            placeholder={t('positionWizard.steps.details.descriptionPlaceholder')}
            rows={3}
          />
        </>
      ),
      validation: (data) => {
        return typeof data.title === 'string' && data.title.trim().length > 0;
      },
    },
    {
      id: 'classification',
      title: t('positionWizard.steps.classification.title'),
      description: t('positionWizard.steps.classification.description'),
      icon: <BarChart3 className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pos-dept">
              {t('positionWizard.steps.classification.departmentLabel')}
            </Label>
            <Select
              value={String(wizardData.departmentId || '')}
              onValueChange={(value) => updateStepData('departmentId', value)}
            >
              <SelectTrigger id="pos-dept">
                <SelectValue
                  placeholder={t('positionWizard.steps.classification.departmentPlaceholder')}
                />
              </SelectTrigger>
              <SelectContent>
                {departmentOptions.length > 0 ? (
                  departmentOptions.map((dept) => (
                    <SelectItem key={dept.value} value={dept.value}>
                      {dept.title}
                    </SelectItem>
                  ))
                ) : (
                  <div className="px-2 py-4 text-center text-sm text-text-muted">
                    {t('positionWizard.steps.classification.noDepartments')}
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>
          <CardSelectionStep
            stepData={wizardData}
            updateStepData={updateStepData}
            field="level"
            label={t('positionWizard.steps.classification.levelLabel')}
            options={POSITION_LEVELS.map((l) => ({
              value: l.value,
              title: l.label,
              description: l.description,
              icon: <TrendingUp className="w-5 h-5" />,
              color: l.color,
            }))}
            columns={3}
          />
          {/* Driving is a job, so it is classified here rather than through the
              permission tier on the employee record. */}
          <label
            htmlFor="pos-driver"
            className="flex items-start gap-3 rounded-lg border border-border bg-background-subtle p-4 cursor-pointer"
          >
            <input
              id="pos-driver"
              type="checkbox"
              checked={Boolean(wizardData.isDriverPosition)}
              onChange={(e) => updateStepData('isDriverPosition', e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-(--primary)"
            />
            <span className="space-y-1">
              <span className="block text-sm font-medium text-text-primary">
                {t('positionWizard.steps.classification.driverPositionLabel')}
              </span>
              <span className="block text-xs text-text-muted">
                {t('positionWizard.steps.classification.driverPositionDescription')}
              </span>
            </span>
          </label>
        </div>
      ),
    },
    {
      id: 'compensation',
      title: t('positionWizard.steps.compensation.title'),
      description: t('positionWizard.steps.compensation.description'),
      icon: <Wallet className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <TextInputStep
              stepData={wizardData}
              updateStepData={updateStepData}
              field="salaryMin"
              label={t('positionWizard.steps.compensation.salaryMinLabel')}
              placeholder={t('positionWizard.steps.compensation.salaryMinPlaceholder')}
              type="number"
            />
            <TextInputStep
              stepData={wizardData}
              updateStepData={updateStepData}
              field="salaryMax"
              label={t('positionWizard.steps.compensation.salaryMaxLabel')}
              placeholder={t('positionWizard.steps.compensation.salaryMaxPlaceholder')}
              type="number"
            />
          </div>
        </div>
      ),
    },
    {
      id: 'review',
      title: t('positionWizard.steps.review.title'),
      description: t('positionWizard.steps.review.description'),
      icon: <CheckCircle className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-background-subtle p-4">
            <h4 className="text-sm font-medium text-text-muted mb-3">
              {t('positionWizard.steps.review.summaryLabel')}
            </h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">
                  {t('positionWizard.steps.review.titleLabel')}
                </span>
                <span className="font-medium text-text-primary">
                  {String(wizardData.title || '-')}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">
                  {t('positionWizard.steps.review.descriptionLabel')}
                </span>
                <span className="font-medium text-text-primary text-right max-w-[200px] truncate">
                  {String(wizardData.description || '-')}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">
                  {t('positionWizard.steps.review.departmentLabel')}
                </span>
                <span className="font-medium text-text-primary">
                  {(() => {
                    const dept = departments?.find((d) => d._id === wizardData.departmentId);
                    return dept?.name || t('positionWizard.steps.review.notSpecified');
                  })()}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">
                  {t('positionWizard.steps.review.levelLabel')}
                </span>
                <span className="font-medium text-text-primary">
                  {String(wizardData.level || t('positionWizard.steps.review.notSpecified'))}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">
                  {t('positionWizard.steps.review.salaryRangeLabel')}
                </span>
                <span className="font-medium text-text-primary">
                  {wizardData.salaryMin && wizardData.salaryMax
                    ? `$${Number(wizardData.salaryMin).toLocaleString()} - $${Number(wizardData.salaryMax).toLocaleString()}`
                    : t('positionWizard.steps.review.notSpecified')}
                </span>
              </div>
              {Boolean(wizardData.isDriverPosition) && (
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">
                    {t('positionWizard.steps.review.driverPositionLabel')}
                  </span>
                  <span className="font-medium text-text-primary">{t('common.yes')}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      ),
    },
  ];

  const handleSubmit = async () => {
    // Only creating needs an organization; `update` is keyed by the position id.
    // Guarding both used to strand superadmins browsing in "all orgs" mode, where
    // `selectedOrgId` is null: the list still rendered, but saving an edit
    // returned here silently — no mutation, no toast, no clue.
    if (!editingPosition && !selectedOrgId) {
      toast.error(t('positionWizard.toast.noOrganization'));
      return;
    }
    setIsSubmitting(true);
    try {
      const salaryMin = wizardData.salaryMin ? Number(wizardData.salaryMin) : undefined;
      const salaryMax = wizardData.salaryMax ? Number(wizardData.salaryMax) : undefined;

      if (salaryMin && salaryMax && salaryMax <= salaryMin) {
        toast.error(t('positionWizard.toast.salaryInvalid'));
        return;
      }

      if (editingPosition) {
        await updatePosition({
          id: editingPosition._id as Id<'positions'>,
          title: String(wizardData.title).trim(),
          description: wizardData.description ? String(wizardData.description) : undefined,
          level: wizardData.level ? String(wizardData.level) : undefined,
          salaryMin,
          salaryMax,
          isDriverPosition: Boolean(wizardData.isDriverPosition),
          departmentId: wizardData.departmentId
            ? (wizardData.departmentId as Id<'departments'>)
            : undefined,
        });
        toast.success(t('positionWizard.toast.updateSuccess'));
      } else {
        await createPosition({
          organizationId: selectedOrgId as Id<'organizations'>,
          title: String(wizardData.title).trim(),
          description: wizardData.description ? String(wizardData.description) : undefined,
          level: wizardData.level ? String(wizardData.level) : undefined,
          salaryMin,
          salaryMax,
          isDriverPosition: Boolean(wizardData.isDriverPosition),
          departmentId: wizardData.departmentId
            ? (wizardData.departmentId as Id<'departments'>)
            : undefined,
        });
        toast.success(t('positionWizard.toast.createSuccess'));
      }
      onComplete();
    } catch (_error) {
      toast.error(t('positionWizard.toast.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg" closeLabel={t('common.close', 'Close')}>
        <SheetHeader>
          <SheetTitle>
            {editingPosition
              ? t('positionWizard.update', 'Update Position')
              : t('positionWizard.submit', 'Create Position')}
          </SheetTitle>
          <SheetDescription>
            {editingPosition
              ? t('positionWizard.steps.review.description')
              : t('positionWizard.steps.details.description')}
          </SheetDescription>
        </SheetHeader>
        <Wizard
          key={editingId ?? 'new'}
          className="min-h-0 flex-1 px-5 pt-4"
          steps={steps}
          onComplete={handleSubmit}
          onCancel={() => onOpenChange(false)}
          submitLabel={
            editingPosition
              ? t('positionWizard.update', 'Update Position')
              : t('positionWizard.submit', 'Create Position')
          }
          cancelLabel={t('actions.cancel', 'Cancel')}
          showStepper
          defaultStepData={wizardData}
          draftKey={editingPosition ? undefined : 'create-position'}
        />
      </SheetContent>
    </Sheet>
  );
}

export default function PositionsClient() {
  const { t } = useTranslation();
  const router = useRouter();
  const _isMobile = useMediaQuery('(max-width: 768px)');

  const { user, isAuthenticated } = useAuthStore(
    useShallow((state) => ({
      user: state.user,
      isAuthenticated: state.isAuthenticated,
    })),
  );

  const selectedOrgId = useSelectedOrganization();
  const isSuperadmin = user?.role === 'superadmin';

  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showWizard, setShowWizard] = useState(false);
  const positionDraft = useDraftResume('create-position', !showWizard);
  const [editingPosition, setEditingPosition] = useState<Doc<'positions'> | null>(null);

  const positions = useQuery(
    api.positions.list,
    selectedOrgId || isSuperadmin
      ? selectedOrgId
        ? { organizationId: selectedOrgId as Id<'organizations'> }
        : {}
      : 'skip',
  );

  const departments = useQuery(
    api.departments.list,
    selectedOrgId || isSuperadmin
      ? selectedOrgId
        ? { organizationId: selectedOrgId as Id<'organizations'> }
        : {}
      : 'skip',
  );

  const removePosition = useMutation(api.positions.remove);

  const isLoading = positions === undefined || departments === undefined;

  const filteredPositions = useMemo(() => {
    if (!positions) return [];
    if (!searchQuery.trim()) return positions;
    const query = searchQuery.toLowerCase();
    return positions.filter(
      (pos) =>
        pos.title.toLowerCase().includes(query) ||
        pos.description?.toLowerCase().includes(query) ||
        pos.level?.toLowerCase().includes(query),
    );
  }, [positions, searchQuery]);

  const stats = useMemo(() => {
    if (!positions) return { total: 0, totalEmployees: 0, avgSalary: 0 };
    const total = positions.length;
    const totalEmployees = positions.reduce((sum, p) => sum + (p.employeeCount || 0), 0);
    const avgSalary =
      total > 0
        ? positions.reduce((sum, p) => {
            const mid = ((p.salaryMin || 0) + (p.salaryMax || 0)) / 2;
            return sum + mid;
          }, 0) / total
        : 0;
    return { total, totalEmployees, avgSalary };
  }, [positions]);

  const handleDelete = async (id: Id<'positions'>) => {
    if (!confirm(t('common.confirmDelete'))) return;
    try {
      await removePosition({ id });
      toast.success(t('common.deleted'));
    } catch (_error) {
      toast.error(t('common.error'));
    }
  };

  const handleEdit = (pos: Doc<'positions'>) => {
    setEditingPosition(pos);
    setShowWizard(true);
  };

  const handleAddNew = () => {
    setEditingPosition(null);
    setShowWizard(true);
  };

  const handleWizardComplete = () => {
    setShowWizard(false);
    setEditingPosition(null);
  };

  const getDepartmentName = (deptId: string | undefined) => {
    if (!deptId || !departments) return '';
    const dept = departments.find((d) => d._id === deptId);
    return dept?.name || '';
  };

  const getDepartmentColor = (deptId: string | undefined) => {
    if (!deptId || !departments) return '#6B7280';
    const dept = departments.find((d) => d._id === deptId);
    return dept?.color || '#6B7280';
  };

  if (!isAuthenticated) {
    return <ShieldLoader message={t('auth.loginRequired')} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-(--text-primary)">
                {t('nav.employees.positions')}
              </h2>
              <p className="text-(--text-muted) text-sm mt-1">
                {stats.total} {t('nav.employees.positions').toLowerCase()} · {stats.totalEmployees}{' '}
                {t('nav.employees.all').toLowerCase()}
              </p>
            </div>
            {user?.role !== 'employee' && (
              <Button onClick={handleAddNew} className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                {t('common.add')}
              </Button>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        {isLoading ? (
          <SkeletonTable rows={3} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-text-muted">
                  {t('nav.employees.positions')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-text-muted">
                  {t('nav.employees.all')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalEmployees}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-text-muted">
                  {t('nav.groups.finance')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${Math.round(stats.avgSalary / 1000)}k</div>
                <p className="text-xs text-text-muted mt-1">{t('nav.reports')}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Search and View Toggle */}
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              placeholder={t('common.search')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-border bg-background text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex items-center gap-1 p-1 rounded-lg border border-border bg-background">
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                'p-2 rounded-md transition-colors',
                viewMode === 'grid'
                  ? 'bg-primary/10 text-primary'
                  : 'text-text-muted hover:text-text-primary',
              )}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'p-2 rounded-md transition-colors',
                viewMode === 'list'
                  ? 'bg-primary/10 text-primary'
                  : 'text-text-muted hover:text-text-primary',
              )}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Positions Grid/List */}
        {isLoading ? (
          <SkeletonTable rows={5} />
        ) : (
          <AnimatePresence mode="wait">
            {viewMode === 'grid' ? (
              <motion.div
                key="grid"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              >
                {filteredPositions.map((pos) => {
                  const deptColor = getDepartmentColor(pos.departmentId);
                  return (
                    <Card
                      key={pos._id}
                      className="cursor-pointer hover:shadow-md transition-shadow group"
                      onClick={() => router.push(`/employees/positions/${pos._id}`)}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-10 h-10 rounded-lg flex items-center justify-center"
                            style={{ backgroundColor: `${deptColor}20` }}
                          >
                            <Briefcase className="w-5 h-5" style={{ color: deptColor }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-sm font-medium truncate">
                              {pos.title}
                            </CardTitle>
                            <p className="text-xs text-text-muted">
                              {getDepartmentName(pos.departmentId)}
                            </p>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-text-muted">{t('nav.employees.all')}</span>
                            <span className="font-medium text-text-primary">
                              {pos.employeeCount || 0}
                            </span>
                          </div>
                          {pos.level && (
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-text-muted">{t('nav.groups.performance')}</span>
                              <span className="font-medium text-text-primary">{pos.level}</span>
                            </div>
                          )}
                          {pos.salaryMin && pos.salaryMax && (
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-text-muted">{t('nav.groups.finance')}</span>
                              <span className="font-medium text-text-primary">
                                ${(pos.salaryMin / 1000).toFixed(0)}k - $
                                {(pos.salaryMax / 1000).toFixed(0)}k
                              </span>
                            </div>
                          )}
                          <div className="flex items-center justify-end gap-1 pt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {user?.role !== 'employee' && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEdit(pos);
                                  }}
                                  className="p-1 rounded hover:bg-primary/10 text-text-muted hover:text-primary"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(pos._id as Id<'positions'>);
                                  }}
                                  className="p-1 rounded hover:bg-(--danger-quiet) text-text-muted hover:text-(--danger-text)"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </motion.div>
            ) : (
              <motion.div
                key="list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-2"
              >
                {filteredPositions.map((pos) => {
                  const deptColor = getDepartmentColor(pos.departmentId);
                  return (
                    <Card
                      key={pos._id}
                      className="cursor-pointer hover:shadow-md transition-shadow group"
                      onClick={() => router.push(`/employees/positions/${pos._id}`)}
                    >
                      <CardContent className="flex items-center gap-4 py-4">
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                          style={{ backgroundColor: `${deptColor}20` }}
                        >
                          <Briefcase className="w-5 h-5" style={{ color: deptColor }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-text-primary truncate">
                            {pos.title}
                          </p>
                          <p className="text-xs text-text-muted">
                            {getDepartmentName(pos.departmentId)}
                            {pos.level && ` · ${pos.level}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-text-muted shrink-0">
                          <div className="flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" />
                            <span>{pos.employeeCount || 0}</span>
                          </div>
                          {pos.salaryMin && pos.salaryMax && (
                            <div className="flex items-center gap-1">
                              <DollarSign className="w-3 h-3" />
                              <span>${(pos.salaryMin / 1000).toFixed(0)}k</span>
                            </div>
                          )}
                          {user?.role !== 'employee' && (
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEdit(pos);
                                }}
                                className="p-1 rounded hover:bg-primary/10 text-text-muted hover:text-primary"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(pos._id as Id<'positions'>);
                                }}
                                className="p-1 rounded hover:bg-(--danger-quiet) text-text-muted hover:text-(--danger-text)"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {filteredPositions.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Briefcase className="w-12 h-12 text-text-muted mb-4" />
            <h3 className="text-lg font-medium text-text-primary">{t('common.noResults')}</h3>
            <p className="text-sm text-text-muted mt-1">{t('nav.employees.positions')}</p>
          </div>
        )}

        {/* Position Wizard Dialog */}
        <PositionWizard
          open={showWizard}
          onOpenChange={setShowWizard}
          editingPosition={editingPosition}
          departments={departments}
          onComplete={handleWizardComplete}
        />

        {/* "Draft saved. Restore?" — the position wizard keeps its contents
            after an accidental close; this is what tells the user so. */}
        <DraftResumeBar
          show={positionDraft.available}
          label={t('positionWizard.title', 'New Position')}
          step={positionDraft.step}
          onResume={() => {
            positionDraft.dismiss();
            setShowWizard(true);
          }}
          onDismiss={positionDraft.dismiss}
          onDiscard={positionDraft.discard}
        />
      </div>
    </div>
  );
}
