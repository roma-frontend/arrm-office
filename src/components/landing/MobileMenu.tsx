'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  X,
  Home,
  Sparkles,
  BarChart3,
  DollarSign,
  MessageCircle,
  LogIn,
  Rocket,
  Shield,
  Globe,
  Sun,
  Moon,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { useTheme } from '@/components/ThemeProvider';
import { LanguageSwitcher } from '../LanguageSwitcher';

type MenuItem = {
  key: string;
  href: string;
  icon: LucideIcon;
  gradient: string;
  iconColor: string;
  accent: string;
  sectionId?: string; // для подсветки по IntersectionObserver (например "pricing")
};

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;

  /**
   * activeSection приходит из useActiveSection(['home','pricing','testimonials',...])
   * Передай сюда активный id секции для “умной” подсветки.
   */
  activeSection?: string | null;
}

/**
 * ✅ ВАЖНО:
 * - Все якоря делаем ТОЛЬКО как /#id
 * - sectionId совпадает с id секции на лендинге
 * - Единая профессиональная синяя тема
 */
const menuItemsConfig: MenuItem[] = [
  {
    key: 'home',
    href: '/',
    sectionId: 'home',
    icon: Home,
    gradient: 'from-blue-500/15 to-blue-600/8',
    iconColor: 'text-blue-500 dark:text-blue-400',
    accent: '#2563eb',
  },
  {
    key: 'features',
    href: '/features',
    icon: Sparkles,
    gradient: 'from-blue-500/15 to-blue-600/8',
    iconColor: 'text-blue-500 dark:text-blue-400',
    accent: '#2563eb',
  },
  {
    key: 'analytics',
    href: '/analytics',
    icon: BarChart3,
    gradient: 'from-blue-500/15 to-blue-600/8',
    iconColor: 'text-blue-500 dark:text-blue-400',
    accent: '#2563eb',
  },
  {
    key: 'pricing',
    href: '/#pricing',
    sectionId: 'pricing',
    icon: DollarSign,
    gradient: 'from-blue-500/15 to-blue-600/8',
    iconColor: 'text-blue-500 dark:text-blue-400',
    accent: '#2563eb',
  },
  {
    key: 'testimonials',
    href: '/#testimonials',
    sectionId: 'testimonials',
    icon: MessageCircle,
    gradient: 'from-blue-500/15 to-blue-600/8',
    iconColor: 'text-blue-500 dark:text-blue-400',
    accent: '#2563eb',
  },
  {
    key: 'recruitment',
    href: '/careers',
    icon: Rocket,
    gradient: 'from-blue-500/15 to-blue-600/8',
    iconColor: 'text-blue-500 dark:text-blue-400',
    accent: '#2563eb',
  },
];

function splitHref(href: string): { path: string; hash: string | null } {
  // href вида "/#pricing" или "/features"
  const idx = href.indexOf('#');
  if (idx === -1) return { path: href, hash: null };
  return {
    path: href.slice(0, idx) || '/',
    hash: href.slice(idx + 1) || null,
  };
}

// iOS-friendly smooth scroll (без scrollIntoView smooth)
function smoothScrollToY(targetY: number, duration = 650) {
  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduceMotion) {
    window.scrollTo(0, targetY);
    return;
  }

  const startY = window.scrollY || window.pageYOffset;
  const diff = targetY - startY;
  const start = performance.now();

  const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  const step = (now: number) => {
    const elapsed = now - start;
    const p = Math.min(1, elapsed / duration);
    const eased = easeInOutCubic(p);
    window.scrollTo(0, startY + diff * eased);
    if (p < 1) requestAnimationFrame(step);
  };

  requestAnimationFrame(step);
}

function scrollToHash(hash: string, offset = 84) {
  // offset — высота fixed header (подстрой)
  const el = document.getElementById(hash);
  if (!el) return;

  const rect = el.getBoundingClientRect();
  const y = (window.scrollY || window.pageYOffset) + rect.top - offset;
  smoothScrollToY(Math.max(0, y));
}

/**
 * Liquid hover background (Stripe/Linear vibe)
 * - работает и на desktop hover, и на mobile (tap = активный state)
 */
function _LiquidHoverBg({ accent, active }: { accent: string; active: boolean }) {
  const x = useMotionValue(60);
  const y = useMotionValue(20);

  const sx = useSpring(x, { stiffness: 260, damping: 28, mass: 0.7 });
  const sy = useSpring(y, { stiffness: 260, damping: 28, mass: 0.7 });

  return (
    <motion.div
      aria-hidden="true"
      className="absolute inset-0 rounded-2xl overflow-hidden"
      initial={false}
      animate={{ opacity: active ? 1 : 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* “liquid blob” */}
      <motion.div
        className="absolute -inset-12 blur-2xl"
        style={{
          x: sx,
          y: sy,
          background: `radial-gradient(220px 140px at 30% 30%, ${accent}55, transparent 60%)`,
        }}
      />

      {/* subtle sheen */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.10), transparent)',
          opacity: 0.35,
          transform: 'translateX(-25%)',
          mixBlendMode: 'overlay',
        }}
      />
    </motion.div>
  );
}

export default function MobileMenu({ isOpen, onClose, activeSection = null }: MobileMenuProps) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const menuRef = useRef<HTMLDivElement | null>(null);

  const [mounted, setMounted] = useState(false);
  const [visibleItems, setVisibleItems] = useState(false);
  const [hash, setHash] = useState<string>('');
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  // Smooth open/close animation
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      // Double rAF ensures the closed state is painted first
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsPanelOpen(true);
        });
      });
      const timer = setTimeout(() => setVisibleItems(true), 130);
      return () => clearTimeout(timer);
    } else {
      setVisibleItems(false);
      // Small delay ensures the browser paints the open state before animating out
      const startTimer = setTimeout(() => {
        setIsPanelOpen(false);
      }, 16);
      const unmountTimer = setTimeout(() => setShouldRender(false), 480);
      return () => {
        clearTimeout(startTimer);
        clearTimeout(unmountTimer);
      };
    }
  }, [isOpen]);

  useEffect(() => setMounted(true), []);

  // hash state (нужен для active подсветки, потому что usePathname hash не дает)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const update = () => setHash(window.location.hash.replace('#', ''));
    update();

    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);

  // Lock body scroll when panel is open
  useEffect(() => {
    if (!isPanelOpen) {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.top = '';
      return;
    }

    const scrollY = window.scrollY;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.top = `-${scrollY}px`;

    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.top = '';
    };
  }, [isPanelOpen]);

  // Reset body styles on resize to desktop to prevent scroll lock
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
        document.body.style.top = '';
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const handleNavigate = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    onClose();

    const { path, hash } = splitHref(href);

    // 1) Если ссылка содержит hash (/#pricing)
    if (hash) {
      // если мы НЕ на странице path — просто router.push (скролл сделает useSmoothHashScroll на landing)
      if (pathname !== path) {
        router.push(href);
        return;
      }

      // мы уже на landing → обновим URL без дерганья и сделаем iOS-friendly smooth scroll
      router.replace(href, { scroll: false });

      // небольшой defer, чтобы URL применился и меню успело закрыться
      requestAnimationFrame(() => scrollToHash(hash, 84));
      return;
    }

    // 2) Обычный роут
    router.push(href);
  };

  // Активность пункта:
  // - для /#sections: лучше подсвечивать activeSection (IntersectionObserver), а если его нет — fallback на hash
  const computedItems = useMemo(() => {
    return menuItemsConfig.map((item) => {
      const { path, hash: itemHash } = splitHref(item.href);
      const isHashItem = Boolean(itemHash);

      const isActive =
        // обычные страницы
        (!isHashItem && pathname === item.href) ||
        // если мы на landing и есть IntersectionObserver activeSection
        (isHashItem &&
          pathname === (path || '/') &&
          ((activeSection && item.sectionId && activeSection === item.sectionId) ||
            (!activeSection && itemHash === hash)));

      return { ...item, isActive };
    });
  }, [pathname, hash, activeSection]);

  const menuContent = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[105] lg:hidden"
        style={{
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(4px)',
          opacity: isPanelOpen ? 1 : 0,
          pointerEvents: isPanelOpen ? 'auto' : 'none',
          transition: 'opacity 0.28s ease',
        }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={menuRef}
        className="fixed top-0 right-0 z-[110] lg:hidden flex flex-col"
        style={{
          width: 'min(88vw, 360px)',
          height: '100vh',
          maxHeight: '100vh',
          transform: isPanelOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.42s cubic-bezier(0.16, 1, 0.3, 1)',
          backgroundColor: 'var(--background)',
          borderLeft: '1px solid var(--landing-card-border)',
          boxShadow: isPanelOpen ? '-10px 0 40px rgba(0,0,0,0.12)' : 'none',
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Mobile navigation"
      >
        {/* Header */}
        <div
          className="relative flex items-center justify-between px-6 py-5 border-b"
          style={{
            borderColor: 'var(--landing-card-border)',
            background:
              'linear-gradient(135deg, rgba(37, 99, 235, 0.06), rgba(59, 130, 246, 0.02))',
          }}
        >
          {/* Decorative */}
          <div
            className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-20 blur-3xl"
            style={{ background: 'radial-gradient(circle, #3b82f6, transparent)' }}
          />

          <Link
            href="/"
            className="relative z-10 flex items-center gap-3 hover:opacity-80 transition-opacity"
            onClick={onClose}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg"
              style={{
                background: 'linear-gradient(135deg, #2563eb, #60a5fa)',
              }}
            >
              <Shield className="w-5 h-5 text-white" />
            </div>

            <div>
              <h2
                className="font-bold text-lg leading-tight"
                style={{ color: 'var(--landing-text-primary)' }}
              >
                HR<span style={{ color: 'var(--primary)' }}>Office</span>
              </h2>
              <p className="text-[11px] font-medium" style={{ color: 'var(--landing-text-muted)' }}>
                {t('sidebar.subtitle', 'Smart HR Platform')}
              </p>
            </div>
          </Link>

          <button
            onClick={onClose}
            className="relative z-10 w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 focus:outline-none"
            style={{
              backgroundColor: 'var(--landing-card-bg)',
              border: '1px solid var(--landing-card-border)',
              color: 'var(--landing-text-primary)',
            }}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto px-5 py-4" style={{ minHeight: 0 }}>
          <p
            className="text-[10px] font-semibold uppercase tracking-widest mb-3 px-2"
            style={{ color: 'var(--landing-text-muted)' }}
          >
            {t('mobileMenu.navigation', 'Navigation')}
          </p>

          <div className="space-y-1">
            {computedItems.map((item, index) => {
              const Icon = item.icon;

              return (
                <a
                  key={item.key}
                  href={item.href}
                  onClick={(e) => handleNavigate(e, item.href)}
                  className="group relative flex items-center gap-3.5 px-3 py-3 rounded-2xl transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  style={{
                    opacity: visibleItems ? 1 : 0,
                    transform: visibleItems ? 'translateX(0)' : 'translateX(20px)',
                    transitionDelay: `${index * 45}ms`,
                    transitionProperty: 'opacity, transform, background-color',
                    transitionDuration: '340ms',
                    transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                  onMouseMove={(ev) => {
                    // Liquid hover follow pointer (desktop)
                    // NOTE: Touch devices ignore mousemove mostly.
                    const target = ev.currentTarget;
                    const rect = target.getBoundingClientRect();
                    const localX = ev.clientX - rect.left;
                    const localY = ev.clientY - rect.top;
                    // прокидываем через dataset (чтобы LiquidHoverBg мог читать — но мы делаем проще: через CSS layer)
                    // Здесь используем motion values через кастомный компонент ниже:
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (target as any).__lhx = localX;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (target as any).__lhy = localY;
                  }}
                >
                  {/* Liquid hover / active */}
                  <LiquidHoverLayer accent={item.accent} active={item.isActive} />

                  {/* Active indicator */}
                  {item.isActive && (
                    <div
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-full"
                      style={{
                        height: '60%',
                        background: item.accent,
                        boxShadow: `0 0 12px ${item.accent}40`,
                      }}
                    />
                  )}

                  {/* Hover background */}
                  <div
                    className={`absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r ${item.gradient}`}
                  />

                  {/* Icon */}
                  <div
                    className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 bg-gradient-to-br ${item.gradient}`}
                  >
                    <Icon size={18} className={item.iconColor} />
                  </div>

                  {/* Label */}
                  <span
                    className="relative flex-1 font-semibold text-sm"
                    style={{ color: 'var(--landing-text-primary)' }}
                  >
                    {t(`mobileMenu.${item.key}`)}
                  </span>

                  {/* Arrow */}
                  <ArrowRight
                    size={16}
                    className="relative opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-300"
                    style={{ color: item.accent }}
                  />
                </a>
              );
            })}
          </div>

          {/* Preferences Section */}
          <div
            className="pt-5 pb-3 border-t mt-5"
            style={{ borderColor: 'var(--landing-card-border)' }}
          >
            <p
              className="text-[10px] font-semibold uppercase tracking-widest mb-3 px-2"
              style={{ color: 'var(--landing-text-muted)' }}
            >
              {t('mobileMenu.preferences', 'Preferences')}
            </p>

            <div className="space-y-2">
              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className="group w-full flex items-center gap-3.5 px-3 py-3 rounded-2xl transition-all duration-200 hover:scale-[1.02] active:scale-95"
                style={{
                  backgroundColor: 'var(--landing-card-bg)',
                  border: '1px solid var(--landing-card-border)',
                }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110"
                  style={{
                    background:
                      theme === 'dark'
                        ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(245, 158, 11, 0.05))'
                        : 'linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(59, 130, 246, 0.05))',
                  }}
                >
                  {theme === 'dark' ? (
                    <Sun size={18} className="text-amber-400" />
                  ) : (
                    <Moon size={18} className="text-blue-500" />
                  )}
                </div>

                <span
                  className="flex-1 font-semibold text-sm text-left"
                  style={{ color: 'var(--landing-text-primary)' }}
                >
                  {theme === 'dark'
                    ? t('landingExtra.switchToLight', 'Light Mode')
                    : t('landingExtra.switchToDark', 'Dark Mode')}
                </span>

                <div
                  className="w-11 h-6 rounded-full relative transition-colors duration-300"
                  style={{
                    background: theme === 'dark' ? '#3b82f6' : 'var(--border)',
                  }}
                >
                  <div
                    className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-300"
                    style={{
                      transform: theme === 'dark' ? 'translateX(20px)' : 'translateX(2px)',
                    }}
                  />
                </div>
              </button>

              {/* Language Switcher */}
              <div
                className="flex items-center gap-3.5 px-3 py-3 rounded-2xl"
                style={{
                  backgroundColor: 'var(--landing-card-bg)',
                  border: '1px solid var(--landing-card-border)',
                }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(16, 185, 129, 0.05))',
                  }}
                >
                  <Globe size={18} className="text-emerald-500" />
                </div>
                <span
                  className="flex-1 font-semibold text-sm"
                  style={{ color: 'var(--landing-text-primary)' }}
                >
                  {t('mobileMenu.language', 'Language')}
                </span>
                <div className="scale-90 origin-right">
                  <LanguageSwitcher />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer CTAs */}
        <div
          className="px-5 pb-6 pt-4 space-y-3 border-t"
          style={{
            borderColor: 'var(--landing-card-border)',
            background: 'linear-gradient(to top, var(--background) 60%, transparent)',
            flexShrink: 0,
          }}
        >
          {/* Sign In */}
          <Link href="/login" onClick={onClose} className="block">
            <button
              className="w-full px-5 py-3.5 rounded-2xl font-semibold transition-all duration-200 hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2.5 group"
              style={{
                color: 'var(--landing-text-primary)',
                backgroundColor: 'var(--landing-card-bg)',
                border: '1px solid var(--landing-card-border)',
              }}
            >
              <LogIn size={18} className="group-hover:translate-x-0.5 transition-transform" />
              <span>{t('landing.signIn', 'Sign In')}</span>
            </button>
          </Link>

          {/* Get Started */}
          <Link href="/register" onClick={onClose} className="block">
            <button
              className="w-full px-5 py-3.5 rounded-2xl font-bold transition-all duration-200 hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2.5 group relative overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
                color: '#ffffff',
                boxShadow: '0 4px 20px rgba(37, 99, 235, 0.3)',
              }}
            >
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{
                  background:
                    'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)',
                }}
              />
              <Rocket size={18} className="group-hover:-translate-y-0.5 transition-transform" />
              <span>{t('landing.getStartedFree', 'Get Started Free')}</span>
            </button>
          </Link>

          <p
            className="text-center text-[10px] font-medium pt-1"
            style={{ color: 'var(--landing-text-muted)' }}
          >
            Strata v2.0 • {t('mobileMenu.secure', 'Secure & Private')}
          </p>
        </div>
      </div>
    </>
  );

  if (!mounted || typeof document === 'undefined' || !shouldRender) return null;

  return createPortal(menuContent, document.body);
}

/**
 * Отдельный слой для Liquid hover.
 * Сделан отдельным компонентом, чтобы:
 * - не пересоздавать motion values на каждый ререндер списка
 * - дать “Linear/Stripe vibe” с blob + sheen
 */
function LiquidHoverLayer({ accent, active }: { accent: string; active: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);

  // motion values (позиция blob)
  const x = useMotionValue(40);
  const y = useMotionValue(20);

  const sx = useSpring(x, { stiffness: 280, damping: 30, mass: 0.7 });
  const sy = useSpring(y, { stiffness: 280, damping: 30, mass: 0.7 });

  useEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;

    const onMove = (ev: MouseEvent) => {
      const rect = parent.getBoundingClientRect();
      x.set(ev.clientX - rect.left - 60);
      y.set(ev.clientY - rect.top - 40);
    };

    parent.addEventListener('mousemove', onMove);
    return () => parent.removeEventListener('mousemove', onMove);
  }, [x, y]);

  return (
    <div ref={ref} className="absolute inset-0 pointer-events-none">
      {/* показываем всегда чуть-чуть на hover через group-hover, а при active — полностью */}
      <motion.div
        className="absolute inset-0 rounded-2xl overflow-hidden"
        initial={false}
        animate={{ opacity: active ? 1 : 0 }}
        transition={{ duration: 0.22 }}
      >
        <motion.div
          className="absolute -inset-16 blur-2xl"
          style={{
            x: sx,
            y: sy,
            background: `radial-gradient(240px 150px at 35% 35%, ${accent}55, transparent 60%)`,
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)',
            opacity: 0.25,
            mixBlendMode: 'overlay',
          }}
        />
      </motion.div>

      {/* hover-only лёгкая подсветка */}
      <div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background: `radial-gradient(200px 120px at 15% 10%, ${accent}25, transparent 65%)`,
        }}
      />
    </div>
  );
}
