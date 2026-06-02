'use client';

import React, { useState, useMemo } from 'react';
import { useMainRef } from '@/hooks/useMainRef';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import {
  Heart,
  Trophy,
  Star,
  Send,
  ThumbsUp,
  Sparkles,
  Users,
  Award,
  TrendingUp,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation } from 'convex/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useAuthStore } from '@/store/useAuthStore';
import { useShallow } from 'zustand/shallow';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { Id } from '@/convex/_generated/dataModel';
import { api } from '@/convex/_generated/api';

// ── Category Config ──────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<string, { icon: LucideIcon; color: string; labelKey: string }> = {
  teamwork: {
    icon: Users,
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    labelKey: 'recognition.category.teamwork',
  },
  innovation: {
    icon: Sparkles,
    color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    labelKey: 'recognition.category.innovation',
  },
  leadership: {
    icon: Trophy,
    color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
    labelKey: 'recognition.category.leadership',
  },
  dedication: {
    icon: Heart,
    color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    labelKey: 'recognition.category.dedication',
  },
  customer_focus: {
    icon: Star,
    color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    labelKey: 'recognition.category.customerFocus',
  },
  mentorship: {
    icon: Award,
    color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
    labelKey: 'recognition.category.mentorship',
  },
  excellence: {
    icon: TrendingUp,
    color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    labelKey: 'recognition.category.excellence',
  },
  above_and_beyond: {
    icon: Sparkles,
    color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    labelKey: 'recognition.category.aboveAndBeyond',
  },
};

const REACTION_EMOJIS = ['👏', '❤️', '🔥', '🎉', '💪'];

// ── SendKudosModal ───────────────────────────────────────────────────────────

interface SendKudosModalProps {
  open: boolean;
  onClose: () => void;
  organizationId: Id<'organizations'>;
  senderId: Id<'users'>;
}

function SendKudosModal({ open, onClose, organizationId, senderId }: SendKudosModalProps) {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [receiverId, setReceiverId] = useState('');
  const [category, setCategory] = useState('');
  const [message, setMessage] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sendKudosMutation = useMutation(api.recognition.sendKudos);

  // Load user points balance
  const userPoints = useQuery(
    api.recognition.getUserPoints,
    organizationId && senderId ? { organizationId, userId: senderId } : 'skip',
  );

  // Load org users for recipient selection
  const orgUsers = useQuery(
    api.users.getUsersByOrganizationId,
    organizationId && senderId ? { organizationId } : 'skip',
  );

  const availableRecipients = useMemo(() => {
    if (!orgUsers) return [];
    return orgUsers
      .filter((u: any) => u._id !== senderId && u.isActive && u.role !== 'superadmin')
      .sort((a: any, b: any) => a.name.localeCompare(b.name));
  }, [orgUsers, senderId]);

  const selectedRecipient = useMemo(
    () => availableRecipients.find((u: any) => u._id === receiverId),
    [availableRecipients, receiverId],
  );

  const steps = [
    {
      id: 'recipient',
      title: t('recognition.form.recipient'),
      icon: <Users className="w-4 h-4" />,
    },
    { id: 'category', title: t('recognition.form.category'), icon: <Award className="w-4 h-4" /> },
    { id: 'message', title: t('recognition.form.message'), icon: <Send className="w-4 h-4" /> },
  ];

  const canGoNext = (): boolean => {
    switch (currentStep) {
      case 0:
        return !!receiverId;
      case 1:
        return !!category;
      case 2:
        return !!message.trim();
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((p) => p + 1);
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) setCurrentStep((p) => p - 1);
  };

  const handleSubmit = async () => {
    if (!receiverId || !category || !message.trim()) {
      toast.error(t('recognition.errors.fillAllFields'));
      return;
    }

    setIsSubmitting(true);
    try {
      await sendKudosMutation({
        senderId,
        receiverId: receiverId as Id<'users'>,
        category: category as
          | 'teamwork'
          | 'innovation'
          | 'leadership'
          | 'dedication'
          | 'customer_focus'
          | 'mentorship'
          | 'excellence'
          | 'above_and_beyond',
        message: message.trim(),
        isPublic,
      });
      toast.success(t('recognition.kudosSent'));
      onClose();
    } catch (error: any) {
      toast.error(error.message || t('recognition.errors.sendFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle className="flex items-center gap-4">
            <span className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              {t('recognition.sendKudos')}
            </span>
            <Badge variant="outline" className="text-xs gap-1 font-normal">
              <Star className="h-3 w-3 text-yellow-500" />
              {userPoints?.balance ?? 0} {t('recognition.points.label')}
            </Badge>
          </DialogTitle>
          {(userPoints?.balance ?? 0) < 3 && (
            <p className="text-xs text-destructive mt-1">{t('recognition.points.notEnough')}</p>
          )}
        </DialogHeader>

        <div className="flex flex-col">
          {/* Progress bar + Step indicators */}
          <div className="px-5 pt-4 pb-3">
            <div className="relative h-1.5 bg-muted rounded-full overflow-hidden mb-4">
              <div
                className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all duration-300 ease-in-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex items-center justify-between gap-1">
              {steps.map((step, idx) => {
                const isCompleted = idx < currentStep;
                const isCurrent = idx === currentStep;
                return (
                  <React.Fragment key={step.id}>
                    <div className="flex flex-col items-center flex-1 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-200 shrink-0 ${
                          isCompleted
                            ? 'bg-primary border-primary text-primary-foreground'
                            : isCurrent
                              ? 'border-primary bg-background text-primary scale-110'
                              : 'border-muted-foreground/30 bg-background text-muted-foreground'
                        }`}
                      >
                        {isCompleted ? <CheckCircle className="w-4 h-4" /> : step.icon}
                      </div>
                      <p
                        className={`text-[10px] font-medium mt-1.5 text-center truncate w-full px-1 ${
                          isCurrent ? 'text-primary' : 'text-muted-foreground'
                        }`}
                      >
                        {step.title}
                      </p>
                    </div>
                    {idx < steps.length - 1 && (
                      <div className="flex-1 h-0.5 bg-muted mx-1 max-w-6 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            isCompleted ? 'bg-blue-500' : 'bg-transparent'
                          }`}
                          style={{ width: isCompleted ? '100%' : '0%' }}
                        />
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Step Content */}
          <div className="px-5 py-4 min-h-[260px]">
            {/* Step 1: Recipient */}
            {currentStep === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground mb-3">
                  {t('recognition.wizard.selectRecipientHint')}
                </p>
                <div className="grid grid-cols-1 gap-2 max-h-[200px] overflow-y-auto p-1">
                  {availableRecipients.map((user: any) => (
                    <button
                      key={user._id}
                      type="button"
                      onClick={() => setReceiverId(user._id)}
                      className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                        receiverId === user._id
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-border hover:bg-muted'
                      }`}
                    >
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={user.avatarUrl} />
                        <AvatarFallback className="text-xs">
                          {user.name?.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{user.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {user.position || user.department || ''}
                        </p>
                      </div>
                      {receiverId === user._id && (
                        <CheckCircle className="h-5 w-5 text-primary shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2: Category */}
            {currentStep === 1 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground mb-3">
                  {t('recognition.wizard.selectCategoryHint')}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(CATEGORY_CONFIG).map(([key, config]) => {
                    const Icon = config.icon;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setCategory(key)}
                        className={`flex items-center gap-2 p-3 rounded-lg border text-xs font-medium transition-all ${
                          category === key
                            ? 'border-primary bg-primary/5 ring-1 ring-primary'
                            : 'border-border hover:bg-muted'
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{t(config.labelKey)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 3: Message + Confirm */}
            {currentStep === 2 && (
              <div className="space-y-4">
                {/* Preview */}
                {selectedRecipient && (
                  <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={selectedRecipient.avatarUrl} />
                      <AvatarFallback className="text-[10px]">
                        {selectedRecipient.name?.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">{selectedRecipient.name}</span>
                    <span className="text-xs text-muted-foreground">•</span>
                    {category && (
                      <Badge variant="secondary" className="text-[10px] gap-1">
                        {t(CATEGORY_CONFIG[category]?.labelKey || '')}
                      </Badge>
                    )}
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium mb-1.5 block">
                    {t('recognition.form.message')}
                  </label>
                  <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={t('recognition.form.messagePlaceholder')}
                    rows={4}
                    maxLength={500}
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground mt-1 text-right">
                    {message.length}/500
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isPublic"
                    checked={isPublic}
                    onChange={(e) => setIsPublic(e.target.checked)}
                    className="rounded"
                  />
                  <label htmlFor="isPublic" className="text-sm text-muted-foreground">
                    {t('recognition.form.publicKudos')}
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Footer — navigation buttons */}
          <div className="flex items-center justify-between px-5 py-4 border-t bg-muted/30">
            <Button
              variant="ghost"
              onClick={currentStep === 0 ? onClose : handleBack}
              disabled={isSubmitting}
              size="sm"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              {currentStep === 0 ? t('common.cancel') : t('common.back')}
            </Button>
            <Button
              onClick={handleNext}
              disabled={
                !canGoNext() ||
                isSubmitting ||
                (currentStep === steps.length - 1 && (userPoints?.balance ?? 0) < 3)
              }
              size="sm"
              className="gap-1"
            >
              {currentStep === steps.length - 1 ? (
                <>
                  <Send className="h-4 w-4" />
                  {isSubmitting ? t('common.sending') : t('recognition.sendKudos')}
                </>
              ) : (
                <>
                  {t('common.next')}
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function RecognitionClient() {
  const { t } = useTranslation();
  const router = useRouter();
  const mainRef = useMainRef();
  const user = useAuthStore(useShallow((s) => s.user));
  const selectedOrgId = useSelectedOrganization();
  const [showSendModal, setShowSendModal] = useState(false);
  const [leaderboardPeriod, setLeaderboardPeriod] = useState<
    'week' | 'month' | 'quarter' | 'year' | 'all'
  >('month');

  const orgId = (selectedOrgId ?? user?.organizationId ?? undefined) as
    | Id<'organizations'>
    | undefined;

  // Queries
  const kudosFeed = useQuery(
    api.recognition.getKudosFeed,
    orgId ? { organizationId: orgId } : 'skip',
  );

  const leaderboard = useQuery(
    api.recognition.getLeaderboard,
    orgId ? { organizationId: orgId, period: leaderboardPeriod } : 'skip',
  );

  const myStats = useQuery(
    api.recognition.getUserKudosStats,
    orgId && user?.id ? { organizationId: orgId, userId: user.id as Id<'users'> } : 'skip',
  );

  const myPoints = useQuery(
    api.recognition.getUserPoints,
    orgId && user?.id ? { organizationId: orgId, userId: user.id as Id<'users'> } : 'skip',
  );

  // Mutations
  const reactToKudosMutation = useMutation(api.recognition.reactToKudos);

  const handleReact = async (kudoId: Id<'kudos'>, emoji: string) => {
    if (!user?.id) return;
    try {
      await reactToKudosMutation({
        kudoId,
        userId: user.id as Id<'users'>,
        emoji,
      });
    } catch {
      toast.error(t('recognition.errors.reactFailed'));
    }
  };

  if (!user || !orgId) {
    return (
      <div className="flex items-center justify-center h-64">
        <ShieldLoader size="md" />
      </div>
    );
  }

  return (
    <div className="">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t('recognition.title')}</h1>
            <p className="text-muted-foreground">{t('recognition.subtitle')}</p>
          </div>
          <Button
            onClick={() => {
              const mainEl = mainRef.current;
              if (mainEl) {
                mainEl.scrollTo({ top: 0, behavior: 'smooth' });
              }
              window.scrollTo({ top: 0, behavior: 'smooth' });
              setShowSendModal(true);
            }}
            className="gap-2 w-full sm:w-auto"
          >
            <Send className="h-4 w-4" />
            {t('recognition.sendKudos')}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {myStats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-2">
                  <ThumbsUp className="h-5 w-5 text-green-700 dark:text-green-300" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{myStats.totalReceived}</p>
                  <p className="text-sm text-muted-foreground">{t('recognition.stats.received')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-blue-100 dark:bg-blue-900/30 p-2">
                  <Send className="h-5 w-5 text-blue-700 dark:text-blue-300" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{myStats.totalSent}</p>
                  <p className="text-sm text-muted-foreground">{t('recognition.stats.sent')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-yellow-100 dark:bg-yellow-900/30 p-2">
                  <Star className="h-5 w-5 text-yellow-700 dark:text-yellow-300" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{myPoints?.balance ?? 0}</p>
                  <p className="text-sm text-muted-foreground">{t('recognition.points.balance')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="feed" className="w-full my-4">
        <TabsList className="w-full mb-4 gap-2 bg-transparent p-0 h-auto grid grid-cols-2">
          <TabsTrigger
            value="feed"
            className="w-full px-4 py-2.5 rounded-xl data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center"
          >
            <Heart className="h-4 w-4" />
            {t('recognition.tabs.feed')}
          </TabsTrigger>
          <TabsTrigger
            value="leaderboard"
            className="w-full px-4 py-2.5 rounded-xl data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center"
          >
            <Trophy className="h-4 w-4" />
            {t('recognition.tabs.leaderboard')}
          </TabsTrigger>
        </TabsList>

        {/* Feed Tab */}
        <TabsContent value="feed" className="mt-4">
          {kudosFeed === undefined ? (
            <ShieldLoader size="md" />
          ) : kudosFeed.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Heart className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-lg font-medium text-muted-foreground">
                  {t('recognition.emptyFeed')}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('recognition.emptyFeedHint')}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {kudosFeed.map((kudo) => (
                <KudoCard
                  key={kudo._id}
                  kudo={kudo}
                  currentUserId={user.id as Id<'users'>}
                  onReact={handleReact}
                  t={t}
                  onClick={() => router.push(`/recognition/${kudo._id}`)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Leaderboard Tab */}
        <TabsContent value="leaderboard" className="mt-4">
          <div className="flex justify-end mb-4">
            <Select
              value={leaderboardPeriod}
              onValueChange={(v) =>
                setLeaderboardPeriod(v as 'week' | 'month' | 'quarter' | 'year' | 'all')
              }
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">{t('recognition.period.week')}</SelectItem>
                <SelectItem value="month">{t('recognition.period.month')}</SelectItem>
                <SelectItem value="quarter">{t('recognition.period.quarter')}</SelectItem>
                <SelectItem value="year">{t('recognition.period.year')}</SelectItem>
                <SelectItem value="all">{t('recognition.period.all')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {leaderboard === undefined ? (
            <ShieldLoader size="md" />
          ) : leaderboard.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Trophy className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-lg font-medium text-muted-foreground">
                  {t('recognition.emptyLeaderboard')}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {leaderboard.map((entry, index) => (
                <Card key={entry.userId} className="overflow-hidden">
                  <CardContent className="flex items-center gap-4 py-3 px-4">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted font-bold text-sm">
                      {index + 1}
                    </div>
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={entry.avatarUrl} />
                      <AvatarFallback>{entry.name?.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{entry.name}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {entry.position} {entry.department && `• ${entry.department}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="gap-1">
                        <Heart className="h-3 w-3" />
                        {entry.count}
                      </Badge>
                      {index === 0 && <span className="text-2xl">🥇</span>}
                      {index === 1 && <span className="text-2xl">🥈</span>}
                      {index === 2 && <span className="text-2xl">🥉</span>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Send Kudos Modal */}
      {showSendModal && (
        <SendKudosModal
          open={showSendModal}
          onClose={() => setShowSendModal(false)}
          organizationId={orgId}
          senderId={user.id as Id<'users'>}
        />
      )}
    </div>
  );
}

// ── KudoCard Component ───────────────────────────────────────────────────────

interface KudoCardProps {
  kudo: any;
  currentUserId: Id<'users'>;
  onReact: (kudoId: Id<'kudos'>, emoji: string) => void;
  t: (key: string) => string;
  onClick?: () => void;
}

function KudoCard({ kudo, onReact, t, onClick }: KudoCardProps) {
  const config = CATEGORY_CONFIG[kudo.category as string] ?? CATEGORY_CONFIG.teamwork!;
  const IconComponent = config.icon;

  const timeAgo = getTimeAgo(kudo.createdAt);

  const reactions = kudo.reactions ?? [];
  const reactionCounts = reactions.reduce(
    (acc: Record<string, number>, r: any) => {
      acc[r.emoji] = (acc[r.emoji] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <Card
      className="overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarImage src={kudo.sender?.avatarUrl} />
            <AvatarFallback>{kudo.sender?.name?.slice(0, 2).toUpperCase() ?? '??'}</AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1 text-sm">
              <span className="font-semibold">{kudo.sender?.name}</span>
              <span className="text-muted-foreground">{t('recognition.sentTo')}</span>
              <span className="font-semibold">{kudo.receiver?.name}</span>
              <span className="text-muted-foreground">•</span>
              <span className="text-muted-foreground text-xs">{timeAgo}</span>
            </div>

            <div className="mt-1.5">
              <Badge variant="secondary" className={`gap-1 ${config.color}`}>
                <IconComponent className="h-3 w-3" />
                {t(config.labelKey)}
              </Badge>
            </div>

            <p className="mt-2 text-sm leading-relaxed">{kudo.message}</p>

            {/* Reactions */}
            <div className="flex items-center gap-1.5 mt-3 flex-wrap">
              {Object.entries(reactionCounts).map(([emoji, count]) => (
                <button
                  key={emoji}
                  onClick={(e) => {
                    e.stopPropagation();
                    onReact(kudo._id, emoji);
                  }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted hover:bg-muted/80 text-xs transition-colors"
                >
                  <span>{emoji}</span>
                  <span>{count as number}</span>
                </button>
              ))}
              {REACTION_EMOJIS.filter((e) => !reactionCounts[e])
                .slice(0, 3)
                .map((emoji) => (
                  <button
                    key={emoji}
                    onClick={(e) => {
                      e.stopPropagation();
                      onReact(kudo._id, emoji);
                    }}
                    className="inline-flex items-center px-2 py-0.5 rounded-full border border-dashed border-muted-foreground/30 hover:bg-muted text-xs text-muted-foreground transition-colors"
                  >
                    {emoji}
                  </button>
                ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 30) return `${days}d`;
  return new Date(timestamp).toLocaleDateString();
}
