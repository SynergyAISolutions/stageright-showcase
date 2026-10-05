'use client';

import { motion } from 'framer-motion';
import { Eyebrow } from './eyebrow';
import { OnboardingCta } from './onboarding-cta';
import { OnboardingShell } from './onboarding-shell';

const EXPO = [0.16, 1, 0.3, 1] as const;

export function FactAiScreen({ onContinue }: { onContinue: () => void; onBack?: () => void }) {
  return (
    <div className="relative w-full h-full overflow-hidden">
      <OnboardingShell
        cta={<OnboardingCta label="Continue" onClick={onContinue} delay={1.7} />}
      >
        <div className="w-full max-w-xl lg:max-w-2xl flex flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EXPO }}
          >
            <Eyebrow>How to read your stage</Eyebrow>
          </motion.div>

          {/* Point 1 — hero scale */}
          <motion.h1
            initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.95, ease: EXPO, delay: 0.2 }}
            className="mt-8 sm:mt-10 font-display text-sr-ink text-[40px] sm:text-[56px] lg:text-[80px] leading-[0.98] tracking-[-0.025em]"
          >
            Each image is
            <br />
            <span className="italic text-sr-terra">AI-generated.</span>
          </motion.h1>

          {/* Headline carries the honesty ("AI-generated"); this line turns
              that into the reassurance and positions three-takes as the
              DEFAULT (3 images per style), not a fallback. Also bridges the
              demo, which only revealed a single cached image. */}
          <motion.p
            initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.9, ease: EXPO, delay: 0.7 }}
            className="mt-7 sm:mt-9 max-w-[32ch] text-[18px] sm:text-[21px] lg:text-[23px] text-sr-ink/75 font-medium leading-[1.35] tracking-tight"
          >
            You just saw one. In the app, every style gives you <span className="text-sr-terra font-semibold">three takes</span> by default, so you can pick your favourite.
          </motion.p>
        </div>
      </OnboardingShell>
    </div>
  );
}
