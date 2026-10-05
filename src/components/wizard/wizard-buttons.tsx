'use client';

import { cn } from '@/lib/utils/cn';

export function WizardBackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-semibold text-sr-ink-mute hover:text-sr-ink transition-colors"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
        <path d="M7 2L3 5l4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Back
    </button>
  );
}

export function WizardContinueButton({
  onClick,
  disabled,
  label,
  className,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-2 rounded-full font-semibold tracking-[0.02em] whitespace-nowrap',
        'bg-sr-sage-deep text-white border border-sr-sage-deep',
        'hover:bg-sr-sage-deep/90 active:scale-[0.98]',
        'transition-all disabled:opacity-50 disabled:cursor-not-allowed',
        'px-5 py-2.5 text-xs sm:text-sm',
        className,
      )}
    >
      {label}
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
        <path d="M3 5.5h5M6 3.5l2 2-2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
