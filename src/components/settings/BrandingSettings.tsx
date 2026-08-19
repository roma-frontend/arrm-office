'use client';
import Image from 'next/image';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/useAuthStore';
import {
  Palette,
  Globe,
  Image as ImageIcon,
  Eye,
  EyeOff,
  Save,
  RotateCcw,
  Upload,
  Building2,
  Loader2,
  AlertTriangle,
  X,
  LayoutDashboard,
  Users,
  Calendar,
  CheckSquare,
  Bell,
  Sparkles,
  Type,
  Code,
  Moon,
  Sun,
  Check,
  AlertCircle,
} from 'lucide-react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { useBrandingPreview } from '@/context/BrandingPreviewContext';
import { BRAND_PRESETS, type BrandPreset } from '@/lib/brandPresets';

type BrandingSettings = {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  primaryColorDark: string;
  secondaryColorDark: string;
  accentColorDark: string;
  headingFont: string;
  bodyFont: string;
  customCss: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  brandName: string | null;
  enableWhiteLabel: boolean;
  hidePoweredBy: boolean;
};

const DEFAULT_BRANDING: BrandingSettings = {
  primaryColor: '#1e3a5f',
  secondaryColor: '#0d7377',
  accentColor: '#c2410c',
  primaryColorDark: '#93b4fd',
  secondaryColorDark: '#2dd4bf',
  accentColorDark: '#fb923c',
  headingFont: 'Inter',
  bodyFont: 'Inter',
  customCss: '',
  logoUrl: null,
  faviconUrl: null,
  brandName: null,
  enableWhiteLabel: false,
  hidePoweredBy: false,
};

const FONT_OPTIONS = [
  'Inter',
  'Plus Jakarta Sans',
  'DM Sans',
  'Nunito Sans',
  'Space Grotesk',
  'Manrope',
  'Outfit',
  'Sora',
  'IBM Plex Sans',
  'Source Sans 3',
  'Playfair Display',
  'Fraunces',
  'JetBrains Mono',
];

/** Calculate relative luminance for WCAG contrast. */
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/** WCAG contrast ratio between two hex colors. */
function contrastRatio(a: string, b: string): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Check if white text on a bg is readable. */
function wcagGrade(bgColor: string): 'AAA' | 'AA' | 'FAIL' {
  const ratio = contrastRatio(bgColor, '#ffffff');
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  return 'FAIL';
}

/** Derive lighter shade for backgrounds. */
function lighten(hex: string, factor = 0.9): string {
  const h = hex.replace('#', '');
  const r = Math.round(parseInt(h.slice(0, 2), 16) * factor + 255 * (1 - factor));
  const g = Math.round(parseInt(h.slice(2, 4), 16) * factor + 255 * (1 - factor));
  const b = Math.round(parseInt(h.slice(4, 6), 16) * factor + 255 * (1 - factor));
  return `rgb(${r}, ${g}, ${b})`;
}

export default function BrandingSettingsPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<BrandingSettings>(DEFAULT_BRANDING);
  const [loaded, setLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<'presets' | 'colors' | 'typography' | 'advanced'>(
    'presets',
  );
  const logoInputRef = useRef<HTMLInputElement>(null);
  const { previewMode, setPreviewMode, setPreviewValues, clearPreview } = useBrandingPreview();

  const userRole = user?.role;
  const isAdmin = userRole === 'admin' || userRole === 'superadmin';

  const saveBranding = useMutation(api.branding.saveBranding);
  const resetBranding = useMutation(api.branding.resetBranding);
  const branding = useQuery(api.branding.getBranding, isAdmin ? {} : 'skip');

  // Hydrate form from Convex once the query resolves.
  useEffect(() => {
    if (branding === undefined) return;
    setLoaded(true);
    if (branding) {
      setSettings({
        primaryColor: branding.primaryColor,
        secondaryColor: branding.secondaryColor,
        accentColor: branding.accentColor,
        primaryColorDark: branding.primaryColorDark ?? DEFAULT_BRANDING.primaryColorDark,
        secondaryColorDark: branding.secondaryColorDark ?? DEFAULT_BRANDING.secondaryColorDark,
        accentColorDark: branding.accentColorDark ?? DEFAULT_BRANDING.accentColorDark,
        headingFont: branding.headingFont ?? DEFAULT_BRANDING.headingFont,
        bodyFont: branding.bodyFont ?? DEFAULT_BRANDING.bodyFont,
        customCss: branding.customCss ?? '',
        logoUrl: branding.logoUrl ?? null,
        faviconUrl: branding.faviconUrl ?? null,
        brandName: branding.brandName ?? null,
        enableWhiteLabel: branding.enableWhiteLabel,
        hidePoweredBy: branding.hidePoweredBy,
      });
    } else {
      setSettings(DEFAULT_BRANDING);
    }
  }, [branding]);

  const pushPreview = useCallback(
    (s: BrandingSettings) => {
      setPreviewValues({
        primaryColor: s.primaryColor,
        secondaryColor: s.secondaryColor,
        accentColor: s.accentColor,
        primaryColorDark: s.primaryColorDark,
        secondaryColorDark: s.secondaryColorDark,
        accentColorDark: s.accentColorDark,
        headingFont: s.headingFont,
        bodyFont: s.bodyFont,
        customCss: s.customCss,
        logoUrl: s.logoUrl,
        faviconUrl: s.faviconUrl,
        brandName: s.brandName,
        enableWhiteLabel: s.enableWhiteLabel,
        hidePoweredBy: s.hidePoweredBy,
      });
    },
    [setPreviewValues],
  );

  const handleTogglePreview = useCallback(() => {
    if (previewMode) {
      clearPreview();
    } else {
      setPreviewMode(true);
      pushPreview(settings);
    }
  }, [previewMode, clearPreview, setPreviewMode, pushPreview, settings]);

  useEffect(() => {
    if (previewMode) pushPreview(settings);
  }, [settings, previewMode, pushPreview]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveBranding({
        primaryColor: settings.primaryColor,
        secondaryColor: settings.secondaryColor,
        accentColor: settings.accentColor,
        primaryColorDark: settings.primaryColorDark,
        secondaryColorDark: settings.secondaryColorDark,
        accentColorDark: settings.accentColorDark,
        headingFont: settings.headingFont,
        bodyFont: settings.bodyFont,
        customCss: settings.customCss || undefined,
        logoUrl: settings.logoUrl ?? undefined,
        faviconUrl: settings.faviconUrl ?? undefined,
        brandName: settings.brandName ?? undefined,
        enableWhiteLabel: settings.enableWhiteLabel,
        hidePoweredBy: settings.hidePoweredBy,
      });
      toast.success(t('settings.saved'));
      clearPreview();
    } catch {
      toast.error(t('settings.failedToSave'));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    try {
      await resetBranding();
      setSettings(DEFAULT_BRANDING);
      clearPreview();
      toast.success(t('settings.resetToDefault'));
    } catch {
      toast.error(t('settings.failedToSave'));
    }
  };

  const handleApplyPreset = (preset: BrandPreset) => {
    setSettings((prev) => ({
      ...prev,
      primaryColor: preset.primaryColor,
      secondaryColor: preset.secondaryColor,
      accentColor: preset.accentColor,
      primaryColorDark: preset.primaryColorDark,
      secondaryColorDark: preset.secondaryColorDark,
      accentColorDark: preset.accentColorDark,
      headingFont: preset.headingFont,
      bodyFont: preset.bodyFont,
    }));
    toast.success(t('branding.presetApplied', `Preset "${preset.name}" applied`));
  };

  useEffect(() => {
    return () => clearPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const grade = wcagGrade(settings.primaryColor);
  const gradeSecondary = wcagGrade(settings.secondaryColor);
  const gradeAccent = wcagGrade(settings.accentColor);

  const tabs = [
    { id: 'presets' as const, label: t('branding.tabPresets', 'Presets'), icon: Sparkles },
    { id: 'colors' as const, label: t('branding.tabColors', 'Colors'), icon: Palette },
    { id: 'typography' as const, label: t('branding.tabTypography', 'Typography'), icon: Type },
    { id: 'advanced' as const, label: t('branding.tabAdvanced', 'Advanced'), icon: Code },
  ];

  return (
    <div className="space-y-6">
      {/* ── Floating preview banner ──────────────────────────────────────── */}
      {previewMode && (
        <div className="sticky top-0 z-50 flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 shadow-lg dark:border-amber-700 dark:bg-amber-950">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
              {t('branding.previewActive', 'Preview Mode Active')}
            </span>
            <span className="text-xs text-amber-600 dark:text-amber-400">
              — {t('branding.previewHint', 'Changes are visible app-wide but not saved yet')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="gap-1.5"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              {saving ? t('common.saving') : t('branding.savePreview', 'Save & Apply')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => clearPreview()} className="gap-1.5">
              <X className="w-3.5 h-3.5" />
              {t('branding.exitPreview', 'Exit Preview')}
            </Button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-(--purple-quiet) border border-(--purple-outline)">
            <Palette className="w-6 h-6 text-(--purple-text)" />
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
          <Button
            variant={previewMode ? 'default' : 'outline'}
            size="sm"
            onClick={handleTogglePreview}
            className="gap-1.5"
          >
            {previewMode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {previewMode
              ? t('branding.exitPreview', 'Exit Preview')
              : t('branding.previewButton', 'Preview')}
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5">
            <RotateCcw className="w-3.5 h-3.5" />
            {t('branding.reset', 'Reset')}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={saving || !loaded}
            className="gap-1.5"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </div>

      {/* ── Tab navigation ──────────────────────────────────────────────── */}
      <div className="flex gap-1 rounded-xl bg-(--background-subtle) p-1 border border-(--border)">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === id
                ? 'bg-(--card) text-(--text-primary) shadow-sm border border-(--border)'
                : 'text-(--text-muted) hover:text-(--text-primary)'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: PRESETS
          ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'presets' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {BRAND_PRESETS.map((preset) => {
            const isActive =
              settings.primaryColor === preset.primaryColor &&
              settings.secondaryColor === preset.secondaryColor &&
              settings.accentColor === preset.accentColor;
            return (
              <button
                key={preset.id}
                onClick={() => handleApplyPreset(preset)}
                className={`relative text-left rounded-xl border-2 p-4 transition-all hover:shadow-md ${
                  isActive
                    ? 'border-(--primary) bg-(--primary)/5 shadow-md'
                    : 'border-(--border) bg-(--card) hover:border-(--primary)/50'
                }`}
              >
                {isActive && (
                  <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-(--primary) flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{preset.emoji}</span>
                  <span className="font-semibold text-sm text-(--text-primary)">{preset.name}</span>
                </div>
                <p className="text-xs text-(--text-muted) mb-3">{preset.description}</p>
                <div className="flex gap-1.5">
                  <div
                    className="w-6 h-6 rounded-full border border-black/10"
                    style={{ backgroundColor: preset.primaryColor }}
                  />
                  <div
                    className="w-6 h-6 rounded-full border border-black/10"
                    style={{ backgroundColor: preset.secondaryColor }}
                  />
                  <div
                    className="w-6 h-6 rounded-full border border-black/10"
                    style={{ backgroundColor: preset.accentColor }}
                  />
                  <span className="text-[10px] text-(--text-muted) ml-auto self-center">
                    {preset.headingFont}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: COLORS
          ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'colors' && (
        <div className="space-y-6">
          {/* White-label toggle */}
          <Card className="p-5 border border-(--border) bg-(--card)">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-(--text-primary) flex items-center gap-2">
                  <Globe className="w-4 h-4 text-(--purple-text)" />
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Logo */}
            <Card className="p-5 border border-(--border) bg-(--card)">
              <h3 className="font-semibold text-(--text-primary) mb-4 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-(--purple-text)" />
                {t('branding.logo', 'Logo & Icon')}
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-(--text-primary) block mb-2">
                    {t('branding.brandName', 'Brand Name')}
                  </label>
                  <Input
                    value={settings.brandName || ''}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, brandName: e.target.value }))
                    }
                    placeholder={t('branding.brandNamePlaceholder', 'Enter your company name')}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-(--text-primary) block mb-2">
                    {t('branding.logoUpload', 'Logo')}
                  </label>
                  <div
                    className="flex items-center justify-center h-32 rounded-lg border-2 border-dashed border-(--border) hover:border-(--purple-outline) transition-colors cursor-pointer bg-(--background-subtle)"
                    onClick={() => logoInputRef.current?.click()}
                  >
                    {settings.logoUrl ? (
                      <Image
                        src={settings.logoUrl}
                        alt="Logo"
                        width={192}
                        height={96}
                        unoptimized
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
                        setSettings((prev) => ({ ...prev, logoUrl: URL.createObjectURL(file) }));
                      }
                    }}
                  />
                </div>
              </div>
            </Card>

            {/* Light theme colors */}
            <Card className="p-5 border border-(--border) bg-(--card)">
              <h3 className="font-semibold text-(--text-primary) mb-4 flex items-center gap-2">
                <Sun className="w-4 h-4 text-(--purple-text)" />
                {t('branding.lightColors', 'Light Theme Colors')}
              </h3>
              <div className="space-y-4">
                {[
                  {
                    key: 'primaryColor' as const,
                    label: t('branding.primaryColor', 'Primary'),
                    grade,
                  },
                  {
                    key: 'secondaryColor' as const,
                    label: t('branding.secondaryColor', 'Secondary'),
                    grade: gradeSecondary,
                  },
                  {
                    key: 'accentColor' as const,
                    label: t('branding.accentColor', 'Accent'),
                    grade: gradeAccent,
                  },
                ].map(({ key, label, grade: g }) => (
                  <div key={key} className="flex items-center gap-4">
                    <input
                      type="color"
                      value={settings[key]}
                      onChange={(e) => setSettings((prev) => ({ ...prev, [key]: e.target.value }))}
                      className="w-10 h-10 rounded-lg border border-(--border) cursor-pointer bg-transparent"
                    />
                    <div className="flex-1">
                      <label className="text-sm font-medium text-(--text-primary) block">
                        {label}
                      </label>
                      <p className="text-xs text-(--text-muted) font-mono">{settings[key]}</p>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${g === 'AAA' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : g === 'AA' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'}`}
                    >
                      {g}
                    </span>
                  </div>
                ))}
                {(grade === 'FAIL' || gradeSecondary === 'FAIL' || gradeAccent === 'FAIL') && (
                  <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 rounded-lg p-2">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {t(
                      'branding.contrastWarning',
                      'Some colors may have poor contrast with white text. Consider adjusting.',
                    )}
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Dark theme colors */}
          <Card className="p-5 border border-(--border) bg-(--card)">
            <h3 className="font-semibold text-(--text-primary) mb-4 flex items-center gap-2">
              <Moon className="w-4 h-4 text-(--purple-text)" />
              {t('branding.darkColors', 'Dark Theme Colors')}
            </h3>
            <p className="text-xs text-(--text-muted) mb-4">
              {t(
                'branding.darkColorsDesc',
                'Override colors for dark mode. These are used when the user has dark theme enabled.',
              )}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { key: 'primaryColorDark' as const, label: t('branding.primaryColor', 'Primary') },
                {
                  key: 'secondaryColorDark' as const,
                  label: t('branding.secondaryColor', 'Secondary'),
                },
                { key: 'accentColorDark' as const, label: t('branding.accentColor', 'Accent') },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center gap-3">
                  <input
                    type="color"
                    value={settings[key]}
                    onChange={(e) => setSettings((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="w-10 h-10 rounded-lg border border-(--border) cursor-pointer bg-transparent"
                  />
                  <div>
                    <label className="text-sm font-medium text-(--text-primary) block">
                      {label}
                    </label>
                    <p className="text-xs text-(--text-muted) font-mono">{settings[key]}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: TYPOGRAPHY
          ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'typography' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-5 border border-(--border) bg-(--card)">
            <h3 className="font-semibold text-(--text-primary) mb-4 flex items-center gap-2">
              <Type className="w-4 h-4 text-(--purple-text)" />
              {t('branding.headingFont', 'Heading Font')}
            </h3>
            <div className="space-y-3">
              <select
                value={settings.headingFont}
                onChange={(e) => setSettings((prev) => ({ ...prev, headingFont: e.target.value }))}
                className="w-full rounded-lg border border-(--border) bg-(--card) px-3 py-2 text-sm text-(--text-primary)"
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <div className="rounded-lg bg-(--background-subtle) p-4 border border-(--border)">
                <p
                  style={{ fontFamily: settings.headingFont }}
                  className="text-2xl font-bold text-(--text-primary)"
                >
                  Aa
                </p>
                <p
                  style={{ fontFamily: settings.headingFont }}
                  className="text-sm text-(--text-muted) mt-1"
                >
                  The quick brown fox jumps over the lazy dog
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-5 border border-(--border) bg-(--card)">
            <h3 className="font-semibold text-(--text-primary) mb-4 flex items-center gap-2">
              <Type className="w-4 h-4 text-(--purple-text)" />
              {t('branding.bodyFont', 'Body Font')}
            </h3>
            <div className="space-y-3">
              <select
                value={settings.bodyFont}
                onChange={(e) => setSettings((prev) => ({ ...prev, bodyFont: e.target.value }))}
                className="w-full rounded-lg border border-(--border) bg-(--card) px-3 py-2 text-sm text-(--text-primary)"
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <div className="rounded-lg bg-(--background-subtle) p-4 border border-(--border)">
                <p
                  style={{ fontFamily: settings.bodyFont }}
                  className="text-base text-(--text-primary)"
                >
                  The quick brown fox jumps over the lazy dog
                </p>
                <p
                  style={{ fontFamily: settings.bodyFont }}
                  className="text-sm text-(--text-muted) mt-1"
                >
                  0123456789 !@#$%^&*()
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: ADVANCED
          ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'advanced' && (
        <div className="space-y-6">
          <Card className="p-5 border border-(--border) bg-(--card)">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-(--text-primary) flex items-center gap-2">
                <Globe className="w-4 h-4 text-(--purple-text)" />
                {t('branding.hidePoweredBy', 'Hide "Powered by Strata"')}
              </h3>
              <Switch
                checked={settings.hidePoweredBy}
                onCheckedChange={(checked) =>
                  setSettings((prev) => ({ ...prev, hidePoweredBy: checked }))
                }
                disabled={!settings.enableWhiteLabel}
              />
            </div>
            <p className="text-xs text-(--text-muted)">
              {t(
                'branding.hidePoweredByDesc',
                'Remove Strata branding from login page, emails, and footer',
              )}
            </p>
          </Card>

          <Card className="p-5 border border-(--border) bg-(--card)">
            <h3 className="font-semibold text-(--text-primary) mb-2 flex items-center gap-2">
              <Code className="w-4 h-4 text-(--purple-text)" />
              {t('branding.customCss', 'Custom CSS')}
            </h3>
            <p className="text-xs text-(--text-muted) mb-4">
              {t(
                'branding.customCssDesc',
                'Inject custom CSS for advanced styling. Changes apply after save.',
              )}
            </p>
            <textarea
              value={settings.customCss}
              onChange={(e) => setSettings((prev) => ({ ...prev, customCss: e.target.value }))}
              placeholder={`/* Example */\n.btn-gradient {\n  border-radius: 12px !important;\n}`}
              className="w-full h-40 rounded-lg border border-(--border) bg-(--background-subtle) p-3 font-mono text-xs text-(--text-primary) resize-y focus:outline-none focus:ring-2 focus:ring-(--ring)"
              spellCheck={false}
            />
          </Card>
        </div>
      )}

      {/* ── Live preview panel ─────────────────────────────────────────── */}
      <Card className="overflow-hidden border border-(--border) bg-(--card)">
        <div className="flex items-center justify-between px-5 py-4 border-b border-(--border)">
          <h3 className="font-semibold text-(--text-primary) flex items-center gap-2">
            <Eye className="w-4 h-4 text-(--purple-text)" />
            {t('branding.livePreview', 'Live Preview')}
          </h3>
          {previewMode && (
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 px-2 py-1 rounded-md border border-amber-200 dark:border-amber-800">
              {t('branding.previewModeTag', 'LIVE — app-wide override active')}
            </span>
          )}
        </div>
        <div className="flex h-72 bg-[#f8fafc] dark:bg-[#0f172a]">
          {/* Mini sidebar */}
          <div
            className="w-44 shrink-0 flex flex-col py-3 px-2 text-white text-xs"
            style={{ backgroundColor: settings.primaryColor }}
          >
            <div className="flex items-center gap-2 px-2 mb-4">
              {settings.logoUrl ? (
                <Image
                  src={settings.logoUrl}
                  alt=""
                  width={24}
                  height={24}
                  unoptimized
                  className="h-6 w-6 rounded object-contain bg-white/20"
                />
              ) : (
                <div
                  className="h-6 w-6 rounded flex items-center justify-center text-[10px] font-bold"
                  style={{ backgroundColor: settings.secondaryColor }}
                >
                  {settings.brandName?.[0] || 'S'}
                </div>
              )}
              <span className="font-semibold truncate" style={{ fontFamily: settings.headingFont }}>
                {settings.brandName || 'Shield HR'}
              </span>
            </div>
            <nav className="space-y-0.5 flex-1">
              {[
                { icon: LayoutDashboard, label: t('branding.previewNav1', 'Dashboard') },
                { icon: Users, label: t('branding.previewNav2', 'People') },
                { icon: Calendar, label: t('branding.previewNav3', 'Calendar') },
                { icon: CheckSquare, label: t('branding.previewNav4', 'Tasks') },
                { icon: Bell, label: t('branding.previewNav5', 'Notifications') },
              ].map(({ icon: Icon, label }, i) => (
                <div
                  key={label}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md ${i === 0 ? 'bg-white/15 font-medium' : 'text-white/70 hover:bg-white/10'}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span style={{ fontFamily: settings.bodyFont }}>{label}</span>
                </div>
              ))}
            </nav>
            {!settings.enableWhiteLabel || !settings.hidePoweredBy ? (
              <div className="px-2 pt-2 border-t border-white/10 text-[9px] text-white/40">
                {t('branding.poweredBy', 'Powered by Strata')}
              </div>
            ) : null}
          </div>

          {/* Mini content area */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <div className="flex items-center gap-2">
                <div
                  className="h-5 w-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                  style={{ backgroundColor: settings.accentColor }}
                >
                  A
                </div>
                <span
                  className="text-[10px] text-gray-600 dark:text-gray-300 font-medium"
                  style={{ fontFamily: settings.bodyFont }}
                >
                  {t('branding.previewWelcome', 'Welcome back, Admin')}
                </span>
              </div>
              <div
                className="px-2 py-0.5 rounded text-[8px] font-medium text-white"
                style={{ backgroundColor: settings.secondaryColor }}
              >
                {t('branding.previewPlan', 'Pro Plan')}
              </div>
            </div>
            <div className="flex-1 p-3 space-y-2 overflow-hidden">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: t('branding.previewEmployees', 'Employees'), value: '142' },
                  { label: t('branding.previewProjects', 'Projects'), value: '28' },
                  { label: t('branding.previewTasks', 'Tasks'), value: '67' },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="rounded-lg p-2 border bg-white dark:bg-gray-800"
                    style={{ borderColor: lighten(settings.primaryColor, 0.7) }}
                  >
                    <p
                      className="text-[8px] text-gray-500 dark:text-gray-400"
                      style={{ fontFamily: settings.bodyFont }}
                    >
                      {label}
                    </p>
                    <p
                      className="text-sm font-bold"
                      style={{ color: settings.primaryColor, fontFamily: settings.headingFont }}
                    >
                      {value}
                    </p>
                  </div>
                ))}
              </div>
              <div
                className="rounded-lg h-16 border"
                style={{
                  backgroundColor: lighten(settings.primaryColor, 0.95),
                  borderColor: lighten(settings.primaryColor, 0.85),
                }}
              >
                <div className="flex items-end h-full px-2 pb-1 gap-1">
                  {[40, 65, 45, 80, 55, 70, 60].map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t"
                      style={{
                        height: `${h}%`,
                        backgroundColor:
                          i === 3 ? settings.primaryColor : lighten(settings.primaryColor, 0.5),
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <div
                  className="px-3 py-1.5 rounded-lg text-[9px] font-medium text-white"
                  style={{ backgroundColor: settings.primaryColor }}
                >
                  {t('branding.previewButton', 'Primary Action')}
                </div>
                <div
                  className="px-3 py-1.5 rounded-lg text-[9px] font-medium text-white"
                  style={{ backgroundColor: settings.secondaryColor }}
                >
                  {t('branding.previewButton2', 'Secondary')}
                </div>
                <div
                  className="px-3 py-1.5 rounded-lg text-[9px] font-medium text-white"
                  style={{ backgroundColor: settings.accentColor }}
                >
                  {t('branding.previewButton3', 'Accent')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
