/**
 * Plans & Tariffs constructor — the superadmin's no-code pricing studio.
 *
 * One page, everything live from Convex:
 *   - Three editable plan cards (name, tagline, prices, CTA, flags) with a
 *     Monthly/Yearly price preview animation.
 *   - A Module × Plan matrix driven by each module's settingsSchema (no
 *     per-module hardcode): toggle + limit stepper per cell.
 *   - Heatmap rows where the plans differ, search, "enable in all plans".
 *   - Module drawer with status, feature-toggle link and per-plan options.
 *   - Draft/Publish with versioned snapshots + Restore.
 *
 * Draft edits never go live: only Publish creates a billingPlanVersions
 * snapshot, and the landing + enforcement engine read ONLY those.
 */

'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { toast } from 'sonner';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Crown,
  DatabaseZap,
  History,
  Lock,
  Minus,
  Plus,
  Rocket,
  Search,
  Send,
  Sparkles,
  Star,
  Unlock,
  Zap,
} from 'lucide-react';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

type PlanKey = 'starter' | 'pro' | 'enterprise';
type ModuleStatus = 'active' | 'beta' | 'coming';
type OverLimit = 'block' | 'warn' | 'allow';

interface ModuleSchemaOption {
  type: 'number' | 'boolean' | 'string';
  unit?: string;
  min?: number;
  max?: number;
}

interface ModuleRow {
  _id: Id<'billingModules'>;
  key: string;
  name: string;
  description?: string;
  icon?: string;
  category: string;
  status: ModuleStatus;
  isCore: boolean;
  featureToggleKey?: string;
  settingsSchema?: Record<string, ModuleSchemaOption>;
  sortOrder?: number;
}

interface EntitlementRow {
  _id: Id<'billingPlanEntitlements'>;
  moduleKey: string;
  included: boolean;
  limits?: Record<string, number | boolean>;
  overLimit: OverLimit;
}

interface PlanRow {
  _id: Id<'billingPlans'>;
  key: PlanKey;
  name: string;
  tagline?: string;
  priceMonthly?: number;
  priceYearly?: number;
  currency: string;
  isActive: boolean;
  isPopular: boolean;
  isCustom: boolean;
  ctaLabel?: string;
  sortOrder: number;
  publishedVersion?: number;
  publishedAt?: number;
  hasDraftChanges: boolean;
  entitlements: EntitlementRow[];
}

interface PublishedVersionRow {
  _id: Id<'billingPlanVersions'>;
  version: number;
  publishedAt: number;
  isLive: boolean;
}

const PLAN_ACCENTS: Record<PlanKey, { from: string; to: string; glow: string }> = {
  starter: { from: '#10b981', to: '#059669', glow: 'rgba(16,185,129,0.28)' },
  pro: { from: '#3b82f6', to: '#2563eb', glow: 'rgba(59,130,246,0.32)' },
  enterprise: { from: '#8b5cf6', to: '#6d28d9', glow: 'rgba(139,92,246,0.3)' },
};

const MODULE_ICONS: Record<string, typeof Zap> = {
  LayoutDashboard: Zap,
  Users: Zap,
  Building2: Zap,
  Briefcase: Zap,
  Network: Zap,
  Car: Zap,
  Timer: Zap,
  Clock: Zap,
  CalendarOff: Zap,
  CalendarDays: Zap,
  DoorOpen: Zap,
  Video: Zap,
  Activity: Zap,
  Target: Zap,
  ClipboardCheck: Zap,
  Crosshair: Zap,
  Heart: Zap,
  Gift: Zap,
  ClipboardList: Zap,
  UserPlus: Zap,
  Rocket: Zap,
  UserMinus: Zap,
  GraduationCap: Zap,
  FilePlus2: Zap,
  Wallet: Zap,
  DollarSign: Zap,
  Receipt: Zap,
  Package: Zap,
  BarChart3: Zap,
  LineChart: Zap,
  MessageCircle: Zap,
  Megaphone: Zap,
  UserCheck: Zap,
  Mail: Zap,
  Ticket: Zap,
  FileText: Zap,
  PenTool: Zap,
  Database: Zap,
  Globe: Zap,
  Cpu: Zap,
  CheckSquare: Zap,
  Sparkles: Zap,
  Wand2: Zap,
  ShieldCheck: Zap,
  Shield: Zap,
  Bot: Zap,
  Columns2: Zap,
  KeyRound: Zap,
  Smartphone: Zap,
  Code2: Zap,
  User: Zap,
};

function moduleIcon(name?: string) {
  const Cmp = (name && MODULE_ICONS[name]) || Zap;
  return <Cmp className="h-4 w-4" />;
}

export function PlansClient() {
  const { t } = useTranslation();
  const data = useQuery(api.billing.plans.listBillingData);
  const seedCatalog = useMutation(api.billing.seed.seedBillingCatalog);
  const savePlan = useMutation(api.billing.plans.savePlanDraft);
  const saveEnt = useMutation(api.billing.plans.saveEntitlementDraft);
  const publishPlans = useMutation(api.billing.plans.publishBillingPlans);

  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
  const [search, setSearch] = useState('');
  const [drawerModule, setDrawerModule] = useState<string | null>(null);
  const [versionsPlan, setVersionsPlan] = useState<Id<'billingPlans'> | null>(null);
  const [seeding, setSeeding] = useState(false);

  // Stable references for the memo deps — `data?.plans ?? []` would create a
  // fresh array on every render and defeat the memoization below.
  const plans = useMemo(() => data?.plans ?? [], [data]);
  const modules = useMemo(() => data?.modules ?? [], [data]);
  const loading = data === undefined;

  const moduleByKey = useMemo(() => {
    const m = new Map<string, ModuleRow>();
    for (const mod of modules) m.set(mod.key, mod);
    return m;
  }, [modules]);

  const entByPlanModule = useMemo(() => {
    const m = new Map<string, EntitlementRow>();
    for (const plan of plans) {
      for (const e of plan.entitlements) m.set(`${plan._id}::${e.moduleKey}`, e);
    }
    return m;
  }, [plans]);

  const openModule = drawerModule ? moduleByKey.get(drawerModule) : undefined;

  const filteredModules = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return modules;
    return modules.filter(
      (m) => m.key.toLowerCase().includes(q) || m.name.toLowerCase().includes(q),
    );
  }, [modules, search]);

  // Rows whose settings differ between plans → heatmap highlight.
  const differingKeys = useMemo(() => {
    const set = new Set<string>();
    for (const mod of modules) {
      const states = plans.map((p) => {
        const e = entByPlanModule.get(`${p._id}::${mod.key}`);
        return JSON.stringify({ i: e?.included ?? false, l: e?.limits ?? null });
      });
      if (new Set(states).size > 1) set.add(mod.key);
    }
    return set;
  }, [modules, plans, entByPlanModule]);

  const grouped = useMemo(() => {
    const out: Array<{ category: string; modules: ModuleRow[] }> = [];
    const order: string[] = [];
    for (const mod of filteredModules) {
      if (mod.status === 'coming') continue;
      let group = out.find((g) => g.category === mod.category);
      if (!group) {
        group = { category: mod.category, modules: [] };
        out.push(group);
        order.push(mod.category);
      }
      group.modules.push(mod);
    }
    const coming = filteredModules.filter((m) => m.status === 'coming');
    for (const group of out) {
      group.modules.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    }
    return { groups: out, coming };
  }, [filteredModules]);

  const anyDraft = plans.some((p) => p.hasDraftChanges);
  const lastPublished = plans.reduce<number | null>((acc, p) => {
    if (!p.publishedAt) return acc;
    return acc === null ? p.publishedAt : Math.max(acc, p.publishedAt);
  }, null);

  const patchPlan = async (planId: Id<'billingPlans'>, patch: Record<string, unknown>) => {
    try {
      await savePlan({ planId, patch: patch as never });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const setEnt = async (
    planId: Id<'billingPlans'>,
    module: ModuleRow,
    patch: {
      included?: boolean;
      limits?: Record<string, number | boolean> | null;
      overLimit?: OverLimit;
    },
  ) => {
    const current = entByPlanModule.get(`${planId}::${module.key}`);
    try {
      await saveEnt({
        planId,
        moduleKey: module.key,
        included: patch.included ?? current?.included ?? false,
        limits:
          patch.limits !== undefined
            ? patch.limits
              ? JSON.stringify(patch.limits)
              : null
            : current?.limits
              ? JSON.stringify(current.limits)
              : null,
        overLimit: patch.overLimit ?? current?.overLimit ?? 'block',
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const enableInAllPlans = async (module: ModuleRow) => {
    for (const plan of plans) {
      await setEnt(plan._id, module, { included: true });
    }
    toast.success(t('billing.plans.enabledInAll', 'Enabled in all plans'));
  };

  const doPublish = async (planIds?: Id<'billingPlans'>[]) => {
    try {
      const res = await publishPlans({ planIds });
      toast.success(
        t(
          'billing.plans.publishedToast',
          'Published {{n}} plan(s) — live on the landing and in the product',
          {
            n: res.published.length,
          },
        ),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const doSeed = async () => {
    setSeeding(true);
    try {
      const res = await seedCatalog();
      toast.success(
        t(
          'billing.plans.seededToast',
          'Catalog ready: {{modules}} modules, {{plans}} plans, version 1 published',
          {
            modules: res.modulesInserted,
            plans: res.plansInserted,
          },
        ),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSeeding(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <ShieldLoader size="lg" />
      </div>
    );
  }

  // ── Empty state: catalog not seeded yet ──────────────────────────────────
  if (modules.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-12">
        <Header t={t} />
        <div className="mt-8 rounded-3xl border border-dashed border-(--border-default) bg-(--card)/40 p-12 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-(--brand)/10 text-(--brand)">
            <DatabaseZap className="h-8 w-8" />
          </div>
          <h2 className="mt-5 text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            {t('billing.plans.emptyTitle', 'The tariff catalog is empty')}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-(--text-muted)">
            {t(
              'billing.plans.emptyHint',
              'Initialize the built-in catalog — 45+ modules across 11 categories, the Starter/Pro/Enterprise plans and the full entitlement matrix. Version 1 is published automatically.',
            )}
          </p>
          <Button className="mt-6 gap-2" onClick={doSeed} disabled={seeding}>
            {seeding ? <ShieldLoader size="xs" variant="inline" /> : <Rocket className="h-4 w-4" />}
            {t('billing.plans.seedCatalog', 'Initialize catalog')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <Header t={t} />

      {/* Status bar */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Badge variant={anyDraft ? 'warning' : 'success'} className="gap-1.5">
          {anyDraft ? (
            <>
              <PenDot />
              {t('billing.plans.draftChanges', 'Unpublished draft changes')}
            </>
          ) : (
            <>
              <Check className="h-3 w-3" />
              {t('billing.plans.inSync', 'All changes published')}
            </>
          )}
        </Badge>
        {lastPublished && (
          <span className="text-xs text-(--text-muted)">
            {t('billing.plans.lastPublished', 'Last published {{date}}', {
              date: new Date(lastPublished).toLocaleString(),
            })}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {/* Monthly / Yearly price preview */}
          <div className="flex items-center gap-0.5 rounded-full border border-(--border-default) bg-(--card)/60 p-0.5">
            {(['monthly', 'yearly'] as const).map((period) => (
              <button
                key={period}
                onClick={() => setBilling(period)}
                aria-pressed={billing === period}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                  billing === period
                    ? 'bg-(--brand) text-white'
                    : 'text-(--text-muted) hover:text-(--text-primary)',
                )}
              >
                {t(period === 'monthly' ? 'billing.plans.monthly' : 'billing.plans.yearly')}
              </button>
            ))}
          </div>
          <Button
            variant="default"
            className="gap-1.5"
            disabled={!anyDraft}
            onClick={() => doPublish()}
          >
            <Send className="h-4 w-4" />
            {t('billing.plans.publishAll', 'Publish all')}
          </Button>
        </div>
      </div>

      {/* ── Plan cards ─────────────────────────────────────────────────────── */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {plans.map((plan) => (
          <PlanCard
            key={plan._id}
            plan={plan}
            billing={billing}
            t={t}
            patchPlan={patchPlan}
            doPublish={() => doPublish([plan._id])}
            openVersions={() => setVersionsPlan(plan._id)}
          />
        ))}
      </div>

      {/* ── Matrix ────────────────────────────────────────────────────────── */}
      <div className="mt-8 rounded-2xl border border-(--border-default) bg-(--card)/40 overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-(--border-default)/60 px-5 py-4">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--text-muted)" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('billing.plans.searchModules', 'Search modules…')}
              className="pl-9"
            />
          </div>
          <span className="text-xs text-(--text-muted)">
            {t('billing.plans.moduleCount', '{{count}} modules', { count: filteredModules.length })}
          </span>
          {differingKeys.size > 0 && (
            <Badge variant="info" className="ml-auto">
              {t('billing.plans.differingRows', '{{count}} rows differ between plans', {
                count: differingKeys.size,
              })}
            </Badge>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-(--border-default)/60 text-left text-xs uppercase tracking-widest text-muted-foreground">
                <th className="w-[38%] px-5 py-3 font-semibold">
                  {t('billing.plans.moduleCol', 'Module')}
                </th>
                {plans.map((plan) => (
                  <th key={plan._id} className="w-[20%] px-3 py-3 text-center font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      {plan.isPopular && <Star className="h-3 w-3 fill-current text-(--brand)" />}
                      {plan.name}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.groups.map((group) => (
                <ModuleGroupRows
                  key={group.category}
                  group={group}
                  plans={plans}
                  entByPlanModule={entByPlanModule}
                  differingKeys={differingKeys}
                  setEnt={setEnt}
                  enableInAllPlans={enableInAllPlans}
                  openModule={setDrawerModule}
                  t={t}
                />
              ))}
              {grouped.coming.length > 0 && (
                <>
                  <tr>
                    <td colSpan={plans.length + 1} className="px-5 pt-5 pb-1">
                      <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-(--purple-text)">
                        <Sparkles className="h-3.5 w-3.5" />
                        {t('billing.plans.comingSection', 'Coming soon — configurable today')}
                      </span>
                    </td>
                  </tr>
                  {grouped.coming.map((mod) => (
                    <ModuleRowView
                      key={mod.key}
                      module={mod}
                      plans={plans}
                      entByPlanModule={entByPlanModule}
                      differingKeys={differingKeys}
                      setEnt={setEnt}
                      enableInAllPlans={enableInAllPlans}
                      openModule={setDrawerModule}
                      t={t}
                      dimmed
                    />
                  ))}
                </>
              )}
              {filteredModules.length === 0 && (
                <tr>
                  <td
                    colSpan={plans.length + 1}
                    className="px-5 py-10 text-center text-sm text-(--text-muted)"
                  >
                    {t('billing.plans.noModules', 'No modules match — try a different search.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Module drawer ─────────────────────────────────────────────────── */}
      <Sheet open={!!openModule} onOpenChange={(o) => !o && setDrawerModule(null)}>
        <SheetContent
          side="right"
          size="lg"
          label={t('billing.plans.moduleDrawer', 'Module settings')}
        >
          {openModule && (
            <ModuleDrawer
              module={openModule}
              plans={plans}
              entByPlanModule={entByPlanModule}
              setEnt={setEnt}
              t={t}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* ── Versions history ──────────────────────────────────────────────── */}
      <VersionsSheet
        planId={versionsPlan}
        plans={plans}
        onClose={() => setVersionsPlan(null)}
        t={t}
      />
    </div>
  );
}

// ── Small pieces ─────────────────────────────────────────────────────────────

function PenDot() {
  return <span className="h-1.5 w-1.5 rounded-full bg-current" />;
}

function Header({ t }: { t: TFunction }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-(--brand)/10 text-(--brand)">
        <Crown className="h-5 w-5" />
      </div>
      <div>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
          {t('billing.plans.title', 'Plans & tariffs')}
        </h1>
        <p className="text-sm text-(--text-muted)">
          {t(
            'billing.plans.subtitle',
            'Design Starter / Pro / Enterprise in the UI — published changes go live on the landing and in the product instantly.',
          )}
        </p>
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  billing,
  t,
  patchPlan,
  doPublish,
  openVersions,
}: {
  plan: PlanRow;
  billing: 'monthly' | 'yearly';
  t: TFunction;
  patchPlan: (id: Id<'billingPlans'>, patch: Record<string, unknown>) => Promise<void>;
  doPublish: () => void;
  openVersions: () => void;
}) {
  const accent = PLAN_ACCENTS[plan.key];
  const displayPrice = plan.isCustom
    ? null
    : billing === 'monthly'
      ? plan.priceMonthly
      : plan.priceYearly;
  const price =
    displayPrice === null || displayPrice === undefined
      ? t('billing.plans.contactUs', 'Contact us')
      : `$${displayPrice.toLocaleString()}`;

  return (
    <div
      className={cn(
        'relative flex flex-col overflow-hidden rounded-2xl border bg-(--card)/60 transition-shadow',
        plan.isPopular && 'border-(--brand)/40',
      )}
      style={{
        boxShadow: plan.isPopular ? `0 0 34px ${accent.glow}` : 'none',
      }}
    >
      {/* Top accent */}
      <div
        className="h-[3px] w-full"
        style={{
          background: `linear-gradient(90deg, transparent, ${accent.from}, ${accent.to}, transparent)`,
        }}
      />
      <div className="flex flex-1 flex-col gap-4 p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <input
                value={plan.name}
                onChange={(e) => patchPlan(plan._id, { name: e.target.value })}
                className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-lg font-bold outline-none transition-colors hover:border-(--border-default) focus:border-(--brand)/50 focus:bg-(--surface-2)"
                style={{ color: 'var(--text-primary)' }}
                aria-label={t('billing.plans.planName', 'Plan name')}
              />
              {plan.isPopular && <Star className="h-4 w-4 shrink-0 fill-current text-(--brand)" />}
            </div>
            <input
              value={plan.tagline ?? ''}
              onChange={(e) => patchPlan(plan._id, { tagline: e.target.value })}
              placeholder={t('billing.plans.taglinePh', 'Tagline…')}
              className="mt-0.5 w-full rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-xs text-(--text-muted) outline-none transition-colors hover:border-(--border-default) focus:border-(--brand)/50 focus:bg-(--surface-2)"
              aria-label={t('billing.plans.tagline', 'Tagline')}
            />
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge variant={plan.hasDraftChanges ? 'warning' : 'success'} size="sm">
              {plan.publishedVersion
                ? `v${plan.publishedVersion}${plan.hasDraftChanges ? ' +draft' : ''}`
                : t('billing.plans.neverPublished', 'draft')}
            </Badge>
            <div className="flex items-center gap-1.5">
              <Switch
                checked={plan.isActive}
                onCheckedChange={(v) => patchPlan(plan._id, { isActive: v })}
                aria-label={t('billing.plans.active', 'Active')}
              />
              <span className="text-[10px] uppercase tracking-wide text-(--text-muted)">
                {t('billing.plans.active', 'Active')}
              </span>
            </div>
          </div>
        </div>

        {/* Price */}
        <div className="flex items-end gap-1.5">
          <span
            key={billing + (price ?? '')}
            className="animate-[priceTick_280ms_ease] text-3xl font-black tabular-nums leading-none"
            style={{ color: 'var(--text-primary)' }}
          >
            {price}
          </span>
          {!plan.isCustom && (
            <span className="pb-0.5 text-xs text-(--text-muted)">
              /{t('billing.plans.mo', 'mo')}
              {billing === 'yearly' && (
                <span className="ml-1.5 rounded-full bg-(--success-bg) px-1.5 py-0.5 text-[9px] font-bold text-(--success-text)">
                  {t('billing.plans.save20', '-20%')}
                </span>
              )}
            </span>
          )}
        </div>

        {/* Editable fields */}
        <div className="grid grid-cols-2 gap-2.5">
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-(--text-muted)">
              {t('billing.plans.monthlyPrice', 'Monthly $')}
            </span>
            <Input
              type="number"
              min={0}
              value={plan.priceMonthly ?? ''}
              disabled={plan.isCustom}
              onChange={(e) => {
                const n = Number(e.target.value);
                patchPlan(plan._id, {
                  priceMonthly: e.target.value === '' ? null : Number.isFinite(n) ? n : undefined,
                });
              }}
              className="mt-1 h-8"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-(--text-muted)">
              {t('billing.plans.yearlyPrice', 'Yearly $')}
            </span>
            <Input
              type="number"
              min={0}
              value={plan.priceYearly ?? ''}
              disabled={plan.isCustom}
              onChange={(e) => {
                const n = Number(e.target.value);
                patchPlan(plan._id, {
                  priceYearly: e.target.value === '' ? null : Number.isFinite(n) ? n : undefined,
                });
              }}
              className="mt-1 h-8"
            />
          </label>
        </div>

        <div className="flex items-center gap-2.5">
          <label className="flex items-center gap-1.5 text-xs text-(--text-muted)">
            <Switch
              checked={plan.isCustom}
              onCheckedChange={(v) => patchPlan(plan._id, { isCustom: v })}
              aria-label={t('billing.plans.custom', 'Custom pricing')}
            />
            {t('billing.plans.custom', 'Custom')}
          </label>
          <label className="flex items-center gap-1.5 text-xs text-(--text-muted)">
            <Switch
              checked={plan.isPopular}
              onCheckedChange={(v) => patchPlan(plan._id, { isPopular: v })}
              aria-label={t('billing.plans.popular', 'Popular')}
            />
            <Star className="h-3 w-3 text-(--brand)" />
            {t('billing.plans.popular', 'Popular')}
          </label>
        </div>

        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-(--text-muted)">
            {t('billing.plans.cta', 'Button label')}
          </span>
          <Input
            value={plan.ctaLabel ?? ''}
            onChange={(e) => patchPlan(plan._id, { ctaLabel: e.target.value })}
            className="mt-1 h-8"
          />
        </label>

        {/* Actions */}
        <div className="mt-auto flex items-center gap-2 pt-1">
          <Button
            size="sm"
            className="gap-1.5"
            onClick={doPublish}
            disabled={!plan.hasDraftChanges}
          >
            <Send className="h-3.5 w-3.5" />
            {t('billing.plans.publish', 'Publish')}
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={openVersions}>
            <History className="h-3.5 w-3.5" />
            {t('billing.plans.versions', 'Versions')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ModuleGroupRows({
  group,
  plans,
  entByPlanModule,
  differingKeys,
  setEnt,
  enableInAllPlans,
  openModule,
  t,
}: {
  group: { category: string; modules: ModuleRow[] };
  plans: PlanRow[];
  entByPlanModule: Map<string, EntitlementRow>;
  differingKeys: Set<string>;
  setEnt: (
    planId: Id<'billingPlans'>,
    module: ModuleRow,
    patch: Record<string, unknown>,
  ) => Promise<void>;
  enableInAllPlans: (module: ModuleRow) => Promise<void>;
  openModule: (key: string) => void;
  t: TFunction;
}) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <tr className="border-b border-(--border-default)/40 bg-(--surface-2)/40">
        <td colSpan={plans.length + 1} className="px-5 py-1.5">
          <button
            className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-(--text-muted) hover:text-(--text-primary)"
            onClick={() => setOpen(!open)}
          >
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {t(`billing.categories.${group.category}`, group.category)}
            <span className="font-medium normal-case opacity-60">· {group.modules.length}</span>
          </button>
        </td>
      </tr>
      {open &&
        group.modules.map((mod) => (
          <ModuleRowView
            key={mod.key}
            module={mod}
            plans={plans}
            entByPlanModule={entByPlanModule}
            differingKeys={differingKeys}
            setEnt={setEnt}
            enableInAllPlans={enableInAllPlans}
            openModule={openModule}
            t={t}
          />
        ))}
    </>
  );
}

function ModuleRowView({
  module,
  plans,
  entByPlanModule,
  differingKeys,
  setEnt,
  enableInAllPlans,
  openModule,
  t,
  dimmed,
}: {
  module: ModuleRow;
  plans: PlanRow[];
  entByPlanModule: Map<string, EntitlementRow>;
  differingKeys: Set<string>;
  setEnt: (
    planId: Id<'billingPlans'>,
    module: ModuleRow,
    patch: Record<string, unknown>,
  ) => Promise<void>;
  enableInAllPlans: (module: ModuleRow) => Promise<void>;
  openModule: (key: string) => void;
  t: TFunction;
  dimmed?: boolean;
}) {
  const differs = differingKeys.has(module.key);
  const firstNumericOption = Object.entries(module.settingsSchema ?? {}).find(
    ([, opt]) => opt.type === 'number',
  );

  return (
    <tr
      className={cn(
        'border-b border-(--border-default)/30 last:border-0 transition-colors',
        differs && 'bg-(--brand)/5',
        dimmed && 'opacity-60',
      )}
    >
      <td className="px-5 py-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-(--surface-2) text-(--text-muted)">
            {moduleIcon(module.icon)}
          </div>
          <div className="min-w-0">
            <button
              className="flex items-center gap-1.5 text-sm font-medium hover:underline"
              style={{ color: 'var(--text-primary)' }}
              onClick={() => openModule(module.key)}
            >
              {t(`billing.modules.${module.key}`, module.name)}
              {differs && (
                <span
                  className="h-1.5 w-1.5 rounded-full bg-(--brand)"
                  title={t('billing.plans.differs', 'Differs between plans')}
                />
              )}
            </button>
            <div className="flex items-center gap-1.5">
              {module.isCore ? (
                <Badge variant="secondary" size="sm" dot>
                  {t('billing.plans.core', 'Core')}
                </Badge>
              ) : (
                <Badge variant={module.status === 'beta' ? 'warning' : 'outline'} size="sm">
                  {module.status === 'beta'
                    ? t('billing.plans.beta', 'Beta')
                    : module.status === 'coming'
                      ? t('billing.plans.coming', 'Coming soon')
                      : module.category}
                </Badge>
              )}
              {module.status === 'coming' && (
                <Badge variant="purple" size="sm">
                  <Sparkles className="h-3 w-3" />
                  {t('billing.plans.ready', 'ready')}
                </Badge>
              )}
            </div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="ml-1 h-7 w-7 shrink-0 text-(--text-muted)"
            title={t('billing.plans.enableInAll', 'Enable in all plans')}
            aria-label={t('billing.plans.enableInAll', 'Enable in all plans')}
            onClick={() => enableInAllPlans(module)}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
      </td>
      {plans.map((plan) => (
        <td key={plan._id} className="px-3 py-2 text-center">
          <MatrixCell
            module={module}
            plan={plan}
            ent={entByPlanModule.get(`${plan._id}::${module.key}`)}
            firstNumericOption={firstNumericOption}
            setEnt={setEnt}
            t={t}
          />
        </td>
      ))}
    </tr>
  );
}

function MatrixCell({
  module,
  plan,
  ent,
  firstNumericOption,
  setEnt,
  t,
}: {
  module: ModuleRow;
  plan: PlanRow;
  ent?: EntitlementRow;
  firstNumericOption?: [string, ModuleSchemaOption];
  setEnt: (
    planId: Id<'billingPlans'>,
    module: ModuleRow,
    patch: Record<string, unknown>,
  ) => Promise<void>;
  t: TFunction;
}) {
  const included = ent?.included ?? false;
  const limits = ent?.limits ?? {};

  if (module.isCore) {
    return (
      <span className="inline-flex items-center justify-center gap-1 text-xs text-(--text-muted)">
        <Lock className="h-3.5 w-3.5" />
        {t('billing.plans.included', 'included')}
      </span>
    );
  }

  const hasOptions = Object.keys(module.settingsSchema ?? {}).length > 0;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <Switch
        checked={included}
        onCheckedChange={(v) => setEnt(plan._id, module, { included: v })}
        aria-label={`${module.name} on ${plan.name}`}
      />
      {included && firstNumericOption && hasOptions && (
        <LimitStepper
          module={module}
          plan={plan}
          optionKey={firstNumericOption[0]}
          option={firstNumericOption[1]}
          value={
            typeof limits[firstNumericOption[0]] === 'number'
              ? (limits[firstNumericOption[0]] as number)
              : undefined
          }
          setEnt={setEnt}
          t={t}
        />
      )}
      {included && !hasOptions && (
        <span className="text-(--success-text)">
          <Check className="h-3.5 w-3.5" />
        </span>
      )}
      {!included && <span className="text-(--text-muted) opacity-50">—</span>}
    </div>
  );
}

function LimitStepper({
  module,
  plan,
  optionKey,
  option,
  value,
  setEnt,
  t,
}: {
  module: ModuleRow;
  plan: PlanRow;
  optionKey: string;
  option: ModuleSchemaOption;
  value?: number;
  setEnt: (
    planId: Id<'billingPlans'>,
    module: ModuleRow,
    patch: Record<string, unknown>,
  ) => Promise<void>;
  t: TFunction;
}) {
  const min = option.min ?? 0;
  const max = option.max ?? 999999;
  const current = value ?? min;

  const apply = (next: number) => {
    const clamped = Math.max(min, Math.min(max, next));
    setEnt(plan._id, module, { limits: { [optionKey]: clamped } });
  };

  return (
    <div className="flex items-center gap-1 rounded-lg border border-(--border-default) bg-(--surface-2)/70 px-1 py-0.5">
      <button
        type="button"
        className="flex h-5 w-5 items-center justify-center rounded text-(--text-muted) hover:bg-(--surface-2) hover:text-(--text-primary)"
        onClick={() => apply(current - 1)}
        aria-label={`${t('billing.plans.decrease', 'Decrease')} ${optionKey}`}
      >
        <Minus className="h-3 w-3" />
      </button>
      <input
        type="number"
        value={current}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) apply(n);
        }}
        className="w-11 bg-transparent text-center text-xs font-semibold tabular-nums outline-none"
        style={{ color: 'var(--text-primary)' }}
        aria-label={`${module.name} ${optionKey}`}
      />
      <button
        type="button"
        className="flex h-5 w-5 items-center justify-center rounded text-(--text-muted) hover:bg-(--surface-2) hover:text-(--text-primary)"
        onClick={() => apply(current + 1)}
        aria-label={`${t('billing.plans.increase', 'Increase')} ${optionKey}`}
      >
        <Plus className="h-3 w-3" />
      </button>
      {option.unit && (
        <span className="pr-1 text-[9px] text-(--text-muted)">
          {t(`billing.units.${option.unit}`, option.unit)}
        </span>
      )}
    </div>
  );
}

function ModuleDrawer({
  module,
  plans,
  entByPlanModule,
  setEnt,
  t,
}: {
  module: ModuleRow;
  plans: PlanRow[];
  entByPlanModule: Map<string, EntitlementRow>;
  setEnt: (
    planId: Id<'billingPlans'>,
    module: ModuleRow,
    patch: Record<string, unknown>,
  ) => Promise<void>;
  t: TFunction;
}) {
  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-(--surface-2) text-(--text-primary)">
            {moduleIcon(module.icon)}
          </div>
          <div>
            <SheetTitle className="text-lg">
              {t(`billing.modules.${module.key}`, module.name)}
            </SheetTitle>
            <SheetDescription>
              <code className="text-xs">{module.key}</code>
            </SheetDescription>
          </div>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <Badge
            variant={
              module.status === 'beta'
                ? 'warning'
                : module.status === 'coming'
                  ? 'purple'
                  : 'success'
            }
            dot
          >
            {module.status === 'beta'
              ? t('billing.plans.beta', 'Beta')
              : module.status === 'coming'
                ? t('billing.plans.coming', 'Coming soon')
                : t('billing.plans.active', 'Active')}
          </Badge>
          <Badge variant="outline">
            {t(`billing.categories.${module.category}`, module.category)}
          </Badge>
          {module.isCore && <Badge variant="secondary">{t('billing.plans.core', 'Core')}</Badge>}
        </div>
      </SheetHeader>

      <SheetBody className="space-y-5">
        {module.description && (
          <p className="text-sm leading-relaxed text-(--text-secondary)">{module.description}</p>
        )}

        {module.featureToggleKey && (
          <div className="rounded-xl border border-(--border-default) bg-(--surface-2)/50 px-4 py-3">
            <p className="text-xs text-(--text-muted)">
              {t('billing.plans.toggleLinked', 'Linked to feature toggle')}
            </p>
            <a
              href="/superadmin/feature-toggles"
              className="mt-0.5 inline-flex items-center gap-1.5 font-mono text-xs text-(--brand) hover:underline"
            >
              <Unlock className="h-3.5 w-3.5" />
              {module.featureToggleKey}
            </a>
            <p className="mt-1 text-[11px] text-(--text-muted)">
              {t(
                'billing.plans.toggleHint',
                'A globally disabled toggle keeps the module off even on Enterprise.',
              )}
            </p>
          </div>
        )}

        {Object.keys(module.settingsSchema ?? {}).length > 0 ? (
          <div>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-(--text-muted)">
              {t('billing.plans.perPlan', 'Per-plan options')}
            </h4>
            <div className="space-y-2.5">
              {plans.map((plan) => {
                const ent = entByPlanModule.get(`${plan._id}::${module.key}`);
                const included = ent?.included ?? false;
                return (
                  <div
                    key={plan._id}
                    className="rounded-xl border border-(--border-default) bg-(--card)/50 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="flex items-center gap-1.5 text-sm font-semibold"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {plan.isPopular && (
                          <Star className="h-3.5 w-3.5 fill-current text-(--brand)" />
                        )}
                        {plan.name}
                      </span>
                      <Switch
                        checked={included}
                        onCheckedChange={(v) => setEnt(plan._id, module, { included: v })}
                        aria-label={`${t('billing.plans.includeModule', 'Include')} ${module.name} ${plan.name}`}
                      />
                    </div>
                    {included && (
                      <div className="mt-2.5 grid gap-2">
                        {Object.entries(module.settingsSchema ?? {}).map(([optKey, opt]) =>
                          opt.type === 'boolean' ? (
                            <label
                              key={optKey}
                              className="flex items-center justify-between gap-2 text-xs text-(--text-secondary)"
                            >
                              <span className="capitalize">
                                {t(`billing.options.${optKey}`, optKey)}
                              </span>
                              <Switch
                                checked={Boolean((ent?.limits ?? {})[optKey])}
                                onCheckedChange={(v) =>
                                  setEnt(plan._id, module, {
                                    limits: { ...(ent?.limits ?? {}), [optKey]: v },
                                  })
                                }
                                aria-label={`${optKey} ${plan.name}`}
                              />
                            </label>
                          ) : (
                            <label
                              key={optKey}
                              className="flex items-center justify-between gap-2 text-xs text-(--text-secondary)"
                            >
                              <span className="capitalize">
                                {t(`billing.options.${optKey}`, optKey)}
                                {opt.unit && (
                                  <span className="ml-1 text-(--text-muted)">
                                    ({t(`billing.units.${opt.unit}`, opt.unit)})
                                  </span>
                                )}
                              </span>
                              <Input
                                type="number"
                                value={String((ent?.limits ?? {})[optKey] ?? '')}
                                min={opt.min}
                                onChange={(e) => {
                                  const n = Number(e.target.value);
                                  setEnt(plan._id, module, {
                                    limits: {
                                      ...(ent?.limits ?? {}),
                                      [optKey]:
                                        e.target.value === '' ? 0 : Number.isFinite(n) ? n : 0,
                                    },
                                  });
                                }}
                                className="h-7 w-20"
                              />
                            </label>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-sm text-(--text-muted)">
            {t(
              'billing.plans.noOptions',
              'This module has no tunable options — plans either include it or not.',
            )}
          </p>
        )}
      </SheetBody>
    </>
  );
}

function VersionsSheet({
  planId,
  plans,
  onClose,
  t,
}: {
  planId: Id<'billingPlans'> | null;
  plans: PlanRow[];
  onClose: () => void;
  t: TFunction;
}) {
  const versions = useQuery(api.billing.plans.listPlanVersions, planId ? { planId } : 'skip');
  const restore = useMutation(api.billing.plans.restorePlanVersion);
  const plan = plans.find((p) => p._id === planId);
  const [restoring, setRestoring] = useState<number | null>(null);

  const doRestore = async (version: number) => {
    if (!planId) return;
    setRestoring(version);
    try {
      await restore({ planId, version });
      toast.success(
        t('billing.plans.restoredToast', 'Plan restored to version {{v}} — live now', {
          v: version,
        }),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setRestoring(null);
    }
  };

  return (
    <Sheet open={!!planId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" size="md" label={t('billing.plans.versions', 'Versions')}>
        <SheetHeader>
          <SheetTitle className="text-lg">
            {t('billing.plans.versions', 'Versions')}
            {plan && (
              <span className="ml-2 text-sm font-normal text-(--text-muted)">{plan.name}</span>
            )}
          </SheetTitle>
          <SheetDescription>
            {t(
              'billing.plans.versionsHint',
              'Each publish creates a snapshot. Subscribers keep the version they signed up on; restoring changes it for everyone.',
            )}
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          {versions === undefined ? (
            <div className="flex justify-center py-10">
              <ShieldLoader size="sm" />
            </div>
          ) : versions.length === 0 ? (
            <p className="py-10 text-center text-sm text-(--text-muted)">
              {t('billing.plans.noVersions', 'No published versions yet.')}
            </p>
          ) : (
            <div className="space-y-2">
              {versions.map((v: PublishedVersionRow) => (
                <div
                  key={v._id}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-xl border border-(--border-default) bg-(--card)/50 px-4 py-3',
                    v.isLive && 'border-(--brand)/40',
                  )}
                >
                  <div>
                    <p
                      className="flex items-center gap-2 text-sm font-semibold"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {t('billing.plans.version', 'Version')} {v.version}
                      {v.isLive && (
                        <Badge variant="success" size="sm">
                          {t('billing.plans.live', 'live')}
                        </Badge>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-(--text-muted)">
                      {new Date(v.publishedAt).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={v.isLive ? 'ghost' : 'outline'}
                    disabled={v.isLive || restoring === v.version}
                    onClick={() => doRestore(v.version)}
                  >
                    {restoring === v.version ? (
                      <ShieldLoader size="xs" variant="inline" />
                    ) : (
                      <History className="h-3.5 w-3.5" />
                    )}
                    {t('billing.plans.restore', 'Restore')}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
