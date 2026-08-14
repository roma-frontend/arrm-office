'use client';

import { useState } from 'react';
import { useQuery } from '@/lib/convex-typed';
import { useRouter } from 'next/navigation';
import { api } from '@/convex/_generated/api';
import { useAuthStore } from '@/store/useAuthStore';
import { useTranslation } from 'react-i18next';
import type { Id } from '@/convex/_generated/dataModel';

/** Fields from the ticket document used in this component */
interface TicketData {
  _id: string;
  ticketNumber: string;
  status: string;
  priority: string;
  title: string;
  description: string;
  createdAt: number;
  assigneeName?: string;
}
import {
  Ticket,
  Clock,
  CheckCircle,
  AlertCircle,
  Plus,
  MessageSquare,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetBody,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CreateTicketWizard } from '@/components/help/CreateTicketWizard';
import { ShieldLoader } from '@/components/ui/ShieldLoader';

export default function HelpSupportPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuthStore();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [_showPlanLimit, setShowPlanLimit] = useState(false);

  const myTickets = useQuery(
    api.tickets.getMyTickets,
    user?.id ? { userId: user.id as Id<'users'> } : 'skip',
  );

  const stats = useQuery(api.tickets.getTicketStats);

  // Get organization plan
  const userOrg = useQuery(
    api.organizations.main.getMyOrganization,
    user?.id ? { userId: user.id as Id<'users'> } : 'skip',
  );

  // Check plan limitations
  const canCreateTickets = userOrg?.plan === 'professional' || userOrg?.plan === 'enterprise';
  const _canUseCriticalPriority = userOrg?.plan === 'enterprise';
  const _hasSLA = userOrg?.plan === 'enterprise';
  const ticketLimit = userOrg?.plan === 'professional' ? 10 : null;
  const _historyDays = userOrg?.plan === 'professional' ? 30 : null;

  // Count tickets this month
  const currentMonthTickets =
    myTickets?.filter((t) => {
      const ticketDate = new Date(t.createdAt);
      const now = new Date();
      return (
        ticketDate.getMonth() === now.getMonth() && ticketDate.getFullYear() === now.getFullYear()
      );
    }).length || 0;

  const isLimitReached = ticketLimit ? currentMonthTickets >= ticketLimit : false;

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <ShieldLoader size="lg" />
      </div>
    );
  }

  const openTickets =
    myTickets?.filter((t) => t.status !== 'closed' && t.status !== 'resolved') || [];
  const closedTickets =
    myTickets?.filter((t) => t.status === 'closed' || t.status === 'resolved') || [];

  const handleCreateTicket = () => {
    if (!canCreateTickets) {
      setShowPlanLimit(true);
      return;
    }
    if (isLimitReached) {
      setShowPlanLimit(true);
      return;
    }
    setCreateDialogOpen(true);
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="mx-auto max-w-5xl">
        {/* Sticky Header */}
        <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <h1
                  className="text-2xl sm:text-3xl font-bold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {t('help.title')}
                </h1>
                {userOrg && (
                  <Badge
                    variant="outline"
                    className={
                      userOrg.plan === 'enterprise'
                        ? 'border-(--purple-outline) text-(--purple-text)'
                        : userOrg.plan === 'professional'
                          ? 'border-(--brand-outline) text-(--brand-text)'
                          : ''
                    }
                  >
                    {userOrg.plan.toUpperCase()}
                  </Badge>
                )}
              </div>
              <p className="text-sm sm:text-base text-muted-foreground">{t('help.subtitle')}</p>
              {userOrg?.plan === 'starter' && (
                <p className="text-xs sm:text-sm text-(--warning-text) mt-2">
                  ⚠️ {t('help.planLimit.starter')}
                </p>
              )}
              {userOrg?.plan === 'professional' && (
                <p className="text-xs md:text-sm text-(--warning-text) mt-2">
                  📊{' '}
                  {t('help.planLimit.professional', {
                    used: currentMonthTickets,
                    limit: ticketLimit,
                  })}
                </p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <Sheet open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <SheetTrigger asChild>
                  <Button
                    className="flex items-center gap-2 w-full sm:w-auto justify-center btn-gradient text-white font-medium shadow-md hover:shadow-lg"
                    onClick={handleCreateTicket}
                    disabled={!canCreateTickets || isLimitReached}
                  >
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">{t('help.createTicket')}</span>
                    <span className="sm:hidden">{t('help.createTicket')}</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" size="lg" closeLabel={t('common.close', 'Close')}>
                  <SheetHeader>
                    <SheetTitle className="text-lg md:text-xl">{t('help.createTicket')}</SheetTitle>
                    <SheetDescription className="text-sm">{t('help.subtitle')}</SheetDescription>
                  </SheetHeader>
                  <SheetBody>
                    <CreateTicketWizard
                      userId={user.id as Id<'users'>}
                      onComplete={() => setCreateDialogOpen(false)}
                      onCancel={() => setCreateDialogOpen(false)}
                    />
                  </SheetBody>
                </SheetContent>
              </Sheet>
              {/* Upgrade Plan button — only for admins and superadmins */}
              {(user?.role === 'admin' || user?.role === 'superadmin') && (
                <Button
                  variant="outline"
                  onClick={() => router.push('/superadmin/subscriptions')}
                  className="gap-2 w-full sm:w-auto"
                >
                  <span className="hidden sm:inline">💎 {t('help.upgradePlan')}</span>
                  <span className="sm:hidden">💎</span>
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
          <StatCard
            title={t('help.stats.total')}
            value={myTickets?.length || 0}
            icon={Ticket}
            color="blue"
          />
          <StatCard
            title={t('help.stats.open')}
            value={openTickets.length}
            icon={AlertCircle}
            color="orange"
          />
          <StatCard
            title={t('help.stats.resolved')}
            value={closedTickets.length}
            icon={CheckCircle}
            color="green"
          />
          <StatCard
            title={t('help.stats.avgResponse')}
            value={stats?.avgResponseTime ? `${Math.round(stats.avgResponseTime)}ч` : '—'}
            icon={Clock}
            color="purple"
          />
        </div>

        {/* Tickets Tabs */}
        <Tabs defaultValue="open" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger
              value="open"
              className="data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white data-[state=inactive]:bg-(--background-subtle) shadow-sm font-medium flex items-center gap-1 md:gap-2 text-xs md:text-sm"
            >
              <AlertCircle className="w-3 h-3 md:w-4 md:h-4" />
              <span className="hidden sm:inline">{t('help.tabs.open')}</span>
              <span className="sm:hidden">{t('help.tabs.open')}</span>
              <Badge variant="warning" className="ml-1 md:ml-2 text-xs border-0">
                {openTickets.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger
              value="closed"
              className="data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white data-[state=inactive]:bg-(--background-subtle) shadow-sm font-medium flex items-center gap-1 md:gap-2 text-xs md:text-sm"
            >
              <CheckCircle className="w-3 h-3 md:w-4 md:h-4" />
              <span className="hidden sm:inline">{t('help.tabs.closed')}</span>
              <span className="sm:hidden">{t('help.tabs.closed')}</span>
              <Badge variant="destructive" className="ml-1 md:ml-2 text-xs border-0">
                {closedTickets.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="open">
            <TicketList tickets={openTickets} emptyMessage={t('help.noOpenTickets')} />
          </TabsContent>

          <TabsContent value="closed">
            <TicketList tickets={closedTickets} emptyMessage={t('help.noClosedTickets')} />
          </TabsContent>
        </Tabs>

        {/* Quick Help */}
        <Card className="mt-6" style={{ background: 'var(--card)' }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              {t('help.quickHelp.title')}
            </CardTitle>
            <CardDescription>{t('help.quickHelp.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <QuickHelpCard
                icon="📧"
                title={t('help.quickHelp.email.title')}
                description={t('help.quickHelp.email.desc')}
              />
              <QuickHelpCard
                icon="💬"
                title={t('help.quickHelp.chat.title')}
                description={t('help.quickHelp.chat.desc')}
                onClick={() => router.push('/chat')}
              />
              <QuickHelpCard
                icon="📚"
                title={t('help.quickHelp.docs.title')}
                description={t('help.quickHelp.docs.desc')}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Stat Card Component
function StatCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  const colorClasses: Record<string, string> = {
    blue: 'text-blue-500',
    green: 'text-green-500',
    red: 'text-red-500',
    purple: 'text-purple-500',
    orange: 'text-orange-500',
  };

  return (
    <Card style={{ background: 'var(--background-subtle)' }}>
      <CardContent className="p-3 md:p-4">
        <div className="flex items-center justify-between mb-1 md:mb-2">
          <p className="text-[10px] md:text-xs text-muted-foreground truncate">{title}</p>
          <Icon className={`w-3 h-3 md:w-4 md:h-4 shrink-0 ${colorClasses[color]}`} />
        </div>
        <p className="text-lg md:text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

// Ticket List Component
function TicketList({ tickets, emptyMessage }: { tickets: TicketData[]; emptyMessage: string }) {
  if (tickets.length === 0) {
    return (
      <Card style={{ background: 'var(--card)' }}>
        <CardContent className="py-8 md:py-12 text-center text-muted-foreground">
          <Ticket className="w-10 h-10 md:w-12 md:h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm md:text-base">{emptyMessage}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {tickets.map((ticket) => (
        <Card key={ticket._id} style={{ background: 'var(--card)' }}>
          <CardContent className="p-3 md:p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1 md:gap-2 mb-2">
                  <span className="font-mono text-xs md:text-sm">{ticket.ticketNumber}</span>
                  <Badge
                    variant={
                      ticket.status === 'closed' || ticket.status === 'resolved'
                        ? 'outline'
                        : 'default'
                    }
                    className="text-xs"
                  >
                    {ticket.status}
                  </Badge>
                  <Badge
                    variant={
                      ticket.priority === 'critical'
                        ? 'destructive'
                        : ticket.priority === 'high'
                          ? 'default'
                          : 'secondary'
                    }
                    className="text-xs"
                  >
                    {ticket.priority}
                  </Badge>
                </div>
                <p
                  className="font-semibold mb-1 text-sm md:text-base truncate"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {ticket.title}
                </p>
                <p className="text-xs md:text-sm text-muted-foreground line-clamp-2">
                  {ticket.description}
                </p>
                <div className="flex flex-wrap items-center gap-2 md:gap-4 mt-2 md:mt-3 text-[10px] md:text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(ticket.createdAt).toLocaleDateString()}
                  </span>
                  {ticket.assigneeName && (
                    <span className="truncate">👤 {ticket.assigneeName}</span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// Quick Help Card Component
function QuickHelpCard({
  icon,
  title,
  description,
  onClick,
}: {
  icon: string;
  title: string;
  description: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`p-3 md:p-4 rounded-lg border cursor-pointer transition-colors hover:border-primary/50 ${onClick ? 'hover:bg-primary/5' : ''}`}
      style={{ background: 'var(--background-subtle)' }}
    >
      <div className="text-xl md:text-2xl mb-2">{icon}</div>
      <h4
        className="font-semibold mb-1 text-sm md:text-base"
        style={{ color: 'var(--text-primary)' }}
      >
        {title}
      </h4>
      <p className="text-xs md:text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

// Plan Card Component
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for upcoming plan comparison section
function PlanCard({
  name,
  price,
  features,
  current,
  recommended,
}: {
  name: string;
  price: string;
  features: { text: string; included: boolean }[];
  current?: boolean;
  recommended?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div
      className={`p-3 md:p-4 rounded-lg border ${
        recommended ? 'border-blue-500 bg-blue-500/5' : ''
      } ${current ? 'border-green-500 bg-green-500/5' : ''}`}
    >
      <div className="text-center mb-3">
        <h4 className="font-bold text-sm md:text-base">{name}</h4>
        <p className="text-xl md:text-2xl font-bold">{price}</p>
        {current && <Badge className="mt-2 bg-green-500 text-xs">{t('help.plans.current')}</Badge>}
        {recommended && !current && (
          <Badge className="mt-2 bg-blue-500 text-xs">{t('help.plans.recommended')}</Badge>
        )}
      </div>
      <ul className="space-y-2 text-xs md:text-sm">
        {features.map((feature, idx) => (
          <li key={idx} className="flex items-start gap-2">
            {feature.included ? (
              <CheckCircle className="w-3 h-3 md:w-4 md:h-4 text-green-500 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-3 h-3 md:w-4 md:h-4 text-red-500 shrink-0 mt-0.5" />
            )}
            <span className={feature.included ? '' : 'text-muted-foreground'}>{feature.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
