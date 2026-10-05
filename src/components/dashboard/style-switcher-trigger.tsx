'use client';

import { cn } from '@/lib/utils/cn';

/**
 * Trigger for the gallery viewer's per-room style switcher.
 *
 * One button: the active style name (terra italic Fraunces, the room's
 * headline) followed by a small hairline pill carrying "2 of 3 styles" and
 * a chevron. The pill is what tells people the headline is the room's main
 * menu; the counter tells them there is more inside it. The counter uses
 * the same mono-caps language as the "3 TAKES" count on the menu rows.
 *
 * Layout: flex-wrap so a long name ("Contemporary Australian") on a narrow
 * phone drops the pill onto its own line, centred under the name below lg
 * and left-aligned from lg up (matching the heading block's alignment).
 * `align` exists so /design-preview can pin the alignment inside a
 * width-constrained frame regardless of the real viewport width.
 *
 * The popover / bottom sheet themselves live in gallery-viewer.tsx; this
 * component is presentation plus the toggle only.
 */
export function StyleSwitcherTrigger({
  styleName,
  index,
  total,
  open,
  onToggle,
  align = 'responsive',
}: {
  styleName: string;
  /** Zero-based index of the active style within the room. */
  index: number;
  total: number;
  open: boolean;
  onToggle: () => void;
  align?: 'responsive' | 'center' | 'start';
}) {
  const position = index + 1;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label={`Style: ${styleName}. ${position} of ${total} styles. Change style`}
      className={cn(
        'group inline-flex flex-wrap items-center gap-x-2.5 gap-y-1.5 min-h-[44px] sm:min-h-0 rounded-lg',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sr-terra/40',
        align === 'responsive' && 'justify-center lg:justify-start',
        align === 'center' && 'justify-center',
        align === 'start' && 'justify-start',
      )}
    >
      <em
        className="font-display italic text-sr-terra text-xl sm:text-2xl lg:text-[32px] leading-[1.1] tracking-[-0.02em] font-normal"
        style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80' }}
      >
        {styleName}
      </em>
      <span
        aria-hidden
        className={cn(
          'inline-flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 rounded-full border px-2.5 py-1 sm:px-3 sm:py-1.5',
          'transition-[border-color,background-color,color] duration-200',
          open
            ? 'border-sr-terra/50 bg-sr-terra/[0.06] text-sr-ink'
            : 'border-sr-hairline-2 bg-sr-surface text-sr-ink-soft group-hover:border-sr-terra/40 group-hover:text-sr-ink',
        )}
      >
        <span className="font-mono text-[9px] sm:text-[10px] tracking-[0.16em] uppercase font-semibold">
          {position} of {total} styles
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden
          className={cn('flex-shrink-0 transition-transform duration-200', open && 'rotate-180')}
        >
          <path d="M3.5 5.5L7 9l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </button>
  );
}
