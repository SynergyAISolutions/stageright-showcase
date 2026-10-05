'use client';

import { motion } from 'framer-motion';

interface WizardProgressHairlineProps {
  /** 0-indexed step index (0 = first step). */
  currentIndex: number;
  /** Total number of steps. */
  total: number;
}

/**
 * Thin terra progress bar at the top of the wizard. Replaces the previous
 * segmented + labeled progress bar — eyebrow on each step now carries the
 * label, this is a pure pacing signal.
 */
export function WizardProgressHairline({ currentIndex, total }: WizardProgressHairlineProps) {
  const pct = Math.min(1, Math.max(0, (currentIndex + 1) / total));
  return (
    <div className="h-[2px] w-full bg-sr-hairline relative">
      <motion.div
        className="absolute top-0 left-0 h-full bg-sr-terra rounded-full"
        initial={{ width: 0 }}
        animate={{ width: `${pct * 100}%` }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  );
}
