'use client';

import { useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useMediaQuery } from '@/hooks/useMediaQuery';

import {
  Users,
  UserCheck,
  UserX,
  Briefcase,
  Award,
  TrendingUp,
  Clock,
  Star,
  Zap,
  X,
  PanelRightClose,
  PanelRightOpen,
  ChevronUp,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createPortal } from 'react-dom';
import { useLayoutEffect, useMemo, useState } from 'react';
import Image from 'next/image';

interface TeamSidebarProps {
  userId?: Id<'users'>;
  onToggle?: (isOpen: boolean) => void;
}

interface CollapsibleSectionProps {
  title: React.ReactNode;
  isCollapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function CollapsibleSection({ title, isCollapsed, onToggle, children }: CollapsibleSectionProps) {
  const bezier: [number, number, number, number] = [0.34, 1.56, 0.64, 1];

  return (
    <Card className="border-0 shadow-lg bg-linear-to-br from-(--card) to-(--background-subtle) overflow-hidden px-3 sm:px-0">
      <CardHeader className="pb-0 cursor-pointer" onClick={onToggle}>
        <CardTitle className="text-sm font-semibold text-(--text-muted) uppercase tracking-wider flex items-center justify-between gap-2 py-3">
          <div className="flex items-center gap-2">{title}</div>
          <motion.div
            animate={{ rotate: isCollapsed ? 0 : 180 }}
            transition={{ duration: 0.4, ease: bezier }}
          >
            <ChevronUp className="w-4 h-4" />
          </motion.div>
        </CardTitle>
      </CardHeader>

      <AnimatePresence>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: bezier }}
          >
            <CardContent className="space-y-3 pt-3">{children}</CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

function BizierEasingCard({
  children,
  index = 0,
  isExpanded,
  className = '',
  isMobile = false,
}: {
  children: React.ReactNode;
  index?: number;
  isExpanded: boolean;
  className?: string;
  isMobile?: boolean;
}) {
  const bezier: [number, number, number, number] = [0.34, 1.56, 0.64, 1];
  const mobileEase: [number, number, number, number] = [0.25, 0.1, 0.25, 1];

  const initial = isMobile ? { opacity: 0 } : { opacity: 0, scale: 0.9 };
  const animate = isExpanded
    ? { opacity: 1, ...(isMobile ? {} : { scale: 1 }) }
    : { opacity: 0, ...(isMobile ? {} : { scale: 0.9 }) };

  return (
    <motion.div
      className={className}
      initial={initial}
      animate={animate}
      transition={{
        delay: index * 0.06,
        duration: isMobile ? 0.22 : 0.45,
        ease: isMobile ? mobileEase : bezier,
      }}
    >
      {children}
    </motion.div>
  );
}

export function TeamSidebar({ userId, onToggle }: TeamSidebarProps) {
  const { t } = useTranslation();

  // ✅ Важно: на мобайле лучше использовать bottom-sheet UX
  const isMobile = useMediaQuery('(max-width: 640px)');

  // ✅ уважать Reduce Motion
  const reduceMotion = useReducedMotion(); // true если у устройства включено Reduced Motion [3](https://motion.dev/docs/react-use-reduced-motion)

  const [isPanelCollapsed, setIsPanelCollapsed] = useState(true);

  const [collapsedSections, setCollapsedSections] = useState({
    overview: true,
    recent: true,
    quickStats: true,
  });

  // easing (без string)
  const bezier: [number, number, number, number] = [0.34, 1.56, 0.64, 1];
  const mobileEase: [number, number, number, number] = [0.25, 0.1, 0.25, 1];

  // ===== Floating button animation =====

  const floatingTop = isMobile
    ? `calc(env(safe-area-inset-top) + 6rem)`
    : `calc(env(safe-area-inset-top) + 10rem)`;

  const collapsedYOffset = 64;

  // меньше высота подъёма (у тебя уже -38)
  const flyInFrom = -38;

  const openY: number[] = reduceMotion
    ? [collapsedYOffset, 0] // если Reduce Motion - без прыжков
    : [collapsedYOffset, flyInFrom, -12, 0];

  const openTimes: number[] = reduceMotion ? [0, 1] : [0, 0.55, 0.82, 1];

  const closeY: number[] = reduceMotion
    ? [0, collapsedYOffset]
    : [0, collapsedYOffset + 12, collapsedYOffset - 8, collapsedYOffset];

  const closeTimes: number[] = reduceMotion ? [0, 1] : [0, 0.65, 0.86, 1];

  // ===== Body scroll lock (mobile) =====
  useLayoutEffect(() => {
    if (!isMobile) return;

    if (!isPanelCollapsed) {
      const scrollY = window.scrollY;
      document.documentElement.style.overflow = 'hidden';
      document.documentElement.style.height = '100%';
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.top = `-${scrollY}px`;
      sessionStorage.setItem('scrollY', String(scrollY));
    } else {
      const saved = sessionStorage.getItem('scrollY');
      document.documentElement.style.overflow = '';
      document.documentElement.style.height = '';
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.top = '';
      if (saved) {
        window.scrollTo(0, parseInt(saved, 10));
        sessionStorage.removeItem('scrollY');
      }
    }

    return () => {
      document.documentElement.style.overflow = '';
      document.documentElement.style.height = '';
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.top = '';
    };
  }, [isMobile, isPanelCollapsed]);

  const toggleSection = (section: keyof typeof collapsedSections) => {
    setCollapsedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // ===== Data =====
  const allUsers = useQuery(
    api.users.queries.getAllUsers,
    userId ? { requesterId: userId } : 'skip',
  );

  const stats = allUsers?.reduce(
    (acc, user) => {
      if (user.role === 'superadmin') return acc;
      if (!user.isActive) {
        acc.inactive++;
        return acc;
      }

      acc.total++;
      if (user.role === 'admin') acc.admins++;
      else if (user.role === 'supervisor') acc.supervisors++;
      else if (user.role === 'employee') acc.employees++;
      else if (user.role === 'driver') acc.drivers++;

      if ((user as any).employeeType === 'contractor') acc.contractors++;
      else acc.staff++;

      return acc;
    },
    {
      total: 0,
      admins: 0,
      supervisors: 0,
      employees: 0,
      drivers: 0,
      contractors: 0,
      staff: 0,
      inactive: 0,
    },
  ) || {
    total: 0,
    admins: 0,
    supervisors: 0,
    employees: 0,
    drivers: 0,
    contractors: 0,
    staff: 0,
    inactive: 0,
  };

  const recentEmployees =
    allUsers
      ?.filter((u: any) => u.isActive)
      .sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 5) || [];

  const overviewTitle = useMemo(
    () => (
      <span className="flex items-center gap-2">
        <Users className="w-4 h-4" />
        {t('employees.teamOverview')}
      </span>
    ),
    [t],
  );

  const recentTitle = useMemo(
    () => (
      <span className="flex items-center gap-2">
        <TrendingUp className="w-4 h-4" />
        {t('employees.newMembers')}
      </span>
    ),
    [t],
  );

  const quickStatsTitle = useMemo(
    () => (
      <span className="flex items-center gap-2">
        <Award className="w-4 h-4" />
        {t('dashboard.quickStats')}
      </span>
    ),
    [t],
  );

  // ===== Reusable content =====
  const SidebarContent = (
    <div className="sm:p-0">
      <CollapsibleSection
        title={overviewTitle}
        isCollapsed={collapsedSections.overview}
        onToggle={() => toggleSection('overview')}
      >
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <BizierEasingCard
            index={0}
            isExpanded={!collapsedSections.overview}
            isMobile={isMobile}
            className="p-2 sm:p-3 rounded-xl bg-blue-500/10 border border-blue-500/20"
          >
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
              <UserCheck className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-blue-500" />
              <span className="text-[10px] sm:text-xs text-blue-600 font-medium">
                {t('employees.active')}
              </span>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-blue-600">{stats.total}</p>
          </BizierEasingCard>

          <BizierEasingCard
            index={1}
            isExpanded={!collapsedSections.overview}
            isMobile={isMobile}
            className="p-2 sm:p-3 rounded-xl bg-gray-500/10 border border-gray-500/20"
          >
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
              <UserX className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-500" />
              <span className="text-[10px] sm:text-xs text-gray-600 font-medium">
                {t('employees.inactive')}
              </span>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-gray-600">{stats.inactive}</p>
          </BizierEasingCard>
        </div>

        <div className="space-y-1.5 sm:space-y-2 pt-2 border-t border-(--border)">
          <BizierEasingCard
            index={2}
            isExpanded={!collapsedSections.overview}
            isMobile={isMobile}
            className="flex items-center justify-between text-[10px] sm:text-xs"
          >
            <span className="text-(--text-muted) flex items-center gap-1 sm:gap-1.5">
              <Award className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> {t('roles.admin')}
            </span>
            <Badge
              variant="secondary"
              className="bg-purple-500/20 text-purple-600 border-purple-500/30 text-[10px] sm:text-xs"
            >
              {stats.admins}
            </Badge>
          </BizierEasingCard>

          <BizierEasingCard
            index={3}
            isExpanded={!collapsedSections.overview}
            isMobile={isMobile}
            className="flex items-center justify-between text-[10px] sm:text-xs"
          >
            <span className="text-(--text-muted) flex items-center gap-1 sm:gap-1.5">
              <Star className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> {t('roles.supervisor')}
            </span>
            <Badge
              variant="secondary"
              className="bg-amber-500/20 text-amber-600 border-amber-500/30 text-[10px] sm:text-xs"
            >
              {stats.supervisors}
            </Badge>
          </BizierEasingCard>

          <BizierEasingCard
            index={4}
            isExpanded={!collapsedSections.overview}
            isMobile={isMobile}
            className="flex items-center justify-between text-[10px] sm:text-xs"
          >
            <span className="text-(--text-muted) flex items-center gap-1 sm:gap-1.5">
              <UserCheck className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> {t('roles.employee')}
            </span>
            <Badge
              variant="secondary"
              className="bg-green-500/20 text-green-600 border-green-500/30 text-[10px] sm:text-xs"
            >
              {stats.employees}
            </Badge>
          </BizierEasingCard>

          {stats.drivers > 0 && (
            <BizierEasingCard
              index={5}
              isExpanded={!collapsedSections.overview}
              isMobile={isMobile}
              className="flex items-center justify-between text-[10px] sm:text-xs"
            >
              <span className="text-(--text-muted) flex items-center gap-1 sm:gap-1.5">
                <Zap className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> {t('roles.driver')}
              </span>
              <Badge
                variant="secondary"
                className="bg-cyan-500/20 text-cyan-600 border-cyan-500/30 text-[10px] sm:text-xs"
              >
                {stats.drivers}
              </Badge>
            </BizierEasingCard>
          )}
        </div>

        <div className="pt-2 border-t border-(--border)">
          <BizierEasingCard
            index={6}
            isExpanded={!collapsedSections.overview}
            isMobile={isMobile}
            className="flex items-center justify-between text-[10px] sm:text-xs"
          >
            <span className="text-(--text-muted) flex items-center gap-1 sm:gap-1.5">
              <Briefcase className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> {t('employeeTypes.staff')}
            </span>
            <span className="font-semibold text-(--text-primary)">{stats.staff}</span>
          </BizierEasingCard>

          <BizierEasingCard
            index={7}
            isExpanded={!collapsedSections.overview}
            isMobile={isMobile}
            className="flex items-center justify-between text-[10px] sm:text-xs mt-1 sm:mt-1.5"
          >
            <span className="text-(--text-muted) flex items-center gap-1 sm:gap-1.5">
              <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> {t('employeeTypes.contractor')}
            </span>
            <span className="font-semibold text-(--text-primary)">{stats.contractors}</span>
          </BizierEasingCard>
        </div>
      </CollapsibleSection>

      {recentEmployees.length > 0 && (
        <CollapsibleSection
          title={recentTitle}
          isCollapsed={collapsedSections.recent}
          onToggle={() => toggleSection('recent')}
        >
          <div className="space-y-1.5 sm:space-y-2">
            {recentEmployees.map((emp: any, index: number) => (
              <motion.div
                key={emp._id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  delay: index * 0.05,
                  duration: 0.35,
                  ease: isMobile ? mobileEase : bezier,
                }}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-(--background-subtle) transition-colors"
              >
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full overflow-hidden shrink-0 flex items-center justify-center font-bold text-white text-[10px] sm:text-xs bg-linear-to-br from-blue-500 to-sky-500">
                  {emp.avatarUrl ? (
                    <Image
                      src={emp.avatarUrl}
                      alt={emp.name}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                      width={32}
                      height={32}
                    />
                  ) : (
                    emp.name
                      .split(' ')
                      .map((n: string) => n[0])
                      .join('')
                      .toUpperCase()
                      .slice(0, 2)
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-[10px] sm:text-xs font-medium text-(--text-primary) truncate">
                    {emp.name}
                  </p>
                  <p className="text-[9px] sm:text-[10px] text-(--text-muted)">
                    {emp.position || t('common.noPosition')}
                  </p>
                </div>

                <Badge
                  variant="secondary"
                  className="text-[9px] sm:text-[10px] bg-green-500/20 text-green-600 border-green-500/30"
                >
                  New
                </Badge>
              </motion.div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      <CollapsibleSection
        title={quickStatsTitle}
        isCollapsed={collapsedSections.quickStats}
        onToggle={() => toggleSection('quickStats')}
      >
        <div className="space-y-2 sm:space-y-3">
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.05, duration: 0.35, ease: isMobile ? mobileEase : bezier }}
            className="flex items-center justify-between"
          >
            <span className="text-[10px] sm:text-xs text-(--success)">
              {t('employees.supervisors')}
            </span>
            <span className="text-xs sm:text-sm font-bold text-(--success)">
              {stats.supervisors}
            </span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1, duration: 0.35, ease: isMobile ? mobileEase : bezier }}
            className="flex items-center justify-between"
          >
            <span className="text-[10px] sm:text-xs text-(--success)">
              {t('employees.contractors')}
            </span>
            <span className="text-xs sm:text-sm font-bold text-(--success)">
              {stats.contractors}
            </span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15, duration: 0.35, ease: isMobile ? mobileEase : bezier }}
            className="pt-2 border-t border-(--border)"
          >
            <p className="text-[9px] sm:text-[10px] text-(--text-muted) text-center">
              💡 {t('employees.teamHealthGood')}
            </p>
          </motion.div>
        </div>
      </CollapsibleSection>
    </div>
  );

  // ===== Desktop sidebar (right) =====
  const DesktopSidebar = (
    <AnimatePresence>
      {!isPanelCollapsed && (
        <motion.aside
          key="desktop-sidebar"
          initial={{ opacity: 0, x: 100 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 100 }}
          transition={{
            duration: 0.35,
            ease: bezier,
          }}
          className="fixed top-16 sm:top-51 right-0 sm:right-6 z-70 w-80 sm:w-64 max-h-[calc(100vh-80px)] sm:max-h-[calc(100vh-180px)] overflow-y-auto space-y-3 sm:space-y-4 scrollbar-thin scrollbar-thumb-[var(--muted-foreground)] scrollbar-track-transparent lg:shadow-lg rounded-xl"
          style={{
            background: 'var(--card)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          }}
        >
          {SidebarContent}
        </motion.aside>
      )}
    </AnimatePresence>
  );

  // ===== Mobile sheet (bottom) =====
  const MobileSheet = (
    <AnimatePresence>
      {!isPanelCollapsed && (
        <>
          {/* Backdrop */}
          <motion.div
            key="mobile-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: mobileEase }}
            onClick={() => {
              setIsPanelCollapsed(true);
              onToggle?.(false);
            }}
            className="fixed inset-0 z-60"
            style={{ backdropFilter: 'blur(8px)' }}
          />

          {/* Sheet */}
          <motion.div
            key="mobile-sheet"
            initial={{ y: -600 }}
            animate={{ y: 0 }}
            exit={{ y: -600 }}
            transition={{ duration: 0.28, ease: mobileEase }}
            drag={reduceMotion ? false : 'y'}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              // свайп вниз закрывает
              if (info.offset.y > 120) {
                setIsPanelCollapsed(true);
                onToggle?.(false);
              }
            }}
            className="fixed left-0 right-0 top-0 z-70 rounded-t-2xl border-t border-(--border) shadow-2xl"
            style={{
              background: 'var(--input)',
              height: '100%',
              paddingTop: 'calc(env(safe-area-inset-top) + 12px)',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {/* Grab handle + header */}
            <div className="px-4 pt-3 pb-2 border-b border-(--border) bg-(--card) sticky top-0 z-10 rounded-t-2xl">
              <div className="mx-auto h-1 w-10 rounded-full bg-(--muted-foreground)/30 mb-2" />
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {t('employees.teamOverview')}
                </span>
                <button
                  onClick={() => {
                    setIsPanelCollapsed(true);
                    onToggle?.(false);
                  }}
                  className="p-2 rounded-lg hover:bg-(--background-subtle)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="px-2 pb-4 overflow-y-auto" style={{ height: '100%' }}>
              {SidebarContent}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(
    <>
      {/* Floating toggle button */}
      <AnimatePresence>
        {!(isMobile && !isPanelCollapsed) && (
          <motion.button
            initial={false}
            onClick={() => {
              const newCollapsed = !isPanelCollapsed;
              setIsPanelCollapsed(newCollapsed);
              onToggle?.(!newCollapsed);
            }}
            className="fixed right-4 sm:right-8 z-[100] w-10 h-10 sm:w-9 sm:h-9 rounded-full shadow-lg flex items-center justify-center"
            style={{
              top: floatingTop,
              background: 'var(--primary)',
              color: 'var(--primary-foreground)',
              boxShadow: '0 4px 20px rgba(37, 99, 235, 0.5)',
            }}
            animate={{
              // ✅ на мобайле не трогаем y (стабильно)
              y: isMobile ? 0 : isPanelCollapsed ? closeY : openY,
              opacity: 1,
              scale: 1,
            }}
            transition={{
              duration: isMobile ? 0.18 : 0.55,
              ease: isMobile ? mobileEase : bezier,
              times: isMobile ? undefined : isPanelCollapsed ? closeTimes : openTimes,
            }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
          >
            {isPanelCollapsed ? (
              <PanelRightOpen className="w-4 h-4 sm:w-5 sm:h-5" />
            ) : (
              <PanelRightClose className="w-4 h-4 sm:w-5 sm:h-5" />
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Panel */}
      {isMobile ? MobileSheet : DesktopSidebar}
    </>,
    document.body,
  );
}
