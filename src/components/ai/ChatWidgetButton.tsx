'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import { X, Sparkles, Mic } from 'lucide-react';
import { useUpgradeModal } from '@/components/subscription/PlanGate';
import { usePlanFeatures } from '@/hooks/usePlanFeatures';

/** Pulsing hint that appears every 15s when widget is docked */
function DockedPulse({ dockedSide, dockedY }: { dockedSide: 'left' | 'right'; dockedY: number }) {
  const { t } = useTranslation('chat');
  const [show, setShow] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setShow(true);
      setTimeout(() => setShow(false), 3000);
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  if (!show) return null;

  const isRight = dockedSide === 'right';
  return (
    <div
      className="fixed z-50 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium shadow-lg animate-pulse"
      style={{
        top: `${dockedY}%`,
        // Brand gradient, not the flat accent: `--primary` used to hold the
        // gradient itself and now holds a colour.
        background: 'var(--primary-gradient, var(--primary))',
        color: 'white',
        ...(isRight
          ? { right: 36 }
          : { left: (typeof window !== 'undefined' && window.innerWidth >= 1024 ? 240 : 0) + 36 }),
      }}
    >
      <Sparkles className="w-3 h-3" />
      {t('chatWidget.imHere', { defaultValue: "I'm here to help!" })}
    </div>
  );
}

interface ChatWidgetButtonProps {
  isOpen: boolean;
  setIsOpen: (v: boolean | ((o: boolean) => boolean)) => void;
  wakeWordActive: boolean;
  docked: boolean;
  setDocked: (v: boolean) => void;
  dockedSide: 'right' | 'left';
  setDockedSide: (v: 'right' | 'left') => void;
  dockedY: number;
  setDockedY: (v: number) => void;
}

export function ChatWidgetButton({
  isOpen,
  setIsOpen,
  wakeWordActive,
  docked,
  setDocked,
  dockedSide,
  setDockedSide,
  dockedY,
  setDockedY,
}: ChatWidgetButtonProps) {
  const { t } = useTranslation();
  const pathname = usePathname();

  // Plan gating
  const { canAccess } = usePlanFeatures();
  const hasAiChat = canAccess('aiChat');
  const { openModal, modal: upgradeModal } = useUpgradeModal();

  // Drag state
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const hasDragged = useRef(false);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [returning, setReturning] = useState(false);
  const [undocking, setUndocking] = useState(false);

  // AI button hint system
  const [hintIndex, setHintIndex] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [lastActivityTime, setLastActivityTime] = useState(() => Date.now());
  const [hintsShownCount, setHintsShownCount] = useState(0);
  const MAX_HINTS_PER_SESSION = 3;
  const HINT_INTERVAL_MS = 20000;
  const INACTIVITY_THRESHOLD_MS = 15000;

  const getHintText = useCallback(
    (index: number): string => {
      const hints = [
        t('dashboard.hints.help', { defaultValue: "Need help? I'm here! 💡" }),
        t('dashboard.hints.leaveRequest', { defaultValue: 'Try /leave to request time off' }),
        t('dashboard.hints.reports', { defaultValue: 'Ask me about team reports' }),
      ];
      return hints[index % hints.length] ?? '';
    },
    [t],
  );

  const trackActivity = useCallback(() => {
    setLastActivityTime(Date.now());
    setShowHint(false);
  }, []);

  useEffect(() => {
    if (isOpen || hintsShownCount >= MAX_HINTS_PER_SESSION) return;

    const checkInactivity = () => {
      const now = Date.now();
      const inactive = now - lastActivityTime > INACTIVITY_THRESHOLD_MS;

      if (inactive && !showHint) {
        setShowHint(true);
        setHintsShownCount((prev) => prev + 1);

        const hintTimer = setTimeout(() => {
          setShowHint(false);
          setHintIndex((prev) => (prev + 1) % 3);
        }, 5000);
        return () => clearTimeout(hintTimer);
      }
    };

    const interval = setInterval(checkInactivity, HINT_INTERVAL_MS);
    return () => {
      clearInterval(interval);
    };
  }, [isOpen, lastActivityTime, showHint, hintsShownCount]);

  useEffect(() => {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    const handler = trackActivity;

    events.forEach((event) => {
      window.addEventListener(event, handler, { passive: true });
    });

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handler);
      });
    };
  }, [trackActivity]);

  // Touch drag handlers
  const handleBtnTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0]!;
    dragging.current = true;
    hasDragged.current = false;
    dragStart.current = { x: t.clientX, y: t.clientY };
  }, []);

  const handleBtnTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragging.current) return;
    const t = e.touches[0]!;
    if (
      Math.abs(t.clientX - dragStart.current.x) > 10 ||
      Math.abs(t.clientY - dragStart.current.y) > 10
    ) {
      hasDragged.current = true;
      setDragPos({ x: t.clientX, y: t.clientY });
    }
  }, []);

  const handleBtnTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      const t = e.changedTouches[0]!;
      if (!hasDragged.current) {
        setDragPos(null);
        return;
      }
      e.preventDefault();
      const sidebarEdge = window.innerWidth >= 1024 ? 240 : 0;
      if (t.clientX > window.innerWidth * 0.75) {
        setDragPos(null);
        setDocked(true);
        setDockedSide('right');
        setDockedY(Math.min(80, Math.max(20, (t.clientY / window.innerHeight) * 100)));
      } else if (t.clientX < sidebarEdge + 60) {
        setDragPos(null);
        setDocked(true);
        setDockedSide('left');
        setDockedY(Math.min(80, Math.max(20, (t.clientY / window.innerHeight) * 100)));
      } else {
        // Animate back: keep dragPos, enable transition, then clear
        setReturning(true);
        setTimeout(() => {
          setDragPos(null);
          setReturning(false);
        }, 400);
      }
    },
    [setDocked, setDockedSide, setDockedY],
  );

  // Mouse drag
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      dragging.current = true;
      hasDragged.current = false;
      dragStart.current = { x: e.clientX, y: e.clientY };
      const onMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        if (
          Math.abs(ev.clientX - dragStart.current.x) > 10 ||
          Math.abs(ev.clientY - dragStart.current.y) > 10
        ) {
          hasDragged.current = true;
          setDragPos({ x: ev.clientX, y: ev.clientY });
        }
      };
      const onUp = (ev: MouseEvent) => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        dragging.current = false;
        if (!hasDragged.current) {
          setDragPos(null);
          return;
        }
        const sidebarEdge = window.innerWidth >= 1024 ? 240 : 0;
        if (ev.clientX > window.innerWidth * 0.75) {
          setDragPos(null);
          setDocked(true);
          setDockedSide('right');
          setDockedY(Math.min(80, Math.max(20, (ev.clientY / window.innerHeight) * 100)));
        } else if (ev.clientX < sidebarEdge + 60) {
          setDragPos(null);
          setDocked(true);
          setDockedSide('left');
          setDockedY(Math.min(80, Math.max(20, (ev.clientY / window.innerHeight) * 100)));
        } else {
          setReturning(true);
          setTimeout(() => {
            setDragPos(null);
            setReturning(false);
          }, 400);
        }
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [setDocked, setDockedSide, setDockedY],
  );

  if (pathname === '/ai-chat') return <>{upgradeModal}</>;

  return (
    <>
      {/* Wake word toast */}
      <AnimatePresence>
        {wakeWordActive && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="hidden sm:block fixed above-mobile-dock right-6 z-50 px-4 py-2 rounded-xl bg-(--brand) text-white text-sm font-medium shadow-lg flex items-center gap-2"
          >
            <Mic className="w-4 h-4 animate-pulse" />
            Hey HR! I&apos;m listening…
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upgrade modal */}
      {upgradeModal}

      {/* Docked indicator */}
      {docked && !isOpen && <DockedPulse dockedSide={dockedSide} dockedY={dockedY} />}
      {docked && !isOpen && (
        <button
          onClick={() => {
            if (!hasDragged.current) setIsOpen(true);
          }}
          onTouchStart={(e) => {
            const t = e.touches[0]!;
            dragging.current = true;
            hasDragged.current = false;
            dragStart.current = { x: t.clientX, y: t.clientY };
          }}
          onTouchMove={(e) => {
            if (!dragging.current) return;
            const t = e.touches[0]!;
            if (
              Math.abs(t.clientX - dragStart.current.x) > 5 ||
              Math.abs(t.clientY - dragStart.current.y) > 5
            ) {
              hasDragged.current = true;
              setDragPos({ x: t.clientX, y: t.clientY });
            }
          }}
          onTouchEnd={(e) => {
            if (!dragging.current) return;
            dragging.current = false;
            const t = e.changedTouches[0]!;
            if (!hasDragged.current) {
              setDragPos(null);
              return;
            }
            e.preventDefault();
            const sidebarEdge = window.innerWidth >= 1024 ? 240 : 0;
            if (t.clientX > window.innerWidth * 0.75) {
              setDragPos(null);
              setDockedSide('right');
              setDockedY(Math.min(80, Math.max(20, (t.clientY / window.innerHeight) * 100)));
            } else if (t.clientX < sidebarEdge + 60) {
              setDragPos(null);
              setDockedSide('left');
              setDockedY(Math.min(80, Math.max(20, (t.clientY / window.innerHeight) * 100)));
            } else {
              setUndocking(true);
              setTimeout(() => {
                setDragPos(null);
                setDocked(false);
                setUndocking(false);
              }, 400);
            }
          }}
          onMouseDown={(e) => {
            dragging.current = true;
            hasDragged.current = false;
            dragStart.current = { x: e.clientX, y: e.clientY };
            const onMove = (ev: MouseEvent) => {
              if (!dragging.current) return;
              if (
                Math.abs(ev.clientX - dragStart.current.x) > 5 ||
                Math.abs(ev.clientY - dragStart.current.y) > 5
              ) {
                hasDragged.current = true;
                setDragPos({ x: ev.clientX, y: ev.clientY });
              }
            };
            const onUp = (ev: MouseEvent) => {
              document.removeEventListener('mousemove', onMove);
              document.removeEventListener('mouseup', onUp);
              dragging.current = false;
              if (!hasDragged.current) {
                setDragPos(null);
                return;
              }
              const sidebarEdge = window.innerWidth >= 1024 ? 240 : 0;
              if (ev.clientX > window.innerWidth * 0.75) {
                setDragPos(null);
                setDockedSide('right');
                setDockedY(Math.min(80, Math.max(20, (ev.clientY / window.innerHeight) * 100)));
              } else if (ev.clientX < sidebarEdge + 60) {
                setDragPos(null);
                setDockedSide('left');
                setDockedY(Math.min(80, Math.max(20, (ev.clientY / window.innerHeight) * 100)));
              } else {
                setUndocking(true);
                setTimeout(() => {
                  setDragPos(null);
                  setDocked(false);
                  setUndocking(false);
                }, 400);
              }
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
          }}
          className="fixed z-50 flex items-center justify-center w-8 h-12 shadow-lg btn-gradient text-white cursor-grab active:cursor-grabbing transition-all duration-300 hover:w-10 hover:h-14 hover:shadow-[0_0_20px_rgba(44,140,213,0.5)]"
          style={{
            ...(undocking
              ? {
                  bottom: typeof window !== 'undefined' && window.innerWidth >= 1024 ? 24 : 96,
                  right: 24,
                  top: 'auto',
                  left: 'auto',
                  borderRadius: '9999px',
                  width: typeof window !== 'undefined' && window.innerWidth >= 640 ? 56 : 40,
                  height: typeof window !== 'undefined' && window.innerWidth >= 640 ? 56 : 40,
                  transition: 'all 0.4s cubic-bezier(0.34,1.56,0.64,1)',
                }
              : dragPos
                ? {
                    left: dragPos.x - 16,
                    top: dragPos.y - 24,
                    right: 'auto',
                    borderRadius: '0.5rem',
                    transition: 'none',
                  }
                : {
                    top: `${dockedY}%`,
                    ...(dockedSide === 'right'
                      ? {
                          right: 0,
                          borderTopLeftRadius: '0.5rem',
                          borderBottomLeftRadius: '0.5rem',
                          borderTopRightRadius: 0,
                          borderBottomRightRadius: 0,
                        }
                      : {
                          left:
                            typeof window !== 'undefined' && window.innerWidth >= 1024 ? 240 : 0,
                          borderTopRightRadius: '0.5rem',
                          borderBottomRightRadius: '0.5rem',
                          borderTopLeftRadius: 0,
                          borderBottomLeftRadius: 0,
                        }),
                  }),
          }}
          aria-label="Show AI assistant"
        >
          <Sparkles className="w-4 h-4" />
        </button>
      )}

      {/* Pulsing animation background */}
      {!docked && (
        <motion.div
          className="hidden sm:block fixed above-mobile-dock right-6 z-50 w-10 sm:w-14 h-10 sm:h-14 rounded-full bg-primary/20"
          animate={{
            scale: [1, 1.2, 1] as unknown as number,
            opacity: [0.7, 0, 0.7] as unknown as number,
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      )}

      {/* Rotating hints tooltip */}
      <AnimatePresence>
        {showHint && !docked && hintIndex < MAX_HINTS_PER_SESSION && (
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className="hidden sm:block fixed above-mobile-dock right-6 z-50 max-w-[200px] px-3 py-2 rounded-lg text-xs font-medium shadow-lg"
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          >
            {getHintText(hintIndex)}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main button */}
      {!docked && (
        <motion.button
          aria-label={t('chatWidget.openAssistant', { defaultValue: 'Open AI assistant' })}
          onClick={() => {
            if (hasDragged.current) return;
            if (!hasAiChat) {
              openModal({
                featureTitle: 'AI HR Assistant',
                featureDescription:
                  'AI-powered leave assistant, smart suggestions, and voice commands are available on the Professional plan.',
                recommendedPlan: 'professional',
              });
              return;
            }
            setIsOpen((o: boolean) => !o);
            setLastActivityTime(Date.now());
          }}
          className="hidden hidden sm:block fixed above-mobile-dock right-6 z-50 w-10 sm:w-14 h-10 sm:h-14 rounded-full sm:flex items-center gap-2 justify-center btn-gradient text-white font-medium shadow-md hover:shadow-[0_0_24px_rgba(44,140,213,0.6)] transition-shadow duration-300"
          style={
            dragPos && !returning
              ? {
                  position: 'fixed' as const,
                  left: dragPos.x - 28,
                  top: dragPos.y - 28,
                  right: 'auto',
                  bottom: 'auto',
                  transition: 'none',
                }
              : returning
                ? { transition: 'all 0.4s cubic-bezier(0.34,1.56,0.64,1)' }
                : undefined
          }
          whileHover={{ scale: 1.12 }}
          whileTap={{ scale: 0.95 }}
          onTouchStart={handleBtnTouchStart}
          onTouchMove={handleBtnTouchMove}
          onTouchEnd={handleBtnTouchEnd}
          onMouseDown={handleMouseDown}
        >
          <AnimatePresence mode="wait">
            {isOpen ? (
              <motion.div
                key="x"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <X className="w-6 h-6" />
              </motion.div>
            ) : (
              <motion.div
                key="chat"
                initial={{ rotate: 90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: -90, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <Sparkles className="w-4 sm:w-6 h-4 sm:h-6" />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>
      )}
    </>
  );
}
