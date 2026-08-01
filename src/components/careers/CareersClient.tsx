'use client';

import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';
import { useAuthStore, type User } from '@/store/useAuthStore';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { useHydrated } from '@/hooks/useHydrated';
import { CustomSelect } from '@/components/ui/CustomSelect';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import Link from 'next/link';
import {
  MapPin,
  Building2,
  Clock,
  Search,
  Briefcase,
  ChevronRight,
  X,
  Send,
  UserPlus,
  ExternalLink,
} from 'lucide-react';
import '@/i18n/config';
import Image from 'next/image';

// ─── Types ───────────────────────────────────────────────────
type VacancyItem = {
  _id: Id<'vacancies'>;
  title: string;
  department?: string;
  location?: string;
  employmentType: string;
  salary?: { min: number; max: number; currency: string };
  createdAt: number;
  excerpt: string;
  org: {
    _id: Id<'organizations'>;
    name: string;
    slug: string;
    logoUrl?: string;
    industry?: string;
  };
};

// ─── Helpers ─────────────────────────────────────────────────
function formatSalary(salary: { min: number; max: number; currency: string }) {
  const fmt = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
    if (n >= 1000) {
      const k = n / 1000;
      return k % 1 === 0 ? `${k}K` : `${k.toFixed(1).replace(/\.0$/, '')}K`;
    }
    return n.toLocaleString();
  };
  return `${fmt(salary.min)} – ${fmt(salary.max)} ${salary.currency}`;
}

function timeAgo(ts: number, lang = 'en'): string {
  const locale = lang === 'ru' ? ru : lang === 'hy' ? hy : enUS;
  return formatDistanceToNow(new Date(ts), { addSuffix: true, locale });
}

const EMPLOYMENT_LABELS: Record<string, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  internship: 'Internship',
};

const EMPLOYMENT_TYPE_KEYS: Record<string, string> = {
  full_time: 'fullTime',
  part_time: 'partTime',
  contract: 'contract',
  internship: 'internship',
};

// ─── Main Page ───────────────────────────────────────────────
export default function CareersClient() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const vacancies = useQuery(api.careers.listAllOpenVacancies);
  const allOrgs = useQuery(api.careers.listActiveOrganizations);
  const isMounted = useHydrated();

  const [search, setSearch] = useState('');
  const [selectedOrg, setSelectedOrg] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedDept, setSelectedDept] = useState<string>('');
  const [selectedVacancy, setSelectedVacancy] = useState<VacancyItem | null>(null);

  // Derive filter options
  const orgs = useMemo(() => {
    if (!allOrgs) return [];
    return allOrgs.map((o) => ({ id: o._id, name: o.name, slug: o.slug }));
  }, [allOrgs]);

  const departments = useMemo(() => {
    if (!vacancies) return [];
    const set = new Set<string>();
    vacancies.forEach((v) => {
      if (v.department) set.add(v.department);
    });
    return [...set].sort();
  }, [vacancies]);

  // Filter
  const filtered = useMemo(() => {
    if (!vacancies) return [];
    return vacancies.filter((v) => {
      if (
        search &&
        !v.title.toLowerCase().includes(search.toLowerCase()) &&
        !v.org.name.toLowerCase().includes(search.toLowerCase())
      )
        return false;
      if (selectedOrg && v.org.slug !== selectedOrg) return false;
      if (selectedType && v.employmentType !== selectedType) return false;
      if (selectedDept && v.department !== selectedDept) return false;
      return true;
    });
  }, [vacancies, search, selectedOrg, selectedType, selectedDept]);

  const activeFilters = [selectedOrg, selectedType, selectedDept].filter(Boolean).length;

  if (!isMounted) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--landing-bg)' }}>
        <Navbar />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--landing-bg)' }}>
      <Navbar />

      {/* Hero */}
      <section className="pt-20 sm:pt-32 pb-16 px-4 text-center relative">
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute top-20 left-1/4 w-72 h-72 rounded-full opacity-20 blur-3xl"
            style={{ background: 'var(--landing-orb-1)' }}
          />
          <div
            className="absolute bottom-10 right-1/4 w-96 h-96 rounded-full opacity-15 blur-3xl"
            style={{ background: 'var(--landing-orb-2)' }}
          />
        </div>
        <div className="relative z-10 max-w-3xl mx-auto">
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6 text-sm font-medium"
            style={{
              background: 'var(--landing-card-bg)',
              border: '1px solid var(--landing-card-border)',
              color: 'var(--landing-text-secondary)',
            }}
          >
            <Briefcase className="w-4 h-4" />
            {vacancies
              ? `${vacancies.length} ${t('careers.openPositions', 'open positions')}`
              : '...'}
          </div>
          <h1
            className="text-4xl md:text-5xl lg:text-6xl font-black mb-6 tracking-tighter"
            style={{ color: 'var(--landing-text-primary)' }}
          >
            {t('careers.heroTitle', 'Find Your Dream Job')}
          </h1>
          <p
            className="text-lg md:text-xl max-w-2xl mx-auto mb-8"
            style={{ color: 'var(--landing-text-muted)' }}
          >
            {t(
              'careers.heroSubtitle',
              'Explore opportunities across top organizations. Your next career move starts here.',
            )}
          </p>

          {/* Search */}
          <div className="relative max-w-xl mx-auto">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5"
              style={{ color: 'var(--landing-text-muted)' }}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('careers.searchPlaceholder', 'Search by job title or company...')}
              className="w-full pl-12 pr-4 py-4 rounded-xl text-base outline-none transition-all focus:ring-2 focus:ring-[var(--landing-gradient-from)]"
              style={{
                background: 'var(--landing-card-bg)',
                border: '1px solid var(--landing-card-border)',
                color: 'var(--landing-text-primary)',
              }}
            />
          </div>
        </div>
      </section>

      {/* Filters + Results */}
      <section className="max-w-7xl mx-auto px-4 pb-24">
        {/* Filter bar */}
        <div className="flex flex-wrap gap-3 mb-8 items-center">
          <CustomSelect
            value={selectedOrg}
            onChange={setSelectedOrg}
            options={[
              { value: '', label: t('careers.allCompanies', 'All Companies') },
              ...orgs.map((o) => ({ value: o.slug, label: o.name })),
            ]}
          />

          <CustomSelect
            value={selectedType}
            onChange={setSelectedType}
            options={[
              { value: '', label: t('careers.allTypes', 'All Types') },
              { value: 'full_time', label: t('recruitment.type.fullTime', 'Full-time') },
              { value: 'part_time', label: t('recruitment.type.partTime', 'Part-time') },
              { value: 'contract', label: t('recruitment.type.contract', 'Contract') },
              { value: 'internship', label: t('recruitment.type.internship', 'Internship') },
            ]}
          />

          <CustomSelect
            value={selectedDept}
            onChange={setSelectedDept}
            options={[
              { value: '', label: t('careers.allDepartments', 'All Departments') },
              ...departments.map((d) => ({ value: d, label: d })),
            ]}
          />

          {activeFilters > 0 && (
            <button
              onClick={() => {
                setSelectedOrg('');
                setSelectedType('');
                setSelectedDept('');
              }}
              className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-80"
              style={{ background: 'var(--primary)', color: '#fff' }}
            >
              <X className="w-3.5 h-3.5" />
              {t('careers.clearFilters', 'Clear')} ({activeFilters})
            </button>
          )}

          <span className="ml-auto text-sm" style={{ color: 'var(--landing-text-muted)' }}>
            {filtered.length} {t('careers.positionsCount', 'positions')}
          </span>
        </div>

        {/* Loading */}
        {!vacancies && (
          <div className="flex justify-center py-20">
            <ShieldLoader />
          </div>
        )}

        {/* Empty state */}
        {vacancies && filtered.length === 0 && (
          <div
            className="text-center py-20 rounded-2xl"
            style={{
              background: 'var(--landing-card-bg)',
              border: '1px solid var(--landing-card-border)',
            }}
          >
            <Briefcase
              className="w-12 h-12 mx-auto mb-4"
              style={{ color: 'var(--landing-text-muted)' }}
            />
            <h3
              className="text-lg font-semibold mb-2"
              style={{ color: 'var(--landing-text-primary)' }}
            >
              {t('careers.noResults', 'No positions found')}
            </h3>
            <p style={{ color: 'var(--landing-text-muted)' }}>
              {t('careers.tryDifferent', 'Try adjusting your filters or search query')}
            </p>
          </div>
        )}

        {/* Vacancy cards */}
        {vacancies && filtered.length > 0 && (
          <div className="grid gap-4">
            {filtered.map((vacancy) => (
              <VacancyCard
                key={vacancy._id}
                vacancy={vacancy}
                onClick={() => setSelectedVacancy(vacancy)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Vacancy Detail Modal */}
      {selectedVacancy &&
        createPortal(
          <VacancyDetailModal
            vacancy={selectedVacancy}
            onClose={() => setSelectedVacancy(null)}
            user={user}
          />,
          document.body,
        )}

      <Footer />
    </div>
  );
}

// ─── Vacancy Card ────────────────────────────────────────────
function VacancyCard({ vacancy, onClick }: { vacancy: VacancyItem; onClick: () => void }) {
  const { t, i18n } = useTranslation();
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-5 rounded-xl transition-shadow duration-300 ease-out shadow-sm hover:shadow-lg hover:shadow-black/8 group"
      style={{
        background: 'var(--landing-card-bg)',
        border: '1px solid var(--landing-card-border)',
      }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        {/* Org avatar */}
        <div
          className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg"
          style={{
            background:
              'linear-gradient(135deg, var(--landing-gradient-from), var(--landing-gradient-to))',
          }}
        >
          {vacancy.org.logoUrl ? (
            <Image
              src={vacancy.org.logoUrl}
              alt={vacancy.org.name}
              className="w-full h-full rounded-xl object-cover"
              width={48}
              height={48}
            />
          ) : (
            vacancy.org.name.charAt(0).toUpperCase()
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3
                className="text-base font-semibold group-hover:underline"
                style={{ color: 'var(--landing-text-primary)' }}
              >
                {vacancy.title}
              </h3>
              <p className="text-sm mt-0.5" style={{ color: 'var(--landing-text-secondary)' }}>
                {vacancy.org.name}
                {vacancy.org.industry && (
                  <span className="opacity-60"> · {vacancy.org.industry}</span>
                )}
              </p>
            </div>
            <ChevronRight
              className="w-5 h-5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ color: 'var(--landing-text-muted)' }}
            />
          </div>

          {/* Meta tags */}
          <div className="flex flex-wrap items-center gap-3 mt-3">
            {vacancy.department && (
              <span
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full"
                style={{ background: 'var(--landing-gradient-from)', color: '#fff', opacity: 0.9 }}
              >
                <Building2 className="w-3 h-3" />
                {vacancy.department}
              </span>
            )}
            <span
              className="inline-flex items-center gap-1 text-xs"
              style={{ color: 'var(--landing-text-muted)' }}
            >
              <Clock className="w-3 h-3" />
              {t(
                `recruitment.type.${EMPLOYMENT_TYPE_KEYS[vacancy.employmentType] || vacancy.employmentType}`,
                EMPLOYMENT_LABELS[vacancy.employmentType] || vacancy.employmentType,
              )}
            </span>
            {vacancy.location && (
              <span
                className="inline-flex items-center gap-1 text-xs"
                style={{ color: 'var(--landing-text-muted)' }}
              >
                <MapPin className="w-3 h-3" />
                {vacancy.location}
              </span>
            )}
            {vacancy.salary && (
              <span
                className="inline-flex items-center gap-1 text-xs font-medium"
                style={{ color: 'var(--landing-text-secondary)' }}
              >
                {formatSalary(vacancy.salary)}
              </span>
            )}
            <span className="text-xs ml-auto" style={{ color: 'var(--landing-text-muted)' }}>
              {timeAgo(vacancy.createdAt, i18n.language)}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Vacancy Detail Modal ────────────────────────────────────
function VacancyDetailModal({
  vacancy,
  onClose,
  user,
}: {
  vacancy: VacancyItem;
  onClose: () => void;
  user: User | null;
}) {
  const { t } = useTranslation();
  const detail = useQuery(api.careers.getVacancyDetails, { vacancyId: vacancy._id });
  const applyMutation = useMutation(api.careers.applyToVacancy);
  const validateEmail = useAction(api.emailValidation.validateEmail);

  const [showApply, setShowApply] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState('');
  const [resumeText, setResumeText] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [emailError, setEmailError] = useState('');

  // Block background scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const handleApply = async () => {
    if (!name || !email || !consent) return;
    setEmailError('');
    setSubmitting(true);
    try {
      // Validate email (format + DNS MX)
      const validation = await validateEmail({ email });
      if (!validation.valid) {
        const reasons: Record<string, string> = {
          invalid_format: t('careers.emailInvalidFormat', 'Invalid email format'),
          disposable_email: t(
            'careers.emailDisposable',
            'Disposable email addresses are not allowed',
          ),
          no_mx_records: t('careers.emailNoMx', 'This email domain cannot receive messages'),
          domain_not_found: t('careers.emailDomainNotFound', 'Email domain does not exist'),
        };
        setEmailError(
          reasons[validation.reason || ''] || t('careers.emailInvalid', 'Invalid email address'),
        );
        setSubmitting(false);
        return;
      }

      await applyMutation({
        vacancyId: vacancy._id,
        name,
        email,
        phone: phone || undefined,
        resumeText: resumeText || undefined,
        consentGiven: consent,
      });
      setSubmitted(true);
      fetch('/api/telegram/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'career',
          data: { name, email, phone, vacancy: vacancy.title },
        }),
      }).catch(() => {});
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (_e: any) {
      toast.error(t('careers.submitError', 'Error submitting application'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-hidden"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden"
        style={{
          background: 'var(--landing-modal-bg)',
          border: '1px solid var(--landing-card-border)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="shrink-0 p-6 pb-4 rounded-t-2xl"
          style={{
            background: 'var(--landing-modal-bg)',
            borderBottom: '1px solid var(--landing-card-border)',
          }}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full transition-colors hover:opacity-70"
            style={{ color: 'var(--landing-text-muted)' }}
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
              style={{
                background:
                  'linear-gradient(135deg, var(--landing-gradient-from), var(--landing-gradient-to))',
              }}
            >
              {vacancy.org.name.charAt(0)}
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--landing-text-secondary)' }}>
                {vacancy.org.name}
              </p>
              {vacancy.org.industry && (
                <p className="text-xs" style={{ color: 'var(--landing-text-muted)' }}>
                  {vacancy.org.industry}
                </p>
              )}
            </div>
          </div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--landing-text-primary)' }}>
            {vacancy.title}
          </h2>
          <div className="flex flex-wrap gap-3 mt-2">
            {vacancy.location && (
              <span
                className="inline-flex items-center gap-1 text-sm"
                style={{ color: 'var(--landing-text-muted)' }}
              >
                <MapPin className="w-3.5 h-3.5" /> {vacancy.location}
              </span>
            )}
            <span
              className="inline-flex items-center gap-1 text-sm"
              style={{ color: 'var(--landing-text-muted)' }}
            >
              <Clock className="w-3.5 h-3.5" />{' '}
              {t(
                `recruitment.type.${EMPLOYMENT_TYPE_KEYS[vacancy.employmentType] || vacancy.employmentType}`,
                EMPLOYMENT_LABELS[vacancy.employmentType] || vacancy.employmentType,
              )}
            </span>
            {vacancy.salary && (
              <span
                className="inline-flex items-center gap-1 text-sm font-medium"
                style={{ color: 'var(--landing-text-secondary)' }}
              >
                {' '}
                {formatSalary(vacancy.salary)}
              </span>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {!detail ? (
            <div className="flex justify-center py-8">
              <ShieldLoader />
            </div>
          ) : submitted ? (
            <div className="text-center py-12">
              <div
                className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
                style={{ background: 'var(--landing-gradient-from)', color: '#fff' }}
              >
                <Send className="w-7 h-7" />
              </div>
              <h3
                className="text-lg font-semibold mb-2"
                style={{ color: 'var(--landing-text-primary)' }}
              >
                {t('careers.applied', 'Application Submitted!')}
              </h3>
              <p className="text-sm" style={{ color: 'var(--landing-text-muted)' }}>
                {t(
                  'careers.appliedDesc',
                  'Thank you for your interest. The hiring team will review your application.',
                )}
              </p>
            </div>
          ) : showApply ? (
            /* Application Form */
            <div className="space-y-4">
              <h3
                className="text-lg font-semibold"
                style={{ color: 'var(--landing-text-primary)' }}
              >
                {t('careers.applyFor', 'Apply for')} {vacancy.title}
              </h3>
              <div>
                <label
                  className="block text-sm font-medium mb-1"
                  style={{ color: 'var(--landing-text-secondary)' }}
                >
                  {t('careers.name', 'Full Name')} *
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg outline-none text-sm"
                  style={{
                    background: 'var(--landing-bg)',
                    border: '1px solid var(--landing-card-border)',
                    color: 'var(--landing-text-primary)',
                  }}
                />
              </div>
              <div>
                <label
                  className="block text-sm font-medium mb-1"
                  style={{ color: 'var(--landing-text-secondary)' }}
                >
                  {t('careers.email', 'Email')} *
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setEmailError('');
                  }}
                  className="w-full px-4 py-2.5 rounded-lg outline-none text-sm"
                  style={{
                    background: 'var(--landing-bg)',
                    border: `1px solid ${emailError ? '#ef4444' : 'var(--landing-card-border)'}`,
                    color: 'var(--landing-text-primary)',
                  }}
                />
                {emailError && <p className="text-xs text-red-500 mt-1">{emailError}</p>}
              </div>
              <div>
                <label
                  className="block text-sm font-medium mb-1"
                  style={{ color: 'var(--landing-text-secondary)' }}
                >
                  {t('careers.phone', 'Phone')}
                </label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg outline-none text-sm"
                  style={{
                    background: 'var(--landing-bg)',
                    border: '1px solid var(--landing-card-border)',
                    color: 'var(--landing-text-primary)',
                  }}
                />
              </div>
              <div>
                <label
                  className="block text-sm font-medium mb-1"
                  style={{ color: 'var(--landing-text-secondary)' }}
                >
                  {t('careers.resume', 'About You / Resume')}
                </label>
                <textarea
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-2.5 rounded-lg outline-none text-sm resize-none"
                  style={{
                    background: 'var(--landing-bg)',
                    border: '1px solid var(--landing-card-border)',
                    color: 'var(--landing-text-primary)',
                  }}
                />
              </div>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-1 rounded"
                />
                <span className="text-xs" style={{ color: 'var(--landing-text-muted)' }}>
                  {t(
                    'careers.consent',
                    'I consent to the processing of my personal data for recruitment purposes.',
                  )}
                </span>
              </label>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowApply(false)}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
                  style={{
                    border: '1px solid var(--landing-card-border)',
                    color: 'var(--landing-text-secondary)',
                  }}
                >
                  {t('common.back', 'Back')}
                </button>
                <button
                  onClick={handleApply}
                  disabled={!name || !email || !consent || submitting}
                  className="flex-1 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50"
                  style={{
                    background:
                      'linear-gradient(135deg, var(--landing-gradient-from), var(--landing-gradient-to))',
                  }}
                >
                  {submitting ? '...' : t('careers.submit', 'Submit Application')}
                </button>
              </div>
            </div>
          ) : (
            /* Vacancy Detail */
            <div>
              {/* Description */}
              <div className="mb-6">
                <h4
                  className="text-sm font-semibold uppercase tracking-wider mb-3"
                  style={{ color: 'var(--landing-text-muted)' }}
                >
                  {t('careers.description', 'Description')}
                </h4>
                <div
                  className="text-sm leading-relaxed whitespace-pre-wrap"
                  style={{ color: 'var(--landing-text-secondary)' }}
                >
                  {detail.description.replace(/\\n/g, '\n')}
                </div>
              </div>

              {/* Requirements */}
              {detail.requirements && (
                <div className="mb-6">
                  <h4
                    className="text-sm font-semibold uppercase tracking-wider mb-3"
                    style={{ color: 'var(--landing-text-muted)' }}
                  >
                    {t('careers.requirements', 'Requirements')}
                  </h4>
                  <div
                    className="text-sm leading-relaxed whitespace-pre-wrap"
                    style={{ color: 'var(--landing-text-secondary)' }}
                  >
                    {detail.requirements.replace(/\\n/g, '\n')}
                  </div>
                </div>
              )}

              {/* CTAs */}
              <div
                className="flex flex-col sm:flex-row gap-3 pt-4"
                style={{ borderTop: '1px solid var(--landing-card-border)' }}
              >
                <button
                  onClick={() => setShowApply(true)}
                  className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
                  style={{
                    background:
                      'linear-gradient(135deg, var(--landing-gradient-from), var(--landing-gradient-to))',
                  }}
                >
                  <Send className="w-4 h-4" />
                  {t('careers.applyNow', 'Apply Now')}
                </button>
                <Link
                  href={
                    user
                      ? `/onboarding/select-organization?org=${encodeURIComponent(vacancy.org.slug)}`
                      : `/register?org=${encodeURIComponent(vacancy.org.slug)}`
                  }
                  className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-medium transition-all hover:opacity-80"
                  style={{
                    border: '1px solid var(--landing-card-border)',
                    color: 'var(--landing-text-secondary)',
                  }}
                >
                  <UserPlus className="w-4 h-4" />
                  {t('careers.joinOrg', 'Join this Organization')}
                </Link>
              </div>

              {/* View all org vacancies */}
              <Link
                href={`/careers/${vacancy.org.slug}`}
                className="flex items-center justify-center gap-1 mt-4 text-xs hover:underline"
                style={{ color: 'var(--landing-text-muted)' }}
              >
                <ExternalLink className="w-3 h-3" />
                {t('careers.viewAll', 'View all positions at')} {vacancy.org.name}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
