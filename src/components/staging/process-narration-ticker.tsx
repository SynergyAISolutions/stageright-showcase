'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils/cn';

/**
 * Rotating narration shown during staging — gives users a sense of what's
 * happening behind the scenes. Used in two contexts:
 *  1. Top-right chip on the wait state (StagingWaitConcierge)
 *  2. Ambient strip on the result page while variants are still rolling in
 *
 * Lines are intentionally generic and honest in laymans terms — they aren't
 * tied to actual Lambda phases (that would require streaming progress
 * markers). The rotation cadence is purely cosmetic. All claims here are
 * truthful: the room IS analysed, frontier image models ARE used,
 * structural elements ARE held steady.
 */
/**
 * Honest, layman's-terms descriptions of what's happening behind the scenes.
 * Exported so the wait-page concierge can interleave these into its centred
 * rotation alongside per-style observations — drip-fed, single attention
 * source, no competing rotations.
 */
export const PROCESS_NARRATION = [
  'Reading your room: windows, walls, light',
  'Building the staging plan',
  'Sketching with our most-capable AI models',
  'Holding the walls and floor steady',
  'Adding furniture: proportion, scale, materials',
  'Final polish: light, shadow, depth',
] as const;

interface ProcessNarrationTickerProps {
  className?: string;
  intervalMs?: number;
}

export function ProcessNarrationTicker({
  className,
  intervalMs = 5000,
}: ProcessNarrationTickerProps) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % PROCESS_NARRATION.length), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);

  return (
    <span className={cn('inline-block leading-none', className)}>
      <AnimatePresence mode="wait">
        <motion.span
          key={idx}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="inline-block"
        >
          {PROCESS_NARRATION[idx]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
