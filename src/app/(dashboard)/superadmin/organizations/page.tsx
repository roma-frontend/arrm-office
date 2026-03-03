"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuthStore } from "@/store/useAuthStore";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Building2, Users, CheckCircle, XCircle, Edit } from "lucide-react";
import { ShieldLoader } from "@/components/ui/ShieldLoader";
import { motion } from "framer-motion";

export default function OrganizationsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuthStore();
  const organizations = useQuery(api.organizations.getAllOrganizations);

  const isSuperadmin = user?.role === "superadmin" || user?.email?.toLowerCase() === "romangulanyan@gmail.com";
  
  // Debug logging
  useEffect(() => {
    if (user) {
      console.log("🔍 Organizations page - User data:", {
        email: user.email,
        role: user.role,
        isSuperadmin,
      });
    }
  }, [user, isSuperadmin]);
  
  useEffect(() => {
    if (!user) {
      router.push("/login");
    }
  }, [user, router]);

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <ShieldLoader size="lg" />
      </div>
    );
  }

  console.log("🔍 Final check - isSuperadmin:", isSuperadmin, "user.role:", user.role, "user.email:", user.email);

  if (!isSuperadmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">{t('ui.accessDenied')}</h1>
          <p className="text-muted-foreground">{t('ui.onlySuperadminCanAccess')}</p>
          <p className="text-xs text-muted-foreground mt-2">
            Your role: {user.role} | Email: {user.email}
          </p>
        </div>
      </div>
    );
  }

  if (organizations === undefined) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <ShieldLoader size="lg" />
      </div>
    );
  }

  const getPlanBadgeColor = (plan: string) => {
    switch (plan) {
      case "enterprise":
        return "bg-purple-500/10 text-purple-400 border-purple-500/20 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/30";
      case "professional":
        return "bg-blue-500/10 text-blue-400 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30";
      case "starter":
        return "bg-green-500/10 text-green-400 border-green-500/20 dark:bg-green-500/20 dark:text-green-300 dark:border-green-500/30";
      default:
        return "bg-gray-500/10 text-gray-400 border-gray-500/20 dark:bg-gray-500/20 dark:text-gray-300 dark:border-gray-500/30";
    }
  };

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--background)" }}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            Organizations Management
          </h1>
          <p className="text-muted-foreground">
            Manage all organizations in the system
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="p-4 rounded-xl border" style={{ background: "var(--card)" }}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10 dark:bg-blue-500/20">
                <Building2 className="w-5 h-5 text-blue-500 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Orgs</p>
                <p className="text-2xl font-bold">{organizations?.length || 0}</p>
              </div>
            </div>
          </div>
          <div className="p-4 rounded-xl border" style={{ background: "var(--card)" }}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10 dark:bg-green-500/20">
                <CheckCircle className="w-5 h-5 text-green-500 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('statuses.active')}Active</p>
                <p className="text-2xl font-bold">
                  {organizations?.filter((o) => o.isActive).length || 0}
                </p>
              </div>
            </div>
          </div>
          <div className="p-4 rounded-xl border" style={{ background: "var(--card)" }}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/10 dark:bg-orange-500/20">
                <Users className="w-5 h-5 text-orange-500 dark:text-orange-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Users</p>
                <p className="text-2xl font-bold">
                  {organizations?.reduce((sum, o) => sum + (o.totalEmployees || 0), 0) || 0}
                </p>
              </div>
            </div>
          </div>
          <div className="p-4 rounded-xl border" style={{ background: "var(--card)" }}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10 dark:bg-red-500/20">
                <XCircle className="w-5 h-5 text-red-500 dark:text-red-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('statuses.inactive')}Inactive</p>
                <p className="text-2xl font-bold">
                  {organizations?.filter((o) => !o.isActive).length || 0}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Organizations List */}
        <div className="space-y-4">
          {organizations?.map((org) => (
            <motion.div
              key={org._id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-6 rounded-xl border hover:shadow-lg transition-all"
              style={{ background: "var(--card)" }}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
                      {org.name}
                    </h3>
                    <span
                      className={`px-2 py-1 rounded-md text-xs font-semibold border ${getPlanBadgeColor(
                        org.plan
                      )}`}
                    >
                      {org.plan.toUpperCase()}
                    </span>
                    {org.isActive ? (
                      <span className="px-2 py-1 rounded-md text-xs font-semibold bg-green-500/10 text-green-400 border border-green-500/20 dark:bg-green-500/20 dark:text-green-300 dark:border-green-500/30">
                        Active
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded-md text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/30">
                        Inactive
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Slug: <span className="font-mono">{org.slug}</span>
                  </p>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">{t('organization.totalEmployees')}</p>
                      <p className="text-lg font-semibold">{org.totalEmployees}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t('organization.activeEmployees')}</p>
                      <p className="text-lg font-semibold text-green-500 dark:text-green-400">{org.activeEmployees}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Employee Limit</p>
                      <p className="text-lg font-semibold">{org.employeeLimit}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Industry</p>
                      <p className="text-sm">{org.industry || "—"}</p>
                    </div>
                  </div>

                  {org.adminNames && org.adminNames.length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs text-muted-foreground mb-1">Admins:</p>
                      <div className="flex gap-2 flex-wrap">
                        {org.adminNames.map((name, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-1 rounded-md text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30"
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => router.push(`/superadmin/organizations/${org._id}/edit`)}
                  className="p-2 rounded-lg hover:bg-muted transition-colors"
                  title={t('titles.editOrganization')}
                >
                  <Edit className="w-5 h-5" style={{ color: "var(--text-primary)" }} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>

        {(!organizations || organizations.length === 0) && (
          <div className="text-center py-12">
            <Building2 className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold mb-2">{t('emptyStates.noOrganizationsYet')}</h3>
            <p className="text-muted-foreground">
              {t('organization.createFirstOrg')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
