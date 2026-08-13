'use client';

import React, { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Doc, Id } from '@/convex/_generated/dataModel';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  Building2,
  Users,
  Edit2,
  Trash2,
  Search,
  LayoutGrid,
  List,
  Mail,
  Phone,
  MapPin,
  User,
  AlertCircle,
  ChevronRight,
  Palette,
  CheckCircle,
} from 'lucide-react';
import { useShallow } from 'zustand/shallow';
import { useAuthStore } from '@/store/useAuthStore';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { toast } from 'sonner';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { SkeletonTable } from '@/components/ui/skeleton';
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
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import Link from 'next/link';

const DEPARTMENT_COLORS = [
  { value: '#3B82F6', label: 'Blue', color: 'bg-blue-500/10 text-blue-600' },
  { value: '#10B981', label: 'Green', color: 'bg-green-500/10 text-green-600' },
  { value: '#F59E0B', label: 'Amber', color: 'bg-amber-500/10 text-amber-600' },
  { value: '#EF4444', label: 'Red', color: 'bg-red-500/10 text-red-600' },
  { value: '#8B5CF6', label: 'Purple', color: 'bg-purple-500/10 text-purple-600' },
  { value: '#EC4899', label: 'Pink', color: 'bg-pink-500/10 text-pink-600' },
  { value: '#06B6D4', label: 'Cyan', color: 'bg-cyan-500/10 text-cyan-600' },
  { value: '#F97316', label: 'Orange', color: 'bg-orange-500/10 text-orange-600' },
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
  const [wizardData, setWizardData] = useState<Record<string, string | number | boolean | null>>(
    editingDepartment
      ? {
          name: editingDepartment.name,
          description: editingDepartment.description || '',
          color: editingDepartment.color || '#3B82F6',
        }
      : { name: '', description: '', color: '#3B82F6' },
  );
  const [_isSubmitting, setIsSubmitting] = useState(false);

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
                    style={{ backgroundColor: String(wizardData.color || '#3B82F6') }}
                  />
                  <span className="font-medium text-text-primary">
                    {String(wizardData.color || '#3B82F6')}
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

export default function DepartmentDetailClient() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams();
  const departmentId = params.id as string;
  const _isMobile = useMediaQuery('(max-width: 768px)');

  const { user, isAuthenticated } = useAuthStore(
    useShallow((state) => ({
      user: state.user,
      isAuthenticated: state.isAuthenticated,
    })),
  );

  const selectedOrgId = useSelectedOrganization();

  const department = useQuery(
    api.departments.getById,
    departmentId ? { id: departmentId as Id<'departments'> } : 'skip',
  );

  const employees = useQuery(
    api.users.queries.getUsersByDepartment,
    departmentId ? { departmentId: departmentId as Id<'departments'> } : 'skip',
  );

  const positions = useQuery(
    api.positions.list,
    selectedOrgId ? { organizationId: selectedOrgId as Id<'organizations'> } : 'skip',
  );

  const removeDepartment = useMutation(api.departments.remove);

  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showWizard, setShowWizard] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Doc<'departments'> | null>(null);

  const isLoading = department === undefined || employees === undefined;

  const filteredEmployees = useMemo(() => {
    if (!employees) return [];
    if (!searchQuery.trim()) return employees;
    const query = searchQuery.toLowerCase();
    return employees.filter(
      (emp) =>
        emp.name?.toLowerCase().includes(query) ||
        emp.email?.toLowerCase().includes(query) ||
        emp.position?.toLowerCase().includes(query),
    );
  }, [employees, searchQuery]);

  const departmentPositions = useMemo(() => {
    if (!positions || !department) return [];
    return positions.filter((p) => p.departmentId === department._id);
  }, [positions, department]);

  const handleDelete = async () => {
    if (!department) return;
    if (!confirm(t('common.confirmDelete'))) return;
    try {
      await removeDepartment({ id: department._id as Id<'departments'> });
      toast.success(t('common.deleted'));
      router.push('/employees/departments');
    } catch (_error) {
      toast.error(t('common.error'));
    }
  };

  const handleEdit = () => {
    if (!department) return;
    setEditingDepartment(department);
    setShowWizard(true);
  };

  const handleWizardComplete = () => {
    setShowWizard(false);
    setEditingDepartment(null);
  };

  if (!isAuthenticated) {
    return <ShieldLoader message={t('auth.loginRequired')} />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <SkeletonTable rows={8} />
        </div>
      </div>
    );
  }

  if (!department) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        <Link href="/employees/departments">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('nav.employees.departments')}
          </Button>
        </Link>
        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-orange-500 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-text-primary mb-1">
              {t('common.noResults')}
            </h3>
            <p className="text-sm text-text-muted">{t('departmentWizard.toast.error')}</p>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <Link href="/employees/departments">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t('common.back')}
              </Button>
            </Link>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${department.color || '#3B82F6'}20` }}
              >
                <Building2 className="w-7 h-7" style={{ color: department.color || '#3B82F6' }} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-text-primary">{department.name}</h1>
                <p className="text-sm text-text-muted mt-1">
                  {department.description || t('common.noResults')}
                </p>
              </div>
            </div>
            {user?.role !== 'employee' && (
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={handleEdit} className="flex items-center gap-2">
                  <Edit2 className="w-4 h-4" />
                  {t('common.edit')}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDelete}
                  className="flex items-center gap-2 text-red-500 hover:text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                  {t('common.delete')}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-text-muted">
                {t('nav.employees.all')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{employees?.length || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-text-muted">
                {t('nav.employees.positions')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{departmentPositions.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-text-muted">
                {t('nav.groups.performance')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{'N/A'}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-text-muted">
                {t('nav.groups.finance')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${(0).toLocaleString()}</div>
            </CardContent>
          </Card>
        </div>

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

        {/* Employees Grid/List */}
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
                className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
              >
                {filteredEmployees.map((emp) => (
                  <Card
                    key={emp._id}
                    className="cursor-pointer hover:shadow-md transition-shadow group"
                    onClick={() => router.push(`/employees/${emp._id}`)}
                  >
                    <CardContent className="py-4">
                      <div className="flex items-center gap-3 mb-3">
                        <Avatar className="w-10 h-10">
                          <AvatarImage src={emp.avatarUrl} />
                          <AvatarFallback>
                            <User className="w-5 h-5" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-text-primary truncate">
                            {emp.name}
                          </p>
                          <p className="text-xs text-text-muted">
                            {emp.position || t('employees.noPosition')}
                          </p>
                        </div>
                      </div>
                      <div className="space-y-1">
                        {emp.email && (
                          <div className="flex items-center gap-2 text-xs text-text-muted">
                            <Mail className="w-3 h-3" />
                            <span className="truncate">{emp.email}</span>
                          </div>
                        )}
                        {emp.phone && (
                          <div className="flex items-center gap-2 text-xs text-text-muted">
                            <Phone className="w-3 h-3" />
                            <span>{emp.phone}</span>
                          </div>
                        )}
                        {emp.location && (
                          <div className="flex items-center gap-2 text-xs text-text-muted">
                            <MapPin className="w-3 h-3" />
                            <span className="truncate">{emp.location}</span>
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
                {filteredEmployees.map((emp) => (
                  <Card
                    key={emp._id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => router.push(`/employees/${emp._id}`)}
                  >
                    <CardContent className="flex items-center gap-4 py-4">
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={emp.avatarUrl} />
                        <AvatarFallback>
                          <User className="w-5 h-5" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">{emp.name}</p>
                        <p className="text-xs text-text-muted">
                          {emp.position || t('employees.noPosition')}
                        </p>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-text-muted shrink-0">
                        {emp.email && (
                          <div className="flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            <span className="truncate max-w-[150px]">{emp.email}</span>
                          </div>
                        )}
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {filteredEmployees.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="w-12 h-12 text-text-muted mb-4" />
            <h3 className="text-lg font-medium text-text-primary">{t('common.noResults')}</h3>
            <p className="text-sm text-text-muted mt-1">{t('nav.employees.all')}</p>
          </div>
        )}

        {/* Department Wizard Dialog */}
        <DepartmentWizard
          open={showWizard}
          onOpenChange={setShowWizard}
          editingDepartment={editingDepartment}
          onComplete={handleWizardComplete}
        />
      </div>
    </div>
  );
}
