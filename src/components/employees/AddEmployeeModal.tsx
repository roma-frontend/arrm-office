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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { WizardStepper } from '@/components/ui/wizard-stepper';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { resolveTravelAllowance } from '@/lib/travelAllowance';
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
import type { SupportedLocale } from '@/lib/date-format';
import {
  DEFAULT_HIRING_PACKET,
  HIRING_PACKET_MANDATORY,
  getCatalogTemplate,
  localizedContent,
} from '@/lib/documentCatalog';
import { LOCALE_CAPTIONS, PRIMARY_LOCALE } from '@/lib/hiringPacketDocument';
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
  FileText,
  Languages,
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
  const generateHiringPacket = useMutation(api.hiringPackets.generate);
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
  // Kept as a string so "" can mean "no individual amount — follow the policy",
  // which 0 cannot (0 is a valid deliberate override).
  const [travelAllowance, setTravelAllowance] = useState('');
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
  /**
   * Date of birth (`YYYY-MM-DD`). Auto-filled from the passport MRZ scan when
   * available; required by the personal-data and biometric consent documents.
   */
  const [dateOfBirth, setDateOfBirth] = useState('');
  /**
   * Second language of the employee's hiring documents. Armenian is always the
   * first column (it is the legally binding text), so this picks what goes in
   * the right-hand column. Defaults to the admin's current UI language.
   */
  const [documentLanguage, setDocumentLanguage] = useState<SupportedLocale>('ru');
  /** ՀԾՀ — Armenian national ID / SSN (10-digit). */
  const [nationalId, setNationalId] = useState('');
  /** Whether the employee has mandatory health insurance. */
  const [healthInsured, setHealthInsured] = useState(false);
  /** Generate the bilingual hiring packet right after the employee is created. */
  const [generatePacket, setGeneratePacket] = useState(true);
  const [taxIdVerifyStatus, setTaxIdVerifyStatus] = useState<
    | 'verified'
    | 'not_found'
    | 'valid_local'
    | 'invalid_checksum'
    | 'invalid_format'
    | 'error'
    | null
  >(null);

  // Travel allowance is a per-organization policy (Payroll → Settings), not a
  // constant and not something derivable from the email address. When the target
  // org has no policy, or has it disabled, the preview below is hidden entirely.
  //
  // Both guards matter. The payroll settings query is supervisor-and-above only
  // (convex/payroll/queries.ts), and this modal stays *mounted* while closed on
  // /employees — so without them a plain employee merely visiting the page fires
  // an admin-only query and gets "Insufficient permissions" thrown into the
  // render tree.
  const canReadPayrollSettings =
    isSuperadmin || currentUser?.role === 'admin' || currentUser?.role === 'supervisor';
  const salarySettings = useQuery(
    api.payroll.queries.getSalarySettings,
    open && canReadPayrollSettings && targetOrgId
      ? { organizationId: targetOrgId as Id<'organizations'> }
      : 'skip',
  );
  const travelAllowancePolicy = salarySettings?.travelAllowance;
  const allowance = resolveTravelAllowance(travelAllowancePolicy, type);
  /** What this hire will actually be paid once created — shown on the review step. */
  const effectiveTravelAllowance = (() => {
    const raw = travelAllowance.trim();
    if (raw === '') return allowance;
    const amount = Number(raw);
    return Number.isFinite(amount) && amount >= 0 ? amount : allowance;
  })();

  /**
   * Sensible default for the second document language: the admin's own UI
   * language. Armenian is excluded because it already occupies the primary
   * column — a document with Armenian on both sides is pointless.
   */
  const defaultDocumentLanguage = useMemo<SupportedLocale>(() => {
    const lang = (i18n.language?.slice(0, 2) ?? '') as SupportedLocale;
    return lang === 'ru' || lang === 'en' || lang === 'de' ? lang : 'ru';
  }, [i18n.language]);

  /** Templates that make up the packet, with their localized primary titles. */
  const packetPreview = useMemo(
    () =>
      DEFAULT_HIRING_PACKET.map((id) => {
        const template = getCatalogTemplate(id);
        return {
          id,
          title: template ? localizedContent(template, documentLanguage).title : id,
          mandatory: HIRING_PACKET_MANDATORY.includes(id),
        };
      }),
    [documentLanguage],
  );

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
    setTravelAllowance('');
    setSalary({
      mode: 'gross',
      amount: 0,
      currency: TAX_RULES.armenia.currency,
      country: 'armenia',
    });
    setPassport(EMPTY_PASSPORT);
    setPassportScan(null);
    setDateOfBirth('');
    setDocumentLanguage(defaultDocumentLanguage);
    setGeneratePacket(true);
    setTaxIdVerifyStatus(null);
    setErrors({});
  }, [defaultDocumentLanguage]);

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
      travelAllowance,
      salary,
      passport,
      passportScan,
      dateOfBirth,
      documentLanguage,
      generatePacket,
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
      travelAllowance,
      salary,
      passport,
      passportScan,
      dateOfBirth,
      documentLanguage,
      generatePacket,
    ],
  );

  const handleRestoreDraft = useCallback(
    (d: typeof draftData, savedStep: number) => {
      setName(d.name ?? '');
      setEmail(d.email ?? '');
      setDepartmentId(d.departmentId ?? '');
      setPositionId(d.positionId ?? '');
      setPhone(d.phone ?? '');
      if (d.role) setRole(d.role);
      if (d.type) setType(d.type);
      setSelectedOrgId(d.selectedOrgId ?? '');
      setRegistrationDate(d.registrationDate ?? '');
      setTravelAllowance(d.travelAllowance ?? '');
      if (d.salary) setSalary((p) => ({ ...p, ...d.salary }));
      if (d.passport) setPassport((p) => ({ ...p, ...d.passport }));
      setPassportScan(d.passportScan ?? null);
      setDateOfBirth(d.dateOfBirth ?? '');
      if (d.documentLanguage) setDocumentLanguage(d.documentLanguage);
      if (typeof d.generatePacket === 'boolean') setGeneratePacket(d.generatePacket);
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
      documentLanguage: defaultDocumentLanguage,
      generatePacket: true,
      salary: {
        mode: 'gross' as const,
        amount: 0,
        currency: TAX_RULES[orgCountry].currency,
        country: orgCountry,
      },
    }),
    [orgCountry, defaultDocumentLanguage],
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

  /** Empty means "follow the org policy"; anything else must be a valid amount. */
  const travelAllowanceError = (): string | null => {
    const raw = travelAllowance.trim();
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

    if (currentStep === (isSuperadmin ? 4 : 3)) {
      const allowanceError = travelAllowanceError();
      if (allowanceError) errs.travelAllowance = allowanceError;
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
    // The allowance lives on an earlier step than the create button, so it has
    // to be re-checked here rather than trusting the current step's validation.
    const allowanceError = travelAllowanceError();
    if (allowanceError) {
      setErrors((p) => ({ ...p, travelAllowance: allowanceError }));
      toast.error(allowanceError);
      return;
    }
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
        ...(dateOfBirth ? { dateOfBirth } : {}),
        // null/omitted follows the organization policy; a number pins this hire
        // to that amount from day one.
        travelAllowance: travelAllowance.trim() === '' ? null : Number(travelAllowance.trim()),
        language: documentLanguage,
        nationalId: nationalId || undefined,
        healthInsured: healthInsured,
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
        }).catch(() => {
          toast.warning('Tax ID verification could not be saved');
        });
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
        }).catch(() => {
          toast.warning('Passport scan upload failed');
        });
      }

      // Generate the bilingual hiring packet (Armenian + the chosen language).
      // Non-fatal: the employee already exists, and the packet can be generated
      // later from their profile, so a failure here must not look like the whole
      // creation failed.
      let packetGenerated = false;
      if (generatePacket && newUserId) {
        try {
          await generateHiringPacket({
            userId: newUserId,
            secondaryLocale: documentLanguage,
            templateIds: [...DEFAULT_HIRING_PACKET],
            mandatoryTemplateIds: [...HIRING_PACKET_MANDATORY],
          });
          packetGenerated = true;
        } catch (packetError) {
          toast.warning(
            packetError instanceof Error
              ? packetError.message
              : t(
                  'hiringPacket.generateFailed',
                  'The employee was created, but the document packet could not be generated. You can generate it from their profile.',
                ),
          );
        }
      }

      toast.success(
        packetGenerated
          ? t('hiringPacket.createdWithPacket', {
              count: DEFAULT_HIRING_PACKET.length,
              defaultValue: `Employee created — ${DEFAULT_HIRING_PACKET.length} documents prepared for signature`,
            })
          : t('success.created'),
      );
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

  const stepperSteps = steps.map((s, i) => ({ id: `step-${i}`, title: s.label }));

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} modal={false}>
      <SheetContent side="right" size="lg" closeLabel={t('common.close', 'Close')}>
        {/* Header.
            The brand-gradient banner this replaces forced white-on-blue text,
            which put the panel outside the type and colour scale entirely and
            made the form below look like a different product. The accent is now
            a single 40px tile — one accent element, as everywhere else. */}
        <SheetHeader className="gap-3.5">
          <div className="flex items-center gap-3">
            <span className="btn-gradient flex size-10 shrink-0 items-center justify-center rounded-card">
              <UserPlus className="size-5" />
            </span>
            <div className="min-w-0">
              <SheetTitle>{t('employees.addEmployee')}</SheetTitle>
              <SheetDescription>{t('employees.enterDetails')}</SheetDescription>
            </div>
          </div>

          <WizardStepper steps={stepperSteps} current={step} onStepClick={setStep} labels="none" />
          <div className="flex items-center justify-between">
            <span className="eyebrow num">
              {t('common.step') || 'Step'} {step + 1} / {effectiveTotalSteps}
            </span>
            <span className="text-caption font-medium text-(--text-secondary)">
              {steps[step]?.label}
            </span>
          </div>
        </SheetHeader>

        {/* Content */}
        <SheetBody>
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
                    <div className="w-10 h-10 rounded-xl bg-(--brand-quiet) flex items-center justify-center">
                      <User className="w-5 h-5 text-(--brand-text)" />
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
                    <div className="w-10 h-10 rounded-xl bg-(--warning-quiet) flex items-center justify-center">
                      <Briefcase className="w-5 h-5 text-(--warning-text)" />
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
                            (p) =>
                              p._id === positionId && (!p.departmentId || p.departmentId === v),
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
                        <p className="text-xs text-(--text-muted)">
                          {t('employees.noDepartments')}
                        </p>
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
                    <div className="w-10 h-10 rounded-xl bg-(--purple-quiet) flex items-center justify-center">
                      <Shield className="w-5 h-5 text-(--purple-text)" />
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
                                ? 'btn-gradient border-transparent text-white shadow-md ring-[3px] ring-(--brand-text)'
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
                    <div className="w-10 h-10 rounded-xl bg-(--success-quiet) flex items-center justify-center">
                      <DollarSign className="w-5 h-5 text-(--success-text)" />
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

                  {/* Travel allowance — org policy by default, editable per hire */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">{t('employees.travelAllowance')}</label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={travelAllowance}
                      onChange={(e) => {
                        setTravelAllowance(e.target.value);
                        setErrors((p) => ({ ...p, travelAllowance: '' }));
                      }}
                      placeholder={travelAllowancePolicy?.enabled ? String(allowance) : '0'}
                      className={`w-full px-3 py-2 rounded-xl border text-sm outline-none transition-all ${
                        errors.travelAllowance ? 'border-(--danger-outline)' : ''
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
                            amount: formatCurrency(allowance, i18n.language),
                          })
                        : t('employees.travelAllowanceHintNoPolicy')}
                    </p>
                    {errors.travelAllowance && (
                      <p className="text-xs text-(--danger-text)">{errors.travelAllowance}</p>
                    )}
                  </div>
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
                    <div className="w-10 h-10 rounded-xl bg-(--brand-quiet) flex items-center justify-center">
                      <IdCard className="w-5 h-5 text-(--brand-text)" />
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
                    onDateOfBirth={setDateOfBirth}
                  />

                  <div className="space-y-2">
                    <Label htmlFor="employee-dob" className="flex items-center gap-2">
                      <CalendarDays className="w-4 h-4 text-(--text-muted)" />
                      {t('employees.dateOfBirth', 'Date of birth')}
                    </Label>
                    <Input
                      id="employee-dob"
                      type="date"
                      value={dateOfBirth}
                      max={toLocalDateString(Date.now())}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                    />
                    <p className="text-xs text-(--text-muted)">
                      {t(
                        'employees.dateOfBirthHint',
                        'Auto-filled from the passport scan. Required by the personal data and biometric consent forms.',
                      )}
                    </p>
                  </div>

                  {/* ── National ID (ՀԾՀ) & Health Insurance ─────────── */}
                  <div className="rounded-xl border border-(--border) bg-(--background-subtle) p-4 space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-(--text-primary) text-sm">
                          {t('employees.nationalIdSection', 'National ID & Insurance')}
                        </p>
                        <p className="text-xs text-(--text-muted)">
                          {t(
                            'employees.nationalIdSectionHint',
                            'Armenian national ID and health insurance status',
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="employee-nationalId">
                          {t('employees.nationalId', 'ՀԾՀ (National ID)')}
                        </Label>
                        <Input
                          id="employee-nationalId"
                          value={nationalId}
                          onChange={(e) => setNationalId(e.target.value)}
                          placeholder="10 digits"
                          maxLength={10}
                          pattern="\d{10}"
                        />
                        <p className="text-xs text-(--text-muted)">
                          {t(
                            'employees.nationalIdHint',
                            '10-digit Armenian national identification number',
                          )}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={healthInsured}
                            onChange={(e) => setHealthInsured(e.target.checked)}
                            className="rounded border-(--border)"
                          />
                          {t('employees.healthInsured', 'Mandatory Health Insurance')}
                        </Label>
                        <p className="text-xs text-(--text-muted)">
                          {t(
                            'employees.healthInsuredHint',
                            'Employee participates in mandatory health insurance',
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* ── Hiring document packet ──────────────────────────── */}
                  <div className="rounded-xl border border-(--border) bg-(--background-subtle) p-4 space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-(--text-primary) text-sm">
                          {t('hiringPacket.title', 'Hiring document packet')}
                        </p>
                        <p className="text-xs text-(--text-muted)">
                          {t(
                            'hiringPacket.subtitle',
                            'Generated in two columns on one A4 page: Armenian is mandatory, the second language is chosen below.',
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="document-language" className="flex items-center gap-2">
                        <Languages className="w-4 h-4 text-(--text-muted)" />
                        {t('hiringPacket.secondLanguage', 'Second document language')}
                      </Label>
                      <Select
                        value={documentLanguage}
                        onValueChange={(value) => setDocumentLanguage(value as SupportedLocale)}
                      >
                        <SelectTrigger id="document-language">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(['ru', 'en', 'de'] as const).map((locale) => (
                            <SelectItem key={locale} value={locale}>
                              {LOCALE_CAPTIONS[PRIMARY_LOCALE]} + {LOCALE_CAPTIONS[locale]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border-(--border) accent-[var(--primary)]"
                        checked={generatePacket}
                        onChange={(e) => setGeneratePacket(e.target.checked)}
                      />
                      <span className="text-sm text-(--text-primary)">
                        {t('hiringPacket.generateNow', {
                          count: DEFAULT_HIRING_PACKET.length,
                          defaultValue: `Prepare ${DEFAULT_HIRING_PACKET.length} documents now`,
                        })}
                        <span className="block text-xs text-(--text-muted)">
                          {t(
                            'hiringPacket.generateNowHint',
                            'You can review, edit in Word and send them for signature from the employee profile.',
                          )}
                        </span>
                      </span>
                    </label>

                    {generatePacket && (
                      <ul className="space-y-1 pt-1">
                        {packetPreview.map((doc) => (
                          <li
                            key={doc.id}
                            className="flex items-center gap-2 text-xs text-(--text-muted)"
                          >
                            <CheckCircle className="w-3 h-3 text-(--success-text) shrink-0" />
                            <span className="truncate">{doc.title}</span>
                            {doc.mandatory && (
                              <span className="ml-auto shrink-0 rounded bg-(--warning-quiet) px-1.5 py-0.5 text-[10px] font-medium text-(--warning-text)">
                                {t('hiringPacket.mandatory', 'required')}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
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
                    <div className="w-10 h-10 rounded-xl bg-(--success-quiet) flex items-center justify-center">
                      <CheckCircle className="w-5 h-5 text-(--success-text)" />
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

                  {/* Travel allowance preview — the amount this hire will actually
                      be paid, so an individual amount shows here too and not just
                      the policy default. Hidden only when neither applies. */}
                  {(travelAllowancePolicy?.enabled || effectiveTravelAllowance > 0) && (
                    <motion.div
                      key={effectiveTravelAllowance}
                      initial={{ scale: 0.95, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="rounded-lg bg-(--background-subtle) border border-(--border) p-4 flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium text-(--text-primary)">
                          {t('employees.travelAllowance')}
                        </p>
                        <p className="text-xs text-(--text-muted) mt-0.5">
                          {t(`employees.${type}`)}
                        </p>
                      </div>
                      <p className="text-xl font-bold text-(--text-primary)">
                        {formatCurrency(effectiveTravelAllowance, i18n.language)}
                      </p>
                    </motion.div>
                  )}
                </motion.div>
              )}
            </motion.div>
          </AnimatePresence>
        </SheetBody>

        {/* Footer */}
        <SheetFooter className="justify-between">
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
            <Button
              type="button"
              onClick={nextStep}
              className="btn-gradient flex items-center gap-1"
            >
              {t('wizard.next') || 'Next'}
              <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="btn-gradient flex items-center gap-2"
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
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
