"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuthStore } from "@/store/useAuthStore";
import { useTranslation } from "react-i18next";
import { ShieldLoader } from "@/components/ui/ShieldLoader";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Users, Shield, Mail, Building2, CheckCircle } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";

export default function AdminPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [assignEmail, setAssignEmail] = useState("");
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);

  // Check if user is superadmin
  if (!user || user.role !== "superadmin" || user.email?.toLowerCase() !== "romangulanyan@gmail.com") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-2">
          <AlertCircle className="w-8 h-8 text-[var(--text-muted)] mx-auto" />
          <p className="text-[var(--text-muted)]">Only superadmin can access this page</p>
        </div>
      </div>
    );
  }

  const organizations = useQuery(api.admin.listAll);
  const assignUserAsOrgAdmin = useMutation(api.admin.assignUserAsOrgAdmin);

  const handleAssign = async () => {
    if (!assignEmail.trim() || !selectedOrgId) {
      toast.error("Please fill in all fields");
      return;
    }

    setIsAssigning(true);
    try {
      const userId = user.id as Id<"users">;
      await assignUserAsOrgAdmin({
        superadminUserId: userId,
        userEmail: assignEmail.toLowerCase().trim(),
        organizationId: selectedOrgId as Id<"organizations">,
      });
      
      toast.success(`✅ User assigned as admin successfully!`);
      setAssignEmail("");
      setSelectedOrgId("");
    } catch (error: any) {
      toast.error(error.message || "Failed to assign user");
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <div className="space-y-6 p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Shield className="w-6 h-6 text-[var(--primary)]" />
          Superadmin Panel
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Manage system-wide settings and user assignments
        </p>
      </div>

      {/* Assign User as Org Admin */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Assign User as Organization Admin
          </CardTitle>
          <CardDescription>
            Assign a user (after Google signup) as admin of an organization
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-[var(--text-primary)]">User Email</label>
            <input
              type="email"
              value={assignEmail}
              onChange={(e) => setAssignEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background-subtle)] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
            <p className="text-xs text-[var(--text-muted)]">
              Email of the user who signed up via Google
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-[var(--text-primary)]">Organization</label>
            <select
              value={selectedOrgId}
              onChange={(e) => setSelectedOrgId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background-subtle)] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--primary)]"
            >
              <option value="">Select organization...</option>
              {organizations?.map((org: any) => (
                <option key={org._id} value={org._id}>
                  {org.name} ({org.employeeCount || 0} employees)
                </option>
              ))}
            </select>
          </div>

          <Button
            onClick={handleAssign}
            disabled={isAssigning || !assignEmail.trim() || !selectedOrgId}
            className="w-full"
            size="lg"
          >
            {isAssigning ? (
              <>
                <ShieldLoader size="xs" variant="inline" />
                Assigning...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                Assign as Admin
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Organizations List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Organizations
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!organizations ? (
            <div className="flex items-center justify-center py-8">
              <ShieldLoader size="md" message="Loading organizations..." />
            </div>
          ) : organizations.length === 0 ? (
            <p className="text-[var(--text-muted)] text-center py-8">No organizations yet</p>
          ) : (
            <div className="space-y-3">
              {organizations.map((org: any) => (
                <div key={org._id} className="flex items-center justify-between p-4 rounded-lg border border-[var(--border)] bg-[var(--background-subtle)]">
                  <div className="flex-1">
                    <p className="font-semibold text-[var(--text-primary)]">{org.name}</p>
                    <p className="text-sm text-[var(--text-muted)]">
                      {org.employeeCount || 0} employees • Plan: <Badge variant="outline" className="ml-1">{org.plan}</Badge>
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge>{org.isActive ? "Active" : "Inactive"}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
