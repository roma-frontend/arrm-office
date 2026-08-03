'use client';
import Image from 'next/image';
import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { CustomSelect } from '@/components/ui/CustomSelect';
import '@/i18n/config';
import Link from 'next/link';

// ─── Types ───────────────────────────────────────────────────
type Vacancy = {
  _id: Id<'vacancies'>;
  title: string;
  department?: string;
  location?: string;
  employmentType: string;
  salary?: { min: number; max: number; currency: string };
  createdAt: number;
  excerpt: string;
};

type VacancyDetail = {
  _id: Id<'vacancies'>;
  title: string;
  department?: string;
  location?: string;
  employmentType: string;
  description: string;
  requirements?: string;
  salary?: { min: number; max: number; currency: string };
  createdAt: number;
  orgName?: string;
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

function timeAgo(ts: number, lang: string): string {
  // Intl.RelativeTimeFormat handles all four UI languages natively (including
  // proper Russian/Armenian plural forms), same as src/lib/eventTimeline.ts.
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  const diffMs = Date.now() - ts;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return rtf.format(0, 'minute');
  if (minutes < 60) return rtf.format(-minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return rtf.format(-hours, 'hour');
  const days = Math.floor(hours / 24);
  if (days < 30) return rtf.format(-days, 'day');
  const months = Math.floor(days / 30);
  return rtf.format(-months, 'month');
}

const TYPE_LABELS: Record<string, string> = {
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

// ─── Icons ───────────────────────────────────────────────────
function MapPinIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function BriefcaseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function CheckCircleIcon({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      className={className}
      style={style}
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function _DollarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

// ─── Main Component ──────────────────────────────────────────
export default function CareersPage({ orgSlug }: { orgSlug: string }) {
  const { t } = useTranslation();
  const data = useQuery(api.careers.listOpenVacancies, { orgSlug });
  const [selectedId, setSelectedId] = useState<Id<'vacancies'> | null>(null);
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterLocation, setFilterLocation] = useState('');

  // Compute available filters
  const departments = useMemo(() => {
    if (!data?.vacancies) return [];
    return [...new Set(data.vacancies.map((v) => v.department).filter(Boolean))] as string[];
  }, [data]);

  const locations = useMemo(() => {
    if (!data?.vacancies) return [];
    return [...new Set(data.vacancies.map((v) => v.location).filter(Boolean))] as string[];
  }, [data]);

  // Filter vacancies
  const filtered = useMemo(() => {
    if (!data?.vacancies) return [];
    return data.vacancies.filter((v) => {
      if (
        search &&
        !v.title.toLowerCase().includes(search.toLowerCase()) &&
        !v.excerpt.toLowerCase().includes(search.toLowerCase())
      )
        return false;
      if (filterDept && v.department !== filterDept) return false;
      if (filterType && v.employmentType !== filterType) return false;
      if (filterLocation && v.location !== filterLocation) return false;
      return true;
    });
  }, [data, search, filterDept, filterType, filterLocation]);

  const hasFilters = search || filterDept || filterType || filterLocation;

  if (!data) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--landing-bg)' }}
      >
        <ShieldLoader />
      </div>
    );
  }

  if (!data.org) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--landing-bg)' }}
      >
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--landing-text-primary)' }}>
            {t('careers.notFound', 'Page not found')}
          </h1>
          <p style={{ color: 'var(--landing-text-muted)' }}>
            {t('careers.notFoundHint', 'This organization does not have a career page.')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--landing-bg)' }}>
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Decorative orbs */}
        <div
          className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full pointer-events-none opacity-60"
          style={{
            background: 'radial-gradient(circle, var(--landing-orb-1) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }}
        />
        <div
          className="absolute -bottom-24 -left-24 w-[400px] h-[400px] rounded-full pointer-events-none opacity-50"
          style={{
            background: 'radial-gradient(circle, var(--landing-orb-2) 0%, transparent 70%)',
            filter: 'blur(50px)',
          }}
        />

        <div className="relative max-w-6xl mx-auto px-6 md:px-12 pt-20 pb-16 text-center">
          {/* Org branding */}
          {data.org.logoUrl && (
            <Image
              src={data.org.logoUrl}
              alt={data.org.name}
              width={64}
              height={64}
              unoptimized
              className="w-16 h-16 mx-auto mb-6 rounded-2xl object-cover shadow-lg"
            />
          )}

          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6"
            style={{
              background: 'var(--landing-card-bg)',
              border: '1px solid var(--landing-card-border)',
            }}
          >
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--primary)' }} />
            <span
              className="text-xs font-bold tracking-widest uppercase"
              style={{ color: 'var(--landing-text-muted)' }}
            >
              {t('careers.badge', "We're Hiring")}
            </span>
          </div>

          <h1
            className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight mb-4"
            style={{ color: 'var(--landing-text-primary)' }}
          >
            {t('careers.joinTitle', 'Join')}{' '}
            <span style={{ color: 'var(--primary)' }}>{data.org.name}</span>
          </h1>
          <p
            className="text-lg md:text-xl max-w-2xl mx-auto leading-relaxed"
            style={{ color: 'var(--landing-text-secondary)' }}
          >
            {t(
              'careers.joinSubtitle',
              'Explore open positions and become part of our team. Build something amazing together.',
            )}
          </p>

          {/* Stats */}
          <div className="flex flex-wrap justify-center gap-8 mt-10">
            <div className="text-center">
              <p className="text-3xl font-black" style={{ color: 'var(--primary)' }}>
                {data.vacancies.length}
              </p>
              <p className="text-sm" style={{ color: 'var(--landing-text-muted)' }}>
                {t('careers.openPositions', 'Open Positions')}
              </p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-black" style={{ color: 'var(--primary)' }}>
                {departments.length}
              </p>
              <p className="text-sm" style={{ color: 'var(--landing-text-muted)' }}>
                {t('careers.departments', 'Departments')}
              </p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-black" style={{ color: 'var(--primary)' }}>
                {locations.length}
              </p>
              <p className="text-sm" style={{ color: 'var(--landing-text-muted)' }}>
                {t('careers.locations', 'Locations')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Search & Filters */}
      <section className="max-w-6xl mx-auto px-3 md:px-12 -mt-4">
        <div
          className="rounded-2xl p-4 md:p-6 backdrop-blur-sm"
          style={{
            background: 'var(--landing-card-bg)',
            border: '1px solid var(--landing-card-border)',
          }}
        >
          {/* Search bar */}
          <div className="relative mb-4">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 opacity-50" />
            <input
              type="text"
              placeholder={t('careers.searchPlaceholder', 'Search positions...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-xl text-sm outline-none transition-all focus:ring-2"
              style={{
                background: 'var(--landing-bg)',
                border: '1px solid var(--landing-card-border)',
                color: 'var(--landing-text-primary)',
              }}
            />
          </div>

          {/* Filter row */}
          <div className="flex flex-wrap gap-3">
            {departments.length > 0 && (
              <CustomSelect
                value={filterDept}
                onChange={setFilterDept}
                options={[
                  { value: '', label: t('careers.allDepartments', 'All Departments') },
                  ...departments.map((d) => ({ value: d, label: d })),
                ]}
              />
            )}
            <CustomSelect
              value={filterType}
              onChange={setFilterType}
              options={[
                { value: '', label: t('careers.allTypes', 'All Types') },
                { value: 'full_time', label: t('recruitment.type.fullTime', 'Full-time') },
                { value: 'part_time', label: t('recruitment.type.partTime', 'Part-time') },
                { value: 'contract', label: t('recruitment.type.contract', 'Contract') },
                { value: 'internship', label: t('recruitment.type.internship', 'Internship') },
              ]}
            />
            {locations.length > 0 && (
              <CustomSelect
                value={filterLocation}
                onChange={setFilterLocation}
                options={[
                  { value: '', label: t('careers.allLocations', 'All Locations') },
                  ...locations.map((l) => ({ value: l, label: l })),
                ]}
              />
            )}
            {hasFilters && (
              <button
                onClick={() => {
                  setSearch('');
                  setFilterDept('');
                  setFilterType('');
                  setFilterLocation('');
                }}
                className="px-3 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
                style={{ color: 'var(--primary)' }}
              >
                {t('careers.clearFilters', 'Clear filters')}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Vacancies Grid */}
      <section className="max-w-6xl mx-auto px-3 md:px-12 py-12">
        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <BriefcaseIcon className="mx-auto mb-4 opacity-40 w-12 h-12" />
            <p className="text-lg font-medium" style={{ color: 'var(--landing-text-primary)' }}>
              {hasFilters
                ? t('careers.noResults', 'No positions match your filters')
                : t('careers.noVacancies', 'No open positions right now')}
            </p>
            <p className="mt-2" style={{ color: 'var(--landing-text-muted)' }}>
              {t('careers.checkBack', 'Check back soon for new opportunities!')}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {filtered.map((vacancy) => (
              <VacancyCard
                key={vacancy._id}
                vacancy={vacancy}
                onClick={() => setSelectedId(vacancy._id)}
                t={t}
              />
            ))}
          </div>
        )}
      </section>

      {/* Footer banner */}
      <section className="max-w-6xl mx-auto px-3 md:px-12 pb-16">
        <div
          className="rounded-2xl p-8 md:p-12 text-center relative overflow-hidden"
          style={{
            background: 'var(--landing-card-bg)',
            border: '1px solid var(--landing-card-border)',
          }}
        >
          <div
            className="absolute inset-0 opacity-30 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse at center, var(--landing-orb-1) 0%, transparent 70%)',
            }}
          />
          <div className="relative">
            <h2
              className="text-2xl md:text-3xl font-bold mb-3"
              style={{ color: 'var(--landing-text-primary)' }}
            >
              {t('careers.ctaTitle', "Don't see the right role?")}
            </h2>
            <p className="max-w-lg mx-auto mb-6" style={{ color: 'var(--landing-text-secondary)' }}>
              {t(
                'careers.ctaSubtitle',
                "We're always looking for talented people. Send us your resume and we'll keep you in mind for future openings.",
              )}
            </p>
            <Link
              href={`mailto:careers@${orgSlug}.com`}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all hover:scale-105 hover:shadow-lg"
              style={{
                background:
                  'linear-gradient(135deg, var(--landing-gradient-from), var(--landing-gradient-to))',
                color: '#fff',
              }}
            >
              {t('careers.contactUs', 'Get in Touch')}
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* Vacancy Detail Modal */}
      {selectedId &&
        createPortal(
          <VacancyModal vacancyId={selectedId} onClose={() => setSelectedId(null)} t={t} />,
          document.body,
        )}
    </div>
  );
}

// ─── Vacancy Card ────────────────────────────────────────────
function VacancyCard({
  vacancy,
  onClick,
  t,
}: {
  vacancy: Vacancy;
  onClick: () => void;
  t: TFunction;
}) {
  const { i18n } = useTranslation();
  return (
    <button
      onClick={onClick}
      className="text-left w-full rounded-xl p-5 md:p-6 transition-all duration-200 hover:shadow-xl group"
      style={{
        background: 'var(--landing-card-bg)',
        border: '1px solid var(--landing-card-border)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3
            className="text-lg font-bold truncate group-hover:underline underline-offset-4"
            style={{ color: 'var(--landing-text-primary)' }}
          >
            {vacancy.title}
          </h3>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            {vacancy.department && (
              <span
                className="inline-flex items-center gap-1 text-xs"
                style={{ color: 'var(--landing-text-muted)' }}
              >
                <BriefcaseIcon className="w-3 h-3" /> {vacancy.department}
              </span>
            )}
            {vacancy.location && (
              <span
                className="inline-flex items-center gap-1 text-xs"
                style={{ color: 'var(--landing-text-muted)' }}
              >
                <MapPinIcon className="w-3 h-3" /> {vacancy.location}
              </span>
            )}
            <span
              className="inline-flex items-center gap-1 text-xs"
              style={{ color: 'var(--landing-text-muted)' }}
            >
              <ClockIcon className="w-3 h-3" /> {timeAgo(vacancy.createdAt, i18n.language)}
            </span>
          </div>
        </div>
        <span
          className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold"
          style={{
            background: 'var(--landing-bg)',
            color: 'var(--primary)',
            border: '1px solid var(--landing-card-border)',
          }}
        >
          {t(
            `recruitment.type.${EMPLOYMENT_TYPE_KEYS[vacancy.employmentType] || vacancy.employmentType}`,
            TYPE_LABELS[vacancy.employmentType] || vacancy.employmentType,
          )}
        </span>
      </div>

      <p
        className="mt-3 text-sm line-clamp-2 leading-relaxed"
        style={{ color: 'var(--landing-text-secondary)' }}
      >
        {vacancy.excerpt}
      </p>

      {vacancy.salary && (
        <div
          className="flex items-center gap-1 mt-3 text-sm font-medium"
          style={{ color: 'var(--primary)' }}
        >
          {' '}
          {formatSalary(vacancy.salary)}
        </div>
      )}
    </button>
  );
}

// ─── Vacancy Detail Modal ────────────────────────────────────
function VacancyModal({
  vacancyId,
  onClose,
  t,
}: {
  vacancyId: Id<'vacancies'>;
  onClose: () => void;
  t: TFunction;
}) {
  const details = useQuery(api.careers.getVacancyDetails, { vacancyId });
  const apply = useMutation(api.careers.applyToVacancy);
  const [showForm, setShowForm] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    resumeText: '',
    consent: false,
  });

  // Block background scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const handleApply = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      setError(t('careers.fillRequired', 'Name and email are required'));
      return;
    }
    if (!form.consent) {
      setError(t('careers.consentRequired', 'Please agree to the privacy policy'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      await apply({
        vacancyId,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        resumeText: form.resumeText.trim() || undefined,
        consentGiven: form.consent,
      });
      setSubmitted(true);
      fetch('/api/telegram/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'career',
          data: {
            name: form.name.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
            vacancy: details?.title || '',
          },
        }),
      }).catch(() => {});
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : t('common.somethingWentWrong', 'Something went wrong'),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-hidden"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal content */}
      <div
        className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl shadow-2xl"
        style={{
          background: 'var(--landing-modal-bg)',
          border: '1px solid var(--landing-card-border)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center transition-colors z-10 hover:opacity-80"
          style={{
            background: 'var(--landing-card-bg)',
            border: '1px solid var(--landing-card-border)',
          }}
        >
          <XIcon className="w-4 h-4" />
        </button>

        {!details ? (
          <div className="p-12 text-center">
            <ShieldLoader size="sm" />
          </div>
        ) : submitted ? (
          <div className="p-12 text-center">
            <CheckCircleIcon
              className="mx-auto mb-4"
              style={{ color: 'var(--primary)' } as React.CSSProperties}
            />
            <h2
              className="text-2xl font-bold mb-2"
              style={{ color: 'var(--landing-text-primary)' }}
            >
              {t('careers.applied', 'Application Submitted!')}
            </h2>
            <p style={{ color: 'var(--landing-text-secondary)' }}>
              {t(
                'careers.appliedHint',
                "Thank you for your interest. We'll review your application and get back to you soon.",
              )}
            </p>
            <button
              onClick={onClose}
              className="mt-6 px-6 py-2.5 rounded-xl font-medium text-sm transition-all hover:scale-105"
              style={{
                background:
                  'linear-gradient(135deg, var(--landing-gradient-from), var(--landing-gradient-to))',
                color: '#fff',
              }}
            >
              {t('careers.close', 'Close')}
            </button>
          </div>
        ) : showForm ? (
          <ApplicationForm
            form={form}
            setForm={setForm}
            error={error}
            loading={loading}
            onSubmit={handleApply}
            onBack={() => setShowForm(false)}
            t={t}
          />
        ) : (
          <VacancyDetails details={details} onApply={() => setShowForm(true)} t={t} />
        )}
      </div>
    </div>
  );
}

// ─── Vacancy Details View ────────────────────────────────────
function VacancyDetails({
  details,
  onApply,
  t,
}: {
  details: VacancyDetail;
  onApply: () => void;
  t: TFunction;
}) {
  const { i18n } = useTranslation();
  return (
    <div className="p-6 md:p-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span
            className="px-2.5 py-1 rounded-lg text-xs font-semibold"
            style={{
              background: 'var(--landing-card-bg)',
              color: 'var(--primary)',
              border: '1px solid var(--landing-card-border)',
            }}
          >
            {t(
              `recruitment.type.${EMPLOYMENT_TYPE_KEYS[details.employmentType] || details.employmentType}`,
              TYPE_LABELS[details.employmentType] || details.employmentType,
            )}
          </span>
          {details.department && (
            <span className="text-xs" style={{ color: 'var(--landing-text-muted)' }}>
              {details.department}
            </span>
          )}
        </div>
        <h2
          className="text-2xl md:text-3xl font-bold"
          style={{ color: 'var(--landing-text-primary)' }}
        >
          {details.title}
        </h2>
        <div className="flex flex-wrap items-center gap-4 mt-3">
          {details.location && (
            <span
              className="inline-flex items-center gap-1.5 text-sm"
              style={{ color: 'var(--landing-text-muted)' }}
            >
              <MapPinIcon /> {details.location}
            </span>
          )}
          {details.salary && (
            <span
              className="inline-flex items-center gap-1.5 text-sm font-medium"
              style={{ color: 'var(--primary)' }}
            >
              {' '}
              {formatSalary(details.salary)}
            </span>
          )}
          <span
            className="inline-flex items-center gap-1.5 text-sm"
            style={{ color: 'var(--landing-text-muted)' }}
          >
            <ClockIcon /> {timeAgo(details.createdAt, i18n.language)}
          </span>
        </div>
      </div>

      {/* Description */}
      <div className="mb-6">
        <h3
          className="text-sm font-bold uppercase tracking-wider mb-3"
          style={{ color: 'var(--landing-text-muted)' }}
        >
          {t('careers.description', 'Description')}
        </h3>
        <div
          className="text-sm leading-relaxed whitespace-pre-wrap"
          style={{ color: 'var(--landing-text-secondary)' }}
        >
          {details.description}
        </div>
      </div>

      {/* Requirements */}
      {details.requirements && (
        <div className="mb-6">
          <h3
            className="text-sm font-bold uppercase tracking-wider mb-3"
            style={{ color: 'var(--landing-text-muted)' }}
          >
            {t('careers.requirements', 'Requirements')}
          </h3>
          <div
            className="text-sm leading-relaxed whitespace-pre-wrap"
            style={{ color: 'var(--landing-text-secondary)' }}
          >
            {details.requirements}
          </div>
        </div>
      )}

      {/* Apply button */}
      <div className="pt-4 border-t" style={{ borderColor: 'var(--landing-card-border)' }}>
        <button
          onClick={onApply}
          className="w-full sm:w-auto px-8 py-3 rounded-xl font-semibold text-sm transition-all hover:scale-105 hover:shadow-lg"
          style={{
            background:
              'linear-gradient(135deg, var(--landing-gradient-from), var(--landing-gradient-to))',
            color: '#fff',
          }}
        >
          {t('careers.applyNow', 'Apply Now')}
        </button>
      </div>
    </div>
  );
}

// ─── Application Form ────────────────────────────────────────
function ApplicationForm({
  form,
  setForm,
  error,
  loading,
  onSubmit,
  onBack,
  t,
}: {
  form: { name: string; email: string; phone: string; resumeText: string; consent: boolean };
  setForm: (f: typeof form | ((prev: typeof form) => typeof form)) => void;
  error: string;
  loading: boolean;
  onSubmit: () => void;
  onBack: () => void;
  t: TFunction;
}) {
  const inputStyle = {
    background: 'var(--landing-card-bg)',
    border: '1px solid var(--landing-card-border)',
    color: 'var(--landing-text-primary)',
  };

  return (
    <div className="p-6 md:p-8">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm mb-4 transition-colors hover:opacity-80"
        style={{ color: 'var(--primary)' }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
        {t('careers.backToDetails', 'Back to details')}
      </button>

      <h2 className="text-xl font-bold mb-6" style={{ color: 'var(--landing-text-primary)' }}>
        {t('careers.applicationForm', 'Your Application')}
      </h2>

      <div className="space-y-4">
        <div>
          <label
            className="text-xs font-semibold uppercase tracking-wider block mb-1.5"
            style={{ color: 'var(--landing-text-muted)' }}
          >
            {t('careers.formName', 'Full Name')} *
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full px-4 py-2.5 rounded-xl text-sm outline-none focus:ring-2"
            style={inputStyle}
            placeholder={t('careers.formNamePlaceholder', 'John Doe')}
          />
        </div>

        <div>
          <label
            className="text-xs font-semibold uppercase tracking-wider block mb-1.5"
            style={{ color: 'var(--landing-text-muted)' }}
          >
            {t('careers.formEmail', 'Email')} *
          </label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="w-full px-4 py-2.5 rounded-xl text-sm outline-none focus:ring-2"
            style={inputStyle}
            placeholder="john@example.com"
          />
        </div>

        <div>
          <label
            className="text-xs font-semibold uppercase tracking-wider block mb-1.5"
            style={{ color: 'var(--landing-text-muted)' }}
          >
            {t('careers.formPhone', 'Phone')}
          </label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className="w-full px-4 py-2.5 rounded-xl text-sm outline-none focus:ring-2"
            style={inputStyle}
            placeholder="+374 XX XXX XXX"
          />
        </div>

        <div>
          <label
            className="text-xs font-semibold uppercase tracking-wider block mb-1.5"
            style={{ color: 'var(--landing-text-muted)' }}
          >
            {t('careers.formResume', 'Resume / Cover Letter')}
          </label>
          <textarea
            value={form.resumeText}
            onChange={(e) => setForm((f) => ({ ...f, resumeText: e.target.value }))}
            rows={5}
            className="w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-none focus:ring-2"
            style={inputStyle}
            placeholder={t(
              'careers.resumePlaceholder',
              "Tell us about yourself, your experience, and why you're interested in this role...",
            )}
          />
        </div>

        {/* Privacy consent */}
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.consent}
            onChange={(e) => setForm((f) => ({ ...f, consent: e.target.checked }))}
            className="mt-0.5 w-4 h-4 rounded"
          />
          <span className="text-xs leading-relaxed" style={{ color: 'var(--landing-text-muted)' }}>
            {t(
              'careers.consentText',
              'I agree to the processing of my personal data in accordance with the Privacy Policy. My data will be used solely for recruitment purposes.',
            )}
          </span>
        </label>

        {error && <p className="text-sm text-red-500 font-medium">{error}</p>}

        <button
          onClick={onSubmit}
          disabled={loading}
          className="w-full px-6 py-3 rounded-xl font-semibold text-sm transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background:
              'linear-gradient(135deg, var(--landing-gradient-from), var(--landing-gradient-to))',
            color: '#fff',
          }}
        >
          {loading
            ? t('careers.submitting', 'Submitting...')
            : t('careers.submitApplication', 'Submit Application')}
        </button>
      </div>
    </div>
  );
}
