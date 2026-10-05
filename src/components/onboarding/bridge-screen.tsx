'use client';

import { motion } from 'framer-motion';
import { Eyebrow } from './eyebrow';
import { OnboardingCta } from './onboarding-cta';
import { OnboardingShell } from './onboarding-shell';

const EXPO = [0.16, 1, 0.3, 1] as const;

export function BridgeScreen({ onContinue }: { onContinue: () => void; onBack?: () => void }) {
  return (
    <div className="relative w-full h-full overflow-hidden">
      <OnboardingShell
        cta={<OnboardingCta label="Show me how" onClick={onContinue} delay={2.3} />}
      >
        <div className="flex flex-col items-center text-center max-w-[24ch] sm:max-w-[28ch] lg:max-w-[32ch]">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EXPO, delay: 0.1 }}
          >
            <Eyebrow>The new way</Eyebrow>
          </motion.div>

          {/* Two beats, each its own line, each on its own clock. The terra
              second line is the turn — it lands a full second after the first
              so the "in → out" flip reads as a deliberate before/after. */}
          <motion.p
            initial={{ opacity: 0, y: 20, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.9, ease: EXPO, delay: 0.6 }}
            className="mt-7 sm:mt-9 font-display text-sr-ink text-[28px] sm:text-[37px] lg:text-[44px] leading-[1.1] tracking-[-0.02em]"
          >
            An empty room in.
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 20, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.9, ease: EXPO, delay: 1.6 }}
            className="mt-4 sm:mt-5 font-display italic text-[#4F7E5E] text-[28px] sm:text-[37px] lg:text-[44px] leading-[1.1] tracking-[-0.02em]"
          >
            A staged one out.
          </motion.p>
        </div>
      </OnboardingShell>
    </div>
  );
}
