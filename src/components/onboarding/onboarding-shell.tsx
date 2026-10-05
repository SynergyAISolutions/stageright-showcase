'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

// The single page-shell used by every onboarding screen.
//
// Anatomy:
//  - top: progress bar (rendered by parent, slot here is reserved by pt-1.5)
//  - middle: scrollable content area, vertically centred via flex
//  - bottom: pinned CTA region with thumb-zone padding (24px from edges,
//    24px above safe-area-inset-bottom)
//
// `cta` is optional. Auto-advance screens (Role/Volume/Listing-type/Rooms/
// Style) pass `cta={null}` and consume the bottom space for content.
export function OnboardingShell({
  children,
  cta,
  contentClassName,
  narrow,
}: {
  children: ReactNode;
  cta?: ReactNode;
  contentClassName?: string;
  // For form-heavy screens (signup) where the immersive full-bleed
  // shell looks weak on desktop. Caps both the content and the CTA
  // dock to a centred 520px column so the button stops stretching
  // edge-to-edge and tracks the form's width.
  narrow?: boolean;
}) {
  const widthCap = narrow ? 'mx-auto w-full max-w-[520px]' : '';
  return (
    <div className="relative w-full h-full flex flex-col">
      {/* Content area — flex-1, scrollable if it overflows. The
          overflow-y-auto matters most on the signup-card path: a tall
          form (4 fields + confirm + heading) can exceed a short
          desktop viewport, and without it the bottom of the card gets
          clipped by the CTA dock. */}
      <div
        className={cn(
          'flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center px-6 sm:px-10 pt-10 sm:pt-14 lg:pt-20 short:pt-6 shorter:pt-4',
          cta ? 'pb-6 short:pb-3' : 'pb-10 short:pb-4',
          widthCap,
          contentClassName,
        )}
      >
        {children}
      </div>

      {/* CTA dock — full-width on mobile, capped + centred on lg+.
          paddingBottom uses max() with the safe-area-inset so the
          button always sits at least the explicit gap above the
          chrome edge (covers iOS home indicator + Android nav).
          Short viewports compress dock padding to claw back budget. */}
      {cta && (
        <div
          className={cn(
            'flex-shrink-0 px-6 sm:px-10 pt-6 sm:pt-8 lg:pt-12 short:pt-4',
            'pb-[max(40px,calc(env(safe-area-inset-bottom)+32px))] short:pb-[max(24px,calc(env(safe-area-inset-bottom)+16px))]',
            widthCap,
          )}
        >
          {cta}
        </div>
      )}
    </div>
  );
}
