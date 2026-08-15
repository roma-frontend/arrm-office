'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
// cspell:disable
import { useAuthStore } from '@/store/useAuthStore';
// cspell:enable
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Building2,
  ArrowLeft,
  AtSign,
  Globe2,
  Clock,
  Briefcase,
  Hash,
  Sparkles,
  ShieldAlert,
  Loader2,
  Crown,
  Rocket,
  Zap,
  Lightbulb,
  CheckCircle2,
  Check,
} from 'lucide-react';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { logger } from '@/lib/logger';

type Plan = 'starter' | 'professional' | 'enterprise';

interface PlanCard {
  value: Plan;
  Icon: React.ComponentType<{ className?: string }>;
  iconWrap: string;
  ringActive: string;
  badge?: 'popular';
}

const PLAN_CARDS: PlanCard[] = [
  {
    value: 'starter',
    Icon: Rocket,
    iconWrap:
      'bg-(--badge-secondary-bg) text-(--badge-secondary-text) border border-(--badge-secondary-border)',
    ringActive: 'ring-(--badge-secondary-text)/40 border-(--badge-secondary-text)/50',
  },
  {
    value: 'professional',
    Icon: Zap,
    iconWrap:
      'bg-(--badge-primary-bg) text-(--badge-primary-text) border border-(--badge-primary-border)',
    ringActive: 'ring-(--primary)/50 border-(--primary)/70',
    badge: 'popular',
  },
  {
    value: 'enterprise',
    Icon: Crown,
    iconWrap:
      'bg-(--badge-purple-bg) text-(--badge-purple-text) border border-(--badge-purple-border)',
    ringActive: 'ring-(--purple)/50 border-(--purple)/70',
  },
];

const TIMEZONES: { value: string; label: string }[] = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'Europe/London', label: 'London (GMT)' },
  { value: 'Europe/Paris', label: 'Paris (CET)' },
  { value: 'Europe/Moscow', label: 'Moscow (MSK)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Yerevan', label: 'Yerevan (AMT)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function getInitials(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const parts = trimmed.split(/\s+/).slice(0, 2);
  return parts
    .map((p) => p.charAt(0))
    .join('')
    .toUpperCase();
}

export default function SuperadminCreateOrgPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuthStore();
  const createOrg = useMutation(api.organizations.createOrganization);

  const [loading, setLoading] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    plan: 'starter' as Plan,
    timezone: 'UTC',
    country: '',
    industry: '',
    adminEmail: '',
  });

  // Hooks that derive from form state — must run on every render
  const initials = useMemo(() => getInitials(formData.name), [formData.name]);

  // ── Loading user state ────────────────────────────────────────
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-(--background)">
        <ShieldLoader size="lg" />
      </div>
    );
  }

  const isSuperadmin = user?.role === 'superadmin';

  // ── Access denied state ───────────────────────────────────────
  if (!isSuperadmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-(--background) p-6">
        <div className="max-w-md w-full rounded-2xl border border-(--border) bg-(--card) p-8 text-center shadow-lg animate-fade-in-up">
          <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-(--button-danger-bg) text-(--button-danger-text)">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-(--text-primary) mb-2">{t('ui.accessDenied')}</h1>
          <p className="text-sm text-(--text-secondary)">{t('ui.onlySuperadminCanAccess')}</p>
          <p className="mt-4 text-xs text-(--text-muted)">
            {t('ui.yourEmail')} <span className="font-medium">{user.email}</span> · {t('ui.role')}{' '}
            <span className="font-medium">{user.role}</span>
          </p>
        </div>
      </div>
    );
  }

  const updateField = <K extends keyof typeof formData>(key: K, value: (typeof formData)[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleNameChange = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      name: value,
      slug: slugTouched ? prev.slug : slugify(value),
    }));
  };

  const handleSlugChange = (value: string) => {
    setSlugTouched(true);
    updateField('slug', slugify(value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user?.id) {
      toast.error(t('toasts.userIdNotFound'));
      return;
    }

    if (!formData.name || !formData.slug || !formData.adminEmail) {
      toast.error(t('toasts.pleaseFillAllFields'));
      return;
    }

    setLoading(true);

    try {
      toast.info(t('superadmin.creatingOrg', { name: formData.name }));

      await createOrg({
        superadminUserId: user.id as never,
        name: formData.name,
        slug: formData.slug,
        plan: formData.plan,
        timezone: formData.timezone,
        country: formData.country,
        industry: formData.industry,
      });

      toast.success(t('superadmin.orgCreated', { name: formData.name }));
      toast.info(t('superadmin.adminInviteSent', { email: formData.adminEmail }));

      setFormData({
        name: '',
        slug: '',
        plan: 'starter',
        timezone: 'UTC',
        country: '',
        industry: '',
        adminEmail: '',
      });
      setSlugTouched(false);

      // Optionally route back to org list
      // router.push('/superadmin/organizations');
    } catch (error) {
      const message = error instanceof Error ? error.message : t('superadmin.orgCreateFailed');
      logger.error('Full error:', error);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const previewSlug = formData.slug || t('superadmin.organizations.previewSlug');
  const previewName = formData.name || t('superadmin.organizations.previewName');

  return (
    <div className="min-h-screen">
      {/* ── Sticky Header ─────────────────────────────────────── */}
      <div className="sticky top-0 z-20 border-b border-(--border) bg-(--background)/85 backdrop-blur supports-[backdrop-filter]:bg-(--background)/70">
        <div className="mx-auto max-w-7xl py-4">
          <button
            type="button"
            onClick={() => router.push('/superadmin/organizations')}
            className="inline-flex items-center gap-1.5 text-sm text-(--text-muted) hover:text-(--primary-hover) transition-colors mb-3"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('ui.backToOrganizations')}
          </button>

          <div className="flex items-start gap-4">
            <div className="btn-gradient flex h-12 w-12 items-center justify-center rounded-2xl shadow-md shrink-0">
              <Building2 className="h-6 w-6 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-(--text-primary)">
                {t('superadmin.organizations.createTitle')}
              </h1>
              <p className="mt-1 text-sm text-(--text-secondary)">
                {t('superadmin.organizations.createSubtitle')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────── */}
      <div className="mx-auto max-w-7xl py-6 lg:py-8">
        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in"
        >
          {/* ───────── Left column: form sections ───────── */}
          <div className="lg:col-span-2 space-y-6">
            {/* SECTION: Basic Information */}
            <SectionCard
              icon={<Sparkles className="h-5 w-5" />}
              title={t('superadmin.organizations.sectionBasic')}
              description={t('superadmin.organizations.sectionBasicDesc')}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Name */}
                <Field
                  label={t('superadmin.organizations.nameLabel')}
                  hint={t('superadmin.organizations.nameHint')}
                  required
                  className="sm:col-span-2"
                >
                  <InputWithIcon icon={<Building2 className="h-4 w-4" />}>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      placeholder={t('placeholders.acmeCorp')}
                      className="w-full bg-transparent pl-10 pr-3 py-2.5 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none"
                      required
                    />
                  </InputWithIcon>
                </Field>

                {/* Slug */}
                <Field
                  label={t('superadmin.organizations.slugLabel')}
                  hint={t('superadmin.organizations.slugHint')}
                  required
                >
                  <div className="flex items-stretch overflow-hidden rounded-xl border border-(--input-border) bg-(--input) focus-within:border-(--primary) focus-within:ring-2 focus-within:ring-(--ring) transition">
                    <span className="flex items-center gap-1.5 px-3 text-xs text-(--text-muted) bg-(--background-subtle) border-r border-(--border)">
                      <Hash className="h-3.5 w-3.5" />
                      {t('superadmin.organizations.slugPrefix')}
                    </span>
                    <input
                      type="text"
                      value={formData.slug}
                      onChange={(e) => handleSlugChange(e.target.value)}
                      placeholder={t('placeholders.acmeInc')}
                      className="flex-1 bg-transparent px-3 py-2.5 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none"
                      required
                    />
                  </div>
                </Field>

                {/* Admin email */}
                <Field
                  label={t('superadmin.organizations.adminEmailLabel')}
                  hint={t('superadmin.organizations.adminEmailHint')}
                  required
                >
                  <InputWithIcon icon={<AtSign className="h-4 w-4" />}>
                    <input
                      type="email"
                      value={formData.adminEmail}
                      onChange={(e) => updateField('adminEmail', e.target.value)}
                      placeholder={t('placeholders.enterYourEmail')}
                      className="w-full bg-transparent pl-10 pr-3 py-2.5 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none"
                      required
                    />
                  </InputWithIcon>
                </Field>
              </div>
            </SectionCard>

            {/* SECTION: Plan */}
            <SectionCard
              icon={<Crown className="h-5 w-5" />}
              title={t('superadmin.organizations.sectionPlan')}
              description={t('superadmin.organizations.sectionPlanDesc')}
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {PLAN_CARDS.map(({ value, Icon, iconWrap, ringActive, badge }) => {
                  const selected = formData.plan === value;
                  const title = t(`superadmin.organizations.${value}Title`);
                  const desc = t(`superadmin.organizations.${value}Desc`);
                  return (
                    <button
                      type="button"
                      key={value}
                      onClick={() => updateField('plan', value)}
                      aria-pressed={selected}
                      className={[
                        'relative text-left rounded-xl border bg-(--card) p-4 transition-all',
                        'hover:border-(--primary)/60 hover:shadow-md hover:-translate-y-0.5',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring)',
                        selected ? `ring-2 shadow-md ${ringActive}` : 'border-(--border)',
                      ].join(' ')}
                    >
                      {badge === 'popular' && (
                        <span className="absolute -top-2.5 right-3 rounded-full bg-(--badge-primary-bg) px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-(--badge-primary-text) border border-(--badge-primary-border)">
                          {t('superadmin.organizations.popular')}
                        </span>
                      )}

                      <div
                        className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${iconWrap}`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <h3 className="font-semibold text-(--text-primary)">{title}</h3>
                        {selected && (
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-(--primary) text-white">
                            <Check className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-xs text-(--text-secondary) leading-relaxed">
                        {desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </SectionCard>

            {/* SECTION: Locale & meta */}
            <SectionCard
              icon={<Globe2 className="h-5 w-5" />}
              title={t('superadmin.organizations.sectionLocale')}
              description={t('superadmin.organizations.sectionLocaleDesc')}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Country */}
                <Field label={t('superadmin.organizations.countryLabel')}>
                  <InputWithIcon icon={<Globe2 className="h-4 w-4" />}>
                    <input
                      type="text"
                      value={formData.country}
                      onChange={(e) => updateField('country', e.target.value)}
                      placeholder={t('placeholders.unitedStates')}
                      className="w-full bg-transparent pl-10 pr-3 py-2.5 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none"
                    />
                  </InputWithIcon>
                </Field>

                {/* Timezone */}
                <Field label={t('superadmin.organizations.timezoneLabel')}>
                  <div className="flex items-center gap-2">
                    <span className="absolute pointer-events-none -ml-px hidden">
                      <Clock className="h-4 w-4" />
                    </span>
                    <CustomSelect
                      value={formData.timezone}
                      onChange={(v) => updateField('timezone', v)}
                      fullWidth
                      options={TIMEZONES}
                      triggerClassName="w-full px-4 py-2.5 rounded-xl border border-(--input-border) bg-(--input) text-(--text-primary) hover:border-(--primary)/60 focus:outline-none focus:ring-2 focus:ring-(--ring) transition"
                      dropdownClassName="bg-(--popover) border-(--border) text-(--text-primary)"
                    />
                  </div>
                </Field>

                {/* Industry */}
                <Field
                  label={t('superadmin.organizations.industryLabel')}
                  hint={t('superadmin.organizations.industryHint')}
                  className="sm:col-span-2"
                >
                  <InputWithIcon icon={<Briefcase className="h-4 w-4" />}>
                    <input
                      type="text"
                      value={formData.industry}
                      onChange={(e) => updateField('industry', e.target.value)}
                      placeholder={t('placeholders.technologyHealthcare')}
                      className="w-full bg-transparent pl-10 pr-3 py-2.5 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none"
                    />
                  </InputWithIcon>
                </Field>
              </div>
            </SectionCard>

            {/* Action bar */}
            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-(--border) bg-(--card) p-4 shadow-sm">
              <p className="text-xs text-(--text-muted)">
                {t('superadmin.organizations.requiredNotice')}
              </p>
              <div className="flex items-center gap-2 sm:justify-end">
                <button
                  type="button"
                  onClick={() => router.push('/superadmin/organizations')}
                  className="px-5 py-2.5 rounded-xl border border-(--border) bg-(--card) text-sm font-medium text-(--text-primary) hover:bg-(--card-hover) transition"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-gradient inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t('superadmin.organizations.submitting')}
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      {t('superadmin.organizations.createOrganization')}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* ───────── Right column: live preview ───────── */}
          <aside className="lg:col-span-1">
            <div className="lg:sticky lg:top-32 space-y-4">
              {/* Preview card */}
              <div className="rounded-2xl border border-(--border) bg-(--card) shadow-sm overflow-hidden">
                <div className="relative h-20 bg-gradient-to-br from-(--primary-hover) via-(--brand) to-(--brand)">
                  <div className="absolute inset-0 opacity-30 [background:radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.6),transparent_50%)]" />
                  <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-white/20 backdrop-blur px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white border border-white/30">
                    <Sparkles className="h-3 w-3" />
                    {t('superadmin.organizations.preview')}
                  </span>
                </div>

                <div className="px-5 -mt-10 pb-5">
                  <div className="relative h-20 w-20 rounded-2xl border-4 border-(--card) shadow-md flex items-center justify-center overflow-hidden bg-gradient-to-br from-(--primary-hover) to-(--brand) text-white">
                    {initials ? (
                      <span className="text-2xl font-bold tracking-tight">{initials}</span>
                    ) : (
                      <Building2 className="h-8 w-8" strokeWidth={1.75} />
                    )}
                  </div>
                  <h3 className="mt-3 text-lg font-bold text-(--text-primary) truncate">
                    {previewName}
                  </h3>
                  <p className="text-xs text-(--text-muted)">
                    {t('superadmin.organizations.previewSubtitle')}
                  </p>

                  {/* Slug pill */}
                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-(--border) bg-(--background-subtle) px-2.5 py-1 text-xs text-(--text-secondary) max-w-full">
                    <Hash className="h-3 w-3 shrink-0" />
                    <span className="truncate font-mono">
                      {t('superadmin.organizations.slugPrefix')}
                      {previewSlug}
                    </span>
                  </div>

                  {/* Plan badge */}
                  <div className="mt-4">
                    <PlanBadge plan={formData.plan} />
                  </div>

                  {/* Meta rows */}
                  <dl className="mt-4 space-y-2 text-xs">
                    <PreviewRow
                      icon={<AtSign className="h-3.5 w-3.5" />}
                      label={t('superadmin.organizations.adminEmailLabel')}
                      value={formData.adminEmail}
                    />
                    <PreviewRow
                      icon={<Globe2 className="h-3.5 w-3.5" />}
                      label={t('superadmin.organizations.countryLabel')}
                      value={formData.country}
                    />
                    <PreviewRow
                      icon={<Clock className="h-3.5 w-3.5" />}
                      label={t('superadmin.organizations.timezoneLabel')}
                      value={formData.timezone}
                    />
                    <PreviewRow
                      icon={<Briefcase className="h-3.5 w-3.5" />}
                      label={t('superadmin.organizations.industryLabel')}
                      value={formData.industry}
                    />
                  </dl>
                </div>
              </div>

              {/* Tip card */}
              <div className="rounded-2xl border border-(--badge-primary-border) bg-(--badge-primary-bg) p-4">
                <div className="flex items-start gap-3">
                  <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-(--card) text-(--primary-hover) shadow-sm">
                    <Lightbulb className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-(--text-primary)">
                      {t('superadmin.organizations.tipTitle')}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-(--text-secondary)">
                      {t('superadmin.organizations.tipText')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </form>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Local helper components
   ───────────────────────────────────────────────────────────── */

function SectionCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-(--border) bg-(--card) shadow-sm">
      <header className="flex items-start gap-3 border-b border-(--border-subtle) px-5 py-4">
        <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-(--badge-primary-bg) text-(--badge-primary-text) border border-(--badge-primary-border)">
          {icon}
        </div>
        <div>
          <h2 className="text-base font-semibold text-(--text-primary)">{title}</h2>
          <p className="text-xs text-(--text-muted)">{description}</p>
        </div>
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-semibold uppercase tracking-wide text-(--text-secondary) mb-1.5">
        {label}
        {required && <span className="ml-1 text-(--destructive)">*</span>}
      </label>
      <div className="relative">{children}</div>
      {hint && <p className="mt-1.5 text-xs text-(--text-muted)">{hint}</p>}
    </div>
  );
}

function InputWithIcon({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="relative rounded-xl border border-(--input-border) bg-(--input) focus-within:border-(--primary) focus-within:ring-2 focus-within:ring-(--ring) transition">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-(--text-muted)">
        {icon}
      </span>
      {children}
    </div>
  );
}

function PlanBadge({ plan }: { plan: Plan }) {
  const map: Record<
    Plan,
    { label: string; cls: string; Icon: React.ComponentType<{ className?: string }> }
  > = {
    starter: {
      label: 'Starter',
      cls: 'bg-(--badge-secondary-bg) text-(--badge-secondary-text) border-(--badge-secondary-border)',
      Icon: Rocket,
    },
    professional: {
      label: 'Professional',
      cls: 'bg-(--badge-primary-bg) text-(--badge-primary-text) border-(--badge-primary-border)',
      Icon: Zap,
    },
    enterprise: {
      label: 'Enterprise',
      cls: 'bg-(--badge-purple-bg) text-(--badge-purple-text) border-(--badge-purple-border)',
      Icon: Crown,
    },
  };
  const { label, cls, Icon } = map[plan];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${cls}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

function PreviewRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-(--border-subtle) pt-2 first:border-0 first:pt-0">
      <dt className="inline-flex items-center gap-1.5 text-(--text-muted)">
        {icon}
        <span className="truncate">{label}</span>
      </dt>
      <dd
        className={`truncate text-right ${
          value ? 'text-(--text-primary) font-medium' : 'text-(--text-disabled) italic'
        }`}
      >
        {value || '—'}
      </dd>
    </div>
  );
}
