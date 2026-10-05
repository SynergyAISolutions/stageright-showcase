'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils/cn';

// The single CTA used on every onboarding screen that has one.
//
// Layout: full-width rectangle pinned at the bottom of the screen via the
// OnboardingShell's bottom slot. On lg+ screens, max-width 480px and centred.
// Solid navy, white label, brand-teal-light arrow icon. Editorial-luxury
// cubic-bezier on hover/active.
//
// Optionally fades + rises in (used on hero screens that orchestrate reveals).
export function OnboardingCta({
  label,
  onClick,
  disabled = false,
  delay,
  type = 'button',
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  /** When set, the button mounts with a delayed reveal beat. */
  delay?: number;
  type?: 'button' | 'submit';
}) {
  const expo = [0.16, 1, 0.3, 1] as const;
  const baseClasses =
    'group relative w-full lg:max-w-[480px] mx-auto flex items-center justify-center gap-3 bg-sr-ink text-white rounded-[14px] h-14 sm:h-[60px] hover:bg-sr-ink-2 active:scale-[0.99] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sr-terra focus-visible:ring-offset-2 shadow-[0_10px_30px_-12px_rgba(15,29,46,0.5)] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-sr-ink';

  const inner = (
    <>
      <span className="text-[16px] sm:text-[17px] font-semibold tracking-tight">
        {label}
      </span>
      <span className="flex items-center justify-center text-sr-sage transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-[3px]">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M3 8h10M9 4l4 4-4 4"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </>
  );

  if (typeof delay === 'number') {
    return (
      <motion.button
        type={type}
        onClick={onClick}
        disabled={disabled}
        initial={{ opacity: 0, y: 14, filter: 'blur(8px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.85, ease: expo, delay }}
        className={cn(baseClasses)}
      >
        {inner}
      </motion.button>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(baseClasses)}
    >
      {inner}
    </button>
  );
}
