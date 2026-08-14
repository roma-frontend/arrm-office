import Link from 'next/link';
import { cookies } from 'next/headers';
import { getServerTranslation } from '@/lib/i18n/server-translation';
import { formatDate } from '@/lib/date-format';

export default async function PrivacyPage() {
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
            {t('legal.privacyTitle').split(' | ')[0]}
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
              {t('legal.infoWeCollect')}
            </h2>
            <p>{t('legal.infoWeCollectDesc')}</p>
            <ul className="list-disc pl-6 space-y-1 mt-3">
              <li>{t('legal.accountInfo')}</li>
              <li>{t('legal.attendanceData')}</li>
              <li>{t('legal.faceData')}</li>
              <li>{t('legal.leaveRequests')}</li>
              <li>{t('legal.taskAssignments')}</li>
              <li>{t('legal.profilePhotos')}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3" style={{ color: 'var(--landing-text-primary)' }}>
              {t('legal.howWeUse')}
            </h2>
            <p>{t('legal.howWeUseDesc')}</p>
            <ul className="list-disc pl-6 space-y-1 mt-3">
              <li>{t('legal.provideMaintain')}</li>
              <li>{t('legal.processAttendance')}</li>
              <li>{t('legal.sendNotifications')}</li>
              <li>{t('legal.generateAnalytics')}</li>
              <li>{t('legal.ensureSecurity')}</li>
            </ul>
          </section>

          <section id="cookies">
            <h2 className="text-xl font-bold mb-3" style={{ color: 'var(--landing-text-primary)' }}>
              {t('legal.cookies')}
            </h2>
            <p>{t('legal.cookiesDesc')}</p>
            <ul className="list-disc pl-6 space-y-1 mt-3">
              <li>{t('legal.maintainSession')}</li>
              <li>{t('legal.rememberPreferences')}</li>
              <li>{t('legal.analyzeUsage')}</li>
            </ul>
            <p className="mt-3">{t('legal.cookiesNote')}</p>
          </section>

          <section id="gdpr">
            <h2 className="text-xl font-bold mb-3" style={{ color: 'var(--landing-text-primary)' }}>
              {t('legal.gdpr')}
            </h2>
            <p>{t('legal.gdprDesc')}</p>
            <ul className="list-disc pl-6 space-y-1 mt-3">
              <li>
                <strong style={{ color: 'var(--landing-text-primary)' }}>
                  {t('legal.rightOfAccess')}
                </strong>
              </li>
              <li>
                <strong style={{ color: 'var(--landing-text-primary)' }}>
                  {t('legal.rightToRectification')}
                </strong>
              </li>
              <li>
                <strong style={{ color: 'var(--landing-text-primary)' }}>
                  {t('legal.rightToErasure')}
                </strong>
              </li>
              <li>
                <strong style={{ color: 'var(--landing-text-primary)' }}>
                  {t('legal.rightToPortability')}
                </strong>
              </li>
              <li>
                <strong style={{ color: 'var(--landing-text-primary)' }}>
                  {t('legal.rightToObject')}
                </strong>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3" style={{ color: 'var(--landing-text-primary)' }}>
              {t('legal.dataSecurity')}
            </h2>
            <p>{t('legal.dataSecurityDesc')}</p>
            <ul className="list-disc pl-6 space-y-1 mt-3">
              <li>{t('legal.encryption')}</li>
              <li>{t('legal.https')}</li>
              <li>{t('legal.convex')}</li>
              <li>{t('legal.vectors')}</li>
              <li>{t('legal.audits')}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3" style={{ color: 'var(--landing-text-primary)' }}>
              {t('legal.dataRetention')}
            </h2>
            <p>{t('legal.dataRetentionDesc')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3" style={{ color: 'var(--landing-text-primary)' }}>
              {t('legal.contactUs')}
            </h2>
            <p>{t('legal.contactUsDesc')}</p>
            <div
              className="mt-3 p-4 rounded-xl"
              style={{
                backgroundColor: 'var(--landing-card-bg)',
                border: '1px solid var(--landing-card-border)',
              }}
            >
              <p className="font-medium" style={{ color: 'var(--primary)' }}>
                {t('legal.privacyEmail')}
              </p>
              <p
                className="text-sm mt-1"
                style={{ color: 'var(--landing-text-muted)', opacity: 0.7 }}
              >
                {t('legal.respondPrivacy')}
              </p>
            </div>
          </section>
        </div>

        <div
          className="mt-12 pt-8 border-t flex gap-4"
          style={{ borderColor: 'var(--landing-card-border)' }}
        >
          <Link
            href="/terms"
            className="text-sm transition-colors hover:opacity-80"
            style={{ color: 'var(--primary)' }}
          >
            {t('legal.termsTitle').split(' | ')[0]}
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
