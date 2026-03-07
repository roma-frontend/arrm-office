"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Calendar, Mail, MessageSquare, Download, Cloud, Check, Loader2, Clock, Users, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { getGoogleCalendarAuthUrl } from "@/lib/calendar-sync";

export function IntegrationSettings() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [emailReports, setEmailReports] = useState(true);
  const [slackNotifications, setSlackNotifications] = useState(false);

  // SharePoint state
  const [sharepointConnected, setSharepointConnected] = useState(false);
  const [sharepointEmail, setSharepointEmail] = useState<string | null>(null);
  const [sharepointLoading, setSharepointLoading] = useState(true);
  const [sharepointSyncing, setSharepointSyncing] = useState(false);
  const [sharepointDisconnecting, setSharepointDisconnecting] = useState(false);

  // Check Google Calendar connection status
  const checkGoogleStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/calendar/google/status");
      const data = await res.json();
      setGoogleConnected(data.connected);
      setGoogleEmail(data.email || null);
    } catch {
      setGoogleConnected(false);
    } finally {
      setGoogleLoading(false);
    }
  }, []);

  useEffect(() => {
    checkGoogleStatus();
  }, [checkGoogleStatus]);

  // Handle OAuth callback result
  useEffect(() => {
    const status = searchParams.get("google_calendar");
    if (status === "connected") {
      toast.success(t("settingsIntegration.googleCalendarConnected"));
      checkGoogleStatus();
    } else if (status === "error") {
      toast.error(t("settingsIntegration.googleCalendarError"));
    }
  }, [searchParams, t, checkGoogleStatus]);

  const handleGoogleConnect = () => {
    try {
      const redirectUri = `${window.location.origin}/api/calendar/google/callback`;
      const authUrl = getGoogleCalendarAuthUrl(redirectUri);
      window.location.href = authUrl;
    } catch {
      toast.error(t("settingsIntegration.googleNotConfigured"));
    }
  };

  const handleGoogleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await fetch("/api/calendar/google/disconnect", { method: "POST" });
      setGoogleConnected(false);
      setGoogleEmail(null);
      toast.success(t("settingsIntegration.googleCalendarDisconnected"));
    } catch {
      toast.error(t("settingsIntegration.disconnectError"));
    } finally {
      setDisconnecting(false);
    }
  };

  // ── SharePoint status & handlers ──────────────────────────────────────────
  const checkSharepointStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/sharepoint/status");
      const data = await res.json();
      setSharepointConnected(data.connected);
      setSharepointEmail(data.email || null);
    } catch {
      setSharepointConnected(false);
    } finally {
      setSharepointLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSharepointStatus();
  }, [checkSharepointStatus]);

  // Handle SharePoint OAuth callback result
  useEffect(() => {
    const status = searchParams.get("sharepoint");
    if (status === "connected") {
      toast.success("SharePoint connected successfully");
      checkSharepointStatus();
    } else if (status === "error") {
      toast.error("Failed to connect SharePoint");
    }
  }, [searchParams, checkSharepointStatus]);

  const handleSharepointConnect = () => {
    window.location.href = "/api/sharepoint/auth";
  };

  const handleSharepointDisconnect = async () => {
    setSharepointDisconnecting(true);
    try {
      await fetch("/api/sharepoint/disconnect", { method: "POST" });
      setSharepointConnected(false);
      setSharepointEmail(null);
      toast.success("SharePoint disconnected");
    } catch {
      toast.error("Failed to disconnect SharePoint");
    } finally {
      setSharepointDisconnecting(false);
    }
  };

  const handleSharepointSync = async () => {
    setSharepointSyncing(true);
    try {
      // We need adminId and organizationId — read from localStorage or session
      const storedUser = localStorage.getItem("currentUser");
      if (!storedUser) {
        toast.error("Please log in first");
        return;
      }
      const user = JSON.parse(storedUser);
      const res = await fetch("/api/sharepoint/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminId: user._id,
          organizationId: user.organizationId,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Sync failed");
        return;
      }

      toast.success(
        `Sync complete: ${data.created} created, ${data.updated} updated, ${data.deactivated} deactivated` +
          (data.errors?.length ? `, ${data.errors.length} errors` : "")
      );
    } catch {
      toast.error("SharePoint sync failed");
    } finally {
      setSharepointSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Calendar Integrations */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[var(--primary)]" />
            <CardTitle>{t("settingsIntegration.title")}</CardTitle>
          </div>
          <CardDescription>{t("settingsIntegration.calendarSync")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Google Calendar — working */}
          <div className="flex items-start justify-between p-4 rounded-lg bg-[var(--surface-hover)] border border-[var(--border)]">
            <div className="flex items-start gap-3 flex-1">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-blue-500" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {t("settingsIntegration.googleCalendar")}
                  </p>
                  {googleConnected && (
                    <Badge variant="default" className="text-xs gap-1">
                      <Check className="w-3 h-3" />
                      {t("settingsIntegration.connected")}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  {t("settingsIntegration.googleCalendarDesc")}
                </p>
                {googleConnected && googleEmail && (
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    {googleEmail}
                  </p>
                )}
              </div>
            </div>
            {googleLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-[var(--text-muted)]" />
            ) : googleConnected ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleGoogleDisconnect}
                disabled={disconnecting}
              >
                {disconnecting ? (
                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                ) : null}
                {t("settingsIntegration.disconnect")}
              </Button>
            ) : (
              <Button variant="default" size="sm" onClick={handleGoogleConnect}>
                {t("settingsIntegration.connect")}
              </Button>
            )}
          </div>

          {/* Outlook Calendar — coming soon */}
          <div className="flex items-start justify-between p-4 rounded-lg bg-[var(--surface-hover)] border border-[var(--border)] opacity-70">
            <div className="flex items-start gap-3 flex-1">
              <div className="w-10 h-10 rounded-lg bg-blue-600/10 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {t("settingsIntegration.outlookCalendar")}
                  </p>
                  <Badge variant="outline" className="text-xs gap-1">
                    <Clock className="w-3 h-3" />
                    {t("settingsIntegration.comingSoon")}
                  </Badge>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  {t("settingsIntegration.outlookCalendarDesc")}
                </p>
              </div>
            </div>
            <Button variant="default" size="sm" disabled>
              {t("settingsIntegration.connect")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* SharePoint Employee Sync */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-[var(--primary)]" />
            <CardTitle>SharePoint Employee Sync</CardTitle>
          </div>
          <CardDescription>
            Sync employee list from SharePoint to keep your team roster up to date
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start justify-between p-4 rounded-lg bg-[var(--surface-hover)] border border-[var(--border)]">
            <div className="flex items-start gap-3 flex-1">
              <div className="w-10 h-10 rounded-lg bg-teal-500/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-teal-500" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    Microsoft SharePoint
                  </p>
                  {sharepointConnected && (
                    <Badge variant="default" className="text-xs gap-1">
                      <Check className="w-3 h-3" />
                      {t("settingsIntegration.connected")}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Automatically sync employees from your SharePoint List
                </p>
                {sharepointConnected && sharepointEmail && (
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    {sharepointEmail}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {sharepointLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-[var(--text-muted)]" />
              ) : sharepointConnected ? (
                <>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleSharepointSync}
                    disabled={sharepointSyncing}
                  >
                    {sharepointSyncing ? (
                      <Loader2 className="w-3 h-3 animate-spin mr-1" />
                    ) : (
                      <RefreshCw className="w-3 h-3 mr-1" />
                    )}
                    Sync Employees
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSharepointDisconnect}
                    disabled={sharepointDisconnecting}
                  >
                    {sharepointDisconnecting ? (
                      <Loader2 className="w-3 h-3 animate-spin mr-1" />
                    ) : null}
                    {t("settingsIntegration.disconnect")}
                  </Button>
                </>
              ) : (
                <Button variant="default" size="sm" onClick={handleSharepointConnect}>
                  {t("settingsIntegration.connect")}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Email Integration */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-[var(--primary)]" />
            <CardTitle>{t("settingsIntegration.title")}</CardTitle>
          </div>
          <CardDescription>{t("settingsIntegration.emailReports")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg bg-[var(--surface-hover)] border border-[var(--border)]">
            <div className="flex items-start gap-3">
              <span className="text-2xl">📧</span>
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">{t("settingsIntegration.automatedReports")}</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {t("settingsIntegration.automatedReportsDesc")}
                </p>
              </div>
            </div>
            <Switch checked={emailReports} onCheckedChange={setEmailReports} />
          </div>

          {emailReports && (
            <div className="p-4 rounded-lg border border-[var(--primary)]/20 bg-[var(--primary)]/5 space-y-2">
              <p className="text-sm font-medium text-[var(--text-primary)]">{t("settingsIntegration.reportSchedule")}</p>
              <div className="space-y-1 text-xs text-[var(--text-muted)]">
                <p>• {t("settingsIntegration.weeklySummary")}</p>
                <p>• {t("settingsIntegration.monthlyAnalytics")}</p>
                <p>• {t("settingsIntegration.leaveApprovals")}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Messaging Integrations */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-[var(--primary)]" />
            <CardTitle>{t("settingsIntegration.title")}</CardTitle>
          </div>
          <CardDescription>{t("settingsIntegration.teamCommunication")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Slack */}
          <div className="flex items-start justify-between p-4 rounded-lg bg-[var(--surface-hover)] border border-[var(--border)]">
            <div className="flex items-start gap-3 flex-1">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-purple-500" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-[var(--text-primary)]">{t("settingsIntegration.slack")}</p>
                  {slackNotifications && (
                    <Badge variant="default" className="text-xs">{t("settingsIntegration.connected")}</Badge>
                  )}
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1">{t("settingsIntegration.slackDesc")}</p>
              </div>
            </div>
            {slackNotifications ? (
              <Button variant="outline" size="sm" onClick={() => setSlackNotifications(false)}>
                {t("settingsIntegration.disconnect")}
              </Button>
            ) : (
              <Button variant="default" size="sm" onClick={() => setSlackNotifications(true)}>
                {t("settingsIntegration.connect")}
              </Button>
            )}
          </div>

          {/* Microsoft Teams — coming soon */}
          <div className="flex items-start justify-between p-4 rounded-lg bg-[var(--surface-hover)] border border-[var(--border)] opacity-70">
            <div className="flex items-start gap-3 flex-1">
              <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-indigo-500" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-[var(--text-primary)]">{t("settingsIntegration.microsoftTeams")}</p>
                  <Badge variant="outline" className="text-xs gap-1">
                    <Clock className="w-3 h-3" />
                    {t("settingsIntegration.comingSoon")}
                  </Badge>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1">{t("settingsIntegration.microsoftTeamsDesc")}</p>
              </div>
            </div>
            <Button variant="default" size="sm" disabled>
              {t("settingsIntegration.connect")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Export & Backup */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Download className="w-5 h-5 text-[var(--primary)]" />
            <CardTitle>{t("settingsIntegration.title")}</CardTitle>
          </div>
          <CardDescription>{t("settingsIntegration.dataManagement")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Button variant="outline" className="justify-start">
              <Download className="w-4 h-4 mr-2" />
              {t("settingsIntegration.exportAsCSV")}
            </Button>
            <Button variant="outline" className="justify-start">
              <Download className="w-4 h-4 mr-2" />
              {t("settingsIntegration.exportAsExcel")}
            </Button>
            <Button variant="outline" className="justify-start">
              <Download className="w-4 h-4 mr-2" />
              {t("settingsIntegration.exportAsPDFReport")}
            </Button>
            <Button variant="outline" className="justify-start">
              <Cloud className="w-4 h-4 mr-2" />
              {t("settingsIntegration.backupToCloud")}
            </Button>
          </div>

          <div className="p-4 rounded-lg bg-[var(--surface-hover)] border border-[var(--border)]">
            <div className="flex items-start gap-3">
              <span className="text-xl">💾</span>
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">{t("settingsIntegration.lastBackup")}</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  {t("settingsIntegration.neverBackedUp")}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
