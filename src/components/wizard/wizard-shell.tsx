'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils/cn';

interface WizardShellProps {
  /** Eyebrow text — e.g. "Step 1 of 6 · Upload" or "Step 2 of 6 · Reference · Optional" */
  eyebrow: string;
  /** ReactNode so callers can compose terra italic accents inline. */
  question: ReactNode;
  subtitle?: string;
  size?: 'default' | 'wide';
  children: ReactNode;
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
  className?: string;
}

/**
 * Per-step wizard container. Eyebrow + Fraunces question (with caller-controlled
 * terra italic) + subtitle + scrollable body + footer with back/continue slots.
 * Mobile = full-bleed; desktop = centred max-width pill on sr-cream interior.
 */
export function WizardShell({
  eyebrow,
  question,
  subtitle,
  size = 'default',
  children,
  footerLeft,
  footerRight,
  className,
}: WizardShellProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'w-full h-full flex flex-col bg-white overflow-hidden',
        'sm:mx-auto sm:rounded-2xl sm:border sm:border-sr-hairline sm:shadow-[0_8px_32px_-12px_rgba(31,53,57,0.12)]',
        'sm:h-auto sm:max-h-full',
        size === 'wide' ? 'sm:max-w-[1200px]' : 'sm:max-w-[640px]',
        className,
      )}
    >
      <header className="flex-shrink-0 px-6 pt-6 pb-4 text-center bg-white">
        <p className="text-[10px] sm:text-[11px] font-bold tracking-[0.10em] uppercase text-sr-terra mb-2.5">
          {eyebrow}
        </p>
        <h1 className="font-display text-2xl sm:text-3xl lg:text-[34px] text-sr-ink tracking-[-0.02em] leading-[1.05] font-normal">
          {question}
        </h1>
        {subtitle && (
          <p className="text-sm sm:text-base text-sr-ink-soft leading-snug mt-2.5 max-w-[36ch] mx-auto">
            {subtitle}
          </p>
        )}
      </header>

      <div
        className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-4 flex flex-col [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>

      {(footerLeft || footerRight) && (
        <footer
          className="flex-shrink-0 px-5 sm:px-6 py-4 border-t border-sr-hairline bg-white flex justify-between items-center gap-3"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <div>{footerLeft}</div>
          <div>{footerRight}</div>
        </footer>
      )}
    </motion.section>
  );
}
