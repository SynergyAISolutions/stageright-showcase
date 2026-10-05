'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface BonusCreditEnvelopeProps {
  onDismiss: () => void;
}

/**
 * Celebration card that slides in at reveal-peak when the user earns a free
 * credit. Auto-dismisses after 6 seconds; tap to dismiss early.
 * Soft terra glow halo behind, white card, Fraunces editorial copy.
 */
export function BonusCreditEnvelope({ onDismiss }: BonusCreditEnvelopeProps) {
  // Keep latest onDismiss in a ref so parent re-renders (inline arrow props)
  // don&apos;t tear down and restart the 6s timer. Pattern matches FirstStageWelcomeToast.
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  useEffect(() => {
    const id = setTimeout(() => onDismissRef.current(), 6000);
    return () => clearTimeout(id);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 80 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      transition={{ type: 'spring', damping: 22, stiffness: 280 }}
      onClick={onDismiss}
      className="fixed inset-x-0 bottom-8 z-50 mx-auto w-fit cursor-pointer"
      role="status"
      aria-live="polite"
    >
      {/* Soft terra glow halo behind */}
      <div
        aria-hidden
        className="absolute left-1/2 -translate-x-1/2 -top-12 size-[240px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(199,111,78,0.45) 0%, transparent 60%)',
          filter: 'blur(20px)',
        }}
      />
      <div className="relative bg-white border border-sr-terra/25 rounded-2xl shadow-[0_14px_36px_-8px_rgba(199,111,78,0.4)] px-5 py-4 flex items-center gap-3 max-w-[280px]">
        <div className="flex-shrink-0 size-10 rounded-xl bg-gradient-to-br from-sr-terra to-[#E89377] flex items-center justify-center text-white font-display text-[15px] font-semibold">
          +1
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[9px] tracking-[0.10em] uppercase text-sr-terra font-bold">
            Free credit
          </p>
          <p className="font-display text-[15px] text-sr-ink leading-[1.1] mt-0.5">
            A gift, on <em className="text-sr-terra italic">us</em>.
          </p>
          <p className="text-[10px] text-sr-ink-soft mt-0.5 leading-snug">
            7 stages spent &mdash; a free credit just landed.
          </p>
        </div>
      </div>
    </motion.div>
  );
}
