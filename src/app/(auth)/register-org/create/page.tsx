'use client';

import { useState, useTransition } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from '@/lib/cssMotion';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import {
  Building2,
  User,
  Mail,
  Lock,
  Phone,
  Globe,
  Briefcase,
  Eye,
  EyeOff,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/useAuthStore';
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
const _STRENGTH_LABELS = ['Weak', 'Fair', 'Good', 'Strong'];

export default function CreateStarterOrgPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login: _login } = useAuthStore();
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
  });

  const createStarterOrg = useMutation(api.organizationRequests.createStarterOrganization);

  const _plan = searchParams.get('plan');

  const strength = passwordStrength(formData.password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (!formData.slug) {
      setError('Organization slug is required');
      return;
    }

    startTransition(async () => {
      try {
        // Hash password
        const hashedPassword = await bcrypt.hash(formData.password, 10);

        // Create organization
        await createStarterOrg({
          name: formData.orgName,
          slug: formData.slug,
          email: formData.email,
          password: hashedPassword,
          userName: formData.userName,
          phone: formData.phone || undefined,
          country: formData.country || undefined,
          industry: formData.industry || undefined,
        });

        toast.success('🎉 Organization created successfully!');

        // Auto-login (you'll need to implement this)
        // For now, redirect to login
        setTimeout(() => {
          router.push('/login?message=Organization created! Please log in.');
        }, 1500);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create organization';
        setError(message);
        toast.error(message);
      }
    });
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'var(--background)' }}
    >
      {/* Background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl opacity-20"
          style={{ background: 'radial-gradient(circle, #10b981, transparent)' }}
        />
        <div
          className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl opacity-20"
          style={{ background: 'radial-gradient(circle, #22c55e, transparent)' }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="w-full max-w-2xl relative"
      >
        <div
          className="rounded-2xl p-8 shadow-2xl border"
          style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg bg-linear-to-r from-(--primary) to-(--primary-dark,var(--primary)) hover:opacity-90  transition-opacity">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                {t('register.createStarterOrg')}
              </h1>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {t('register.starterOrgSubtitle')}
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Organization Name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {t('register.orgNameLabel')}
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
                <input
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
                  placeholder={t('placeholders.acmeInc')}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm outline-none transition-all"
                  style={{
                    background: 'var(--input)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = '#10b981')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
                />
              </div>
            </div>

            {/* Slug */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {t('register.orgUrlLabel')}
              </label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
                <input
                  type="text"
                  required
                  value={formData.slug}
                  onChange={(e) =>
                    setFormData((p) => ({
                      ...p,
                      slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
                    }))
                  }
                  placeholder="acme-inc"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm outline-none transition-all"
                  style={{
                    background: 'var(--input)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = '#10b981')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
                />
              </div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {t('register.yourTeamSubdomain')}
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Your Name */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {t('register.yourNameLabel')}
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
                  <input
                    type="text"
                    required
                    value={formData.userName}
                    onChange={(e) => setFormData((p) => ({ ...p, userName: e.target.value }))}
                    placeholder={t('placeholders.johnDoe')}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm outline-none transition-all"
                    style={{
                      background: 'var(--input)',
                      borderColor: 'var(--border)',
                      color: 'var(--text-primary)',
                    }}
                    onFocus={(e) => (e.target.style.borderColor = '#10b981')}
                    onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {t('auth.email')}
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                    placeholder={t('placeholders.youAtCompany')}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm outline-none transition-all"
                    style={{
                      background: 'var(--input)',
                      borderColor: 'var(--border)',
                      color: 'var(--text-primary)',
                    }}
                    onFocus={(e) => (e.target.style.borderColor = '#10b981')}
                    onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
                  />
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Phone */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {t('register.phoneOptional')}
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
                    placeholder={t('placeholders.phonePlaceholder')}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm outline-none transition-all"
                    style={{
                      background: 'var(--input)',
                      borderColor: 'var(--border)',
                      color: 'var(--text-primary)',
                    }}
                    onFocus={(e) => (e.target.style.borderColor = '#10b981')}
                    onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
                  />
                </div>
              </div>

              {/* Country */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {t('register.countryOptional')}
                </label>
                <input
                  type="text"
                  value={formData.country}
                  onChange={(e) => setFormData((p) => ({ ...p, country: e.target.value }))}
                  placeholder={t('placeholders.unitedStates')}
                  className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none transition-all"
                  style={{
                    background: 'var(--input)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = '#10b981')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
                />
              </div>
            </div>

            {/* Industry */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {t('register.industryOptional')}
              </label>
              <div className="relative">
                <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
                <input
                  type="text"
                  value={formData.industry}
                  onChange={(e) => setFormData((p) => ({ ...p, industry: e.target.value }))}
                  placeholder={t('placeholders.technologyHealthcare')}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm outline-none transition-all"
                  style={{
                    background: 'var(--input)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = '#10b981')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {t('auth.password')}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted) pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={formData.password}
                  onChange={(e) => setFormData((p) => ({ ...p, password: e.target.value }))}
                  placeholder={t('placeholders.minCharacters')}
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl border text-sm outline-none transition-all"
                  style={{
                    background: 'var(--input)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = '#10b981')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    padding: '6px',
                    color: 'var(--text-muted)',
                    borderRadius: '6px',
                    zIndex: 20,
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--text-primary)';
                    e.currentTarget.style.background = 'var(--background-subtle)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--text-muted)';
                    e.currentTarget.style.background = 'transparent';
                  }}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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
                    {strength > 0 ? t(`register.passwordStrength${strength - 1}`) : ''}
                  </p>
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 p-3 rounded-xl text-sm"
                style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </motion.div>
            )}

            {/* Submit */}
            <button
              type="submit"
              className="w-full py-3 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-70 bg-linear-to-r from-(--primary) to-(--primary-dark,var(--primary)) hover:opacity-90  transition-opacity"
            >
              {isPending ? (
                <>
                  <ShieldLoader size="xs" variant="inline" className="mr-2" />{' '}
                  {t('register.creatingOrg')}
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" /> {t('register.createFreeOrg')}
                </>
              )}
            </button>
          </form>

          <p className="text-center text-xs mt-6" style={{ color: 'var(--text-muted)' }}>
            {t('register.termsAgreement')}
          </p>
        </div>

        <div className="text-center my-4">
          <Link
            href="/register-org"
            className="text-sm hover:underline flex items-center justify-center gap-1"
            style={{ color: 'var(--text-muted)' }}
          >
            <ArrowLeft className="w-3 h-3" /> {t('ui.backToPlans')}
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
