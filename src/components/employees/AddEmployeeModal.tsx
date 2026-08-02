'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import { useMutation } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { api } from '../../../convex/_generated/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getTravelAllowance } from '@/lib/types';
import { useOrgUnits } from '@/hooks/useOrgUnits';
import { useAuthStore } from '@/store/useAuthStore';
import { useQuery } from 'convex/react';
import type { Id } from '../../../convex/_generated/dataModel';
import type { FunctionReference } from 'convex/server';
import { toCountryCode, TAX_RULES, type CountryCode } from '../../../convex/lib/taxRules';
import { computeGrossFromNet } from '../../../convex/lib/payrollCalculator';
import { useWizardDraft } from '@/hooks/useWizardDraft';
import { WizardDraftNotice } from '@/components/ui/WizardDraftNotice';
import { SalaryCalculatorStep, type SalaryState } from './SalaryCalculatorStep';
import {
  PassportFields,
  EMPTY_PASSPORT,
  type PassportData,
  type PassportScanFile,
} from './PassportFields';
import {
  UserPlus,
  User,
  Mail,
  Briefcase,
  Phone,
  CheckCircle,
  ChevronRight,
  ChevronLeft,
  Building2,
  Shield,
  DollarSign,
  IdCard,
  CalendarDays,
} from 'lucide-react';

const ADMIN_EMAIL = (process.env.NEXT_PUBLIC_BOOTSTRAP_SUPERADMIN_EMAIL ?? '').toLowerCase();

interface AddEmployeeModalProps {
  open: boolean;
  onClose: () => void;
}

function formatCurrency(amount: number, lang: string = 'en'): string {
  const locale = lang === 'ru' ? 'ru-RU' : lang === 'hy' ? 'hy-AM' : 'en-US';
  return amount.toLocaleString(locale) + ' ֏';
}

// Bizier easing for smooth animations
const bizierEasing = [0.34, 1.56, 0.64, 1];

const TOTAL_STEPS = 6;

// Local YYYY-MM-DD (not UTC) so the date input matches local timezone dates.
function toLocalDateString(timestamp: number): string {
  const d = new Date(timestamp);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

export function AddEmployeeModal({ open, onClose }: AddEmployeeModalProps) {
  const { t, i18n } = useTranslation();
  const createUser = useMutation(api.users.mutations.createUser as FunctionReference<'mutation'>);
  const uploadEmployeeDocument = useMutation(api.employeeProfiles.uploadDocument);
  const recordTaxIdVerification = useMutation(api.employeeProfiles.recordTaxIdVerification);
  const currentUser = useAuthStore((s) => s.user);
  const isActualAdmin = currentUser?.email?.toLowerCase() === ADMIN_EMAIL;
  const isSuperadmin = currentUser?.role === 'superadmin';

  const organizations = useQuery(api.organizations.getAllOrganizations, isSuperadmin ? {} : 'skip');
  const myOrg = useQuery(
    api.organizations.getMyOrganization,
    !isSuperadmin && currentUser?.id ? { userId: currentUser.id as Id<'users'> } : 'skip',
  );

  const [step, setStep] = useState(0);
  const [_direction, setDirection] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  // Отдел и должность хранятся как id записей из /employees/departments и
  // /employees/positions — названия выводятся из них при рендере.
  const [departmentId, setDepartmentId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'admin' | 'supervisor' | 'employee'>('employee');
  const [type, setType] = useState<'staff' | 'contractor'>('staff');
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [registrationDate, setRegistrationDate] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Resolve the tax country for salary calc from the target organization.
  const targetOrg = isSuperadmin ? organizations?.find((o) => o._id === selectedOrgId) : myOrg;
  const orgCountry: CountryCode =
    toCountryCode(targetOrg?.taxCountry) ?? toCountryCode(targetOrg?.country) ?? 'armenia';

  // Отделы/должности целевой организации. Для суперадмина это выбранная на
  // нулевом шаге организация, для остальных — своя.
  const targetOrgId = isSuperadmin ? selectedOrgId : currentUser?.organizationId;
  const { departments, positions } = useOrgUnits(targetOrgId, departmentId || undefined);
  const departmentName = departments?.find((d) => d._id === departmentId)?.name ?? '';
  const positionName = positions?.find((p) => p._id === positionId)?.title ?? '';

  const [salary, setSalary] = useState<SalaryState>({
    mode: 'gross',
    amount: 0,
    currency: TAX_RULES.armenia.currency,
    country: 'armenia',
  });
  const [passport, setPassport] = useState<PassportData>(EMPTY_PASSPORT);
  const [passportScan, setPassportScan] = useState<PassportScanFile | null>(null);
  const [taxIdVerifyStatus, setTaxIdVerifyStatus] = useState<
    | 'verified'
    | 'not_found'
    | 'valid_local'
    | 'invalid_checksum'
    | 'invalid_format'
    | 'error'
    | null
  >(null);

  const allowance = getTravelAllowance(email);

  // Superadmin: org selection is step 0, so adjust total
  const effectiveTotalSteps = isSuperadmin ? TOTAL_STEPS + 1 : TOTAL_STEPS;

  const resetForm = useCallback(() => {
    setStep(0);
    setDirection(1);
    setName('');
    setEmail('');
    setDepartmentId('');
    setPositionId('');
    setPhone('');
    setType('staff');
    setRole('employee');
    setSelectedOrgId('');
    setRegistrationDate('');
    setSalary({
      mode: 'gross',
      amount: 0,
      currency: TAX_RULES.armenia.currency,
      country: 'armenia',
    });
    setPassport(EMPTY_PASSPORT);
    setPassportScan(null);
    setTaxIdVerifyStatus(null);
    setErrors({});
  }, []);

  // Чистим форму только на переходе «закрыта → открыта». Зависеть от
  // isSuperadmin нельзя: роль приходит из persisted-store асинхронно и стёрла
  // бы восстановленный черновик.
  const wasOpenRef = React.useRef(false);
  useEffect(() => {
    if (open && !wasOpenRef.current) resetForm();
    wasOpenRef.current = open;
  }, [open, resetForm]);

  // ── Черновик: данные переживают случайное закрытие модалки ─────────────
  const draftData = useMemo(
    () => ({
      name,
      email,
      departmentId,
      positionId,
      phone,
      role,
      type,
      selectedOrgId,
      registrationDate,
      salary,
      passport,
      passportScan,
    }),
    [
      name,
      email,
      departmentId,
      positionId,
      phone,
      role,
      type,
      selectedOrgId,
      registrationDate,
      salary,
      passport,
      passportScan,
    ],
  );

  const handleRestoreDraft = useCallback(
    (d: typeof draftData, savedStep: number) => {
      setName(d.name ?? '');
      setEmail(d.email ?? '');
      setDepartmentId(d.departmentId ?? '');
      setPositionId(d.positionId ?? '');
      setPhone(d.phone ?? '');
      if (d.role)      setRole(d.role);
      if (d.type) setType(d.type);
      setSelectedOrgId(d.selectedOrgId ?? '');
      setRegistrationDate(d.registrationDate ?? '');
      if (d.salary) setSalary((p) => ({ ...p, ...d.salary }));
      if (d.passport) setPassport((p) => ({ ...p, ...d.passport }));
      setPassportScan(d.passportScan ?? null);
      setStep(Math.min(Math.max(savedStep, 0), effectiveTotalSteps - 1));
    },
    [effectiveTotalSteps],
  );

  // Слепок нетронутой формы. Считается от текущей страны организации: эффект
  // синхронизации валюты срабатывает до любого ввода, и без этого черновик
  // писался бы для пустой формы.
  const draftDefaults = useMemo(
    () => ({
      role: 'employee' as const,
      type: 'staff' as const,
      salary: {
        mode: 'gross' as const,
        amount: 0,
        currency: TAX_RULES[orgCountry].currency,
        country: orgCountry,
      },
    }),
    [orgCountry],
  );

  const draft = useWizardDraft({
    key: 'add-employee',
    enabled: open,
    data: draftData,
    step,
    defaults: draftDefaults,
    onRestore: handleRestoreDraft,
  });

  const { clearDraft } = draft;

  const handleStartOver = useCallback(() => {
    clearDraft();
    resetForm();
  }, [clearDraft, resetForm]);

  // Keep salary calc country/currency in sync with the resolved organization.
  useEffect(() => {
    setSalary((p) => ({ ...p, country: orgCountry, currency: TAX_RULES[orgCountry].currency }));
  }, [orgCountry]);

  useEffect(() => {
    if (email.toLowerCase().includes('contractor')) setType('contractor');
    else if (email && !email.toLowerCase().includes('contractor')) setType('staff');
  }, [email]);

  const validateStep = (currentStep: number): boolean => {
    const errs: Record<string, string> = {};

    if (isSuperadmin && currentStep === 0) {
      if (!selectedOrgId)
        errs.organization = t('employees.organization') + ' ' + t('errors.required').toLowerCase();
    }

    if (currentStep === (isSuperadmin ? 1 : 0)) {
      if (!name.trim()) errs.name = t('common.name') + ' ' + t('errors.required').toLowerCase();
      if (!email.trim()) errs.email = t('common.email') + ' ' + t('errors.required').toLowerCase();
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = t('errors.invalidEmail');
    }

    if (currentStep === (isSuperadmin ? 2 : 1)) {
      if (!departmentId)
        errs.department = t('employees.department') + ' ' + t('errors.required').toLowerCase();
      if (!positionId)
        errs.position = t('employees.position') + ' ' + t('errors.required').toLowerCase();
    }

    if (currentStep === (isSuperadmin ? 3 : 2)) {
      // Role & Type — optional validation
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

  const handleSubmit = async () => {
    if (!validateStep(step)) return;
    if (!currentUser?.id) {
      toast.error(t('toasts.userIdNotFound'));
      return;
    }

    setSubmitting(true);
    try {
      // Persist the resolved GROSS salary (net is always derivable from it).
      const salaryGross =
        salary.amount > 0
          ? salary.mode === 'gross'
            ? salary.amount
            : computeGrossFromNet({ country: salary.country, net: salary.amount }).grossSalary
          : undefined;

      const passportProvided = Object.values(passport).some(
        (v) => typeof v === 'string' && v.trim() !== '',
      );

      const newUserId = (await createUser({
        adminId: currentUser.id as Id<'users'>,
        name,
        email,
        passwordHash: 'temp-password-will-be-changed',
        role,
        departmentId: departmentId as Id<'departments'>,
        positionId: positionId as Id<'positions'>,
        employeeType: type,
        phone: phone || undefined,
        ...(isSuperadmin && selectedOrgId
          ? { organizationId: selectedOrgId as Id<'organizations'> }
          : {}),
        ...(salaryGross !== undefined
          ? { baseSalary: salaryGross, salaryCurrency: salary.currency }
          : {}),
        ...(passportProvided
          ? {
              passportNumber: passport.passportNumber || undefined,
              passportIssuedBy: passport.passportIssuedBy || undefined,
              passportIssueDate: passport.passportIssueDate || undefined,
              passportExpiryDate: passport.passportExpiryDate || undefined,
              socialCardNumber: passport.socialCardNumber || undefined,
              nationality: passport.nationality || undefined,
            }
          : {}),
        createdAt: registrationDate
          ? new Date(registrationDate + 'T00:00:00').getTime()
          : undefined,
      })) as Id<'users'>;

      // Persist the SRC/HVHH verification result captured during the identity
      // step (the user did not exist yet, so it could not be recorded earlier).
      if (newUserId && taxIdVerifyStatus && taxIdVerifyStatus !== 'error') {
        await recordTaxIdVerification({
          userId: newUserId,
          status: taxIdVerifyStatus,
        }).catch(() => {});
      }

      // Persist the uploaded passport scan now that we have the user id.
      if (passportScan && newUserId) {
        await uploadEmployeeDocument({
          userId: newUserId,
          uploaderId: currentUser.id as Id<'users'>,
          category: 'id_document',
          fileName: passportScan.name,
          fileUrl: passportScan.url,
          fileSize: passportScan.size,
        }).catch(() => {});
      }

      toast.success(t('success.created'));
      fetch('/api/telegram/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'new_employee',
          data: { name, email, department: departmentName, position: positionName, role },
        }),
      }).catch(() => {});
      clearDraft();
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('errors.somethingWentWrong'));
    } finally {
      setSubmitting(false);
    }
  };

  const isLastStep = step === effectiveTotalSteps - 1;

  // Steps config
  const steps = [
    ...(isSuperadmin ? [{ icon: Building2, label: t('employees.organization') }] : []),
    { icon: User, label: t('common.name') },
    { icon: Briefcase, label: t('employees.position') },
    { icon: Shield, label: t('employees.role') },
    { icon: DollarSign, label: t('payroll.salary') || 'Salary' },
    { icon: IdCard, label: t('employees.identity') || 'Identity' },
    { icon: CheckCircle, label: t('common.review') || 'Review' },
  ];

  const slideVariants = {
    hidden: { x: 300, opacity: 0 },
    visible: { x: 0, opacity: 1 },
    exit: { x: -300, opacity: 0 },
  } as const;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} modal={false}>
      <DialogContent className="max-w-lg max-h-[95vh] p-0">
        {/* Header with progress */}
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 btn-gradient" />
          <div className="relative z-10 px-6 pt-6 pb-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
                <UserPlus className="w-5 h-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-lg text-white">
                  {t('employees.addEmployee')}
                </DialogTitle>
                <DialogDescription className="text-white/70 text-sm">
                  {t('employees.enterDetails')}
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
          <WizardDraftNotice
            show={draft.restored}
            step={draft.restoredStep}
            onReset={handleStartOver}
          />

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.35, ease: bizierEasing }}
            >
              {/* Step 0: Organization (superadmin only) */}
              {isSuperadmin && step === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-(--primary)/10 flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-(--primary)" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-(--text-primary)">
                        {t('employees.selectOrganization')}
                      </h3>
                      <p className="text-sm text-(--text-muted)">
                        {t('employees.selectOrgDescription') ||
                          'Choose which organization to add this employee to'}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>{t('employees.organization')} *</Label>
                    <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                      <SelectTrigger
                        className={errors.organization ? 'border-(--destructive)' : ''}
                      >
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
                      <p className="text-xs text-(--destructive)">{errors.organization}</p>
                    )}
                  </div>
                </motion.div>
              )}

              {/* Step 1: Personal Info */}
              {step === (isSuperadmin ? 1 : 0) && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-5"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                      <User className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-(--text-primary)">
                        {t('wizard.personalInfo') || 'Personal Information'}
                      </h3>
                      <p className="text-sm text-(--text-muted)">
                        {t('wizard.personalInfoDesc') || 'Basic details about the employee'}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="emp-name">{t('common.name')} *</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
                      <Input
                        id="emp-name"
                        placeholder={t('placeholders.johnSmith')}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className={`pl-10 ${errors.name ? 'border-(--destructive)' : ''}`}
                      />
                    </div>
                    {errors.name && <p className="text-xs text-(--destructive)">{errors.name}</p>}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="emp-email">{t('common.email')} *</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
                      <Input
                        id="emp-email"
                        type="email"
                        placeholder="john.smith@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={`pl-10 ${errors.email ? 'border-(--destructive)' : ''}`}
                      />
                    </div>
                    {errors.email && <p className="text-xs text-(--destructive)">{errors.email}</p>}
                    <p className="text-xs text-(--text-muted)">{t('employees.contractorHint')}</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="emp-regdate">{t('editEmployee.registrationDate')}</Label>
                    <div className="relative">
                      <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
                      <Input
                        id="emp-regdate"
                        type="date"
                        max={toLocalDateString(Date.now())}
                        value={registrationDate}
                        onChange={(e) => setRegistrationDate(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    <p className="text-xs text-(--text-muted)">
                      {t('editEmployee.registrationDateHint')}
                    </p>
                  </div>
                </motion.div>
              )}

              {/* Step 2: Work Details */}
              {step === (isSuperadmin ? 2 : 1) && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-5"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                      <Briefcase className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-(--text-primary)">
                        {t('wizard.workDetails') || 'Work Details'}
                      </h3>
                      <p className="text-sm text-(--text-muted)">
                        {t('wizard.workDetailsDesc') || 'Department and position information'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>{t('employees.department')} *</Label>
                      <Select
                        value={departmentId}
                        onValueChange={(v) => {
                          setDepartmentId(v);
                          // Должность привязана к отделу — снимаем выбор, если
                          // она больше не относится к новому отделу.
                          const stillValid = positions?.some(
                            (p) => p._id === positionId && (!p.departmentId || p.departmentId === v),
                          );
                          if (!stillValid) setPositionId('');
                        }}
                        disabled={!departments?.length}
                      >
                        <SelectTrigger
                          className={errors.department ? 'border-(--destructive)' : ''}
                        >
                          <SelectValue placeholder={t('placeholders.selectDepartment')} />
                        </SelectTrigger>
                        <SelectContent>
                          {departments?.map((d) => (
                            <SelectItem key={d._id} value={d._id}>
                              {d.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {departments?.length === 0 && (
                        <p className="text-xs text-(--text-muted)">{t('employees.noDepartments')}</p>
                      )}
                      {errors.department && (
                        <p className="text-xs text-(--destructive)">{errors.department}</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t('employees.position')} *</Label>
                      <Select
                        value={positionId}
                        onValueChange={setPositionId}
                        disabled={!positions?.length}
                      >
                        <SelectTrigger className={errors.position ? 'border-(--destructive)' : ''}>
                          <SelectValue placeholder={t('placeholders.selectPosition')} />
                        </SelectTrigger>
                        <SelectContent>
                          {positions?.map((p) => (
                            <SelectItem key={p._id} value={p._id}>
                              {p.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {positions?.length === 0 && (
                        <p className="text-xs text-(--text-muted)">{t('employees.noPositions')}</p>
                      )}
                      {errors.position && (
                        <p className="text-xs text-(--destructive)">{errors.position}</p>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Step 3: Role & Type */}
              {step === (isSuperadmin ? 3 : 2) && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-5"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                      <Shield className="w-5 h-5 text-purple-500" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-(--text-primary)">
                        {t('wizard.roleType') || 'Role & Type'}
                      </h3>
                      <p className="text-sm text-(--text-muted)">
                        {t('wizard.roleTypeDesc') || 'Set role and employment type'}
                      </p>
                    </div>
                  </div>

                  {/* Role */}
                  <div className="space-y-1.5">
                    <Label>{t('employees.role')}</Label>
                    <Select
                      value={role}
                      onValueChange={(v) => setRole(v as 'admin' | 'supervisor' | 'employee')}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="employee">{t('roles.employee')}</SelectItem>
                        <SelectItem value="supervisor">{t('roles.supervisor')}</SelectItem>
                        <SelectItem value="driver">{t('roles.driver')}</SelectItem>
                        {isActualAdmin && <SelectItem value="admin">{t('roles.admin')}</SelectItem>}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Employee type */}
                  <div className="space-y-1.5">
                    <Label>{t('employees.employeeType')}</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['staff', 'contractor'] as const).map((empType) => {
                        const selected = type === empType;
                        return (
                          <button
                            key={empType}
                            type="button"
                            onClick={() => setType(empType)}
                            className={`relative flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                              selected
                                ? 'btn-gradient border-transparent text-white shadow-md ring-[3px] ring-blue-500/30'
                                : 'border-(--border) bg-(--background-subtle) text-(--text-muted) hover:border-(--border-subtle)'
                            }`}
                          >
                            {selected && <CheckCircle className="w-4 h-4" />}
                            {t(`employees.${empType}`)}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Phone */}
                  <div className="space-y-1.5">
                    <Label htmlFor="emp-phone">{t('common.phone')}</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
                      <Input
                        id="emp-phone"
                        placeholder="+374 91 123456"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Step: Salary */}
              {step === (isSuperadmin ? 4 : 3) && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-5"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                      <DollarSign className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-(--text-primary)">
                        {t('wizard.salaryInfo') || 'Salary'}
                      </h3>
                      <p className="text-sm text-(--text-muted)">
                        {t('wizard.salaryInfoDesc') ||
                          'Set salary — taxes are calculated automatically'}
                      </p>
                    </div>
                  </div>
                  <SalaryCalculatorStep
                    value={salary}
                    onChange={(patch) => setSalary((p) => ({ ...p, ...patch }))}
                  />
                </motion.div>
              )}

              {/* Step: Identity / Passport */}
              {step === (isSuperadmin ? 5 : 4) && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-5"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center">
                      <IdCard className="w-5 h-5 text-sky-500" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-(--text-primary)">
                        {t('wizard.identityInfo') || 'Identity Documents'}
                      </h3>
                      <p className="text-sm text-(--text-muted)">
                        {t('wizard.identityInfoDesc') ||
                          'Passport / ID details — upload a scan to auto-fill'}
                      </p>
                    </div>
                  </div>
                  <PassportFields
                    value={passport}
                    onChange={(patch) => {
                      setPassport((p) => ({ ...p, ...patch }));
                      // A new social card number invalidates the previous SRC
                      // verification — don't persist a stale result.
                      if (patch.socialCardNumber !== undefined) setTaxIdVerifyStatus(null);
                    }}
                    onScanUploaded={setPassportScan}
                    onTaxIdVerified={setTaxIdVerifyStatus}
                  />
                </motion.div>
              )}

              {/* Step 4: Review */}
              {step === effectiveTotalSteps - 1 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-5"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-(--text-primary)">
                        {t('common.review') || 'Review'}
                      </h3>
                      <p className="text-sm text-(--text-muted)">
                        {t('wizard.reviewDesc') || 'Confirm the details before adding'}
                      </p>
                    </div>
                  </div>

                  {/* Summary card */}
                  <div className="rounded-xl border border-(--border) bg-(--background-subtle) overflow-hidden">
                    {/* Avatar preview */}
                    <div className="flex items-center gap-4 p-4 border-b border-(--border)">
                      <div className="w-14 h-14 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center text-xl font-bold shadow-lg">
                        {name.charAt(0).toUpperCase() || 'E'}
                      </div>
                      <div>
                        <p className="font-semibold text-(--text-primary)">{name || '—'}</p>
                        <p className="text-sm text-(--text-muted)">{email || '—'}</p>
                      </div>
                    </div>

                    {/* Details */}
                    <div className="p-4 space-y-2.5">
                      {[
                        { label: t('employees.department'), value: departmentName },
                        { label: t('employees.position'), value: positionName },
                        { label: t('employees.role'), value: t(`roles.${role}`) },
                        { label: t('employees.employeeType'), value: t(`employees.${type}`) },
                        ...(phone ? [{ label: t('common.phone'), value: phone }] : []),
                        ...(registrationDate
                          ? [
                              {
                                label: t('editEmployee.registrationDate'),
                                value: registrationDate,
                              },
                            ]
                          : []),
                        ...(salary.amount > 0
                          ? [
                              {
                                label: `${t('payroll.baseSalary')} (${salary.mode === 'gross' ? t('payroll.grossMode') || 'Gross' : t('payroll.netMode') || 'Net'})`,
                                value: `${salary.amount.toLocaleString()} ${salary.currency}`,
                              },
                            ]
                          : []),
                        ...(passport.passportNumber
                          ? [
                              {
                                label: t('employees.passportNumber'),
                                value: passport.passportNumber,
                              },
                            ]
                          : []),
                        ...(passportScan
                          ? [{ label: t('employees.identity'), value: passportScan.name }]
                          : []),
                      ].map((item, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className="text-(--text-muted)">{item.label}</span>
                          <span className="font-medium text-(--text-primary)">
                            {item.value || '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Travel allowance preview */}
                  <motion.div
                    key={allowance}
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="rounded-lg bg-(--background-subtle) border border-(--border) p-4 flex items-center justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium text-(--text-primary)">
                        {t('employees.travelAllowance')}
                      </p>
                      <p className="text-xs text-(--text-muted) mt-0.5">
                        {type === 'contractor'
                          ? t('employeeTypes.contractor')
                          : t('employeeTypes.staff')}{' '}
                        type
                      </p>
                    </div>
                    <p className="text-xl font-bold text-(--text-primary)">
                      {formatCurrency(allowance, i18n.language)}
                    </p>
                  </motion.div>
                </motion.div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t border-(--border) bg-(--background-subtle)">
          <div className="flex items-center justify-between w-full">
            {step > 0 ? (
              <Button
                type="button"
                variant="outline"
                onClick={prevStep}
                disabled={submitting}
                className="flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" />
                {t('wizard.previous') || 'Previous'}
              </Button>
            ) : (
              <div />
            )}

            {!isLastStep ? (
              <Button type="button" onClick={nextStep} className="flex items-center gap-1">
                {t('wizard.next') || 'Next'}
                <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <ShieldLoader size="xs" variant="inline" />
                    {t('employees.adding') || 'Adding...'}
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    {t('employees.addEmployee')}
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
