'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

// Tiny editorial pill — uppercase tracked label preceded by a 4px brand-teal
// dot. Lives directly above a headline as the "eyebrow" tag. Same component
// on every onboarding screen so the visual signature is consistent.
export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 text-[11px] sm:text-[12px] lg:text-[13px] font-semibold uppercase tracking-[0.24em] text-sr-ink/60',
        className,
      )}
    >
      <span aria-hidden className="block size-1 rounded-full bg-sr-terra" />
      {children}
    </span>
  );
}
