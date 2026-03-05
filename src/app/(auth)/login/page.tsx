"use client";

import { useTranslation } from 'react-i18next';

import React, { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "@/lib/lazy-imports";
import { Eye, EyeOff, Mail, Lock, Fingerprint, AlertCircle, Building2, ScanFace } from "lucide-react";
import { ShieldLoader } from "@/components/ui/ShieldLoader";
import { loginAction } from "@/actions/auth";
import { useAuthStore } from "@/store/useAuthStore";
import { WebAuthnButton } from "@/components/auth/WebAuthnButton";
import { FaceLogin } from "@/components/auth/FaceLogin";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { OAuthSyncLoader } from "@/components/auth/OAuthSyncLoader";
import { toast } from "sonner";
import { OnboardingTour } from "@/components/onboarding/OnboardingTour";
import { loginTourSteps } from "@/components/onboarding/loginTourSteps";
import { useSession } from "next-auth/react";
import { useKeystrokeDynamics } from "@/hooks/useKeystrokeDynamics";
import { getDeviceFingerprint } from "@/lib/deviceFingerprint";
import { SmartEmailInput } from "@/components/auth/SmartEmailInput";
import { SmartPasswordInput } from "@/components/auth/SmartPasswordInput";
import { SmartErrorMessage, parseAuthError } from "@/components/auth/SmartErrorMessage";
import { MaintenanceScreen } from "@/components/MaintenanceScreen";

export default function LoginPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { login, isAuthenticated } = useAuthStore();
  const { status } = useSession();
  const [isPending, startTransition] = useTransition();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [loginMode, setLoginMode] = useState<"email" | "face" | "touch">("email");
  const [isRedirecting, setIsRedirecting] = useState(false);
  const deviceFingerprintRef = useRef<string | undefined>(undefined);
  const { onKeyDown, onKeyUp, getSample, reset } = useKeystrokeDynamics();

  // Collect device fingerprint on mount (client-side only)
  useEffect(() => {
    getDeviceFingerprint().then(({ fingerprint }) => {
      deviceFingerprintRef.current = fingerprint;
    }).catch(() => {});
  }, []);
  
  // Check if OAuth sync is in progress OR redirecting
  const isOAuthSyncing = (status === "authenticated" && !isAuthenticated) || isRedirecting;
  
  // Detect when auth completes and redirect (but NOT during maintenance)
  useEffect(() => {
    // Check if we're in maintenance mode
    const params = new URLSearchParams(window.location.search);
    const isMaintenance = params.get('maintenance') === 'true';
    
    // Don't redirect if in maintenance mode
    if (isMaintenance) {
      console.log("[Login] Maintenance mode detected - not redirecting");
      return;
    }
    
    if (status === "authenticated" && isAuthenticated && !isRedirecting) {
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
    fd.append("email", formData.email);
    fd.append("password", formData.password);

    startTransition(async () => {
      try {
        console.log("🔐 Attempting login...");

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
          const errorData = await response.json();
          throw new Error(errorData.error || 'Login failed');
        }

        const result = await response.json();
        console.log("✅ Login successful:", result);
        
        const userData = {
          id: result.session.userId,
          name: result.session.name,
          email: result.session.email,
          role: result.session.role,
          organizationId: result.session.organizationId,
          department: result.session.department,
          position: result.session.position,
          employeeType: result.session.employeeType,
          avatar: result.session.avatar,
        };
        
        console.log("💾 Saving user to store:", userData);
        login(userData);
        reset(); // clear keystroke buffer after successful login

        // Redirect to dashboard
        console.log("🔄 Redirecting to dashboard...");
        window.location.href = "/dashboard";
      } catch (err) {
        console.error("❌ Login failed:", err);
        setError(err instanceof Error ? err.message : "Login failed");
      }
    });
  };

  const handleWebAuthnSuccess = async (credentialId: string) => {
    try {
      // Get user data from JWT session
      const { getSessionAction } = await import("@/actions/auth");
      const session = await getSessionAction();
      
      if (!session) {
        throw new Error("Failed to get session data after WebAuthn");
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
      router.push("/dashboard");
    } catch (err) {
      console.error("❌ WebAuthn login failed:", err);
      setError(err instanceof Error ? err.message : "WebAuthn login failed");
    }
  };

  return (
    <>
      {/* Maintenance Screen - Display if maintenance is active */}
      <MaintenanceScreen />
      
      {/* OAuth Sync Loader */}
      <OAuthSyncLoader />
      
      {/* Hide login page during OAuth sync */}
      {isOAuthSyncing && <div style={{ display: 'none' }} />}
      
      {/* Onboarding Tour */}
      {!isOAuthSyncing && <OnboardingTour 
        steps={loginTourSteps} 
        tourId="login-tour"
        onComplete={() => console.log("Tour completed!")}
        onSkip={() => console.log("Tour skipped")}
      />}

      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ 
          display: isOAuthSyncing ? 'none' : 'flex',
          background: "var(--background)" 
        }}
      >
        {/* Background gradient */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl opacity-20"
          style={{ background: "radial-gradient(circle, #2563eb, transparent)" }}
        />
        <div
          className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl opacity-20"
          style={{ background: "radial-gradient(circle, #0ea5e9, transparent)" }}
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
          className="rounded-2xl p-6 shadow-2xl border"
          style={{
            background: "var(--card)",
            borderColor: "var(--border)",
          }}
        >
          {/* Logo */}
          <div className="flex flex-col items-center mb-6">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3 shadow-lg"
              style={{ background: "linear-gradient(135deg, #2563eb, #0ea5e9)" }}
            >
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
              {t('auth.welcomeBack')}
            </h1>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              {t('auth.signInToHROffice')}
            </p>
          </div>

          {/* Login Mode Tabs */}
          <div className="flex gap-2 mb-4 p-1 rounded-xl" style={{ background: "var(--muted)" }}>
            <button
              type="button"
              onClick={() => setLoginMode("email")}
              className={`flex-1 py-2.5 rounded-lg font-medium text-sm transition-all ${
                loginMode === "email" ? "shadow-sm" : ""
              }`}
              style={{
                background: loginMode === "email" ? "var(--background)" : "transparent",
                color: loginMode === "email" ? "var(--text-primary)" : "var(--text-muted)",
              }}
            >
              <Mail className="w-4 h-4 inline mr-2" />{t('auth.email')}</button>
            <button
              type="button"
              onClick={() => setLoginMode("face")}
              className={`flex-1 py-2.5 rounded-lg font-medium text-sm transition-all ${
                loginMode === "face" ? "shadow-sm" : ""
              }`}
              style={{
                background: loginMode === "face" ? "var(--background)" : "transparent",
                color: loginMode === "face" ? "var(--text-primary)" : "var(--text-muted)",
              }}
            >
              <ScanFace className="w-4 h-4 inline mr-2" />
              {t('auth.faceId')}
            </button>
            <button
              type="button"
              onClick={() => setLoginMode("touch")}
              className={`flex-1 py-2.5 rounded-lg font-medium text-sm transition-all ${
                loginMode === "touch" ? "shadow-sm" : ""
              }`}
              style={{
                background: loginMode === "touch" ? "var(--background)" : "transparent",
                color: loginMode === "touch" ? "var(--text-primary)" : "var(--text-muted)",
              }}
            >
              <Fingerprint className="w-4 h-4 inline mr-2" />Touch ID
            </button>
          </div>

          {/* Face ID Login */}
          {loginMode === "face" && (
            <div className="mb-4">
              <FaceLogin />
            </div>
          )}

          {/* Touch ID Login */}
          {loginMode === "touch" && (
            <div id="biometric-login" className="mb-4">
              <WebAuthnButton mode="login" onSuccess={handleWebAuthnSuccess} />
            </div>
          )}

          {/* Email Login */}
          {loginMode === "email" && (
            <>
              {/* Google OAuth */}
              <div className="mb-4">
                <GoogleSignInButton />
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  or use email
                </span>
                <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
              </div>
            </>
          )}

          {/* Form - Only show for email mode */}
          {loginMode === "email" && (
          <form id="email-login-form" onSubmit={handleSubmit} className="space-y-3">
            {/* Email - Smart Input */}
            <SmartEmailInput
              value={formData.email}
              onChange={(val) => setFormData((p) => ({ ...p, email: val }))}
              label={t('auth.emailAddress')}
              placeholder="you@company.com"
              autoFocus={true}
            />

            {/* Password - Smart Input */}
            <div className="space-y-1">
              <SmartPasswordInput
                value={formData.password}
                onChange={(val) => setFormData((p) => ({ ...p, password: val }))}
                label={t('auth.password')}
                placeholder="••••••••"
                showStrength={false}
                showGenerator={false}
                forgotPasswordLink={
                  <Link
                    href="/forgot-password"
                    className="text-xs hover:underline"
                    style={{ color: "#2563eb" }}
                  >
                    {t('auth.forgotPassword')}
                  </Link>
                }
              />
            </div>

            {/* Smart Error */}
            <AnimatePresence>
              {error && (
                <SmartErrorMessage error={parseAuthError(error)} />
              )}
            </AnimatePresence>

            {/* Submit */}
            <motion.button
              type="submit"
              disabled={isPending}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className="w-full py-2 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all disabled:opacity-70"
              style={{ background: "linear-gradient(135deg, #2563eb, #0ea5e9)" }}
            >
              {isPending ? (
                <><ShieldLoader size="xs" variant="inline" className="mr-2" /> {t('auth.signingIn')}</>
              ) : (
                t('auth.signIn')
              )}
            </motion.button>
          </form>
          )}

          {/* Footer */}
          <div className="text-center mt-4 space-y-2">
            <p id="join-team-link" className="text-xs" style={{ color: "var(--text-muted)" }}>
              {t('auth.dontHaveAccount')}{" "}
              <Link href="/register" className="font-semibold hover:underline" style={{ color: "#2563eb" }}>
                {t('auth.joinExistingTeam')}
              </Link>
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>{t('common.or')}</span>
              <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
            </div>
            <Link href="/register-org" id="create-org-link">
              <button
                className="text-xs font-semibold hover:underline"
                style={{ color: "#10b981" }}
              >
                🏢 {t('auth.createNewOrganization')}
              </button>
            </Link>
          </div>
        </div>

        {/* Back to home */}
        <div className="text-center mt-3">
          <Link href="/" className="text-xs hover:underline" style={{ color: "var(--text-muted)" }}>
            ← {t('ui.backToHome')}
          </Link>
        </div>
      </motion.div>
      </div>
    </>
  );
}
