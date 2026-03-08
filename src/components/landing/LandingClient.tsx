'use client';

import React, { useRef } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'next-themes';
// framer-motion removed — all animations now use CSS + IntersectionObserver
import {
  Calendar,
  Heart,
  Users,
  Activity,
  Stethoscope,
  BarChart3,
  Shield,
  Zap,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  ChevronDown,
  LogOut,
  User as UserIcon,
  Settings as SettingsIcon,
  Sun,
  Moon,
} from 'lucide-react';

import StatsCard from './StatsCard';
import FeatureCard from './FeatureCard';
import MobileMenu from './MobileMenu';
import CookieBanner from '@/components/CookieBanner';

const FloatingParticles = dynamic(() => import('./FloatingParticles'), { ssr: false, loading: () => null });


// Lazy load sections that appear below the fold
const TestimonialsSection = dynamic(() => import('./TestimonialsSection'), {
  loading: () => <div className="h-96 animate-pulse rounded-3xl" style={{ backgroundColor: 'var(--landing-card-bg)' }} />,
});

const FAQSection = dynamic(() => import('./FAQSection'), {
  loading: () => <div className="h-96 animate-pulse rounded-3xl" style={{ backgroundColor: 'var(--landing-card-bg)' }} />,
});

const NewsletterSection = dynamic(() => import('./NewsletterSection'), {
  loading: () => <div className="h-64 animate-pulse rounded-3xl" style={{ backgroundColor: 'var(--landing-card-bg)' }} />,
});

const PricingPreview = dynamic(() => import('./PricingPreview'), {
  loading: () => <div className="h-96 animate-pulse rounded-3xl" style={{ backgroundColor: 'var(--landing-card-bg)' }} />,
});

const SocialProof = dynamic(() => import('./SocialProof'), {
  loading: () => <div className="h-32 animate-pulse" style={{ backgroundColor: 'var(--landing-card-bg)' }} />,
});
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
import { useRouter } from 'next/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

// ─── Stats Data ───────────────────────────────────────────────────────────────
const getStatsData = (t: any) => [
  {
    value: '500+',
    label: t('landingExtra.statsEmployees'),
    icon: <Users size={22} style={{ color: 'var(--primary)' }} />,
    color: 'rgba(37,99,235,0.2)',
  },
  {
    value: '99%',
    label: t('landingExtra.statsAccuracy'),
    icon: <CheckCircle2 size={22} style={{ color: 'var(--primary)' }} />,
    color: 'rgba(96,165,250,0.2)',
  },
  {
    value: '24',
    label: t('landingExtra.statsRealtime'),
    icon: <Activity size={22} style={{ color: 'var(--primary)' }} />,
    color: 'rgba(96,165,250,0.15)',
  },
  {
    value: '360',
    label: t('landingExtra.statsAnalytics'),
    icon: <BarChart3 size={22} style={{ color: 'var(--primary)' }} />,
    color: 'rgba(56,189,248,0.18)',
  },
];

// ─── Features Data ────────────────────────────────────────────────────────────
// Features will be rendered with translations in the component
const getFeaturesData = (t: any) => [
  {
    icon: <Calendar size={26} />,
    title: t('landing.vacationTracking'),
    description: t('landing.vacationDesc'),
    gradient: 'linear-gradient(135deg, rgba(37,99,235,0.12) 0%, rgba(96,165,250,0.08) 100%)',
    accentColor: '#2563eb',
    badge: t('landing.mostUsed'),
  },
  {
    icon: <Heart size={26} />,
    title: t('landing.sickLeave'),
    description: t('landing.sickLeaveDesc'),
    gradient: 'linear-gradient(135deg, rgba(56,189,248,0.12) 0%, rgba(14,165,233,0.06) 100%)',
    accentColor: '#60a5fa',
    badge: t('landing.policyAware'),
  },
  {
    icon: <Users size={26} />,
    title: t('landing.familyLeave'),
    description: t('landing.familyLeaveDesc'),
    gradient: 'linear-gradient(135deg, rgba(14,165,233,0.12) 0%, rgba(14,165,233,0.06) 100%)',
    accentColor: '#94a3b8',
    badge: t('landing.complianceReady'),
  },
  {
    icon: <Stethoscope size={26} />,
    title: t('landing.doctorVisits'),
    description: t('landing.doctorVisitsDesc'),
    gradient: 'linear-gradient(135deg, rgba(96,165,250,0.12) 0%, rgba(37,99,235,0.06) 100%)',
    accentColor: '#93c5fd',
    badge: t('landing.premium'),
  },
];

// ─── Trusted By Logos (text placeholders) ────────────────────────────────────
const TRUSTED = ['Acme Corp', 'GlobalTech', 'NovaSoft', 'Meridian Co.', 'Apex Industries'];

// ─── Gradient Orbs ────────────────────────────────────────────────────────────
function GradientOrbs() {
  return (
    <>
      {/* Static orbs — no JS animation = zero CPU/GPU overhead, pure CSS */}
      <div
        className="fixed top-[-10%] left-[-5%] w-[700px] h-[700px] rounded-full pointer-events-none orb-pulse-1"
        style={{
          background: 'radial-gradient(circle, var(--landing-orb-1) 0%, transparent 70%)',
          filter: 'blur(80px)',
          zIndex: 0,
          willChange: 'transform',
        }}
      />
      <div
        className="fixed top-[30%] right-[-10%] w-[600px] h-[600px] rounded-full pointer-events-none orb-pulse-2"
        style={{
          background: 'radial-gradient(circle, var(--landing-orb-2) 0%, transparent 70%)',
          filter: 'blur(80px)',
          zIndex: 0,
          willChange: 'transform',
        }}
      />
      <div
        className="fixed bottom-[10%] left-[20%] w-[500px] h-[500px] rounded-full pointer-events-none orb-pulse-3"
        style={{
          background: 'radial-gradient(circle, var(--landing-orb-3) 0%, transparent 70%)',
          filter: 'blur(80px)',
          zIndex: 0,
          willChange: 'transform',
        }}
      />
    </>
  );
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function Navbar() {
  const { t } = useTranslation();
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Track scroll position for navbar background effect
  React.useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLogout = async () => {
    await logoutAction();
    logout();
    router.push('/');
  };

  const getInitials = (name: string) => {
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <>
      {/* nav-animate class uses CSS animation — zero JS cost vs framer-motion */}
      {/* sticky position - works exactly like dashboard navbar */}
      <nav
        className={`nav-animate sticky top-0 z-[100] flex items-center justify-between px-4 md:px-8 lg:px-12 transition-all duration-300 border-b ${scrolled ? 'py-2 md:py-3 shadow-lg' : 'py-3 md:py-4'
          }`}
        role="navigation"
        aria-label="Main navigation"
        style={{
          borderColor: 'var(--landing-card-border)',
        }}
      >
        {/* Glassmorphism nav background - uses CSS variable */}
        <div
          className="absolute inset-0 backdrop-blur-xl border-b transition-all duration-300"
          style={{
            background: scrolled
              ? 'rgba(var(--landing-navbar-bg-rgb, 15, 23, 42), 0.98)'
              : 'rgba(var(--landing-navbar-bg-rgb, 15, 23, 42), 0.7)',
            borderColor: 'var(--landing-card-border)',
            boxShadow: scrolled ? '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)' : 'none'
          }}
        />

        {/* Logo */}
        <Link href="/" className="relative flex items-center gap-3 group">
          {/* CSS animation instead of framer-motion — zero JS cost */}
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center logo-spin"
            style={{ background: 'linear-gradient(135deg, #2563eb, #93c5fd)' }}
            aria-hidden="true"
          >
            <Shield size={18} style={{ color: '#ffffff' }} />
          </div>
          <span
            className="font-bold text-lg tracking-tight transition-colors"
            style={{ color: 'var(--landing-text-primary)' }}
          >
            HR<span style={{ color: 'var(--primary)' }}>Leave</span>
          </span>
        </Link>

        {/* Desktop Nav links - show from lg (1024px) */}
        <div className="relative hidden lg:flex items-center gap-6 xl:gap-8">
          {[
            { name: t('landing.features'), href: '#features' },
            { name: t('landing.pricing'), href: '#pricing' },
            { name: t('landing.testimonials'), href: '#testimonials' },
            { name: t('landing.faq'), href: '#faq' },
          ].map((item) => (
            <a
              key={item.name}
              href={item.href}
              className="text-sm transition-colors duration-200 font-medium focus:outline-none focus:underline underline-offset-4"
              style={{
                color: 'var(--landing-navbar-text)',
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--landing-navbar-text-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--landing-navbar-text)'}
              aria-label={`Navigate to ${item.name}`}
            >
              {item.name}
            </a>
          ))}
        </div>

        {/* Auth buttons / User menu */}
        <div className="relative flex items-center gap-2 md:gap-3">
          {/* Language Switcher */}
          {mounted && <LanguageSwitcher />}

          {/* Theme Toggle Button */}
          {mounted && (
            <button
              onClick={toggleTheme}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:scale-110"
              style={{
                background: 'var(--landing-card-bg)',
                border: '1px solid var(--landing-card-border)',
              }}
              aria-label={theme === 'dark' ? t('landingExtra.switchToLight') : t('landingExtra.switchToDark')}
            >
              {theme === 'dark' ? (
                <Sun size={18} style={{ color: 'var(--landing-text-muted)' }} />
              ) : (
                <Moon size={18} style={{ color: 'var(--landing-text-muted)' }} />
              )}
            </button>
          )}

          {user ? (
            // Logged in - show user menu with DropdownMenu
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-xl px-3 py-2 transition-all outline-none focus-visible:outline-none focus:outline-none hover:bg-[var(--background-subtle)]">
                  <Avatar className="w-8 h-8">
                    {user.avatar && <AvatarImage src={user.avatar} alt={user.name} />}
                    <AvatarFallback className="text-xs bg-gradient-to-br from-blue-500 to-blue-600 text-white font-semibold">
                      {getInitials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden sm:block text-left">
                    <p className="text-xs font-semibold text-[var(--text-primary)] leading-tight">{user.name}</p>
                    <p className="text-[10px] text-[var(--text-muted)] capitalize">{user.role}</p>
                  </div>
                  <ChevronDown className="w-3 h-3 text-[var(--text-muted)] hidden sm:block" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={8}
                className="w-56 bg-[var(--card)] border-[var(--border)] shadow-xl"
              >
                <DropdownMenuLabel className="text-[var(--text-muted)] text-xs">
                  {t('landingExtra.myAccount')}
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-[var(--border)]" />
                
                <DropdownMenuItem
                  className="text-[var(--text-primary)] cursor-pointer hover:bg-[var(--background-subtle)] focus:bg-[var(--background-subtle)] gap-2"
                  onClick={() => router.push('/dashboard')}
                >
                  <UserIcon className="w-4 h-4 text-[var(--primary)]" />
                  {t('nav.dashboard')}
                </DropdownMenuItem>

                <DropdownMenuItem
                  className="text-[var(--text-primary)] cursor-pointer hover:bg-[var(--background-subtle)] focus:bg-[var(--background-subtle)] gap-2"
                  onClick={() => router.push('/settings')}
                >
                  <SettingsIcon className="w-4 h-4 text-[var(--primary)]" />
                  {t('nav.settings')}
                </DropdownMenuItem>

                <DropdownMenuSeparator className="bg-[var(--border)]" />
                
                <DropdownMenuItem
                  className="text-red-400 cursor-pointer hover:bg-red-500/10 focus:bg-red-500/10 hover:text-red-300 gap-2"
                  onClick={handleLogout}
                >
                  <LogOut className="w-4 h-4" />
                  {t('landingExtra.logOut')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            // Not logged in - show auth buttons
            <>
              <Link
                href="/login"
                className="hidden lg:inline-flex text-sm transition-colors font-medium px-3 lg:px-4 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                style={{
                  color: 'var(--landing-navbar-text)',
                  backgroundColor: 'transparent'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--landing-navbar-text-hover)';
                  e.currentTarget.style.backgroundColor = 'var(--landing-card-bg)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--landing-navbar-text)';
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                {t('landingExtra.signIn')}
              </Link>
              <Link
                href="/register"
                className="hidden lg:inline-flex items-center gap-2 text-sm font-semibold px-4 lg:px-5 py-2.5 rounded-xl transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                style={{ background: 'linear-gradient(135deg, #2563eb, #93c5fd)', color: '#ffffff' }}
              >
                {t('landingExtra.getStarted')}
                <ArrowRight size={14} />
              </Link>

              {/* Mobile/Tablet menu button - show up to lg (1024px) */}
              <button
                onClick={() => setIsMobileMenuOpen(true)}
                className="lg:hidden w-10 h-10 rounded-xl transition-colors flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                style={{
                  backgroundColor: 'var(--landing-card-bg)',
                  border: '1px solid var(--landing-card-border)'
                }}
                aria-label="Open mobile menu"
                aria-expanded={isMobileMenuOpen}
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

      {/* Mobile Menu Component */}
      <MobileMenu isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
    </>
  );
}


// ─── Hero Section ─────────────────────────────────────────────────────────────
// Replaced framer-motion scroll parallax + per-element JS animations with
// pure CSS keyframe animations — same visual result, zero runtime JS cost.
function HeroSection() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuthStore();

  return (
    <div
      className="relative flex flex-col items-center text-center pb-20 px-6 min-h-screen justify-center"
      role="banner"
      aria-label="Hero section"
    >
      {/* Skip to content link for accessibility */}
      <a
        href="#features"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:rounded-lg"
        style={{
          backgroundColor: 'var(--primary)',
          color: '#ffffff'
        }}
      >
        {t('ui.skipToContent')}
      </a>

      {/* Badge — CSS shimmer, no JS */}
      <div
        className="hero-fade-1 relative inline-flex items-center gap-3 px-6 py-3 rounded-full backdrop-blur-sm mb-8 overflow-hidden"
        style={{
          border: '1px solid var(--landing-card-border)',
          background: 'var(--landing-card-bg)',
        }}
        role="status"
        aria-label="Premium HR platform"
      >
        <div className="badge-shimmer absolute inset-0" aria-hidden="true" />
        <div className="w-2 h-2 rounded-full pulse-dot" style={{ backgroundColor: 'var(--primary)' }} aria-hidden="true" />
        <span className="relative text-xs font-bold tracking-[0.2em] uppercase" style={{ color: 'var(--landing-text-muted)' }}>
          {t('landing.exclusiveHR')}
        </span>
        <Sparkles size={16} className="spin-slow" style={{ color: 'var(--primary)' }} aria-hidden="true" />
      </div>

      {/* Title — CSS fade-up stagger */}
      <h1 className="flex flex-wrap justify-center gap-x-5 gap-y-2 mb-6 relative">
        <span className="hero-word-1 relative text-5xl sm:text-6xl md:text-8xl font-black tracking-tight leading-none" style={{ color: 'var(--landing-text-primary)' }}>
          {t('landing.heroTitle')}
        </span>
        <div
          className="hero-line absolute -bottom-4 left-1/2 -translate-x-1/2 h-[2px] w-32"
          style={{
            background: 'linear-gradient(to right, transparent, var(--primary), transparent)'
          }}
        />
      </h1>


      {/* Subtitle */}
      <div className="hero-fade-3 max-w-3xl mx-auto mb-12">
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="w-16 h-[1px]" style={{ background: 'linear-gradient(to right, transparent, var(--primary))' }} />
          <div className="w-2 h-2 rounded-full pulse-dot" style={{ backgroundColor: 'var(--primary)' }} />
          <div className="w-16 h-[1px]" style={{ background: 'linear-gradient(to left, transparent, var(--primary))' }} />
        </div>
        <p className="text-lg md:text-xl leading-relaxed font-light text-center" style={{ color: 'var(--landing-text-secondary)' }}>
          {t('landing.heroSubtitle')}
        </p>
        <div className="flex items-center justify-center gap-2 mt-6">
          {[0, 1, 2, 1, 0].map((size, idx) => (
            <div
              key={idx}
              className="rounded-full pulse-dot"
              style={{
                backgroundColor: 'var(--primary)',
                width: size === 0 ? 4 : size === 1 ? 6 : 8,
                height: size === 0 ? 4 : size === 1 ? 6 : 8,
                animationDelay: `${idx * 0.15}s`,
                opacity: 0.6 + size * 0.15,
              }}
            />
          ))}
        </div>
      </div>

      {/* CTA Buttons — CSS hover only, no framer-motion */}
      <div className="hero-fade-2 flex flex-col sm:flex-row items-center gap-4 mb-16">
        {user ? (
          <>
            <button
              onClick={() => router.push('/dashboard')}
              className="cta-btn-primary inline-flex items-center gap-3 px-8 py-4 rounded-2xl font-bold text-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              style={{ background: 'linear-gradient(135deg, #2563eb, #93c5fd)', color: '#ffffff' }}
              aria-label="Go to Dashboard"
            >
              <Activity size={20} aria-hidden="true" />
              {t('landing.goToDashboard')}
              <ArrowRight size={18} aria-hidden="true" />
            </button>
            <button
              onClick={() => router.push('/dashboard')}
              className="cta-btn-secondary inline-flex items-center gap-3 px-8 py-4 rounded-2xl font-semibold text-lg backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              style={{
                color: 'var(--landing-text-secondary)',
                border: '1px solid var(--landing-card-border)',
                background: 'var(--landing-card-bg)',
              }}
              aria-label="View analytics"
            >
              <BarChart3 size={20} aria-hidden="true" />
              {t('landing.viewAnalytics')}
            </button>
          </>
        ) : (
          <>
            <Link href="/register">
              <button
                className="cta-btn-primary inline-flex items-center gap-3 px-8 py-4 rounded-2xl font-bold text-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                style={{ background: 'linear-gradient(135deg, #2563eb, #93c5fd)', color: '#ffffff' }}
                aria-label="Get started for free"
              >
                <Zap size={20} aria-hidden="true" />
                {t('landing.getStartedFree')}
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </Link>
            <Link href="/login">
              <button
                className="cta-btn-secondary inline-flex items-center gap-3 px-8 py-4 rounded-2xl font-semibold text-lg backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                style={{
                  color: 'var(--landing-text-secondary)',
                  border: '1px solid var(--landing-card-border)',
                  background: 'var(--landing-card-bg)',
                }}
                aria-label="Sign in to your account"
              >
                {t('landing.signIn')}
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </Link>
          </>
        )}
      </div>

      {/* Trusted companies */}
      <div className="hero-fade-4 flex flex-col items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-[1px]" style={{ background: 'linear-gradient(to right, transparent, var(--primary))', opacity: 0.7 }} />
          <p className="text-xs uppercase tracking-[0.3em] font-semibold" style={{ color: 'var(--landing-text-muted)' }}>
            {t('landing.trustedByElite')}
          </p>
          <div className="w-8 h-[1px]" style={{ background: 'linear-gradient(to left, transparent, var(--primary))', opacity: 0.7 }} />
        </div>
        <div className="flex flex-wrap justify-center gap-10">
          {TRUSTED.map((name) => (
            <span
              key={name}
              className="relative text-sm font-bold transition-colors cursor-default group"
              style={{
                color: 'var(--landing-text-secondary)',
                opacity: 0.9,
              }}
            >
              {name}
              <span className="absolute -bottom-1 left-0 right-0 h-[1px] opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'linear-gradient(to right, transparent, var(--primary), transparent)' }} />
            </span>
          ))}
        </div>
      </div>

      {/* Cookie Banner - integrated in hero section */}
      <CookieBanner />

      {/* Scroll indicator */}
      <div
        className="absolute bottom-10 left-1/2 -translate-x-1/2 flex-col items-center gap-2 hidden md:flex"
        aria-hidden="true"
      >
        <span className="text-xs uppercase tracking-widest" style={{ color: 'var(--primary)', opacity: 0.6 }}>{t('landing.scroll')}</span>
        <div className="scroll-line w-px h-12" style={{ background: 'linear-gradient(to bottom, var(--primary), transparent)', opacity: 0.7 }} />
      </div>
    </div>
  );
}

// ─── Stats Section ────────────────────────────────────────────────────────────
function StatsSection() {
  const { t } = useTranslation();
  const STATS = getStatsData(t);
  const ref = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section className="relative px-6 md:px-12 py-20" id="stats" aria-label="Platform statistics">
      <div
        ref={ref}
        className="text-center mb-12"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(30px)',
          transition: 'opacity 0.7s cubic-bezier(0.22,1,0.36,1), transform 0.7s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        <span className="section-eyebrow">{t('landing.byTheNumbers')}</span>
        <h2 className="mt-3 text-3xl md:text-4xl font-bold" style={{ color: 'var(--landing-text-primary)' }}>
          {t('landing.trustedAt')} <span className="heading-gradient">{t('landing.scale')}</span>
        </h2>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
        {STATS.map((stat, i) => (
          <StatsCard key={stat.label} {...stat} delay={i * 0.1} />
        ))}
      </div>
    </section>
  );
}

// ─── Features Section ─────────────────────────────────────────────────────────
function FeaturesSection() {
  const { t } = useTranslation();
  const FEATURES = getFeaturesData(t);
  const ref = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.08 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section id="features" className="relative px-6 md:px-12 py-20" aria-label="Platform features">
      {/* Section header */}
      <div
        ref={ref}
        className="text-center mb-16"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(30px)',
          transition: 'opacity 0.75s cubic-bezier(0.22,1,0.36,1), transform 0.75s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        <span className="section-eyebrow">{t('landing.leaveTypes')}</span>
        <h2 className="mt-3 text-3xl md:text-5xl font-black leading-tight" style={{ color: 'var(--landing-text-primary)' }}>
          {t('landingExtra.everyLeaveType')}{' '}
          <span className="heading-gradient">{t('landing.perfectlyManaged')}</span>
        </h2>
        <p className="mt-4 max-w-xl mx-auto text-lg" style={{ color: 'var(--landing-text-secondary)' }}>
          {t('landingExtra.featuresSubtitle')}
        </p>
      </div>

      {/* Feature grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 max-w-7xl mx-auto">
        {FEATURES.map((feature, i) => (
          <FeatureCard key={feature.title} {...feature} delay={i * 0.12} />
        ))}
      </div>
    </section>
  );
}

// ─── CTA Banner ───────────────────────────────────────────────────────────────
function CTABanner() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuthStore();

  return (
    <section className="relative py-28" aria-label="Call to action">
      {/* Static CSS glows — no JS animation needed */}
      <div className="absolute -top-24 right-0 w-[600px] h-[600px] rounded-full pointer-events-none orb-pulse-1"
        style={{ background: 'radial-gradient(circle, rgba(14,165,233,0.3) 0%, transparent 70%)', filter: 'blur(60px)' }} />
      <div className="absolute bottom-0 -left-20 w-[500px] h-[500px] rounded-full pointer-events-none orb-pulse-2"
        style={{ background: 'radial-gradient(circle, rgba(37,99,235,0.2) 0%, transparent 70%)', filter: 'blur(60px)' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full pointer-events-none orb-pulse-3"
        style={{ background: 'radial-gradient(circle, rgba(56,189,248,0.08) 0%, transparent 70%)', filter: 'blur(50px)' }} />

      <div className="section-fade relative max-w-5xl mx-auto px-6 md:px-12">
        <div className="relative px-10 py-20 text-center flex flex-col items-center">
          {/* Icon — CSS float animation */}
          <div className="animate-float inline-flex mb-8">
            <Sparkles size={48} style={{ color: 'var(--primary)' }} />
          </div>

          <h2 className="text-4xl md:text-6xl font-black mb-4 leading-tight" style={{ color: 'var(--landing-text-primary)' }}>
            {t('landingExtra.ctaTitle')}{' '}
            <span style={{ color: 'var(--primary)' }}>
              {t('landingExtra.ctaTitleHighlight')}
            </span>
          </h2>

          <p className="text-lg mb-12 max-w-xl mx-auto leading-relaxed" style={{ color: 'var(--landing-text-secondary)', opacity: 0.85 }}>
            {t('landingExtra.ctaSubtitle')}
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            {user ? (
              <>
                <button
                  onClick={() => router.push('/dashboard')}
                  className="cta-btn-primary inline-flex items-center gap-3 px-10 py-4 rounded-2xl font-bold text-lg shadow-lg"
                  style={{ background: 'linear-gradient(135deg, #2563eb, #93c5fd)', color: '#ffffff' }}
                >
                  <Calendar size={20} />
                  {t('nav.leaves')}
                </button>
                <button
                  onClick={() => router.push('/employees')}
                  className="cta-btn-secondary inline-flex items-center gap-3 px-10 py-4 rounded-2xl font-bold text-lg backdrop-blur-sm"
                  style={{
                    color: 'var(--landing-text-secondary)',
                    border: '1px solid var(--landing-card-border)',
                    background: 'var(--landing-card-bg)',
                  }}
                >
                  <Users size={20} />
                  {t('nav.employees')}
                </button>
              </>
            ) : (
              <>
                <Link href="/register">
                  <button
                    className="cta-btn-primary inline-flex items-center gap-3 px-10 py-4 rounded-2xl font-bold text-lg shadow-lg"
                    style={{ background: 'linear-gradient(135deg, #2563eb, #93c5fd)', color: '#ffffff' }}
                  >
                    <Zap size={20} />
                    {t('landing.getStartedFree')}
                  </button>
                </Link>
                <Link href="/login">
                  <button
                    className="cta-btn-secondary inline-flex items-center gap-3 px-10 py-4 rounded-2xl font-bold text-lg backdrop-blur-sm"
                    style={{
                      color: 'var(--landing-text-secondary)',
                      border: '1px solid var(--landing-card-border)',
                      background: 'var(--landing-card-bg)',
                    }}
                  >
                    {t('landing.signIn')}
                  </button>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  const { t } = useTranslation();
  const footerLinks = {
    product: [
      { nameKey: 'landing.features', href: '#features' },
      { nameKey: 'landing.pricing', href: '#pricing' },
      { nameKey: 'landing.testimonials', href: '#testimonials' },
      { nameKey: 'landing.faq', href: '#faq' },
    ],
    platform: [
      { nameKey: 'nav.dashboard', href: '/login' },
      { nameKey: 'nav.attendance', href: '/login' },
      { nameKey: 'nav.tasks', href: '/login' },
      { nameKey: 'nav.employees', href: '/login' },
      { nameKey: 'nav.analytics', href: '/login' },
      { nameKey: 'nav.calendar', href: '/login' },
    ],
    account: [
      { nameKey: 'auth.signIn', href: '/login' },
      { nameKey: 'auth.register', href: '/register' },
      { nameKey: 'nav.settings', href: '/login' },
      { nameKey: 'nav.help', href: '#faq' },
    ],
    legal: [
      { nameKey: 'landingExtra.footerPrivacy', href: '/privacy' },
      { nameKey: 'landingExtra.footerTerms', href: '/terms' },
      { nameKey: 'landingExtra.footerCookies', href: '/privacy#cookies' },
      { nameKey: 'landingExtra.footerGdpr', href: '/privacy#gdpr' },
    ],
  };

  return (
    <footer className="relative border-t" style={{ borderColor: 'var(--landing-card-border)' }} role="contentinfo">
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-16">
        {/* Main footer content */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
          {/* Brand column */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-3 mb-4 group">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #2563eb, #93c5fd)' }}
              >
                <Shield size={18} style={{ color: '#ffffff' }} />
              </div>
              <span className="font-bold text-lg transition-colors" style={{ color: 'var(--landing-text-primary)' }}
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--primary)'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--landing-text-primary)'}
              >
                HR<span style={{ color: 'var(--primary)' }}>Leave</span>
              </span>
            </Link>
            <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--landing-text-secondary)', opacity: 0.9 }}>
              {t('landingExtra.footerBrand')}
            </p>
            {/* Social links */}
            <div className="flex gap-3">
              {[
                { name: 'Twitter', icon: 'M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z', href: 'https://twitter.com' },
                { name: 'LinkedIn', icon: 'M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z', href: 'https://linkedin.com' },
                { name: 'GitHub', icon: 'M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22', href: 'https://github.com' },
              ].map((social) => (
                <a
                  key={social.name}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors group"
                  style={{ backgroundColor: 'var(--landing-card-bg)' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--card-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--landing-card-bg)'}
                  aria-label={social.name}
                >
                  <svg
                    className="w-4 h-4 transition-colors"
                    style={{ color: 'var(--landing-text-secondary)' }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={social.icon} />
                  </svg>
                </a>
              ))}
            </div>
          </div>

          {/* Links columns */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h3 className="font-semibold text-sm uppercase tracking-wider mb-4" style={{ color: 'var(--landing-text-primary)' }}>
                {category === 'product' ? t('landingExtra.footerProduct') : category === 'platform' ? t('landingExtra.footerPlatform') : category === 'account' ? t('landingExtra.footerAccount') : t('landingExtra.footerLegal')}
              </h3>
              <ul className="space-y-3">
                {links.map((link: any) => (
                  <li key={link.nameKey}>
                    {link.href.startsWith('#') ? (
                      <a
                        href={link.href}
                        className="text-sm transition-colors focus:outline-none focus:underline underline-offset-4"
                        style={{ color: 'var(--landing-text-secondary)' }}
                        onMouseEnter={(e) => e.currentTarget.style.color = 'var(--primary)'}
                        onMouseLeave={(e) => e.currentTarget.style.color = 'var(--landing-text-secondary)'}
                      >
                        {t(link.nameKey)}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-sm transition-colors focus:outline-none focus:underline underline-offset-4"
                        style={{ color: 'var(--landing-text-secondary)' }}
                        onMouseEnter={(e) => e.currentTarget.style.color = 'var(--primary)'}
                        onMouseLeave={(e) => e.currentTarget.style.color = 'var(--landing-text-secondary)'}
                      >
                        {t(link.nameKey)}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t flex flex-col md:flex-row items-center justify-between gap-4" style={{ borderColor: 'var(--landing-card-border)' }}>
          <p className="text-sm" style={{ color: 'var(--landing-text-secondary)', opacity: 0.85 }}>
            {t('landingExtra.footerCopyright', { year: new Date().getFullYear() })}
          </p>
          <div className="flex items-center gap-6 text-xs" style={{ color: 'var(--landing-text-secondary)', opacity: 0.85 }}>
            <span>{t('landingExtra.footerSsl')}</span>
            <span>{t('landingExtra.footerGdprCompliant')}</span>
            <span>{t('landingExtra.footerSoc2')}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────
export default function LandingClient() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--landing-bg)' }}>
      {/* Background layers - lowest z-index, fixed to viewport */}
      <div className="fixed inset-0 -z-10 pointer-events-none">
        <GradientOrbs />
        <FloatingParticles />
      </div>

      {/* Navigation - sticky at top */}
      <Navbar />

      {/* Page content - no padding needed with sticky */}
      <main className="relative">
        <HeroSection />
        <div className="section-lazy">
          <SocialProof />
        </div>
        <div className="section-lazy">
          <StatsSection />
        </div>
        <div className="section-lazy">
          <FeaturesSection />
        </div>
        <div className="section-lazy">
          <PricingPreview />
        </div>
        <section id="testimonials" className="section-lazy">
          <TestimonialsSection />
        </section>
        <div className="section-lazy">
          <FAQSection />
        </div>
        <div className="section-lazy">
          <NewsletterSection />
        </div>
        <div className="section-lazy">
          <CTABanner />
        </div>
      </main>

      <Footer />
    </div>
  );
}
