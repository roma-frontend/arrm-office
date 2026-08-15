'use client';

import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id, Doc } from '../../../convex/_generated/dataModel';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import { cn } from '@/lib/utils';
import {
  Plus,
  Search,
  Users,
  Building2,
  Edit2,
  Trash2,
  LayoutGrid,
  List,
  Palette,
  CheckCircle,
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
import { useDraftResume } from '@/hooks/useDraftResume';
import { DraftResumeBar } from '@/components/ui/DraftResumeBar';
import {
  TextInputStep,
  TextareaStep,
  CardSelectionStep,
} from '@/components/ui/wizard-step-components';
const DEPARTMENT_COLORS = [
  { value: '#3B82F6', label: 'Blue', color: 'bg-(--brand-quiet) text-(--brand-text)' },
  { value: '#10B981', label: 'Green', color: 'bg-(--success-quiet) text-(--success-text)' },
  { value: '#F59E0B', label: 'Amber', color: 'bg-(--warning-quiet) text-(--warning-text)' },
  { value: '#EF4444', label: 'Red', color: 'bg-(--danger-quiet) text-(--danger-text)' },
  { value: '#8B5CF6', label: 'Purple', color: 'bg-(--purple-quiet) text-(--purple-text)' },
  { value: '#EC4899', label: 'Pink', color: 'bg-(--pink-quiet) text-(--pink-text)' },
  { value: '#06B6D4', label: 'Cyan', color: 'bg-(--cyan-quiet) text-(--cyan-text)' },
  { value: '#F97316', label: 'Orange', color: 'bg-(--warning-quiet) text-(--warning-text)' },
];

interface DepartmentWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingDepartment: Doc<'departments'> | null;
  onComplete: () => void;
}

function DepartmentWizard({
  open,
  onOpenChange,
  editingDepartment,
  onComplete,
}: DepartmentWizardProps) {
  const { t } = useTranslation();
  const selectedOrgId = useSelectedOrganization();
  const createDepartment = useMutation(api.departments.create);
  const updateDepartment = useMutation(api.departments.update);
  const buildInitialData = React.useCallback(
    (dept: Doc<'departments'> | null): Record<string, string | number | boolean | null> =>
      dept
        ? {
            name: dept.name,
            description: dept.description || '',
            color: dept.color || 'var(--brand)',
          }
        : { name: '', description: '', color: '#3B82F6' },
    [],
  );

  const [wizardData, setWizardData] = useState<Record<string, string | number | boolean | null>>(
    () => buildInitialData(editingDepartment),
  );
  const [_isSubmitting, setIsSubmitting] = useState(false);

  // Диалог остаётся смонтированным между открытиями, поэтому начальные данные
  // нужно пересобирать при каждом открытии / смене редактируемого отдела —
  // иначе форма редактирования открывается пустой.
  const editingId = editingDepartment?._id ?? null;
  React.useEffect(() => {
    if (!open) return;
    setWizardData(buildInitialData(editingDepartment));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingId, buildInitialData]);

  const updateStepData = (key: string, value: string | number | boolean | null) => {
    setWizardData((prev) => ({ ...prev, [key]: value }));
  };

  const steps: WizardStep[] = [
    {
      id: 'details',
      title: t('departmentWizard.steps.details.title'),
      description: t('departmentWizard.steps.details.description'),
      icon: <Building2 className="w-5 h-5" />,
      content: (
        <>
          <TextInputStep
            stepData={wizardData}
            updateStepData={updateStepData}
            field="name"
            label={t('departmentWizard.steps.details.nameLabel')}
            placeholder={t('departmentWizard.steps.details.namePlaceholder')}
            required
          />
          <TextareaStep
            stepData={wizardData}
            updateStepData={updateStepData}
            field="description"
            label={t('departmentWizard.steps.details.descriptionLabel')}
            placeholder={t('departmentWizard.steps.details.descriptionPlaceholder')}
            rows={3}
          />
        </>
      ),
      validation: (data) => {
        return typeof data.name === 'string' && data.name.trim().length > 0;
      },
    },
    {
      id: 'appearance',
      title: t('departmentWizard.steps.appearance.title'),
      description: t('departmentWizard.steps.appearance.description'),
      icon: <Palette className="w-5 h-5" />,
      content: (
        <CardSelectionStep
          stepData={wizardData}
          updateStepData={updateStepData}
          field="color"
          label={t('departmentWizard.steps.appearance.colorLabel')}
          options={DEPARTMENT_COLORS.map((c) => ({
            value: c.value,
            title: c.label,
            description: t('departmentWizard.steps.appearance.colorDescription'),
            icon: <div className="w-6 h-6 rounded-full" style={{ backgroundColor: c.value }} />,
            color: c.color,
          }))}
          columns={4}
        />
      ),
    },
    {
      id: 'review',
      title: t('departmentWizard.steps.review.title'),
      description: t('departmentWizard.steps.review.description'),
      icon: <CheckCircle className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-background-subtle p-4">
            <h4 className="text-sm font-medium text-text-muted mb-3">
              {t('departmentWizard.steps.review.summaryLabel')}
            </h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">
                  {t('departmentWizard.steps.review.nameLabel')}
                </span>
                <span className="font-medium text-text-primary">
                  {String(wizardData.name || '-')}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">
                  {t('departmentWizard.steps.review.descriptionLabel')}
                </span>
                <span className="font-medium text-text-primary text-right max-w-[200px] truncate">
                  {String(wizardData.description || '-')}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">
                  {t('departmentWizard.steps.review.colorLabel')}
                </span>
                <span className="flex items-center gap-2">
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: String(wizardData.color || 'var(--brand)') }}
                  />
                  <span className="font-medium text-text-primary">
                    {String(wizardData.color || 'var(--brand)')}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
      ),
    },
  ];

  const handleSubmit = async () => {
    if (!selectedOrgId) return;
    setIsSubmitting(true);
    try {
      if (editingDepartment) {
        await updateDepartment({
          id: editingDepartment._id as Id<'departments'>,
          name: String(wizardData.name).trim(),
          description: wizardData.description ? String(wizardData.description) : undefined,
          color: String(wizardData.color),
        });
        toast.success(t('departmentWizard.toast.updateSuccess'));
      } else {
        await createDepartment({
          organizationId: selectedOrgId as Id<'organizations'>,
          name: String(wizardData.name).trim(),
          description: wizardData.description ? String(wizardData.description) : undefined,
          color: String(wizardData.color),
        });
        toast.success(t('departmentWizard.toast.createSuccess'));
      }
      onComplete();
    } catch (_error) {
      toast.error(t('departmentWizard.toast.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg" closeLabel={t('common.close', 'Close')}>
        <SheetHeader>
          <SheetTitle>
            {editingDepartment
              ? t('departmentWizard.update', 'Update Department')
              : t('departmentWizard.submit', 'Create Department')}
          </SheetTitle>
          <SheetDescription>
            {editingDepartment
              ? t('departmentWizard.steps.review.description')
              : t('departmentWizard.steps.details.description')}
          </SheetDescription>
        </SheetHeader>
        <Wizard
          key={editingId ?? 'new'}
          className="min-h-0 flex-1 px-5 pt-4"
          steps={steps}
          onComplete={handleSubmit}
          onCancel={() => onOpenChange(false)}
          submitLabel={
            editingDepartment
              ? t('departmentWizard.update', 'Update Department')
              : t('departmentWizard.submit', 'Create Department')
          }
          cancelLabel={t('actions.cancel', 'Cancel')}
          showStepper
          defaultStepData={wizardData}
          draftKey={editingDepartment ? undefined : 'create-department'}
        />
      </SheetContent>
    </Sheet>
  );
}

export default function DepartmentsClient() {
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
  const departmentDraft = useDraftResume('create-department', !showWizard);
  const [editingDepartment, setEditingDepartment] = useState<Doc<'departments'> | null>(null);

  const departments = useQuery(
    api.departments.list,
    selectedOrgId || isSuperadmin
      ? selectedOrgId
        ? { organizationId: selectedOrgId as Id<'organizations'> }
        : {}
      : 'skip',
  );

  const removeDepartment = useMutation(api.departments.remove);

  const isLoading = departments === undefined;

  const filteredDepartments = useMemo(() => {
    if (!departments) return [];
    if (!searchQuery.trim()) return departments;
    const query = searchQuery.toLowerCase();
    return departments.filter(
      (dept) =>
        dept.name.toLowerCase().includes(query) || dept.description?.toLowerCase().includes(query),
    );
  }, [departments, searchQuery]);

  const stats = useMemo(() => {
    if (!departments) return { total: 0, avgEmployees: 0, largest: null };
    const total = departments.length;
    const avgEmployees =
      total > 0
        ? Math.round(departments.reduce((sum, d) => sum + (d.employeeCount || 0), 0) / total)
        : 0;
    const largest =
      total > 0
        ? departments.reduce(
            (max, d) => ((d.employeeCount || 0) > (max?.employeeCount || 0) ? d : max),
            departments[0]!,
          )
        : null;
    return { total, avgEmployees, largest };
  }, [departments]);

  const handleDelete = async (id: Id<'departments'>) => {
    if (!confirm(t('common.confirmDelete'))) return;
    try {
      await removeDepartment({ id });
      toast.success(t('common.deleted'));
    } catch (_error) {
      toast.error(t('common.error'));
    }
  };

  const handleEdit = (dept: Doc<'departments'>) => {
    setEditingDepartment(dept);
    setShowWizard(true);
  };

  const handleAddNew = () => {
    setEditingDepartment(null);
    setShowWizard(true);
  };

  const handleWizardComplete = () => {
    setShowWizard(false);
    setEditingDepartment(null);
  };

  if (!isAuthenticated) {
    return <ShieldLoader message={t('auth.loginRequired')} />;
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-(--text-primary)">
                {t('nav.employees.departments')}
              </h2>
              <p className="text-(--text-muted) text-sm mt-1">
                {stats.total} {t('nav.employees.departments').toLowerCase()}
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
                  {t('nav.groups.people')}
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
                <div className="text-2xl font-bold">{stats.avgEmployees}</div>
                <p className="text-xs text-text-muted mt-1">{t('nav.employees.departments')} avg</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-text-muted">
                  {t('nav.reports')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.largest?.employeeCount ?? 0}</div>
                <p className="text-xs text-text-muted mt-1">{stats.largest?.name ?? '-'}</p>
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

        {/* Departments Grid/List */}
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
                {filteredDepartments.map((dept) => (
                  <Card
                    key={dept._id}
                    className="cursor-pointer hover:shadow-md transition-shadow group"
                    onClick={() => router.push(`/employees/departments/${dept._id}`)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: `${dept.color || 'var(--brand)'}20` }}
                        >
                          <Building2
                            className="w-5 h-5"
                            style={{ color: dept.color || 'var(--brand)' }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-sm font-medium truncate">
                            {dept.name}
                          </CardTitle>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-text-muted line-clamp-2 mb-3">
                        {dept.description}
                      </p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 text-xs text-text-muted">
                          <Users className="w-3 h-3" />
                          <span>
                            {dept.employeeCount} {t('nav.employees.all').toLowerCase()}
                          </span>
                        </div>
                        {user?.role !== 'employee' && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(dept);
                              }}
                              className="p-1 rounded hover:bg-primary/10 text-text-muted hover:text-primary"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(dept._id as Id<'departments'>);
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
                ))}
              </motion.div>
            ) : (
              <motion.div
                key="list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-2"
              >
                {filteredDepartments.map((dept) => (
                  <Card
                    key={dept._id}
                    className="cursor-pointer hover:shadow-md transition-shadow group"
                    onClick={() => router.push(`/employees/departments/${dept._id}`)}
                  >
                    <CardContent className="flex items-center gap-4 py-4">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${dept.color || 'var(--brand)'}20` }}
                      >
                        <Building2
                          className="w-5 h-5"
                          style={{ color: dept.color || 'var(--brand)' }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">
                          {dept.name}
                        </p>
                        <p className="text-xs text-text-muted truncate">{dept.description}</p>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-text-muted shrink-0">
                        <Users className="w-3 h-3" />
                        <span>{dept.employeeCount}</span>
                      </div>
                      {user?.role !== 'employee' && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit(dept);
                            }}
                            className="p-1 rounded hover:bg-primary/10 text-text-muted hover:text-primary"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(dept._id as Id<'departments'>);
                            }}
                            className="p-1 rounded hover:bg-(--danger-quiet) text-text-muted hover:text-(--danger-text)"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {filteredDepartments.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Building2 className="w-12 h-12 text-text-muted mb-4" />
            <h3 className="text-lg font-medium text-text-primary">{t('common.noResults')}</h3>
            <p className="text-sm text-text-muted mt-1">{t('nav.employees.departments')}</p>
          </div>
        )}

        {/* Department Wizard Dialog */}
        <DepartmentWizard
          open={showWizard}
          onOpenChange={setShowWizard}
          editingDepartment={editingDepartment}
          onComplete={handleWizardComplete}
        />

        {/* "Draft saved. Restore?" — the department wizard keeps its contents
            after an accidental close; this is what tells the user so. */}
        <DraftResumeBar
          show={departmentDraft.available}
          label={t('departmentWizard.title', 'New Department')}
          step={departmentDraft.step}
          onResume={() => {
            departmentDraft.dismiss();
            setShowWizard(true);
          }}
          onDismiss={departmentDraft.dismiss}
          onDiscard={departmentDraft.discard}
        />
      </div>
    </div>
  );
}
