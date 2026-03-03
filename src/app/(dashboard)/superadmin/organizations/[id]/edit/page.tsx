"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../../../convex/_generated/api";
import { useAuthStore } from "@/store/useAuthStore";
import { useRouter, useParams } from "next/navigation";
import { useState, useEffect } from "react"
import { useTranslation } from 'react-i18next';;
import { Building2, Save, ArrowLeft } from "lucide-react";
import { ShieldLoader } from "@/components/ui/ShieldLoader";
import { motion } from "framer-motion";
import { toast } from "sonner";

export default function EditOrganizationPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams();
  const { user } = useAuthStore();
  const orgId = params.id as string;
  const isSuperadmin = user?.role === "superadmin" || user?.email?.toLowerCase() === "romangulanyan@gmail.com";

  const organizations = useQuery(api.organizations.getAllOrganizations);

  const updateOrg = useMutation(api.organizations.updateOrganization);

  const [formData, setFormData] = useState({
    name: "",
    plan: "starter" as "starter" | "professional" | "enterprise",
    isActive: true,
    timezone: "UTC",
    country: "",
    industry: "",
  });

  const [isLoading, setIsLoading] = useState(false);
  const organization = organizations?.find((org) => org._id === orgId);

  useEffect(() => {
    if (organization) {
      setFormData({
        name: organization.name,
        plan: organization.plan,
        isActive: organization.isActive,
        timezone: organization.timezone || "UTC",
        country: organization.country || "",
        industry: organization.industry || "",
      });
    }
  }, [organization]);

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

  if (!organization) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Organization Not Found</h1>
          <p className="text-muted-foreground">The organization you're looking for doesn't exist</p>
          <button
            onClick={() => router.push("/superadmin/organizations")}
            className="mt-4 px-4 py-2 rounded-lg bg-primary text-white"
          >
            {t('ui.backToOrganizations')}
          </button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await updateOrg({
        superadminUserId: user.id as any,
        organizationId: orgId as any,
        name: formData.name,
        plan: formData.plan,
        isActive: formData.isActive,
        timezone: formData.timezone,
        country: formData.country || undefined,
        industry: formData.industry || undefined,
      });

      toast.success("Organization updated successfully!");
      router.push("/superadmin/organizations");
    } catch (error) {
      console.error("Failed to update organization:", error);
      toast.error(error instanceof Error ? error.message : "Failed to update organization");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--background)" }}>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push("/superadmin/organizations")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('ui.backToOrganizations')}
          </button>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>
                Edit Organization
              </h1>
              <p className="text-sm text-muted-foreground">
                Slug: <span className="font-mono">{organization.slug}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleSubmit}
          className="p-6 rounded-xl border space-y-6"
          style={{ background: "var(--card)" }}
        >
          {/* Organization Name */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
              Organization Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2.5 rounded-lg border outline-none transition-all"
              style={{
                background: "var(--input)",
                borderColor: "var(--border)",
                color: "var(--text-primary)",
              }}
              placeholder={t('placeholders.auraMedicalCenter')}
            />
          </div>

          {/* Plan */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
              Plan *
            </label>
            <select
              required
              value={formData.plan}
              onChange={(e) => setFormData({ ...formData, plan: e.target.value as any })}
              className="w-full px-4 py-2.5 rounded-lg border outline-none transition-all"
              style={{
                background: "var(--input)",
                borderColor: "var(--border)",
                color: "var(--text-primary)",
              }}
            >
              <option value="starter">Starter (10 employees)</option>
              <option value="professional">Professional (50 employees)</option>
              <option value="enterprise">Enterprise (100+)</option>
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <div>
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  Organization is active
                </span>
                <p className="text-xs text-muted-foreground">
                  Inactive organizations cannot be accessed by users
                </p>
              </div>
            </label>
          </div>

          {/* Timezone */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
              Timezone
            </label>
            <select
              value={formData.timezone}
              onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
              className="w-full px-4 py-2.5 rounded-lg border outline-none transition-all"
              style={{
                background: "var(--input)",
                borderColor: "var(--border)",
                color: "var(--text-primary)",
              }}
            >
              <option value="UTC">UTC</option>
              <option value="America/New_York">Eastern Time (ET)</option>
              <option value="America/Chicago">Central Time (CT)</option>
              <option value="America/Denver">Mountain Time (MT)</option>
              <option value="America/Los_Angeles">Pacific Time (PT)</option>
              <option value="Europe/London">London (GMT)</option>
              <option value="Europe/Paris">Paris (CET)</option>
              <option value="Asia/Dubai">Dubai (GST)</option>
              <option value="Asia/Tokyo">Tokyo (JST)</option>
              <option value="Australia/Sydney">Sydney (AEST)</option>
            </select>
          </div>

          {/* Country */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
              Country
            </label>
            <input
              type="text"
              value={formData.country}
              onChange={(e) => setFormData({ ...formData, country: e.target.value })}
              className="w-full px-4 py-2.5 rounded-lg border outline-none transition-all"
              style={{
                background: "var(--input)",
                borderColor: "var(--border)",
                color: "var(--text-primary)",
              }}
              placeholder={t('placeholders.unitedStates')}
            />
          </div>

          {/* Industry */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
              Industry
            </label>
            <input
              type="text"
              value={formData.industry}
              onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
              className="w-full px-4 py-2.5 rounded-lg border outline-none transition-all"
              style={{
                background: "var(--input)",
                borderColor: "var(--border)",
                color: "var(--text-primary)",
              }}
              placeholder={t('placeholders.healthcareTechnology')}
            />
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/30">
            <div>
              <p className="text-xs text-muted-foreground">{t('organization.totalEmployees')}</p>
              <p className="text-lg font-semibold">{organization.totalEmployees || 0}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('organization.activeEmployees')}</p>
              <p className="text-lg font-semibold text-green-600">{organization.activeEmployees || 0}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => router.push("/superadmin/organizations")}
              className="flex-1 px-6 py-2.5 rounded-lg border font-semibold transition-all hover:bg-muted"
              style={{ borderColor: "var(--border)" }}
            >{t('common.cancel')}</button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 px-6 py-2.5 rounded-lg font-semibold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #2563eb, #0ea5e9)" }}
            >
              {isLoading ? (
                <>
                  <ShieldLoader size="xs" variant="inline" />
                  {t('buttons.saving')}
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {t('buttons.saveChanges')}
                </>
              )}
            </button>
          </div>
        </motion.form>
      </div>
    </div>
  );
}
