"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../../../convex/_generated/api";
import { useAuthStore } from "@/store/useAuthStore";
import { useRouter, useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { 
  ArrowLeft, 
  Shield, 
  Users, 
  UserCheck, 
  UserX,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  Clock
} from "lucide-react";
import { ShieldLoader } from "@/components/ui/ShieldLoader";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Member {
  _id: string;
  name: string;
  email: string;
  role: "admin" | "supervisor" | "employee" | "superadmin";
  isActive: boolean;
  isApproved: boolean;
  department?: string;
  position?: string;
  avatarUrl?: string;
  createdAt: number;
}

export default function ManageAdminsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams();
  const { user } = useAuthStore();
  const orgId = params.id as string;
  const isSuperadmin = user?.role === "superadmin" || user?.email?.toLowerCase() === "romangulanyan@gmail.com";

  // Check if admin is trying to access their own organization
  const isOwnOrganization = user?.organizationId === orgId;
  const canAccess = isSuperadmin || (user?.role === "admin" && isOwnOrganization);

  // Queries and Mutations
  const organization = useQuery(
    api.organizations.getOrganizationById,
    user?.id && orgId
      ? { callerUserId: user.id as any, organizationId: orgId as any }
      : "skip"
  );

  const orgMembers = useQuery(
    api.organizations.getOrgMembers,
    user?.id && orgId
      ? { superadminUserId: user.id as any, organizationId: orgId as any }
      : "skip"
  );

  const assignAdminMutation = useMutation(api.organizations.assignOrgAdmin);
  const removeAdminMutation = useMutation(api.organizations.removeOrgAdmin);

  // State
  const [isLoading, setIsLoading] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"promote" | "demote" | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (!user) {
      router.push("/login");
    }
  }, [user, router]);

  const handlePromoteAdmin = async () => {
    if (!selectedMemberId) return;
    
    setIsLoading(true);
    try {
      await assignAdminMutation({
        superadminUserId: user?.id as any,
        userId: selectedMemberId as any,
        organizationId: orgId as any,
      });
      
      toast.success(t("ui.adminAssignedSuccessfully") || "Admin assigned successfully!");
      setShowConfirm(false);
      setSelectedMemberId(null);
      setActionType(null);
    } catch (error) {
      console.error("Error promoting admin:", error);
      toast.error((error as any).message || t("ui.errorAssigningAdmin") || "Error assigning admin");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveAdmin = async () => {
    if (!selectedMemberId) return;
    
    setIsLoading(true);
    try {
      await removeAdminMutation({
        superadminUserId: user?.id as any,
        userId: selectedMemberId as any,
      });
      
      toast.success(t("ui.adminRemovedSuccessfully") || "Admin removed successfully!");
      setShowConfirm(false);
      setSelectedMemberId(null);
      setActionType(null);
    } catch (error) {
      console.error("Error removing admin:", error);
      toast.error((error as any).message || t("ui.errorRemovingAdmin") || "Error removing admin");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = (memberId: string, action: "promote" | "demote") => {
    setSelectedMemberId(memberId);
    setActionType(action);
    setShowConfirm(true);
  };

  const selectedMember = orgMembers?.find((m) => m._id === selectedMemberId);

  // Loading & Auth States
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <ShieldLoader size="lg" />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">{t("ui.accessDenied")}</h1>
          <p className="text-muted-foreground">
            {isSuperadmin 
              ? "Organization not found"
              : "You can only manage your own organization"}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Your role: {user.role} | Your org: {user.organizationId} | Requested: {orgId}
          </p>
        </div>
      </div>
    );
  }

  if (organization === undefined || orgMembers === undefined) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <ShieldLoader size="lg" />
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">{t("ui.organizationNotFound")}</h1>
          <p className="text-muted-foreground">The organization you're looking for doesn't exist</p>
          <button
            onClick={() => router.push("/superadmin/organizations")}
            className="mt-4 px-4 py-2 rounded-lg bg-primary text-white hover:opacity-90 transition"
          >
            {t("ui.backToOrganizations")}
          </button>
        </div>
      </div>
    );
  }

  const admins = orgMembers.filter((m) => m.role === "admin");
  const employees = orgMembers.filter((m) => m.role !== "admin");

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--background)" }}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push("/superadmin/organizations")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            {t("ui.backToOrganizations")}
          </button>

          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>
              {organization.name}
            </h1>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
              {organization.plan.toUpperCase()}
            </span>
          </div>
          <p className="text-muted-foreground">Manage administrators for this organization</p>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="p-4 rounded-xl border" style={{ background: "var(--card)" }}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10 dark:bg-blue-500/20">
                <Users className="w-5 h-5 text-blue-500 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Members</p>
                <p className="text-2xl font-bold">{orgMembers.length}</p>
              </div>
            </div>
          </div>
          
          <div className="p-4 rounded-xl border" style={{ background: "var(--card)" }}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10 dark:bg-purple-500/20">
                <Shield className="w-5 h-5 text-purple-500 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Admins</p>
                <p className="text-2xl font-bold">{admins.length}</p>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl border" style={{ background: "var(--card)" }}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10 dark:bg-green-500/20">
                <UserCheck className="w-5 h-5 text-green-500 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-2xl font-bold">
                  {orgMembers.filter((m) => m.isActive).length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Admins Section */}
        <div className="mb-8">
          <div className="mb-4">
            <h2 className="text-2xl font-bold flex items-center gap-2 mb-4" style={{ color: "var(--text-primary)" }}>
              <Shield className="w-6 h-6 text-purple-500" />
              Current Admins
            </h2>
          </div>

          {admins.length > 0 ? (
            <div className="space-y-3 mb-6">
              {admins.map((admin) => (
                <div
                  key={admin._id}
                  className="p-4 rounded-xl border flex items-center justify-between hover:shadow-md transition-all"
                  style={{ background: "var(--card)" }}
                >
                  <div className="flex items-center gap-4 flex-1">
                    {admin.avatarUrl && (
                      <img
                        src={admin.avatarUrl}
                        alt={admin.name}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                    )}
                    {!admin.avatarUrl && (
                      <div className="w-12 h-12 rounded-full bg-purple-500/20 border border-purple-500/40 flex items-center justify-center">
                        <Shield className="w-6 h-6 text-purple-500" />
                      </div>
                    )}
                    <div className="flex-1">
                      <h3 className="font-semibold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                        {admin.name}
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-400">
                          Admin
                        </span>
                      </h3>
                      <p className="text-sm text-muted-foreground">{admin.email}</p>
                      {admin.department && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {admin.department}
                          {admin.position && ` • ${admin.position}`}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <button
                    onClick={() => handleAction(admin._id, "demote")}
                    disabled={isLoading}
                    className="p-2 rounded-lg hover:bg-red-500/10 text-red-500 transition-colors disabled:opacity-50"
                    title="Remove admin role"
                  >
                    <UserX className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 rounded-xl border text-center" style={{ background: "var(--card)" }}>
              <AlertCircle className="w-12 h-12 mx-auto mb-3 text-yellow-500 opacity-50" />
              <p className="text-muted-foreground">No admins assigned yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Select an employee below to make them an admin
              </p>
            </div>
          )}
        </div>

        {/* Employees Section */}
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2 mb-4" style={{ color: "var(--text-primary)" }}>
            <Users className="w-6 h-6 text-blue-500" />
            Employees {employees.length > 0 && `(${employees.length})`}
          </h2>

          {employees.length > 0 ? (
            <div className="space-y-3">
              {employees.map((employee) => (
                <div
                  key={employee._id}
                  className="p-4 rounded-xl border flex items-center justify-between hover:shadow-md transition-all group"
                  style={{ background: "var(--card)" }}
                >
                  <div className="flex items-center gap-4 flex-1">
                    {employee.avatarUrl && (
                      <img
                        src={employee.avatarUrl}
                        alt={employee.name}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                    )}
                    {!employee.avatarUrl && (
                      <div className="w-12 h-12 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center">
                        <Users className="w-6 h-6 text-blue-500" />
                      </div>
                    )}
                    <div className="flex-1">
                      <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>
                        {employee.name}
                      </h3>
                      <p className="text-sm text-muted-foreground">{employee.email}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {employee.department && (
                          <p className="text-xs text-muted-foreground">
                            {employee.department}
                            {employee.position && ` • ${employee.position}`}
                          </p>
                        )}
                        {!employee.isApproved && (
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Pending Approval
                          </span>
                        )}
                        {!employee.isActive && (
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-500/10 text-red-600 dark:text-red-400">
                            Inactive
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleAction(employee._id, "promote")}
                    disabled={isLoading || !employee.isApproved || !employee.isActive}
                    className="p-2 rounded-lg hover:bg-green-500/10 text-green-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title={
                      !employee.isApproved
                        ? "Cannot promote unapproved employee"
                        : !employee.isActive
                        ? "Cannot promote inactive employee"
                        : "Make admin"
                    }
                  >
                    <UserCheck className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 rounded-xl border text-center" style={{ background: "var(--card)" }}>
              <Users className="w-12 h-12 mx-auto mb-3 text-blue-500 opacity-50" />
              <p className="text-muted-foreground">No employees available</p>
              <p className="text-xs text-muted-foreground mt-1">
                All members in this organization are already admins
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionType === "promote" ? "Make Admin?" : "Remove Admin Role?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionType === "promote" ? (
                <span>
                  Are you sure you want to make{" "}
                  <strong>{selectedMember?.name}</strong> ({selectedMember?.email}) an
                  administrator of <strong>{organization.name}</strong>?
                  <br />
                  <br />
                  They will have full control over this organization.
                </span>
              ) : (
                <span>
                  Are you sure you want to remove admin role from{" "}
                  <strong>{selectedMember?.name}</strong> ({selectedMember?.email})?
                  <br />
                  <br />
                  They will be demoted to regular employee.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={actionType === "promote" ? handlePromoteAdmin : handleRemoveAdmin}
              disabled={isLoading}
              className={
                actionType === "promote"
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-red-600 hover:bg-red-700"
              }
            >
              {isLoading
                ? "Processing..."
                : actionType === "promote"
                ? "Make Admin"
                : "Remove Admin"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
