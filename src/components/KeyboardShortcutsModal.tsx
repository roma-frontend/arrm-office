'use client';

import { useTranslation } from 'react-i18next';

import { motion, AnimatePresence } from '@/lib/cssMotion';
import { X, Keyboard, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  const { t } = useTranslation();

  const shortcuts = [
    {
      category: t('keyboard.navigation'),
      items: [
        { keys: ['⌘', 'K'], description: t('keyboard.commandPalette') },
        { keys: ['⌘', '/'], description: t('keyboard.toggleSidebar') },
      ],
    },
    {
      category: t('keyboard.quickActions'),
      items: [
        { keys: ['⌘', 'T'], description: t('keyboard.newTask') },
        { keys: ['⌘', 'L'], description: t('keyboard.requestLeave') },
        { keys: ['⌘', 'A'], description: t('keyboard.attendance') },
      ],
    },
    {
      category: t('keyboard.interface'),
      items: [
        { keys: ['⌘', 'B'], description: t('keyboard.toggleNotifications') },
        { keys: ['Esc'], description: t('keyboard.closeModal') },
      ],
    },
  ];
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
                      <h2 className="text-2xl font-bold text-(--foreground)">Keyboard Shortcuts</h2>
                      <p className="text-sm text-(--text-muted) mt-0.5">
                        Work faster with keyboard shortcuts
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
                        <Zap className="h-4 w-4 text-(--primary)" />
                        {section.category}
                      </h3>
                      <div className="space-y-2">
                        {section.items.map((shortcut, itemIdx) => (
                          <motion.div
                            key={itemIdx}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.1 + itemIdx * 0.05 }}
                            className="flex  items-center justify-between rounded-lg border border-(--border) bg-(--background-subtle) p-3 transition-all hover:border-(--primary)/50 hover:bg-(--background-subtle)/80"
                          >
                            <span className="text-sm text-(--text-primary)">
                              {shortcut.description}
                            </span>
                            <div className="flex gap-1">
                              {shortcut.keys.map((key, keyIdx) => (
                                <kbd
                                  key={keyIdx}
                                  className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-(--border) bg-(--background) px-2 font-mono text-xs font-semibold text-(--text-primary) shadow-sm"
                                >
                                  {key}
                                </kbd>
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
                <div className="flex items-center justify-between">
                  <p className="text-xs text-(--text-muted)">t(&quot;keyboard.closeHint&quot;)</p>
                  <Button onClick={onClose} variant="secondary" size="sm">
                    Got it!
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
