'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from '@/lib/cssMotion';
import { Building2, Check, Zap, Crown, ArrowRight } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';

type Plan = 'starter' | 'professional' | 'enterprise';

export default function RegisterOrgPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const currency = useCurrency();

  const plans = [
    {
      id: 'starter' as Plan,
      name: t('auth.plans.starter.name', 'Starter'),
      price: currency.loading
        ? '$29' + t('auth.plans.perMonth', '/mo')
        : currency.starter.formatted + t('auth.plans.perMonth', '/mo'),
      description: t('auth.plans.starter.desc', 'Ideal for small teams getting started'),
      icon: Zap,
      color: 'from-(--success-solid) to-(--success-solid)',
      gradient: 'var(--green-500), var(--green-600)',
      features: [
        t('auth.plans.starter.employees', 'Up to 10 employees'),
        t('auth.plans.starter.basicLeave', 'Basic leave management'),
        t('auth.plans.starter.timeTracking', 'Time tracking & attendance'),
        t('auth.plans.starter.employeeProfiles', 'Employee profiles & records'),
        t('auth.plans.starter.emailNotifications', 'Email notifications & alerts'),
        t('auth.plans.starter.communitySupport', 'Community support forum'),
      ],
      instant: true,
    },
    {
      id: 'professional' as Plan,
      name: t('auth.plans.professional.name', 'Professional'),
      price: currency.loading
        ? '$79' + t('auth.plans.perMonth', '/mo')
        : currency.professional.formatted + t('auth.plans.perMonth', '/mo'),
      description: t('auth.plans.professional.desc', 'For growing teams with advanced needs'),
      icon: Building2,
      color: 'from-(--brand) to-(--cyan)',
      gradient: 'var(--brand-500), var(--cyan-500)',
      features: [
        t('auth.plans.professional.employees50', 'Up to 50 employees'),
        t('auth.plans.professional.everythingStarter', 'Everything in Starter +'),
        t('auth.plans.professional.advancedAnalytics', 'AI-powered insights & analytics'),
        t('auth.plans.professional.customWorkflows', 'Custom reports & dashboards'),
        t('auth.plans.professional.prioritySupport', 'Priority support'),
        t('auth.plans.professional.apiAccess', 'Calendar integrations (Google & Outlook)'),
        t('auth.plans.professional.integrations', 'Custom integrations & webhooks'),
      ],
      instant: false,
      popular: true,
    },
    {
      id: 'enterprise' as Plan,
      name: t('auth.plans.enterprise.name', 'Enterprise'),
      price: t('auth.plans.custom', 'Custom'),
      description: t('auth.plans.enterprise.desc', 'Unlimited scale for large organizations'),
      icon: Crown,
      color: 'from-(--purple) to-(--pink)',
      gradient: 'var(--violet-500), var(--pink-500)',
      features: [
        t('auth.plans.enterprise.employees100', 'Unlimited employees'),
        t('auth.plans.enterprise.everythingPro', 'Everything in Professional +'),
        t('auth.plans.enterprise.dedicatedSupport', 'Dedicated support'),
        t('auth.plans.enterprise.customIntegrations', 'Custom integrations & webhooks'),
        t('auth.plans.enterprise.slaGuarantee', 'SLA agreement & guarantees'),
        t('auth.plans.enterprise.advancedSecurity', 'Advanced security & compliance'),
        t('auth.plans.enterprise.trainingOnboarding', 'Priority AI processing'),
        t('auth.plans.enterprise.automatedBackups', 'Automated employee backups (48h retention)'),
      ],
      instant: false,
    },
  ];

  const handleSelectPlan = (plan: Plan) => {
    setSelectedPlan(plan);
    // Navigate to registration form with plan
    if (plan === 'starter') {
      router.push(`/register-org/create?plan=${plan}`);
    } else {
      router.push(`/register-org/request?plan=${plan}`);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'var(--background)' }}
    >
      {/* Background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl opacity-20"
          style={{ background: 'radial-gradient(circle, var(--brand), transparent)' }}
        />
        <div
          className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl opacity-20"
          style={{ background: 'radial-gradient(circle, var(--brand-hover), transparent)' }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="w-full max-w-6xl relative"
      >
        {/* Header */}
        <div className="text-center my-12">
          <h1 className="text-4xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            {t('auth.chooseYourPlan', 'Choose Your Plan')}
          </h1>
          <p className="text-lg" style={{ color: 'var(--text-muted)' }}>
            {t('auth.startManagingTeam', 'Start managing your team today')}
          </p>
        </div>

        {/* Plans Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {plans.map((plan) => {
            const Icon = plan.icon;
            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl p-6 cursor-pointer border-2 hover:scale-105 transition-transform ${
                  selectedPlan === plan.id
                    ? 'border-(--brand-outline) shadow-xl'
                    : 'border-transparent hover:border-(--brand-outline)'
                }`}
                style={{
                  background: 'var(--card)',
                  boxShadow: plan.popular ? '0 0 30px rgba(44,140,213,0.2)' : undefined,
                }}
                onClick={() => handleSelectPlan(plan.id)}
              >
                {/* Popular badge */}
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold text-white text-center bg-linear-to-r from-(--brand) to-(--cyan)">
                    {t('auth.mostPopular', 'Most Popular')}
                  </div>
                )}

                {/* Icon.
                    `var(--color-${plan.id})` used to be interpolated here — no
                    such variable was ever defined, so the gradient had a single
                    invalid stop and the tile rendered with no background. */}
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: `linear-gradient(135deg, ${plan.gradient})` }}
                >
                  <Icon className="w-6 h-6 text-white" />
                </div>

                {/* Plan details */}
                <h3 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                  {plan.name}
                </h3>
                {/* `plan.color` holds Tailwind gradient class names, not CSS
                    colour stops, so interpolating it into `linear-gradient()`
                    produced an invalid value — combined with
                    `text-transparent`, the price rendered invisible. */}
                <p
                  className="text-3xl font-bold mb-2 bg-clip-text text-transparent"
                  style={{ backgroundImage: `linear-gradient(135deg, ${plan.gradient})` }}
                >
                  {plan.price}
                </p>
                <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                  {plan.description}
                </p>

                {/* Features */}
                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 mt-0.5 text-(--success-text) shrink-0" />
                      <span style={{ color: 'var(--text-secondary)' }}>{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* Action button */}
                <button
                  className="w-full py-2.5 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all"
                  style={{ background: `linear-gradient(135deg, ${plan.color})` }}
                >
                  {plan.instant ? t('auth.getStartedFree') : t('auth.requestAccess')}
                  <ArrowRight className="w-4 h-4" />
                </button>

                {!plan.instant && (
                  <p className="text-xs text-center my-3" style={{ color: 'var(--text-muted)' }}>
                    {t('auth.approvalWithin24h', 'Approval within 24 hours')}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="text-center p-6">
          <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
            {t('auth.alreadyHaveOrg')}{' '}
            <Link href="/register" className="font-semibold hover:underline text-(--brand-text)">
              {t('auth.joinExistingTeam')}
            </Link>
          </p>
          <Link
            href="/login"
            className="text-sm hover:underline"
            style={{ color: 'var(--text-muted)' }}
          >
            ← {t('ui.backToLogin')}
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
