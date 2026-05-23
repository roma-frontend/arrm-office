'use client';

import { useTranslation } from 'react-i18next';

import React, { useState, useTransition, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import { Mail, Fingerprint, AlertCircle, Building2, ScanFace, ShieldCheck } from 'lucide-react';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { useAuthStore } from '@/store/useAuthStore';
import { WebAuthnButton } from '@/components/auth/WebAuthnButton';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { OAuthSyncLoader } from '@/components/auth/OAuthSyncLoader';
import { OnboardingTour } from '@/components/onboarding/OnboardingTour';
import { getLoginTourSteps } from '@/components/onboarding/loginTourSteps';
import { useSession } from 'next-auth/react';
import { useKeystrokeDynamics } from '@/hooks/useKeystrokeDynamics';
import { getDeviceFingerprint } from '@/lib/deviceFingerprint';
import { logger } from '@/lib/logger';
import { SmartEmailInput } from '@/components/auth/SmartEmailInput';
import { SmartPasswordInput } from '@/components/auth/SmartPasswordInput';
import { SmartErrorMessage, parseAuthError } from '@/components/auth/SmartErrorMessage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import dynamic from 'next/dynamic';

// Lazy load FaceLogin to prevent TensorFlow.js from loading on every page view
const FaceLogin = dynamic(
  () => import('@/components/auth/FaceLogin').then((mod) => ({ default: mod.FaceLogin })),
  {
    ssr: false,
  },
);

function MaintenanceScreen() {
  const { t } = useTranslation();

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 999999,
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        padding: '20px',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {/* Background gradient blobs */}
      <div
        style={{
          position: 'absolute',
          top: '-50%',
          right: '-20%',
          width: '600px',
          height: '600px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.1), transparent)',
          filter: 'blur(60px)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-30%',
          left: '-10%',
          width: '500px',
          height: '500px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(168, 85, 247, 0.1), transparent)',
          filter: 'blur(60px)',
          pointerEvents: 'none',
        }}
      />

      {/* Content Container */}
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          textAlign: 'center',
          maxWidth: 600,
        }}
      >
        {/* Animated Wrench */}
        <div
          style={{
            fontSize: 100,
            marginBottom: 30,
            animation: 'pulse 2s ease-in-out infinite',
            display: 'inline-block',
          }}
        >
          🔧
        </div>

        <h1
          style={{
            fontSize: 48,
            fontWeight: '800',
            background: 'linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            margin: '0 0 16px 0',
            letterSpacing: '-0.5px',
          }}
        >
          {t('maintenance.title')}
        </h1>

        <p
          style={{
            fontSize: 18,
            color: '#cbd5e1',
            lineHeight: 1.8,
            margin: '0 0 40px 0',
            fontWeight: '400',
          }}
        >
          {t('maintenance.systemUnavailable')}
          <br />
          {t('maintenance.pleasWait')}
        </p>

        {/* Info Box */}
        <div
          style={{
            padding: '24px 32px',
            borderRadius: '16px',
            background:
              'linear-gradient(135deg, rgba(249, 115, 22, 0.1) 0%, rgba(249, 115, 22, 0.05) 100%)',
            border: '2px solid rgba(249, 115, 22, 0.4)',
            marginBottom: 40,
            backdropFilter: 'blur(10px)',
            boxShadow: '0 8px 32px rgba(249, 115, 22, 0.1)',
          }}
        >
          <p
            style={{
              color: '#fed7aa',
              fontSize: 16,
              margin: '0',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
            }}
          >
            <span>⏳</span>
            {t('maintenance.autoRefresh')}
          </p>
        </div>

        {/* Support Info */}
        <div
          style={{
            padding: '16px 24px',
            borderRadius: '12px',
            background: 'rgba(51, 65, 85, 0.5)',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            marginBottom: 24,
          }}
        >
          <p
            style={{
              fontSize: 14,
              color: '#94a3b8',
              margin: '0',
              fontWeight: '400',
            }}
          >
            ℹ️ {t('maintenance.needHelp')}
          </p>
        </div>

        {/* Status indicator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            marginTop: 20,
          }}
        >
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#ef4444',
              animation: 'pulse 2s ease-in-out infinite',
            }}
          />
          <p
            style={{
              fontSize: 13,
              color: '#94a3b8',
              margin: '0',
            }}
          >
            {t('maintenance.bannerInProgress')}
          </p>
        </div>
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.05); }
        }
      `}</style>
    </div>
  );
}

export default function LoginPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { login, isAuthenticated } = useAuthStore();
  const { status } = useSession();
  const [isPending, startTransition] = useTransition();
  const [_showPassword, _setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [loginMode, setLoginMode] = useState<'email' | 'face' | 'touch'>('email');
  // 2FA state
  const [twoFactorPending, setTwoFactorPending] = useState(false);
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [isBackupCode, setIsBackupCode] = useState(false);
  const [twoFactorError, setTwoFactorError] = useState<string | null>(null);
  const totpInputRef = useRef<HTMLInputElement>(null);
  const [showMaintenanceBanner, setShowMaintenanceBanner] = useState(() => {
    // Initialize based on URL parameter (client-side only)
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('maintenance') === 'true';
    }
    return false;
  });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Update maintenance banner state when URL changes
  useEffect(() => {
    const handleUrlChange = () => {
      const params = new URLSearchParams(window.location.search);
      const isMaintenance = params.get('maintenance') === 'true';
      setShowMaintenanceBanner(isMaintenance);
    };

    // Check on mount and on popstate (back/forward buttons)
    handleUrlChange();
    window.addEventListener('popstate', handleUrlChange);
    return () => window.removeEventListener('popstate', handleUrlChange);
  }, []);

  // Check maintenance mode on initial load if org parameter is present
  useEffect(() => {
    const checkMaintenanceMode = async () => {
      const params = new URLSearchParams(window.location.search);
      const orgId = params.get('org');

      if (orgId && !showMaintenanceBanner) {
        try {
          const response = await fetch(`/api/maintenance/check?org=${orgId}`);
          const data = await response.json();
          if (data.isActive) {
            // Redirect to maintenance mode URL
            router.push(`/login?maintenance=true&org=${orgId}`);
          }
        } catch (error) {
          console.error('Failed to check maintenance mode:', error);
        }
      }
    };

    checkMaintenanceMode();
  }, [showMaintenanceBanner]);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const deviceFingerprintRef = useRef<string | undefined>(undefined);
  const { getSample, reset } = useKeystrokeDynamics();

  // Collect device fingerprint on mount (client-side only)
  useEffect(() => {
    getDeviceFingerprint()
      .then(({ fingerprint }) => {
        deviceFingerprintRef.current = fingerprint;
      })
      .catch(() => {});
  }, []);

  // Don't preload face models — load lazily when user clicks Face ID tab
  // This avoids TensorFlow.js kernel registration spam on every page load

  // Check if OAuth sync is in progress OR redirecting
  const isOAuthSyncing = (status === 'authenticated' && !isAuthenticated) || isRedirecting;

  // Detect when auth completes and redirect (but NOT during maintenance)
  useEffect(() => {
    // Check if we're in maintenance mode
    const params = new URLSearchParams(window.location.search);
    const isMaintenance = params.get('maintenance') === 'true';

    // Don't redirect if in maintenance mode
    if (isMaintenance) {
      return;
    }

    if (status === 'authenticated' && isAuthenticated && !isRedirecting) {
      setIsRedirecting(true);

      // Получаем параметр from из URL
      const from = params.get('from');

      // Редиректим на нужную страницу
      const destination = from && from.startsWith('/') ? from : '/dashboard';
      router.push(destination);
    }
  }, [status, isAuthenticated, isRedirecting, router]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.append('email', formData.email);
    fd.append('password', formData.password);

    startTransition(async () => {
      try {
        logger.log('🔐 Attempting login...');

        // Collect keystroke sample and device fingerprint
        const keystrokeSample = getSample();
        const deviceFingerprint = deviceFingerprintRef.current;

        // Use API route instead of Server Action
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formData.email,
            password: formData.password,
            deviceFingerprint,
            keystrokeSample,
          }),
        });

        if (!response.ok) {
          const errorData = (await response.json()) as { error?: string; organizationId?: string };
          // If maintenance mode is active, redirect to maintenance screen
          if (errorData.error === 'maintenance') {
            router.push(
              `/login?maintenance=true${errorData.organizationId ? `&org=${errorData.organizationId}` : ''}`,
            );
            return;
          }
          throw new Error(errorData.error || 'Login failed');
        }

        const result = (await response.json()) as {
          requiresTwoFactor?: boolean;
          tempToken?: string;
          session?: {
            userId: string;
            name: string;
            email: string;
            role: string;
            organizationId: string;
            department?: string;
            position?: string;
            employeeType?: string;
            avatar?: string;
          };
          riskLevel?: string;
          error?: string;
        };

        // Check if 2FA is required
        if (result.requiresTwoFactor) {
          setTwoFactorPending(true);
          setTempToken(result.tempToken ?? null);
          // Focus TOTP input after render
          setTimeout(() => totpInputRef.current?.focus(), 100);
          return;
        }

        if (!result.session) {
          throw new Error('No session data in response');
        }

        const session = result.session;
        const userData: import('@/store/useAuthStore').User = {
          id: session.userId,
          name: session.name,
          email: session.email,
          role: session.role as 'admin' | 'supervisor' | 'employee' | 'superadmin' | 'driver',
          organizationId: session.organizationId,
          department: session.department,
          position: session.position,
          employeeType: session.employeeType as 'staff' | 'contractor' | undefined,
          avatar: session.avatar,
        };

        logger.log('💾 Saving user to store:', userData);
        login(userData);
        reset(); // clear keystroke buffer after successful login

        // Set flag for welcome banner on dashboard
        sessionStorage.setItem('just_logged_in', 'true');

        // If login had elevated risk, flag it for the suspicious login banner
        if (result.riskLevel === 'high' || result.riskLevel === 'critical') {
          sessionStorage.setItem(
            'suspicious_login',
            'Login from a new device or unusual location detected. Risk level: ' + result.riskLevel,
          );
        }

        // Redirect to dashboard or callback URL
        const params = new URLSearchParams(window.location.search);
        const nextUrl = params.get('next');
        const redirectUrl = nextUrl || '/dashboard';
        router.push(redirectUrl);
      } catch (err) {
        console.error('❌ Login failed:', err);
        setError(err instanceof Error ? err.message : 'Login failed');
      }
    });
  };

  const handleWebAuthnSuccess = async (_credentialId: string) => {
    try {
      // Get user data from JWT session
      const { getSessionAction } = await import('@/actions/auth');
      const session = await getSessionAction();

      if (!session) {
        throw new Error('Failed to get session data after WebAuthn');
      }

      const userData = {
        id: session.userId,
        name: session.name,
        email: session.email,
        role: session.role,
        organizationId: session.organizationId,
        department: session.department,
        position: session.position,
        employeeType: session.employeeType,
        avatar: session.avatar,
      };

      login(userData);
      sessionStorage.setItem('just_logged_in', 'true');

      // Check for callback URL
      const params = new URLSearchParams(window.location.search);
      const nextUrl = params.get('next');
      const redirectUrl = nextUrl || '/dashboard';
      router.push(redirectUrl);
    } catch (err) {
      console.error('❌ WebAuthn login failed:', err);
      setError(err instanceof Error ? err.message : 'WebAuthn login failed');
    }
  };

  // 2FA verification handler
  const handleTwoFactorSubmit = useCallback(
    async (codeToSubmit?: string) => {
      const code = codeToSubmit ?? totpCode;
      if (!code || !tempToken) return;
      setTwoFactorError(null);

      try {
        const response = await fetch('/api/auth/totp/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tempToken, code, isBackupCode }),
        });

        if (!response.ok) {
          const errorData = (await response.json()) as { error?: string };
          setTwoFactorError(errorData.error || 'Invalid code');
          setTotpCode('');
          return;
        }

        const result = (await response.json()) as {
          session?: {
            userId: string;
            name: string;
            email: string;
            role: string;
            organizationId: string;
            department?: string;
            position?: string;
            employeeType?: string;
            avatar?: string;
          };
        };

        if (!result.session) {
          throw new Error('No session data in 2FA response');
        }

        const session = result.session;
        const userData: import('@/store/useAuthStore').User = {
          id: session.userId,
          name: session.name,
          email: session.email,
          role: session.role as 'admin' | 'supervisor' | 'employee' | 'superadmin' | 'driver',
          organizationId: session.organizationId,
          department: session.department,
          position: session.position,
          employeeType: session.employeeType as 'staff' | 'contractor' | undefined,
          avatar: session.avatar,
        };

        login(userData);
        sessionStorage.setItem('just_logged_in', 'true');

        // Check for callback URL
        const params = new URLSearchParams(window.location.search);
        const nextUrl = params.get('next');
        const redirectUrl = nextUrl || '/dashboard';
        router.push(redirectUrl);
      } catch (err) {
        setTwoFactorError(err instanceof Error ? err.message : 'Verification failed');
        setTotpCode('');
      }
    },
    [totpCode, tempToken, isBackupCode, login],
  );

  // Auto-submit when 6 digits entered (TOTP mode only)
  useEffect(() => {
    if (!isBackupCode && totpCode.length === 6 && twoFactorPending) {
      handleTwoFactorSubmit(totpCode);
    }
  }, [totpCode, isBackupCode, twoFactorPending, handleTwoFactorSubmit]);

  // Early return for maintenance mode to prevent any other rendering
  if (showMaintenanceBanner) {
    return <MaintenanceScreen />;
  }

  return (
    <>
      {/* Normal Login Flow */}
      {
        <>
          {/* OAuth Sync Loader */}
          <OAuthSyncLoader />

          {/* Hide login page during OAuth sync */}
          {isOAuthSyncing && <div style={{ display: 'none' }} />}

          {/* Onboarding Tour */}
          {!isOAuthSyncing && status !== 'authenticated' && (
            <OnboardingTour
              steps={getLoginTourSteps(t, loginMode)}
              tourId="login-tour"
              onComplete={() => {}}
              onSkip={() => {}}
            />
          )}

          <div
            className="min-h-screen flex items-center justify-center p-8"
            style={{
              display: isOAuthSyncing ? 'none' : 'flex',
              background: 'var(--background)',
            }}
          >
            {/* Background gradient */}
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
              transition={{ duration: 0.5 }}
              className="w-full max-w-md relative"
            >
              {/* Card */}
              <div
                id="login-card"
                className="rounded-2xl px-6 py-4 shadow-2xl border"
                style={{
                  background: 'var(--card)',
                  borderColor: 'var(--border)',
                }}
              >
                {/* Logo */}
                <Link
                  href="/"
                  className="flex flex-col items-center my-2 md:mt-0 group"
                  title={mounted ? t('auth.logoTooltip') : 'Go to home page'}
                >
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3 shadow-lg btn-gradient transition-transform group-hover:scale-105">
                    <Building2 className="w-6 h-6 text-white" />
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    {mounted ? t('auth.signInToHROffice') : 'Sign in to HR Office'}
                  </p>
                </Link>

                {/* 2FA Verification Step */}
                {twoFactorPending ? (
                  <div className="space-y-4">
                    <div className="flex flex-col items-center mb-2">
                      <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
                        style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                      >
                        <ShieldCheck className="w-6 h-6 text-white" />
                      </div>
                      <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                        Two-Factor Authentication
                      </h2>
                      <p
                        className="text-xs mt-1 text-center"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {isBackupCode
                          ? 'Enter one of your backup codes'
                          : 'Enter the 6-digit code from your authenticator app'}
                      </p>
                    </div>

                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleTwoFactorSubmit();
                      }}
                      className="space-y-3"
                    >
                      <div>
                        <Input
                          ref={totpInputRef}
                          type="text"
                          inputMode={isBackupCode ? 'text' : 'numeric'}
                          maxLength={isBackupCode ? 8 : 6}
                          value={totpCode}
                          onChange={(e) => {
                            const val = isBackupCode
                              ? e.target.value.toUpperCase()
                              : e.target.value.replace(/\D/g, '');
                            setTotpCode(val);
                            setTwoFactorError(null);
                          }}
                          placeholder={isBackupCode ? 'XXXXXXXX' : '000000'}
                          className="w-full text-center text-2xl tracking-[0.5em] font-mono py-3 px-4 rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500"
                          style={{
                            background: 'var(--surface-hover)',
                            borderColor: twoFactorError ? '#ef4444' : 'var(--border)',
                            color: 'var(--text-primary)',
                          }}
                          autoFocus
                        />
                      </div>

                      <AnimatePresence>
                        {twoFactorError && (
                          <motion.div
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            className="flex items-center gap-2 text-sm text-red-500"
                          >
                            <AlertCircle className="w-4 h-4" />
                            {twoFactorError}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {isBackupCode && (
                        <Button
                          type="submit"
                          className="w-full py-2 rounded-xl font-semibold text-sm text-white btn-gradient"
                        >
                          Verify Backup Code
                        </Button>
                      )}
                    </form>

                    <div className="text-center space-y-2">
                      <Button
                        type="button"
                        onClick={() => {
                          setIsBackupCode(!isBackupCode);
                          setTotpCode('');
                          setTwoFactorError(null);
                          setTimeout(() => totpInputRef.current?.focus(), 100);
                        }}
                        className="text-xs hover:underline"
                        style={{ color: '#2563eb' }}
                      >
                        {isBackupCode ? 'Use authenticator code instead' : 'Use a backup code'}
                      </Button>
                      <br />
                      <Button
                        type="button"
                        onClick={() => {
                          setTwoFactorPending(false);
                          setTempToken(null);
                          setTotpCode('');
                          setTwoFactorError(null);
                          setIsBackupCode(false);
                        }}
                        className="text-xs hover:underline"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Back to login
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Login Mode Tabs */}
                    <div
                      className="flex gap-2 mb-4 p-1 rounded-xl"
                      style={{ background: 'var(--muted)' }}
                    >
                      <Button
                        type="button"
                        onClick={() => setLoginMode('email')}
                        className={`flex-1 py-2.5 rounded-lg font-medium text-sm transition-all flex items-center justify-center ${
                          loginMode === 'email' ? 'shadow-sm' : ''
                        }`}
                        style={{
                          background: loginMode === 'email' ? 'var(--background)' : 'transparent',
                          color:
                            loginMode === 'email' ? 'var(--text-primary)' : 'var(--text-muted)',
                        }}
                      >
                        <Mail className="w-4 h-4 sm:mr-2" />
                        <span className="hidden sm:inline">
                          {mounted ? t('auth.email') : 'Email'}
                        </span>
                      </Button>
                      <Button
                        type="button"
                        onClick={() => setLoginMode('face')}
                        className={`flex-1 py-2.5 rounded-lg font-medium text-sm transition-all flex items-center justify-center ${
                          loginMode === 'face' ? 'shadow-sm' : ''
                        }`}
                        style={{
                          background: loginMode === 'face' ? 'var(--background)' : 'transparent',
                          color: loginMode === 'face' ? 'var(--text-primary)' : 'var(--text-muted)',
                        }}
                      >
                        <ScanFace className="w-4 h-4 sm:mr-2" />
                        <span className="hidden sm:inline">
                          {mounted ? t('auth.faceId') : 'Face ID'}
                        </span>
                      </Button>
                      <Button
                        type="button"
                        onClick={() => setLoginMode('touch')}
                        className={`flex-1 py-2.5 rounded-lg font-medium text-sm transition-all flex items-center justify-center ${
                          loginMode === 'touch' ? 'shadow-sm' : ''
                        }`}
                        style={{
                          background: loginMode === 'touch' ? 'var(--background)' : 'transparent',
                          color:
                            loginMode === 'touch' ? 'var(--text-primary)' : 'var(--text-muted)',
                        }}
                      >
                        <Fingerprint className="w-4 h-4 sm:mr-2" />
                        <span className="hidden sm:inline">Touch ID</span>
                      </Button>
                    </div>

                    {/* Face ID Login */}
                    {loginMode === 'face' && (
                      <div className="mb-4">
                        <FaceLogin />
                      </div>
                    )}

                    {/* Touch ID Login */}
                    {loginMode === 'touch' && (
                      <div id="biometric-login" className="mb-4">
                        <WebAuthnButton mode="login" onSuccess={handleWebAuthnSuccess} />
                      </div>
                    )}

                    {/* Email Login */}
                    {loginMode === 'email' && (
                      <>
                        {/* Google OAuth */}
                        <div className="mb-4">
                          <GoogleSignInButton />
                        </div>

                        {/* Divider */}
                        <div className="flex items-center gap-3 mb-4">
                          <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                          <span
                            className="text-xs font-medium"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {mounted ? t('auth.orUseEmail') : 'Or use email'}
                          </span>
                          <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                        </div>
                      </>
                    )}

                    {/* Form - Only show for email mode */}
                    {loginMode === 'email' && (
                      <form id="email-login-form" onSubmit={handleSubmit} className="space-y-3">
                        {/* Email - Smart Input */}
                        <SmartEmailInput
                          value={formData.email}
                          onChange={(val) => setFormData((p) => ({ ...p, email: val }))}
                          label={mounted ? t('auth.emailAddress') : 'Email address'}
                          placeholder="you@company.com"
                          autoFocus={true}
                        />

                        {/* Password - Smart Input */}
                        <div className="space-y-1">
                          <SmartPasswordInput
                            value={formData.password}
                            onChange={(val) => setFormData((p) => ({ ...p, password: val }))}
                            label={mounted ? t('auth.password') : 'Password'}
                            placeholder="••••••••"
                            showStrength={false}
                            showGenerator={false}
                            forgotPasswordLink={
                              <Link
                                href="/forgot-password"
                                className="text-xs hover:underline"
                                style={{ color: '#2563eb' }}
                              >
                                {mounted ? t('auth.forgotPassword') : 'Forgot password?'}
                              </Link>
                            }
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
                          className="btn-gradient w-full py-2 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-70"
                        >
                          {isPending ? (
                            <>
                              <ShieldLoader size="xs" variant="inline" className="mr-2" />{' '}
                              {mounted ? t('auth.signingIn') : 'Signing in...'}
                            </>
                          ) : mounted ? (
                            t('auth.signIn')
                          ) : (
                            'Sign In'
                          )}
                        </Button>
                      </form>
                    )}
                  </>
                )}

                {/* Footer */}
                <div className="text-center mt-4 space-y-2">
                  <p id="join-team-link" className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {mounted ? t('auth.dontHaveAccount') : "Don't have an account?"}{' '}
                    <Link
                      href="/register"
                      className="font-semibold hover:underline"
                      style={{ color: '#2563eb' }}
                    >
                      {mounted ? t('auth.joinExistingTeam') : 'Join your team'}
                    </Link>
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {mounted ? t('common.or', 'or') : 'or'}
                    </span>
                    <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                  </div>
                  <Link href="/register-org" id="create-org-btn">
                    <Button
                      variant="link"
                      className="text-xs font-semibold hover:underline"
                      aria-label={
                        mounted ? t('auth.createNewOrganization') : 'Create new organization'
                      }
                    >
                      🏢 {mounted ? t('auth.createNewOrganization') : 'Create new organization'}
                    </Button>
                  </Link>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      }
    </>
  );
}
