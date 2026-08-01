'use client';

import { useTranslation } from 'react-i18next';

import React, { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import {
  User,
  Phone,
  AlertCircle,
  Building2,
  CheckCircle2,
  Search,
  ChevronRight,
  ArrowLeft,
  X,
  Sparkles,
  Users,
} from 'lucide-react';
import { registerAction } from '@/actions/auth';
import { useAuthStore } from '@/store/useAuthStore';
import { toast } from 'sonner';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { I18nProvider } from '@/components/I18nProvider';
import { SmartEmailInput } from '@/components/auth/SmartEmailInput';
import { SmartPasswordInput } from '@/components/auth/SmartPasswordInput';
import { SmartErrorMessage, parseAuthError } from '@/components/auth/SmartErrorMessage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// ── Types ─────────────────────────────────────────────────────────────────────
interface OrgResult {
  _id: Id<'organizations'>;
  name: string;
  slug: string;
  industry?: string;
  plan: string;
}

interface RegisterActionResult {
  success: boolean;
  role: 'superadmin' | 'admin' | 'supervisor' | 'employee' | 'driver';
  needsApproval: boolean;
  message?: string;
  userId?: string;
  name?: string;
  email?: string;
  department?: string;
  position?: string;
  employeeType?: string;
  avatar?: string;
}

// ── Password strength ─────────────────────────────────────────────────────────
function passwordStrength(pwd: string) {
  let score = 0;
  if (pwd.length >= 8) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  return score;
}

const _STRENGTH_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#2563eb'];
const _STRENGTH_LABELS = ['Weak', 'Fair', 'Good', 'Strong'];

// ── Steps ─────────────────────────────────────────────────────────────────────
type Step = 'org' | 'details';

// ── Org search component ──────────────────────────────────────────────────────
function OrgSearch({ onSelect }: { onSelect: (org: OrgResult) => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selected, setSelected] = useState<OrgResult | null>(null);

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 350);
    return () => clearTimeout(t);
  }, [query]);

  const results = useQuery(
    api.organizations.searchOrganizations,
    debouncedQuery.length >= 2 ? { query: debouncedQuery } : 'skip',
  ) as OrgResult[] | undefined;

  const handleSelect = (org: OrgResult) => {
    setSelected(org);
    setQuery(org.name);
    onSelect(org);
  };

  const handleClear = () => {
    setSelected(null);
    setQuery('');
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (selected) setSelected(null);
          }}
          placeholder={t('placeholders.searchYourOrganization')}
          className="w-full pl-10 pr-10 py-2.5 rounded-xl border text-sm outline-none transition-all"
          style={{
            background: 'var(--input)',
            borderColor: selected ? '#10b981' : 'var(--border)',
            color: 'var(--text-primary)',
          }}
          onFocus={(e) => {
            if (!selected) e.target.style.borderColor = '#2563eb';
          }}
          onBlur={(e) => {
            if (!selected) e.target.style.borderColor = 'var(--border)';
          }}
          autoComplete="off"
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-(--text-muted) hover:text-(--text-primary)"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Selected org confirmation */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 p-3 rounded-xl border"
            style={{ background: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.3)' }}
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-(--text-primary) truncate">
                {selected.name}
              </p>
              {selected.industry && (
                <p className="text-xs text-(--text-muted)">{selected.industry}</p>
              )}
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 uppercase">
              {t('auth.found', 'Found')}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results dropdown */}
      <AnimatePresence>
        {!selected && debouncedQuery.length >= 2 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-xl border overflow-hidden shadow-lg"
            style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
          >
            {results === undefined ? (
              <div className="flex items-center gap-2 p-3 text-sm text-(--text-muted)">
                <ShieldLoader size="xs" variant="inline" />
                {t('auth.searching', 'Searching…')}
              </div>
            ) : results.length === 0 ? (
              <div className="p-3 text-sm text-(--text-muted) text-center">
                {t('auth.noOrgFound', 'No organization found for')} &ldquo;{debouncedQuery}&rdquo;
                <p className="text-xs mt-1">{t('auth.askAdmin')}</p>
              </div>
            ) : (
              results.map((org) => (
                <button
                  key={org._id}
                  type="button"
                  onClick={() => handleSelect(org)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-(--background-subtle) transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-(--primary)/10 border border-(--primary)/20 flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4 text-(--primary)" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-(--text-primary) truncate">
                      {org.name}
                    </p>
                    {org.industry && <p className="text-xs text-(--text-muted)">{org.industry}</p>}
                  </div>
                  <ChevronRight className="w-4 h-4 text-(--text-muted) shrink-0" />
                </button>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hint */}
      {!selected && query.length < 2 && (
        <p className="text-xs text-(--text-muted) flex items-center gap-1.5 px-1">
          <Users className="w-3 h-3" />
          {t('auth.typeToSearchOrg', 'Type at least 2 characters to search for your organization')}
        </p>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
function RegisterPageContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const { login } = useAuthStore();
  const [isPending, startTransition] = useTransition();
  // Read URL params synchronously on first render to avoid a flicker of
  // the "search org" step when we already know which org to join.
  const initialUrlParams = (() => {
    if (typeof window === 'undefined') return { invite: null, orgSlug: null };
    const params = new URLSearchParams(window.location.search);
    return {
      invite: params.get('invite'),
      orgSlug: params.get('org')?.toLowerCase() ?? null,
    };
  })();

  const [step, setStep] = useState<Step>(
    initialUrlParams.orgSlug || initialUrlParams.invite ? 'details' : 'org',
  );
  const [_showPassword, _setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrg, setSelectedOrg] = useState<OrgResult | null>(null);
  const [inviteToken, _setInviteToken] = useState<string | null>(initialUrlParams.invite);
  const [prefilledOrgSlug, setPrefilledOrgSlug] = useState<string | null>(initialUrlParams.orgSlug);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
  });

  // Resolve org from slug (e.g. when user came from a careers/vacancy page)
  const prefilledOrg = useQuery(
    api.organizations.getOrganizationBySlug,
    prefilledOrgSlug ? { slug: prefilledOrgSlug } : 'skip',
  ) as OrgResult | null | undefined;

  // When the slug resolves to a real org, auto-select it.
  // If the slug resolved to null (not found / inactive), fall back to the search step.
  useEffect(() => {
    if (!prefilledOrgSlug) return;
    if (prefilledOrg === undefined) return; // still loading
    if (prefilledOrg && !selectedOrg && !inviteToken) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- auto-select the org once the slug query resolves
      setSelectedOrg(prefilledOrg);
      setStep('details');
    } else if (prefilledOrg === null && !selectedOrg && !inviteToken) {
      // Slug was invalid — drop the prefill and let the user search manually.
      setPrefilledOrgSlug(null);
      setStep('org');
    }
  }, [prefilledOrg, prefilledOrgSlug, selectedOrg, inviteToken]);

  // True while we still don't know what to do with ?org=<slug>
  const isResolvingPrefilledOrg = !!prefilledOrgSlug && prefilledOrg === undefined && !selectedOrg;

  const _strength = passwordStrength(formData.password);

  const handleOrgNext = () => {
    if (!selectedOrg && !inviteToken) {
      setError(t('auth.selectOrg', 'Please select your organization'));
      return;
    }
    setError(null);
    setStep('details');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (formData.password.length < 8) {
      setError(t('auth.passwordMustBe', 'Password must be at least 8 characters'));
      return;
    }

    const fd = new FormData();
    fd.append('name', formData.name);
    fd.append('email', formData.email);
    fd.append('password', formData.password);
    if (formData.phone) fd.append('phone', formData.phone);
    if (selectedOrg) fd.append('organizationId', selectedOrg._id);
    if (inviteToken) fd.append('inviteToken', inviteToken);

    startTransition(async () => {
      try {
        const result = (await registerAction(fd)) as RegisterActionResult;

        if (result.needsApproval) {
          toast.success(t('auth.requestSent', 'Request sent!'), {
            description: t(
              'auth.requestSentDesc',
              "You'll be notified when your account is approved.",
            ),
            duration: 6000,
          });
          setTimeout(() => router.push('/login'), 3000);
        } else {
          // Auto-login successful - user data is in result
          if (result.userId) {
            login({
              id: result.userId,
              name: result.name!,
              email: result.email!,
              role: result.role as 'superadmin' | 'admin' | 'supervisor' | 'employee' | 'driver',
              department: result.department,
              position: result.position,
              employeeType: result.employeeType as 'staff' | 'contractor' | undefined,
              avatar: result.avatar,
            });
          }
          toast.success(t('toasts.welcomeAccountReady'));

          // Check for callback URL
          const params = new URLSearchParams(window.location.search);
          const nextUrl = params.get('next');
          const redirectUrl = nextUrl || '/dashboard';
          router.push(redirectUrl);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t('auth.registrationFailed', 'Registration failed'),
        );
      }
    });
  };

  const isSuperadmin =
    (process.env.NEXT_PUBLIC_BOOTSTRAP_SUPERADMIN_EMAIL ?? '').toLowerCase() ===
      formData.email.toLowerCase().trim() && !!process.env.NEXT_PUBLIC_BOOTSTRAP_SUPERADMIN_EMAIL;

  return (
    <I18nProvider>
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
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="w-full max-w-md relative"
        >
          <div
            className="rounded-2xl p-8 shadow-2xl border"
            style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
          >
            {isResolvingPrefilledOrg ? (
              // While we resolve ?org=<slug>, show a quiet loader so the user
              // doesn't see the "search organization" step flash by.
              <Link
                href="/"
                className="flex flex-col items-center justify-center py-16 gap-4 group"
                title={t('auth.logoTooltip')}
              >
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg btn-gradient transition-transform group-hover:scale-105">
                  <Building2 className="w-7 h-7 text-white" />
                </div>
                <ShieldLoader size="sm" variant="inline" />
                <p className="text-sm text-center" style={{ color: 'var(--text-muted)' }}>
                  {t('auth.loadingOrganization', 'Loading organization…')}
                </p>
              </Link>
            ) : (
              <>
                {/* Logo */}
                <Link
                  href="/"
                  className="flex flex-col items-center mb-6 mt-14 md:mt-0 group"
                  title={t('auth.logoTooltip')}
                >
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 shadow-lg btn-gradient transition-transform group-hover:scale-105">
                    <Building2 className="w-7 h-7 text-white" />
                  </div>
                  <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    {step === 'org'
                      ? t('auth.findYourOrg', 'Find your organization')
                      : t('auth.createAccount', 'Create account')}
                  </h1>
                  <p className="text-sm mt-1 text-center" style={{ color: 'var(--text-muted)' }}>
                    {step === 'org'
                      ? t('auth.searchCompany', 'Search for your company to get started')
                      : `${t('auth.joining', 'Joining')} ${selectedOrg?.name ?? t('auth.yourOrganization', 'your organization')}`}
                  </p>
                </Link>

                {/* Step indicator */}
                <div className="flex items-center gap-2 mb-6">
                  {(['org', 'details'] as Step[]).map((s, i) => (
                    <React.Fragment key={s}>
                      <div className="flex items-center gap-1.5">
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                          style={{
                            background:
                              step === s
                                ? '#2563eb'
                                : i < ['org', 'details'].indexOf(step)
                                  ? 'var(--card-border-default)'
                                  : 'var(--card)',
                            color:
                              step === s || i < ['org', 'details'].indexOf(step)
                                ? '#fff'
                                : 'var(--color-bg-elevated)',
                            border: step === s ? 'none' : '2px solid var(--border)',
                          }}
                        >
                          {i < ['org', 'details'].indexOf(step) ? '✓' : i + 1}
                        </div>
                        <span
                          className="text-xs font-medium"
                          style={{
                            color: step === s ? 'var(--text-primary)' : 'var(--text-muted)',
                          }}
                        >
                          {s === 'org'
                            ? t('auth.organizationStep', 'Organization')
                            : t('auth.yourDetails', 'Your details')}
                        </span>
                      </div>
                      {i < 1 && (
                        <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                      )}
                    </React.Fragment>
                  ))}
                </div>

                {/* ── STEP 1: Organization ── */}
                <AnimatePresence mode="wait">
                  {step === 'org' && (
                    <motion.div
                      key="org"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-4"
                    >
                      {inviteToken ? (
                        <div
                          className="flex items-center gap-3 p-3 rounded-xl border"
                          style={{
                            background: 'rgba(37,99,235,0.08)',
                            borderColor: 'rgba(37,99,235,0.3)',
                          }}
                        >
                          <Sparkles className="w-4 h-4 text-blue-500 shrink-0" />
                          <div>
                            <p className="text-sm font-semibold text-(--text-primary)">
                              {t('auth.inviteLinkDetected')}
                            </p>
                            <p className="text-xs text-(--text-muted)">{t('auth.invitedToJoin')}</p>
                          </div>
                        </div>
                      ) : (
                        <OrgSearch onSelect={(org) => setSelectedOrg(org)} />
                      )}

                      {/* Error */}
                      <AnimatePresence>
                        {error && (
                          <motion.div
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="flex items-center gap-2 p-3 rounded-xl text-sm"
                            style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}
                          >
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            {error}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <Button
                        type="button"
                        onClick={handleOrgNext}
                        disabled={!selectedOrg && !inviteToken}
                        className="btn-gradient w-full py-2.5 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {t('auth.continue', 'Continue')}
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </motion.div>
                  )}

                  {/* ── STEP 2: Personal details ── */}
                  {step === 'details' && (
                    <motion.form
                      id="personal-details-form"
                      key="details"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      onSubmit={handleSubmit}
                      className="space-y-4"
                    >
                      {/* Back */}
                      <button
                        type="button"
                        onClick={() => {
                          setStep('org');
                          setError(null);
                        }}
                        className="flex items-center gap-1 text-xs text-(--text-muted) hover:text-(--text-primary) transition-colors -mt-1 mb-1"
                      >
                        <ArrowLeft className="w-3 h-3" />{' '}
                        {t('auth.backToOrg', 'Back to organization')}
                      </button>

                      {/* Name */}
                      <div className="space-y-1.5">
                        <Label
                          className="text-sm font-medium"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {t('auth.fullName')}
                        </Label>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
                          <Input
                            type="text"
                            required
                            value={formData.name}
                            onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                            placeholder={t('placeholders.johnDoe')}
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm outline-none transition-all"
                            style={{
                              background: 'var(--input)',
                              borderColor: 'var(--border)',
                              color: 'var(--text-primary)',
                            }}
                            onFocus={(e) => (e.target.style.borderColor = '#2563eb')}
                            onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
                          />
                        </div>
                      </div>

                      {/* Email - Smart Input */}
                      <div id="email-field">
                        <SmartEmailInput
                          value={formData.email}
                          onChange={(val) => setFormData((p) => ({ ...p, email: val }))}
                          label={t('auth.emailAddress')}
                          placeholder="you@company.com"
                        />
                        {isSuperadmin && (
                          <p className="text-xs text-blue-500 flex items-center gap-1 px-1 mt-2">
                            <CheckCircle2 className="w-3 h-3" />{' '}
                            {t('auth.superadminAccount', 'Superadmin account')}
                          </p>
                        )}
                      </div>

                      {/* Phone */}
                      <div className="space-y-1.5">
                        <Label
                          className="text-sm font-medium"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {t('auth.phoneOptional')}
                        </Label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
                          <Input
                            type="tel"
                            value={formData.phone}
                            onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
                            placeholder="+374 XX XXX XXX"
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm outline-none transition-all"
                            style={{
                              background: 'var(--input)',
                              borderColor: 'var(--border)',
                              color: 'var(--text-primary)',
                            }}
                            onFocus={(e) => (e.target.style.borderColor = '#2563eb')}
                            onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
                          />
                        </div>
                      </div>

                      {/* Password - Smart Input */}
                      <div id="password-field">
                        <SmartPasswordInput
                          value={formData.password}
                          onChange={(val) => setFormData((p) => ({ ...p, password: val }))}
                          label={t('auth.password', 'Password')}
                          placeholder={t('placeholders.minCharacters')}
                          showStrength={true}
                          showGenerator={true}
                        />
                      </div>

                      {/* Smart Error */}
                      <AnimatePresence>
                        {error && <SmartErrorMessage error={parseAuthError(error)} />}
                      </AnimatePresence>

                      {/* Submit */}
                      <Button
                        type="submit"
                        disabled={isPending}
                        className="w-full py-2.5 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-70 btn-gradient"
                      >
                        {isPending ? (
                          <>
                            <ShieldLoader size="xs" variant="inline" className="mr-2" />{' '}
                            {t('auth.creatingAccount', 'Creating account…')}
                          </>
                        ) : (
                          t('auth.requestToJoin', 'Request to Join')
                        )}
                      </Button>
                    </motion.form>
                  )}
                </AnimatePresence>

                <div className="text-center mt-6 space-y-3">
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    {t('auth.alreadyHaveAccount', 'Already have an account?')}{' '}
                    <Link
                      href="/login"
                      className="font-semibold hover:underline"
                      style={{ color: '#2563eb' }}
                    >
                      {t('auth.signIn', 'Sign in')}
                    </Link>
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {t('common.or', 'or')}
                    </span>
                    <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                  </div>
                  <Link href="/register-org">
                    <Button variant="link" className="text-sm font-semibold hover:underline">
                      🏢 {t('register.createOrgWithPlan')}
                    </Button>
                  </Link>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </I18nProvider>
  );
}

export default function RegisterPage() {
  return (
    <I18nProvider>
      <RegisterPageContent />

      {/* Onboarding Tour — DISABLED on register page, shown only on login */}
      {/* Tour is handled by login page to avoid showing twice */}
    </I18nProvider>
  );
}
