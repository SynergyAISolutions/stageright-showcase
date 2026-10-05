import { cn } from '@/lib/utils/cn';

interface EditorialPageTitleProps {
  /** Plain text title. Will be rendered as Fraunces, no italic. */
  text: string;
  /** Optional sub line beneath the title. */
  sub?: string;
  /** Optional eyebrow above the title. Caps + tracking. */
  eyebrow?: string;
  /** Optional ReactNode rendered to the right of the title row (e.g. CTA pill). */
  rightSlot?: React.ReactNode;
  className?: string;
}

/**
 * Editorial page heading used on dashboard, listing detail, etc. Plain navy
 * ink — no italic, since real-world content (addresses, names) is unpredictable
 * and italic risks landing on boring words like "Avenue".
 *
 * For copy with designer-controlled italic accents (e.g. "Hello, Tara."),
 * compose JSX directly with <em className="text-sr-terra italic"> instead of
 * using this component.
 */
export function EditorialPageTitle({ text, sub, eyebrow, rightSlot, className }: EditorialPageTitleProps) {
  return (
    <div className={cn('flex items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[9px] sm:text-[10px] tracking-[0.1em] uppercase text-sr-ink-mute font-semibold mb-1">
            {eyebrow}
          </p>
        )}
        {/* leading-[1.25] (not [1] or [1.1]) because Fraunces descenders are
            ~25% of em — at 32px that's 8px below the baseline, and tighter
            line-heights still clip the bottom of g/p/y under truncate's
            overflow-hidden. 1.25 gives exactly enough room. */}
        <h1 className="font-display text-[22px] sm:text-3xl lg:text-[32px] leading-[1.25] tracking-[-0.02em] text-sr-ink truncate">
          {text}
        </h1>
        {sub && (
          <p className="text-[10.5px] sm:text-xs text-sr-ink-mute mt-1">{sub}</p>
        )}
      </div>
      {rightSlot && <div className="flex-shrink-0">{rightSlot}</div>}
    </div>
  );
}
