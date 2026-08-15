/**
 * Organization Selection Page
 *
 * For new Google OAuth users to select which organization they want to join.
 * Users browse the directory, search by name/slug, and submit a join request.
 */

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Building2,
  Search,
  CheckCircle2,
  Briefcase,
  Globe2,
  Hash,
  Clock,
  Lightbulb,
  Inbox,
  Loader2,
  X,
} from 'lucide-react';
import Image from 'next/image';

interface Organization {
  _id: Id<'organizations'>;
  name: string;
  slug: string;
  industry?: string;
  logoUrl?: string;
  country?: string;
  plan?: 'starter' | 'professional' | 'enterprise';
}

interface JoinRequest {
  _id: Id<'organizationInvites'>;
  organizationId?: Id<'organizations'>;
  status: 'pending' | 'approved' | 'rejected';
}

const PLAN_BADGE: Record<NonNullable<Organization['plan']>, string> = {
  starter:
    'bg-(--badge-secondary-bg) text-(--badge-secondary-text) border-(--badge-secondary-border)',
  professional:
    'bg-(--badge-primary-bg) text-(--badge-primary-text) border-(--badge-primary-border)',
  enterprise: 'bg-(--badge-purple-bg) text-(--badge-purple-text) border-(--badge-purple-border)',
};

export default function SelectOrganizationPage() {
  const { t } = useTranslation();
  const { user, setUser } = useAuthStore();
  const router = useRouter();

  // Get fresh user data from Convex
  const freshUserData = useQuery(
    api.users.queries.getCurrentUser,
    user?.email ? { email: user.email } : 'skip',
  );

  // Active orgs directory
  const organizations = useQuery(api.organizationJoinRequests.getActiveOrganizations) as
    | Organization[]
    | undefined;

  // User's existing pending requests (so we can show a "Pending" state per card)
  const myRequests = useQuery(
    api.organizationJoinRequests.getMyJoinRequests,
    user?.id ? { userId: user.id as Id<'users'> } : 'skip',
  ) as JoinRequest[] | undefined;

  const requestJoin = useMutation(api.organizationJoinRequests.requestJoinOrganization);

  const [searchQuery, setSearchQuery] = useState('');
  const [isRequesting, setIsRequesting] = useState<Id<'organizations'> | null>(null);

  // Pre-selected organization slug from URL (e.g. ?org=acme from a vacancy page).
  // Read synchronously on first render so we don't flash the org list before
  // the auto-join handler kicks in.
  const initialPrefilledSlug =
    typeof window !== 'undefined'
      ? (new URLSearchParams(window.location.search).get('org')?.toLowerCase() ?? null)
      : null;
  const [prefilledOrgSlug, setPrefilledOrgSlug] = useState<string | null>(initialPrefilledSlug);
  const [autoJoinTriggered, setAutoJoinTriggered] = useState(false);

  // Dev-only preview escape: visit ?preview=1 in development to bypass the redirect
  // and view the page even when authenticated. No effect in production.
  const isPreview =
    process.env.NODE_ENV !== 'production' &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('preview') === '1';

  // Redirect if user already has an approved organization
  const shouldRedirect =
    (user?.organizationId && user?.isApproved) ||
    (freshUserData?.organizationId && freshUserData?.isApproved);

  useEffect(() => {
    if (isPreview) return;

    if (freshUserData?.organizationId && freshUserData?.isApproved) {
      setUser({
        id: freshUserData._id,
        name: freshUserData.name,
        email: freshUserData.email,
        role: freshUserData.role,
        organizationId: freshUserData.organizationId,
        isApproved: freshUserData.isApproved,
      });
      const params = new URLSearchParams(window.location.search);
      router.push(params.get('next') || '/dashboard');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshUserData]);

  const pendingOrgIds = useMemo(
    () =>
      new Set(
        (myRequests ?? [])
          .filter((r) => r.status === 'pending' && r.organizationId)
          .map((r) => r.organizationId as Id<'organizations'>),
      ),
    [myRequests],
  );

  const filteredOrgs = useMemo(() => {
    if (!organizations) return undefined;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return organizations;
    return organizations.filter(
      (org) =>
        org.name.toLowerCase().includes(q) ||
        org.slug.toLowerCase().includes(q) ||
        (org.industry?.toLowerCase().includes(q) ?? false) ||
        (org.country?.toLowerCase().includes(q) ?? false),
    );
  }, [organizations, searchQuery]);

  // Resolve org by ?org=<slug> from the active directory
  const prefilledOrg = useMemo(() => {
    if (!prefilledOrgSlug || !organizations) return null;
    return organizations.find((o) => o.slug.toLowerCase() === prefilledOrgSlug) ?? null;
  }, [organizations, prefilledOrgSlug]);

  const handleRequestJoin = async (organizationId: Id<'organizations'>, name: string) => {
    if (!user?.id) return;

    setIsRequesting(organizationId);
    try {
      const result = await requestJoin({
        userId: user.id as Id<'users'>,
        organizationId,
      });

      if (
        result &&
        typeof result === 'object' &&
        'reason' in result &&
        result.reason === 'already_in_organization'
      ) {
        toast.info(t('auth.alreadyInOrg', 'You already belong to an organization'));
        setTimeout(() => router.push('/dashboard'), 600);
        return;
      }

      toast.success(t('auth.requestSent', 'Request sent!'));
      // Wait a moment so the user sees the toast, then route to pending
      setTimeout(() => router.push('/onboarding/pending'), 600);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('auth.joinOrg.errorRequest');
      toast.error(`${name}: ${message}`);
    } finally {
      setIsRequesting(null);
    }
  };

  // Auto-trigger join request when user landed here with ?org=<slug>.
  // Only fires once, and only if:
  //   - we have a valid user
  //   - the slug resolves to an active org
  //   - there is no existing pending request for that org
  useEffect(() => {
    if (autoJoinTriggered) return;
    if (!prefilledOrgSlug) return;
    if (!user?.id) return;
    if (freshUserData?.organizationId && freshUserData?.isApproved) {
      setAutoJoinTriggered(true);
      router.push('/dashboard');
      return;
    }
    if (!prefilledOrg) return; // org list still loading or slug not found
    if (myRequests === undefined) return; // wait until we know existing requests
    if (pendingOrgIds.has(prefilledOrg._id)) {
      // Already requested – just route to pending screen
      setAutoJoinTriggered(true);
      router.push('/onboarding/pending');
      return;
    }
    setAutoJoinTriggered(true);
    void handleRequestJoin(prefilledOrg._id, prefilledOrg.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    prefilledOrgSlug,
    prefilledOrg,
    user?.id,
    myRequests,
    pendingOrgIds,
    autoJoinTriggered,
    freshUserData,
  ]);

  // Block render while redirecting
  if (shouldRedirect && !isPreview) return null;

  // If the user arrived with ?org=<slug>, hide the search UI until we either
  // auto-join them or determine the slug is invalid. This avoids a flash of
  // the directory list during the redirect.
  const slugStillResolving =
    !!prefilledOrgSlug &&
    (organizations === undefined ||
      myRequests === undefined ||
      (prefilledOrg && !autoJoinTriggered));

  if (slugStillResolving || (prefilledOrgSlug && autoJoinTriggered && prefilledOrg)) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="btn-gradient inline-flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg">
            <Building2 className="h-7 w-7 text-white" />
          </div>
          <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
          <p className="text-sm text-(--text-secondary)">
            {prefilledOrg
              ? `${t('auth.joining', 'Joining')} ${prefilledOrg.name}…`
              : t('auth.loadingOrganization', 'Loading organization…')}
          </p>
        </div>
      </div>
    );
  }

  // If the slug didn't resolve to an active org, drop it silently and show the
  // full directory so the user can pick manually.
  if (prefilledOrgSlug && organizations !== undefined && !prefilledOrg) {
    // Clear once so further renders show the normal list.
    // Using setTimeout to avoid setState-in-render warnings.
    setTimeout(() => setPrefilledOrgSlug(null), 0);
  }

  const isLoading = organizations === undefined;
  const totalCount = organizations?.length ?? 0;

  return (
    <div className="min-h-screen">
      {/* Decorative top gradient blob */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 overflow-hidden -z-0"
      >
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-72 w-[40rem] rounded-full opacity-30 blur-3xl bg-gradient-to-br from-(--primary-hover) via-(--brand) bg-(--brand)" />
      </div>

      <div className="relative mx-auto max-w-3xl px-4 sm:px-6 py-10 sm:py-14 animate-fade-in">
        {/* ── Header ──────────────────────────────────────── */}
        <div className="text-center mb-8">
          <div className="btn-gradient inline-flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg mb-4">
            <Building2 className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-(--text-primary)">
            {t('auth.joinOrg.title')}
          </h1>
          <p className="mt-3 text-sm sm:text-base text-(--text-secondary) max-w-xl mx-auto">
            {t('auth.joinOrg.subtitle')}
          </p>
        </div>

        {/* ── Search bar ──────────────────────────────────── */}
        <div className="relative mb-6">
          <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-(--text-muted)" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('auth.joinOrg.searchPlaceholder')}
            className="w-full rounded-2xl border border-(--input-border) bg-(--card) pl-12 pr-12 py-3.5 text-sm text-(--text-primary) placeholder:text-(--text-muted) shadow-sm focus:outline-none focus:ring-2 focus:ring-(--ring) focus:border-(--primary) transition"
            aria-label={t('auth.joinOrg.searchPlaceholder')}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-full text-(--text-muted) hover:bg-(--card-hover) hover:text-(--text-primary) transition"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* ── Directory header ────────────────────────────── */}
        {!isLoading && totalCount > 0 && (
          <div className="flex items-center justify-between mb-3 px-1">
            <div>
              <h2 className="text-sm font-semibold text-(--text-primary)">
                {t('auth.joinOrg.directory')}
              </h2>
              <p className="text-xs text-(--text-muted)">
                {t('auth.joinOrg.directorySubtitle', { count: filteredOrgs?.length ?? 0 })}
              </p>
            </div>
          </div>
        )}

        {/* ── List ────────────────────────────────────────── */}
        <div className="space-y-3">
          {isLoading ? (
            <SkeletonList />
          ) : filteredOrgs?.length === 0 ? (
            searchQuery ? (
              <EmptyState
                icon={<Search className="h-7 w-7" />}
                title={t('auth.joinOrg.noResults')}
                description={t('auth.joinOrg.noResultsHint')}
              />
            ) : (
              <EmptyState
                icon={<Inbox className="h-7 w-7" />}
                title={t('auth.joinOrg.empty')}
                description={t('auth.joinOrg.emptyHint')}
              />
            )
          ) : (
            filteredOrgs?.map((org) => (
              <OrgCard
                key={org._id}
                org={org}
                isPending={pendingOrgIds.has(org._id)}
                isRequesting={isRequesting === org._id}
                disabled={!user?.id || isRequesting !== null}
                onJoin={() => handleRequestJoin(org._id, org.name)}
                t={t}
              />
            ))
          )}
        </div>

        {/* ── Info footer ─────────────────────────────────── */}
        <div className="mt-8 rounded-2xl border border-(--badge-primary-border) bg-(--badge-primary-bg) p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-(--card) text-(--primary-hover) shadow-sm">
              <Lightbulb className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-(--text-primary)">
                {t('auth.joinOrg.afterJoinTitle')}
              </h3>
              <p className="mt-1 text-xs sm:text-sm leading-relaxed text-(--text-secondary)">
                {t('auth.joinOrg.afterJoinText')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   OrgCard
   ───────────────────────────────────────────────────────────── */
function OrgCard({
  org,
  isPending,
  isRequesting,
  disabled,
  onJoin,
  t,
}: {
  org: Organization;
  isPending: boolean;
  isRequesting: boolean;
  disabled: boolean;
  onJoin: () => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const initial = org.name.charAt(0).toUpperCase();
  const planClass = org.plan ? PLAN_BADGE[org.plan] : '';

  return (
    <article
      className={[
        'group relative rounded-2xl border bg-(--card) p-4 sm:p-5 shadow-sm transition-all',
        isPending
          ? 'border-(--badge-warning-border) bg-(--badge-warning-bg)/30'
          : 'border-(--border) hover:border-(--primary)/50 hover:shadow-md hover:-translate-y-0.5',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-4">
        {/* Left: logo + info */}
        <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
          {/* Logo */}
          <div className="relative h-12 w-12 sm:h-14 sm:w-14 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-(--primary-hover) to-(--brand) flex items-center justify-center shadow-sm">
            {org.logoUrl ? (
              <Image src={org.logoUrl} alt={org.name} fill sizes="56px" className="object-cover" />
            ) : (
              <span className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                {initial}
              </span>
            )}
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-(--text-primary) truncate">{org.name}</h3>
              {org.plan && (
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${planClass}`}
                >
                  {org.plan}
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-(--text-muted)">
              <span className="inline-flex items-center gap-1">
                <Hash className="h-3 w-3" />
                <span className="font-mono truncate">{org.slug}</span>
              </span>
              {org.industry && (
                <span className="inline-flex items-center gap-1">
                  <Briefcase className="h-3 w-3" />
                  <span className="truncate">{org.industry}</span>
                </span>
              )}
              {org.country && (
                <span className="inline-flex items-center gap-1">
                  <Globe2 className="h-3 w-3" />
                  <span className="truncate">{org.country}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: action */}
        <div className="shrink-0">
          {isPending ? (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-(--badge-warning-border) bg-(--badge-warning-bg) px-3.5 py-2 text-xs font-semibold text-(--badge-warning-text)">
              <Clock className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('auth.joinOrg.pending')}</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={onJoin}
              disabled={disabled}
              className="btn-gradient inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed min-w-[110px] justify-center"
            >
              {isRequesting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="hidden sm:inline">{t('auth.joinOrg.joining')}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('auth.joinOrg.join')}</span>
                  <span className="sm:hidden">{t('auth.joinOrg.join')}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

/* ─────────────────────────────────────────────────────────────
   SkeletonList
   ───────────────────────────────────────────────────────────── */
function SkeletonList() {
  return (
    <div className="space-y-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-2xl border border-(--border) bg-(--card) p-4 sm:p-5 shadow-sm"
        >
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl bg-(--background-subtle) animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 rounded bg-(--background-subtle) animate-pulse" />
              <div className="h-3 w-1/2 rounded bg-(--background-subtle) animate-pulse" />
            </div>
            <div className="h-9 w-24 rounded-xl bg-(--background-subtle) animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   EmptyState
   ───────────────────────────────────────────────────────────── */
function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-(--border) bg-(--card) p-10 text-center">
      <div className="mx-auto mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-(--badge-primary-bg) text-(--badge-primary-text)">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-(--text-primary)">{title}</h3>
      <p className="mt-1 text-xs text-(--text-muted) max-w-sm mx-auto">{description}</p>
    </div>
  );
}
