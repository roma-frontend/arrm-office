'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import { Sparkles, RefreshCw, X, BarChart3, Clock, Users, AlertTriangle } from 'lucide-react';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { useAuthStore } from '@/store/useAuthStore';
import { Button } from '@/components/ui/button';

interface DigestStats {
  onLeave: number;
  pending: number;
  lateToday: number;
  attendanceRate: string;
}

export default function WeeklyDigestWidget() {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [digest, setDigest] = useState<string | null>(null);
  const [stats, setStats] = useState<DigestStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const user = useAuthStore((s) => s.user);

  const generateDigest = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/chat/weekly-digest?adminId=${user.id}`);
      const data = (await res.json()) as {
        digest?: string;
        stats?: DigestStats;
        generatedAt?: string;
      };
      if (data.digest) {
        setDigest(data.digest);
        setStats(data.stats ?? null);
        setGeneratedAt(data.generatedAt ?? null);
      }
    } catch (_e) {
      setDigest('Failed to generate digest. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => {
    setIsOpen(true);
    if (!digest) generateDigest();
  };

  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={handleOpen}
        className="flex items-center gap-2 px-4 py-2 bg-linear-to-r from-[#2563eb] to-[#0ea5e9] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-[#2563eb]/20"
      >
        <Sparkles className="w-4 h-4" />
        {t('weeklyDigest.title')}
      </button>

      {/* Modal */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={(e) => e.target === e.currentTarget && setIsOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-2xl bg-(--background) border border-(--border) rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
            >
              {/* Header */}
              <div className="p-6 bg-linear-to-r from-[#2563eb] to-[#0ea5e9] text-white shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/20 rounded-xl">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold">{t('weeklyDigest.title')}</h2>
                      <p className="text-xs opacity-80">
                        {generatedAt
                          ? `{t("weeklyDigest.generated", { time: new Date(generatedAt).toLocaleTimeString() })}`
                          : '{t("weeklyDigest.subtitle")}'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={generateDigest}
                      disabled={loading}
                      className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors disabled:opacity-50"
                      title={t('titles.regenerate')}
                    >
                      {loading ? (
                        <ShieldLoader size="xs" variant="inline" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => setIsOpen(false)}
                      className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Quick Stats */}
                {stats && (
                  <div className="grid grid-cols-4 gap-3 mt-4">
                    {[
                      { icon: Users, label: 'On Leave', value: stats.onLeave, color: 'text-white' },
                      { icon: Clock, label: 'Pending', value: stats.pending, color: 'text-white' },
                      {
                        icon: AlertTriangle,
                        label: 'Late Today',
                        value: stats.lateToday,
                        color: 'text-white',
                      },
                      {
                        icon: BarChart3,
                        label: t('nav.attendance'),
                        value: `${stats.attendanceRate}%`,
                        color: 'text-white',
                      },
                    ].map((s) => (
                      <div key={s.label} className="bg-white/10 rounded-xl p-3 text-center">
                        <s.icon className={`w-4 h-4 mx-auto mb-1 ${s.color}`} />
                        <div className="text-xl font-bold">{s.value}</div>
                        <div className="text-xs opacity-70">{s.label}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-4">
                    <div className="relative">
                      <div className="w-16 h-16 rounded-full bg-linear-to-br from-[#2563eb] to-[#0ea5e9] flex items-center justify-center">
                        <Sparkles className="w-8 h-8 text-white animate-pulse" />
                      </div>
                      <div className="absolute inset-0 rounded-full border-4 border-[#2563eb]/30 animate-ping" />
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-(--text-primary)">
                        {t('weeklyDigest.generating')}
                      </p>
                      <p className="text-sm text-(--text-muted) mt-1">
                        {t('weeklyDigest.analyzing')}
                      </p>
                    </div>
                  </div>
                ) : digest ? (
                  <div className="prose prose-sm max-w-none">
                    <div className="whitespace-pre-wrap text-sm text-(--text-primary) leading-relaxed">
                      {digest}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-16 text-(--text-muted)">
                    <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-30" />
                    <p>{t('weeklyDigest.clickRefresh')}</p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-(--border) shrink-0 flex items-center justify-between">
                <p className="text-xs text-(--text-muted)">{t('weeklyDigest.poweredBy')}</p>
                <Button
                  onClick={generateDigest}
                  disabled={loading}
                  size="sm"
                  className="bg-linear-to-r from-[#2563eb] to-[#0ea5e9] text-white hover:opacity-90"
                >
                  {loading ? (
                    <ShieldLoader size="xs" variant="inline" className="mr-1" />
                  ) : (
                    <RefreshCw className="w-3 h-3 mr-1" />
                  )}
                  Refresh
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
