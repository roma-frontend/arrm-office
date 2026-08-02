'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import type { ExtendedProfileData } from './ExtendedProfileSection';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  X,
  Save,
  User,
  Briefcase,
  Phone,
  Globe,
  Building2,
  GraduationCap,
  Plus,
  Trash2,
  MapPin,
  Heart,
  Clock,
  CalendarDays,
} from 'lucide-react';
import { ShieldLoader } from '@/components/ui/ShieldLoader';

// ── Types ──
interface WorkSchedule {
  startTime: string;
  endTime: string;
  workingDays: string[];
  flexHours: boolean;
}

interface WorkHistoryEntry {
  company: string;
  position: string;
  startDate: string;
  endDate?: string;
  description?: string;
}

interface EducationEntry {
  institution: string;
  degree: string;
  field: string;
  startDate: string;
  endDate?: string;
  gpa?: string;
}

interface FormData {
  address: string;
  dateOfBirth: string;
  birthYear: string;
  pensionExempt: boolean;
  workFormat: 'remote' | 'office' | 'hybrid' | '';
  workSchedule: WorkSchedule;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelation: string;
  socialLinks: {
    linkedin: string;
    github: string;
    portfolio: string;
  };
  structuredWorkHistory: WorkHistoryEntry[];
  structuredEducation: EducationEntry[];
}

const EMPTY_WORK_HISTORY: WorkHistoryEntry = {
  company: '',
  position: '',
  startDate: '',
  endDate: '',
  description: '',
};

const EMPTY_EDUCATION: EducationEntry = {
  institution: '',
  degree: '',
  field: '',
  startDate: '',
  endDate: '',
  gpa: '',
};

const DEFAULT_SCHEDULE: WorkSchedule = {
  startTime: '09:00',
  endTime: '18:00',
  workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
  flexHours: false,
};

const ALL_WEEK_DAYS = [
  { key: 'monday', label: 'Mon' },
  { key: 'tuesday', label: 'Tue' },
  { key: 'wednesday', label: 'Wed' },
  { key: 'thursday', label: 'Thu' },
  { key: 'friday', label: 'Fri' },
  { key: 'saturday', label: 'Sat' },
  { key: 'sunday', label: 'Sun' },
];

interface EditExtendedProfileModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  employeeId: Id<'users'>;
  organizationId?: Id<'organizations'>;
  initialData: ExtendedProfileData | null | undefined;
}

const TABS = [
  { key: 'personal', icon: User, labelKey: 'extendedProfile.tabPersonal' },
  { key: 'work', icon: Briefcase, labelKey: 'extendedProfile.tabWork' },
  { key: 'emergency', icon: Phone, labelKey: 'extendedProfile.tabEmergency' },
  { key: 'social', icon: Globe, labelKey: 'extendedProfile.tabSocial' },
  { key: 'history', icon: Building2, labelKey: 'extendedProfile.tabHistory' },
  { key: 'education', icon: GraduationCap, labelKey: 'extendedProfile.tabEducation' },
];

export default function EditExtendedProfileModal({
  open,
  onClose,
  onSuccess,
  employeeId,
  organizationId,
  initialData,
}: EditExtendedProfileModalProps) {
  const { t } = useTranslation(['modules', 'common']);
  const [activeTab, setActiveTab] = useState('personal');
  const [saving, setSaving] = useState(false);

  // Build initial form state from initialData or defaults
  const [form, setForm] = useState<FormData>(() => ({
    address: initialData?.address ?? '',
    dateOfBirth: initialData?.dateOfBirth ?? '',
    birthYear: initialData?.birthYear ? String(initialData.birthYear) : '',
    pensionExempt: initialData?.pensionExempt ?? false,
    workFormat: (initialData?.workFormat as 'remote' | 'office' | 'hybrid' | '') ?? '',
    workSchedule: initialData?.workSchedule ?? { ...DEFAULT_SCHEDULE },
    emergencyContactName: initialData?.emergencyContactName ?? '',
    emergencyContactPhone: initialData?.emergencyContactPhone ?? '',
    emergencyContactRelation: initialData?.emergencyContactRelation ?? '',
    socialLinks: {
      linkedin: initialData?.socialLinks?.linkedin ?? '',
      github: initialData?.socialLinks?.github ?? '',
      portfolio: initialData?.socialLinks?.portfolio ?? '',
    },
    structuredWorkHistory: initialData?.structuredWorkHistory?.length
      ? initialData.structuredWorkHistory.map((e) => ({ ...e }))
      : [],
    structuredEducation: initialData?.structuredEducation?.length
      ? initialData.structuredEducation.map((e) => ({ ...e }))
      : [],
  }));

  const updateExtendedProfile = useMutation(api.employeeExtendedProfile.updateExtendedProfile);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateExtendedProfile({
        userId: employeeId,
        ...(organizationId ? { organizationId } : {}),
        address: form.address || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
        birthYear: form.birthYear && Number.isFinite(Number(form.birthYear))
          ? Number(form.birthYear)
          : undefined,
        pensionExempt: form.pensionExempt || undefined,
        workFormat: (form.workFormat as 'remote' | 'office' | 'hybrid') || undefined,
        workSchedule: form.workSchedule,
        emergencyContactName: form.emergencyContactName || undefined,
        emergencyContactPhone: form.emergencyContactPhone || undefined,
        emergencyContactRelation: form.emergencyContactRelation || undefined,
        socialLinks:
          form.socialLinks.linkedin || form.socialLinks.github || form.socialLinks.portfolio
            ? {
                linkedin: form.socialLinks.linkedin || undefined,
                github: form.socialLinks.github || undefined,
                portfolio: form.socialLinks.portfolio || undefined,
              }
            : undefined,
        structuredWorkHistory:
          form.structuredWorkHistory.length > 0 ? form.structuredWorkHistory : undefined,
        structuredEducation:
          form.structuredEducation.length > 0 ? form.structuredEducation : undefined,
      });
      toast.success(t('extendedProfile.saved', 'Extended profile updated successfully'));
      onSuccess();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : t('extendedProfile.saveError', 'Failed to save'),
      );
    } finally {
      setSaving(false);
    }
  };

  const updateField = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // ── Reusable Input ──
  const Input = ({
    label,
    value,
    onChange,
    placeholder,
    type = 'text',
    icon,
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    type?: string;
    icon?: React.ReactNode;
  }) => (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-(--text-muted) flex items-center gap-1.5">
        {icon}
        {label}
      </label>
      {type === 'textarea' ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className="w-full px-3 py-2 rounded-xl border border-(--border) text-sm outline-none transition-all bg-(--input) text-(--text-primary) focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 resize-none"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 rounded-xl border border-(--border) text-sm outline-none transition-all bg-(--input) text-(--text-primary) focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
        />
      )}
    </div>
  );

  // ── Helpers for array updates ──
  const updateWorkEntry = (idx: number, patch: Partial<WorkHistoryEntry>) => {
    setForm((prev) => {
      const copy = prev.structuredWorkHistory.map((e, i) => (i === idx ? { ...e, ...patch } : e));
      return { ...prev, structuredWorkHistory: copy };
    });
  };

  const updateEduEntry = (idx: number, patch: Partial<EducationEntry>) => {
    setForm((prev) => {
      const copy = prev.structuredEducation.map((e, i) => (i === idx ? { ...e, ...patch } : e));
      return { ...prev, structuredEducation: copy };
    });
  };

  const removeWorkEntry = (idx: number) => {
    setForm((prev) => ({
      ...prev,
      structuredWorkHistory: prev.structuredWorkHistory.filter((_, i) => i !== idx),
    }));
  };

  const removeEduEntry = (idx: number) => {
    setForm((prev) => ({
      ...prev,
      structuredEducation: prev.structuredEducation.filter((_, i) => i !== idx),
    }));
  };

  const addWorkEntry = () => {
    setForm((prev) => ({
      ...prev,
      structuredWorkHistory: [...prev.structuredWorkHistory, { ...EMPTY_WORK_HISTORY }],
    }));
  };

  const addEduEntry = () => {
    setForm((prev) => ({
      ...prev,
      structuredEducation: [...prev.structuredEducation, { ...EMPTY_EDUCATION }],
    }));
  };

  // ── Tab Content ──
  const renderTabContent = () => {
    switch (activeTab) {
      case 'personal':
        return (
          <motion.div
            key="personal"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-4"
          >
            <div>
              <h3 className="text-sm font-semibold text-(--text-primary) flex items-center gap-2">
                <Heart className="w-4 h-4 text-rose-500" />
                {t('extendedProfile.personalDetails', 'Personal Details')}
              </h3>
              <p className="text-xs text-(--text-muted) mt-1">
                {t('extendedProfile.personalDetailsDesc', 'Basic personal information')}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label={t('extendedProfile.dateOfBirth', 'Date of Birth')}
                value={form.dateOfBirth}
                onChange={(v) => updateField('dateOfBirth', v)}
                type="date"
                icon={<CalendarDays className="w-3 h-3" />}
              />
              <Input
                label={t('extendedProfile.birthYear', 'Birth Year')}
                value={form.birthYear}
                onChange={(v) => updateField('birthYear', v)}
                type="number"
                placeholder="e.g. 1975"
                icon={<CalendarDays className="w-3 h-3" />}
              />
              <Input
                label={t('extendedProfile.address', 'Address')}
                value={form.address}
                onChange={(v) => updateField('address', v)}
                placeholder="e.g. 123 Main St, Yerevan"
                icon={<MapPin className="w-3 h-3" />}
              />
            </div>

            {/* Pension exemption (Armenia: born before 1974) */}
            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <button
                type="button"
                role="switch"
                aria-checked={form.pensionExempt}
                onClick={() => updateField('pensionExempt', !form.pensionExempt)}
                className={`w-9 h-5 rounded-full transition-all relative ${
                  form.pensionExempt ? 'bg-blue-500' : 'bg-(--border)'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                    form.pensionExempt ? 'left-[18px]' : 'left-[2px]'
                  }`}
                />
              </button>
              <div className="min-w-0">
                <span className="text-xs text-(--text-muted) block">
                  {t('extendedProfile.pensionExempt', 'Exempt from funded pension')}
                </span>
                <span className="text-[11px] text-(--text-muted)/60 block">
                  {t(
                    'extendedProfile.pensionExemptHint',
                    'Armenia: employees born before 1974 are exempt from the mandatory funded pension',
                  )}
                </span>
              </div>
            </label>
          </motion.div>
        );

      case 'work':
        return (
          <motion.div
            key="work"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-4"
          >
            <div>
              <h3 className="text-sm font-semibold text-(--text-primary) flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-amber-500" />
                {t('extendedProfile.workDetails', 'Work Details')}
              </h3>
              <p className="text-xs text-(--text-muted) mt-1">
                {t('extendedProfile.workDetailsDesc', 'Work format, schedule and preferences')}
              </p>
            </div>

            {/* Work Format */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-(--text-muted) flex items-center gap-1.5">
                <Briefcase className="w-3 h-3" />
                {t('extendedProfile.workFormat', 'Work Format')}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  {
                    value: 'remote',
                    label: t('extendedProfile.workFormatRemote', 'Remote'),
                    icon: '🏠',
                  },
                  {
                    value: 'office',
                    label: t('extendedProfile.workFormatOffice', 'Office'),
                    icon: '🏢',
                  },
                  {
                    value: 'hybrid',
                    label: t('extendedProfile.workFormatHybrid', 'Hybrid'),
                    icon: '🔄',
                  },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateField('workFormat', opt.value as FormData['workFormat'])}
                    className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-xs font-medium transition-all ${
                      form.workFormat === opt.value
                        ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                        : 'border-(--border) bg-(--background-subtle) text-(--text-muted) hover:border-(--border)/60'
                    }`}
                  >
                    <span className="text-lg">{opt.icon}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Schedule */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-(--text-muted) flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                {t('extendedProfile.workSchedule', 'Work Schedule')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label={t('extendedProfile.startTime', 'Start')}
                  value={form.workSchedule.startTime}
                  onChange={(v) =>
                    setForm((p) => ({
                      ...p,
                      workSchedule: { ...p.workSchedule, startTime: v },
                    }))
                  }
                  type="time"
                />
                <Input
                  label={t('extendedProfile.endTime', 'End')}
                  value={form.workSchedule.endTime}
                  onChange={(v) =>
                    setForm((p) => ({
                      ...p,
                      workSchedule: { ...p.workSchedule, endTime: v },
                    }))
                  }
                  type="time"
                />
              </div>
              {/* Working Days */}
              <div className="flex flex-wrap gap-1.5 mt-1">
                {ALL_WEEK_DAYS.map((day) => {
                  const isSelected = form.workSchedule.workingDays.includes(day.key);
                  return (
                    <button
                      key={day.key}
                      type="button"
                      onClick={() =>
                        setForm((p) => ({
                          ...p,
                          workSchedule: {
                            ...p.workSchedule,
                            workingDays: isSelected
                              ? p.workSchedule.workingDays.filter((d) => d !== day.key)
                              : [...p.workSchedule.workingDays, day.key],
                          },
                        }))
                      }
                      className={`text-[11px] px-2.5 py-1 rounded-lg font-medium transition-all border ${
                        isSelected
                          ? 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400'
                          : 'bg-(--background-subtle) border-(--border) text-(--text-muted)/60'
                      }`}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
              {/* Flex Hours */}
              <label className="flex items-center gap-2 cursor-pointer">
                <button
                  type="button"
                  onClick={() =>
                    setForm((p) => ({
                      ...p,
                      workSchedule: { ...p.workSchedule, flexHours: !p.workSchedule.flexHours },
                    }))
                  }
                  className={`w-9 h-5 rounded-full transition-all relative ${
                    form.workSchedule.flexHours ? 'bg-blue-500' : 'bg-(--border)'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                      form.workSchedule.flexHours ? 'left-[18px]' : 'left-[2px]'
                    }`}
                  />
                </button>
                <span className="text-xs text-(--text-muted)">
                  {t('extendedProfile.flexHours', 'Flexible hours')}
                </span>
              </label>
            </div>
          </motion.div>
        );

      case 'emergency':
        return (
          <motion.div
            key="emergency"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-4"
          >
            <div>
              <h3 className="text-sm font-semibold text-(--text-primary) flex items-center gap-2">
                <Phone className="w-4 h-4 text-red-500" />
                {t('extendedProfile.emergencyContact', 'Emergency Contact')}
              </h3>
              <p className="text-xs text-(--text-muted) mt-1">
                {t('extendedProfile.emergencyDesc', 'Who to contact in case of emergency')}
              </p>
            </div>
            <div className="space-y-3">
              <Input
                label={t('extendedProfile.contactName', 'Full Name')}
                value={form.emergencyContactName}
                onChange={(v) => updateField('emergencyContactName', v)}
                placeholder="e.g. Jane Doe"
                icon={<User className="w-3 h-3" />}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label={t('extendedProfile.contactPhone', 'Phone Number')}
                  value={form.emergencyContactPhone}
                  onChange={(v) => updateField('emergencyContactPhone', v)}
                  placeholder="+374 XX XXX XXX"
                  icon={<Phone className="w-3 h-3" />}
                />
                <Input
                  label={t('extendedProfile.contactRelation', 'Relationship')}
                  value={form.emergencyContactRelation}
                  onChange={(v) => updateField('emergencyContactRelation', v)}
                  placeholder="e.g. Spouse, Parent"
                  icon={<Heart className="w-3 h-3" />}
                />
              </div>
            </div>
          </motion.div>
        );

      case 'social':
        return (
          <motion.div
            key="social"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-4"
          >
            <div>
              <h3 className="text-sm font-semibold text-(--text-primary) flex items-center gap-2">
                <Globe className="w-4 h-4 text-purple-500" />
                {t('extendedProfile.socialLinks', 'Social Links')}
              </h3>
              <p className="text-xs text-(--text-muted) mt-1">
                {t('extendedProfile.socialLinksDesc', 'Professional profiles and portfolio')}
              </p>
            </div>
            <div className="space-y-3">
              <Input
                label="LinkedIn"
                value={form.socialLinks.linkedin}
                onChange={(v) =>
                  setForm((p) => ({ ...p, socialLinks: { ...p.socialLinks, linkedin: v } }))
                }
                placeholder="https://linkedin.com/in/..."
                icon={<Globe className="w-3 h-3" />}
              />
              <Input
                label="GitHub"
                value={form.socialLinks.github}
                onChange={(v) =>
                  setForm((p) => ({ ...p, socialLinks: { ...p.socialLinks, github: v } }))
                }
                placeholder="https://github.com/..."
                icon={<Globe className="w-3 h-3" />}
              />
              <Input
                label={t('extendedProfile.portfolio', 'Portfolio')}
                value={form.socialLinks.portfolio}
                onChange={(v) =>
                  setForm((p) => ({ ...p, socialLinks: { ...p.socialLinks, portfolio: v } }))
                }
                placeholder="https://..."
                icon={<Globe className="w-3 h-3" />}
              />
            </div>
          </motion.div>
        );

      case 'history':
        return (
          <motion.div
            key="history"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-(--text-primary) flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-emerald-500" />
                  {t('extendedProfile.workHistory', 'Work History')}
                </h3>
                <p className="text-xs text-(--text-muted) mt-1">
                  {t('extendedProfile.workHistoryDesc', 'Previous employment and experience')}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={addWorkEntry} className="gap-1">
                <Plus className="w-3.5 h-3.5" />
                {t('common.add', 'Add')}
              </Button>
            </div>

            <AnimatePresence mode="popLayout">
              {form.structuredWorkHistory.length === 0 ? (
                <div className="text-center py-8 text-(--text-muted) text-sm border border-dashed border-(--border) rounded-xl">
                  <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  {t('extendedProfile.noHistory', 'No work history entries')}
                </div>
              ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                  {form.structuredWorkHistory.map((entry, idx) => (
                    <motion.div
                      key={idx}
                      layout
                      initial={{ opacity: 0, y: -8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.97 }}
                      className="p-3 rounded-xl border border-(--border) bg-(--background-subtle)/50 space-y-2 relative group/entry"
                    >
                      <button
                        onClick={() => removeWorkEntry(idx)}
                        className="absolute top-2 right-2 p-1 rounded-lg text-red-400 opacity-0 group-hover/entry:opacity-100 hover:bg-red-500/10 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Input
                          label={t('extendedProfile.company', 'Company')}
                          value={entry.company}
                          onChange={(v) => updateWorkEntry(idx, { company: v })}
                          placeholder="Company name"
                        />
                        <Input
                          label={t('extendedProfile.position', 'Position')}
                          value={entry.position}
                          onChange={(v) => updateWorkEntry(idx, { position: v })}
                          placeholder="Job title"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          label={t('extendedProfile.startDate', 'Start')}
                          value={entry.startDate}
                          onChange={(v) => updateWorkEntry(idx, { startDate: v })}
                          type="month"
                        />
                        <Input
                          label={t('extendedProfile.endDate', 'End')}
                          value={entry.endDate ?? ''}
                          onChange={(v) => updateWorkEntry(idx, { endDate: v || undefined })}
                          type="month"
                          placeholder="Present"
                        />
                      </div>
                      <Input
                        label={t('extendedProfile.description', 'Description')}
                        value={entry.description ?? ''}
                        onChange={(v) => updateWorkEntry(idx, { description: v || undefined })}
                        type="textarea"
                        placeholder="Describe your role and achievements..."
                      />
                    </motion.div>
                  ))}
                </div>
              )}
            </AnimatePresence>
          </motion.div>
        );

      case 'education':
        return (
          <motion.div
            key="education"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-(--text-primary) flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-sky-500" />
                  {t('extendedProfile.education', 'Education')}
                </h3>
                <p className="text-xs text-(--text-muted) mt-1">
                  {t('extendedProfile.educationDesc', 'Academic background and qualifications')}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={addEduEntry} className="gap-1">
                <Plus className="w-3.5 h-3.5" />
                {t('common.add', 'Add')}
              </Button>
            </div>

            <AnimatePresence mode="popLayout">
              {form.structuredEducation.length === 0 ? (
                <div className="text-center py-8 text-(--text-muted) text-sm border border-dashed border-(--border) rounded-xl">
                  <GraduationCap className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  {t('extendedProfile.noEducation', 'No education entries')}
                </div>
              ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                  {form.structuredEducation.map((entry, idx) => (
                    <motion.div
                      key={idx}
                      layout
                      initial={{ opacity: 0, y: -8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.97 }}
                      className="p-3 rounded-xl border border-(--border) bg-(--background-subtle)/50 space-y-2 relative group/entry"
                    >
                      {' '}
                      <button
                        onClick={() => removeEduEntry(idx)}
                        className="absolute top-2 right-2 p-1 rounded-lg text-red-400 opacity-0 group-hover/entry:opacity-100 hover:bg-red-500/10 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Input
                          label={t('extendedProfile.institution', 'Institution')}
                          value={entry.institution}
                          onChange={(v) => updateEduEntry(idx, { institution: v })}
                          placeholder="University / School"
                        />
                        <Input
                          label={t('extendedProfile.degree', 'Degree')}
                          value={entry.degree}
                          onChange={(v) => updateEduEntry(idx, { degree: v })}
                          placeholder="e.g. Bachelor's"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <Input
                          label={t('extendedProfile.field', 'Field')}
                          value={entry.field}
                          onChange={(v) => updateEduEntry(idx, { field: v })}
                          placeholder="e.g. Computer Science"
                        />
                        <Input
                          label={t('extendedProfile.startDate', 'Start')}
                          value={entry.startDate}
                          onChange={(v) => updateEduEntry(idx, { startDate: v })}
                          type="month"
                        />
                        <Input
                          label={t('extendedProfile.endDate', 'End')}
                          value={entry.endDate ?? ''}
                          onChange={(v) => updateEduEntry(idx, { endDate: v || undefined })}
                          type="month"
                          placeholder="Present"
                        />
                      </div>
                      <Input
                        label="GPA"
                        value={entry.gpa ?? ''}
                        onChange={(v) => updateEduEntry(idx, { gpa: v || undefined })}
                        placeholder="e.g. 3.8"
                      />
                    </motion.div>
                  ))}
                </div>
              )}
            </AnimatePresence>
          </motion.div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[95vh] p-0 flex flex-col">
        {/* Header */}
        <div className="relative overflow-hidden rounded-t-2xl">
          <div className="absolute inset-0 bg-linear-to-br from-blue-600/20 to-purple-600/20" />
          <div className="relative z-10 px-6 pt-6 pb-4">
            <DialogTitle className="text-lg font-bold text-(--text-primary) flex items-center gap-2">
              <User className="w-5 h-5 text-(--primary)" />
              {t('extendedProfile.editTitle', 'Edit Extended Profile')}
            </DialogTitle>
            <DialogDescription className="text-sm text-(--text-muted) mt-1">
              {t(
                'extendedProfile.editDesc',
                'Manage personal details, work preferences, history and more',
              )}
            </DialogDescription>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto gap-1 px-6 py-3 border-b border-(--border) bg-(--background-subtle)/30">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-(--primary)/10 text-(--primary) shadow-xs'
                    : 'text-(--text-muted) hover:text-(--text-primary) hover:bg-(--background-subtle)'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t(tab.labelKey)}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-[300px]">
          <AnimatePresence mode="wait">{renderTabContent()}</AnimatePresence>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-(--border) flex items-center justify-between bg-(--background-subtle)/30">
          <Button variant="ghost" size="sm" onClick={onClose} className="gap-1">
            <X className="w-4 h-4" />
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            size="sm"
            className="gap-2 bg-linear-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-md"
          >
            {saving ? <ShieldLoader size="xs" variant="inline" /> : <Save className="w-4 h-4" />}
            {saving ? t('common.saving', 'Saving...') : t('common.save', 'Save Changes')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
