'use client';

import React, { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  Briefcase,
  Users,
  Edit2,
  Trash2,
  Search,
  LayoutGrid,
  List,
  TrendingUp,
  Building2,
  AlertCircle,
  User,
  ChevronRight,
  CheckCircle,
  BarChart3,
  Wallet,
} from 'lucide-react';
import { useShallow } from 'zustand/shallow';
import { useAuthStore } from '@/store/useAuthStore';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { toast } from 'sonner';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { SkeletonTable } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import Link from 'next/link';

const POSITION_LEVELS = [
  {
    value: 'Entry',
    label: 'Entry Level',
    description: '0-2 years experience',
    color: 'bg-green-500/10 text-green-600',
  },
  {
    value: 'Mid',
    label: 'Mid Level',
    description: '2-5 years experience',
    color: 'bg-blue-500/10 text-blue-600',
  },
  {
    value: 'Senior',
    label: 'Senior Level',
    description: '5-8 years experience',
    color: 'bg-purple-500/10 text-purple-600',
  },
  {
    value: 'Lead',
    label: 'Lead',
    description: '8+ years experience',
    color: 'bg-amber-500/10 text-amber-600',
  },
  {
    value: 'Manager',
    label: 'Manager',
    description: 'Team management role',
    color: 'bg-red-500/10 text-red-600',
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
  editingPosition: any | null;
  departments: any[] | undefined;
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
  const [wizardData, setWizardData] = useState<Record<string, string | number | boolean | null>>(
    editingPosition
      ? {
          title: editingPosition.title,
          description: editingPosition.description || '',
          departmentId: editingPosition.departmentId || '',
          level: editingPosition.level || '',
          salaryMin: editingPosition.salaryMin?.toString() || '',
          salaryMax: editingPosition.salaryMax?.toString() || '',
        }
      : { title: '', description: '', departmentId: '', level: '', salaryMin: '', salaryMax: '' },
  );
  const [_isSubmitting, setIsSubmitting] = useState(false);

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle>
            {editingPosition
              ? t('positionWizard.update', 'Update Position')
              : t('positionWizard.submit', 'Create Position')}
          </DialogTitle>
          <DialogDescription>
            {editingPosition
              ? t('positionWizard.steps.review.description')
              : t('positionWizard.steps.details.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
          <Wizard
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
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function PositionDetailClient() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams();
  const positionId = params.id as string;
  const _isMobile = useMediaQuery('(max-width: 768px)');

  const { user, isAuthenticated } = useAuthStore(
    useShallow((state) => ({
      user: state.user,
      isAuthenticated: state.isAuthenticated,
    })),
  );

  const selectedOrgId = useSelectedOrganization();

  const position = useQuery(
    api.positions.getById,
    positionId ? { id: positionId as Id<'positions'> } : 'skip',
  );

  const employees = useQuery(api.users.listAll);

  const departments = useQuery(
    api.departments.list,
    selectedOrgId ? { organizationId: selectedOrgId as Id<'organizations'> } : 'skip',
  );

  const removePosition = useMutation(api.positions.remove);

  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showWizard, setShowWizard] = useState(false);
  const [editingPosition, setEditingPosition] = useState<any | null>(null);

  const isLoading = position === undefined || employees === undefined || departments === undefined;

  const positionEmployees = useMemo(() => {
    if (!employees || !position) return [];
    return employees.filter((emp) => emp.positionId === position._id && emp.isActive);
  }, [employees, position]);

  const filteredEmployees = useMemo(() => {
    if (!positionEmployees) return [];
    if (!searchQuery.trim()) return positionEmployees;
    const query = searchQuery.toLowerCase();
    return positionEmployees.filter(
      (emp) => emp.name?.toLowerCase().includes(query) || emp.email?.toLowerCase().includes(query),
    );
  }, [positionEmployees, searchQuery]);

  const department = useMemo(() => {
    if (!position?.departmentId || !departments) return null;
    return departments.find((d) => d._id === position.departmentId) || null;
  }, [position, departments]);

  const handleDelete = async () => {
    if (!position) return;
    if (!confirm(t('common.confirmDelete'))) return;
    try {
      await removePosition({ id: position._id as Id<'positions'> });
      toast.success(t('common.deleted'));
      router.push('/employees/positions');
    } catch (_error) {
      toast.error(t('common.error'));
    }
  };

  const handleEdit = () => {
    if (!position) return;
    setEditingPosition(position);
    setShowWizard(true);
  };

  const handleWizardComplete = () => {
    setShowWizard(false);
    setEditingPosition(null);
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

  if (!position) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        <Link href="/employees/positions">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('nav.employees.positions')}
          </Button>
        </Link>
        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-orange-500 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-text-primary mb-1">
              {t('common.noResults')}
            </h3>
            <p className="text-sm text-text-muted">{t('positionWizard.toast.error')}</p>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  const levelColors: Record<string, string> = {
    Entry: 'bg-green-500/10 text-green-600',
    Mid: 'bg-blue-500/10 text-blue-600',
    Senior: 'bg-purple-500/10 text-purple-600',
    Lead: 'bg-amber-500/10 text-amber-600',
    Manager: 'bg-red-500/10 text-red-600',
    Director: 'bg-orange-500/10 text-orange-600',
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <Link href="/employees/positions">
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
                style={{ backgroundColor: `${department?.color || '#6B7280'}20` }}
              >
                <Briefcase className="w-7 h-7" style={{ color: department?.color || '#6B7280' }} />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-text-primary">{position.title}</h1>
                  {position.level && (
                    <Badge
                      className={cn(
                        'text-xs',
                        levelColors[position.level] || 'bg-gray-500/10 text-gray-600',
                      )}
                    >
                      {position.level}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-text-muted mt-1">
                  {position.description || t('common.noResults')}
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
              <div className="text-2xl font-bold">{positionEmployees.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-text-muted">
                {t('nav.employees.departments')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{department?.name || t('common.none')}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-text-muted">
                {t('nav.groups.performance')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{position.level || t('common.none')}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-text-muted">
                {t('nav.groups.finance')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {position.salaryMin && position.salaryMax
                  ? `$${(position.salaryMin / 1000).toFixed(0)}k - $${(position.salaryMax / 1000).toFixed(0)}k`
                  : t('common.none')}
              </div>
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
                          <p className="text-xs text-text-muted">{emp.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-text-muted">
                        <span>{emp.role}</span>
                        <ChevronRight className="w-4 h-4" />
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
                        <p className="text-xs text-text-muted">{emp.email}</p>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-text-muted shrink-0">
                        <Badge
                          className={cn(
                            'text-xs',
                            levelColors[position.level ?? ''] || 'bg-gray-500/10 text-gray-600',
                          )}
                        >
                          {position.level || position.title}
                        </Badge>
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

        {/* Position Wizard Dialog */}
        <PositionWizard
          open={showWizard}
          onOpenChange={setShowWizard}
          editingPosition={editingPosition}
          departments={departments}
          onComplete={handleWizardComplete}
        />
      </div>
    </div>
  );
}
