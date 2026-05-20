'use client';

import { useState, useTransition, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from '@/lib/cssMotion';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Building2,
  Globe,
  Briefcase,
  Users,
  User,
  Mail,
  Lock,
  Phone,
  ArrowLeft,
  CheckCircle2,
  Crown,
} from 'lucide-react';
import { toast } from 'sonner';
import bcrypt from 'bcryptjs';
import { useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';

const passwordStrength = (pwd: string) => {
  if (pwd.length < 8) return 0;
  let strength = 1;
  if (/[A-Z]/.test(pwd)) strength++;
  if (/[0-9]/.test(pwd)) strength++;
  if (/[^A-Za-z0-9]/.test(pwd)) strength++;
  return strength;
};

const STRENGTH_COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#10b981'];
const STRENGTH_LABELS = ['Weak', 'Fair', 'Good', 'Strong'];

const TEAM_SIZES = ['1-10', '11-50', '51-200', '200+'];

export default function RequestOrgPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    orgName: '',
    slug: '',
    userName: '',
    email: '',
    password: '',
    phone: '',
    country: '',
    industry: '',
    teamSize: '',
    description: '',
  });

  const requestOrg = useMutation(api.organizationRequests.requestOrganization);

  const strength = passwordStrength(formData.password);

  const plan = searchParams.get('plan') as 'professional' | 'enterprise' | null;

  const accentColor = plan === 'enterprise' ? '#a855f7' : '#2563eb';
  const gradientColor =
    plan === 'enterprise' ? 'from-purple-500 to-pink-500' : 'from-blue-500 to-cyan-500';

  useEffect(() => {
    if (plan !== 'professional' && plan !== 'enterprise') {
      router.push('/register-org');
    }
  }, [plan, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (formData.password.length < 8) {
      setError(t('auth.passwordMin8', 'Password must be at least 8 characters'));
      return;
    }

    if (!formData.slug) {
      setError(t('registerOrgPage.orgUrl') + ' is required');
      return;
    }

    if (!plan) {
      setError('Plan not selected');
      return;
    }

    startTransition(async () => {
      try {
        const hashedPassword = await bcrypt.hash(formData.password, 10);

        await requestOrg({
          name: formData.orgName,
          slug: formData.slug,
          email: formData.email,
          password: hashedPassword,
          userName: formData.userName,
          phone: formData.phone || undefined,
          plan,
          country: formData.country || undefined,
          industry: formData.industry || undefined,
          teamSize: formData.teamSize || undefined,
          description: formData.description || undefined,
        });

        toast.success(t('registerOrgPage.requestSubmitted', 'Request submitted successfully!'));
        fetch('/api/telegram/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'org_register',
            data: {
              orgName: formData.orgName,
              name: formData.userName,
              email: formData.email,
              phone: formData.phone,
            },
          }),
        }).catch(() => {});
        router.push('/register-org/pending');
      } catch (_err) {
        const errorMessage = _err instanceof Error ? _err.message : 'Failed to submit request';
        setError(errorMessage);
        toast.error(errorMessage);
      }
    });
  };

  const planLabel = plan === 'enterprise' ? 'Enterprise' : 'Professional';
  const PlanIcon = plan === 'enterprise' ? Crown : Building2;

  return (
    <div
      className="min-h-screen flex items-center justify-center py-12 px-4"
      style={{ background: 'var(--background)' }}
    >
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl opacity-15"
          style={{ background: `radial-gradient(circle, ${accentColor}, transparent)` }}
        />
        <div
          className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl opacity-15"
          style={{
            background: `radial-gradient(circle, ${plan === 'enterprise' ? '#ec4899' : '#0ea5e9'}, transparent)`,
          }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-xl relative"
      >
        <div
          className="rounded-2xl p-6 sm:p-8 shadow-xl border"
          style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-3 mb-6">
            <div
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${gradientColor})` }}
            >
              <PlanIcon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div>
              <h1
                className="text-xl sm:text-2xl font-bold"
                style={{ color: 'var(--text-primary)' }}
              >
                {t('registerOrgPage.requestTitle', { plan: planLabel })}
              </h1>
              <p className="text-xs sm:text-sm" style={{ color: 'var(--text-muted)' }}>
                {plan === 'enterprise'
                  ? `${t('registerOrgPage.enterpriseCustom')} • ${t('registerOrgPage.enterpriseTeam')}`
                  : `${t('registerOrgPage.proPrice')} • ${t('registerOrgPage.proTeam')}`}{' '}
                • {t('registerOrgPage.approvalNote')}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-4 p-4 rounded-xl" style={{ background: 'var(--muted)' }}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {t('registerOrgPage.orgDetails')}
              </h3>

              <div className="space-y-1.5">
                <Label htmlFor="orgName">{t('registerOrgPage.orgName')}</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
                  <Input
                    id="orgName"
                    type="text"
                    required
                    value={formData.orgName}
                    onChange={(e) => {
                      const orgName = e.target.value;
                      const slug = orgName
                        .toLowerCase()
                        .replace(/[^a-z0-9\s-]/g, '')
                        .replace(/\s+/g, '-')
                        .substring(0, 30);
                      setFormData((p) => ({ ...p, orgName, slug }));
                    }}
                    placeholder={t('placeholders.acmeCorporation')}
                    className="pl-10"
                    style={{ '--focus-ring': accentColor } as React.CSSProperties}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="slug">{t('registerOrgPage.orgUrl')}</Label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
                  <Input
                    id="slug"
                    type="text"
                    required
                    value={formData.slug}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
                      }))
                    }
                    placeholder="acme-corp"
                    className="pl-10"
                  />
                </div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {t('registerOrgPage.yourTeam')}
                  <strong>{formData.slug || 'your-org'}</strong>
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="industry">{t('registerOrgPage.industry')}</Label>
                  <div className="relative">
                    <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
                    <Input
                      id="industry"
                      type="text"
                      value={formData.industry}
                      onChange={(e) => setFormData((p) => ({ ...p, industry: e.target.value }))}
                      placeholder={t('placeholders.technology')}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="teamSize">{t('registerOrgPage.teamSize')}</Label>
                  <div className="relative">
                    <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
                    <CustomSelect
                      value={formData.teamSize}
                      onChange={(v) => setFormData((p) => ({ ...p, teamSize: v }))}
                      fullWidth
                      options={[
                        { value: '', label: t('registerOrgPage.selectSize') },
                        ...TEAM_SIZES.map((size) => ({
                          value: size,
                          label: `${size} ${t('registerOrgPage.employees')}`,
                        })),
                      ]}
                      triggerClassName="w-full pl-10 pr-4 py-2 rounded-xl border text-sm outline-none transition-all appearance-none bg-(--input)"
                      dropdownClassName="bg-[var(--input)] border-[var(--border)] text-[var(--text-primary)]"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {t('registerOrgPage.yourDetails')} ({t('registerOrgPage.adminAccount')})
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="userName">{t('registerOrgPage.yourName')}</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
                    <Input
                      id="userName"
                      type="text"
                      required
                      value={formData.userName}
                      onChange={(e) => setFormData((p) => ({ ...p, userName: e.target.value }))}
                      placeholder={t('placeholders.johnDoe')}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email">{t('auth.email')}</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
                    <Input
                      id="email"
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                      placeholder="you@company.com"
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="phone">{t('registerOrgPage.phone')}</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
                    <Input
                      id="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
                      placeholder={t('registerOrg.phonePlaceholder', '+1 234 567 890')}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="country">{t('registerOrgPage.country')}</Label>
                  <Input
                    id="country"
                    type="text"
                    value={formData.country}
                    onChange={(e) => setFormData((p) => ({ ...p, country: e.target.value }))}
                    placeholder={t('placeholders.unitedStates')}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">{t('registerOrgPage.password')}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={formData.password}
                    onChange={(e) => setFormData((p) => ({ ...p, password: e.target.value }))}
                    placeholder={t('placeholders.minCharacters')}
                    className="pl-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-(--text-muted)"
                  >
                    {showPassword ? (
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.29 3.29m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-1.415 3.12M6 18a6 6 0 0012 0"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                    )}
                  </button>
                </div>
                {formData.password && (
                  <div className="space-y-1">
                    <div className="flex gap-1">
                      {[0, 1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="flex-1 h-1 rounded-full transition-all"
                          style={{
                            background:
                              i < strength ? STRENGTH_COLORS[strength - 1] : 'var(--border)',
                          }}
                        />
                      ))}
                    </div>
                    <p
                      className="text-xs"
                      style={{
                        color: strength > 0 ? STRENGTH_COLORS[strength - 1] : 'var(--text-muted)',
                      }}
                    >
                      {strength > 0 ? STRENGTH_LABELS[strength - 1] : ''}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">{t('registerOrgPage.tellUsNeeds')}</Label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                placeholder={t('placeholders.whatFeaturesImportant')}
                rows={3}
                className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none transition-all resize-none bg-[var(--input)]"
                style={{
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 p-3 rounded-xl text-sm"
                style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}
              >
                <svg
                  className="w-4 h-4 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {error}
              </motion.div>
            )}

            <Button
              type="submit"
              disabled={isPending}
              className="w-full"
              style={{ background: `linear-gradient(135deg, ${gradientColor})` }}
            >
              {isPending ? (
                <>
                  <ShieldLoader size="xs" variant="inline" className="mr-2" />
                  {t('registerOrgPage.submitting')}
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  {t('registerOrgPage.submitRequest')}
                </>
              )}
            </Button>

            <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
              {t('registerOrgPage.approvalNoteDesc')}
            </p>
          </form>
        </div>

        <div className="text-center my-4">
          <Link
            href="/register-org"
            className="text-sm hover:underline inline-flex items-center gap-1"
            style={{ color: 'var(--text-muted)' }}
          >
            <ArrowLeft className="w-3 h-3" />
            {t('registerOrgPage.backToPlans')}
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
