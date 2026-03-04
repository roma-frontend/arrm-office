"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  DollarSign, 
  Users, 
  TrendingUp, 
  AlertCircle,
  Download,
  RefreshCw,
  Calendar,
  CreditCard,
  Play,
  Terminal,
  FileSpreadsheet,
  FileText,
  BarChart3,
  RefreshCcw,
  Bell,
  ShieldAlert
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/useAuthStore";

const SUPERADMIN_EMAIL = "romangulanyan@gmail.com";

interface Subscription {
  _id: string;
  _creationTime: number;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripePriceId: string;
  stripeCurrentPeriodEnd: number;
  status: string;
  plan: string;
  userEmail?: string;
  organizationId?: string;
  userId?: string;
  cancelAtPeriodEnd?: boolean;
  currentPeriodStart?: number;
  trialEnd?: number;
}

export default function StripeDashboardPage() {
  const subscriptions = useQuery(api.subscriptions.listAll) as Subscription[] | undefined;
  
  // Get current user from auth store
  const { user: currentUser } = useAuthStore();
  
  // Check if user is superadmin
  const isSuperAdmin = currentUser?.email?.toLowerCase() === SUPERADMIN_EMAIL;
  
  console.log("🔍 [Stripe Dashboard] currentUser:", currentUser);
  console.log("🔍 [Stripe Dashboard] isSuperAdmin:", isSuperAdmin);
  console.log("🔍 [Stripe Dashboard] email check:", currentUser?.email?.toLowerCase(), "===", SUPERADMIN_EMAIL);
  
  // Wait for user to load
  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div>Loading...</div>
      </div>
    );
  }
  
  // If not superadmin, show access denied
  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2 text-red-500">
              <ShieldAlert className="w-6 h-6" />
              <CardTitle>Access Denied</CardTitle>
            </div>
            <CardDescription>
              This page is only accessible to the superadmin.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Payment and subscription management features are restricted to authorized personnel only.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }
  const [refreshing, setRefreshing] = useState(false);
  const [runningScript, setRunningScript] = useState<string | null>(null);
  const [scriptOutput, setScriptOutput] = useState<string>("");

  const stats = useMemo(() => {
    if (!subscriptions) return null;

    const planPrices: Record<string, number> = {
      starter: 0,
      professional: 49,
      enterprise: 199,
    };

    const byStatus: Record<string, number> = {};
    const byPlan: Record<string, number> = {};
    let mrr = 0;
    let totalRevenue = 0;

    subscriptions.forEach(sub => {
      byStatus[sub.status] = (byStatus[sub.status] || 0) + 1;
      byPlan[sub.plan] = (byPlan[sub.plan] || 0) + 1;

      if (sub.status === 'active') {
        const price = planPrices[sub.plan] || 0;
        mrr += price;
        totalRevenue += price;
      }
    });

    // Calculate growth
    const now = Date.now();
    const lastMonth = now - (30 * 24 * 60 * 60 * 1000);
    const lastMonthSubs = subscriptions.filter(s => s._creationTime < lastMonth);
    const growth = ((subscriptions.length - lastMonthSubs.length) / Math.max(lastMonthSubs.length, 1)) * 100;

    // Trial reminders
    const trialEnding = subscriptions.filter(sub => {
      if (sub.status !== 'trialing' || !sub.trialEnd) return false;
      const daysLeft = Math.ceil((sub.trialEnd - now) / (1000 * 60 * 60 * 24));
      return daysLeft >= 0 && daysLeft <= 7;
    });

    return {
      total: subscriptions.length,
      byStatus,
      byPlan,
      mrr,
      totalRevenue,
      growth: growth.toFixed(1),
      trialEnding: trialEnding.length,
      active: byStatus.active || 0,
      trialing: byStatus.trialing || 0,
      canceled: byStatus.canceled || 0,
    };
  }, [subscriptions]);

  const handleRefresh = async () => {
    setRefreshing(true);
    // Simulate refresh
    setTimeout(() => setRefreshing(false), 1000);
  };

  const handleRunScript = async (script: string) => {
    setRunningScript(script);
    setScriptOutput("");
    
    try {
      toast.loading(`Running ${script}...`, { id: script });
      
      const response = await fetch('/api/stripe/run-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script }),
      });

      const data = await response.json();
      
      if (data.success) {
        setScriptOutput(data.output);
        toast.success(`✅ ${script} completed successfully`, { id: script });
      } else {
        setScriptOutput(data.output || data.error);
        toast.error(`❌ ${script} failed`, { id: script });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setScriptOutput(message);
      toast.error(`❌ Error: ${message}`, { id: script });
    } finally {
      setRunningScript(null);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      active: 'bg-green-500',
      trialing: 'bg-blue-500',
      canceled: 'bg-red-500',
      past_due: 'bg-yellow-500',
      incomplete: 'bg-gray-500',
    };
    return colors[status] || 'bg-gray-500';
  };

  const getStatusEmoji = (status: string) => {
    const emojis: Record<string, string> = {
      active: '✅',
      trialing: '🆓',
      canceled: '❌',
      past_due: '⚠️',
      incomplete: '⏳',
    };
    return emojis[status] || '❓';
  };

  const getPlanEmoji = (plan: string) => {
    const emojis: Record<string, string> = {
      starter: '🚀',
      professional: '💼',
      enterprise: '🏢',
    };
    return emojis[plan] || '📦';
  };

  if (subscriptions === undefined) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading subscriptions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Button
            variant="ghost"
            onClick={() => window.history.back()}
            className="mb-4 -ml-2 text-sm"
          >
            ← Back to Dashboard
          </Button>
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold">💳 Stripe Dashboard</h1>
          <p className="text-sm md:text-base text-muted-foreground mt-2">
            Real-time subscription analytics and insights
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Subscriptions</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">
                {stats.active} active, {stats.trialing} trialing
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Monthly Revenue (MRR)</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${stats.mrr}</div>
              <p className="text-xs text-muted-foreground">
                From {stats.active} active subscriptions
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Growth Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.growth}%</div>
              <p className="text-xs text-muted-foreground">
                Last 30 days
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Trial Ending Soon</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.trialEnding}</div>
              <p className="text-xs text-muted-foreground">
                Within 7 days
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Stripe Commands Section */}
      <Card className="border-2 border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-transparent">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            Stripe Commands
          </CardTitle>
          <CardDescription>Execute Stripe operations directly from the dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <Button
              onClick={() => handleRunScript('stripe:view')}
              disabled={runningScript !== null}
              variant="outline"
              className="h-auto flex-col items-start gap-2 p-4 hover:bg-blue-500/10 hover:border-blue-500/50"
            >
              <div className="flex items-center gap-2 w-full">
                <Terminal className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="font-semibold">View Transactions</span>
              </div>
              <p className="text-xs text-muted-foreground text-left">Display all Stripe transactions</p>
              {runningScript === 'stripe:view' && (
                <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
              )}
            </Button>

            <Button
              onClick={() => handleRunScript('stripe:export')}
              disabled={runningScript !== null}
              variant="outline"
              className="h-auto flex-col items-start gap-2 p-4 hover:bg-green-500/10 hover:border-green-500/50"
            >
              <div className="flex items-center gap-2 w-full">
                <FileSpreadsheet className="w-4 h-4 text-green-600 dark:text-green-400" />
                <span className="font-semibold">Export to Excel</span>
              </div>
              <p className="text-xs text-muted-foreground text-left">Export data to XLSX format</p>
              {runningScript === 'stripe:export' && (
                <RefreshCw className="w-4 h-4 animate-spin text-green-600" />
              )}
            </Button>

            <Button
              onClick={() => handleRunScript('stripe:export-pdf')}
              disabled={runningScript !== null}
              variant="outline"
              className="h-auto flex-col items-start gap-2 p-4 hover:bg-red-500/10 hover:border-red-500/50"
            >
              <div className="flex items-center gap-2 w-full">
                <FileText className="w-4 h-4 text-red-600 dark:text-red-400" />
                <span className="font-semibold">Export to PDF</span>
              </div>
              <p className="text-xs text-muted-foreground text-left">Generate PDF report</p>
              {runningScript === 'stripe:export-pdf' && (
                <RefreshCw className="w-4 h-4 animate-spin text-red-600" />
              )}
            </Button>

            <Button
              onClick={() => handleRunScript('stripe:growth-chart')}
              disabled={runningScript !== null}
              variant="outline"
              className="h-auto flex-col items-start gap-2 p-4 hover:bg-purple-500/10 hover:border-purple-500/50"
            >
              <div className="flex items-center gap-2 w-full">
                <BarChart3 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span className="font-semibold">Growth Chart</span>
              </div>
              <p className="text-xs text-muted-foreground text-left">Generate growth visualization</p>
              {runningScript === 'stripe:growth-chart' && (
                <RefreshCw className="w-4 h-4 animate-spin text-purple-600" />
              )}
            </Button>

            <Button
              onClick={() => handleRunScript('stripe:sync')}
              disabled={runningScript !== null}
              variant="outline"
              className="h-auto flex-col items-start gap-2 p-4 hover:bg-orange-500/10 hover:border-orange-500/50"
            >
              <div className="flex items-center gap-2 w-full">
                <RefreshCcw className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                <span className="font-semibold">Sync Data</span>
              </div>
              <p className="text-xs text-muted-foreground text-left">Sync with Stripe API</p>
              {runningScript === 'stripe:sync' && (
                <RefreshCw className="w-4 h-4 animate-spin text-orange-600" />
              )}
            </Button>

            <Button
              onClick={() => handleRunScript('stripe:check-trials')}
              disabled={runningScript !== null}
              variant="outline"
              className="h-auto flex-col items-start gap-2 p-4 hover:bg-yellow-500/10 hover:border-yellow-500/50"
            >
              <div className="flex items-center gap-2 w-full">
                <Bell className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                <span className="font-semibold">Check Trials</span>
              </div>
              <p className="text-xs text-muted-foreground text-left">Check trial reminders</p>
              {runningScript === 'stripe:check-trials' && (
                <RefreshCw className="w-4 h-4 animate-spin text-yellow-600" />
              )}
            </Button>

            <Button
              onClick={() => handleRunScript('stripe:add-test-data')}
              disabled={runningScript !== null}
              variant="outline"
              className="h-auto flex-col items-start gap-2 p-4 hover:bg-pink-500/10 hover:border-pink-500/50"
            >
              <div className="flex items-center gap-2 w-full">
                <Play className="w-4 h-4 text-pink-600 dark:text-pink-400" />
                <span className="font-semibold">Add Test Data</span>
              </div>
              <p className="text-xs text-muted-foreground text-left">Add sample subscriptions</p>
              {runningScript === 'stripe:add-test-data' && (
                <RefreshCw className="w-4 h-4 animate-spin text-pink-600" />
              )}
            </Button>
          </div>

          {/* Output Display */}
          {scriptOutput && (
            <div className="mt-4 p-4 bg-slate-900 dark:bg-slate-950 rounded-lg border border-slate-700">
              <div className="flex items-center gap-2 mb-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-semibold text-emerald-400">Output:</span>
              </div>
              <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono overflow-x-auto">
                {scriptOutput}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Status Breakdown */}
        {stats && (
          <Card>
            <CardHeader>
              <CardTitle>Subscriptions by Status</CardTitle>
              <CardDescription>Current distribution of subscription statuses</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(stats.byStatus).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{getStatusEmoji(status)}</span>
                    <span className="capitalize font-medium">{status}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-32 bg-secondary rounded-full h-2">
                      <div
                        className={`${getStatusColor(status)} h-2 rounded-full transition-all`}
                        style={{ width: `${(count / stats.total) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold w-12 text-right">{count}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Plan Breakdown */}
        {stats && (
          <Card>
            <CardHeader>
              <CardTitle>Subscriptions by Plan</CardTitle>
              <CardDescription>Distribution across pricing tiers</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(stats.byPlan).map(([plan, count]) => {
                const prices: Record<string, number> = {
                  starter: 0,
                  professional: 49,
                  enterprise: 199,
                };
                const price = prices[plan] || 0;
                
                return (
                  <div key={plan} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{getPlanEmoji(plan)}</span>
                      <span className="capitalize font-medium">{plan}</span>
                      <span className="text-xs text-muted-foreground">${price}/mo</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-32 bg-secondary rounded-full h-2">
                        <div
                          className="bg-primary h-2 rounded-full transition-all"
                          style={{ width: `${(count / stats.total) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-bold w-12 text-right">{count}</span>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recent Subscriptions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Subscriptions</CardTitle>
          <CardDescription>Latest subscription activity</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-3 font-semibold">Customer</th>
                  <th className="pb-3 font-semibold">Plan</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold">MRR</th>
                  <th className="pb-3 font-semibold">Period End</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions?.slice(0, 10).map((sub) => {
                  const prices: Record<string, number> = {
                    starter: 0,
                    professional: 49,
                    enterprise: 199,
                  };
                  const price = prices[sub.plan] || 0;

                  return (
                    <tr key={sub._id} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <CreditCard className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">{sub.userEmail || 'No email'}</span>
                        </div>
                      </td>
                      <td className="py-3">
                        <span className="capitalize">{getPlanEmoji(sub.plan)} {sub.plan}</span>
                      </td>
                      <td className="py-3">
                        <Badge variant="outline" className="capitalize">
                          {getStatusEmoji(sub.status)} {sub.status}
                        </Badge>
                      </td>
                      <td className="py-3 font-semibold">
                        ${price}
                      </td>
                      <td className="py-3 text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(sub.stripeCurrentPeriodEnd).toLocaleDateString()}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
