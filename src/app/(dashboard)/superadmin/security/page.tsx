"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuthStore } from "@/store/useAuthStore";
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
  blue:   { iconColor: "#2563eb", accentBg: "rgba(37,99,235,0.1)",  accentText: "#2563eb" },
  orange: { iconColor: "#f59e0b", accentBg: "rgba(245,158,11,0.1)", accentText: "#d97706" },
  purple: { iconColor: "#8b5cf6", accentBg: "rgba(139,92,246,0.1)", accentText: "#8b5cf6" },
  indigo: { iconColor: "#6366f1", accentBg: "rgba(99,102,241,0.1)", accentText: "#6366f1" },
  teal:   { iconColor: "#0ea5e9", accentBg: "rgba(14,165,233,0.1)", accentText: "#0ea5e9" },
  red:    { iconColor: "#ef4444", accentBg: "rgba(239,68,68,0.1)",  accentText: "#ef4444" },
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
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ${
          enabled ? "translate-x-6" : "translate-x-1"
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
  const { user } = useAuthStore();
  const [toggling, setToggling] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<"settings" | "logs" | "attempts">("settings");

  const settings = useQuery(api.security.getAllSettings);
  const loginStats = useQuery(api.security.getLoginStats, { hours: 24 });
  const auditLogs = useQuery(api.security.getRecentAuditLogs, { limit: 50 });
  const toggleSetting = useMutation(api.security.toggleSetting);

  if (!user || user.role !== "superadmin") {
    return (
      <div className="flex items-center justify-center h-96" style={{ color: "var(--text-muted)" }}>
        <ShieldAlert className="w-8 h-8 mr-3" style={{ color: "var(--destructive)" }} />
        Access denied — superadmin only
      </div>
    );
  }

  const handleToggle = async (key: string, currentEnabled: boolean) => {
    setToggling((prev) => ({ ...prev, [key]: true }));
    try {
      await toggleSetting({ key, enabled: !currentEnabled, updatedBy: user.id as Id<"users"> });
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
    (loginStats?.highRisk ?? 0) >= 3  ? "Elevated" :
    (loginStats?.failed ?? 0) >= 20   ? "Moderate" : "Normal";
  const threatColor =
    threatLevel === "Critical" ? "text-red-400" :
    threatLevel === "Elevated" ? "text-orange-400" :
    threatLevel === "Moderate" ? "text-yellow-400" : "text-green-400";

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--background)", color: "var(--text-primary)" }}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl border" style={{ background: "rgba(37,99,235,0.1)", borderColor: "rgba(37,99,235,0.3)" }}>
            <Shield className="w-7 h-7" style={{ color: "var(--primary)" }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Security Control Center</h1>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Manage identity verification systems across all organizations</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
          <Activity className="w-4 h-4" style={{ color: "var(--success)" }} />
          Live monitoring
        </div>
      </div>

      {/* ── Stats bar ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        {[
          { label: "Threat Level", value: threatLevel, color: threatLevel === "Critical" ? "var(--destructive)" : threatLevel === "Elevated" ? "var(--warning)" : threatLevel === "Moderate" ? "#f59e0b" : "var(--success)" },
          { label: "Logins (24h)", value: loginStats?.total ?? 0, color: "var(--text-primary)" },
          { label: "Failed", value: loginStats?.failed ?? 0, color: "var(--destructive)" },
          { label: "High Risk", value: loginStats?.highRisk ?? 0, color: "var(--warning)" },
          { label: "Features ON", value: `${enabledCount}/${FEATURES.length}`, color: "var(--success)" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl p-4 text-center border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</div>
            <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-2 mb-6 border-b" style={{ borderColor: "var(--border)" }}>
        {(["settings", "attempts", "logs"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-5 py-2.5 text-sm font-medium rounded-t-lg transition-colors"
            style={{
              background: activeTab === tab ? "var(--card)" : "transparent",
              color: activeTab === tab ? "var(--text-primary)" : "var(--text-muted)",
              borderColor: activeTab === tab ? "var(--border)" : "transparent",
              border: activeTab === tab ? "1px solid var(--border)" : "1px solid transparent",
              borderBottom: activeTab === tab ? "1px solid var(--card)" : "1px solid transparent",
              marginBottom: activeTab === tab ? "-1px" : "0",
            }}
          >
            {tab === "settings" ? "🛡️ Security Features" : tab === "attempts" ? "🔐 Login Attempts" : "📋 Audit Logs"}
          </button>
        ))}
      </div>

      {/* ── TAB: Security Features ── */}
      {activeTab === "settings" && (
        <div className="space-y-3">
          <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
            Toggle security systems on/off instantly. If employees report issues — simply disable the feature.
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
                className="rounded-xl p-5 flex items-center gap-4 border transition-all"
                style={{
                  background: enabled ? colors.accentBg : "var(--card)",
                  borderColor: enabled ? `${colors.iconColor}33` : "var(--border)",
                }}
              >
                <div
                  className="p-2.5 rounded-lg flex-shrink-0"
                  style={{ background: `${colors.iconColor}18`, color: colors.iconColor }}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{feature.title}</span>
                    {feature.critical && (
                      <span className="text-xs px-2 py-0.5 rounded" style={{ background: "rgba(37,99,235,0.12)", color: "var(--primary)" }}>Essential</span>
                    )}
                    {!enabled && (
                      <span className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--muted)", color: "var(--text-muted)" }}>Disabled</span>
                    )}
                  </div>
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>{feature.description}</p>
                  {savedAt && (
                    <p className="text-xs mt-1" style={{ color: "var(--text-disabled)" }}>
                      Last changed: {new Date(savedAt).toLocaleString()}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
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

      {/* ── TAB: Login Attempts ── */}
      {activeTab === "attempts" && (
        <div>
          <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>Recent suspicious and failed login attempts (last 24h)</p>
          {!loginStats?.suspicious?.length ? (
            <div className="text-center py-16" style={{ color: "var(--text-muted)" }}>
              <ShieldCheck className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--success)" }} />
              No suspicious activity in last 24 hours
            </div>
          ) : (
            <div className="space-y-2">
              {loginStats.suspicious.map((attempt: any, i: number) => (
                <div
                  key={i}
                  className="rounded-lg p-4 flex items-center gap-4 border"
                  style={{ background: "var(--card)", borderColor: "var(--border)" }}
                >
                  <div className="flex-shrink-0">
                    {attempt.success ? (
                      <CheckCircle className="w-5 h-5" style={{ color: "var(--success)" }} />
                    ) : (
                      <XCircle className="w-5 h-5" style={{ color: "var(--destructive)" }} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium truncate" style={{ color: "var(--text-primary)" }}>{attempt.email}</span>
                      <span className="text-xs capitalize px-2 py-0.5 rounded" style={{ background: "var(--muted)", color: "var(--text-muted)" }}>
                        {attempt.method}
                      </span>
                      {attempt.riskScore !== undefined && <RiskBadge score={attempt.riskScore} />}
                    </div>
                    <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-muted)" }}>
                      <span>IP: {attempt.ip ?? "—"}</span>
                      {attempt.riskFactors?.length > 0 && (
                        <span style={{ color: "var(--warning)" }}>⚠ {attempt.riskFactors.join(", ")}</span>
                      )}
                      {attempt.blockedReason && (
                        <span style={{ color: "var(--destructive)" }}>🔒 {attempt.blockedReason}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs flex-shrink-0" style={{ color: "var(--text-muted)" }}>
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
          <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>All security-related actions across the platform</p>
          {!auditLogs?.length ? (
            <div className="text-center py-16" style={{ color: "var(--text-muted)" }}>
              <Eye className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--text-disabled)" }} />
              No audit logs yet
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
