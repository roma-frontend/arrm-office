'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Sparkles,
  Copy,
  Check,
  AlertTriangle,
  Lightbulb,
  ListChecks,
  MessageSquare,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useAction } from '@/lib/convex-typed';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SheetContent, SheetHeader, SheetTitle, SheetBody } from '@/components/ui/sheet';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import type { InterviewPrep } from '../../../convex/recruitmentAI';

const CATEGORY_BADGE: Record<string, string> = {
  general: 'bg-(--brand-quiet) text-(--brand-text)',
  technical: 'bg-(--purple-quiet) text-(--purple-text)',
  behavioral: 'bg-(--warning-quiet) text-(--warning-text)',
  culture: 'bg-(--success-quiet) text-(--success-text)',
};

/**
 * AI Interview Prep dialog: generates a structured preparation pack for an
 * application's vacancy/candidate — categorized questions with "what to look
 * for" hints, scorecard criteria, red flags and opening tips.
 */
export function InterviewPrepDialog({
  applicationId,
  interviewType,
  onClose: _onClose,
}: {
  applicationId: Id<'applications'>;
  interviewType?: 'phone' | 'video' | 'onsite' | 'technical' | 'hr';
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const candidate = useQuery(api.recruitment.getCandidate, { applicationId });
  const generatePrep = useAction(api.recruitmentAI.generateInterviewPrep);

  const [prep, setPrep] = useState<InterviewPrep | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!candidate?.vacancy) return;
    setGenerating(true);
    try {
      const result = await generatePrep({
        vacancyTitle: candidate.vacancy.title,
        department: candidate.vacancy.department,
        vacancyDescription: candidate.vacancy.description,
        requirements: candidate.vacancy.requirements,
        candidateName: candidate.candidate?.name,
        resumeText: candidate.candidate?.resumeText,
        interviewType,
        language: (['en', 'ru', 'hy', 'de'].includes(i18n.language) ? i18n.language : 'en') as
          | 'en'
          | 'ru'
          | 'hy'
          | 'de',
      });
      setPrep(result);
      toast.success(t('interviewPrep.generated', 'Interview prep generated'));
    } catch (error) {
      toast.error(
        t('interviewPrep.error', 'Failed to generate interview prep') +
          ': ' +
          (error instanceof Error ? error.message : ''),
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = () => {
    if (!prep) return;
    const lines: string[] = [];
    if (candidate?.vacancy) {
      lines.push(`# ${t('interviewPrep.title', 'Interview Prep')} — ${candidate.vacancy.title}`);
      if (candidate.candidate)
        lines.push(`${t('interviewPrep.candidate', 'Candidate')}: ${candidate.candidate.name}`);
      lines.push('');
    }
    if (prep.openingTips)
      lines.push(`${t('interviewPrep.opening', 'Opening')}: ${prep.openingTips}`, '');
    lines.push(`## ${t('interviewPrep.questions', 'Questions')}`);
    for (const q of prep.questions) {
      lines.push(`- [${q.category}] ${q.question}`);
      if (q.whatToLookFor) lines.push(`  → ${q.whatToLookFor}`);
    }
    lines.push('', `## ${t('interviewPrep.criteria', 'Scorecard criteria')}`);
    for (const c of prep.criteria) lines.push(`- ${c.criterion}: ${c.description}`);
    lines.push('', `## ${t('interviewPrep.redFlags', 'Red flags')}`);
    for (const r of prep.redFlags) lines.push(`- ${r}`);
    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const groupedQuestions = (['general', 'technical', 'behavioral', 'culture'] as const)
    .map((cat) => ({ cat, items: (prep?.questions || []).filter((q) => q.category === cat) }))
    .filter((g) => g.items.length > 0);

  return (
    <SheetContent side="right" size="lg" closeLabel={t('common.close', 'Close')}>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-(--purple-text)" />
          {t('interviewPrep.title', 'Interview Prep')}
          {candidate?.vacancy && (
            <span className="text-sm font-normal text-muted-foreground">
              — {candidate.vacancy.title}
            </span>
          )}
        </SheetTitle>
      </SheetHeader>

      {!candidate ? (
        <ShieldLoader />
      ) : (
        <SheetBody className="space-y-4">
          {/* Context summary */}
          <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
            <p>
              <span className="font-medium">{t('interviewPrep.candidate', 'Candidate')}:</span>{' '}
              {candidate.candidate?.name || '—'}
            </p>
            <p>
              <span className="font-medium">{t('interviewPrep.vacancy', 'Vacancy')}:</span>{' '}
              {candidate.vacancy?.title || '—'}
              {candidate.vacancy?.department ? ` (${candidate.vacancy.department})` : ''}
            </p>
            {candidate.candidate?.resumeText ? (
              <p className="text-muted-foreground">
                {t(
                  'interviewPrep.resumeAttached',
                  'Resume available — questions will be personalized',
                )}
              </p>
            ) : null}
          </div>

          {!prep && (
            <div className="text-center py-6">
              <p className="text-sm text-muted-foreground mb-4">
                {t(
                  'interviewPrep.hint',
                  'AI will prepare interview questions, evaluation criteria and red flags based on the vacancy and candidate profile.',
                )}
              </p>
              <Button onClick={handleGenerate} disabled={generating}>
                {generating ? (
                  <ShieldLoader size="xs" variant="inline" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                {t('interviewPrep.generate', 'Generate interview prep')}
              </Button>
            </div>
          )}

          {prep && (
            <>
              {/* Opening tips */}
              {prep.openingTips && (
                <div className="rounded-lg border border-(--brand-outline) bg-(--brand-quiet) dark:bg-(--brand-quiet) p-3">
                  <p className="text-xs font-semibold flex items-center gap-1.5 mb-1">
                    <Lightbulb className="h-3.5 w-3.5 text-(--brand-text)" />
                    {t('interviewPrep.opening', 'Opening')}
                  </p>
                  <p className="text-xs text-muted-foreground">{prep.openingTips}</p>
                </div>
              )}

              {/* Questions grouped by category */}
              <div>
                <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                  <MessageSquare className="h-4 w-4" />
                  {t('interviewPrep.questions', 'Questions')} ({prep.questions.length})
                </p>
                <div className="space-y-3">
                  {groupedQuestions.map(({ cat, items }) => (
                    <div key={cat}>
                      <Badge className={CATEGORY_BADGE[cat] + ' text-xs mb-1.5'}>
                        {String(t(`interviewPrep.category.${cat}`, cat))}
                      </Badge>
                      <div className="space-y-2">
                        {items.map((q, i) => (
                          <div key={i} className="rounded-lg border p-2.5">
                            <p className="text-sm font-medium">{q.question}</p>
                            {q.whatToLookFor && (
                              <p className="text-xs text-muted-foreground mt-1">
                                👀 {q.whatToLookFor}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Scorecard criteria */}
              {prep.criteria.length > 0 && (
                <div>
                  <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                    <ListChecks className="h-4 w-4" />
                    {t('interviewPrep.criteria', 'Scorecard criteria')} ({prep.criteria.length})
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {prep.criteria.map((c, i) => (
                      <div key={i} className="rounded-lg border p-2.5">
                        <p className="text-xs font-semibold">{c.criterion}</p>
                        {c.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Red flags */}
              {prep.redFlags.length > 0 && (
                <div className="rounded-lg border border-(--danger-outline) bg-(--danger-quiet) dark:bg-(--danger-quiet) p-3">
                  <p className="text-xs font-semibold flex items-center gap-1.5 mb-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-(--danger-text)" />
                    {t('interviewPrep.redFlags', 'Red flags')}
                  </p>
                  <ul className="space-y-1">
                    {prep.redFlags.map((r, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                        <span className="text-(--danger-text)">•</span>
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  {copied ? (
                    <Check className="h-3.5 w-3.5 mr-1.5 text-(--success-text)" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  {t('interviewPrep.copy', 'Copy to clipboard')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPrep(null)}
                  disabled={generating}
                >
                  {t('interviewPrep.regenerate', 'Regenerate')}
                </Button>
              </div>
            </>
          )}
        </SheetBody>
      )}
    </SheetContent>
  );
}

export default InterviewPrepDialog;
