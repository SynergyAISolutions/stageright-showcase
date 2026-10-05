'use client';

import { motion } from 'framer-motion';
import { OnboardingShell } from './onboarding-shell';
import { OnboardingCta } from './onboarding-cta';
import { Eyebrow } from './eyebrow';

const EXPO = [0.16, 1, 0.3, 1] as const;

/**
 * Sit between how-it-works and style. Shows the empty bedroom that the
 * cached onboarding flow stages. Establishes the demo as deliberate
 * (not a missing-upload) and gives the user a moment with the room
 * before they pick a style.
 */
export function DemoRoomScreen({
  onContinue,
}: {
  onContinue: () => void;
  /** Accepted for API consistency with other onboarding screens; unused
   *  here because the cta footer only renders the Continue affordance. */
  onBack?: () => void;
}) {
  return (
    <OnboardingShell
      cta={<OnboardingCta label="Continue" onClick={onContinue} delay={0.95} />}
    >
      <div className="flex flex-col items-center max-w-xl lg:max-w-3xl w-full text-center">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EXPO, delay: 0.1 }}
        >
          <Eyebrow>On the house</Eyebrow>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.95, ease: EXPO, delay: 0.3 }}
          className="mt-5 sm:mt-6 short:mt-3 font-display text-sr-ink text-[32px] sm:text-[44px] lg:text-[56px] short:text-[32px] leading-[1.02] tracking-[-0.02em]"
        >
          Here&apos;s a <span className="italic text-sr-terra">bedroom</span> to try.
        </motion.h1>

        <motion.figure
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: EXPO, delay: 0.55 }}
          className="mt-7 sm:mt-9 lg:mt-10 short:mt-5 w-full max-w-md sm:max-w-lg lg:max-w-xl short:max-w-md"
        >
          <div className="rounded-2xl overflow-hidden shadow-elevated bg-white ring-1 ring-sr-ink/[0.06] w-full h-[44vh] sm:h-[46vh] lg:h-[48vh] short:h-[38vh] shorter:h-[34vh]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/style-thumbnails/bedroom/_original.jpg"
              alt="An empty bedroom, your sample room"
              className="block w-full h-full object-cover"
            />
          </div>
          <figcaption className="mt-3 sm:mt-4 text-xs sm:text-[13px] font-semibold tracking-[0.16em] uppercase text-sr-ink-mute">
            Bedroom · empty
          </figcaption>
        </motion.figure>

      </div>
    </OnboardingShell>
  );
}
