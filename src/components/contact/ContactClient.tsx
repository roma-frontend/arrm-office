'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';
import {
  Building2,
  Mail,
  MessageSquare,
  Users,
  ArrowRight,
  CheckCircle,
  ChevronLeft,
  Shield,
  Zap,
  Star,
  Phone,
  Globe,
  Clock,
} from 'lucide-react';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { CustomSelect } from '@/components/ui/CustomSelect';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export default function ContactClient() {
  const { t } = useTranslation();

  const TEAM_SIZES = [
    t('contactPage.team1to10'),
    t('contactPage.team11to50'),
    t('contactPage.team51to200'),
    t('contactPage.team201to500'),
    t('contactPage.team500plus'),
  ];

  const ENTERPRISE_FEATURES = [
    { icon: <Users size={18} />, text: t('contactPage.employeesSupported') },
    { icon: <Shield size={18} />, text: t('contactPage.securityReview') },
    { icon: <Zap size={18} />, text: t('contactPage.customIntegrations') },
    { icon: <Star size={18} />, text: t('contactPage.prioritySupport') },
    { icon: <Globe size={18} />, text: t('contactPage.onPremise') },
    { icon: <Clock size={18} />, text: t('contactPage.uptime') },
  ];

  const [form, setForm] = useState({ name: '', email: '', company: '', teamSize: '', message: '' });
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) {
      setError(t('contactPage.fillAllFields') || t('errors.required'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      await convex.mutation(api.subscriptions.saveContactInquiry, {
        name: form.name,
        email: form.email,
        company: form.company || undefined,
        teamSize: form.teamSize || undefined,
        message: form.message,
        plan: 'enterprise',
      });
      setSent(true);
    } catch (_e) {
      setError(t('errors.somethingWentWrong'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen relative overflow-hidden"
      style={{ background: 'var(--landing-bg)' }}
    >
      {/* Navbar */}
      <Navbar />

      {/* Background glows */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-0 left-1/4 w-96 h-96 rounded-full blur-[120px]"
          style={{ background: 'var(--landing-orb-1)' }}
        />
        <div
          className="absolute bottom-0 right-1/4 w-96 h-96 rounded-full blur-[120px]"
          style={{ background: 'var(--landing-orb-2)' }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[160px]"
          style={{ background: 'var(--landing-orb-3)' }}
        />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 mt-12 pb-24">
        {/* Back link */}
        <Link
          href="/#pricing"
          className="inline-flex items-center gap-2 text-sm mb-12 transition-colors group"
          style={{ color: 'var(--landing-text-muted)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--landing-text-secondary)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--landing-text-muted)')}
        >
          <ChevronLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
          {t('contactPage.backToPricing')}
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
          {/* ── Left — Info ─────────────────────────────────────────────────── */}
          <div>
            {/* Eyebrow */}
            <span
              className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-full mb-6"
              style={{ background: 'rgba(37,99,235,0.1)', color: '#2563eb' }}
            >
              <Building2 size={14} />
              {t('contact.enterpriseSupport')}
            </span>

            <h1
              className="text-4xl md:text-5xl font-black leading-tight mb-6"
              style={{ color: 'var(--landing-text-primary)' }}
            >
              {t('contactPage.contactHeader')}
            </h1>

            <p
              className="text-lg leading-relaxed mb-10"
              style={{ color: 'var(--landing-text-secondary)', opacity: 0.9 }}
            >
              {t('contactPage.enterpriseSubtitle')}
            </p>

            {/* Features */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-12">
              {ENTERPRISE_FEATURES.map(({ icon, text }) => (
                <div
                  key={text}
                  className="flex items-center gap-3 p-4 rounded-2xl backdrop-blur-xl"
                  style={{
                    backgroundColor: 'var(--landing-card-bg)',
                    border: '1px solid var(--landing-card-border)',
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      background: 'rgba(37,99,235,0.1)',
                      border: '1px solid rgba(37,99,235,0.2)',
                      color: '#2563eb',
                    }}
                  >
                    {icon}
                  </div>
                  <span className="text-sm" style={{ color: 'var(--landing-text-secondary)' }}>
                    {text}
                  </span>
                </div>
              ))}
            </div>

            {/* Contact info */}
            <div className="space-y-4">
              <p
                className="text-xs uppercase tracking-widest font-semibold mb-3"
                style={{ color: 'var(--landing-text-muted)' }}
              >
                {t('contactPage.directContact')}
              </p>
              {[
                {
                  icon: <Mail size={15} />,
                  label: 'sales@strata.work',
                  href: 'mailto:sales@strata.work',
                },
                { icon: <Phone size={15} />, label: '+1 (800) 555-0199', href: 'tel:+18005550199' },
              ].map(({ icon, label, href }) => (
                <a
                  key={label}
                  href={href}
                  className="flex items-center gap-3 text-sm transition-colors"
                  style={{ color: 'var(--landing-text-muted)' }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.color = 'var(--landing-text-secondary)')
                  }
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--landing-text-muted)')}
                >
                  <span style={{ color: 'var(--landing-text-muted)', opacity: 0.6 }}>{icon}</span>
                  {label}
                </a>
              ))}
            </div>
          </div>

          {/* ── Right — Form ─────────────────────────────────────────────────── */}
          <div className="relative">
            {/* Card glow */}
            <div
              className="absolute -inset-1 rounded-3xl blur-xl opacity-15"
              style={{
                background:
                  'linear-gradient(135deg, var(--landing-gradient-from), var(--landing-gradient-to))',
              }}
            />

            <div
              className="relative rounded-3xl overflow-hidden backdrop-blur-xl shadow-xl"
              style={{
                backgroundColor: 'var(--landing-card-bg)',
                border: '1px solid var(--landing-card-border)',
              }}
            >
              {/* Top accent */}
              <div
                className="h-[2px] w-full"
                style={{
                  background:
                    'linear-gradient(90deg, transparent, var(--landing-gradient-from), var(--landing-gradient-to), transparent)',
                }}
              />

              <div className="p-8 md:p-10">
                {sent ? (
                  /* ── Success state ── */
                  <div className="flex flex-col items-center text-center py-8 gap-6">
                    <div className="relative">
                      <div
                        className="absolute inset-0 rounded-full blur-xl scale-150"
                        style={{ background: 'var(--success)', opacity: 0.2 }}
                      />
                      <div
                        className="relative w-20 h-20 rounded-full flex items-center justify-center success-reveal"
                        style={{
                          background: 'linear-gradient(135deg, #34d399, #10b981)',
                          boxShadow: '0 16px 48px rgba(52,211,153,0.3)',
                        }}
                      >
                        <CheckCircle size={40} className="text-white" />
                      </div>
                    </div>
                    <div>
                      <h2
                        className="text-2xl font-bold mb-2"
                        style={{ color: 'var(--landing-text-primary)' }}
                      >
                        {t('contactPage.messageSentTitle')}
                      </h2>
                      <p
                        className="text-sm leading-relaxed"
                        style={{ color: 'var(--landing-text-secondary)', opacity: 0.85 }}
                      >
                        {t('contactPage.messageSentDesc')}
                      </p>
                    </div>
                    <Link
                      href="/"
                      className="flex items-center gap-2 px-8 py-3.5 rounded-2xl text-sm font-semibold text-white transition-all hover:opacity-90 hover:shadow-lg shadow-md"
                      style={{
                        background: 'linear-gradient(135deg, #2563eb, #60a5fa)',
                        boxShadow: '0 4px 16px rgba(37,99,235,0.15)',
                      }}
                    >
                      {t('ui.backToHome')} <ArrowRight size={15} />
                    </Link>
                  </div>
                ) : (
                  /* ── Form ── */
                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                      <h2
                        className="text-2xl font-bold mb-1"
                        style={{ color: 'var(--landing-text-primary)' }}
                      >
                        {t('contact.title')}
                      </h2>
                      <p className="text-sm" style={{ color: 'var(--landing-text-muted)' }}>
                        {t('contactPage.enterpriseSubtitle')}
                      </p>
                    </div>

                    {/* Name + Email */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label={t('contact.name') + ' *'} icon={<Users size={14} />}>
                        <input
                          type="text"
                          placeholder={t('placeholders.johnSmith')}
                          required
                          value={form.name}
                          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                          className="w-full text-sm outline-none font-medium"
                          style={{
                            backgroundColor: 'transparent',
                            color: 'var(--landing-text-primary)',
                          }}
                        />
                      </Field>
                      <Field label={t('contact.email') + ' *'} icon={<Mail size={14} />}>
                        <input
                          type="email"
                          placeholder="john@company.com"
                          required
                          value={form.email}
                          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                          className="w-full text-sm outline-none font-medium"
                          style={{
                            backgroundColor: 'transparent',
                            color: 'var(--landing-text-primary)',
                          }}
                        />
                      </Field>
                    </div>

                    {/* Company + Team size */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label={t('contact.company')} icon={<Building2 size={14} />}>
                        <input
                          type="text"
                          placeholder={t('placeholders.acmeCorp')}
                          value={form.company}
                          onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                          className="w-full text-sm outline-none font-medium"
                          style={{
                            backgroundColor: 'transparent',
                            color: 'var(--landing-text-primary)',
                          }}
                        />
                      </Field>
                      <Field label={t('contact.teamSize')} icon={<Users size={14} />}>
                        <CustomSelect
                          value={form.teamSize}
                          onChange={(v) => setForm((f) => ({ ...f, teamSize: v }))}
                          fullWidth
                          options={[
                            { value: '', label: t('contactPage.selectTeamSize'), disabled: true },
                            ...TEAM_SIZES.map((s) => ({ value: s, label: s })),
                          ]}
                          triggerClassName="w-full text-sm outline-none appearance-none cursor-pointer font-medium"
                          dropdownClassName="bg-background text-foreground"
                        />
                      </Field>
                    </div>

                    {/* Message */}
                    <Field label={t('contact.message') + ' *'} icon={<MessageSquare size={14} />}>
                      <textarea
                        placeholder={t('contactPage.requirementsPlaceholder')}
                        required
                        rows={4}
                        value={form.message}
                        onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                        className="w-full text-sm outline-none resize-none font-medium min-h-25"
                        style={{
                          backgroundColor: 'transparent',
                          color: 'var(--landing-text-primary)',
                        }}
                      />
                    </Field>

                    {error && (
                      <p
                        className="text-sm flex items-center gap-2"
                        role="alert"
                        style={{ color: 'var(--destructive)' }}
                      >
                        <span
                          className="w-1 h-1 rounded-full shrink-0"
                          style={{ backgroundColor: 'var(--destructive)' }}
                        />
                        {error}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-4 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 hover:shadow-lg shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
                      style={{
                        background: 'linear-gradient(135deg, #2563eb, #60a5fa)',
                        boxShadow: '0 4px 16px rgba(37,99,235,0.15)',
                      }}
                    >
                      {loading ? (
                        <ShieldLoader size="xs" variant="inline" />
                      ) : (
                        <>
                          <MessageSquare size={16} />
                          {t('contact.sendMessage')}
                          <ArrowRight size={16} />
                        </>
                      )}
                    </button>

                    <p
                      className="text-center text-xs flex items-center justify-center gap-1.5"
                      style={{ color: 'var(--landing-text-muted)' }}
                    >
                      <Shield size={11} />
                      {t('contact.securityNotice')}
                    </p>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}

// ── Field wrapper ─────────────────────────────────────────────────────────────
function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="flex items-center gap-1.5 text-xs font-medium mb-2"
        style={{ color: 'var(--landing-text-primary)' }}
      >
        <span style={{ color: 'var(--landing-text-muted)', opacity: 0.8 }}>{icon}</span>
        {label}
      </label>
      <div
        className="px-4 py-3 rounded-xl backdrop-blur-sm transition-all focus-within:ring-2 focus-within:ring-primary/10 shadow-sm"
        style={{
          backgroundColor: 'var(--landing-card-bg)',
          border: '1px solid var(--landing-card-border)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
