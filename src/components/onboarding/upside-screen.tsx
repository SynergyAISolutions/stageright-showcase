'use client';

import { motion } from 'framer-motion';
import type { ListingIntent, ListingsPerMonth, Role } from '@/types';
import { OnboardingShell } from './onboarding-shell';
import { OnboardingCta } from './onboarding-cta';
import { Eyebrow } from './eyebrow';
import { contentFor, variantFor, EXPO, COLUMN, SETUP, LINE2, payoffSize } from './bombshell-screen';

// The UPSIDE screen — the relief, its own beat right after the cost screen. All
// sage (the win), mirroring the cost screen's terra. Reveals line by line. Pulls
// the same contentFor(variant) the cost screen used, so they stay in lock-step.

interface Props {
  role: Role | null;
  listingsPerMonth: ListingsPerMonth | null;
  listingIntent: ListingIntent | null;
  onContinue: () => void;
  onBack?: () => void;
}

const LINE_BASE = 2.5;
const LINE_GAP = 0.65;

export function UpsideScreen({ role, listingsPerMonth, listingIntent, onContinue }: Props) {
  const variant = variantFor(role, listingIntent);
  const { setup2, payoff, lines2 } = contentFor(variant, listingsPerMonth ?? '11+');

  const ctaDelay = LINE_BASE + Math.max(0, lines2.length - 1) * LINE_GAP + 0.95;

  return (
    <OnboardingShell cta={<OnboardingCta label="Learn more" onClick={onContinue} delay={ctaDelay} />}>
      <div className={COLUMN}>
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EXPO }}>
          <Eyebrow>The upside</Eyebrow>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 16, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ delay: 0.9, duration: 0.85, ease: EXPO }}
          className={`mt-6 sm:mt-8 short:mt-4 ${SETUP}`}
        >
          {setup2}
        </motion.p>

        {/* The relief LIFTS. Where the cost dropped in heavy from above, the
            payoff rises from below and blooms open on a soft spring — an
            exhale, the screen-level terra→sage turn made physical. */}
        <motion.div
          initial={{ opacity: 0, y: 38, scale: 0.84, filter: 'blur(9px)' }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
          transition={{
            default: { delay: 1.7, duration: 1.15, ease: EXPO },
            scale: { delay: 1.7, type: 'spring', stiffness: 125, damping: 14 },
          }}
          className="mt-3 sm:mt-4 short:mt-2 leading-none"
        >
          <span className={`font-display text-[#4F7E5E] ${payoffSize(payoff)} tracking-[-0.03em] leading-[0.92]`}>
            {payoff}
          </span>
        </motion.div>

        {lines2.map((line, i) => (
          <motion.p
            key={i}
            initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ delay: LINE_BASE + i * LINE_GAP, duration: 0.8, ease: EXPO }}
            className={`mt-5 sm:mt-6 short:mt-3 ${LINE2}`}
          >
            {line}
          </motion.p>
        ))}
      </div>
    </OnboardingShell>
  );
}
