'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Calendar,
  Clock,
  User,
  FileText,
  CheckCircle,
  XCircle,
  AlertCircle,
  Trash2,
  Pencil,
  BarChart3,
  Users,
  Eye,
  MessageSquare,
} from 'lucide-react';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';
import { Progress } from '@/components/ui/progress';

const StatusBadge = ({ status }: { status: string }) => {
  const { t } = useTranslation();
  const variant = {
    draft: { badge: 'secondary' as const, Icon: FileText },
    active: { badge: 'success' as const, Icon: CheckCircle },
    closed: { badge: 'danger' as const, Icon: XCircle },
  }[status] ?? { badge: 'secondary' as const, Icon: FileText };

  const label =
    {
      draft: t('surveyStatus.draft'),
      active: t('surveyStatus.active'),
      closed: t('surveyStatus.closed'),
    }[status] ?? t('surveyStatus.draft');

  return (
    <Badge variant={variant.badge} className="flex items-center gap-1">
      <variant.Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
};

export default function SurveyDetailClient() {
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
  const currentUser = useQuery(
    api.users.queries.getUserById,
    user?.id ? { userId: user.id as Id<'users'> } : 'skip',
  );

  const [isPublishing, setIsPublishing] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const publishSurvey = useMutation(api.surveys.publishSurvey);
  const closeSurvey = useMutation(api.surveys.closeSurvey);
  const deleteSurvey = useMutation(api.surveys.deleteSurvey);

  const handlePublish = async () => {
    if (!currentUser || !survey) return;
    setIsPublishing(true);
    try {
      await publishSurvey({ surveyId, organizationId: survey.organizationId });
      toast.success(t('surveys.published'));
      router.refresh();
    } catch {
      toast.error(t('surveys.errors.publishFailed'));
    } finally {
      setIsPublishing(false);
    }
  };

  const handleClose = async () => {
    if (!currentUser || !survey) return;
    setIsClosing(true);
    try {
      await closeSurvey({ surveyId, organizationId: survey.organizationId });
      toast.success(t('surveys.closed'));
      router.refresh();
    } catch {
      toast.error(t('surveys.errors.closeFailed'));
    } finally {
      setIsClosing(false);
    }
  };

  const handleDelete = async () => {
    if (!currentUser || !survey) return;
    setIsDeleting(true);
    try {
      await deleteSurvey({ surveyId, organizationId: survey.organizationId });
      toast.success(t('surveys.deleted'));
      router.push('/surveys');
    } catch {
      toast.error(t('surveys.errors.deleteFailed'));
    } finally {
      setIsDeleting(false);
    }
  };

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

  const responseRate = results
    ? Math.round((results.totalResponses / (results.totalResponses || 1)) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/surveys')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{survey.title}</h1>
            <p className="text-muted-foreground">
              {survey.creator
                ? t('surveys.createdBy', { name: survey.creator.name })
                : t('surveys.created')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {survey.status === 'draft' && (
            <Button variant="default" onClick={handlePublish} disabled={isPublishing}>
              <CheckCircle className="mr-2 h-4 w-4" />
              {isPublishing ? t('common.saving') : t('surveys.publish')}
            </Button>
          )}
          {survey.status === 'active' && (
            <Button variant="outline" onClick={handleClose} disabled={isClosing}>
              <XCircle className="mr-2 h-4 w-4" />
              {isClosing ? t('common.saving') : t('surveys.close')}
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push(`/surveys/${surveyId}/edit`)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={() => router.push(`/surveys/${surveyId}/results`)}>
            <BarChart3 className="h-4 w-4 mr-2" />
            {t('surveys.results')}
          </Button>
          <Button variant="outline" size="icon" onClick={handleDelete} disabled={isDeleting}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('surveys.status.label')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <StatusBadge status={survey.status} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('surveys.responses')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{results?.totalResponses || 0}</div>
            <Progress value={responseRate} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('surveys.questions')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{survey.questions?.length || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {survey.isAnonymous ? t('surveys.anonymous') : t('surveys.named')}
            </p>
          </CardContent>
        </Card>
      </div>

      {survey.description && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {t('surveys.form.description')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{survey.description}</p>
          </CardContent>
        </Card>
      )}

      {survey.questions && survey.questions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              {t('surveys.wizard.questions')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {survey.questions.map((question: any, index: number) => (
                <div key={question._id} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">
                      {index + 1}. {question.text}
                    </h4>
                    <Badge variant="outline">
                      {t(`surveyQuestionTypes.${question.type}`) as string}
                    </Badge>
                  </div>
                  {question.description && (
                    <p className="text-sm text-muted-foreground">{question.description}</p>
                  )}
                  {question.options && question.options.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {question.options.map((option: string, optIndex: number) => (
                        <Badge key={optIndex} variant="secondary">
                          {option}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    {question.isRequired ? (
                      <Badge variant="default" className="text-xs">
                        {t('surveys.form.required')}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        {t('surveys.form.optional')}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {results && results.questionResults && results.questionResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              {t('surveys.results')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {results.questionResults.map((result: any, index: number) => (
                <div key={index} className="border rounded-lg p-4 space-y-3">
                  <h4 className="font-medium">{survey.questions?.[index]?.text}</h4>
                  {result.average !== undefined && (
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-muted-foreground">{t('surveys.average')}</span>
                      <span className="font-medium">{result.average.toFixed(1)}</span>
                    </div>
                  )}
                  {result.optionCounts && (
                    <div className="space-y-2">
                      {Object.entries(result.optionCounts).map(([option, count]: [string, any]) => (
                        <div key={option} className="flex items-center gap-2">
                          <span className="text-sm w-24">{option}</span>
                          <Progress
                            value={(count / result.totalResponses) * 100}
                            className="flex-1 h-2"
                          />
                          <span className="text-sm font-medium w-12 text-right">{count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {result.yesCount !== undefined && result.noCount !== undefined && (
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span className="text-sm">{result.yesCount}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <XCircle className="h-4 w-4 text-red-500" />
                        <span className="text-sm">{result.noCount}</span>
                      </div>
                    </div>
                  )}
                  {result.textResponses && result.textResponses.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-sm text-muted-foreground">
                        {t('surveys.responses')}
                      </span>
                      {result.textResponses.map((response: string, respIndex: number) => (
                        <p key={respIndex} className="text-sm p-2 bg-muted rounded">
                          {response}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
