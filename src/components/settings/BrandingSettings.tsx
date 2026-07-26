'use client';

import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/useAuthStore';
import { Palette, Globe, Image, Eye, Save, RotateCcw, Upload, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

type BrandingSettings = {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  iconUrl: string | null;
  faviconUrl: string | null;
  customDomain: string | null;
  brandName: string | null;
  enableWhiteLabel: boolean;
  hidePoweredBy: boolean;
  customCss: string | null;
};

const DEFAULT_BRANDING: BrandingSettings = {
  primaryColor: '#2563eb',
  secondaryColor: '#059669',
  accentColor: '#8b5cf6',
  logoUrl: null,
  iconUrl: null,
  faviconUrl: null,
  customDomain: null,
  brandName: null,
  enableWhiteLabel: false,
  hidePoweredBy: false,
  customCss: null,
};

export default function BrandingSettingsPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<BrandingSettings>(DEFAULT_BRANDING);
  const [previewMode, setPreviewMode] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  const userRole = user?.role;
  const isAdmin = userRole === 'admin' || userRole === 'superadmin';

  // Save branding settings to local storage (Convex mutation for org branding pending schema update)
  const handleSave = async () => {
    if (!user?.organizationId) return;
    setSaving(true);
    try {
      localStorage.setItem(`branding-${user.organizationId}`, JSON.stringify(settings));
      toast.success(t('settings.saved'));
    } catch {
      toast.error(t('settings.failedToSave'));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSettings(DEFAULT_BRANDING);
    toast.success(t('settings.resetToDefault'));
  };

  if (!isAdmin) {
    return (
      <Card className="p-8 border border-(--border) bg-(--card) text-center">
        <Building2 className="w-12 h-12 mx-auto mb-4 text-(--text-muted)" />
        <h3 className="text-lg font-semibold text-(--text-primary) mb-2">
          {t('branding.adminOnly', 'Admin Access Required')}
        </h3>
        <p className="text-sm text-(--text-muted)">
          {t(
            'branding.adminOnlyDesc',
            'Only organization administrators can modify branding settings.',
          )}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
            <Palette className="w-6 h-6 text-purple-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-(--text-primary)">
              {t('branding.title', 'Branding & White-Label')}
            </h2>
            <p className="text-sm text-(--text-muted)">
              {t(
                'branding.subtitle',
                "Customize the look and feel of your organization's workspace",
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5">
            <RotateCcw className="w-3.5 h-3.5" />
            {t('branding.reset', 'Reset')}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </div>

      {/* White-label toggle */}
      <Card className="p-5 border border-(--border) bg-(--card)">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-(--text-primary) flex items-center gap-2">
              <Globe className="w-4 h-4 text-purple-500" />
              {t('branding.whiteLabel', 'White-Label Mode')}
            </h3>
            <p className="text-sm text-(--text-muted) mt-1">
              {t(
                'branding.whiteLabelDesc',
                'Remove Strata branding and use your own company identity throughout the platform',
              )}
            </p>
          </div>
          <Switch
            checked={settings.enableWhiteLabel}
            onCheckedChange={(checked) =>
              setSettings((prev) => ({ ...prev, enableWhiteLabel: checked }))
            }
          />
        </div>
      </Card>

      {/* Brand identity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Logo upload */}
        <Card className="p-5 border border-(--border) bg-(--card)">
          <h3 className="font-semibold text-(--text-primary) mb-4 flex items-center gap-2">
            <Image className="w-4 h-4 text-purple-500" />
            {t('branding.logo', 'Logo & Icon')}
          </h3>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-(--text-primary) block mb-2">
                {t('branding.brandName', 'Brand Name')}
              </label>
              <Input
                value={settings.brandName || ''}
                onChange={(e) => setSettings((prev) => ({ ...prev, brandName: e.target.value }))}
                placeholder={t('branding.brandNamePlaceholder', 'Enter your company name')}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-(--text-primary) block mb-2">
                {t('branding.logoUpload', 'Logo')}
              </label>
              <div
                className="flex items-center justify-center h-32 rounded-lg border-2 border-dashed border-(--border) hover:border-purple-500/50 transition-colors cursor-pointer bg-(--background-subtle)"
                onClick={() => logoInputRef.current?.click()}
              >
                {settings.logoUrl ? (
                  <img
                    src={settings.logoUrl}
                    alt="Logo"
                    className="max-h-24 max-w-48 object-contain"
                  />
                ) : (
                  <div className="text-center">
                    <Upload className="w-8 h-8 mx-auto mb-2 text-(--text-muted)" />
                    <p className="text-xs text-(--text-muted)">
                      {t('branding.clickToUpload', 'Click to upload logo')}
                    </p>
                  </div>
                )}
              </div>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const url = URL.createObjectURL(file);
                    setSettings((prev) => ({ ...prev, logoUrl: url }));
                  }
                }}
              />
            </div>
          </div>
        </Card>

        {/* Colors */}
        <Card className="p-5 border border-(--border) bg-(--card)">
          <h3 className="font-semibold text-(--text-primary) mb-4 flex items-center gap-2">
            <Palette className="w-4 h-4 text-purple-500" />
            {t('branding.colors', 'Brand Colors')}
          </h3>
          <div className="space-y-4">
            {[
              {
                key: 'primaryColor' as const,
                label: t('branding.primaryColor', 'Primary'),
                defaultColor: '#2563eb',
              },
              {
                key: 'secondaryColor' as const,
                label: t('branding.secondaryColor', 'Secondary'),
                defaultColor: '#059669',
              },
              {
                key: 'accentColor' as const,
                label: t('branding.accentColor', 'Accent'),
                defaultColor: '#8b5cf6',
              },
            ].map(({ key, label, defaultColor }) => (
              <div key={key} className="flex items-center gap-4">
                <div className="relative">
                  <input
                    type="color"
                    value={settings[key]}
                    onChange={(e) => setSettings((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="w-10 h-10 rounded-lg border border-(--border) cursor-pointer bg-transparent"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-sm font-medium text-(--text-primary) block">{label}</label>
                  <p className="text-xs text-(--text-muted) font-mono">{settings[key]}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setSettings((prev) => ({ ...prev, [key]: defaultColor }))}
                >
                  {t('common.reset', 'Reset')}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Advanced */}
      <Card className="p-5 border border-(--border) bg-(--card)">
        <h3 className="font-semibold text-(--text-primary) mb-4 flex items-center gap-2">
          <Globe className="w-4 h-4 text-purple-500" />
          {t('branding.advanced', 'Advanced Settings')}
        </h3>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-(--text-primary) block mb-2">
              {t('branding.customDomain', 'Custom Domain')}
            </label>
            <div className="flex items-center gap-2">
              <Input
                value={settings.customDomain || ''}
                onChange={(e) => setSettings((prev) => ({ ...prev, customDomain: e.target.value }))}
                placeholder={t('branding.customDomainPlaceholder', 'app.yourcompany.com')}
                className="flex-1"
              />
              <Badge variant="outline" className="text-[10px]">
                {t('common.comingSoon', 'Coming Soon')}
              </Badge>
            </div>
            <p className="text-xs text-(--text-muted) mt-1">
              {t(
                'branding.customDomainDesc',
                'Point your domain to our servers for a fully branded experience',
              )}
            </p>
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg bg-(--background-subtle) border border-(--border)">
            <div>
              <p className="text-sm font-medium text-(--text-primary)">
                {t('branding.hidePoweredBy', 'Hide "Powered by Strata"')}
              </p>
              <p className="text-xs text-(--text-muted) mt-0.5">
                {t(
                  'branding.hidePoweredByDesc',
                  'Remove Strata branding from login page, emails, and footer',
                )}
              </p>
            </div>
            <Switch
              checked={settings.hidePoweredBy}
              onCheckedChange={(checked) =>
                setSettings((prev) => ({ ...prev, hidePoweredBy: checked }))
              }
              disabled={!settings.enableWhiteLabel}
            />
          </div>
        </div>
      </Card>

      {/* Preview */}
      <Card className="p-5 border border-(--border) bg-(--card)">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-(--text-primary) flex items-center gap-2">
            <Eye className="w-4 h-4 text-purple-500" />
            {t('branding.livePreview', 'Live Preview')}
          </h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPreviewMode(!previewMode)}
            className="gap-1.5"
          >
            <Eye className="w-3.5 h-3.5" />
            {previewMode ? t('common.hide', 'Hide') : t('common.show', 'Show')}{' '}
            {t('branding.preview', 'Preview')}
          </Button>
        </div>
        {previewMode && (
          <div
            className="rounded-xl p-6 border"
            style={{
              backgroundColor: '#ffffff',
              borderColor: '#e5e7eb',
            }}
          >
            {/* Preview navbar */}
            <div
              className="flex items-center justify-between px-4 py-3 rounded-lg mb-4"
              style={{ backgroundColor: settings.primaryColor }}
            >
              <div className="flex items-center gap-2">
                {settings.logoUrl ? (
                  <img src={settings.logoUrl} alt="" className="h-8 w-8 rounded" />
                ) : (
                  <div
                    className="w-8 h-8 rounded flex items-center justify-center text-white text-xs font-bold"
                    style={{ backgroundColor: settings.secondaryColor }}
                  >
                    {settings.brandName?.[0] || 'S'}
                  </div>
                )}
                <span className="text-white font-semibold text-sm">
                  {settings.brandName || t('branding.yourCompany', 'Your Company')}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-white/70 text-xs">
                  {t('branding.previewNav', 'Dashboard')}
                </span>
                <span className="text-white/70 text-xs">{t('branding.previewNav2', 'Team')}</span>
                <span
                  className="px-3 py-1 rounded text-xs font-medium text-white"
                  style={{ backgroundColor: settings.secondaryColor }}
                >
                  {t('branding.previewCta', 'Get Started')}
                </span>
              </div>
            </div>

            {/* Preview content */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: settings.primaryColor }}
                />
                <div
                  className="h-4 rounded flex-1 max-w-[200px]"
                  style={{ backgroundColor: settings.primaryColor, opacity: 0.3 }}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-20 rounded-lg"
                    style={{
                      backgroundColor: settings.primaryColor,
                      opacity: 0.08,
                      border: `1px solid ${settings.primaryColor}20`,
                    }}
                  />
                ))}
              </div>
              <div
                className="h-1 rounded-full w-3/4"
                style={{ backgroundColor: settings.primaryColor, opacity: 0.15 }}
              />
              <div className="flex gap-2">
                <div
                  className="px-4 py-2 rounded-lg text-xs font-medium text-white"
                  style={{ backgroundColor: settings.primaryColor }}
                >
                  {t('branding.previewButton', 'Primary Action')}
                </div>
                <div
                  className="px-4 py-2 rounded-lg text-xs font-medium text-white"
                  style={{ backgroundColor: settings.secondaryColor }}
                >
                  {t('branding.previewButton2', 'Secondary Action')}
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
