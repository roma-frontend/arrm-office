"use client";

import { useTranslation } from "react-i18next";

import { useEffect, useState } from "react";
import { useCookieConsent } from "@/store/cookieConsentStore";
import { motion, AnimatePresence } from "framer-motion";
import { Cookie, Settings, Shield, BarChart3, Target, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function CookieBanner() {
  const { t } = useTranslation();
  const { hasConsent, showBanner, acceptAll, rejectAll } = useCookieConsent();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || hasConsent || !showBanner) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 50, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="w-full max-w-5xl mx-auto px-4 mt-8"
      >
        <div className="mx-auto max-w-7xl">
          <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background)]/95 shadow-2xl backdrop-blur-xl">
            {/* Decorative gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#2563eb]/10 via-transparent to-[#0ea5e9]/10" />

            <div className="relative px-6 py-6 sm:px-8 sm:py-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                {/* Left section - Icon & Text */}
                <div className="flex items-start gap-4">
                  <div className="text-left flex-shrink-0">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#2563eb] to-[#0ea5e9] shadow-lg">
                      <Cookie className="h-6 w-6 text-white" />
                    </div>
                  </div>

                  <div className="text-left flex-1">
                    <h3 className="text-lg font-semibold text-[var(--foreground)]">
                      🍪 {t("cookies.title")}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                      {t("cookies.description")}
                      {t("cookies.acceptConsent")}{" "}
                      <Link
                        href="/privacy"
                        className="inline-flex items-center font-medium text-[var(--primary)] hover:underline"
                      >
                        {t("cookies.learnMore")}
                      </Link>
                      {t("cookies.or")}
                      <Link
                        href="/settings"
                        className="inline-flex items-center gap-1 font-medium text-[var(--primary)] hover:underline"
                      >
                        {t("cookies.customizeSettings")}
                        <Settings className="h-3 w-3" />
                      </Link>
                    </p>

                    {/* Cookie categories preview */}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <div className="flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        <Shield className="h-3 w-3" />
                        {t("cookies.essential")}
                      </div>
                      <div className="flex items-center gap-1.5 rounded-full bg-[var(--background-subtle)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
                        <BarChart3 className="h-3 w-3" />
                        {t("cookies.analytics")}
                      </div>
                      <div className="flex items-center gap-1.5 rounded-full bg-[var(--background-subtle)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
                        <Target className="h-3 w-3" />
                        {t("cookies.marketing")}
                      </div>
                      <div className="flex items-center gap-1.5 rounded-full bg-[var(--background-subtle)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
                        <Palette className="h-3 w-3" />
                        {t("cookies.preferences")}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right section - Actions */}
                <div className="flex flex-col gap-3 sm:flex-row lg:flex-shrink-0">
                  <Button
                    onClick={acceptAll}
                    size="lg"
                    className="group relative overflow-hidden shadow-lg hover:shadow-xl"
                  >
                    {t("cookies.acceptAll")}
                  </Button>

                  <Button
                    onClick={rejectAll}
                    variant="outline"
                    size="lg"
                    className="shadow-sm"
                  >
                    {t("cookies.rejectAll")}
                  </Button>

                  <Button
                    onClick={() => router.push("/settings")}
                    variant="secondary"
                    size="lg"
                    className="shadow-sm"
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    {t("cookies.settings")}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

