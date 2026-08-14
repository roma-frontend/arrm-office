'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/components/ThemeProvider';
import { useAuthStore } from '@/store/useAuthStore';
import { logoutAction } from '@/actions/auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useRouter, usePathname } from 'next/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import dynamic from 'next/dynamic';
import { useActiveSection } from '@/hooks/useActiveSection';
import { useHydrated } from '@/hooks/useHydrated';

const MobileMenu = dynamic(() => import('./MobileMenu'), {
  ssr: false,
  loading: () => null,
});

const PlatformMegaMenu = dynamic(() => import('./PlatformMegaMenu'), {
  ssr: false,
  loading: () => null,
});

const ResourcesMenu = dynamic(() => import('./PlatformMegaMenu').then((m) => m.ResourcesMenu), {
  ssr: false,
  loading: () => null,
});

const SolutionsMenu = dynamic(() => import('./SolutionMenus').then((m) => m.SolutionsMenu), {
  ssr: false,
  loading: () => null,
});

const WhyMenu = dynamic(() => import('./SolutionMenus').then((m) => m.WhyMenu), {
  ssr: false,
  loading: () => null,
});

function ShieldIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

export default function Navbar() {
  const { t } = useTranslation();
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mounted = useHydrated();
  const [scrolled, setScrolled] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  const pathname = usePathname();
  const sectionIds = useMemo(
    () => (pathname === '/' ? ['home', 'pricing', 'testimonials', 'faq'] : []),
    [pathname],
  );

  const activeSection = useActiveSection(sectionIds);

  useEffect(() => {
    const checkScreenSize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        setScrolled(window.scrollY > 20);
        // Reading progress — the navbar's thin gradient bar (Spark has none).
        const doc = document.documentElement;
        const max = doc.scrollHeight - window.innerHeight;
        setScrollProgress(max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0);
        ticking = false;
      });
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLogout = async () => {
    await logoutAction();
    router.push('/');
    logout();
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-[100] flex items-center justify-between px-4 md:px-8 lg:px-12 transition-all duration-500 ease-in-out border-b ${
          scrolled ? 'py-2 md:py-3 shadow-lg' : 'py-3 md:py-4'
        }`}
        role="navigation"
        aria-label="Main navigation"
        style={{
          borderColor: 'var(--landing-card-border)',
          willChange: 'padding, box-shadow, background-color',
          transitionProperty: 'padding, box-shadow, background-color, backdrop-filter',
        }}
      >
        <div
          className="absolute inset-0 backdrop-blur-xl border-b transition-all duration-500 ease-in-out"
          style={{
            background: scrolled
              ? 'rgba(var(--landing-navbar-bg-rgb, 15, 23, 42), 0.98)'
              : 'rgba(var(--landing-navbar-bg-rgb, 15, 23, 42), 0.7)',
            borderColor: 'var(--landing-card-border)',
            transition:
              'box-shadow 0.5s cubic-bezier(0.4, 0, 0.2, 1), background 0.5s ease-in-out, backdrop-filter 0.5s ease',
            backdropFilter: scrolled ? 'blur(24px) saturate(180%)' : 'blur(16px) saturate(140%)',
            WebkitBackdropFilter: scrolled
              ? 'blur(24px) saturate(180%)'
              : 'blur(16px) saturate(140%)',
            boxShadow: scrolled
              ? '0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08)'
              : '0 0 0 0 rgba(0, 0, 0, 0)',
          }}
        />

        {/* Reading-progress bar — the thin gradient strip under the navbar */}
        <div
          className="absolute bottom-0 left-0 h-0.5 pointer-events-none"
          style={{
            width: `${scrollProgress}%`,
            background: 'linear-gradient(90deg, #2563eb, #06b6d4, #8b5cf6)',
            boxShadow: '0 0 8px rgba(37, 99, 235, 0.5)',
            transition: 'width 0.1s linear',
            zIndex: 2,
          }}
          aria-hidden="true"
        />

        <Link
          href="/"
          className="relative flex items-center gap-3 group"
          title={t('auth.logoTooltip')}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center logo-spin"
            style={{ background: 'linear-gradient(135deg, #2563eb, #93c5fd)' }}
            aria-hidden="true"
          >
            <ShieldIcon />
          </div>
          <span
            className="font-bold text-lg tracking-tight transition-colors"
            style={{ color: 'var(--landing-text-primary)' }}
          >
            <span style={{ color: 'var(--primary)' }}>Strata</span>
          </span>
        </Link>

        <div className="relative hidden lg:flex items-center gap-4 xl:gap-6">
          {mounted && <PlatformMegaMenu />}
          {mounted && <SolutionsMenu />}
          {mounted && <WhyMenu />}
          {/* Pricing moved into Resources menu */}
          {mounted && <ResourcesMenu activeSection={activeSection} />}
        </div>

        <div className="relative flex items-center gap-2 md:gap-3">
          {mounted && (
            <span
              style={{ color: 'var(--landing-text-primary)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--landing-text-primary)';
              }}
            >
              <LanguageSwitcher />
            </span>
          )}

          {mounted && (
            <button
              onClick={toggleTheme}
              className="w-11 h-11 rounded-xl flex items-center justify-center transition-all hover:scale-110"
              style={{
                background: 'var(--landing-card-bg)',
                border: '1px solid var(--landing-card-border)',
              }}
              aria-label={
                theme === 'dark' ? t('landingExtra.switchToLight') : t('landingExtra.switchToDark')
              }
            >
              {theme === 'dark' ? (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
          )}

          {/* Gate the auth-dependent account menu behind `mounted` so the server
              render and first client render always show the logged-out buttons
              (the zustand store rehydrates from localStorage on the client, which
              would otherwise cause a hydration mismatch). */}
          {mounted && user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-xl px-2 py-1.5 md:px-3 md:py-2 transition-all outline-none focus-visible:outline-none focus:outline-none hover:bg-(--background-subtle)">
                  <Avatar className="w-7 h-7 md:w-8 md:h-8">
                    {user.avatar && <AvatarImage src={user.avatar} alt={user.name} />}
                    <AvatarFallback className="text-xs bg-linear-to-br from-blue-500 to-blue-600 text-white font-semibold">
                      {getInitials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8} asChild>
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -8 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="z-[9999] w-64 rounded-2xl border border-(--border)/50 bg-(--card) p-2 shadow-2xl"
                >
                  <DropdownMenuLabel className="px-3 py-2.5 text-(--text-primary) font-semibold text-sm">
                    {t('landingExtra.myAccount')}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-(--border)/50 my-1" />
                  <AnimatePresence mode="popLayout">
                    <motion.div
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 12 }}
                      transition={{ duration: 0.2, delay: 0.05, ease: 'easeOut' }}
                    >
                      <DropdownMenuItem
                        className="text-(--text-primary) cursor-pointer rounded-xl px-3 py-2.5 gap-3 transition-all duration-200 hover:bg-(--background-subtle) focus:bg-(--background-subtle) focus:text-(--text-primary)"
                        onClick={() => router.push('/dashboard')}
                      >
                        <svg
                          className="w-5 h-5 text-(--text-muted)"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <rect x="3" y="3" width="7" height="7" />
                          <rect x="14" y="3" width="7" height="7" />
                          <rect x="14" y="14" width="7" height="7" />
                          <rect x="3" y="14" width="7" height="7" />
                        </svg>
                        <span className="font-medium">{t('nav.dashboard')}</span>
                      </DropdownMenuItem>
                    </motion.div>
                    <motion.div
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 12 }}
                      transition={{ duration: 0.2, delay: 0.1, ease: 'easeOut' }}
                    >
                      <DropdownMenuItem
                        className="text-(--text-primary) cursor-pointer rounded-xl px-3 py-2.5 gap-3 transition-all duration-200 hover:bg-(--background-subtle) focus:bg-(--background-subtle) focus:text-(--text-primary)"
                        onClick={() => router.push('/settings')}
                      >
                        <svg
                          className="w-5 h-5 text-(--text-muted)"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <circle cx="12" cy="12" r="3" />
                          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                        </svg>
                        <span className="font-medium">{t('nav.settings')}</span>
                      </DropdownMenuItem>
                    </motion.div>
                  </AnimatePresence>
                  <DropdownMenuSeparator className="bg-(--border)/50 my-1" />
                  {/* Show landing page links only when main navbar is hidden (screen < lg) */}
                  {!isDesktop && (
                    <AnimatePresence mode="popLayout">
                      <motion.div
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 12 }}
                        transition={{ duration: 0.2, delay: 0.15, ease: 'easeOut' }}
                      >
                        <DropdownMenuItem
                          className="text-(--text-primary) cursor-pointer rounded-xl px-3 py-2.5 gap-3 transition-all duration-200 hover:bg-(--background-subtle) focus:bg-(--background-subtle) focus:text-(--text-primary)"
                          onClick={() => router.push('/features')}
                        >
                          <svg
                            className="w-5 h-5 text-(--text-muted)"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                          </svg>
                          <span className="font-medium">{t('landing.features')}</span>
                        </DropdownMenuItem>
                      </motion.div>
                      <motion.div
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 12 }}
                        transition={{ duration: 0.2, delay: 0.2, ease: 'easeOut' }}
                      >
                        <DropdownMenuItem
                          className="text-(--text-primary) cursor-pointer rounded-xl px-3 py-2.5 gap-3 transition-all duration-200 hover:bg-(--background-subtle) focus:bg-(--background-subtle) focus:text-(--text-primary)"
                          onClick={() => router.push('/#pricing')}
                        >
                          <svg
                            className="w-5 h-5 text-(--text-muted)"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <line x1="12" y1="1" x2="12" y2="23" />
                            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                          </svg>
                          <span className="font-medium">{t('landing.pricing')}</span>
                        </DropdownMenuItem>
                      </motion.div>
                      <motion.div
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 12 }}
                        transition={{ duration: 0.2, delay: 0.25, ease: 'easeOut' }}
                      >
                        <DropdownMenuItem
                          className="text-(--text-primary) cursor-pointer rounded-xl px-3 py-2.5 gap-3 transition-all duration-200 hover:bg-(--background-subtle) focus:bg-(--background-subtle) focus:text-(--text-primary)"
                          onClick={() => router.push('/#testimonials')}
                        >
                          <svg
                            className="w-5 h-5 text-(--text-muted)"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                          </svg>
                          <span className="font-medium">{t('landing.testimonials')}</span>
                        </DropdownMenuItem>
                      </motion.div>
                      <motion.div
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 12 }}
                        transition={{ duration: 0.2, delay: 0.3, ease: 'easeOut' }}
                      >
                        <DropdownMenuItem
                          className="text-(--text-primary) cursor-pointer rounded-xl px-3 py-2.5 gap-3 transition-all duration-200 hover:bg-(--background-subtle) focus:bg-(--background-subtle) focus:text-(--text-primary)"
                          onClick={() => router.push('/#faq')}
                        >
                          <svg
                            className="w-5 h-5 text-(--text-muted)"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <circle cx="12" cy="12" r="10" />
                            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                          </svg>
                          <span className="font-medium">{t('landing.faq')}</span>
                        </DropdownMenuItem>
                      </motion.div>
                      <motion.div
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 12 }}
                        transition={{ duration: 0.2, delay: 0.35, ease: 'easeOut' }}
                      >
                        <DropdownMenuItem
                          className="text-(--text-primary) cursor-pointer rounded-xl px-3 py-2.5 gap-3 transition-all duration-200 hover:bg-(--background-subtle) focus:bg-(--background-subtle) focus:text-(--text-primary)"
                          onClick={() => router.push('/careers')}
                        >
                          <svg
                            className="w-5 h-5 text-(--text-muted)"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                            <circle cx="9" cy="7" r="4" />
                            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                          </svg>
                          <span className="font-medium">{t('nav.recruitment', 'Careers')}</span>
                        </DropdownMenuItem>
                      </motion.div>
                    </AnimatePresence>
                  )}
                  <AnimatePresence mode="popLayout">
                    <motion.div
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 12 }}
                      transition={{ duration: 0.2, delay: 0.4, ease: 'easeOut' }}
                    >
                      <DropdownMenuItem
                        className="text-red-500 cursor-pointer rounded-xl px-3 py-2.5 gap-3 transition-all duration-200 hover:bg-red-500/10 focus:bg-red-500/10 hover:text-red-600 focus:text-red-600 dark:hover:text-red-400 dark:focus:text-red-400"
                        onClick={handleLogout}
                      >
                        <svg
                          className="w-5 h-5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                          <polyline points="16 17 21 12 16 7" />
                          <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                        <span className="font-medium">{t('landingExtra.logOut')}</span>
                      </DropdownMenuItem>
                    </motion.div>
                  </AnimatePresence>
                </motion.div>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden lg:inline-flex text-sm transition-colors font-medium px-3 lg:px-4 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                style={{ color: 'var(--landing-navbar-text)', backgroundColor: 'transparent' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--landing-navbar-text-hover)';
                  e.currentTarget.style.backgroundColor = 'var(--landing-card-bg)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--landing-navbar-text)';
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                {mounted ? t('landingExtra.signIn') : 'Sign In'}
              </Link>
              <Link
                href="/register"
                className="hidden lg:inline-flex items-center gap-2 text-sm font-semibold px-4 lg:px-5 py-2.5 rounded-xl transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                style={{
                  background: 'linear-gradient(135deg, #2563eb, #93c5fd)',
                  color: 'var(--primary-foreground)',
                }}
              >
                {mounted ? t('landingExtra.getStarted') : 'Get Started'}
                <svg
                  className="w-3.5 h-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </Link>
              <button
                onClick={() => setIsMobileMenuOpen(true)}
                className="lg:hidden w-11 h-11 rounded-xl transition-colors flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                style={{
                  backgroundColor: 'var(--landing-card-bg)',
                  border: '1px solid var(--landing-card-border)',
                }}
                aria-label="Open mobile menu"
              >
                <svg
                  className="w-6 h-6"
                  style={{ color: 'var(--landing-text-primary)' }}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </>
          )}
        </div>
      </nav>

      {isMobileMenuOpen && (
        <MobileMenu
          isOpen={isMobileMenuOpen}
          onClose={() => setIsMobileMenuOpen(false)}
          activeSection={activeSection}
        />
      )}
    </>
  );
}
