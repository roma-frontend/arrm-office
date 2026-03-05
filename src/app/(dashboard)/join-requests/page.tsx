"use client";

import { useState } from "react"
import { useTranslation } from 'react-i18next';;
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuthStore } from "@/store/useAuthStore";
import { ShieldLoader } from "@/components/ui/ShieldLoader";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, CheckCircle2, XCircle, Clock, Search,
  Mail, Calendar, AlertCircle, Link2,
  Copy, Check, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Id } from "@/convex/_generated/dataModel";

type FilterStatus = "pending" | "approved" | "rejected" | "all";

// Status badges will be rendered with translation in component

export default function JoinRequestsPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [filter, setFilter] = useState<FilterStatus>("pending");
  const [search, setSearch] = useState("");
  const [approving, setApproving] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const userId = user?.id as Id<"users"> | undefined;

  const requests = useQuery(
    api.organizations.getJoinRequests,
    userId ? { adminId: userId, status: filter === "all" ? undefined : filter } : "skip"
  );

  const pendingCount = useQuery(
    api.organizations.getPendingJoinRequestCount,
    userId ? { adminId: userId } : "skip"
  );

  // Debug logging
  if (requests) {
    console.log(`[JOIN REQUESTS] Retrieved ${requests.length} requests for status="${filter}"`, {
      userId,
      userRole: user?.role,
      userOrg: user?.organizationId,
      requestsData: requests
    });
  }

  const approveRequest = useMutation(api.organizations.approveJoinRequest);
  const rejectRequest = useMutation(api.organizations.rejectJoinRequest);
  const generateToken = useMutation(api.organizations.generateInviteToken);

  if (!user || (user.role !== "admin" && user.role !== "superadmin")) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-2">
          <AlertCircle className="w-8 h-8 text-[var(--text-muted)] mx-auto" />
          <p className="text-[var(--text-muted)]">{t('ui.adminAccessRequired')}</p>
        </div>
      </div>
    );
  }

  const filtered = (requests ?? []).filter((r) =>
    r.requestedByName.toLowerCase().includes(search.toLowerCase()) ||
    r.requestedByEmail.toLowerCase().includes(search.toLowerCase())
  );

  const handleApprove = async (inviteId: Id<"organizationInvites">) => {
    if (!userId) return;
    setApproving(inviteId);
    try {
      await approveRequest({
        adminId: userId,
        inviteId,
        role: "employee",
        passwordHash: Math.random().toString(36).slice(2) + Date.now().toString(36),
      });
      toast.success("✅ Request approved! User account created.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to approve");
    } finally {
      setApproving(null);
    }
  };

  const handleReject = async (inviteId: Id<"organizationInvites">) => {
    if (!userId) return;
    setRejecting(inviteId);
    try {
      await rejectRequest({ adminId: userId, inviteId, reason: rejectReason || undefined });
      toast.success("Request rejected.");
      setRejectingId(null);
      setRejectReason("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reject");
    } finally {
      setRejecting(null);
    }
  };

  const handleGenerateInviteLink = async () => {
    if (!userId) return;
    setGeneratingLink(true);
    try {
      const result = await generateToken({ adminId: userId, expiryHours: 72 });
      const link = `${window.location.origin}/register?invite=${result.token}`;
      setInviteLink(link);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate link");
    } finally {
      setGeneratingLink(false);
    }
  };

  const handleCopyLink = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setInviteCopied(true);
    toast.success("Invite link copied!");
    setTimeout(() => setInviteCopied(false), 2000);
  };

  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Users className="w-6 h-6 text-[var(--primary)]" />
            Join Requests
            {(pendingCount ?? 0) > 0 && (
              <span className="ml-1 px-2 py-0.5 text-xs font-bold rounded-full bg-red-500 text-white">
                {pendingCount}
              </span>
            )}
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Manage requests from employees who want to join your organization
          </p>
        </div>

        {/* Generate invite link */}
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerateInviteLink}
            disabled={generatingLink}
            className="gap-1.5"
          >
            {generatingLink ? <ShieldLoader size="xs" variant="inline" /> : <Link2 className="w-4 h-4" />}
            Generate Invite Link
          </Button>
          {inviteLink && (
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={inviteLink}
                className="text-xs px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background-subtle)] text-[var(--text-muted)] w-48 truncate"
              />
              <button onClick={handleCopyLink} className="p-1.5 rounded-lg hover:bg-[var(--background-subtle)] transition-colors">
                {inviteCopied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-[var(--text-muted)]" />}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filters + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-2">
          {(["pending", "approved", "rejected", "all"] as FilterStatus[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all"
              style={{
                background: filter === f ? "var(--primary)" : "var(--background-subtle)",
                color: filter === f ? "#fff" : "var(--text-muted)",
              }}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('placeholders.searchByNameOrEmail')}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--background-subtle)] text-sm text-[var(--text-primary)] outline-none"
          />
        </div>
      </div>

      {/* Request cards */}
      {requests === undefined ? (
        <div className="flex items-center justify-center py-16 gap-2 text-[var(--text-muted)]">
          <ShieldLoader size="md" message="Loading requests…" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <Users className="w-10 h-10 text-[var(--text-muted)] opacity-40" />
            <div className="text-center space-y-2">
              <p className="text-[var(--text-muted)] font-medium">
                {filter === "pending" ? "No pending join requests" : `No ${filter} requests`}
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Share your invite link to let employees join your organization
              </p>
              {filter === "pending" && (
                <p className="text-xs text-[var(--text-muted)] pt-2 border-t border-[var(--border)]">
                  💡 Tip: Check other filters to see approved or rejected requests
                </p>
              )}
              {!user?.organizationId && user?.role === "admin" && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded px-3 py-2 mt-2 border border-amber-200">
                  ⚠️ Your organization hasn't been assigned yet. Contact superadmin.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {filtered.map((req) => (
              <motion.div
                key={req._id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <Card>
                  <CardContent className="p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      {/* Info */}
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-[var(--primary)]/10 border border-[var(--primary)]/20 flex items-center justify-center flex-shrink-0 text-[var(--primary)] font-bold text-sm">
                          {req.requestedByName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-[var(--text-primary)]">{req.requestedByName}</p>
                          <p className="text-sm text-[var(--text-muted)] flex items-center gap-1">
                            <Mail className="w-3 h-3" /> {req.requestedByEmail}
                          </p>
                          <p className="text-xs text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
                            <Calendar className="w-3 h-3" />
                            {new Date(req.requestedAt).toLocaleDateString("en-US", {
                              year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                            })}
                          </p>
                        </div>
                      </div>

                      {/* Status + Actions */}
                      <div className="flex flex-col items-end gap-3 sm:items-end">
                        <Badge variant={req.status === "approved" ? "success" : req.status === "rejected" ? "destructive" : "warning"}>{req.status}</Badge>

                        {req.status === "pending" && (
                          <div className="flex items-center gap-2">
                            {rejectingId === req._id ? (
                              <div className="flex items-center gap-2">
                                <input
                                  value={rejectReason}
                                  onChange={(e) => setRejectReason(e.target.value)}
                                  placeholder={t('placeholders.reasonOptional')}
                                  className="text-xs px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--input)] text-[var(--text-primary)] outline-none w-36"
                                />
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleReject(req._id as Id<"organizationInvites">)}
                                  disabled={rejecting === req._id}
                                >
                                  {rejecting === req._id ? <ShieldLoader size="xs" variant="inline" /> : "Confirm"}
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setRejectingId(null)}>{t('common.cancel')}</Button>
                              </div>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1 text-red-500 border-red-200 hover:bg-red-50"
                                  onClick={() => setRejectingId(req._id)}
                                >
                                  <XCircle className="w-3.5 h-3.5" /> {t('ui.reject')}
                                </Button>
                                <Button
                                  size="sm"
                                  className="gap-1"
                                  onClick={() => handleApprove(req._id as Id<"organizationInvites">)}
                                  disabled={approving === req._id}
                                >
                                  {approving === req._id ? (
                                    <ShieldLoader size="xs" variant="inline" />
                                  ) : (
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  )}
                                  {t('ui.approve')}
                                </Button>
                              </>
                            )}
                          </div>
                        )}

                        {req.status === "rejected" && req.rejectionReason && (
                          <p className="text-xs text-[var(--text-muted)] italic">
                            Reason: {req.rejectionReason}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
