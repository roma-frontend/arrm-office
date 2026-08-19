'use client';

import React from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { useTranslation } from 'react-i18next';
import {
  Briefcase,
  Clock,
  CheckCircle,
  XCircle,
  Star,
  Calendar,
  FileText,
  Send,
  User,
  ArrowRight,
  MapPin,
  MessageCircle,
  Sparkles,
  AlertTriangle,
  Check,
  Target,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldLoader } from '@/components/ui/ShieldLoader';

// ── Helpers ──────────────────────────────────────────────────────────────────

const STAGE_ORDER = ['applied', 'screening', 'interview', 'offer', 'hired'] as const;

const STAGE_COLORS: Record<string, string> = {
  applied: 'bg-(--brand-quiet) text-(--brand-text)',
  screening: 'bg-(--warning-quiet) text-(--warning-text)',
  interview: 'bg-(--brand-quiet) text-(--brand-text)',
  offer: 'bg-(--warning-quiet) text-(--warning-text)',
  hired: 'bg-(--success-quiet) text-(--success-text)',
  rejected: 'bg-(--danger-quiet) text-(--danger-text)',
};

const STAGE_ICONS: Record<string, React.ReactNode> = {
  applied: <FileText className="h-4 w-4" />,
  screening: <MessageCircle className="h-4 w-4" />,
  interview: <Calendar className="h-4 w-4" />,
  offer: <Briefcase className="h-4 w-4" />,
  hired: <CheckCircle className="h-4 w-4" />,
};

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── Pipeline Progress Bar ────────────────────────────────────────────────────

function PipelineProgress({ currentStage }: { currentStage: string }) {
  const { t } = useTranslation();
  const currentIdx = STAGE_ORDER.indexOf(currentStage as (typeof STAGE_ORDER)[number]);
  const isRejected = currentStage === 'rejected';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        {STAGE_ORDER.map((stage, i) => {
          const isActive = stage === currentStage;
          const isCompleted = i < currentIdx;
          const isFuture = i > currentIdx;

          return (
            <React.Fragment key={stage}>
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                    isActive
                      ? 'bg-(--brand) text-white shadow-lg scale-110'
                      : isCompleted
                        ? 'bg-(--success-quiet) text-(--success-text)'
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {isCompleted ? <Check className="h-5 w-5" /> : STAGE_ICONS[stage]}
                </div>
                <span
                  className={`text-[10px] font-medium ${
                    isActive
                      ? 'text-(--brand-text)'
                      : isFuture
                        ? 'text-muted-foreground'
                        : 'text-(--success-text)'
                  }`}
                >
                  {t(`recruitment.stage.${stage}`, stage)}
                </span>
              </div>
              {i < STAGE_ORDER.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-1 mt-[-18px] ${
                    i < currentIdx ? 'bg-(--success-text)' : 'bg-muted'
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
      {isRejected && (
        <Badge className="bg-(--danger-quiet) text-(--danger-text) text-xs">
          <XCircle className="h-3 w-3 mr-1" />
          {t('recruitment.stage.rejected', 'Rejected')}
        </Badge>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function CandidatePortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = React.use(params);
  const { t } = useTranslation();
  const portal = useQuery(api.candidatePortal.getCandidatePortal, { token });

  if (portal === undefined) return <ShieldLoader />;
  if (portal === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="w-12 h-12 mx-auto text-(--warning-text) mb-3" />
            <h1 className="text-xl font-bold mb-2">Link not found</h1>
            <p className="text-sm text-muted-foreground">
              This recruitment link is invalid or has expired. Please check the link you received.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { candidateName, vacancyTitle, vacancyDepartment, vacancyLocation, orgName, stage } =
    portal;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-(--background)/95 backdrop-blur border-b border-(--border)">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-(--brand) to-(--brand-dark) flex items-center justify-center text-white font-semibold text-sm">
              {candidateName
                .split(' ')
                .map((w) => w[0])
                .join('')
                .toUpperCase()
                .slice(0, 2)}
            </div>
            <div>
              <h1 className="text-lg font-bold">{vacancyTitle}</h1>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{orgName}</span>
                {vacancyDepartment && (
                  <>
                    <span>·</span>
                    <span>{vacancyDepartment}</span>
                  </>
                )}
                {vacancyLocation && (
                  <>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {vacancyLocation}
                    </span>
                  </>
                )}
              </div>
            </div>
            <Badge className={`ml-auto ${STAGE_COLORS[stage] ?? ''}`}>
              {t(`recruitment.stage.${stage}`, stage)}
            </Badge>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Pipeline Progress */}
        <Card className="glass-panel shadow-sm">
          <CardContent className="p-5">
            <h2 className="text-sm font-semibold mb-4 flex items-center gap-1.5">
              <Target className="h-4 w-4" />
              {t('candidatePortal.progress', 'Your Progress')}
            </h2>
            <PipelineProgress currentStage={stage} />
          </CardContent>
        </Card>

        {/* Telegram linking — closes the loop: screening, interview links, updates */}
        {!portal.telegramLinked && (
          <Card className="glass-panel shadow-sm">
            <CardContent className="p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex-1">
                  <h2 className="text-sm font-semibold flex items-center gap-1.5">
                    ✈️ {t('candidatePortal.telegramTitle', 'Get updates in Telegram')}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t(
                      'candidatePortal.telegramDesc',
                      'Connect the bot to receive screening questions, interview room links and status updates directly in Telegram.',
                    )}
                  </p>
                </div>
                <a
                  href={`https://t.me/${
                    process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'hremailbot'
                  }?start=cand_${token}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded-lg px-4 py-2.5 text-center text-xs font-semibold text-white transition-transform hover:scale-[1.02]"
                  style={{ background: 'linear-gradient(135deg, #229ED9, #2AABEE)' }}
                >
                  {t('candidatePortal.telegramConnect', 'Connect Telegram')}
                </a>
              </div>
            </CardContent>
          </Card>
        )}

        {/* AI Screening Score */}
        {portal.screeningScore !== null && portal.screeningScore !== undefined && (
          <Card className="glass-panel shadow-sm">
            <CardContent className="p-5">
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-(--brand-text)" />
                {t('candidatePortal.screeningResult', 'Screening Result')}
              </h2>
              <div className="flex items-center gap-4">
                <div className="text-3xl font-bold">
                  {portal.screeningScore}
                  <span className="text-sm text-muted-foreground">/10</span>
                </div>
                <div>
                  {portal.screeningResponses
                    .filter((r) => r.aiScore)
                    .slice(-1)
                    .map((r) => (
                      <div key={r._id}>
                        <Badge
                          className={`${
                            r.aiScore!.verdict === 'pass'
                              ? 'bg-(--success-quiet) text-(--success-text)'
                              : r.aiScore!.verdict === 'fail'
                                ? 'bg-(--danger-quiet) text-(--danger-text)'
                                : 'bg-(--warning-quiet) text-(--warning-text)'
                          }`}
                        >
                          {r.aiScore!.verdict === 'pass'
                            ? '✅ Passed'
                            : r.aiScore!.verdict === 'fail'
                              ? '❌ Not a match'
                              : '⚠️ Conditional'}
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1 max-w-md">
                          {r.aiScore!.reasoning}
                        </p>
                      </div>
                    ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Screening Chat */}
        {portal.screeningResponses.length > 0 && (
          <Card className="glass-panel shadow-sm">
            <CardContent className="p-5">
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <MessageCircle className="h-4 w-4" />
                {t('candidatePortal.screeningChat', 'Screening Chat')}
              </h2>
              <div className="space-y-3">
                {portal.screeningResponses.map((resp) => (
                  <div
                    key={resp._id}
                    className={`rounded-lg border p-3 ${
                      resp.sender === 'hr'
                        ? 'border-(--brand-outline)/20 bg-(--brand-quiet)/30 ml-4'
                        : 'border-[#0088cc]/20 bg-[#0088cc]/5 mr-4'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      {resp.sender === 'hr' ? (
                        <User className="h-3 w-3 text-(--brand-text)" />
                      ) : (
                        <Send className="h-3 w-3 text-[#0088cc]" />
                      )}
                      <span className="text-[10px] font-medium">
                        {resp.sender === 'hr' ? 'HR' : t('candidatePortal.you', 'You')}
                      </span>
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {formatDateTime(resp.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{resp.message}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Interviews */}
        {portal.interviews.length > 0 && (
          <Card className="glass-panel shadow-sm">
            <CardContent className="p-5">
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                {t('candidatePortal.interviews', 'Interviews')} ({portal.interviews.length})
              </h2>
              <div className="space-y-3">
                {portal.interviews.map((iv) => (
                  <div key={iv._id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          {iv.round && (
                            <Badge variant="outline" className="text-[10px]">
                              Round {iv.round}
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-xs">
                            {iv.type}
                          </Badge>
                          <Badge
                            className={`text-xs ${
                              iv.status === 'completed'
                                ? 'bg-(--success-quiet) text-(--success-text)'
                                : iv.status === 'cancelled'
                                  ? 'bg-(--danger-quiet) text-(--danger-text)'
                                  : 'bg-(--brand-quiet) text-(--brand-text)'
                            }`}
                          >
                            {iv.status}
                          </Badge>
                        </div>
                        <p className="text-sm mt-1">
                          {formatDateTime(iv.scheduledAt)} · {iv.duration} min
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t('candidatePortal.with', 'with')} {iv.interviewerName}
                        </p>
                      </div>
                      {iv.meetingLink && iv.status === 'scheduled' && (
                        <a
                          href={iv.meetingLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-(--brand-text) hover:underline flex items-center gap-1"
                        >
                          {t('candidatePortal.join', 'Join')} <ArrowRight className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Scorecards */}
        {portal.scorecards.length > 0 && (
          <Card className="glass-panel shadow-sm">
            <CardContent className="p-5">
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <Star className="h-4 w-4 text-(--warning-text)" />
                {t('candidatePortal.evaluations', 'Evaluations')}
              </h2>
              <div className="space-y-3">
                {portal.scorecards.map((sc) => (
                  <div key={sc._id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{sc.interviewerName}</p>
                        {sc.summary && (
                          <p className="text-xs text-muted-foreground mt-1">{sc.summary}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-lg font-bold">
                          <Star className="h-4 w-4 text-(--warning-text)" />
                          {sc.overallScore}/5
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            sc.recommendation === 'strong_yes' || sc.recommendation === 'yes'
                              ? 'text-(--success-text)'
                              : sc.recommendation === 'no' || sc.recommendation === 'strong_no'
                                ? 'text-(--danger-text)'
                                : ''
                          }`}
                        >
                          {sc.recommendation.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Timeline */}
        {portal.timeline.length > 0 && (
          <Card className="glass-panel shadow-sm">
            <CardContent className="p-5">
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                {t('candidatePortal.timeline', 'Timeline')}
              </h2>
              <div className="space-y-3">
                {portal.timeline.map((ev) => (
                  <div key={ev._id} className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-(--brand) mt-2 shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">{formatDate(ev.createdAt)}</span>
                        {ev.fromStage && (
                          <>
                            <Badge className={`text-[10px] ${STAGE_COLORS[ev.fromStage] ?? ''}`}>
                              {ev.fromStage}
                            </Badge>
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          </>
                        )}
                        <Badge className={`text-[10px] ${STAGE_COLORS[ev.toStage] ?? ''}`}>
                          {ev.toStage}
                        </Badge>
                      </div>
                      {ev.reason && (
                        <p className="text-xs text-muted-foreground mt-0.5">{ev.reason}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <p className="text-center text-[10px] text-muted-foreground py-4">
          {orgName} · Powered by Strata HR
        </p>
      </div>
    </div>
  );
}
