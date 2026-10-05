'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils/cn';

// Single-select choice primitive used across Role / Listing-type / Volume.
// Quiet visual language: white surface, soft navy border, no shadow, no arrow.
// The hollow-circle indicator on the right fills with teal when selected so
// the user gets a 150ms beat of confirmation before the screen auto-advances.
//
// This is deliberately distinct from the primary action button (filled navy
// + arrow + shadow). A choice tells us something about the user; a button
// commits an action — they should never be confusable.
//
// Sub-label is supported but used sparingly — most screens look better with
// label-only rows. The "tag" slot is for inline badges like "(coming soon)".
export function ChoiceRow({
  icon,
  label,
  sub,
  tag,
  selected,
  onPick,
  ariaLabel,
}: {
  icon?: ReactNode;
  label: string;
  sub?: string;
  tag?: ReactNode;
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
        'group relative w-full flex items-center gap-4 px-5 py-4 sm:py-[18px]',
        'rounded-[14px] text-left',
        'border-[1.5px] transition-all duration-[350ms] ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.985]',
        // Selected = solid navy with white text. Resting = white card with
        // soft navy border. Bold, intentional, premium — the selected row
        // reads like an answered question, not a fading tint.
        selected
          ? 'border-sr-terra bg-sr-terra/[0.06] shadow-[0_4px_16px_-8px_rgba(35,165,148,0.35)]'
          : 'border-sr-ink/[0.10] bg-white hover:border-sr-terra hover:bg-sr-terra/[0.06] hover:shadow-[0_4px_16px_-8px_rgba(35,165,148,0.35)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sr-terra focus-visible:ring-offset-1',
      )}
    >
      {icon && (
        <span
          aria-hidden
          className={cn(
            'flex-shrink-0 inline-flex items-center justify-center size-10 rounded-lg transition-colors duration-150',
            selected
              ? 'bg-sr-terra/10 text-sr-terra'
              : 'bg-sr-ink/[0.04] text-sr-ink/75 group-hover:bg-sr-terra/10 group-hover:text-sr-terra',
          )}
        >
          {icon}
        </span>
      )}

      <span className="flex-1 min-w-0">
        <span
          className={cn(
            'block text-[17px] sm:text-[18px] font-medium leading-snug text-sr-ink',
          )}
        >
          {label}
        </span>
        {sub && (
          <span
            className="block mt-0.5 text-[13px] sm:text-[14px] leading-snug text-sr-ink-mute"
          >
            {sub}
          </span>
        )}
      </span>

      {tag && (
        <span className="flex-shrink-0 inline-flex items-center text-[11px] font-semibold uppercase tracking-wider text-sr-ink-mute">
          {tag}
        </span>
      )}

      <span
        aria-hidden
        className={cn(
          'flex-shrink-0 size-[18px] rounded-full border-[1.5px] grid place-items-center transition-colors duration-150',
          selected ? 'border-sr-terra' : 'border-sr-ink/25 group-hover:border-sr-terra',
        )}
      >
        {selected && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
            className="block size-[10px] rounded-full bg-sr-terra"
          />
        )}
      </span>
    </button>
  );
}
