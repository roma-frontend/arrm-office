'use client';

/**
 * Host panel for the meeting waiting room. Lists everyone currently
 * registered but not yet admitted, with one-tap admit/deny actions.
 *
 * Lives in the right-hand side panel next to participants. The host receives
 * the admit URL on action and is expected to share it with the visitor
 * through whatever side channel they prefer (chat, email, etc.).
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAction, useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { Copy, Loader2, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function LobbyPanel({ roomName }: { roomName: string }) {
  const { t } = useTranslation();
  const pending = useQuery(api.meetings.listPending, { roomName });
  const all = useQuery(api.meetings.listRegistrations, { roomName });
  const admit = useAction(api.meetingsActions.admitRegistration);
  const remove = useMutation(api.meetings.removeRegistration);

  // Cache of generated invite URLs (per-registration). Reset when the list
  // changes so admits are reproducible but stale URLs do not linger.
  const [invites, setInvites] = useState<Record<string, { url: string; name: string }>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleAdmit = async (id: Id<'meetingRegistrations'>, name: string) => {
    setBusyId(id);
    try {
      const result = await admit({ registrationId: id });
      const origin = typeof window === 'undefined' ? '' : window.location.origin;
      const fullUrl = `${origin}${result.inviteUrl}`;
      setInvites((prev) => ({ ...prev, [id]: { url: fullUrl, name } }));
      try {
        await navigator.clipboard.writeText(fullUrl);
        toast.success(t('meetings.inviteCopied', { defaultValue: 'Invite link copied' }));
      } catch {
        toast.success(t('meetings.inviteReady', { defaultValue: 'Invite link ready' }));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('meetings.actionFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const handleDeny = async (id: Id<'meetingRegistrations'>) => {
    setBusyId(id);
    try {
      await remove({ registrationId: id });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('meetings.actionFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const copyAgain = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('meetings.copied'));
    } catch {
      /* noop */
    }
  };

  if (pending === undefined) {
    return (
      <div className="px-3 pt-3">
        <div className="h-16 animate-pulse rounded-xl border border-white/10 bg-white/[0.04]" />
      </div>
    );
  }

  if (pending.length === 0) {
    return (
      <div className="px-3 pt-3">
        <p className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-center text-[11px] text-white/45">
          {t('meetings.lobbyEmpty', { defaultValue: 'No one waiting right now' })}
          {all && all.length > 0 && (
            <span className="mt-1 block text-white/35">
              {t('meetings.lobbyTotalRegistered', {
                count: all.length,
                defaultValue: '{{count}} total registered',
              })}
            </span>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="px-3 pt-3">
      <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-white/45">
        {t('meetings.lobbyWaiting', { count: pending.length })}
      </p>
      <ul className="space-y-1.5">
        {pending.map((reg) => {
          const invite = invites[reg._id];
          const isBusy = busyId === reg._id;
          return (
            <li key={reg._id} className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5">
              <div className="flex items-start gap-2.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-[10px] font-bold text-amber-300">
                  {reg.fullName.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-white/90">{reg.fullName}</p>
                  {reg.email && <p className="truncate text-[10px] text-white/45">{reg.email}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleAdmit(reg._id, reg.fullName)}
                    disabled={isBusy}
                    title={t('meetings.admit')}
                    className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300 transition hover:bg-emerald-500/30 disabled:opacity-50"
                  >
                    {isBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <UserPlus className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeny(reg._id)}
                    disabled={isBusy}
                    title={t('meetings.deny', { defaultValue: 'Deny' })}
                    className="flex size-7 items-center justify-center rounded-lg bg-white/[0.06] text-white/55 transition hover:bg-red-500/20 hover:text-red-300 disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {invite && (
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2">
                  <span className="truncate font-mono text-[10px] text-emerald-200/80">
                    {invite.url}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyAgain(invite.url)}
                    title={t('common.copy', { defaultValue: 'Copy' })}
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-md text-emerald-300 transition hover:bg-emerald-500/20',
                    )}
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
