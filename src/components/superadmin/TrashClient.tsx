/**
 * Superadmin Trash — soft-deleted organizations and users, with one-click
 * restore and permanent purge (orgs require slug confirmation, matching the
 * existing hard-delete cascade).
 */

'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArchiveRestore, Building2, Trash2, UserX, Users } from 'lucide-react';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ShieldLoader } from '@/components/ui/ShieldLoader';

type TrashOrg = {
  id: Id<'organizations'>;
  name: string;
  slug: string;
  deletedAt: number;
  deletedBy: string | null;
};

export function TrashClient() {
  const { t, i18n } = useTranslation();
  const trash = useQuery(api.superadmin.trash.listTrash);
  const restoreOrg = useMutation(api.superadmin.trash.restoreOrg);
  const restoreUser = useMutation(api.superadmin.trash.restoreUser);
  const purgeUser = useMutation(api.superadmin.trash.purgeUser);
  const purgeOrg = useMutation(api.superadmin.secureDeleteOrganization);

  const [busy, setBusy] = useState<string | null>(null);
  const [purgeConfirm, setPurgeConfirm] = useState<Record<string, string>>({});

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
    }
  };

  const handlePurgeOrg = async (org: TrashOrg) => {
    const slug = (purgeConfirm[org.id] ?? '').trim();
    if (slug !== org.slug) {
      toast.error(
        t(
          'superadmin.trash.slugMismatch',
          'Slug does not match — type the organization slug to confirm',
        ),
      );
      return;
    }
    await run(
      `purge-${org.id}`,
      () => purgeOrg({ organizationId: org.id, confirmSlug: slug }),
      t('superadmin.trash.orgPurged', 'Organization permanently deleted'),
      t('superadmin.trash.actionFailed', 'Action failed'),
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
            {t('superadmin.trash.title', 'Trash')}
          </h1>
          <p className="text-muted-foreground">
            {t(
              'superadmin.trash.subtitle',
              'Soft-deleted organizations and users — restore them or purge permanently',
            )}
          </p>
        </div>

        {!trash ? (
          <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <ShieldLoader size="xs" variant="inline" />
            {t('superadmin.controlCenter.loading', 'Loading…')}
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Organizations */}
            <div className="rounded-2xl border border-(--border)/60 bg-(--card)/50 overflow-hidden">
              <div className="flex items-center gap-2 border-b border-(--border)/60 px-5 py-4">
                <Building2 className="h-4 w-4 text-(--primary)" />
                <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {t('superadmin.trash.orgs', 'Organizations')}
                </h2>
                <span className="ml-auto text-xs font-semibold text-muted-foreground">
                  {trash.organizations.length}
                </span>
              </div>
              {trash.organizations.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">
                  {t('superadmin.trash.emptyOrgs', 'Nothing in the trash')}
                </p>
              ) : (
                <ul className="divide-y divide-(--border)/40">
                  {trash.organizations.map((org) => (
                    <li key={org.id} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p
                            className="font-medium truncate"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {org.name}
                          </p>
                          <p className="font-mono text-xs text-muted-foreground">/{org.slug}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {t('superadmin.trash.deleted', 'Deleted')} {fmt(org.deletedAt)}
                          </p>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            disabled={busy !== null}
                            onClick={() =>
                              run(
                                `restore-${org.id}`,
                                () => restoreOrg({ organizationId: org.id }),
                                t('superadmin.trash.orgRestored', 'Organization restored'),
                                t('superadmin.trash.actionFailed', 'Action failed'),
                              )
                            }
                          >
                            <ArchiveRestore className="h-3.5 w-3.5" />
                            {t('superadmin.trash.restore', 'Restore')}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 border-(--danger-outline) text-(--danger-text) hover:bg-(--danger-quiet)"
                            disabled={busy !== null}
                            onClick={() => {
                              if (!purgeConfirm[org.id]) {
                                setPurgeConfirm((m) => ({ ...m, [org.id]: '' }));
                                return;
                              }
                              void handlePurgeOrg(org);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {t('superadmin.trash.purge', 'Purge')}
                          </Button>
                        </div>
                      </div>
                      {purgeConfirm[org.id] !== undefined && (
                        <div className="mt-3 flex gap-2">
                          <Input
                            value={purgeConfirm[org.id]}
                            onChange={(e) =>
                              setPurgeConfirm((m) => ({ ...m, [org.id]: e.target.value }))
                            }
                            placeholder={t(
                              'superadmin.trash.typeSlug',
                              'Type {{slug}} to confirm',
                              { slug: org.slug },
                            )}
                            className="h-8 text-xs font-mono"
                          />
                          <Button
                            size="sm"
                            className="h-8 bg-(--danger-solid) text-white hover:bg-(--danger-solid)"
                            disabled={busy !== null}
                            onClick={() => void handlePurgeOrg(org)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {t('superadmin.trash.purgeConfirm', 'Delete forever')}
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Users */}
            <div className="rounded-2xl border border-(--border)/60 bg-(--card)/50 overflow-hidden">
              <div className="flex items-center gap-2 border-b border-(--border)/60 px-5 py-4">
                <Users className="h-4 w-4 text-(--primary)" />
                <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {t('superadmin.trash.users', 'Users')}
                </h2>
                <span className="ml-auto text-xs font-semibold text-muted-foreground">
                  {trash.users.length}
                </span>
              </div>
              {trash.users.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">
                  {t('superadmin.trash.emptyUsers', 'Nothing in the trash')}
                </p>
              ) : (
                <ul className="divide-y divide-(--border)/40">
                  {trash.users.map((user) => (
                    <li key={user.id} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p
                            className="font-medium truncate"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {user.name}
                          </p>
                          <p className="font-mono text-xs text-muted-foreground truncate">
                            {user.email}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {user.role} · {user.organizationName ?? '—'} ·{' '}
                            {t('superadmin.trash.deleted', 'Deleted')} {fmt(user.deletedAt)}
                          </p>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            disabled={busy !== null}
                            onClick={() =>
                              run(
                                `urestore-${user.id}`,
                                () => restoreUser({ userId: user.id }),
                                t('superadmin.trash.userRestored', 'User restored'),
                                t('superadmin.trash.actionFailed', 'Action failed'),
                              )
                            }
                          >
                            <ArchiveRestore className="h-3.5 w-3.5" />
                            {t('superadmin.trash.restore', 'Restore')}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 border-(--danger-outline) text-(--danger-text) hover:bg-(--danger-quiet)"
                            disabled={busy !== null}
                            onClick={() => {
                              if (
                                confirm(
                                  t(
                                    'superadmin.trash.confirmPurgeUser',
                                    'Delete this user permanently? This cannot be undone.',
                                  ),
                                )
                              ) {
                                void run(
                                  `upurge-${user.id}`,
                                  () => purgeUser({ userId: user.id }),
                                  t('superadmin.trash.userPurged', 'User permanently deleted'),
                                  t('superadmin.trash.actionFailed', 'Action failed'),
                                );
                              }
                            }}
                          >
                            <UserX className="h-3.5 w-3.5" />
                            {t('superadmin.trash.purge', 'Purge')}
                          </Button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {trash && trash.organizations.length === 0 && trash.users.length === 0 && (
          <div className="mt-10 flex flex-col items-center gap-2 text-center">
            <Trash2 className="h-10 w-10 text-(--text-muted) opacity-30" />
            <p className="text-sm text-muted-foreground">
              {t(
                'superadmin.trash.allEmpty',
                'The trash is empty. Deleting an organization or user moves it here.',
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
