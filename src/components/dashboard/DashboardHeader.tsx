'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, CreditCard, ShieldCheck, CalendarDays, Plus } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import type { Organization } from '@/lib/convex-types';

interface DashboardHeaderProps {
  selectedOrganization: Organization | undefined;
  userRole: string | undefined;
}

function getDateFnsLocale(lang?: string) {
  switch (lang) {
    case 'ru':
      return ru;
    case 'hy':
      return hy;
    default:
      return enUS;
  }
}

export function DashboardHeader({ selectedOrganization, userRole }: DashboardHeaderProps) {
  const { t, i18n } = useTranslation();
  const dateFnsLocale = getDateFnsLocale(i18n.language);
  const today = new Date();

  /**
   * One band, one line.
   *
   * The title, the date and the actions were stacked in a column at every width,
   * so on a desktop the band ate a third of the first screen and left a wide
   * empty gutter on the right. The organization's name is the heading — the word
   * "Dashboard" is a label above it, not half the sentence — and the date sits
   * beside it as a chip rather than on its own line.
   */
  return (
    <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 mb-4 sm:mb-5 bg-(--background)/95 backdrop-blur supports-backdrop-filter:bg-(--background)/60 border-b border-(--border)">
      <div className="flex flex-wrap flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          {selectedOrganization?.name && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-(--text-muted)">
              {t('nav.dashboard', { defaultValue: 'Dashboard' })}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-primary-text truncate">
              {selectedOrganization?.name ?? t('nav.dashboard', { defaultValue: 'Dashboard' })}
            </h2>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-(--border) bg-(--card) px-2.5 py-0.5 text-xs text-(--text-muted) whitespace-nowrap">
              <CalendarDays className="w-3.5 h-3.5" />
              <span className="capitalize">
                {format(today, 'EEEE, MMMM d', { locale: dateFnsLocale })}
              </span>
            </span>
          </div>
        </div>

        <div className="max-w-full flex gap-1.5 sm:gap-2 flex-wrap lg:shrink-0">
          {userRole === 'superadmin' && (
            <>
              <Button
                asChild
                size="sm"
                variant="outline"
                className="hover:text-(--text-primary) transition-colors"
              >
                <Link href="/superadmin/organizations">
                  <Building2 className="w-4 h-4" />
                  {t('dashboard.manageOrgs')}
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline" style={{ color: 'var(--primary)' }}>
                <Link href="/superadmin/create-org">
                  <Building2 className="w-4 h-4" />
                  {t('dashboard.createOrg')}
                </Link>
              </Button>
              <Button
                asChild
                size="sm"
                variant="outline"
                style={{
                  borderColor: 'color-mix(in srgb, var(--success) 25%, transparent)',
                  background: 'color-mix(in srgb, var(--success) 6%, transparent)',
                  color: 'var(--success)',
                }}
              >
                <Link href="/superadmin/stripe-dashboard">
                  <CreditCard className="w-4 h-4" />
                  {t('dashboard.stripeDashboard')}
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline" style={{ color: 'var(--primary)' }}>
                <Link href="/superadmin/security">
                  <ShieldCheck className="w-4 h-4" />
                  {t('landingExtra.securityCenter')}
                </Link>
              </Button>
            </>
          )}
          <Button
            asChild
            size="sm"
            variant="outline"
            className="hover:text-(--text-primary) transition-colors"
          >
            <Link href="/calendar">
              <CalendarDays className="w-4 h-4" />
              {t('nav.calendar')}
            </Link>
          </Button>
          <Button
            asChild
            size="sm"
            variant="default"
            className="flex items-center gap-2 w-auto justify-center btn-gradient font-medium shadow-md hover:shadow-lg"
          >
            <Link href="/leaves">
              <Plus className="w-4 h-4" />
              {t('dashboard.newRequest')}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
