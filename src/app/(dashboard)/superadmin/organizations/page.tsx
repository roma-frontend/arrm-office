"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuthStore } from "@/store/useAuthStore";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2, Users, CheckCircle, XCircle, Edit, Shield, MessageSquare, Wrench } from "lucide-react";
import { ShieldLoader } from "@/components/ui/ShieldLoader";
import { SuperadminBroadcastsPanel } from "@/components/admin/SuperadminBroadcastsPanel";
import { MaintenanceModeManager } from "@/components/admin/MaintenanceModeManager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function OrganizationsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState("organizations");
  
  // Debug user object
  console.log("🔍 [Organizations] Full user object:", user);
  console.log("🔍 [Organizations] user.id:", user?.id);
  console.log("🔍 [Organizations] typeof user.id:", typeof user?.id);
  
  const organizations = useQuery(
    api.organizations.getAllOrganizations,
    user?.id ? { superadminUserId: user.id as any } : "skip"
  );
  
  console.log("🔍 [Organizations] organizations query result:", organizations);

  const isSuperadmin = user?.role === "superadmin" || user?.email?.toLowerCase() === "romangulanyan@gmail.com";
  
  // Debug logging
  useEffect(() => {
    console.log("🔍 [Organizations] useEffect triggered");
    console.log("🔍 [Organizations] user:", user);
    console.log("🔍 [Organizations] isSuperadmin:", isSuperadmin);
    
    if (user) {
      console.log("🔍 Organizations page - User data:", {
        email: user.email,
        role: user.role,
        isSuperadmin,
      });
    }
    
    if (!user) {
      console.log("🔍 [Organizations] No user - would redirect to /login BUT DISABLED FOR DEBUG");
      // router.push("/login"); // TEMPORARY DISABLED
    } else if (!isSuperadmin) {
      console.log("🔍 [Organizations] Not superadmin - should show access denied");
    } else {
      console.log("🔍 [Organizations] ✅ User is superadmin - should show page");
    }
  }, [user, isSuperadmin, router]);

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
    <div className="min-h-screen p-4 md:p-6" style={{ background: "var(--background)" }}>
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            🏢 {t('admin.superadminPanel')}
          </h1>
          <p className="text-muted-foreground">
            {t('superadmin.organizations.subtitle')}
          </p>
        </div>

        {/* Tabs Interface */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {/* Tab List */}
          <TabsList className="grid w-full grid-cols-3 mb-6" style={{ background: "var(--background-subtle)", padding: "8px" }}>
            <TabsTrigger value="organizations" className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              <span className="hidden sm:inline">{t('superadmin.organizations.title')}</span>
              <span className="sm:hidden text-xs">(${organizations?.length || 0})</span>
            </TabsTrigger>
            <TabsTrigger value="announcements" className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              <span className="hidden sm:inline">{t('superadmin.announcements.title')}</span>
              <span className="sm:hidden text-xs">{t('superadmin.announcements.new')}</span>
            </TabsTrigger>
            <TabsTrigger value="maintenance" className="flex items-center gap-2">
              <Wrench className="w-4 h-4" />
              <span className="hidden sm:inline">{t('superadmin.maintenance.title')}</span>
              <span className="sm:hidden text-xs">{t('superadmin.maintenance.config')}</span>
            </TabsTrigger>
          </TabsList>

          {/* Tab Content - Organizations */}
          <TabsContent value="organizations" className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-4 rounded-lg border" style={{ background: "var(--background-subtle)" }}>
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="w-4 h-4 text-blue-500" />
                  <p className="text-xs text-muted-foreground">{t('superadmin.organizations.stats.totalOrgs')}</p>
                </div>
                <p className="text-2xl font-bold">{organizations?.length || 0}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('superadmin.organizations.stats.count')}</p>
              </div>
              <div className="p-4 rounded-lg border" style={{ background: "var(--background-subtle)" }}>
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <p className="text-xs text-muted-foreground">{t('superadmin.organizations.stats.active')}</p>
                </div>
                <p className="text-2xl font-bold text-green-500">
                  {organizations?.filter((o) => o.isActive).length || 0}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{t('superadmin.organizations.stats.working')}</p>
              </div>
              <div className="p-4 rounded-lg border" style={{ background: "var(--background-subtle)" }}>
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-orange-500" />
                  <p className="text-xs text-muted-foreground">{t('superadmin.organizations.stats.viewed')}</p>
                </div>
                <p className="text-2xl font-bold">
                  {organizations?.reduce((sum, o) => sum + (o.totalEmployees || 0), 0) || 0}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{t('superadmin.organizations.stats.total')}</p>
              </div>
              <div className="p-4 rounded-lg border" style={{ background: "var(--background-subtle)" }}>
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="w-4 h-4 text-red-500" />
                  <p className="text-xs text-muted-foreground">{t('superadmin.organizations.stats.inactive')}</p>
                </div>
                <p className="text-2xl font-bold text-red-500">
                  {organizations?.filter((o) => !o.isActive).length || 0}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{t('superadmin.organizations.stats.suspended')}</p>
              </div>
            </div>

            {/* Organizations List */}
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold mb-2" style={{ color: "var(--text-primary)" }}>
                  {t('superadmin.organizations.list.title')}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t('superadmin.organizations.list.description')}
                </p>
              </div>

              {organizations?.map((org) => (
                <div
                  key={org._id}
                  className="p-4 rounded-lg border hover:border-blue-400/50 transition-all hover:shadow-md"
                  style={{ background: "var(--card)" }}
                >
                  {/* Title Row */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold truncate" style={{ color: "var(--text-primary)" }}>
                        {org.name}
                      </h3>
                      <p className="text-xs text-muted-foreground font-mono mt-1">
                        {org.slug}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0 flex-wrap justify-end">
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold border ${getPlanBadgeColor(
                          org.plan
                        )}`}
                      >
                        {org.plan.toUpperCase()}
                      </span>
                      {org.isActive ? (
                        <span className="px-2 py-1 rounded text-xs font-semibold bg-green-500/10 text-green-500 border border-green-500/30">
                          {t('superadmin.organizations.card.statusActive')}
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded text-xs font-semibold bg-red-500/10 text-red-500 border border-red-500/30">
                          {t('superadmin.organizations.card.statusInactive')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3 pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">{t('superadmin.organizations.card.totalEmployees')}</p>
                      <p className="font-bold">{org.totalEmployees}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">{t('superadmin.organizations.card.activeEmployees')}</p>
                      <p className="font-bold text-green-500">{org.activeEmployees}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">{t('superadmin.organizations.card.employeeLimit')}</p>
                      <p className="font-bold">{org.employeeLimit}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">{t('superadmin.organizations.card.industry')}</p>
                      <p className="text-sm font-mono">{org.industry || "—"}</p>
                    </div>
                  </div>

                  {/* Admins & Actions */}
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex-1">
                      {org.adminNames && org.adminNames.length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                          {org.adminNames.map((name, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-1 rounded text-xs bg-blue-500/10 text-blue-500 border border-blue-500/30 whitespace-nowrap"
                            >
                              👤 {name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => router.push(`/superadmin/organizations/${org._id}/manage-admins`)}
                        className="p-2 rounded hover:bg-blue-500/10 text-blue-500 transition-colors"
                        title={t('superadmin.organizations.card.manageAdmins')}
                      >
                        <Shield className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => router.push(`/superadmin/organizations/${org._id}/edit`)}
                        className="p-2 rounded transition-colors"
                        style={{ color: "var(--text-primary)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--background-subtle)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        title={t('superadmin.organizations.card.edit')}
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {(!organizations || organizations.length === 0) && (
                <div className="text-center py-12 rounded-lg" style={{ background: "var(--background-subtle)" }}>
                  <Building2 className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-30" />
                  <h3 className="font-semibold text-lg mb-1" style={{ color: "var(--text-primary)" }}>
                    {t('superadmin.organizations.list.notFound')}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t('superadmin.organizations.list.empty')}
                  </p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Tab Content - Service Announcements */}
          <TabsContent value="announcements" className="space-y-6">
            <div className="rounded-xl border p-6" style={{ background: "var(--card)" }}>
              <SuperadminBroadcastsPanel 
                organizationId={user?.organizationId}
                userId={user?.id}
              />
            </div>
          </TabsContent>

          {/* Tab Content - Maintenance Mode */}
          <TabsContent value="maintenance" className="space-y-6">
            <div className="rounded-xl border p-6" style={{ background: "var(--card)" }}>
              <MaintenanceModeManager 
                organizationId={user?.organizationId}
                userId={user?.id}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
