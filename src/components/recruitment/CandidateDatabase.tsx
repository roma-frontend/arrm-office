'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Search,
  Users,
  Mail,
  Phone,
  ExternalLink,
  Star,
  Briefcase,
  Filter,
  UserCheck,
  UserX,
  Clock,
  Globe,
  Send,
  ArrowUpRight,
  Linkedin,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation } from '@/lib/convex-typed';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { Sheet, SheetContent, SheetHeader, SheetBody, SheetTitle } from '@/components/ui/sheet';

// ── Helpers ──────────────────────────────────────────────────────────────────

const STAGE_COLORS: Record<string, string> = {
  applied: 'bg-(--brand-quiet) text-(--brand-text)',
  screening: 'bg-(--warning-quiet) text-(--warning-text)',
  interview: 'bg-(--brand-quiet) text-(--brand-text)',
  offer: 'bg-(--warning-quiet) text-(--warning-text)',
  hired: 'bg-(--success-quiet) text-(--success-text)',
  rejected: 'bg-(--danger-quiet) text-(--danger-text)',
};

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  manual: <Users className="h-3 w-3" />,
  referral: <UserCheck className="h-3 w-3" />,
  career_page: <Globe className="h-3 w-3" />,
  linkedin: <Linkedin className="h-3 w-3" />,
  other: <ExternalLink className="h-3 w-3" />,
};

const SOURCE_COLORS: Record<string, string> = {
  manual: 'bg-(--brand-quiet) text-(--brand-text)',
  referral: 'bg-(--success-quiet) text-(--success-text)',
  career_page: 'bg-(--purple-quiet) text-(--purple-text)',
  linkedin: 'bg-(--info-quiet) text-(--info-text)',
  other: 'bg-(--surface-2) text-(--text-secondary)',
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(ts);
}

// ── Candidate Card ───────────────────────────────────────────────────────────

interface CandidateCardProps {
  candidate: {
    _id: Id<'candidateProfiles'>;
    name: string;
    email: string;
    phone?: string;
    source: string;
    isBlocked?: boolean;
    telegramUsername?: string;
    createdAt: number;
    applicationCount: number;
    currentStage: string | null;
    avgScore: number | null;
    applications: Array<{
      _id: Id<'applications'>;
      vacancyTitle: string;
      stage: string;
    }>;
    lastActivity: number;
  };
  onClick: () => void;
}

function CandidateCard({ candidate, onClick }: CandidateCardProps) {
  const { t } = useTranslation();

  return (
    <Card
      className="glass-panel shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 cursor-pointer group relative overflow-hidden"
      onClick={onClick}
    >
      <CardContent className="p-4">
        {/* Blocked indicator */}
        {candidate.isBlocked && (
          <div className="absolute top-0 right-0 w-0 h-0 border-t-[40px] border-t-(--danger-solid) border-l-[40px] border-l-transparent" />
        )}

        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className="relative shrink-0">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-(--brand) to-(--brand-dark) flex items-center justify-center text-white font-semibold text-sm shadow-md">
              {getInitials(candidate.name)}
            </div>
            {/* Telegram indicator */}
            {candidate.telegramUsername && (
              <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#0088cc] flex items-center justify-center">
                <Send className="h-2.5 w-2.5 text-white" />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm truncate group-hover:text-(--brand-text) transition-colors">
                {candidate.name}
              </p>
              {candidate.isBlocked && (
                <Badge className="bg-(--danger-quiet) text-(--danger-text) text-[10px] px-1.5 py-0">
                  Blocked
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
              <Mail className="h-3 w-3 shrink-0" />
              <span className="truncate">{candidate.email}</span>
            </div>

            {candidate.phone && (
              <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                <Phone className="h-3 w-3 shrink-0" />
                <span>{candidate.phone}</span>
              </div>
            )}
          </div>

          {/* Source badge */}
          <Badge className={`text-[10px] shrink-0 ${SOURCE_COLORS[candidate.source] ?? ''}`}>
            {SOURCE_ICONS[candidate.source]}
            <span className="ml-1">
              {t(`recruitment.source.${candidate.source}`, candidate.source)}
            </span>
          </Badge>
        </div>

        {/* Applications summary */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {candidate.applicationCount > 0 && (
            <Badge variant="outline" className="text-[10px] gap-1">
              <Briefcase className="h-2.5 w-2.5" />
              {candidate.applicationCount}{' '}
              {candidate.applicationCount === 1 ? 'application' : 'applications'}
            </Badge>
          )}
          {candidate.currentStage && (
            <Badge className={`text-[10px] ${STAGE_COLORS[candidate.currentStage] ?? ''}`}>
              {t(`recruitment.stage.${candidate.currentStage}`, candidate.currentStage)}
            </Badge>
          )}
          {candidate.avgScore !== null && (
            <Badge variant="outline" className="text-[10px] gap-1">
              <Star className="h-2.5 w-2.5 text-(--warning-text)" />
              {candidate.avgScore}/5
            </Badge>
          )}
        </div>

        {/* Vacancies applied to */}
        {candidate.applications.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {candidate.applications.slice(0, 3).map((app) => (
              <span
                key={app._id}
                className="text-[10px] text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5"
              >
                {app.vacancyTitle}
              </span>
            ))}
            {candidate.applications.length > 3 && (
              <span className="text-[10px] text-muted-foreground">
                +{candidate.applications.length - 3} more
              </span>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" />
            {timeAgo(candidate.lastActivity)}
          </span>
          <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-(--brand-text)" />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Candidate Detail Panel ───────────────────────────────────────────────────

function CandidateDetailPanel({ candidateId }: { candidateId: Id<'candidateProfiles'> }) {
  const { t } = useTranslation();
  const data = useQuery(api.recruitment.getCandidateHistory, { candidateId });
  const blockMut = useMutation(api.recruitment.blockCandidate);
  const unblockMut = useMutation(api.recruitment.unblockCandidate);

  if (!data)
    return (
      <SheetContent
        side="right"
        size="lg"
        label={t('recruitment.candidates.loading', 'Loading candidate')}
        closeLabel={t('common.close', 'Close')}
      >
        <div className="flex flex-1 items-center justify-center">
          <ShieldLoader />
        </div>
      </SheetContent>
    );

  const handleBlock = async () => {
    try {
      await blockMut({ candidateId });
      toast.success('Candidate blocked');
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleUnblock = async () => {
    try {
      await unblockMut({ candidateId });
      toast.success('Candidate unblocked');
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'Application',
      'Vacancy',
      'Stage',
      'Applied',
      'Interviews',
      'Scorecards',
      'Avg Score',
    ];
    const rows = data.applications.map((app) => [
      app._id,
      app.vacancyTitle,
      app.stage,
      new Date(app.createdAt).toISOString(),
      String(app.interviewsCount),
      String(app.scorecardsCount),
      app.avgScore !== null ? String(app.avgScore) : '',
    ]);

    const escape = (val: string) => {
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    const csv = [headers.join(','), ...rows.map((row) => row.map(escape).join(','))].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${data.name.replace(/\s+/g, '_')}_applications.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(t('recruitment.candidates.exported', 'CSV exported'));
  };

  return (
    <SheetContent side="right" size="lg" closeLabel={t('common.close', 'Close')}>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-(--brand) to-(--brand-dark) flex items-center justify-center text-white font-semibold text-sm">
            {getInitials(data.name)}
          </div>
          <div>
            <p className="font-semibold">{data.name}</p>
            <p className="text-xs text-muted-foreground font-normal">{data.email}</p>
          </div>
        </SheetTitle>
      </SheetHeader>

      <SheetBody className="space-y-4">
        {/* Contact */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground mb-1">{t('recruitment.email', 'Email')}</p>
            <a href={`mailto:${data.email}`} className="text-sm font-medium hover:underline">
              {data.email}
            </a>
          </div>
          {data.phone && (
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground mb-1">
                {t('recruitment.phone', 'Phone')}
              </p>
              <a href={`tel:${data.phone}`} className="text-sm font-medium hover:underline">
                {data.phone}
              </a>
            </div>
          )}
        </div>

        {/* Meta */}
        <div className="flex flex-wrap gap-2">
          <Badge className={SOURCE_COLORS[data.source]}>
            {SOURCE_ICONS[data.source]}
            <span className="ml-1">{t(`recruitment.source.${data.source}`, data.source)}</span>
          </Badge>
          {data.telegramUsername && (
            <Badge className="bg-[#0088cc]/10 text-[#0088cc]">
              <Send className="h-3 w-3 mr-1" />@{data.telegramUsername}
            </Badge>
          )}
          {data.isBlocked && (
            <Badge className="bg-(--danger-quiet) text-(--danger-text)">
              <UserX className="h-3 w-3 mr-1" />
              {t('recruitment.blocked', 'Blocked')}
            </Badge>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {!data.isBlocked ? (
            <Button size="sm" variant="destructive" onClick={handleBlock}>
              <UserX className="h-3 w-3 mr-1" />
              {t('recruitment.blockCandidate', 'Block Candidate')}
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={handleUnblock}>
              <UserCheck className="h-3 w-3 mr-1" />
              {t('recruitment.unblock', 'Unblock')}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={handleExportCsv}>
            <Download className="h-3 w-3 mr-1" />
            {t('recruitment.candidates.exportCsv', 'Export CSV')}
          </Button>
        </div>

        {/* Application History */}
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <Briefcase className="h-3.5 w-3.5" />
            {t('recruitment.applicationHistory', 'Application History')} ({data.applications.length}
            )
          </h3>
          {data.applications.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t('recruitment.noApplications', 'No applications yet')}
            </p>
          ) : (
            <div className="space-y-2">
              {data.applications.map((app) => (
                <div
                  key={app._id}
                  className="rounded-lg border p-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{app.vacancyTitle}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge className={`text-[10px] ${STAGE_COLORS[app.stage] ?? ''}`}>
                          {t(`recruitment.stage.${app.stage}`, app.stage)}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {t('recruitment.applied', 'Applied')} {formatDate(app.createdAt)}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      {app.avgScore !== null && (
                        <div className="flex items-center gap-1 text-sm">
                          <Star className="h-3 w-3 text-(--warning-text)" />
                          <span className="font-semibold">{app.avgScore}</span>
                          <span className="text-xs text-muted-foreground">/5</span>
                        </div>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {app.interviewsCount} {t('recruitment.interviews', 'interviews')} ·{' '}
                        {app.scorecardsCount} {t('recruitment.scorecards', 'scorecards')}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Resume */}
        {data.resumeText && (
          <div>
            <h3 className="text-sm font-semibold mb-2">{t('recruitment.resume', 'Resume')}</h3>
            <div className="rounded-lg border p-3 text-xs text-muted-foreground whitespace-pre-wrap max-h-48 overflow-y-auto">
              {data.resumeText}
            </div>
          </div>
        )}
      </SheetBody>
    </SheetContent>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function CandidateDatabase({
  organizationId,
}: {
  organizationId: Id<'organizations'>;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<Id<'candidateProfiles'> | null>(null);

  const candidates = useQuery(
    api.recruitment.listAllCandidates,
    organizationId
      ? {
          organizationId,
          search: search || undefined,
          source: sourceFilter || undefined,
          stage: stageFilter || undefined,
        }
      : 'skip',
  );

  const activeFilters = [sourceFilter, stageFilter].filter(Boolean).length;

  return (
    <div className="space-y-4">
      {/* Search & Filters Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('recruitment.candidates.search', 'Search by name, email, or phone...')}
            className="pl-9"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className="gap-1.5 shrink-0"
        >
          <Filter className="h-3.5 w-3.5" />
          {t('recruitment.candidates.filters', 'Filters')}
          {activeFilters > 0 && (
            <Badge className="ml-1 h-5 w-5 p-0 flex items-center justify-center rounded-full text-[10px]">
              {activeFilters}
            </Badge>
          )}
        </Button>
      </div>

      {/* Filter chips */}
      {showFilters && (
        <div className="flex flex-wrap gap-2 p-3 rounded-lg border bg-muted/20">
          <div>
            <p className="text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">
              Source
            </p>
            <div className="flex flex-wrap gap-1">
              {['manual', 'referral', 'career_page', 'linkedin', 'other'].map((src) => (
                <button
                  key={src}
                  onClick={() => setSourceFilter(sourceFilter === src ? null : src)}
                  className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
                    sourceFilter === src
                      ? 'bg-(--brand) text-white border-(--brand)'
                      : 'bg-transparent text-muted-foreground border-border hover:border-(--brand)'
                  }`}
                >
                  {t(`recruitment.source.${src}`, src)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">
              Stage
            </p>
            <div className="flex flex-wrap gap-1">
              {['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'].map((stg) => (
                <button
                  key={stg}
                  onClick={() => setStageFilter(stageFilter === stg ? null : stg)}
                  className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
                    stageFilter === stg
                      ? 'bg-(--brand) text-white border-(--brand)'
                      : 'bg-transparent text-muted-foreground border-border hover:border-(--brand)'
                  }`}
                >
                  {t(`recruitment.stage.${stg}`, stg)}
                </button>
              ))}
            </div>
          </div>
          {(sourceFilter || stageFilter) && (
            <button
              onClick={() => {
                setSourceFilter(null);
                setStageFilter(null);
              }}
              className="text-[10px] text-(--danger-text) hover:underline self-end"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {/* Results count */}
      {candidates && (
        <p className="text-xs text-muted-foreground">
          {candidates.length} {candidates.length === 1 ? 'candidate' : 'candidates'}
          {search && ` matching "${search}"`}
        </p>
      )}

      {/* Cards grid */}
      {!candidates ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="h-40 animate-pulse bg-white/5" />
          ))}
        </div>
      ) : candidates.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Users className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">
              {search
                ? t('recruitment.candidates.noResults', 'No candidates match your search')
                : t('recruitment.candidates.empty', 'No candidates yet')}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t(
                'recruitment.candidates.hint',
                'Candidates will appear here as they apply to your vacancies',
              )}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {candidates.map((c) => (
            <CandidateCard key={c._id} candidate={c} onClick={() => setSelectedCandidate(c._id)} />
          ))}
        </div>
      )}

      {/* Detail panel */}
      <Sheet
        open={!!selectedCandidate}
        onOpenChange={(open) => !open && setSelectedCandidate(null)}
      >
        {selectedCandidate && <CandidateDetailPanel candidateId={selectedCandidate} />}
      </Sheet>
    </div>
  );
}
