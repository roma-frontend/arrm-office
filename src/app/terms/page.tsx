import Link from 'next/link';
import { cookies } from 'next/headers';
import { getServerTranslation } from '@/lib/i18n/server-translation';
import { formatDate } from '@/lib/date-format';

export default async function TermsPage() {
  const cookieStore = await cookies();
  const locale = cookieStore.get('i18nextLng')?.value || 'en';
  const { t } = await getServerTranslation('landing', locale);

  const currentDate = formatDate(new Date(), locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="min-h-screen">
      <div className="border-b px-6 py-4" style={{ borderColor: 'var(--landing-card-border)' }}>
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm transition-colors hover:opacity-80"
          style={{ color: 'var(--primary)' }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          {t('legal.backToHome')}
        </Link>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-12">
          <span
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: 'var(--primary)' }}
          >
            {t('legal.legal')}
          </span>
          <h1
            className="text-4xl font-black mt-2 mb-4"
            style={{ color: 'var(--landing-text-primary)' }}
          >
            {t('legal.termsTitle').split(' | ')[0]}
          </h1>
          <p className="text-sm" style={{ color: 'var(--landing-text-muted)', opacity: 0.7 }}>
            {t('legal.lastUpdated')} {currentDate}
          </p>
        </div>

        <div
          className="max-w-none space-y-8 leading-relaxed"
          style={{ color: 'var(--landing-text-secondary)', opacity: 0.85 }}
        >
          <section>
            <h2 className="text-xl font-bold mb-3" style={{ color: 'var(--landing-text-primary)' }}>
              {t('legal.acceptance')}
            </h2>
            <p>{t('legal.acceptanceDesc')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3" style={{ color: 'var(--landing-text-primary)' }}>
              {t('legal.useOfServices')}
            </h2>
            <p>{t('legal.useOfServicesDesc')}</p>
            <ul className="list-disc pl-6 space-y-1 mt-3">
              <li>{t('legal.realtimeTracking')}</li>
              <li>{t('legal.leaveManagement')}</li>
              <li>{t('legal.taskManagement')}</li>
              <li>{t('legal.employeeAnalytics')}</li>
              <li>{t('legal.aiAssistant')}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3" style={{ color: 'var(--landing-text-primary)' }}>
              {t('legal.userResponsibilities')}
            </h2>
            <p>{t('legal.userResponsibilitiesDesc')}</p>
            <ul className="list-disc pl-6 space-y-1 mt-3">
              <li>{t('legal.maintainConfidentiality')}</li>
              <li>{t('legal.allActivities')}</li>
              <li>{t('legal.ensureAccurate')}</li>
              <li>{t('legal.complyLaws')}</li>
              <li>{t('legal.notAttemptAccess')}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3" style={{ color: 'var(--landing-text-primary)' }}>
              {t('legal.adminResponsibilities')}
            </h2>
            <p>{t('legal.adminResponsibilitiesDesc')}</p>
            <ul className="list-disc pl-6 space-y-1 mt-3">
              <li>{t('legal.manageAccess')}</li>
              <li>{t('legal.ensureConsent')}</li>
              <li>{t('legal.complyLocal')}</li>
              <li>{t('legal.configureSchedules')}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3" style={{ color: 'var(--landing-text-primary)' }}>
              {t('legal.intellectualProperty')}
            </h2>
            <p>{t('legal.intellectualPropertyDesc')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3" style={{ color: 'var(--landing-text-primary)' }}>
              {t('legal.limitationLiability')}
            </h2>
            <p>{t('legal.limitationLiabilityDesc')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3" style={{ color: 'var(--landing-text-primary)' }}>
              {t('legal.serviceAvailability')}
            </h2>
            <p>{t('legal.serviceAvailabilityDesc')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3" style={{ color: 'var(--landing-text-primary)' }}>
              {t('legal.termination')}
            </h2>
            <p>{t('legal.terminationDesc')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3" style={{ color: 'var(--landing-text-primary)' }}>
              {t('legal.changesTerms')}
            </h2>
            <p>{t('legal.changesTermsDesc')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3" style={{ color: 'var(--landing-text-primary)' }}>
              {t('legal.contactSection')}
            </h2>
            <p>{t('legal.contactSectionDesc')}</p>
            <div
              className="mt-3 p-4 rounded-xl"
              style={{
                backgroundColor: 'var(--landing-card-bg)',
                border: '1px solid var(--landing-card-border)',
              }}
            >
              <p className="font-medium" style={{ color: 'var(--primary)' }}>
                {t('legal.legalEmail')}
              </p>
              <p
                className="text-sm mt-1"
                style={{ color: 'var(--landing-text-muted)', opacity: 0.7 }}
              >
                {t('legal.respondWithin')}
              </p>
            </div>
          </section>
        </div>

        <div
          className="mt-12 pt-8 border-t flex gap-4"
          style={{ borderColor: 'var(--landing-card-border)' }}
        >
          <Link
            href="/privacy"
            className="text-sm transition-colors hover:opacity-80"
            style={{ color: 'var(--primary)' }}
          >
            {t('legal.privacyPolicy')}
          </Link>
          <Link
            href="/"
            className="text-sm transition-colors hover:opacity-80"
            style={{ color: 'var(--primary)' }}
          >
            {t('legal.backToHome')}
          </Link>
        </div>
      </div>
    </div>
  );
}
