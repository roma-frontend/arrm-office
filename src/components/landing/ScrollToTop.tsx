'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowUp } from 'lucide-react';
import { createPortal } from 'react-dom';

export default function ScrollToTop() {
  const [isVisible, setIsVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Throttled scroll handler using requestAnimationFrame
  const handleScroll = useCallback(() => {
    if (window.scrollY > 300) {
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, []);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          handleScroll();
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [handleScroll]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!isVisible || !mounted) return null;

  return createPortal(
    <button
      onClick={scrollToTop}
      className="group fixed bottom-10 right-10 z-[99999] w-10 h-10 rounded-2xl flex items-center justify-center border-0 cursor-pointer transition-all duration-400 ease-[cubic-bezier(0.4,0,0.2,1)] opacity-100 translate-y-0 scale-100 hover:translate-y-[-4px] hover:scale-[1.05]"
      style={{
        background: 'linear-gradient(135deg, #2563eb, #93c5fd)',
        boxShadow: '0 8px 32px rgba(37, 99, 235, 0.3)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 12px 40px rgba(37, 99, 235, 0.5)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 8px 32px rgba(37, 99, 235, 0.3)';
      }}
      aria-label="Scroll to top"
    >
      <ArrowUp size={22} className="group-hover:animate-bounce text-white" aria-hidden="true" />
    </button>,
    document.body,
  );
}
