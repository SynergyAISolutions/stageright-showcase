'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils/cn';

// Grid-friendly variant of the choice primitive — used for Rooms in onboarding.
// Vertical icon-over-label layout reads as a tile, not a row. Whole tile fills
// teal-tinted on select, with a tiny check overlay top-right. No radio dot —
// the highlight + checkmark are clearer here than a hollow circle.
export function ChoiceTile({
  icon,
  label,
  selected,
  onPick,
  ariaLabel,
}: {
  icon: ReactNode;
  label: string;
  selected: boolean;
  onPick: () => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={ariaLabel ?? label}
      onClick={onPick}
      className={cn(
        'group relative w-full flex flex-col items-center justify-center gap-1.5 sm:gap-2',
        'aspect-square px-2 py-3 sm:aspect-[5/4] sm:px-3 sm:py-4',
        'rounded-[12px]',
        'border-[1.5px] transition-all duration-[350ms] ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.985]',
        selected
          ? 'border-sr-terra bg-sr-terra/[0.06] shadow-[0_4px_16px_-8px_rgba(35,165,148,0.35)]'
          : 'border-sr-ink/[0.10] bg-white hover:border-sr-ink/30 hover:bg-sr-ink/[0.02]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sr-terra focus-visible:ring-offset-1',
      )}
    >
      <span
        className={cn(
          'flex items-center justify-center size-7 sm:size-9 rounded-lg transition-colors duration-150',
          selected ? 'bg-sr-terra/10 text-sr-terra' : 'bg-sr-ink/[0.04] text-sr-ink/75',
        )}
      >
        {icon}
      </span>
      <span
        className="text-[12px] sm:text-[15px] font-medium leading-[1.15] text-center text-sr-ink"
      >
        {label}
      </span>

      {selected && (
        <motion.span
          aria-hidden
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 25 }}
          className="absolute top-2 right-2 size-5 rounded-full bg-sr-terra text-white grid place-items-center"
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path
              d="M2.5 6l2.5 2.5L9.5 4"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </motion.span>
      )}
    </button>
  );
}
