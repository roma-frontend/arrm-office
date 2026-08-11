'use client';

import React, { useState, useEffect } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { resolveTravelAllowance } from '@/lib/travelAllowance';
import { formatCurrency } from '@/lib/types';
import {
  Save,
  User,
  Mail,
  Phone,
  Briefcase,
  Building2,
  Shield,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  CheckCircle,
  DollarSign,
  IdCard,
  CalendarDays,
} from 'lucide-react';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { toast } from 'sonner';
import { AvatarUpload } from '@/components/ui/avatar-upload';
import {
  PassportFields,
  EMPTY_PASSPORT,
  type PassportData,
  type PassportScanFile,
} from './PassportFields';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/useAuthStore';
import { useOrgUnits } from '@/hooks/useOrgUnits';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface Employee {
  _id: string;
  name: string;
  email: string;
  role: 'admin' | 'supervisor' | 'employee' | 'superadmin';
  employeeType: 'staff' | 'contractor';
  department?: string;
  departmentId?: string;
  position?: string;
  positionId?: string;
  phone?: string;
  avatarUrl?: string;
  supervisorId?: string;
  isActive: boolean;
  organizationId?: string;
  travelAllowance: number;
  /**
   * HR's per-employee deviation from the org travel-allowance policy. Absent
   * means this employee follows the policy — the edit dialog shows the field
   * empty and the placeholder tells the admin what the policy pays.
   */
  travelAllowanceOverride?: number;
  paidLeaveBalance: number;
  sickLeaveBalance: number;
  familyLeaveBalance: number;
  createdAt?: number;
}

interface EditEmployeeModalProps {
  employee: Employee;
  open: boolean;
  onClose: () => void;
}

const ADMIN_EMAIL = (process.env.NEXT_PUBLIC_BOOTSTRAP_SUPERADMIN_EMAIL ?? '').toLowerCase();

const ALL_ROLES_CONFIG = [
  { value: 'admin', icon: '👑', labelKey: 'roles.admin', descKey: 'editEmployee.fullAccess' },
  {
    value: 'supervisor',
    icon: '🎯',
    labelKey: 'roles.supervisor',
    descKey: 'editEmployee.manageTeam',
  },
  {
    value: 'employee',
    icon: '👤',
    labelKey: 'roles.employee',
    descKey: 'editEmployee.basicAccess',
  },
];

const TOTAL_STEPS = 5;

// Local YYYY-MM-DD (not UTC) so the date input matches what the profile shows
// and what gets written back on save — avoids a one-day shift for UTC+ timezones.
function toLocalDateString(timestamp: number): string {
  const d = new Date(timestamp);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

export function EditEmployeeModal({ employee, open, onClose }: EditEmployeeModalProps) {
  const { t, i18n } = useTranslation();
  const { user } = useAuthStore();

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState(employee.organizationId ?? '');

  const isSuperadmin = user?.role === 'superadmin';
  const targetOrgId = isSuperadmin ? selectedOrgId : (employee.organizationId ?? '');
  const supervisors = useQuery(
    api.users.queries.getSupervisors,
    user?.id && targetOrgId
      ? {
          organizationId: targetOrgId as Id<'organizations'>,
        }
      : 'skip',
  );
  const updateUser = useMutation(api.users.mutations.updateUser);
  const updateSalary = useMutation(api.employeeProfiles.updateSalary);
  const updatePassport = useMutation(api.employeeProfiles.updatePassport);
  const uploadEmployeeDocument = useMutation(api.employeeProfiles.uploadDocument);
  const currentSalary = useQuery(
    api.employeeProfiles.getSalary,
    open ? { userId: employee._id as Id<'users'> } : 'skip',
  );
  const employeeProfile = useQuery(
    api.employeeProfiles.getEmployeeProfile,
    open ? { userId: employee._id as Id<'users'> } : 'skip',
  );
  // Travel allowance is an organization policy (Payroll → Settings) that HR may
  // override for an individual employee. The policy amount is only needed to
  // tell the admin what leaving the field empty will pay.
  //
  // Supervisor-and-above only (convex/payroll/queries.ts): the modal is mounted
  // while closed on the employee profile page, so an employee viewing a
  // colleague must not fire an admin-only query and crash the render.
  const canReadPayrollSettings =
    isSuperadmin || user?.role === 'admin' || user?.role === 'supervisor';
  const salarySettings = useQuery(
    api.payroll.queries.getSalarySettings,
    open && canReadPayrollSettings && targetOrgId
      ? { organizationId: targetOrgId as Id<'organizations'> }
      : 'skip',
  );
  const [passport, setPassport] = useState<PassportData>(EMPTY_PASSPORT);
  const [passportScan, setPassportScan] = useState<PassportScanFile | null>(null);
  const organizations = useQuery(
    api.organizations.getAllOrganizations,
    user?.role === 'superadmin' ? {} : 'skip',
  );
  const [form, setForm] = useState({
    name: employee.name,
    role: employee.role,
    employeeType: employee.employeeType,
    departmentId: employee.departmentId ?? '',
    positionId: employee.positionId ?? '',
    phone: employee.phone ?? '',
    supervisorId: employee.supervisorId ?? '',
    isActive: employee.isActive,
    paidLeaveBalance: employee.paidLeaveBalance,
    sickLeaveBalance: employee.sickLeaveBalance,
    familyLeaveBalance: employee.familyLeaveBalance,
    registrationDate: employee.createdAt ? toLocalDateString(employee.createdAt) : '',
    baseSalary: 0,
    bonuses: 0,
    overtimeHours: 0,
    salaryCurrency: 'AMD',
    // Kept as a string so "" can mean "no individual amount — follow the policy",
    // which 0 cannot (0 is a valid deliberate override).
    travelAllowance:
      employee.travelAllowanceOverride !== undefined
        ? String(employee.travelAllowanceOverride)
        : '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Отделы/должности — только реальные записи организации (см. useOrgUnits).
  const { departments, positions, allPositions } = useOrgUnits(
    targetOrgId,
    form.departmentId || undefined,
  );
  const departmentName =
    departments?.find((d) => d._id === form.departmentId)?.name ?? employee.department ?? '';
  const positionName =
    positions?.find((p) => p._id === form.positionId)?.title ?? employee.position ?? '';

  // The amount the organization policy pays this employee type. Only used to
  // label the input: an empty field means "pay exactly this".
  const travelAllowancePolicy = salarySettings?.travelAllowance;
  const policyTravelAllowance = resolveTravelAllowance(travelAllowancePolicy, form.employeeType);
  /** What this employee will actually be paid once saved — shown on the review step. */
  const effectiveTravelAllowance = (() => {
    const raw = form.travelAllowance.trim();
    if (raw === '') return policyTravelAllowance;
    const amount = Number(raw);
    return Number.isFinite(amount) && amount >= 0 ? amount : policyTravelAllowance;
  })();

  const canEditRole = user?.role === 'admin' || user?.role === 'superadmin';
  const currentUser = useAuthStore((s) => s.user);
  const isActualAdmin = currentUser?.email?.toLowerCase() === ADMIN_EMAIL;

  const effectiveTotalSteps = isSuperadmin ? TOTAL_STEPS + 1 : TOTAL_STEPS;

  // Reset form on open
  useEffect(() => {
    if (open) {
      setStep(0);
      setDirection(1);
      setSelectedOrgId(employee.organizationId ?? '');
      setForm({
        name: employee.name,
        role: employee.role,
        employeeType: employee.employeeType,
        departmentId: employee.departmentId ?? '',
        positionId: employee.positionId ?? '',
        phone: employee.phone ?? '',
        supervisorId: employee.supervisorId ?? '',
        isActive: employee.isActive,
        paidLeaveBalance: employee.paidLeaveBalance,
        sickLeaveBalance: employee.sickLeaveBalance,
        familyLeaveBalance: employee.familyLeaveBalance,
        registrationDate: employee.createdAt ? toLocalDateString(employee.createdAt) : '',
        baseSalary: 0,
        bonuses: 0,
        overtimeHours: 0,
        salaryCurrency: 'AMD',
        travelAllowance:
          employee.travelAllowanceOverride !== undefined
            ? String(employee.travelAllowanceOverride)
            : '',
      });
      setErrors({});
    }
  }, [open, employee]);

  // Hydrate salary fields when query resolves
  useEffect(() => {
    if (currentSalary) {
      setForm((p) => ({
        ...p,
        baseSalary: currentSalary.baseSalary ?? 0,
        bonuses: currentSalary.bonuses ?? 0,
        overtimeHours: currentSalary.overtimeHours ?? 0,
        salaryCurrency: currentSalary.salaryCurrency ?? 'AMD',
      }));
    }
  }, [currentSalary]);

  // Hydrate passport fields when the profile resolves
  useEffect(() => {
    const p = employeeProfile?.profile;
    if (p) {
      setPassport({
        passportNumber: p.passportNumber ?? '',
        passportIssuedBy: p.passportIssuedBy ?? '',
        passportIssueDate: p.passportIssueDate ?? '',
        passportExpiryDate: p.passportExpiryDate ?? '',
        socialCardNumber: p.socialCardNumber ?? '',
        nationality: p.nationality ?? '',
      });
    }
  }, [employeeProfile]);

  // Reset passport transient state on open
  useEffect(() => {
    if (open) setPassportScan(null);
  }, [open]);

  // Сотрудники, заведённые до перехода на справочники, хранят только название
  // отдела/должности. Подбираем по названию, чтобы поле не открывалось пустым.
  // Если совпадения нет — поле остаётся пустым, и админ выбирает значение сам.
  useEffect(() => {
    if (!open || !departments || !allPositions) return;
    setForm((p) => {
      const next = { ...p };
      if (!next.departmentId && employee.department) {
        const match = departments.find((d) => d.name === employee.department);
        if (match) next.departmentId = match._id;
      }
      if (!next.positionId && employee.position) {
        const match = allPositions.find((pos) => pos.title === employee.position);
        if (match) next.positionId = match._id;
      }
      return next.departmentId === p.departmentId && next.positionId === p.positionId ? p : next;
    });
  }, [open, departments, allPositions, employee.department, employee.position]);

  // Reset supervisorId when organization changes (can't have supervisor from another org)
  useEffect(() => {
    if (isSuperadmin && supervisors && supervisors.length > 0) {
      const supIds = supervisors.map((s) => s._id);
      if (form.supervisorId && !supIds.includes(form.supervisorId as Id<'users'>)) {
        setForm((prev) => ({ ...prev, supervisorId: '' }));
      }
    }
  }, [targetOrgId, isSuperadmin, form.supervisorId, supervisors]);

  /**
   * "" means "no individual amount — follow the organization policy". Anything
   * else must parse to a non-negative number. Returned as a message rather than
   * a boolean so the final save can refuse it too: the review step is the last
   * one, so relying on validateStep alone would let a bad value reach the server.
   */
  const travelAllowanceError = (): string | null => {
    const raw = form.travelAllowance.trim();
    if (raw === '') return null;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) return t('employees.travelAllowanceInvalid');
    return null;
  };

  const validateStep = (currentStep: number): boolean => {
    const errs: Record<string, string> = {};

    if (isSuperadmin && currentStep === 0) {
      if (!selectedOrgId)
        errs.organization = t('employees.organization') + ' ' + t('errors.required').toLowerCase();
    }

    if (currentStep === (isSuperadmin ? 3 : 2)) {
      const allowanceError = travelAllowanceError();
      if (allowanceError) errs.travelAllowance = allowanceError;
    }

    if (currentStep === (isSuperadmin ? 1 : 0)) {
      if (!form.name.trim())
        errs.name = t('common.name') + ' ' + t('errors.required').toLowerCase();
    }

    if (currentStep === (isSuperadmin ? 2 : 1)) {
      if (!form.departmentId)
        errs.department = t('employees.department') + ' ' + t('errors.required').toLowerCase();
      if (!form.positionId)
        errs.position = t('employees.position') + ' ' + t('errors.required').toLowerCase();
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const nextStep = () => {
    if (validateStep(step)) {
      setDirection(1);
      setStep((s) => Math.min(s + 1, effectiveTotalSteps - 1));
    }
  };

  const prevStep = () => {
    setDirection(-1);
    setStep((s) => Math.max(s - 1, 0));
  };

  // Protection: non-superadmin cannot edit superadmin
  if (employee.role === 'superadmin' && !isActualAdmin) {
    return (
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative p-6 rounded-2xl border shadow-2xl max-w-sm w-full text-center"
              style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
            >
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: 'rgba(239,68,68,0.1)' }}
              >
                <AlertTriangle className="w-7 h-7" style={{ color: '#ef4444' }} />
              </div>
              <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                {t('editEmployee.accessDenied')}
              </h3>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                {t('editEmployee.cannotEditSuperadmin')}
              </p>
              <button
                onClick={onClose}
                className="w-full py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: '#2563eb' }}
              >
                {t('common.close')}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    );
  }

  // Protection: admin cannot edit OTHER admins
  if (
    employee.role === 'admin' &&
    user?.role === 'admin' &&
    !isActualAdmin &&
    employee._id !== user?.id
  ) {
    return (
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative p-6 rounded-2xl border shadow-2xl max-w-sm w-full text-center"
              style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
            >
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: 'rgba(239,68,68,0.1)' }}
              >
                <AlertTriangle className="w-7 h-7" style={{ color: '#ef4444' }} />
              </div>
              <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                {t('editEmployee.accessDenied')}
              </h3>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                {t('editEmployee.onlySuperadminCanEditAdmins')}
              </p>
              <button
                onClick={onClose}
                className="w-full py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: '#2563eb' }}
              >
                {t('common.close')}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    );
  }

  const ALL_ROLES = ALL_ROLES_CONFIG.map((r) => ({
    ...r,
    label: t(r.labelKey),
    description: t(r.descKey),
  }));
  const ROLES = isActualAdmin ? ALL_ROLES : ALL_ROLES.filter((r) => r.value !== 'admin');

  const handleSave = async () => {
    if (!validateStep(step)) return;
    // The allowance lives on an earlier step than the save button, so it has to
    // be re-checked here rather than trusting the current step's validation.
    const allowanceError = travelAllowanceError();
    if (allowanceError) {
      setErrors((p) => ({ ...p, travelAllowance: allowanceError }));
      toast.error(allowanceError);
      return;
    }
    setLoading(true);
    try {
      if (!user?.id) {
        toast.error(t('toasts.userIdNotFound'));
        return;
      }

      await updateUser({
        adminId: user.id as Id<'users'>,
        userId: employee._id as Id<'users'>,
        name: form.name,
        role: form.role as 'admin' | 'supervisor' | 'employee' | 'driver',
        employeeType: form.employeeType as 'staff' | 'contractor',
        departmentId: form.departmentId ? (form.departmentId as Id<'departments'>) : undefined,
        positionId: form.positionId ? (form.positionId as Id<'positions'>) : undefined,
        phone: form.phone || undefined,
        supervisorId: form.supervisorId ? (form.supervisorId as Id<'users'>) : undefined,
        isActive: form.isActive,
        paidLeaveBalance: form.paidLeaveBalance,
        sickLeaveBalance: form.sickLeaveBalance,
        familyLeaveBalance: form.familyLeaveBalance,
        // null clears any individual amount and puts the employee back on the
        // organization policy; a number pins them to that amount.
        travelAllowance:
          form.travelAllowance.trim() === '' ? null : Number(form.travelAllowance.trim()),
        createdAt: form.registrationDate
          ? new Date(form.registrationDate + 'T00:00:00').getTime()
          : undefined,
      });
      await updateSalary({
        userId: employee._id as Id<'users'>,
        organizationId: (employee.organizationId || undefined) as Id<'organizations'> | undefined,
        baseSalary: form.baseSalary,
        bonuses: form.bonuses,
        overtimeHours: form.overtimeHours,
        salaryCurrency: form.salaryCurrency,
      });
      await updatePassport({
        userId: employee._id as Id<'users'>,
        organizationId: (employee.organizationId || undefined) as Id<'organizations'> | undefined,
        passportNumber: passport.passportNumber || undefined,
        passportIssuedBy: passport.passportIssuedBy || undefined,
        passportIssueDate: passport.passportIssueDate || undefined,
        passportExpiryDate: passport.passportExpiryDate || undefined,
        socialCardNumber: passport.socialCardNumber || undefined,
        nationality: passport.nationality || undefined,
      });
      if (passportScan) {
        await uploadEmployeeDocument({
          userId: employee._id as Id<'users'>,
          uploaderId: user.id as Id<'users'>,
          category: 'id_document',
          fileName: passportScan.name,
          fileUrl: passportScan.url,
          fileSize: passportScan.size,
        }).catch(() => {});
      }
      toast.success(t('modals.editEmployee.updatedSuccess'));
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('modals.editEmployee.failedToUpdate'));
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    ...(isSuperadmin ? [{ icon: Building2, label: t('employees.organization') }] : []),
    { icon: User, label: t('common.name') },
    { icon: Briefcase, label: t('employees.position') },
    { icon: DollarSign, label: t('payroll.salary') || 'Salary' },
    { icon: IdCard, label: t('employees.identity') || 'Identity' },
    { icon: CheckCircle, label: t('common.review') || 'Review' },
  ];

  const isLastStep = step === effectiveTotalSteps - 1;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[95vh] p-0">
        {/* Header with progress */}
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 btn-gradient" />
          <div className="relative z-10 px-6 pt-6 pb-4">
            <div className="flex items-center gap-3 mb-4">
              <AvatarUpload
                userId={employee._id}
                currentUrl={employee.avatarUrl}
                name={employee.name}
                size="md"
              />
              <div>
                <DialogTitle className="text-lg text-white">
                  {t('modals.editEmployee.title')}
                </DialogTitle>
                <DialogDescription className="text-white/70 text-sm">
                  {employee.email}
                </DialogDescription>
              </div>
            </div>

            {/* Step indicators */}
            <div className="flex items-center gap-1.5 mt-2">
              {steps.map((s, i) => (
                <div key={i} className="flex items-center gap-1.5 flex-1">
                  <div
                    className={`flex-1 h-1 rounded-full transition-all duration-300 ${
                      i <= step ? 'bg-white' : 'bg-white/30'
                    }`}
                    style={{ transformOrigin: 'left' }}
                  />
                </div>
              ))}
            </div>

            {/* Step labels */}
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-white/60">
                {t('common.step') || 'Step'} {step + 1} / {effectiveTotalSteps}
              </span>
              <span className="text-xs text-white/80 font-medium">{steps[step]?.label}</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 max-h-[50vh] overflow-y-auto">
          <AnimatePresence mode="wait">
            {/* Step 0: Organization (superadmin only) */}
            {isSuperadmin && step === 0 && (
              <motion.div
                key="step-org"
                initial={{ x: direction > 0 ? 300 : -300, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: direction > 0 ? -300 : 300, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
                className="space-y-4"
              >
                <div className="space-y-1.5">
                  <label className="text-sm font-medium flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5" /> {t('employees.organization')} *
                  </label>
                  <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                    <SelectTrigger className={errors.organization ? 'border-red-500' : ''}>
                      <SelectValue placeholder={t('employees.selectOrganization')} />
                    </SelectTrigger>
                    <SelectContent>
                      {organizations?.map((org) => (
                        <SelectItem key={org._id} value={org._id}>
                          {org.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.organization && (
                    <p className="text-xs text-red-500">{errors.organization}</p>
                  )}
                </div>
              </motion.div>
            )}

            {/* Step: Personal Info */}
            {step === (isSuperadmin ? 1 : 0) && (
              <motion.div
                key="step-personal"
                initial={{ x: direction > 0 ? 300 : -300, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: direction > 0 ? -300 : 300, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
                className="space-y-4"
              >
                <div>
                  <h3 className="text-sm font-semibold mb-1">
                    {t('wizard.personalInfo') || 'Personal Information'}
                  </h3>
                  <p className="text-xs text-(--text-muted)">
                    {t('wizard.personalInfoDesc') || 'Basic details about the employee'}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" /> {t('labels.fullName')} *
                  </label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    className={`w-full px-3 py-2 rounded-xl border text-sm outline-none transition-all ${
                      errors.name ? 'border-red-500' : ''
                    }`}
                    style={{
                      background: 'var(--input)',
                      borderColor: errors.name ? undefined : 'var(--border)',
                      color: 'var(--text-primary)',
                    }}
                    onFocus={(e) => (e.target.style.borderColor = '#2563eb')}
                    onBlur={(e) =>
                      (e.target.style.borderColor = errors.name ? '#ef4444' : 'var(--border)')
                    }
                  />
                  {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5" /> {t('labels.email')}
                  </label>
                  <div
                    className="px-3 py-2 rounded-xl border text-sm"
                    style={{
                      background: 'var(--background-subtle)',
                      borderColor: 'var(--border)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {employee.email}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5" /> {t('labels.phone')}
                  </label>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                    placeholder="+374 XX XXX XXX"
                    className="w-full px-3 py-2 rounded-xl border text-sm outline-none transition-all"
                    style={{
                      background: 'var(--input)',
                      borderColor: 'var(--border)',
                      color: 'var(--text-primary)',
                    }}
                    onFocus={(e) => (e.target.style.borderColor = '#2563eb')}
                    onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium flex items-center gap-1.5">
                    <CalendarDays className="w-3.5 h-3.5" /> {t('editEmployee.registrationDate')}
                  </label>
                  <input
                    type="date"
                    value={form.registrationDate}
                    max={toLocalDateString(Date.now())}
                    onChange={(e) => setForm((p) => ({ ...p, registrationDate: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border text-sm outline-none transition-all"
                    style={{
                      background: 'var(--input)',
                      borderColor: 'var(--border)',
                      color: 'var(--text-primary)',
                    }}
                    onFocus={(e) => (e.target.style.borderColor = '#2563eb')}
                    onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
                  />
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {t('editEmployee.registrationDateHint')}
                  </p>
                </div>
              </motion.div>
            )}

            {/* Step: Work Details */}
            {step === (isSuperadmin ? 2 : 1) && (
              <motion.div
                key="step-work"
                initial={{ x: direction > 0 ? 300 : -300, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: direction > 0 ? -300 : 300, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
                className="space-y-4"
              >
                <div>
                  <h3 className="text-sm font-semibold mb-1">
                    {t('wizard.workDetails') || 'Work Details'}
                  </h3>
                  <p className="text-xs text-(--text-muted)">
                    {t('wizard.workDetailsDesc') || 'Department and position information'}
                  </p>
                </div>

                {/* Role — admin only */}
                {canEditRole && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5" /> {t('labels.role')}
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {ROLES.map((r) => (
                        <button
                          key={r.value}
                          type="button"
                          onClick={() =>
                            setForm((p) => ({
                              ...p,
                              role: r.value as 'admin' | 'supervisor' | 'employee',
                            }))
                          }
                          className="flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-sm font-medium transition-all"
                          style={{
                            borderColor: form.role === r.value ? '#2563eb' : 'var(--border)',
                            background:
                              form.role === r.value
                                ? 'rgba(99,102,241,0.1)'
                                : 'var(--background-subtle)',
                            color: form.role === r.value ? '#2563eb' : 'var(--text-muted)',
                          }}
                        >
                          <span className="text-lg">{r.icon}</span>
                          <span>{r.label}</span>
                          <span className="text-xs opacity-70">{r.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Employee Type */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium flex items-center gap-1.5">
                    <Briefcase className="w-3.5 h-3.5" /> {t('common.employeeType')}
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {['staff', 'contractor'].map((type) => {
                      const selected = form.employeeType === type;
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() =>
                            setForm((p) => ({ ...p, employeeType: type as 'staff' | 'contractor' }))
                          }
                          className={`relative flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                            selected
                              ? 'btn-gradient border-transparent text-white shadow-md ring-[3px] ring-blue-500/30'
                              : 'border-(--border) bg-(--background-subtle) text-(--text-muted) hover:border-(--border-subtle)'
                          }`}
                        >
                          {selected && (
                            <CheckCircle className="absolute top-1.5 right-1.5 w-3.5 h-3.5" />
                          )}
                          <span className="capitalize">{t(`employeeTypes.${type}`)}</span>
                          <span className="text-xs opacity-70">
                            {type === 'contractor'
                              ? `12,000 ${t('currency.amd')}`
                              : `20,000 ${t('currency.amd')}`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Department & Position */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5" /> {t('labels.department')} *
                    </label>
                    <CustomSelect
                      value={form.departmentId}
                      onChange={(v) =>
                        setForm((p) => {
                          // Должность привязана к отделу — снимаем выбор, если
                          // она больше не относится к новому отделу.
                          const stillValid = positions?.some(
                            (pos) =>
                              pos._id === p.positionId &&
                              (!pos.departmentId || pos.departmentId === v),
                          );
                          return {
                            ...p,
                            departmentId: v,
                            positionId: stillValid ? p.positionId : '',
                          };
                        })
                      }
                      fullWidth
                      options={[
                        { value: '', label: t('placeholders.selectDepartment') },
                        ...(departments ?? []).map((d) => ({ value: d._id, label: d.name })),
                      ]}
                      triggerClassName={`w-full px-3 py-2 rounded-xl border text-sm outline-none transition-all ${
                        errors.department ? 'border-red-500' : ''
                      }`}
                      dropdownClassName="bg-[var(--input)] border-[var(--border)] text-[var(--text-primary)]"
                    />
                    {departments?.length === 0 && (
                      <p className="text-xs text-(--text-muted)">{t('employees.noDepartments')}</p>
                    )}
                    {errors.department && (
                      <p className="text-xs text-red-500">{errors.department}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">{t('labels.position')} *</label>
                    <CustomSelect
                      value={form.positionId}
                      onChange={(v) => setForm((p) => ({ ...p, positionId: v }))}
                      fullWidth
                      options={[
                        { value: '', label: t('placeholders.selectPosition') },
                        ...(positions ?? []).map((p) => ({ value: p._id, label: p.title })),
                      ]}
                      triggerClassName={`w-full px-3 py-2 rounded-xl border text-sm outline-none transition-all ${
                        errors.position ? 'border-red-500' : ''
                      }`}
                      dropdownClassName="bg-[var(--input)] border-[var(--border)] text-[var(--text-primary)]"
                    />
                    {positions?.length === 0 && (
                      <p className="text-xs text-(--text-muted)">{t('employees.noPositions')}</p>
                    )}
                    {errors.position && <p className="text-xs text-red-500">{errors.position}</p>}
                  </div>
                </div>

                {/* Supervisor */}
                {supervisors && supervisors.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" /> {t('labels.supervisor')}
                    </label>
                    <Select
                      value={form.supervisorId}
                      onValueChange={(v) => setForm((p) => ({ ...p, supervisorId: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('placeholders.select', 'Select...')} />
                      </SelectTrigger>
                      <SelectContent>
                        {supervisors.map((s) => (
                          <SelectItem key={s._id} value={s._id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </motion.div>
            )}

            {/* Step: Salary */}
            {step === (isSuperadmin ? 3 : 2) && (
              <motion.div
                key="step-salary"
                initial={{ x: direction > 0 ? 300 : -300, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: direction > 0 ? -300 : 300, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
                className="space-y-4"
              >
                <div>
                  <h3 className="text-sm font-semibold mb-1 flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4" /> {t('payroll.salary') || 'Salary'}
                  </h3>
                  <p className="text-xs text-(--text-muted)">
                    {t('payroll.salaryStepDesc') ||
                      'Set base salary and compensation for payroll calculations'}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    {t('payroll.baseSalary')} ({form.salaryCurrency})
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={form.baseSalary || ''}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, baseSalary: parseFloat(e.target.value) || 0 }))
                    }
                    placeholder={t('payroll.baseSalaryPlaceholder') || '0'}
                    className="w-full px-3 py-2 rounded-xl border text-sm outline-none transition-all"
                    style={{
                      background: 'var(--input)',
                      borderColor: 'var(--border)',
                      color: 'var(--text-primary)',
                    }}
                    onFocus={(e) => (e.target.style.borderColor = '#2563eb')}
                    onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">{t('payroll.bonuses')}</label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={form.bonuses || ''}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, bonuses: parseFloat(e.target.value) || 0 }))
                      }
                      placeholder="0"
                      className="w-full px-3 py-2 rounded-xl border text-sm outline-none transition-all"
                      style={{
                        background: 'var(--input)',
                        borderColor: 'var(--border)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">{t('payroll.overtimeHours')}</label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={form.overtimeHours || ''}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, overtimeHours: parseFloat(e.target.value) || 0 }))
                      }
                      placeholder="0"
                      className="w-full px-3 py-2 rounded-xl border text-sm outline-none transition-all"
                      style={{
                        background: 'var(--input)',
                        borderColor: 'var(--border)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    {t('payroll.currency') || 'Currency'}
                  </label>
                  <Select
                    value={form.salaryCurrency}
                    onValueChange={(v) => setForm((p) => ({ ...p, salaryCurrency: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AMD">AMD</SelectItem>
                      <SelectItem value="RUB">RUB</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Travel allowance — org policy by default, editable per employee */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t('employees.travelAllowance')}</label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={form.travelAllowance}
                    onChange={(e) => {
                      const value = e.target.value;
                      setForm((p) => ({ ...p, travelAllowance: value }));
                      setErrors((p) => ({ ...p, travelAllowance: '' }));
                    }}
                    placeholder={
                      travelAllowancePolicy?.enabled ? String(policyTravelAllowance) : '0'
                    }
                    className={`w-full px-3 py-2 rounded-xl border text-sm outline-none transition-all ${
                      errors.travelAllowance ? 'border-red-500' : ''
                    }`}
                    style={{
                      background: 'var(--input)',
                      borderColor: errors.travelAllowance ? undefined : 'var(--border)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <p className="text-xs text-(--text-muted)">
                    {travelAllowancePolicy?.enabled
                      ? t('employees.travelAllowanceHint', {
                          amount: formatCurrency(policyTravelAllowance, i18n.language),
                        })
                      : t('employees.travelAllowanceHintNoPolicy')}
                  </p>
                  {errors.travelAllowance && (
                    <p className="text-xs text-red-500">{errors.travelAllowance}</p>
                  )}
                </div>
              </motion.div>
            )}

            {/* Step: Identity / Passport */}
            {step === (isSuperadmin ? 4 : 3) && (
              <motion.div
                key="step-identity"
                initial={{ x: direction > 0 ? 300 : -300, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: direction > 0 ? -300 : 300, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
                className="space-y-4"
              >
                <div className="flex items-center gap-2 mb-1">
                  <IdCard className="w-4 h-4 text-sky-500" />
                  <h3 className="text-sm font-semibold">
                    {t('wizard.identityInfo') || 'Identity Documents'}
                  </h3>
                </div>
                <p className="text-xs text-(--text-muted) mb-2">
                  {t('wizard.identityInfoDesc') ||
                    'Passport / ID details — upload a scan to auto-fill'}
                </p>
                <PassportFields
                  value={passport}
                  onChange={(patch) => setPassport((p) => ({ ...p, ...patch }))}
                  onScanUploaded={setPassportScan}
                  userId={employee._id as Id<'users'>}
                />
              </motion.div>
            )}

            {/* Step: Review */}
            {step === (isSuperadmin ? 5 : 4) && (
              <motion.div
                key="step-review"
                initial={{ x: direction > 0 ? 300 : -300, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: direction > 0 ? -300 : 300, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
                className="space-y-4"
              >
                <div>
                  <h3 className="text-sm font-semibold mb-1">
                    {t('wizard.review') || 'Review Changes'}
                  </h3>
                  <p className="text-xs text-(--text-muted)">
                    {t('wizard.reviewDesc') || 'Confirm the details before saving'}
                  </p>
                </div>

                <div
                  className="rounded-xl border p-4 space-y-3"
                  style={{
                    background: 'var(--background-subtle)',
                    borderColor: 'var(--border)',
                  }}
                >
                  {[
                    { label: t('labels.fullName'), value: form.name },
                    { label: t('labels.email'), value: employee.email },
                    { label: t('labels.phone'), value: form.phone || '—' },
                    {
                      label: t('editEmployee.registrationDate'),
                      value: form.registrationDate || '—',
                    },
                    {
                      label: t('common.employeeType'),
                      value: t(`employeeTypes.${form.employeeType}`),
                    },
                    { label: t('labels.department'), value: departmentName || '—' },
                    { label: t('labels.position'), value: positionName || '—' },
                    { label: t('labels.role'), value: t(`roles.${form.role}`) },
                    {
                      label: t('employees.travelAllowance'),
                      value: formatCurrency(effectiveTravelAllowance, i18n.language),
                    },
                    ...(isSuperadmin
                      ? [
                          {
                            label: t('employees.organization'),
                            value: organizations?.find((o) => o._id === selectedOrgId)?.name || '—',
                          },
                        ]
                      : []),
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between text-sm">
                      <span className="text-(--text-muted)">{label}</span>
                      <span className="font-medium text-(--text-primary)">{value}</span>
                    </div>
                  ))}
                </div>

                {/* Leave Balances */}
                {canEditRole && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">{t('labels.leaveBalances')}</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { key: 'paidLeaveBalance', label: 'Paid', color: '#2563eb' },
                        { key: 'sickLeaveBalance', label: 'Sick', color: '#ef4444' },
                        { key: 'familyLeaveBalance', label: 'Family', color: '#10b981' },
                      ].map(({ key, label, color }) => (
                        <div key={key} className="space-y-1">
                          <label className="text-xs font-medium" style={{ color }}>
                            {label}
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={365}
                            value={form[key as keyof typeof form] as number}
                            onChange={(e) =>
                              setForm((p) => ({ ...p, [key]: parseInt(e.target.value) || 0 }))
                            }
                            className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none text-center"
                            style={{
                              background: 'var(--input)',
                              borderColor: 'var(--border)',
                              color: 'var(--text-primary)',
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Status toggle */}
                {canEditRole && employee.role !== 'admin' && (
                  <div
                    className="flex items-center justify-between p-3 rounded-xl border"
                    style={{ borderColor: 'var(--border)', background: 'var(--background-subtle)' }}
                  >
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {t('editEmployee.accountStatus')}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {form.isActive
                          ? t('editEmployee.activeCanLogin')
                          : t('editEmployee.deactivatedNoAccess')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, isActive: !p.isActive }))}
                      className="w-12 h-6 rounded-full transition-all relative"
                      style={{ background: form.isActive ? '#2563eb' : 'var(--border)' }}
                    >
                      <div
                        className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
                        style={{ left: form.isActive ? '26px' : '2px' }}
                      />
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between w-full">
            {step > 0 ? (
              <Button variant="outline" onClick={prevStep} className="gap-1">
                <ChevronLeft className="w-4 h-4" />
                {t('wizard.previous') || 'Previous'}
              </Button>
            ) : (
              <div />
            )}
            {isLastStep ? (
              <Button onClick={handleSave} disabled={loading} className="gap-2">
                {loading ? (
                  <ShieldLoader size="xs" variant="inline" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {t('modals.editEmployee.saveChanges')}
              </Button>
            ) : (
              <Button onClick={nextStep} className="gap-1">
                {t('wizard.next') || 'Next'}
                <ChevronRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
