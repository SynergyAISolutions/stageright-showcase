'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Eyebrow } from './eyebrow';
import { OnboardingCta } from './onboarding-cta';
import { OnboardingShell } from './onboarding-shell';

const EXPO = [0.16, 1, 0.3, 1] as const;

interface Props {
  onNotify: () => void;
  onTryAnyway: () => void;
  onBack?: () => void;
}

// Commercial notice — co-design moment.
//
// Ask state: "Should we build commercial staging?" with primary "Yes, build it"
// and tertiary "Try the home version".
//
// Thanked state (after "Yes, build it"): same canvas, same blooms — content
// and CTA crossfade in place to a brief confirmation. The user's vote was
// already captured the moment they picked Commercial on the listing-type
// screen (propertyType='commercial' saved server-side); this is the
// acknowledgment that closes the loop.
export function CommercialNoticeScreen({ onNotify, onTryAnyway }: Props) {
  const [thanked, setThanked] = useState(false);

  return (
    <div className="relative w-full h-full overflow-hidden">
      <OnboardingShell
        cta={
          <AnimatePresence mode="wait" initial={false}>
            {thanked ? (
              <motion.div
                key="cta-thanked"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.5, ease: EXPO }}
                className="w-full flex flex-col items-center"
              >
                <OnboardingCta label="See my gallery" onClick={onNotify} />
              </motion.div>
            ) : (
              <motion.div
                key="cta-ask"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.5, ease: EXPO }}
                className="flex flex-col items-center gap-4 w-full"
              >
                <OnboardingCta
                  label="Yes, build it"
                  onClick={() => setThanked(true)}
                  delay={1.05}
                />
                <motion.button
                  type="button"
                  onClick={onTryAnyway}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, ease: EXPO, delay: 1.3 }}
                  className="text-[14px] sm:text-[15px] font-medium text-sr-ink/55 hover:text-sr-ink/85 transition-colors duration-200 underline-offset-[3px] decoration-sr-ink/30 hover:underline"
                >
                  Try the home version
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        }
      >
        <AnimatePresence mode="wait" initial={false}>
          {thanked ? (
            <motion.div
              key="thanked"
              initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -10, filter: 'blur(6px)' }}
              transition={{ duration: 0.7, ease: EXPO }}
              className="max-w-[28ch] sm:max-w-[36ch] lg:max-w-[44ch] flex flex-col items-center text-center"
            >
              <Eyebrow>Got it</Eyebrow>

              <h1 className="mt-5 sm:mt-7 lg:mt-9 font-display text-sr-ink text-[32px] sm:text-[42px] lg:text-[56px] leading-[1.02] tracking-[-0.02em]">
                You&apos;re on{' '}
                <span className="italic text-sr-terra">the list.</span>
              </h1>

              <span
                aria-hidden
                className="block mt-7 sm:mt-9 h-[2px] w-12 bg-sr-terra/55 origin-center"
              />

              <p className="mt-7 sm:mt-9 text-[16px] sm:text-[18px] lg:text-[20px] font-medium text-sr-ink/75 leading-relaxed max-w-[40ch]">
                We&apos;ll let you know the moment commercial staging is ready.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="ask"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -10, filter: 'blur(6px)' }}
              transition={{ duration: 0.7, ease: EXPO }}
              className="max-w-[28ch] sm:max-w-[36ch] lg:max-w-[44ch] flex flex-col items-center text-center"
            >
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: EXPO, delay: 0.0 }}
              >
                <Eyebrow>Help shape what&apos;s next</Eyebrow>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.95, ease: EXPO, delay: 0.2 }}
                className="mt-5 sm:mt-7 lg:mt-9 font-display text-sr-ink text-[32px] sm:text-[42px] lg:text-[56px] leading-[1.02] tracking-[-0.02em]"
              >
                Should we build{' '}
                <span className="italic text-sr-terra">commercial staging?</span>
              </motion.h1>

              <motion.span
                aria-hidden
                initial={{ opacity: 0, scaleX: 0 }}
                animate={{ opacity: 1, scaleX: 1 }}
                transition={{ duration: 0.6, ease: EXPO, delay: 0.6 }}
                className="block mt-7 sm:mt-9 h-[2px] w-12 bg-sr-terra/55 origin-center"
              />

              <motion.p
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: EXPO, delay: 0.75 }}
                className="mt-7 sm:mt-9 text-[16px] sm:text-[18px] lg:text-[20px] font-medium text-sr-ink/75 leading-relaxed max-w-[40ch]"
              >
                StageRight stages homes today. Commercial (offices, retail, hospitality) isn&apos;t built yet. Vote yes and we&apos;ll prioritise it.
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
      </OnboardingShell>
    </div>
  );
}
