'use client';

// cspell:disable
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { useOrgSelectorStore } from '@/store/useOrgSelectorStore';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Building2,
  Users,
  CheckCircle,
  XCircle,
  Edit,
  Shield,
  MessageSquare,
  Wrench,
  Eye,
  LogOut,
  Search,
} from 'lucide-react';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { SuperadminBroadcastsPanel } from '@/components/admin/SuperadminBroadcastsPanel';
import { MaintenanceModeManager } from '@/components/admin/MaintenanceModeManager';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';

interface Organization {
  _id: Id<'organizations'>;
  name: string;
  slug: string;
  plan: 'starter' | 'professional' | 'enterprise';
  isActive: boolean;
  totalEmployees: number;
  activeEmployees: number;
  employeeLimit: number;
  industry?: string;
  adminNames?: string[];
}

export default function OrganizationsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuthStore();
  const selectedOrgId = useOrgSelectorStore((state) => state.selectedOrgId);
  const _setSelectedOrgId = useOrgSelectorStore((state) => state.setSelectedOrgId);
  const clearSelection = useOrgSelectorStore((state) => state.clearSelection);
  const [activeTab, setActiveTab] = useState('organizations');
  const [searchQuery, setSearchQuery] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const organizations = useQuery(
    api.organizations.getAllOrganizations,
    user?.id ? { superadminUserId: user.id as Id<'users'> } : 'skip',
  ) as Organization[] | undefined;

  // Filter organizations
  const filteredOrgs = organizations?.filter((org) => {
    const matchesSearch =
      org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      org.slug.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPlan = planFilter === 'all' || org.plan === planFilter;
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && org.isActive) ||
      (statusFilter === 'inactive' && !org.isActive);
    return matchesSearch && matchesPlan && matchesStatus;
  });

  const isSuperadmin = user?.role === 'superadmin';

  // Debug logging
  useEffect(() => {
    if (user) {
      // Debug info
    }

    if (!user) {
      // router.push("/login"); // TEMPORARY DISABLED
    }
  }, [user, isSuperadmin, router]);

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <ShieldLoader size="lg" />
      </div>
    );
  }

  if (!isSuperadmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">{t('ui.accessDenied')}</h1>
          <p className="text-muted-foreground">{t('ui.onlySuperadminCanAccess')}</p>
          <p className="text-xs text-muted-foreground mt-2">
            Your role: {user.role} | Email: {user.email}
          </p>
        </div>
      </div>
    );
  }

  if (organizations === undefined) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <ShieldLoader size="lg" />
      </div>
    );
  }

  const getPlanBadgeColor = (plan: string) => {
    switch (plan) {
      case 'enterprise':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/20 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/30';
      case 'professional':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30';
      case 'starter':
        return 'bg-green-500/10 text-green-400 border-green-500/20 dark:bg-green-500/20 dark:text-green-300 dark:border-green-500/30';
      default:
        return 'bg-gray-500/10 text-gray-400 border-gray-500/20 dark:bg-gray-500/20 dark:text-gray-300 dark:border-gray-500/30';
    }
  };

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
          <h1
            className="text-3xl md:text-4xl font-bold mb-2"
            style={{ color: 'var(--text-primary)' }}
          >
            {t('admin.superadminPanel')}
          </h1>
          <p className="text-muted-foreground">{t('superadmin.organizations.subtitle')}</p>
        </div>

        {/* Tabs Interface */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {/* Tab List */}
          <TabsList
            className="grid w-full grid-cols-3 h-auto p-1.5 mb-6"
            style={{ background: 'var(--background-subtle)' }}
          >
            <TabsTrigger
              value="organizations"
              className="flex items-center justify-center gap-2 py-2.5 data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white"
            >
              <Building2 className="w-4 h-4" />
              <span className="hidden sm:inline">{t('superadmin.organizations.title')}</span>
              <span className="sm:hidden text-xs">({filteredOrgs?.length || 0})</span>
            </TabsTrigger>
            <TabsTrigger
              value="announcements"
              className="flex items-center justify-center gap-2 py-2.5 data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white"
            >
              <MessageSquare className="w-4 h-4" />
              <span className="hidden sm:inline">{t('superadmin.announcements.title')}</span>
              <span className="sm:hidden text-xs">{t('superadmin.announcements.new')}</span>
            </TabsTrigger>
            <TabsTrigger
              value="maintenance"
              className="flex items-center justify-center gap-2 py-2.5 data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white"
            >
              <Wrench className="w-4 h-4" />
              <span className="hidden sm:inline">{t('superadmin.maintenance.title')}</span>
              <span className="sm:hidden text-xs">{t('superadmin.maintenance.config')}</span>
            </TabsTrigger>
          </TabsList>

          {/* Tab Content - Organizations */}
          <TabsContent value="organizations" className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-4">
              <div
                className="p-4 rounded-lg border"
                style={{ background: 'var(--background-subtle)' }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="w-4 h-4 text-blue-500" />
                  <p className="text-xs text-muted-foreground">
                    {t('superadmin.organizations.stats.totalOrgs')}
                  </p>
                </div>
                <p className="text-2xl font-bold">{filteredOrgs?.length || 0}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('superadmin.organizations.stats.count')}
                </p>
              </div>
              <div
                className="p-4 rounded-lg border"
                style={{ background: 'var(--background-subtle)' }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <p className="text-xs text-muted-foreground">
                    {t('superadmin.organizations.stats.active')}
                  </p>
                </div>
                <p className="text-2xl font-bold text-green-500">
                  {filteredOrgs?.filter((o) => o.isActive).length || 0}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('superadmin.organizations.stats.working')}
                </p>
              </div>
              <div
                className="p-4 rounded-lg border"
                style={{ background: 'var(--background-subtle)' }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-orange-500" />
                  <p className="text-xs text-muted-foreground">
                    {t('superadmin.organizations.stats.viewed')}
                  </p>
                </div>
                <p className="text-2xl font-bold">
                  {filteredOrgs?.reduce((sum, o) => sum + (o.totalEmployees || 0), 0) || 0}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('superadmin.organizations.stats.total')}
                </p>
              </div>
              <div
                className="p-4 rounded-lg border"
                style={{ background: 'var(--background-subtle)' }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="w-4 h-4 text-red-500" />
                  <p className="text-xs text-muted-foreground">
                    {t('superadmin.organizations.stats.inactive')}
                  </p>
                </div>
                <p className="text-2xl font-bold text-red-500">
                  {filteredOrgs?.filter((o) => !o.isActive).length || 0}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('superadmin.organizations.stats.suspended')}
                </p>
              </div>
            </div>

            {/* Filters & Search */}
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={t('placeholders.searchOrganizations')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Select value={planFilter} onValueChange={setPlanFilter}>
                  <SelectTrigger className="w-37.5">
                    <SelectValue placeholder={t('filters.plan')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('filters.allPlans')}</SelectItem>
                    <SelectItem value="starter">Starter</SelectItem>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-37.5">
                    <SelectValue placeholder={t('filters.status')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('filters.allStatuses')}</SelectItem>
                    <SelectItem value="active">{t('statuses.active')}</SelectItem>
                    <SelectItem value="inactive">{t('statuses.inactive')}</SelectItem>
                  </SelectContent>
                </Select>
                {selectedOrgId && (
                  <Button variant="outline" size="sm" onClick={clearSelection} className="gap-2">
                    <LogOut className="w-4 h-4" />
                    {t('actions.clearSelection')}
                  </Button>
                )}
              </div>
            </div>

            {/* Currently Viewing Badge */}
            {selectedOrgId && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
                <Eye className="w-4 h-4 text-blue-500" />
                <span className="text-sm text-blue-500 font-medium">
                  {t('superadmin.viewingOrganization')}:{' '}
                  {organizations?.find((o) => o._id === selectedOrgId)?.name}
                </span>
              </div>
            )}

            {/* Organizations List */}
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                  {t('superadmin.organizations.list.title')}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t('superadmin.organizations.list.description')}
                </p>
              </div>

              {organizations?.map((org) => (
                <div
                  key={org._id}
                  className="p-4 rounded-lg border hover:border-blue-400/50 transition-all hover:shadow-md"
                  style={{ background: 'var(--card)' }}
                >
                  {/* Title Row */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <h3
                        className="text-base font-bold truncate"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {org.name}
                      </h3>
                      <p className="text-xs text-muted-foreground font-mono mt-1">{org.slug}</p>
                    </div>
                    <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold border ${getPlanBadgeColor(
                          org.plan,
                        )}`}
                      >
                        {org.plan.toUpperCase()}
                      </span>
                      {org.isActive ? (
                        <span className="px-2 py-1 rounded text-xs font-semibold bg-green-500/10 text-green-500 border border-green-500/30">
                          {t('superadmin.organizations.card.statusActive')}
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded text-xs font-semibold bg-red-500/10 text-red-500 border border-red-500/30">
                          {t('superadmin.organizations.card.statusInactive')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div
                    className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3 pb-3"
                    style={{ borderBottom: '1px solid var(--border)' }}
                  >
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">
                        {t('superadmin.organizations.card.totalEmployees')}
                      </p>
                      <p className="font-bold">{org.totalEmployees}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">
                        {t('superadmin.organizations.card.activeEmployees')}
                      </p>
                      <p className="font-bold text-green-500">{org.activeEmployees}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">
                        {t('superadmin.organizations.card.employeeLimit')}
                      </p>
                      <p className="font-bold">{org.employeeLimit}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">
                        {t('superadmin.organizations.card.industry')}
                      </p>
                      <p className="text-sm font-mono">{org.industry || '—'}</p>
                    </div>
                  </div>

                  {/* Admins & Actions */}
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex-1">
                      {org.adminNames && org.adminNames.length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                          {org.adminNames.map((name, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-1 rounded text-xs bg-blue-500/10 text-blue-500 border border-blue-500/30 whitespace-nowrap"
                            >
                              👤 {name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() =>
                          router.push(`/superadmin/organizations/${org._id}/manage-admins`)
                        }
                        className="p-2 rounded hover:bg-blue-500/10 text-blue-500 transition-colors"
                        title={t('superadmin.organizations.card.manageAdmins')}
                      >
                        <Shield className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => router.push(`/superadmin/organizations/${org._id}/edit`)}
                        className="p-2 rounded transition-colors"
                        style={{ color: 'var(--text-primary)' }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = 'var(--background-subtle)')
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = t('common.transparent'))
                        }
                        title={t('superadmin.organizations.card.edit')}
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {(!organizations || organizations.length === 0) && (
                <div
                  className="text-center py-12 rounded-lg"
                  style={{ background: 'var(--background-subtle)' }}
                >
                  <Building2 className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-30" />
                  <h3
                    className="font-semibold text-lg mb-1"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {t('superadmin.organizations.list.notFound')}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t('superadmin.organizations.list.empty')}
                  </p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Tab Content - Service Announcements */}
          <TabsContent value="announcements" className="space-y-6">
            <div className="rounded-xl border p-6" style={{ background: 'var(--card)' }}>
              <SuperadminBroadcastsPanel
                organizationId={user?.organizationId as Id<'organizations'>}
                userId={user?.id as Id<'users'>}
              />
            </div>
          </TabsContent>

          {/* Tab Content - Maintenance Mode */}
          <TabsContent value="maintenance" className="space-y-6">
            <div className="rounded-xl border p-6" style={{ background: 'var(--card)' }}>
              <MaintenanceModeManager
                organizationId={user?.organizationId as Id<'organizations'>}
                userId={user?.id as Id<'users'>}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
