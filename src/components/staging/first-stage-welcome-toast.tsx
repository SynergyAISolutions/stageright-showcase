'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface FirstStageWelcomeToastProps {
  onDismiss: () => void;
}

export function FirstStageWelcomeToast({ onDismiss }: FirstStageWelcomeToastProps) {
  // Keep latest onDismiss in a ref so the dismiss timer effect doesn't
  // tear down / restart when callers pass an inline arrow (parent re-renders
  // would otherwise reset the 8s timer forever and prevent auto-dismiss).
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  useEffect(() => {
    // Belt-and-braces local guard — server-side firstStageAt is the primary
    // source of truth, but this prevents a refresh during the 8-second
    // window from re-triggering the toast for the same account.
    try {
      localStorage.setItem('stageright:welcome-seen', '1');
    } catch {
      /* noop — storage may be unavailable */
    }
    const id = setTimeout(() => onDismissRef.current(), 8000);
    return () => clearTimeout(id);
  }, []);

  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut', delay: 1.5 }}
      className="fixed left-1/2 -translate-x-1/2 z-50 bottom-4 sm:bottom-6 max-w-[420px] w-[calc(100vw-2rem)]"
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3 bg-brand-navy text-white rounded-2xl shadow-elevated px-4 py-3.5 pr-2">
        <span className="flex-shrink-0 size-8 rounded-full bg-brand-teal/20 text-brand-teal flex items-center justify-center mt-0.5">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path
              d="M7 1v3M7 10v3M1 7h3M10 7h3M2.5 2.5l2 2M9.5 9.5l2 2M2.5 11.5l2-2M9.5 4.5l2-2"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-[14px] leading-snug">Your first staged room.</p>
          <p className="text-[12px] text-white/70 leading-snug mt-0.5">
            It lives in your gallery now.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="flex-shrink-0 size-8 rounded-full hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors"
          aria-label="Dismiss"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </motion.div>
  );
}
