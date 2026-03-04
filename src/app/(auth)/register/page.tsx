"use client";

import { useTranslation } from 'react-i18next';

import React, { useState, useTransition, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldLoader } from "@/components/ui/ShieldLoader";
import {
  Eye, EyeOff, Mail, Lock, User, Phone, AlertCircle,
  Building2, CheckCircle2, Search, ChevronRight, ArrowLeft, X,
  Sparkles, Users,
} from "lucide-react";
import { registerAction } from "@/actions/auth";
import { useAuthStore } from "@/store/useAuthStore";
import { toast } from "sonner";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { I18nProvider } from "@/components/I18nProvider";
import { SmartEmailInput } from "@/components/auth/SmartEmailInput";
import { SmartPasswordInput } from "@/components/auth/SmartPasswordInput";
import { SmartErrorMessage, parseAuthError } from "@/components/auth/SmartErrorMessage";
import { OnboardingTour } from "@/components/onboarding/OnboardingTour";
import { registerTourSteps } from "@/components/onboarding/registerTourSteps";

// ── Types ─────────────────────────────────────────────────────────────────────
interface OrgResult {
  _id: Id<"organizations">;
  name: string;
  slug: string;
  industry?: string;
  plan: string;
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

const STRENGTH_COLORS = ["#ef4444", "#f59e0b", "#10b981", "#2563eb"];
const STRENGTH_LABELS = ["Weak", "Fair", "Good", "Strong"];

// ── Steps ─────────────────────────────────────────────────────────────────────
type Step = "org" | "details";

// ── Org search component ──────────────────────────────────────────────────────
function OrgSearch({
  onSelect,
}: {
  onSelect: (org: OrgResult) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selected, setSelected] = useState<OrgResult | null>(null);

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 350);
    return () => clearTimeout(t);
  }, [query]);

  const results = useQuery(
    api.organizations.searchOrganizations,
    debouncedQuery.length >= 2 ? { query: debouncedQuery } : "skip"
  ) as OrgResult[] | undefined;

  const handleSelect = (org: OrgResult) => {
    setSelected(org);
    setQuery(org.name);
    onSelect(org);
  };

  const handleClear = () => {
    setSelected(null);
    setQuery("");
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
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
            background: "var(--input)",
            borderColor: selected ? "#10b981" : "var(--border)",
            color: "var(--text-primary)",
          }}
          onFocus={(e) => { if (!selected) e.target.style.borderColor = "#2563eb"; }}
          onBlur={(e) => { if (!selected) e.target.style.borderColor = "var(--border)"; }}
          autoComplete="off"
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
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
            style={{ background: "rgba(16,185,129,0.08)", borderColor: "rgba(16,185,129,0.3)" }}
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{selected.name}</p>
              {selected.industry && (
                <p className="text-xs text-[var(--text-muted)]">{selected.industry}</p>
              )}
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 uppercase">
              Found
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
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            {results === undefined ? (
              <div className="flex items-center gap-2 p-3 text-sm text-[var(--text-muted)]">
                <ShieldLoader size="xs" variant="inline" />
                Searching…
              </div>
            ) : results.length === 0 ? (
              <div className="p-3 text-sm text-[var(--text-muted)] text-center">
                No organization found for &ldquo;{debouncedQuery}&rdquo;
                <p className="text-xs mt-1">Ask your administrator to set up the organization first.</p>
              </div>
            ) : (
              results.map((org) => (
                <button
                  key={org._id}
                  type="button"
                  onClick={() => handleSelect(org)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--background-subtle)] transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-[var(--primary)]/10 border border-[var(--primary)]/20 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-4 h-4 text-[var(--primary)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{org.name}</p>
                    {org.industry && (
                      <p className="text-xs text-[var(--text-muted)]">{org.industry}</p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
                </button>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hint */}
      {!selected && query.length < 2 && (
        <p className="text-xs text-[var(--text-muted)] flex items-center gap-1.5 px-1">
          <Users className="w-3 h-3" />
          Type at least 2 characters to search for your organization
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
  const [step, setStep] = useState<Step>("org");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrg, setSelectedOrg] = useState<OrgResult | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
  });

  // Check for invite token in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("invite");
    if (token) setInviteToken(token);
  }, []);

  const strength = passwordStrength(formData.password);

  const handleOrgNext = () => {
    if (!selectedOrg && !inviteToken) {
      setError("Please select your organization");
      return;
    }
    setError(null);
    setStep("details");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (formData.password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    const fd = new FormData();
    fd.append("name", formData.name);
    fd.append("email", formData.email);
    fd.append("password", formData.password);
    if (formData.phone) fd.append("phone", formData.phone);
    if (selectedOrg) fd.append("organizationId", selectedOrg._id);
    if (inviteToken) fd.append("inviteToken", inviteToken);

    startTransition(async () => {
      try {
        const result = await registerAction(fd);

        if (result.needsApproval) {
          toast.success(
            `Request sent to ${selectedOrg?.name ?? "your organization"} admin! ⏳`,
            { description: "You'll be notified when your account is approved.", duration: 6000 }
          );
          setTimeout(() => router.push("/login"), 3000);
        } else {
          // Auto-login successful - user data is in result
          if (result.userId) {
            login({
              id: result.userId,
              name: result.name!,
              email: result.email!,
              role: result.role,
              department: result.department,
              position: result.position,
              employeeType: result.employeeType,
              avatar: result.avatar,
            });
          }
          toast.success("Welcome! Your account is ready. 🎉");
          router.push("/dashboard");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Registration failed");
      }
    });
  };

  const isSuperadmin = formData.email.toLowerCase() === "romangulanyan@gmail.com";

  return (
    <I18nProvider>
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ background: "var(--background)" }}
      >
      {/* Background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl opacity-20"
          style={{ background: "radial-gradient(circle, #2563eb, transparent)" }} />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl opacity-20"
          style={{ background: "radial-gradient(circle, #0ea5e9, transparent)" }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="w-full max-w-md relative"
      >
        <div
          className="rounded-2xl p-8 shadow-2xl border"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
        >
          {/* Logo */}
          <div className="flex flex-col items-center mb-6">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 shadow-lg"
              style={{ background: "linear-gradient(135deg, #2563eb, #0ea5e9)" }}
            >
              <Building2 className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
              {step === "org" ? "Find your organization" : "Create account"}
            </h1>
            <p className="text-sm mt-1 text-center" style={{ color: "var(--text-muted)" }}>
              {step === "org"
                ? "Search for your company to get started"
                : `Joining ${selectedOrg?.name ?? "your organization"}`}
            </p>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-6">
            {(["org", "details"] as Step[]).map((s, i) => (
              <React.Fragment key={s}>
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                    style={{
                      background: step === s ? "#2563eb" : i < ["org", "details"].indexOf(step) ? "#10b981" : "var(--border)",
                      color: step === s || i < ["org", "details"].indexOf(step) ? "#fff" : "var(--text-muted)",
                    }}
                  >
                    {i < ["org", "details"].indexOf(step) ? "✓" : i + 1}
                  </div>
                  <span className="text-xs font-medium" style={{ color: step === s ? "var(--text-primary)" : "var(--text-muted)" }}>
                    {s === "org" ? "Organization" : "Your details"}
                  </span>
                </div>
                {i < 1 && <div className="flex-1 h-px" style={{ background: "var(--border)" }} />}
              </React.Fragment>
            ))}
          </div>

          {/* ── STEP 1: Organization ── */}
          <AnimatePresence mode="wait">
            {step === "org" && (
              <motion.div
                key="org"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                {inviteToken ? (
                  <div className="flex items-center gap-3 p-3 rounded-xl border"
                    style={{ background: "rgba(37,99,235,0.08)", borderColor: "rgba(37,99,235,0.3)" }}>
                    <Sparkles className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">Invite link detected</p>
                      <p className="text-xs text-[var(--text-muted)]">You were invited to join an organization directly.</p>
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
                      style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}
                    >
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>

                <motion.button
                  type="button"
                  onClick={handleOrgNext}
                  disabled={!selectedOrg && !inviteToken}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  className="w-full py-2.5 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: "linear-gradient(135deg, #2563eb, #0ea5e9)" }}
                >
                  Continue
                  <ChevronRight className="w-4 h-4" />
                </motion.button>
              </motion.div>
            )}

            {/* ── STEP 2: Personal details ── */}
            {step === "details" && (
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
                  onClick={() => { setStep("org"); setError(null); }}
                  className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors -mt-1 mb-1"
                >
                  <ArrowLeft className="w-3 h-3" /> Back to organization
                </button>

                {/* Name */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                    <input
                      type="text" required
                      value={formData.name}
                      onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                      placeholder={t('placeholders.johnDoe')}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm outline-none transition-all"
                      style={{ background: "var(--input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                      onFocus={(e) => (e.target.style.borderColor = "#2563eb")}
                      onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
                    />
                  </div>
                </div>

                {/* Email - Smart Input */}
                <div id="email-field">
                  <SmartEmailInput
                    value={formData.email}
                    onChange={(val) => setFormData((p) => ({ ...p, email: val }))}
                    label="Email address"
                    placeholder="you@company.com"
                  />
                  {isSuperadmin && (
                    <p className="text-xs text-blue-500 flex items-center gap-1 px-1 mt-2">
                      <CheckCircle2 className="w-3 h-3" /> Superadmin account
                    </p>
                  )}
                </div>

                {/* Phone */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Phone (optional)</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
                      placeholder="+374 XX XXX XXX"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm outline-none transition-all"
                      style={{ background: "var(--input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                      onFocus={(e) => (e.target.style.borderColor = "#2563eb")}
                      onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
                    />
                  </div>
                </div>

                {/* Password - Smart Input */}
                <div id="password-field">
                  <SmartPasswordInput
                    value={formData.password}
                    onChange={(val) => setFormData((p) => ({ ...p, password: val }))}
                    label="Password"
                    placeholder={t('placeholders.minCharacters')}
                    showStrength={true}
                    showGenerator={true}
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
                  className="w-full py-2.5 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-70"
                  style={{ background: "linear-gradient(135deg, #2563eb, #0ea5e9)" }}
                >
                  {isPending ? (
                    <><ShieldLoader size="xs" variant="inline" className="mr-2" /> Creating account…</>
                  ) : (
                    "Request to Join"
                  )}
                </motion.button>
              </motion.form>
            )}
          </AnimatePresence>

          <div className="text-center mt-6 space-y-3">
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Already have an account?{" "}
              <Link href="/login" className="font-semibold hover:underline" style={{ color: "#2563eb" }}>
                Sign in
              </Link>
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>or</span>
              <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
            </div>
            <Link href="/register-org">
              <button
                className="text-sm font-semibold hover:underline"
                style={{ color: "#10b981" }}
              >
                🏢 Create New Organization
              </button>
            </Link>
          </div>
        </div>

        <div className="text-center mt-4">
          <Link href="/" className="text-sm hover:underline" style={{ color: "var(--text-muted)" }}>
            ← Back to home
          </Link>
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
      
      {/* Onboarding Tour */}
      <OnboardingTour
        steps={registerTourSteps}
        tourId="register-tour"
        onComplete={() => console.log("Registration tour completed!")}
        onSkip={() => console.log("Registration tour skipped")}
      />
    </I18nProvider>
  );
}
