'use client';

/**
 * Help modal listing every global keyboard shortcut this app actually
 * supports. Two things matter here that the previous version got wrong:
 *
 * 1. The shortcuts used to be invented — ⌘T, ⌘L, ⌘A — none of which
 *    were wired to anything, and ⌘B / "Toggle Notifications" likewise
 *    had no implementation. This rewrite only lists bindings that are
 *    actually installed via `useGlobalShortcut` in the tree:
 *      - ⌘ / Ctrl + K → Command Palette
 *      - ⌘ / Ctrl + J → AI chat assistant
 *      - /            → Focus the tasks search bar
 *      - ?            → Open this modal
 *      - Esc          → Close any open dialog
 *
 * 2. The OS is detected so the modifier reads as `⌘` on Mac and `Ctrl`
 *    on Windows / Linux, the way a user actually presses the key. The
 *    `useGlobalShortcut` hook accepts either modifier on the same
 *    binding, so the labels are presentation only.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import { X, Keyboard, Search, Sparkles, Command, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutRow {
  description: string;
  /** Ordered list of key tokens, e.g. ['mod', 'K'] or ['Esc']. */
  keys: Array<'mod' | string>;
  /** Optional accent icon to the left of the description. */
  icon: React.ReactNode;
}

interface ShortcutSection {
  category: string;
  items: ShortcutRow[];
}

function detectMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  const platform = navigator.platform || '';
  const ua = navigator.userAgent || '';
  return /Mac|iPhone|iPad|iPod/i.test(platform) || /Mac OS X/i.test(ua);
}

function KeyCap({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-(--border) bg-(--background) px-2 font-mono text-xs font-semibold text-(--text-primary) shadow-sm">
      {children}
    </kbd>
  );
}

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  const { t } = useTranslation();
  // Computed once on mount; the modal is rare enough that we do not need
  // to react to a hot-plugged keyboard.
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- platform detection must run client-side; a lazy initializer would break the SSR hydration match
    setIsMac(detectMac());
  }, []);
  const modLabel = isMac ? '⌘' : 'Ctrl';

  const shortcuts: ShortcutSection[] = useMemo(
    () => [
      {
        category: t('keyboard.navigation'),
        items: [
          {
            description: t('keyboard.commandPalette'),
            keys: [modLabel, 'K'],
            icon: <Command className="h-4 w-4" />,
          },
          {
            description: t('keyboard.searchTasks'),
            keys: ['/'],
            icon: <Search className="h-4 w-4" />,
          },
        ],
      },
      {
        category: t('keyboard.quickActions'),
        items: [
          {
            description: t('keyboard.aiAssistant'),
            keys: [modLabel, 'J'],
            icon: <Sparkles className="h-4 w-4" />,
          },
          {
            description: t('keyboard.showHelp'),
            keys: ['?'],
            icon: <Keyboard className="h-4 w-4" />,
          },
        ],
      },
      {
        category: t('keyboard.interface'),
        items: [
          {
            description: t('keyboard.closeModal'),
            keys: ['Esc'],
            icon: <XCircle className="h-4 w-4" />,
          },
        ],
      },
    ],
    [t, modLabel],
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-200 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal */}
          <div className="fixed inset-0 z-201 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300, duration: 0.3 }}
              className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-(--border) bg-(--background) shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="border-b border-(--border) bg-linear-to-r from-(--brand) via-(--purple) to-(--brand) px-6 py-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-(--brand) shadow-lg">
                      <Keyboard className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-(--foreground)">
                        {t('shortcuts.keyboardShortcuts')}
                      </h2>
                      <p className="text-sm text-(--text-muted) mt-0.5">
                        {t('keyboard.subtitle', 'Work faster with these shortcuts')}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className="rounded-lg p-2 text-(--text-muted) transition-colors hover:bg-(--background-subtle) hover:text-(--foreground)"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="max-h-[60vh] overflow-y-auto px-6 py-6">
                <div className="space-y-6">
                  {shortcuts.map((section, idx) => (
                    <motion.div
                      key={section.category}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                    >
                      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-(--text-primary)">
                        <ZapLabel accent={idx} />
                        {section.category}
                      </h3>
                      <div className="space-y-2">
                        {section.items.map((shortcut, itemIdx) => (
                          <motion.div
                            key={itemIdx}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.1 + itemIdx * 0.05 }}
                            className="flex items-center justify-between rounded-lg border border-(--border) bg-(--background-subtle) p-3 transition-all hover:border-(--primary)/50 hover:bg-(--background-subtle)/80"
                          >
                            <span className="flex items-center gap-2 text-sm text-(--text-primary)">
                              <span className="text-(--primary)">{shortcut.icon}</span>
                              {shortcut.description}
                            </span>
                            <div className="flex gap-1">
                              {shortcut.keys.map((key, keyIdx) => (
                                <KeyCap key={keyIdx}>{key}</KeyCap>
                              ))}
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-(--border) bg-(--background-subtle) px-6 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-(--text-muted)">
                    {t('keyboard.closeHint', 'Press Esc to close')}
                  </p>
                  <Button onClick={onClose} variant="secondary" size="sm">
                    {t('keyboard.gotIt', 'Got it!')}
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * Tiny accent glyph used in place of the previous hard-coded `Zap` icon
 * so the section headings still read like a real sidebar. Kept inline so
 * the test does not have to mock an additional icon module.
 */
function ZapLabel({ accent }: { accent: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-(--primary)/10 text-(--primary)"
      data-accent={accent}
    >
      <span className="block h-1.5 w-1.5 rounded-full bg-current" />
    </span>
  );
}
