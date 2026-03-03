"use client";

import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Palette, Sun, Moon, Monitor } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useTheme } from "next-themes";

export function AppearanceSettings() {
  
  const { t } = useTranslation();
const { theme, setTheme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  const themes = [
    {
      value: "dark" as const,
      label: "Dark",
      icon: Moon,
      description: "Dark theme for low-light environments",
    },
    {
      value: "light" as const,
      label: "Light",
      icon: Sun,
      description: "Light theme for bright environments",
    },
    {
      value: "system" as const,
      label: "System",
      icon: Monitor,
      description: "Match your system preference",
    },
  ];

  if (!mounted) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-[var(--primary)]" />
            <CardTitle>{t('settingsExtended.appearance')}</CardTitle>
          </div>
          <CardDescription>{t('settingsExtended.customizeInterface')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)] mb-3">{t('settingsExtended.theme')}</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {themes.map((t) => (
                  <div
                    key={t.value}
                    className="relative px-4 py-4 rounded-lg border-2 border-[var(--border)] text-left"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 rounded-lg bg-[var(--surface-hover)]">
                        <t.icon className="w-5 h-5 text-[var(--text-muted)]" />
                      </div>
                      <span className="text-sm font-medium text-[var(--text-muted)]">
                        {t.label}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-muted)]">{t.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const currentTheme = theme || "system";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Palette className="w-5 h-5 text-[var(--primary)]" />
          <CardTitle>{t('settingsExtended.appearance')}</CardTitle>
        </div>
        <CardDescription>{t('settingsExtended.customizeInterface')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)] mb-3">{t('settingsExtended.theme')}</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {themes.map((t) => {
                const Icon = t.icon;
                const isActive = currentTheme === t.value;
                return (
                  <button
                    key={t.value}
                    onClick={() => setTheme(t.value)}
                    className={`relative px-4 py-4 rounded-lg border-2 text-left transition-colors ${
                      isActive
                        ? "border-[var(--primary)] bg-[var(--primary)]/10"
                        : "border-[var(--border)] hover:border-[var(--primary)]/30"
                    }`}
                  >
                    {isActive && (
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[var(--primary)] flex items-center justify-center">
                        <span className="text-white text-xs">✓</span>
                      </div>
                    )}
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`p-2 rounded-lg ${isActive ? 'bg-[var(--primary)]/20' : 'bg-[var(--surface-hover)]'}`}>
                        <Icon className={`w-5 h-5 ${isActive ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}`} />
                      </div>
                      <span className={`text-sm font-medium ${isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
                        {t.label}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-muted)]">{t.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Color Accent (Future feature) */}
          <div className="pt-4 border-t border-[var(--border)]">
            <p className="text-sm font-medium text-[var(--text-primary)] mb-3">Accent Color</p>
            <div className="flex gap-3">
              {["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"].map((color) => (
                <button
                  key={color}
                  className="w-10 h-10 rounded-full border-2 border-[var(--border)] hover:scale-110 transition-transform"
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-2">
              Choose your preferred accent color (coming soon)
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
