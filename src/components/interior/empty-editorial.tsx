import { cn } from '@/lib/utils/cn';

interface EmptyEditorialProps {
  eyebrow: string;
  /** ReactNode so callers can compose terra italic accents inline. */
  heading: React.ReactNode;
  sub: string;
  cta: React.ReactNode;
  className?: string;
}

/**
 * Centered editorial empty state used by dashboard (no listings yet) and
 * listing detail (no rooms yet). Eyebrow + Fraunces h1 (with caller-controlled
 * terra italic) + sub copy + single CTA. Fills its parent vertically.
 */
export function EmptyEditorial({ eyebrow, heading, sub, cta, className }: EmptyEditorialProps) {
  return (
    <div className={cn('flex-1 flex flex-col items-center justify-center text-center px-5', className)}>
      <p className="text-[10px] tracking-[0.1em] text-sr-terra font-bold uppercase mb-3.5">
        {eyebrow}
      </p>
      <h1 className="font-display text-[34px] sm:text-5xl leading-[1.15] tracking-[-0.025em] text-sr-ink mb-3.5">
        {heading}
      </h1>
      <p className="text-sm sm:text-base text-sr-ink-soft leading-snug max-w-[260px] mb-7">
        {sub}
      </p>
      {cta}
    </div>
  );
}
