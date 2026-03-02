'use client';

import { useEffect, useRef } from 'react';
import { useTranslation } from "react-i18next";
import { X, Home, Sparkles, BarChart3, DollarSign, MessageCircle, LogIn, Rocket } from 'lucide-react';
import Link from 'next/link';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

const menuItemsConfig = [
  { key: 'home', href: '#home', icon: Home },
  { key: 'features', href: '#features', icon: Sparkles },
  { key: 'analytics', href: '#stats', icon: BarChart3 },
  { key: 'pricing', href: '#pricing', icon: DollarSign },
  { key: 'testimonials', href: '#testimonials', icon: MessageCircle },
];

export default function MobileMenu({ isOpen, onClose }: MobileMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);

  // Lock body scroll when menu open - with proper positioning
  useEffect(() => {
    if (isOpen) {
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
      
      return () => {
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        document.body.style.overflow = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { 
      if (e.key === 'Escape' && isOpen) onClose(); 
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, isOpen]);

  // Smooth scroll to section and close menu
  const handleNavigate = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    onClose();
    
    setTimeout(() => {
      const element = document.querySelector(href);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 300);
  };

  return (
    <>
      {/* Backdrop with blur */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-md z-[105] lg:hidden"
        style={{
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modern Slide-in Panel */}
      <div
        ref={menuRef}
        className="fixed top-0 right-0 bottom-0 w-[85%] max-w-[320px] z-[110] lg:hidden shadow-2xl flex flex-col"
        style={{
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
          backgroundColor: 'var(--background)',
          borderLeft: '1px solid var(--landing-card-border)',
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Mobile navigation menu"
      >
        {/* Gradient Header */}
        <div 
          className="relative flex items-center justify-between p-5 border-b overflow-hidden"
          style={{ 
            borderColor: 'var(--landing-card-border)',
            background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.05), rgba(59, 130, 246, 0.05))'
          }}
        >
          {/* Decorative gradient orb */}
          <div 
            className="absolute -top-20 -right-20 w-40 h-40 rounded-full opacity-20"
            style={{ background: 'radial-gradient(circle, #3b82f6, transparent)' }}
          />
          
          <div className="relative z-10">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-lg">
                <span className="text-white font-bold text-sm">HR</span>
              </div>
              <div>
                <h2 className="font-bold text-base" style={{ color: 'var(--landing-text-primary)' }}>
                  HRLeave
                </h2>
                <p className="text-[10px]" style={{ color: 'var(--landing-text-muted)' }}>
                  {t('sidebar.subtitle')}
                </p>
              </div>
            </div>
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            className="relative z-10 w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 hover:scale-110 hover:rotate-90 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            style={{ 
              backgroundColor: 'var(--landing-card-bg)',
              color: 'var(--landing-text-primary)'
            }}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Links */}
        <nav 
          className="flex-1 overflow-y-auto px-4 py-6 custom-scrollbar" 
          aria-label="Mobile navigation"
        >
          <div className="space-y-2">
            {menuItemsConfig.map((item, index) => {
              const Icon = item.icon;
              return (
                <a
                  key={item.key}
                  href={item.href}
                  onClick={(e) => handleNavigate(e, item.href)}
                  className="group flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all duration-300 relative overflow-hidden"
                  style={{
                    opacity: isOpen ? 1 : 0,
                    transform: isOpen ? 'translateX(0)' : 'translateX(30px)',
                    transition: `all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${0.1 + index * 0.06}s`,
                    color: 'var(--landing-text-secondary)',
                  }}
                >
                  {/* Hover background effect */}
                  <div 
                    className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style={{ 
                      background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.1), rgba(59, 130, 246, 0.05))'
                    }}
                  />

                  {/* Icon Container */}
                  <div 
                    className="relative w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:rotate-6 shadow-sm"
                    style={{ 
                      background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.1), rgba(59, 130, 246, 0.1))',
                      border: '1px solid var(--landing-card-border)'
                    }}
                  >
                    <Icon size={20} style={{ color: 'var(--primary)' }} />
                  </div>

                  {/* Label */}
                  <span 
                    className="relative flex-1 font-semibold text-sm group-hover:translate-x-1 transition-all duration-300"
                    style={{ color: 'var(--landing-text-primary)' }}
                  >
                    {t(`mobileMenu.${item.key}`)}
                  </span>

                  {/* Arrow indicator */}
                  <div 
                    className="relative opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:translate-x-1"
                    style={{ color: 'var(--primary)' }}
                  >
                    →
                  </div>
                </a>
              );
            })}
          </div>
        </nav>

        {/* Footer with CTAs */}
        <div 
          className="flex-shrink-0 p-4 space-y-3 border-t backdrop-blur-xl"
          style={{
            borderColor: 'var(--landing-card-border)',
            backgroundColor: 'var(--background)',
            boxShadow: '0 -4px 20px rgba(0,0,0,0.05)'
          }}
        >
          {/* Language Switcher */}
          <div className="flex justify-center pb-2">
            <LanguageSwitcher />
          </div>

          {/* Sign In Button */}
          <Link href="/login" onClick={onClose}>
            <button 
              className="w-full px-5 py-3 rounded-xl font-semibold transition-all duration-200 hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 group border"
              style={{
                color: 'var(--landing-text-primary)',
                borderColor: 'var(--landing-card-border)',
                backgroundColor: 'var(--landing-card-bg)',
              }}
            >
              <LogIn size={18} className="group-hover:translate-x-1 transition-transform" />
              <span>{t('landing.signIn')}</span>
            </button>
          </Link>

          {/* Get Started Button */}
          <Link href="/register" onClick={onClose}>
            <button 
              className="w-full px-5 py-3.5 rounded-xl font-bold transition-all duration-200 hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 group relative overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
                color: '#ffffff',
                boxShadow: '0 4px 16px rgba(37,99,235,0.4)',
              }}
            >
              {/* Shine effect */}
              <div 
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
                  transform: 'translateX(-100%)',
                }}
              />
              <Rocket size={18} className="group-hover:translate-y-[-2px] transition-transform" />
              <span>{t('landing.getStartedFree')}</span>
            </button>
          </Link>
        </div>

        {/* Custom Scrollbar */}
        <style jsx>{`
          .custom-scrollbar::-webkit-scrollbar {
            width: 5px;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
            background: transparent;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: var(--border);
            border-radius: 10px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: var(--text-disabled);
          }
        `}</style>
      </div>
    </>
  );
}
