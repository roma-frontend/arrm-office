'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft,
  BarChart3,
  Download,
  Users,
  TrendingUp,
  Star,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Hash,
  FileText,
  Calendar,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';

const STATUS_VARIANT: Record<string, 'secondary' | 'success' | 'danger'> = {
  draft: 'secondary',
  active: 'success',
  closed: 'danger',
};

const QUESTION_TYPE_ICONS: Record<string, typeof Star> = {
  rating: Star,
  multiple_choice: Hash,
  text: MessageSquare,
  yes_no: ThumbsUp,
  nps: BarChart3,
};

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  return (
    <Badge variant={STATUS_VARIANT[status] || 'secondary'}>
      {t(`surveys.status.${status}`) || status}
    </Badge>
  );
}

function QuestionResultCard({ question, result }: { question: any; result: any }) {
  const { t } = useTranslation();
  const Icon = QUESTION_TYPE_ICONS[question.type] || FileText;

  const renderResult = () => {
    switch (question.type) {
      case 'rating':
      case 'nps': {
        const maxVal = question.type === 'rating' ? 5 : 10;
        const avg = result.average ?? 0;
        const pct = (avg / maxVal) * 100;
        return (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {t('surveys.average')}: {avg.toFixed(1)} / {maxVal}
              </span>
              <span className="font-medium">{pct.toFixed(0)}%</span>
            </div>
            <Progress value={pct} className="h-2" />
            {result.distribution && (
              <div className="flex gap-1 mt-2">
                {Object.entries(result.distribution as Record<string, number>)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([val, count]) => (
                    <div key={val} className="flex flex-col items-center gap-1">
                      <div
                        className="w-8 bg-primary/20 rounded-t"
                        style={{
                          height: `${Math.max(4, (count / Math.max(1, result.totalResponses)) * 60)}px`,
                        }}
                      />
                      <span className="text-xs text-muted-foreground">{val}</span>
                      <span className="text-xs font-medium">{count as number}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        );
      }
      case 'multiple_choice': {
        const counts = result.optionCounts as Record<string, number> | undefined;
        if (!counts || Object.keys(counts).length === 0) {
          return <p className="text-sm text-muted-foreground">{t('surveys.empty')}</p>;
        }
        const total = Object.values(counts).reduce((s, v) => s + v, 0);
        return (
          <div className="space-y-2">
            {Object.entries(counts)
              .sort(([, a], [, b]) => b - a)
              .map(([opt, count]) => {
                const pct = total > 0 ? ((count as number) / total) * 100 : 0;
                return (
                  <div key={opt} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{opt}</span>
                      <span className="text-muted-foreground">
                        {count as number} ({pct.toFixed(0)}%)
                      </span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </div>
                );
              })}
          </div>
        );
      }
      case 'yes_no': {
        const total = (result.yesCount ?? 0) + (result.noCount ?? 0);
        const yesPct = total > 0 ? ((result.yesCount ?? 0) / total) * 100 : 0;
        const noPct = total > 0 ? ((result.noCount ?? 0) / total) * 100 : 0;
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <ThumbsUp className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium">{result.yesCount ?? 0}</span>
                <span className="text-xs text-muted-foreground">({yesPct.toFixed(0)}%)</span>
              </div>
              <div className="flex items-center gap-2">
                <ThumbsDown className="h-4 w-4 text-red-600" />
                <span className="text-sm font-medium">{result.noCount ?? 0}</span>
                <span className="text-xs text-muted-foreground">({noPct.toFixed(0)}%)</span>
              </div>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden bg-muted">
              <div className="bg-green-500 transition-all" style={{ width: `${yesPct}%` }} />
              <div className="bg-red-500 transition-all" style={{ width: `${noPct}%` }} />
            </div>
          </div>
        );
      }
      case 'text': {
        const responses = result.textResponses as string[] | undefined;
        if (!responses || responses.length === 0) {
          return <p className="text-sm text-muted-foreground">{t('surveys.empty')}</p>;
        }
        return (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {responses.map((text, idx) => (
              <div key={idx} className="p-2 rounded-md bg-muted/50 text-sm">
                {text}
              </div>
            ))}
          </div>
        );
      }
      default:
        return null;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">{question.text}</CardTitle>
          </div>
          <Badge variant="secondary" className="text-xs shrink-0">
            {t(
              `surveys.questionType.${question.type.replace(/_([a-z])/g, (_match: string, char: string) => char.toUpperCase())}`,
            )}
          </Badge>
        </div>
        {question.description && <CardDescription>{question.description}</CardDescription>}
      </CardHeader>
      <CardContent>{renderResult()}</CardContent>
    </Card>
  );
}

function DepartmentBreakdown({ departmentResults }: { departmentResults: any[] }) {
  const { t } = useTranslation();

  if (!departmentResults || departmentResults.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground text-center">{t('surveys.empty')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4" />
          {t('surveyResults.title')} — {t('surveyResults.byDepartment')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {departmentResults.map((dept) => (
            <div key={dept.department} className="p-3 rounded-lg border bg-card">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sm">{dept.department}</span>
                <Badge variant="secondary" className="text-xs">
                  {dept.responseCount} {t('surveys.responses')}
                </Badge>
              </div>
              <div className="space-y-2">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {dept.questionResults.map((qr: any) => {
                  const avg = qr.average;
                  if (avg !== undefined) {
                    return (
                      <div key={qr.questionId} className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground w-24 truncate">
                          Q{qr.questionId.slice(0, 8)}...
                        </span>
                        <Progress value={(avg / 5) * 100} className="flex-1 h-1.5" />
                        <span className="font-medium w-8 text-right">{avg.toFixed(1)}</span>
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SurveyTrendsChart({ trends }: { trends: any[] }) {
  const { t } = useTranslation();

  if (!trends || trends.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground text-center">{t('surveys.empty')}</p>
        </CardContent>
      </Card>
    );
  }

  const maxResponses = Math.max(...trends.map((t) => t.responseCount), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          {t('surveyResults.title')} — {t('surveyResults.trends')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {trends.map((trend) => {
            const barWidth = (trend.responseCount / maxResponses) * 100;
            return (
              <div key={trend.surveyId} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium truncate">{trend.title}</span>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <StatusBadge status={trend.status} />
                    <span className="text-muted-foreground">{trend.responseCount}</span>
                  </div>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      trend.status === 'active'
                        ? 'bg-green-500'
                        : trend.status === 'closed'
                          ? 'bg-red-500'
                          : 'bg-gray-400'
                    }`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function ExportButton({
  surveyId,
  organizationId,
}: {
  surveyId: Id<'surveys'>;
  organizationId: Id<'organizations'>;
}) {
  const { t } = useTranslation();
  const [isExporting, setIsExporting] = useState(false);

  const exportData = useQuery(api.surveys.getSurveyExportData, {
    surveyId,
    organizationId,
  });

  const handleExport = () => {
    if (!exportData || isExporting) return;
    setIsExporting(true);

    try {
      const headers = ['Respondent', 'Department', 'Submitted At', ...exportData.questions];
      const rows = exportData.exportData.map((row) =>
        headers
          .map((h) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const val = (row as any)[h];
            if (val === undefined || val === null) return '';
            const str = String(val);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          })
          .join(','),
      );

      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${exportData.survey.title.replace(/\s+/g, '_')}_results.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button
      onClick={handleExport}
      disabled={!exportData || isExporting}
      variant="outline"
      size="sm"
    >
      <Download className="h-4 w-4 mr-1" />
      {isExporting ? t('surveyResults.exporting') : t('surveyResults.exportCSV')}
    </Button>
  );
}

export default function SurveyResultsDashboard() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const { t, i18n } = useTranslation();
  const surveyId = params.id as Id<'surveys'>;

  const dateLocale = i18n.language === 'ru' ? ru : i18n.language === 'hy' ? hy : enUS;

  const survey = useQuery(api.surveys.getSurveyWithQuestions, { surveyId });
  const results = useQuery(
    api.surveys.getSurveyResults,
    survey ? { surveyId, organizationId: survey.organizationId as Id<'organizations'> } : 'skip',
  );
  const deptResults = useQuery(
    api.surveys.getSurveyResultsByDepartment,
    survey ? { surveyId, organizationId: survey.organizationId as Id<'organizations'> } : 'skip',
  );
  const trends = useQuery(
    api.surveys.getSurveyTrends,
    survey ? { organizationId: survey.organizationId as Id<'organizations'>, months: 6 } : 'skip',
  );
  const responses = useQuery(
    api.surveys.getSurveyResponses,
    survey && !survey.isAnonymous
      ? { surveyId, organizationId: survey.organizationId as Id<'organizations'>, limit: 50 }
      : 'skip',
  );

  const isAdmin = user?.role === 'admin' || user?.role === 'supervisor';

  if (!survey) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  const totalResponses = results?.totalResponses ?? 0;
  const responseRate = survey.responseCount > 0 ? (totalResponses / survey.responseCount) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{survey.title}</h1>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={survey.status} />
              {survey.isAnonymous && <Badge variant="outline">{t('surveys.anonymous')}</Badge>}
              <span className="text-sm text-muted-foreground">
                {t('surveys.questionsCount')}: {survey.questions?.length ?? 0}
              </span>
            </div>
          </div>
        </div>
        {isAdmin && survey.organizationId && (
          <ExportButton
            surveyId={survey._id}
            organizationId={survey.organizationId as Id<'organizations'>}
          />
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{totalResponses}</p>
                <p className="text-xs text-muted-foreground">{t('surveys.responses')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{responseRate.toFixed(0)}%</p>
                <p className="text-xs text-muted-foreground">{t('surveyResults.responseRate')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{survey.questions?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground">{t('surveys.questions')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">
                  {survey.createdAt
                    ? format(new Date(survey.createdAt), 'MMM d', { locale: dateLocale })
                    : '—'}
                </p>
                <p className="text-xs text-muted-foreground">{t('surveyResults.created')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t('surveyResults.overview')}</TabsTrigger>
          <TabsTrigger value="departments">{t('surveyResults.byDepartment')}</TabsTrigger>
          <TabsTrigger value="trends">{t('surveyResults.trends')}</TabsTrigger>
          {!survey.isAnonymous && (
            <TabsTrigger value="responses">{t('surveys.responses')}</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          {results?.questionResults.map((qr, idx) => {
            const question = survey.questions?.[idx];
            if (!question) return null;
            return <QuestionResultCard key={qr.question._id} question={question} result={qr} />;
          })}
        </TabsContent>

        <TabsContent value="departments" className="mt-4">
          <DepartmentBreakdown departmentResults={deptResults?.departmentResults ?? []} />
        </TabsContent>

        <TabsContent value="trends" className="mt-4">
          <SurveyTrendsChart trends={trends?.trends ?? []} />
        </TabsContent>

        {!survey.isAnonymous && (
          <TabsContent value="responses" className="space-y-4 mt-4">
            {responses?.responses?.map((resp) => (
              <Card key={resp.responseId}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>{resp.respondent?.name?.charAt(0) ?? '?'}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm">
                          {resp.respondent?.name ?? t('surveyResults.noData')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {resp.respondent?.department ?? t('surveyResults.noData')}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {resp.submittedAt
                        ? format(new Date(resp.submittedAt), 'MMM d, yyyy HH:mm', {
                            locale: dateLocale,
                          })
                        : '—'}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {resp.answers.map((answer) => {
                      const question = survey.questions?.find((q) => q._id === answer.questionId);
                      if (!question) return null;
                      return (
                        <div key={answer._id} className="flex items-start gap-2 text-sm">
                          <span className="font-medium w-1/3 truncate">{question.text}</span>
                          <span className="text-muted-foreground">
                            {answer.ratingValue ??
                              answer.textValue ??
                              (answer.booleanValue !== undefined
                                ? answer.booleanValue
                                  ? 'Yes'
                                  : 'No'
                                : (answer.selectedOptions?.join(', ') ?? '—'))}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
