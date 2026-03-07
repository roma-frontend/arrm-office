"use client";

import { useState } from "react"
import { useTranslation } from 'react-i18next';;
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useAuthStore } from "@/store/useAuthStore";
import { useRouter } from "next/navigation";
import { ShieldLoader } from "@/components/ui/ShieldLoader";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2,
  Clock,
  CheckCircle2,
  XCircle,
  Mail,
  Phone,
  Globe,
  Users,
  Briefcase,
  MessageSquare,
  Crown,
  Zap,
  Filter,
} from "lucide-react";
import { toast } from "sonner";
import { Id } from "../../../../convex/_generated/dataModel";

type Status = "pending" | "approved" | "rejected";

export default function OrgRequestsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuthStore();
  const [statusFilter, setStatusFilter] = useState<Status | "all">("pending");
  const [selectedRequest, setSelectedRequest] = useState<Id<"organizationRequests"> | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);

  // Only admins can see organization requests
  const isAdmin = user?.role === "admin";
  
  if (!user || !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <ShieldLoader size="lg" />
          <p className="mt-4 text-muted-foreground">{t('ui.accessDenied')}</p>
        </div>
      </div>
    );
  }

  const requests = useQuery(
    api.organizationRequests.getOrganizationRequests,
    user ? { superadminUserId: user.id as Id<"users">, status: statusFilter === "all" ? undefined : statusFilter } : "skip"
  );

  const approveRequest = useMutation(api.organizationRequests.approveOrganizationRequest);
  const rejectRequest = useMutation(api.organizationRequests.rejectOrganizationRequest);

  const handleApprove = async (requestId: Id<"organizationRequests">) => {
    if (!user) return;
    try {
      await approveRequest({ superadminUserId: user.id as Id<"users">, requestId });
      toast.success("Organization approved and created!");
    } catch (error: any) {
      toast.error(error.message || "Failed to approve request");
    }
  };

  const handleReject = async () => {
    if (!user || !selectedRequest) return;
    try {
      await rejectRequest({
        superadminUserId: user.id as Id<"users">,
        requestId: selectedRequest,
        reason: rejectionReason || undefined,
      });
      toast.success("Request rejected");
      setShowRejectModal(false);
      setRejectionReason("");
      setSelectedRequest(null);
    } catch (error: any) {
      toast.error(error.message || "Failed to reject request");
    }
  };

  const openRejectModal = (requestId: Id<"organizationRequests">) => {
    setSelectedRequest(requestId);
    setShowRejectModal(true);
  };

  const pendingCount = requests?.filter((r) => r.status === "pending").length || 0;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #2563eb, #0ea5e9)" }}
          >
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>
              Organization Requests
            </h1>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Review and approve organization creation requests
            </p>
          </div>
        </div>

        {pendingCount > 0 && (
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium mt-4"
            style={{ background: "rgba(37,99,235,0.1)", color: "#2563eb" }}
          >
            <Clock className="w-4 h-4" />
            {pendingCount} pending request{pendingCount !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        {(["all", "pending", "approved", "rejected"] as const).map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
            style={{
              background: statusFilter === status ? "var(--primary)" : "var(--card)",
              color: statusFilter === status ? "#fff" : "var(--text-secondary)",
              border: `1px solid ${statusFilter === status ? "var(--primary)" : "var(--border)"}`,
            }}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {/* Requests List */}
      {!requests ? (
        <div className="flex items-center justify-center py-12">
          <ShieldLoader size="lg" />
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-12">
          <Building2 className="w-16 h-16 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium" style={{ color: "var(--text-muted)" }}>
            No {statusFilter !== "all" ? statusFilter : ""} requests found
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => {
            const Icon = request.requestedPlan === "enterprise" ? Crown : Building2;
            const planColor =
              request.requestedPlan === "enterprise"
                ? "from-purple-500 to-pink-500"
                : "from-blue-500 to-cyan-500";

            return (
              <motion.div
                key={request._id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl p-6 border"
                style={{ background: "var(--card)", borderColor: "var(--border)" }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-4">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: `linear-gradient(135deg, ${planColor})` }}
                    >
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>
                        {request.requestedName}
                      </h3>
                      <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
                        <Globe className="w-4 h-4" />
                        <code className="px-2 py-0.5 rounded bg-opacity-10" style={{ background: "var(--border)" }}>
                          {request.requestedSlug}
                        </code>
                        <span className="px-2 py-0.5 rounded text-xs font-semibold capitalize"
                              style={{ background: `linear-gradient(135deg, ${planColor})`, color: "#fff" }}>
                          {request.requestedPlan}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div
                    className="px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5"
                    style={{
                      background:
                        request.status === "approved"
                          ? "rgba(34,197,94,0.1)"
                          : request.status === "rejected"
                          ? "rgba(239,68,68,0.1)"
                          : "rgba(245,158,11,0.1)",
                      color:
                        request.status === "approved"
                          ? "#22c55e"
                          : request.status === "rejected"
                          ? "#ef4444"
                          : "#f59e0b",
                    }}
                  >
                    {request.status === "approved" ? (
                      <CheckCircle2 className="w-3 h-3" />
                    ) : request.status === "rejected" ? (
                      <XCircle className="w-3 h-3" />
                    ) : (
                      <Clock className="w-3 h-3" />
                    )}
                    {request.status}
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid md:grid-cols-2 gap-4 mb-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-4 h-4 text-[var(--text-muted)]" />
                      <span style={{ color: "var(--text-secondary)" }}>{request.requesterEmail}</span>
                    </div>
                    {request.requesterPhone && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="w-4 h-4 text-[var(--text-muted)]" />
                        <span style={{ color: "var(--text-secondary)" }}>{request.requesterPhone}</span>
                      </div>
                    )}
                    {request.industry && (
                      <div className="flex items-center gap-2 text-sm">
                        <Briefcase className="w-4 h-4 text-[var(--text-muted)]" />
                        <span style={{ color: "var(--text-secondary)" }}>{request.industry}</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="w-4 h-4 text-[var(--text-muted)]" />
                      <span style={{ color: "var(--text-secondary)" }}>
                        {request.teamSize || "Not specified"} employees
                      </span>
                    </div>
                    {request.country && (
                      <div className="flex items-center gap-2 text-sm">
                        <Globe className="w-4 h-4 text-[var(--text-muted)]" />
                        <span style={{ color: "var(--text-secondary)" }}>{request.country}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Description */}
                {request.description && (
                  <div className="p-3 rounded-xl mb-4" style={{ background: "rgba(37,99,235,0.05)" }}>
                    <div className="flex items-start gap-2 text-sm">
                      <MessageSquare className="w-4 h-4 mt-0.5 text-[var(--text-muted)]" />
                      <p style={{ color: "var(--text-secondary)" }}>{request.description}</p>
                    </div>
                  </div>
                )}

                {/* Rejection Reason */}
                {request.status === "rejected" && request.rejectionReason && (
                  <div className="p-3 rounded-xl mb-4" style={{ background: "rgba(239,68,68,0.05)" }}>
                    <div className="flex items-start gap-2 text-sm">
                      <XCircle className="w-4 h-4 mt-0.5 text-red-500" />
                      <div>
                        <p className="font-semibold text-red-500 mb-1">Rejection Reason:</p>
                        <p style={{ color: "var(--text-secondary)" }}>{request.rejectionReason}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Actions */}
                {request.status === "pending" && (
                  <div className="flex gap-3">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleApprove(request._id)}
                      className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2"
                      style={{ background: "linear-gradient(135deg, #10b981, #22c55e)" }}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Approve & Create
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => openRejectModal(request._id)}
                      className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2"
                      style={{ background: "linear-gradient(135deg, #ef4444, #dc2626)" }}
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </motion.button>
                  </div>
                )}

                {/* Metadata */}
                <div className="mt-4 pt-4 border-t flex items-center justify-between text-xs"
                     style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                  <span>Requested by {request.requesterName}</span>
                  <span>{new Date(request.createdAt).toLocaleDateString()}</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Reject Modal */}
      <AnimatePresence>
        {showRejectModal && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowRejectModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl p-6"
              style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            >
              <h3 className="text-xl font-bold mb-4" style={{ color: "var(--text-primary)" }}>
                Reject Request
              </h3>
              <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
                Please provide a reason for rejection (optional):
              </p>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder={t('placeholders.incompleteInfo')}
                rows={4}
                className="w-full px-4 py-3 rounded-xl border text-sm outline-none resize-none mb-4"
                style={{
                  background: "var(--input)",
                  borderColor: "var(--border)",
                  color: "var(--text-primary)",
                }}
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setShowRejectModal(false)}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-sm border"
                  style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                >{t('common.cancel')}</button>
                <button
                  onClick={handleReject}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-white"
                  style={{ background: "linear-gradient(135deg, #ef4444, #dc2626)" }}
                >
                  Confirm Reject
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
