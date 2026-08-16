/**
 * Superadmin org request queue — pending organization registration requests
 * with approve / reject, plus the review history. Approving creates the
 * organization and the requester's admin account; rejecting records a reason
 * the requester can see.
 */

'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Building2, Check, CheckCircle2, Clock, X } from 'lucide-react';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ShieldLoader } from '@/components/ui/ShieldLoader';

type Status = 'pending' | 'approved' | 'rejected';

interface OrgRequest {
  _id: Id<'organizationRequests'>;
  requestedName: string;
  requestedSlug: string;
  requesterName: string;
  requesterEmail: string;
  requesterPhone?: string;
  requestedPlan: 'professional' | 'enterprise';
  industry?: string;
  country?: string;
  teamSize?: string;
  description?: string;
  status: Status;
  reviewedBy?: Id<'users'>;
  reviewedAt?: number;
  rejectionReason?: string;
  organizationId?: Id<'organizations'>;
  userId?: Id<'users'>;
  createdAt: number;
}

const TABS: Status[] = ['pending', 'approved', 'rejected'];

export function OrgRequestsClient() {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const [tab, setTab] = useState<Status>('pending');
  const [rejecting, setRejecting] = useState<OrgRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const requests = useQuery(
    api.organizationRequests.getOrganizationRequests,
    user?.id ? { superadminUserId: user.id as Id<'users'>, status: tab } : 'skip',
  );
  const approve = useMutation(api.organizationRequests.secureApproveOrgRequest);
  const reject = useMutation(api.organizationRequests.secureRejectOrgRequest);

  const locale =
    i18n.language === 'ru'
      ? 'ru-RU'
      : i18n.language === 'de'
        ? 'de-DE'
        : i18n.language === 'hy'
          ? 'hy-AM'
          : 'en-US';
  const fmt = (ts: number) =>
    new Date(ts).toLocaleString(locale, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const run = async (key: string, fn: () => Promise<unknown>, success: string, error: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(success);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : error);
    } finally {
      setBusy(null);
      setRejecting(null);
      setRejectReason('');
    }
  };

  const handleApprove = (r: OrgRequest) =>
    run(
      `approve-${r._id}`,
      () => approve({ requestId: r._id }),
      t('superadmin.orgRequests.approved', 'Organization created and request approved'),
      t('superadmin.orgRequests.actionFailed', 'Action failed'),
    );

  const handleReject = (r: OrgRequest) => {
    if (!rejectReason.trim()) {
      toast.error(t('superadmin.orgRequests.reasonRequired', 'Enter a reason for rejection'));
      return;
    }
    void run(
      `reject-${r._id}`,
      () => reject({ requestId: r._id, reason: rejectReason.trim() }),
      t('superadmin.orgRequests.rejected', 'Request rejected'),
      t('superadmin.orgRequests.actionFailed', 'Action failed'),
    );
  };

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <h1
            className="text-3xl md:text-4xl font-bold mb-2"
            style={{ color: 'var(--text-primary)' }}
          >
            {t('superadmin.orgRequests.title', 'Organization requests')}
          </h1>
          <p className="text-muted-foreground">
            {t(
              'superadmin.orgRequests.subtitle',
              'Approve or reject requests to register a new organization on the platform',
            )}
          </p>
        </div>

        {/* Status tabs */}
        <div
          role="tablist"
          className="mb-6 flex flex-wrap gap-1 rounded-xl border border-(--border)/60 bg-(--muted)/30 p-1 w-fit"
        >
          {TABS.map((status) => (
            <button
              key={status}
              role="tab"
              aria-selected={tab === status}
              onClick={() => setTab(status)}
              className={
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ' +
                (tab === status
                  ? 'bg-(--card) shadow-sm'
                  : 'text-muted-foreground hover:text-(--text-primary)')
              }
            >
              {status === 'pending' && <Clock className="h-4 w-4" />}
              {status === 'approved' && <CheckCircle2 className="h-4 w-4" />}
              {status === 'rejected' && <X className="h-4 w-4" />}
              {t(`superadmin.orgRequests.status.${status}`)}
            </button>
          ))}
        </div>

        {!requests ? (
          <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <ShieldLoader size="xs" variant="inline" />
            {t('superadmin.controlCenter.loading', 'Loading…')}
          </div>
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Building2 className="h-10 w-10 text-(--text-muted) opacity-30" />
            <p className="text-sm text-muted-foreground">
              {t(`superadmin.orgRequests.empty.${tab}`, 'No requests here')}
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {requests.map((r) => (
              <div
                key={r._id}
                className="rounded-2xl border border-(--border)/60 bg-(--card)/50 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3
                        className="font-semibold text-lg"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {r.requestedName}
                      </h3>
                      <Badge variant="outline" className="font-mono text-xs">
                        /{r.requestedSlug}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {r.requestedPlan}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {r.requesterName} · <span className="font-mono">{r.requesterEmail}</span>
                      {r.requesterPhone ? ` · ${r.requesterPhone}` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {[
                        r.industry,
                        r.country,
                        r.teamSize
                          ? t('superadmin.orgRequests.team', '{{n}} team', { n: r.teamSize })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'}{' '}
                      · {t('superadmin.orgRequests.submitted', 'Submitted')} {fmt(r.createdAt)}
                    </p>
                    {r.description && (
                      <p className="mt-2 max-w-2xl text-sm text-(--text-secondary)">
                        {r.description}
                      </p>
                    )}
                    {r.status === 'rejected' && r.rejectionReason && (
                      <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-(--danger-quiet) px-2.5 py-1 text-xs text-(--danger-text)">
                        <X className="h-3 w-3" />
                        {r.rejectionReason}
                      </p>
                    )}
                  </div>

                  {r.status === 'pending' ? (
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        className="gap-1.5"
                        disabled={busy !== null}
                        onClick={() => void handleApprove(r)}
                      >
                        <Check className="h-4 w-4" />
                        {t('superadmin.orgRequests.approve', 'Approve')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 border-(--danger-outline) text-(--danger-text) hover:bg-(--danger-quiet)"
                        disabled={busy !== null}
                        onClick={() => setRejecting(r)}
                      >
                        <X className="h-4 w-4" />
                        {t('superadmin.orgRequests.reject', 'Reject')}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                      {r.status === 'approved' && r.organizationId && (
                        <a
                          href={`/superadmin/organizations/${r.organizationId}`}
                          className="inline-flex items-center gap-1 rounded-lg bg-(--brand-quiet) px-2.5 py-1 font-medium text-(--brand-text) hover:underline"
                        >
                          <Building2 className="h-3 w-3" />
                          {t('superadmin.orgRequests.viewOrg', 'View organization')}
                        </a>
                      )}
                      {r.reviewedAt && (
                        <span>
                          {t('superadmin.orgRequests.reviewed', 'Reviewed')} {fmt(r.reviewedAt)}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Reject inline form */}
                {rejecting?._id === r._id && (
                  <div className="mt-4 flex flex-col gap-2 rounded-xl border border-(--danger-outline) bg-(--danger-quiet)/40 p-3 sm:flex-row sm:items-center">
                    <Input
                      autoFocus
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder={t(
                        'superadmin.orgRequests.reasonPlaceholder',
                        'Reason for rejection (shown to the requester)',
                      )}
                      className="flex-1 bg-(--card)"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="bg-(--danger-solid) text-white hover:bg-(--danger-solid)"
                        disabled={busy !== null}
                        onClick={() => handleReject(r)}
                      >
                        {t('superadmin.orgRequests.confirmReject', 'Reject request')}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setRejecting(null)}>
                        {t('common.cancel', 'Cancel')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
