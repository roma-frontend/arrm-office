/**
 * Superadmin Access Matrix.
 *
 * A live grid of what every role tier can do, how those roles are distributed
 * across tenants, and drift alerts for accounts holding roles outside the enum
 * (the classic "shadow permission" — a renamed role silently grants nothing).
 */

'use client';

import { useState } from 'react';
import { useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, Grid3x3, ShieldCheck, Users, X } from 'lucide-react';

import { api } from '@/convex/_generated/api';
import { ShieldLoader } from '@/components/ui/ShieldLoader';

type Capability = { key: string; description: string };

export function AccessMatrixClient() {
  const { t } = useTranslation();
  const matrix = useQuery(api.superadmin.accessMatrix.getAccessMatrix);
  const [driftOpen, setDriftOpen] = useState(false);

  if (!matrix) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <ShieldLoader size="xs" variant="inline" />
        {t('superadmin.controlCenter.loading', 'Loading…')}
      </div>
    );
  }

  const { capabilities, roles, globalCounts, perOrg, drift } = matrix;
  const totalUsers = Object.values(globalCounts).reduce((a, b) => a + b, 0);

  const roleColor = (role: string) =>
    role === 'superadmin'
      ? 'text-(--danger-text)'
      : role === 'admin'
        ? 'text-(--brand-text)'
        : role === 'supervisor'
          ? 'text-(--warning-text)'
          : 'text-muted-foreground';

  const roleLabel = (role: string, fallback: string) =>
    t(`superadmin.accessMatrix.roleLabels.${role}`, fallback);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl">
        <div className="my-6">
          <h1
            className="text-3xl md:text-4xl font-bold mb-2"
            style={{ color: 'var(--text-primary)' }}
          >
            {t('superadmin.accessMatrix.title', 'Access Matrix')}
          </h1>
          <p className="text-muted-foreground">
            {t(
              'superadmin.accessMatrix.subtitle',
              'Who can do what across every tenant — capability grants per role tier',
            )}
          </p>
        </div>

        {/* Global distribution */}
        <div className="rounded-2xl border border-(--border)/60 bg-(--card)/50 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-4 w-4 text-(--brand-text)" />
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              {t('superadmin.accessMatrix.globalDistribution', 'Global role distribution')}
            </h2>
            <span className="ml-auto text-xs font-semibold text-muted-foreground">
              {totalUsers} {t('superadmin.accessMatrix.users', 'users')}
            </span>
          </div>
          <div className="flex h-3 w-full overflow-hidden rounded-full">
            {roles.map((role) => {
              const count = globalCounts[role.role] ?? 0;
              if (count === 0) return null;
              const pct = (count / Math.max(totalUsers, 1)) * 100;
              return (
                <div
                  key={role.role}
                  className={
                    role.role === 'superadmin'
                      ? 'bg-(--danger-solid)'
                      : role.role === 'admin'
                        ? 'bg-(--brand)'
                        : role.role === 'supervisor'
                          ? 'bg-(--warning-solid)'
                          : role.role === 'employee'
                            ? 'bg-(--muted-foreground)/70'
                            : 'bg-(--muted-foreground)/40'
                  }
                  style={{ width: `${pct}%` }}
                  title={`${role.label}: ${count}`}
                />
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
            {roles.map((role) => (
              <span
                key={role.role}
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <span
                  className={`h-2.5 w-2.5 rounded-sm ${
                    role.role === 'superadmin'
                      ? 'bg-(--danger-solid)'
                      : role.role === 'admin'
                        ? 'bg-(--brand)'
                        : role.role === 'supervisor'
                          ? 'bg-(--warning-solid)'
                          : role.role === 'employee'
                            ? 'bg-(--muted-foreground)/70'
                            : 'bg-(--muted-foreground)/40'
                  }`}
                />
                {roleLabel(role.role, role.label)} · {globalCounts[role.role] ?? 0}
              </span>
            ))}
          </div>
        </div>

        {/* Capability × role grid */}
        <div className="mt-6 rounded-2xl border border-(--border)/60 bg-(--card)/50 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-(--border)/60 px-5 py-4">
            <Grid3x3 className="h-4 w-4 text-(--brand-text)" />
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              {t('superadmin.accessMatrix.grid', 'Capability grid')}
            </h2>
            <span className="ml-auto text-xs text-muted-foreground">
              {capabilities.length}{' '}
              {t('superadmin.accessMatrix.capabilities', 'enforced capabilities')}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-(--border)/60 text-left text-xs uppercase tracking-widest text-muted-foreground">
                  <th className="px-5 py-3 font-semibold">
                    {t('superadmin.accessMatrix.capability', 'Capability')}
                  </th>
                  {roles.map((role) => (
                    <th key={role.role} className="px-4 py-3 text-center font-semibold">
                      <span className={roleColor(role.role)}>
                        {roleLabel(role.role, role.label)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-(--border)/40">
                {capabilities.map((cap: Capability) => (
                  <tr key={cap.key}>
                    <td className="px-5 py-3">
                      <p className="font-mono text-xs" style={{ color: 'var(--text-primary)' }}>
                        {cap.key}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{cap.description}</p>
                    </td>
                    {roles.map((role) => {
                      const granted = (role.capabilities as string[]).includes(cap.key);
                      return (
                        <td key={role.role} className="px-4 py-3 text-center">
                          {granted ? (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-(--brand-quiet)">
                              <Check className="h-3.5 w-3.5 text-(--brand-text)" />
                            </span>
                          ) : (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-(--muted)/40">
                              <X className="h-3 w-3 text-(--text-muted) opacity-40" />
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Drift alerts */}
        {drift.length > 0 && (
          <div className="mt-6 rounded-2xl border border-(--danger-outline)/60 bg-(--danger-quiet)/30 overflow-hidden">
            <button
              className="flex w-full items-center gap-2 px-5 py-4 text-left"
              onClick={() => setDriftOpen((v) => !v)}
            >
              <AlertTriangle className="h-4 w-4 text-(--danger-text)" />
              <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                {t(
                  'superadmin.accessMatrix.drift',
                  'Role drift — accounts with roles outside the enum',
                )}
              </h2>
              <span className="ml-auto rounded-full bg-(--danger-solid) px-2 py-0.5 text-[11px] font-bold text-white">
                {drift.length}
              </span>
            </button>
            {driftOpen && (
              <div className="border-t border-(--danger-outline)/40 px-5 py-4">
                <p className="text-xs text-muted-foreground mb-3">
                  {t(
                    'superadmin.accessMatrix.driftHint',
                    'These roles match no tier, so the accounts hold no granted capabilities. Rename the role or flag the account.',
                  )}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-(--border)/40 text-left text-xs uppercase tracking-widest text-muted-foreground">
                        <th className="px-3 py-2 font-semibold">
                          {t('superadmin.accessMatrix.user', 'User')}
                        </th>
                        <th className="px-3 py-2 font-semibold">
                          {t('superadmin.accessMatrix.org', 'Organization')}
                        </th>
                        <th className="px-3 py-2 font-semibold">
                          {t('superadmin.accessMatrix.role', 'Role')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-(--border)/30">
                      {drift.map((d) => (
                        <tr key={d.userId}>
                          <td className="px-3 py-2">
                            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                              {d.name}
                            </span>
                            <span className="ml-2 font-mono text-xs text-muted-foreground">
                              {d.email}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{d.orgName}</td>
                          <td className="px-3 py-2">
                            <span className="rounded-full bg-(--danger-quiet) px-2 py-0.5 font-mono text-[11px] font-semibold text-(--danger-text)">
                              {d.role}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {drift.length === 0 && (
          <div className="mt-6 flex items-center gap-2 rounded-2xl border border-(--border)/60 bg-(--card)/50 px-5 py-4 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-(--brand-text)" />
            {t(
              'superadmin.accessMatrix.noDrift',
              'No role drift — every account holds a role from the enum.',
            )}
          </div>
        )}

        {/* Per-org breakdown */}
        <div className="mt-6 rounded-2xl border border-(--border)/60 bg-(--card)/50 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-(--border)/60 px-5 py-4">
            <Grid3x3 className="h-4 w-4 text-(--brand-text)" />
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              {t('superadmin.accessMatrix.perOrg', 'Roles per organization')}
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-(--border)/60 text-left text-xs uppercase tracking-widest text-muted-foreground">
                  <th className="px-5 py-3 font-semibold">
                    {t('superadmin.accessMatrix.org', 'Organization')}
                  </th>
                  {roles.map((role) => (
                    <th key={role.role} className="px-4 py-3 text-center font-semibold">
                      {roleLabel(role.role, role.label)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-(--border)/40">
                {perOrg.map((org) => (
                  <tr key={org.orgId}>
                    <td className="px-5 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                      {org.orgName}
                    </td>
                    {roles.map((role) => (
                      <td key={role.role} className="px-4 py-3 text-center text-muted-foreground">
                        {org.counts[role.role] ?? 0}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
