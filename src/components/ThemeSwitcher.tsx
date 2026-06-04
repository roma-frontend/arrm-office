'use client';

import { useTheme } from '@/components/ThemeProvider';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from '@/lib/cssMotion';

const themes = [
  { value: 'light', icon: Sun, labelKey: 'settings.lightMode' },
  { value: 'dark', icon: Moon, labelKey: 'settings.darkMode' },
  { value: 'system', icon: Monitor, labelKey: 'settings.systemMode' },
] as const;

export function ThemeSwitcher() {
  const { t } = useTranslation();
  const { theme, setTheme, resolvedTheme } = useTheme();

  const availableThemes = themes.filter((t) => t.value !== theme);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-(--text-muted) hover:text-(--text-primary)"
          title={t('settings.selectTheme', { defaultValue: 'Theme' })}
          aria-label={t('settings.selectTheme', { defaultValue: 'Select theme' })}
        >
          <motion.div
            key={resolvedTheme}
            initial={{ opacity: 0, rotate: -30, scale: 0.8 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 30, scale: 0.8 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            {resolvedTheme === 'dark' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          </motion.div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={5} asChild>
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -8 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="z-[9999] min-w-[10rem] overflow-hidden rounded-xl border border-(--border) bg-(--card) p-1 text-(--text-primary) shadow-2xl"
        >
          <AnimatePresence mode="popLayout">
            {availableThemes.map(({ value, icon: Icon, labelKey }, index) => (
              <motion.div
                key={value}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.2, delay: index * 0.05, ease: 'easeOut' }}
              >
                <DropdownMenuItem
                  onClick={() => setTheme(value)}
                  className="cursor-pointer transition-colors"
                >
                  <motion.span
                    className="mr-2"
                    whileHover={{ scale: 1.2, rotate: 10 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 10 }}
                  >
                    <Icon className="w-4 h-4" />
                  </motion.span>
                  <motion.span
                    key={value + '-name'}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.15, delay: index * 0.05 + 0.1 }}
                  >
                    {t(labelKey, { defaultValue: value.charAt(0).toUpperCase() + value.slice(1) })}
                  </motion.span>
                  {theme === value && (
                    <motion.span
                      className="ml-auto"
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.2, delay: index * 0.05 + 0.15, type: 'spring' }}
                    >
                      ✓
                    </motion.span>
                  )}
                </DropdownMenuItem>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
