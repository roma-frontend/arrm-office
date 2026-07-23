'use client';

import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { SiteEditorChat } from '@/components/ai/SiteEditorChat';
import { PlanGate } from '@/components/billing/PlanGate';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sparkles,
  Code2,
  Palette,
  Layout,
  Zap,
  Crown,
  Info,
  BookOpen,
  TrendingUp,
} from 'lucide-react';
import { usePlanFeatures } from '@/hooks/usePlanFeatures';
import { useAuthStore } from '@/store/useAuthStore';
import { Id } from '@/convex/_generated/dataModel';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import React from 'react';
import { ErrorBoundary } from '@/components/error/ErrorBoundary';

export default function AISiteEditorPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { features, plan } = usePlanFeatures();
  const router = useRouter();

  // Get user details from Convex
  const currentUser = useQuery(
    api.users.queries.getUserById,
    user?.id ? { userId: user.id as Id<'users'> } : 'skip',
  );

  // Only superadmin can access AI Site Editor // cspell:disable-line
  React.useEffect(() => {
    if (user && user.role !== 'superadmin') {
      // cspell:disable-line
      // Don't redirect, just show Coming Soon
    }
  }, [user, router]);

  if (!user || !currentUser) {
    return null; // Providers.tsx will show ShieldLoader during loading
  }

  // Show Coming Soon for non-superadmin users // cspell:disable-line
  if (user.role !== 'superadmin') {
    // cspell:disable-line
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] gap-6 text-center px-4">
        <div className="w-24 h-24 rounded-3xl bg-linear-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center animate-pulse">
          <Sparkles className="w-12 h-12 text-purple-500" />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-(--text-primary)">
            {t('aiSiteEditor.comingSoon')}
          </h1>
          <p className="text-lg text-(--text-muted) max-w-md">{t('aiSiteEditor.comingSoonDesc')}</p>
          <div className="flex items-center gap-2 mt-4 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <Crown className="w-5 h-5 text-amber-500" />
            <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
              {t('aiSiteEditor.superadminOnly')}
            </span>
          </div>
        </div>
        <Button
          onClick={() => router.push('/dashboard')}
          className="mt-4 px-6 py-3 bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold shadow-lg"
        >
          {t('common.backToDashboard')}
        </Button>
      </div>
    );
  }

  const isProfessionalOrHigher = plan === 'professional' || plan === 'enterprise';

  return (
    <ErrorBoundary>
      <PlanGate feature="aiSiteEditor">
        <div className="space-y-6">
          {/* Sticky Header */}
          <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2 md:gap-3">
                  <Sparkles className="h-6 w-6 md:h-8 md:w-8 text-primary" />
                  {t('aiSiteEditor.title')}
                </h1>
                <p className="text-sm sm:text-base text-muted-foreground mt-2">
                  {t('aiSiteEditor.subtitle')}
                </p>
              </div>
              <Badge
                variant={isProfessionalOrHigher ? 'default' : 'secondary'}
                className="text-md px-4 py-2"
              >
                {plan === 'starter' && t('aiSiteEditor.starterPlan')}
                {plan === 'professional' && (
                  <>
                    <Crown className="h-4 w-4 mr-1" />
                    {t('aiSiteEditor.professionalPlan')}
                  </>
                )}
                {plan === 'enterprise' && (
                  <>
                    <Crown className="h-4 w-4 mr-1" />
                    {t('aiSiteEditor.enterprisePlan')}
                  </>
                )}
              </Badge>
            </div>
          </div>

          <Tabs defaultValue="chat" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger
                value="chat"
                className="data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {t('aiSiteEditor.aiChat')}
              </TabsTrigger>
              <TabsTrigger
                value="features"
                className="data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white"
              >
                <Info className="h-4 w-4 mr-2" />
                {t('aiSiteEditor.features')}
              </TabsTrigger>
              <TabsTrigger
                value="guide"
                className="data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white"
              >
                <BookOpen className="h-4 w-4 mr-2" />
                {t('aiSiteEditor.guide')}
              </TabsTrigger>
            </TabsList>

            {/* Chat Tab */}
            <TabsContent value="chat" className="min-h-150">
              <SiteEditorChat
                userId={currentUser._id}
                organizationId={currentUser.organizationId!}
              />
            </TabsContent>

            {/* Features Tab */}
            <TabsContent value="features">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Design Changes */}
                <Card className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-blue-100 dark:bg-blue-500/20 rounded-lg border border-blue-200 dark:border-blue-500/30">
                      <Palette className="h-6 w-6 text-blue-700 dark:text-blue-300" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg mb-2">
                        {t('aiSiteEditor.designChanges')}
                      </h3>
                      <p className="text-sm text-muted-foreground mb-3">
                        {t('aiSiteEditor.designChangesDesc')}
                      </p>
                      <div className="flex items-center gap-2">
                        <Badge variant={isProfessionalOrHigher ? 'default' : 'secondary'}>
                          {isProfessionalOrHigher
                            ? t('aiSiteEditor.unlimited')
                            : `${features.aiSiteEditorDesignChanges}${t('aiSiteEditor.perMonth')}`}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Content Changes */}
                <Card className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-green-100 dark:bg-green-500/20 rounded-lg border border-green-200 dark:border-green-500/30">
                      <Code2 className="h-6 w-6 text-green-700 dark:text-green-300" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg mb-2">
                        {t('aiSiteEditor.contentChanges')}
                      </h3>
                      <p className="text-sm text-muted-foreground mb-3">
                        {t('aiSiteEditor.contentChangesDesc')}
                      </p>
                      <div className="flex items-center gap-2">
                        <Badge variant={isProfessionalOrHigher ? 'default' : 'secondary'}>
                          {isProfessionalOrHigher
                            ? t('aiSiteEditor.unlimited')
                            : `${features.aiSiteEditorContentChanges}${t('aiSiteEditor.perMonth')}`}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Layout Changes */}
                <Card className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-purple-100 dark:bg-purple-500/20 rounded-lg border border-purple-200 dark:border-purple-500/30">
                      <Layout className="h-6 w-6 text-purple-700 dark:text-purple-300" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg mb-2">
                        {t('aiSiteEditor.layoutChanges')}
                      </h3>
                      <p className="text-sm text-muted-foreground mb-3">
                        {t('aiSiteEditor.layoutChangesDesc')}
                      </p>
                      <div className="flex items-center gap-2">
                        <Badge variant={isProfessionalOrHigher ? 'default' : 'secondary'}>
                          {isProfessionalOrHigher
                            ? t('aiSiteEditor.unlimited')
                            : `${features.aiSiteEditorLayoutChanges}${t('aiSiteEditor.perMonth')}`}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Logic Changes */}
                <Card className={`p-6 ${!features.aiSiteEditorLogicChanges ? 'opacity-60' : ''}`}>
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-orange-100 dark:bg-orange-500/20 rounded-lg border border-orange-200 dark:border-orange-500/30">
                      <Zap className="h-6 w-6 text-orange-700 dark:text-orange-300" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
                        {t('aiSiteEditor.logicChanges')}
                        {!features.aiSiteEditorLogicChanges && (
                          <Crown className="h-4 w-4 text-amber-500" />
                        )}
                      </h3>
                      <p className="text-sm text-muted-foreground mb-3">
                        {t('aiSiteEditor.logicChangesDesc')}
                      </p>
                      <div className="flex items-center gap-2">
                        {features.aiSiteEditorLogicChanges ? (
                          <Badge variant="default">{t('aiSiteEditor.unlimited')}</Badge>
                        ) : (
                          <Badge variant="outline">{t('aiSiteEditor.proRequired')}</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Full Control */}
                <Card
                  className={`p-6 md:col-span-2 ${!features.aiSiteEditorFullControl ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-linear-to-br from-purple-600 to-pink-600 dark:from-purple-700/50 dark:to-pink-700/50 rounded-lg">
                      <Crown className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
                        {t('aiSiteEditor.fullControl')}
                        {!features.aiSiteEditorFullControl && (
                          <Crown className="h-4 w-4 text-amber-500" />
                        )}
                      </h3>
                      <p className="text-sm text-muted-foreground mb-3">
                        {t('aiSiteEditor.fullControlDesc')}
                      </p>
                      <div className="flex items-center gap-2">
                        {features.aiSiteEditorFullControl ? (
                          <Badge variant="default">{t('aiSiteEditor.available')}</Badge>
                        ) : (
                          <>
                            <Badge variant="outline">{t('aiSiteEditor.proRequired')}</Badge>
                            <Button size="sm" onClick={() => router.push('/settings?tab=billing')}>
                              <Crown className="h-4 w-4 mr-2" />
                              {t('aiSiteEditor.upgradePlan')}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            </TabsContent>

            {/* Guide Tab */}
            <TabsContent value="guide">
              <Card className="p-6">
                <h2 className="text-2xl font-bold mb-6">{t('aiSiteEditor.guideTitle')}</h2>

                <div className="space-y-8">
                  {/* Step 1 */}
                  <div className="flex gap-4">
                    <div className="shrink-0 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold">
                      1
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-2">{t('aiSiteEditor.step1Title')}</h3>
                      <p className="text-muted-foreground mb-2">{t('aiSiteEditor.step1Desc')}</p>
                      <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                        <li>"{t('aiSiteEditor.step1Example1')}"</li>
                        <li>"{t('aiSiteEditor.step1Example2')}"</li>
                        <li>"{t('aiSiteEditor.step1Example3')}"</li>
                        <li>"{t('aiSiteEditor.step1Example4')}"</li>
                      </ul>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="flex gap-4">
                    <div className="shrink-0 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold">
                      2
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-2">{t('aiSiteEditor.step2Title')}</h3>
                      <p className="text-muted-foreground">{t('aiSiteEditor.step2Desc')}</p>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="flex gap-4">
                    <div className="shrink-0 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold">
                      3
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-2">{t('aiSiteEditor.step3Title')}</h3>
                      <p className="text-muted-foreground">{t('aiSiteEditor.step3Desc')}</p>
                    </div>
                  </div>

                  {/* Step 4 */}
                  <div className="flex gap-4">
                    <div className="shrink-0 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold">
                      4
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-2">{t('aiSiteEditor.step4Title')}</h3>
                      <p className="text-muted-foreground">{t('aiSiteEditor.step4Desc')}</p>
                    </div>
                  </div>
                </div>

                {/* Tips */}
                <div className="mt-8 p-4 bg-blue-50/20 dark:bg-blue-950/10 rounded-lg border border-blue-200/30 dark:border-blue-900/20">
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    {t('aiSiteEditor.tipsTitle')}
                  </h4>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    <li>✅ {t('aiSiteEditor.tip1')}</li>
                    <li>✅ {t('aiSiteEditor.tip2')}</li>
                    <li>✅ {t('aiSiteEditor.tip3')}</li>
                    <li>✅ {t('aiSiteEditor.tip4')}</li>
                  </ul>
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </PlanGate>
    </ErrorBoundary>
  );
}
