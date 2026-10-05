'use client';

import { motion } from 'framer-motion';
import type { OnboardingStep } from '@/app/onboarding/onboarding-flow';

// SOURCE OF TRUTH must track the real flow in onboarding-flow.tsx. This list
// had drifted: it still carried the removed `upload`/`rooms` steps and was
// MISSING `demo-room`, so the bar collapsed to 0% on demo-room (indexOf → -1)
// and the denominator was wrong. One continuous, monotonic bar start→finish —
// no hide during the reveal, so it never appears to restart.
const STEP_ORDER: OnboardingStep[] = [
  'welcome',
  'role',
  'listing-type',
  'commercial',
  'volume',
  'bombshell',
  'upside',
  'bridge',
  'how-it-works',
  'demo-room',
  'style',
  'generating',
  'result',
  'fact-ai',
  'disclosure-perks',
  'fact-credit',
  'signup',
];

function percentFor(step: OnboardingStep): number {
  const idx = STEP_ORDER.indexOf(step);
  if (idx === -1) return 0;
  return Math.round(((idx + 1) / STEP_ORDER.length) * 100);
}

interface OnboardingProgressBarProps {
  step: OnboardingStep;
}

export function OnboardingProgressBar({ step }: OnboardingProgressBarProps) {
  const pct = percentFor(step);
  return (
    <div
      // The single sage anchor across every onboarding screen. 7–8px
      // tall greener-sage fill on a quiet ink track, plus a leading-edge
      // sage dot that rides the progress wavefront. Reads as a piece of
      // architectural drafting chrome, not a decorative hairline.
      className="absolute left-0 right-0 top-0 h-[7px] sm:h-[8px] bg-sr-ink/[0.10] z-20"
      aria-hidden
    >
      <motion.div
        className="relative h-full bg-[#4F7E5E]"
        style={{
          boxShadow: '0 0 16px rgba(79,126,94,0.55), 0 1px 0 rgba(79,126,94,0.35)',
        }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        initial={false}
      >
        {/* Leading-edge dot — sits at the right tip of the fill,
            slightly overhanging. The sage halo around it (3px ring at
            low opacity) gives a subtle "you are here" pulse. */}
        <span
          aria-hidden
          className="absolute -right-[5px] top-1/2 size-[10px] sm:size-[12px] -translate-y-1/2 rounded-full bg-[#4F7E5E]"
          style={{
            boxShadow:
              '0 0 14px rgba(79,126,94,0.7), 0 0 0 3px rgba(79,126,94,0.18)',
          }}
        />
      </motion.div>
    </div>
  );
}
