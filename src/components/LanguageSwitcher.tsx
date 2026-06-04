'use client';

import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import { logger } from '@/lib/logger';

const languages = {
  en: { name: 'English', flag: '🇬🇧' },
  hy: { name: 'Հայերեն', flag: '🇦🇲' },
  ru: { name: 'Русский', flag: '🇷🇺' },
  de: { name: 'Deutsch', flag: '🇩🇪' },
};

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const currentLang = i18n.language || 'en';

  const changeLanguage = async (lng: string) => {
    const scrollY = window.scrollY;

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('i18nextLng', lng);
      } catch {}
    }

    await i18n.changeLanguage(lng);

    requestAnimationFrame(() => {
      window.scrollTo({ top: scrollY, behavior: 'instant' as ScrollBehavior });
    });
  };

  const availableLanguages = Object.entries(languages).filter(([code]) => code !== currentLang);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2"
          style={{ color: 'var(--text-primary)' }}
          title={t('settings.selectLanguage', { defaultValue: 'Language' })}
          aria-label={t('settings.selectLanguage', { defaultValue: 'Select language' })}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-primary)';
          }}
        >
          <Globe className="h-4 w-4" />
          <motion.span
            className="hidden sm:inline"
            key={currentLang}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {languages[currentLang as keyof typeof languages]?.flag}{' '}
            {languages[currentLang as keyof typeof languages]?.name || 'English'}
          </motion.span>
          <motion.span
            className="sm:hidden"
            key={currentLang + '-mobile'}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {languages[currentLang as keyof typeof languages]?.flag || '🇬🇧'}
          </motion.span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={5} asChild>
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -8 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="z-[9999] min-w-[8rem] overflow-hidden rounded-xl border border-(--border) bg-(--card) p-1 text-(--text-primary) shadow-2xl"
        >
          <AnimatePresence mode="popLayout">
            {availableLanguages.map(([code, { name, flag }], index) => (
              <motion.div
                key={code}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.2, delay: index * 0.05, ease: 'easeOut' }}
              >
                <DropdownMenuItem
                  onClick={() => changeLanguage(code)}
                  className="cursor-pointer transition-colors"
                >
                  <motion.span
                    className="mr-2"
                    whileHover={{ scale: 1.2, rotate: 5 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 10 }}
                  >
                    {flag}
                  </motion.span>
                  <motion.span
                    key={code + '-name'}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.15, delay: index * 0.05 + 0.1 }}
                  >
                    {name}
                  </motion.span>
                </DropdownMenuItem>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
