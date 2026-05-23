'use client';

import React from 'react';
import { motion } from '@/lib/cssMotion';
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

  return (
    <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-6 bg-(--background)/95 backdrop-blur supports-backdrop-filter:bg-(--background)/60 border-b border-(--border)">
      <div className="flex flex-col sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-1 text-primary-text">
            {selectedOrganization?.name
              ? `${t('nav.dashboard', { defaultValue: 'Dashboard' })} - ${selectedOrganization.name}`
              : t('nav.dashboard', { defaultValue: 'Dashboard' })}
          </h2>
          <p className="text-sm text-muted-foreground">
            {format(today, 'EEEE, MMMM d, yyyy', { locale: dateFnsLocale })}
          </p>
        </div>

        <div className="flex gap-1.5 sm:gap-2 flex-wrap">
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
