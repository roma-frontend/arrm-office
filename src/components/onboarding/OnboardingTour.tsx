"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowRight, ArrowLeft, CheckCircle } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

export interface TourStep {
  target: string; // CSS selector or ID
  title: string;
  description: string;
  placement?: "top" | "bottom" | "left" | "right" | "center";
  highlight?: boolean; // Whether to highlight the target element
}

interface OnboardingTourProps {
  steps: TourStep[];
  tourId: string; // Unique ID for this tour (e.g., "login-tour")
  onComplete?: () => void;
  onSkip?: () => void;
}

export function OnboardingTour({ steps, tourId, onComplete, onSkip }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  // Initialize tooltip in center to avoid visible jump from top-left
  const [tooltipPosition, setTooltipPosition] = useState(() => ({
    x: typeof window !== 'undefined' ? window.innerWidth / 2 - 140 : 0,
    y: typeof window !== 'undefined' ? window.innerHeight / 2 - 80 : 0,
  }));

  // Get session token if user is logged in
  const [sessionToken, setSessionToken] = useState<string | undefined>();
  
  useEffect(() => {
    if (typeof window !== "undefined") {
      const authStorage = localStorage.getItem("hr-auth-storage");
      if (authStorage) {
        try {
          const parsed = JSON.parse(authStorage);
          setSessionToken(parsed.state?.sessionToken);
        } catch (e) {
          console.error("Failed to parse auth storage", e);
        }
      }
    }
  }, []);

  // Check if user has seen this tour
  const hasSeenTour = useQuery(api.userPreferences.hasSeenTour, { 
    tourId,
    sessionToken 
  });
  const markTourAsSeenMutation = useMutation(api.userPreferences.markTourAsSeen);
  const [localStorageChecked, setLocalStorageChecked] = useState(false);
  const [hasSeenTourLocal, setHasSeenTourLocal] = useState<boolean | null>(null);

  // Check localStorage for non-authenticated users
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(`tour_seen_${tourId}`);
      setHasSeenTourLocal(stored === "true");
      setLocalStorageChecked(true);
    }
  }, [tourId]);

  // Determine if tour should be shown
  const shouldShowTour = hasSeenTour === false || (hasSeenTour === null && localStorageChecked && hasSeenTourLocal === false);

  // Helper function to calculate and set tooltip position
  const positionTooltip = useCallback((rect: DOMRect, placement: string) => {
    let x = 0;
    let y = 0;

    const tooltipWidth = 280;
    const tooltipHeight = 160;
    const spacing = 20;
    const viewportPadding = 20;

    // Determine best placement based on available space
    let finalPlacement = placement;
    
    const topSpace = rect.top - tooltipHeight - spacing;
    const bottomSpace = window.innerHeight - rect.bottom - spacing;
    const leftSpace = rect.left - tooltipWidth - spacing;
    const rightSpace = window.innerWidth - rect.right - spacing;
    
    // If "top" placement would go off-screen, try alternatives
    if (placement === "top" && topSpace < viewportPadding) {
      if (bottomSpace > tooltipHeight + viewportPadding) {
        finalPlacement = "bottom";
      } else if (rightSpace > tooltipWidth + viewportPadding) {
        finalPlacement = "right";
      } else if (leftSpace > tooltipWidth + viewportPadding) {
        finalPlacement = "left";
      }
    }
    
    // If "bottom" placement would go off-screen and there's space above, use "top"
    if (placement === "bottom" && bottomSpace < viewportPadding) {
      if (topSpace > tooltipHeight + viewportPadding) {
        finalPlacement = "top";
      } else if (rightSpace > tooltipWidth + viewportPadding) {
        finalPlacement = "right";
      } else if (leftSpace > tooltipWidth + viewportPadding) {
        finalPlacement = "left";
      }
    }

    switch (finalPlacement) {
      case "top":
        x = rect.left + rect.width / 2 - tooltipWidth / 2;
        y = rect.top - tooltipHeight - spacing;
        break;
      case "bottom":
        x = rect.left + rect.width / 2 - tooltipWidth / 2;
        y = rect.bottom + spacing;
        break;
      case "left":
        x = rect.left - tooltipWidth - spacing;
        y = rect.top + rect.height / 2 - tooltipHeight / 2;
        break;
      case "right":
        x = rect.right + spacing;
        y = rect.top + rect.height / 2 - tooltipHeight / 2;
        break;
      case "center":
        x = window.innerWidth / 2 - tooltipWidth / 2;
        y = window.innerHeight / 2 - tooltipHeight / 2;
        break;
    }

    // Keep tooltip on screen
    x = Math.max(viewportPadding, Math.min(x, window.innerWidth - tooltipWidth - viewportPadding));
    y = Math.max(viewportPadding, Math.min(y, window.innerHeight - tooltipHeight - viewportPadding));

    setTooltipPosition({ x, y });
  }, []);

  // Update target element position (simple and stable)
  const updateTargetPosition = useCallback(() => {
    const step = steps[currentStep];
    if (!step?.target) return;

    const element = document.querySelector(step.target);
    if (element) {
      const rect = element.getBoundingClientRect();
      
      // Define safe viewport margins (leave space for tooltip above/below)
      const tooltipSpace = 200; // Space needed for tooltip
      const safeTop = tooltipSpace;
      const safeBottom = window.innerHeight - tooltipSpace;
      
      // Check if element is off-screen or too close to edges
      const isOffScreen = rect.top < safeTop || rect.bottom > safeBottom || 
                          rect.left < 20 || rect.right > window.innerWidth - 20;
      
      if (isOffScreen) {
        // Scroll element into view with smooth behavior
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'center'
        });
        
        // Update position using requestAnimationFrame for smooth updates
        let frameId: number;
        const updateCallback = () => {
          const updatedRect = element.getBoundingClientRect();
          setTargetRect(updatedRect);
          positionTooltip(updatedRect, step.placement || "bottom");
        };
        
        // Start updating after a minimal delay (let scroll start)
        setTimeout(() => {
          frameId = requestAnimationFrame(updateCallback);
        }, 50);
        
        return () => cancelAnimationFrame(frameId);
      } else {
        setTargetRect(rect);
        positionTooltip(rect, step.placement || "bottom");
      }
    }
  }, [currentStep, steps, positionTooltip]);

  // Initialize tour
  useEffect(() => {
    if (shouldShowTour) {
      // Minimal delay to ensure DOM is ready
      setTimeout(() => {
        setIsVisible(true);
        updateTargetPosition();
      }, 100);
    }
  }, [shouldShowTour, updateTargetPosition]);

  // Update position on step change or resize
  useEffect(() => {
    if (!isVisible) return;

    updateTargetPosition();

    // Throttle resize event to avoid excessive recalculations
    let resizeTimeout: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(updateTargetPosition, 100);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      clearTimeout(resizeTimeout);
      window.removeEventListener("resize", handleResize);
    };
  }, [isVisible, currentStep, updateTargetPosition]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = async () => {
    setIsVisible(false);
    
    // Try to save to database if user is logged in
    if (sessionToken) {
      try {
        await markTourAsSeenMutation({ tourId, sessionToken });
      } catch (err) {
        console.log("Failed to save to database, using localStorage", err);
      }
    }
    
    // Always save to localStorage as backup
    if (typeof window !== "undefined") {
      localStorage.setItem(`tour_seen_${tourId}`, "true");
    }
    
    onComplete?.();
  };

  const handleSkip = async () => {
    setIsVisible(false);
    
    // Try to save to database if user is logged in
    if (sessionToken) {
      try {
        await markTourAsSeenMutation({ tourId, sessionToken });
      } catch (err) {
        console.log("Failed to save to database, using localStorage", err);
      }
    }
    
    // Always save to localStorage as backup
    if (typeof window !== "undefined") {
      localStorage.setItem(`tour_seen_${tourId}`, "true");
    }
    
    onSkip?.();
  };

  // Different animation directions for variety
  const getAnimationDirection = (stepIndex: number, phase: 'initial' | 'exit') => {
    const animations = [
      // Step 0: From top
      { initial: { opacity: 0, y: -50, x: 0, scale: 0.8 }, exit: { opacity: 0, y: 50, scale: 0.8 } },
      // Step 1: From bottom-right
      { initial: { opacity: 0, y: 40, x: 40, scale: 0.9, rotate: 5 }, exit: { opacity: 0, y: -40, x: -40, scale: 0.9 } },
      // Step 2: From left
      { initial: { opacity: 0, x: -60, y: 0, scale: 0.85 }, exit: { opacity: 0, x: 60, scale: 0.85 } },
      // Step 3: From top-left
      { initial: { opacity: 0, y: -40, x: -40, scale: 0.9, rotate: -5 }, exit: { opacity: 0, y: 40, x: 40, scale: 0.9 } },
      // Step 4: From right
      { initial: { opacity: 0, x: 60, y: 0, scale: 0.85 }, exit: { opacity: 0, x: -60, scale: 0.85 } },
      // Step 5: From bottom (zoom in)
      { initial: { opacity: 0, y: 50, scale: 0.7 }, exit: { opacity: 0, scale: 1.1 } },
    ];
    
    const anim = animations[stepIndex % animations.length];
    return phase === 'initial' ? anim.initial : anim.exit;
  };

  if (!isVisible) return null;

  const step = steps[currentStep];
  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <AnimatePresence>
      {isVisible && (
        <>
          {/* Overlay with spotlight effect */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999]"
            style={{ pointerEvents: "none" }}
          >
            {/* Dark overlay */}
            <svg width="100%" height="100%" style={{ position: "absolute", top: 0, left: 0 }}>
              <defs>
                <mask id="spotlight-mask">
                  <rect width="100%" height="100%" fill="white" />
                  {targetRect && step.highlight !== false && (
                    <motion.rect
                      initial={{ opacity: 0 }}
                      animate={{
                        x: targetRect.left - 8,
                        y: targetRect.top - 8,
                        width: targetRect.width + 16,
                        height: targetRect.height + 16,
                        opacity: 1,
                      }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      fill="black"
                      rx="12"
                    />
                  )}
                </mask>
              </defs>
              <rect
                width="100%"
                height="100%"
                fill="rgba(0, 0, 0, 0.7)"
                mask="url(#spotlight-mask)"
              />
            </svg>

            {/* Highlight ring around target */}
            {targetRect && step.highlight !== false && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="absolute rounded-xl ring-4 ring-blue-500 ring-opacity-60 shadow-2xl"
                style={{
                  left: targetRect.left - 8,
                  top: targetRect.top - 8,
                  width: targetRect.width + 16,
                  height: targetRect.height + 16,
                  pointerEvents: "none",
                }}
              />
            )}
          </motion.div>

          {/* Tooltip */}
          <motion.div
            key={currentStep}
            initial={getAnimationDirection(currentStep, 'initial')}
            animate={{ opacity: 1, scale: 1, x: 0, y: 0, rotate: 0 }}
            exit={getAnimationDirection(currentStep, 'exit')}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="fixed z-[10000] rounded-2xl shadow-2xl border"
            style={{
              left: tooltipPosition.x,
              top: tooltipPosition.y,
              width: '280px',
              background: "var(--card)",
              borderColor: "var(--border)",
            }}
          >
            {/* Progress bar */}
            <div className="h-0.5 rounded-t-2xl bg-muted overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-blue-500 to-cyan-500"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>

            <div className="p-4">
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="text-base font-bold mb-0.5" style={{ color: "var(--text-primary)" }}>
                    {step.title}
                  </h3>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {currentStep + 1}/{steps.length}
                  </p>
                </div>
                <button
                  onClick={handleSkip}
                  className="p-0.5 rounded-lg hover:bg-muted transition-colors"
                  style={{ color: "var(--text-muted)" }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Description */}
              <p className="text-xs mb-4 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {step.description}
              </p>

              {/* Actions */}
              <div className="flex items-center justify-between">
                {/* Progress dots */}
                <div className="flex gap-1">
                  {steps.map((_, idx) => (
                    <div
                      key={idx}
                      className="w-1.5 h-1.5 rounded-full transition-all"
                      style={{
                        background: idx === currentStep ? "#3b82f6" : "var(--muted)",
                        opacity: idx === currentStep ? 1 : 0.5,
                      }}
                    />
                  ))}
                </div>

                {/* Buttons */}
                <div className="flex gap-1.5">
                  {currentStep > 0 && (
                    <button
                      onClick={handlePrev}
                      className="px-3 py-1.5 rounded-lg font-medium text-xs transition-all hover:bg-muted"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      <ArrowLeft className="w-3 h-3 inline mr-1" />
                      Back
                    </button>
                  )}
                  <motion.button
                    onClick={handleNext}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="px-4 py-1.5 rounded-lg font-semibold text-xs text-white flex items-center gap-1.5"
                    style={{ background: "linear-gradient(135deg, #2563eb, #0ea5e9)" }}
                  >
                    {currentStep === steps.length - 1 ? (
                      <>
                        <CheckCircle className="w-3 h-3" />
                        Got it!
                      </>
                    ) : (
                      <>
                        Next
                        <ArrowRight className="w-3 h-3" />
                      </>
                    )}
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
