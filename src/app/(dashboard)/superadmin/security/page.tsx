"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuthStore } from "@/store/useAuthStore";
import { useSession } from "next-auth/react";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Eye,
  EyeOff,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Monitor,
  Fingerprint,
  Brain,
  Camera,
  Lock,
  Bell,
  RefreshCw,
  ChevronRight,
  Activity,
} from "lucide-react";

// ── Feature metadata ──────────────────────────────────────────────────────────
const FEATURES = [
  {
    key: "audit_logging",
    title: "Audit Logging",
    description: "Log all login attempts with IP, device info, and risk score. Essential baseline.",
    icon: Eye,
    color: "blue",
    critical: true,
  },
  {
    key: "adaptive_auth",
    title: "Adaptive Authentication",
    description: "Auto-block or challenge logins with high risk score (new device, many failed attempts, unusual hour).",
    icon: ShieldAlert,
    color: "orange",
    critical: false,
  },
  {
    key: "device_fingerprinting",
    title: "Device Fingerprinting",
    description: "Recognize known devices per employee. New device login triggers a higher risk score.",
    icon: Monitor,
    color: "purple",
    critical: false,
  },
  {
    key: "keystroke_dynamics",
    title: "Keystroke Dynamics",
    description: "Analyze typing rhythm to verify identity. Each person types like a fingerprint.",
    icon: Brain,
    color: "indigo",
    critical: false,
  },
  {
    key: "continuous_face",
    title: "Continuous Face Verification",
    description: "Periodically verify employee identity via camera during active session.",
    icon: Camera,
    color: "teal",
    critical: false,
  },
  {
    key: "failed_login_lockout",
    title: "Auto Account Lockout",
    description: "Automatically lock account after 5 failed login attempts in 15 minutes.",
    icon: Lock,
    color: "red",
    critical: false,
  },
  {
    key: "new_device_alert",
    title: "New Device Alert",
    description: "Notify admin when an employee logs in from an unrecognized device.",
    icon: Bell,
    color: "yellow",
    critical: false,
  },
] as const;

const COLOR_MAP: Record<string, { iconColor: string; accentBg: string; accentText: string }> = {
  blue: { iconColor: "#2563eb", accentBg: "rgba(37,99,235,0.1)", accentText: "#2563eb" },
  orange: { iconColor: "#f59e0b", accentBg: "rgba(245,158,11,0.1)", accentText: "#d97706" },
  purple: { iconColor: "#8b5cf6", accentBg: "rgba(139,92,246,0.1)", accentText: "#8b5cf6" },
  indigo: { iconColor: "#6366f1", accentBg: "rgba(99,102,241,0.1)", accentText: "#6366f1" },
  teal: { iconColor: "#0ea5e9", accentBg: "rgba(14,165,233,0.1)", accentText: "#0ea5e9" },
  red: { iconColor: "#ef4444", accentBg: "rgba(239,68,68,0.1)", accentText: "#ef4444" },
  yellow: { iconColor: "#f59e0b", accentBg: "rgba(251,191,36,0.1)", accentText: "#d97706" },
};

function Toggle({ enabled, onToggle, loading }: { enabled: boolean; onToggle: () => void; loading?: boolean }) {
  return (
    <button
      onClick={onToggle}
      disabled={loading}
      style={{
        backgroundColor: enabled ? "var(--success)" : "var(--border)",
        opacity: loading ? 0.5 : 1,
      }}
      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-300 focus:outline-none ${loading ? "cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ${enabled ? "translate-x-6" : "translate-x-1"
          }`}
      />
    </button>
  );
}

function RiskBadge({ score }: { score: number }) {
  if (score >= 60) return (
    <span className="px-2 py-0.5 rounded text-xs font-bold" style={{ background: "rgba(239,68,68,0.15)", color: "var(--destructive)" }}>
      HIGH {score}
    </span>
  );
  if (score >= 30) return (
    <span className="px-2 py-0.5 rounded text-xs font-bold" style={{ background: "rgba(245,158,11,0.15)", color: "var(--warning)" }}>
      MED {score}
    </span>
  );
  return (
    <span className="px-2 py-0.5 rounded text-xs font-bold" style={{ background: "rgba(16,185,129,0.15)", color: "var(--success)" }}>
      LOW {score}
    </span>
  );
}

export default function SecurityDashboard() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { data: session, status } = useSession();
  const [toggling, setToggling] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<"settings" | "logs" | "attempts" | "blocked">("settings");

  const settings = useQuery(api.security.getAllSettings);
  const loginStats = useQuery(api.security.getLoginStats, { hours: 24 });
  const auditLogs = useQuery(api.security.getRecentAuditLogs, { limit: 50 });
  const suspendedUsers = useQuery(api.security.getSuspendedUsers);
  const toggleSetting = useMutation(api.security.toggleSetting);

  // Check role from either useAuthStore or NextAuth session
  const userRole = user?.role || (session?.user as any)?.role;
  const isLoading = status === "loading" || (!user && status === "authenticated");

  // Show loading state while user data is being fetched
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96" style={{ color: "var(--text-muted)" }}>
        <RefreshCw className="w-8 h-8 mr-3 animate-spin" style={{ color: "var(--primary)" }} />
        Loading security dashboard...
      </div>
    );
  }

  // Check authorization
  if (!user && !session) {
    return (
      <div className="flex items-center justify-center h-96" style={{ color: "var(--text-muted)" }}>
        <ShieldAlert className="w-8 h-8 mr-3" style={{ color: "var(--destructive)" }} />
        Please log in to access this page
      </div>
    );
  }

  if (userRole !== "superadmin") {
    return (
      <div className="flex items-center justify-center h-96" style={{ color: "var(--text-muted)" }}>
        <ShieldAlert className="w-8 h-8 mr-3" style={{ color: "var(--destructive)" }} />
        Access denied — superadmin only (your role: {userRole || "unknown"})
      </div>
    );
  }

  const handleToggle = async (key: string, currentEnabled: boolean) => {
    setToggling((prev) => ({ ...prev, [key]: true }));
    try {
      await toggleSetting({ key, enabled: !currentEnabled, updatedBy: user!.id as Id<"users"> });
    } catch (err) {
      console.error("Toggle failed:", err);
    } finally {
      setToggling((prev) => ({ ...prev, [key]: false }));
    }
  };

  const getSettingEnabled = (key: string) => {
    const s = settings?.find((s) => s.key === key);
    return s ? s.enabled : true;
  };

  const enabledCount = FEATURES.filter((f) => getSettingEnabled(f.key)).length;
  const threatLevel =
    (loginStats?.highRisk ?? 0) >= 10 ? "Critical" :
      (loginStats?.highRisk ?? 0) >= 3 ? "Elevated" :
        (loginStats?.failed ?? 0) >= 20 ? "Moderate" : "Normal";
  const threatColor =
    threatLevel === "Critical" ? "text-red-400" :
      threatLevel === "Elevated" ? "text-orange-400" :
        threatLevel === "Moderate" ? "text-yellow-400" : "text-green-400";

  return (
    <div className="min-h-screen p-3 sm:p-6" style={{ background: "var(--background)", color: "var(--text-primary)" }}>
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 sm:mb-8">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl border flex-shrink-0" style={{ background: "rgba(37,99,235,0.1)", borderColor: "rgba(37,99,235,0.3)" }}>
            <Shield className="w-5 h-5 sm:w-7 sm:h-7" style={{ color: "var(--primary)" }} />
          </div>
          <div>
            <h1 className="text-lg sm:text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{t('superadminSecurity.securityControl')}</h1>
            <p className="text-xs sm:text-sm hidden sm:block" style={{ color: "var(--text-muted)" }}>{t('superadminSecurity.manageIdentityVerification')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs sm:text-sm" style={{ color: "var(--text-muted)" }}>
          <Activity className="w-3 h-3 sm:w-4 sm:h-4" style={{ color: "var(--success)" }} />
          Live
        </div>
      </div>

      {/* ── Stats bar ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-4 mb-6 sm:mb-8">
        {[
          { label: "Threat Level", value: threatLevel, color: threatLevel === "Critical" ? "var(--destructive)" : threatLevel === "Elevated" ? "var(--warning)" : threatLevel === "Moderate" ? "#f59e0b" : "var(--success)" },
          { label: "Logins (24h)", value: loginStats?.total ?? 0, color: "var(--text-primary)" },
          { label: "Failed", value: loginStats?.failed ?? 0, color: "var(--destructive)" },
          { label: "High Risk", value: loginStats?.highRisk ?? 0, color: "var(--warning)" },
          { label: "Features ON", value: `${enabledCount}/${FEATURES.length}`, color: "var(--success)" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg sm:rounded-xl p-2 sm:p-4 text-center border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="text-lg sm:text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</div>
            <div className="text-[10px] sm:text-xs mt-0.5 sm:mt-1" style={{ color: "var(--text-muted)" }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 sm:gap-2 mb-4 sm:mb-6 border-b overflow-x-auto" style={{ borderColor: "var(--border)" }}>
        {(["settings", "blocked", "attempts", "logs"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-2 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap flex-shrink-0"
            style={{
              background: activeTab === tab ? "var(--card)" : "transparent",
              color: activeTab === tab ? "var(--text-primary)" : "var(--text-muted)",
              borderColor: activeTab === tab ? "var(--border)" : "transparent",
              border: activeTab === tab ? "1px solid var(--border)" : "1px solid transparent",
              borderBottom: activeTab === tab ? "1px solid var(--card)" : "1px solid transparent",
              marginBottom: activeTab === tab ? "-1px" : "0",
            }}
          >
            <span className="hidden sm:inline">{tab === "settings" ? `🛡️ ${t('superadminSecurity.securityFeatures')}` : tab === "blocked" ? `🚫 ${t('superadminSecurity.blockedUsers')}` : tab === "attempts" ? `🔐 ${t('superadminSecurity.loginAttempts')}` : `📋 ${t('superadminSecurity.auditLogs')}`}</span>
            <span className="sm:hidden">{tab === "settings" ? "🛡️" : tab === "blocked" ? "🚫" : tab === "attempts" ? "🔐" : "📋"}</span>
          </button>
        ))}
      </div>

      {/* ── TAB: Security Features ── */}
      {activeTab === "settings" && (
        <div className="space-y-3">
          <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
            {t("superadmin.security.toggleSecuritySystems")}
          </p>
          {FEATURES.map((feature) => {
            const enabled = getSettingEnabled(feature.key);
            const colors = COLOR_MAP[feature.color];
            const Icon = feature.icon;
            const isLoading = toggling[feature.key];
            const savedAt = settings?.find((s) => s.key === feature.key)?.updatedAt;

            return (
              <div
                key={feature.key}
                className="rounded-lg sm:rounded-xl p-3 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 border transition-all"
                style={{
                  background: enabled ? colors.accentBg : "var(--card)",
                  borderColor: enabled ? `${colors.iconColor}33` : "var(--border)",
                }}
              >
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <div
                    className="p-2 sm:p-2.5 rounded-lg flex-shrink-0"
                    style={{ background: `${colors.iconColor}18`, color: colors.iconColor }}
                  >
                    <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div className="flex-1 sm:hidden">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{feature.title}</span>
                      <Toggle
                        enabled={enabled}
                        onToggle={() => handleToggle(feature.key, enabled)}
                        loading={isLoading}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex-1 w-full sm:w-auto">
                  <div className="hidden sm:flex items-center gap-2 mb-1">
                    <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{feature.title}</span>
                    {feature.critical && (
                      <span className="text-xs px-2 py-0.5 rounded" style={{ background: "rgba(37,99,235,0.12)", color: "var(--primary)" }}>Essential</span>
                    )}
                    {!enabled && (
                      <span className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--muted)", color: "var(--text-muted)" }}>Disabled</span>
                    )}
                  </div>
                  <div className="flex sm:hidden items-center gap-2 mb-2">
                    {feature.critical && (
                      <span className="text-xs px-2 py-0.5 rounded" style={{ background: "rgba(37,99,235,0.12)", color: "var(--primary)" }}>Essential</span>
                    )}
                    {!enabled && (
                      <span className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--muted)", color: "var(--text-muted)" }}>Disabled</span>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm" style={{ color: "var(--text-muted)" }}>{feature.description}</p>
                  {savedAt && (
                    <p className="text-[10px] sm:text-xs mt-1" style={{ color: "var(--text-disabled)" }}>
                      Last changed: {new Date(savedAt).toLocaleString()}
                    </p>
                  )}
                </div>
                <div className="hidden sm:flex items-center gap-3 flex-shrink-0">
                  <span className="text-sm font-medium" style={{ color: enabled ? "var(--success)" : "var(--text-disabled)" }}>
                    {enabled ? "ON" : "OFF"}
                  </span>
                  <Toggle
                    enabled={enabled}
                    onToggle={() => handleToggle(feature.key, enabled)}
                    loading={isLoading}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── TAB: Blocked Users ── */}
      {activeTab === "blocked" && (
        <div>
          <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
            {t("superadmin.security.currentlySuspendedUsers")}
          </p>
          {!suspendedUsers?.length ? (
            <div className="text-center py-16" style={{ color: "var(--text-muted)" }}>
              <ShieldCheck className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--success)" }} />
              {t("superadmin.security.noSuspendedUsers")}
            </div>
          ) : (
            <div className="space-y-3">
              {suspendedUsers.map((user: any) => {
                const isAutoBlocked = user.suspendedReason?.includes("AUTO-BLOCKED");
                const hoursLeft = Math.max(0, Math.ceil((user.suspendedUntil - Date.now()) / (1000 * 60 * 60)));

                return (
                  <div
                    key={user._id}
                    className="rounded-lg sm:rounded-xl p-3 sm:p-5 border hover:shadow-md transition-all cursor-pointer"
                    style={{ background: "var(--card)", borderColor: "var(--border)" }}
                    onClick={() => window.location.href = `/superadmin/security/alert/${user._id}`}
                  >
                    <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
                      <div className="flex items-start gap-4 flex-1">
                        {/* Avatar */}
                        <div className="flex-shrink-0">
                          {user.avatarUrl ? (
                            <img src={user.avatarUrl} alt={user.name} className="w-10 h-10 sm:w-12 sm:h-12 rounded-full" />
                          ) : (
                            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center text-white text-base sm:text-lg font-bold">
                              {user.name.charAt(0)}
                            </div>
                          )}
                        </div>

                        {/* User Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h3 className="font-semibold text-base sm:text-lg" style={{ color: "var(--text-primary)" }}>
                              {user.name}
                            </h3>
                            {isAutoBlocked && (
                              <span className="text-[10px] sm:text-xs font-bold bg-red-600 text-white px-1.5 sm:px-2 py-0.5 rounded">
                                AUTO-BLOCKED
                              </span>
                            )}
                          </div>
                          <p className="text-xs sm:text-sm mb-2" style={{ color: "var(--text-muted)" }}>
                            {user.email} • {user.role}
                          </p>

                          <div className="space-y-1 text-xs sm:text-sm">
                            <p style={{ color: "var(--text-muted)" }}>
                              <span className="font-medium" style={{ color: "var(--text-primary)" }}>Reason:</span>{" "}
                              {user.suspendedReason}
                            </p>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-[10px] sm:text-xs" style={{ color: "var(--text-muted)" }}>
                              <span>
                                <Clock className="w-3 h-3 inline mr-1" />
                                Expires in {hoursLeft}h
                              </span>
                              <span className="hidden sm:inline">
                                Until {new Date(user.suspendedUntil).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Action Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          window.location.href = `/superadmin/security/alert/${user._id}`;
                        }}
                        className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-medium text-xs sm:text-sm transition-colors flex items-center gap-1 sm:gap-2 w-full sm:w-auto justify-center"
                        style={{
                          background: "rgba(37,99,235,0.1)",
                          color: "var(--primary)",
                        }}
                      >
                        <span className="hidden sm:inline">Review & Unsuspend</span>
                        <span className="sm:hidden">Review</span>
                        <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Login Attempts ── */}
      {activeTab === "attempts" && (
        <div>
          <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>{t("superadmin.security.recentSuspiciousLogins")}</p>
          {!loginStats?.suspicious?.length ? (
            <div className="text-center py-16" style={{ color: "var(--text-muted)" }}>
              <ShieldCheck className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--success)" }} />
              {t("superadmin.security.noSuspiciousActivity")}
            </div>
          ) : (
            <div className="space-y-2">
              {loginStats.suspicious.map((attempt: any, i: number) => (
                <div
                  key={i}
                  className="rounded-lg p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 border"
                  style={{ background: "var(--card)", borderColor: "var(--border)" }}
                >
                  <div className="flex-shrink-0">
                    {attempt.success ? (
                      <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: "var(--success)" }} />
                    ) : (
                      <XCircle className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: "var(--destructive)" }} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 w-full">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-medium truncate text-sm sm:text-base" style={{ color: "var(--text-primary)" }}>{attempt.email}</span>
                      <span className="text-[10px] sm:text-xs capitalize px-1.5 sm:px-2 py-0.5 rounded" style={{ background: "var(--muted)", color: "var(--text-muted)" }}>
                        {attempt.method}
                      </span>
                      {attempt.riskScore !== undefined && <RiskBadge score={attempt.riskScore} />}
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-[10px] sm:text-xs" style={{ color: "var(--text-muted)" }}>
                      <span>IP: {attempt.ip ?? "—"}</span>
                      {attempt.riskFactors?.length > 0 && (
                        <span style={{ color: "var(--warning)" }}>⚠ {attempt.riskFactors.join(", ")}</span>
                      )}
                      {attempt.blockedReason && (
                        <span style={{ color: "var(--destructive)" }}>🔒 {attempt.blockedReason}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-[10px] sm:text-xs flex-shrink-0 self-end sm:self-auto" style={{ color: "var(--text-muted)" }}>
                    {new Date(attempt.createdAt).toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Audit Logs ── */}
      {activeTab === "logs" && (
        <div>
          <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>{t("superadmin.security.allSecurityActions")}</p>
          {!auditLogs?.length ? (
            <div className="text-center py-16" style={{ color: "var(--text-muted)" }}>
              <Eye className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--text-disabled)" }} />
              {t("superadmin.security.noAuditLogs")}
            </div>
          ) : (
            <div className="space-y-2">
              {auditLogs.map((log: any) => (
                <div
                  key={log._id}
                  className="rounded-lg p-4 flex items-center gap-4 border"
                  style={{ background: "var(--card)", borderColor: "var(--border)" }}
                >
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "var(--primary)" }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>{log.userName}</span>
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>{log.userEmail}</span>
                    </div>
                    <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                      <span
                        className="font-mono text-xs px-1.5 py-0.5 rounded mr-2"
                        style={{ background: "rgba(37,99,235,0.12)", color: "var(--primary)" }}
                      >
                        {log.action}
                      </span>
                      {log.details}
                    </div>
                    {log.ip && (
                      <div className="text-xs mt-0.5" style={{ color: "var(--text-disabled)" }}>IP: {log.ip}</div>
                    )}
                  </div>
                  <div className="text-xs flex-shrink-0" style={{ color: "var(--text-muted)" }}>
                    {new Date(log.createdAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
