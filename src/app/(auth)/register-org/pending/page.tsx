'use client';

import { motion } from '@/lib/cssMotion';
import { Clock, Mail, CheckCircle2, ArrowRight, Building2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

export default function PendingPage() {
  const { t } = useTranslation();
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'var(--background)' }}
    >
      {/* Background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl opacity-20"
          style={{ background: 'radial-gradient(circle, #2563eb, transparent)' }}
        />
        <div
          className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl opacity-20"
          style={{ background: 'radial-gradient(circle, #0ea5e9, transparent)' }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-lg relative"
      >
        <div
          className="rounded-2xl p-8 shadow-2xl border text-center"
          style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
        >
          {/* Logo */}
          <Link href="/" className="inline-block mb-6 group" title={t('auth.logoTooltip')}>
            <div className="w-12 h-12 rounded-xl btn-gradient flex items-center justify-center mx-auto shadow-lg transition-transform group-hover:scale-105">
              <Building2 className="w-6 h-6 text-white" />
            </div>
          </Link>

          {/* Success icon */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #10b981, #22c55e)' }}
          >
            <CheckCircle2 className="w-10 h-10 text-white" />
          </motion.div>

          {/* Message */}
          <h1 className="text-3xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
            {t('auth.pending.title', 'Request Submitted!')}
          </h1>
          <p className="text-lg mb-8" style={{ color: 'var(--text-secondary)' }}>
            {t('auth.pending.subtitle', 'Thank you for your interest in Strata.')}
          </p>

          {/* Timeline */}
          <div className="space-y-4 mb-8 text-left">
            <div
              className="flex items-start gap-3 p-4 rounded-xl"
              style={{ background: 'rgba(37,99,235,0.05)' }}
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-linear-to-r from-(--primary) to-(--primary-dark,var(--primary))">
                <CheckCircle2 className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
                  {t('auth.pending.requestReceived', 'Request Received')}
                </h3>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {t(
                    'auth.pending.requestReceivedDesc',
                    "We've received your organization creation request.",
                  )}
                </p>
              </div>
            </div>

            <div
              className="flex items-start gap-3 p-4 rounded-xl"
              style={{ background: 'rgba(37,99,235,0.05)' }}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{ background: 'linear-gradient(135deg, #f59e0b, #f97316)' }}
              >
                <Clock className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
                  {t('auth.pending.underReview', 'Under Review')}
                </h3>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {t(
                    'auth.pending.underReviewDesc',
                    'Our team is reviewing your request. This typically takes up to 24 hours.',
                  )}
                </p>
              </div>
            </div>

            <div
              className="flex items-start gap-3 p-4 rounded-xl"
              style={{ background: 'rgba(107,114,128,0.05)' }}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{ background: 'linear-gradient(135deg, #6b7280, #9ca3af)' }}
              >
                <Mail className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
                  {t('auth.pending.emailNotification', 'Email Notification')}
                </h3>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {t(
                    'auth.pending.emailNotificationDesc',
                    "You'll receive an email with login instructions once approved.",
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Info box */}
          <div
            className="p-4 rounded-xl mb-6"
            style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)' }}
          >
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              💡 <strong>{t('auth.pending.nextSteps', 'Next Steps')}:</strong>{' '}
              {t(
                'auth.pending.nextStepsDesc',
                "Check your email for updates. We'll notify you as soon as your organization is ready.",
              )}
            </p>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <Link href="/login">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full py-3 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 btn-gradient"
              >
                {t('auth.pending.goToLogin', 'Go to Login')}
                <ArrowRight className="w-4 h-4" />
              </motion.button>
            </Link>
          </div>
        </div>

        <p className="text-center text-xs mt-4" style={{ color: 'var(--text-muted)' }}>
          {t('auth.pending.questions', 'Questions?')}{' '}
          {t('auth.pending.contactSupport', 'Contact us at')} support@officehub.com
        </p>
      </motion.div>
    </div>
  );
}
