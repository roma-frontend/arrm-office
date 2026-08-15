'use client';

import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import {
  Sparkles,
  Calendar,
  AlertTriangle,
  TrendingUp,
  Users,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/store/useAuthStore';
import { useConvexAuth } from 'convex/react';

interface Insights {
  balanceWarning: string | null;
  patterns: string[] | null;
  teamConflicts: string[] | null;
  bestDates: string[] | null;
}

export default function AIRecommendationsCard() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const { isAuthenticated } = useConvexAuth();
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const fetchInsights = async () => {
    if (!user?.id || !isAuthenticated) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/chat/insights?userId=${user.id}`);
      if (res.ok) {
        const data = (await res.json()) as Insights;
        setInsights(data);
        setLastFetched(new Date());
      }
    } catch (_e) {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInsights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isAuthenticated]);

  // Don't show if no insights at all
  const hasContent =
    insights?.balanceWarning ||
    (insights?.patterns && insights.patterns.length > 0) ||
    (insights?.bestDates && insights.bestDates.length > 0) ||
    (insights?.teamConflicts && insights.teamConflicts.length > 0);

  if (!hasContent && !loading) return null;

  return (
    <Card className="border border-(--brand)/30 overflow-hidden">
      {/* Gradient top bar */}
      <div className="h-1 bg-linear-to-r from-(--brand) to-(--brand-hover)" />

      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-linear-to-br from-(--brand) to-(--brand-hover)">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            {t('aiFeatures.aiRecommendations')}
            {lastFetched && (
              <span className="text-xs text-(--text-muted) font-normal">
                · {lastFetched.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-1">
            <button
              onClick={fetchInsights}
              disabled={loading}
              className="p-1.5 rounded-lg hover:bg-(--background-subtle) transition-colors disabled:opacity-50"
              title={t('titles.refresh')}
            >
              {loading ? (
                <ShieldLoader size="xs" variant="inline" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 text-(--text-muted)" />
              )}
            </button>
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1.5 rounded-lg hover:bg-(--background-subtle) transition-colors"
            >
              {expanded ? (
                <ChevronUp className="w-3.5 h-3.5 text-(--text-muted)" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-(--text-muted)" />
              )}
            </button>
          </div>
        </div>
      </CardHeader>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <CardContent className="space-y-3 pt-0">
              {loading && !insights ? (
                <div className="flex items-center gap-2 py-4 justify-center">
                  <ShieldLoader size="xs" variant="inline" />
                  <span className="text-sm text-(--text-muted)">
                    {t('aiRecommendations.analyzing')}
                  </span>
                </div>
              ) : (
                <>
                  {/* Balance Warning */}
                  {insights?.balanceWarning && (
                    <motion.div
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-start gap-3 p-3 rounded-xl border border-(--warning-outline) bg-(--warning-quiet)"
                    >
                      <AlertTriangle className="w-4 h-4 text-(--warning-text) shrink-0 mt-0.5" />
                      <p className="text-sm text-(--warning-text)">{insights.balanceWarning}</p>
                    </motion.div>
                  )}

                  {/* Attendance Patterns */}
                  {insights?.patterns && insights.patterns.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.05 }}
                      className="p-3 rounded-xl border border-(--brand-outline) bg-(--brand-quiet)"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="w-4 h-4 text-(--brand-text)" />
                        <p className="text-xs font-semibold text-(--brand-text)">
                          {t('aiRecommendations.attendancePatterns')}
                        </p>
                      </div>
                      <ul className="space-y-1">
                        {insights.patterns.map((p, i) => (
                          <li
                            key={i}
                            className="text-sm text-(--text-primary) flex items-start gap-2"
                          >
                            <span className="text-(--brand-text) mt-0.5">•</span>
                            {p}
                          </li>
                        ))}
                      </ul>
                    </motion.div>
                  )}

                  {/* Best Dates */}
                  {insights?.bestDates && insights.bestDates.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 }}
                      className="p-3 rounded-xl border border-(--success-outline) bg-(--success-quiet)"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className="w-4 h-4 text-(--success-text)" />
                        <p className="text-xs font-semibold text-(--success-text)">
                          {t('aiRecommendations.bestDates')}
                        </p>
                      </div>
                      <ul className="space-y-1">
                        {insights.bestDates.map((d, i) => (
                          <li
                            key={i}
                            className="text-sm text-(--text-primary) flex items-start gap-2"
                          >
                            <span className="text-(--success-text) mt-0.5">✓</span>
                            {d}
                          </li>
                        ))}
                      </ul>
                      <p className="text-xs text-(--text-muted) mt-2">
                        💬 {t('aiRecommendations.askAiToBook')}
                      </p>
                    </motion.div>
                  )}

                  {/* Team Conflicts */}
                  {insights?.teamConflicts && insights.teamConflicts.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.15 }}
                      className="p-3 rounded-xl border border-(--brand-outline) bg-(--brand-quiet)"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Users className="w-4 h-4 text-(--brand-text)" />
                        <p className="text-xs font-semibold text-(--brand-text)">
                          Team on Leave (next 60 days)
                        </p>
                      </div>
                      <ul className="space-y-1">
                        {insights.teamConflicts.map((c, i) => (
                          <li
                            key={i}
                            className="text-sm text-(--text-primary) flex items-start gap-2"
                          >
                            <span className="text-(--brand-text) mt-0.5">•</span>
                            {c}
                          </li>
                        ))}
                      </ul>
                    </motion.div>
                  )}
                </>
              )}
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
