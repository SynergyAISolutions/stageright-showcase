'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Eyebrow } from './eyebrow';
import { OnboardingCta } from './onboarding-cta';
import { OnboardingShell } from './onboarding-shell';

const EXPO = [0.16, 1, 0.3, 1] as const;

export function FactCreditScreen({ onContinue }: { onContinue: () => void; onBack?: () => void }) {
  // Suspense beat: eyebrow alone (vertically centred via OnboardingShell's
  // justify-center on a single child), holds 1.5s, then the body mounts.
  // The eyebrow's `layout` prop lets framer-motion interpolate its position
  // smoothly from centre → top as the body content arrives below it — no
  // visible jump, no abrupt re-flow.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 1200);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="relative w-full h-full overflow-hidden">
      <OnboardingShell
        cta={<OnboardingCta label="See my gallery" onClick={onContinue} delay={4.6} />}
      >
        <div className="max-w-[28ch] sm:max-w-[40ch] lg:max-w-[52ch] flex flex-col items-center text-center">
          <motion.div
            layout
            transition={{
              layout: { duration: 0.7, ease: EXPO },
              duration: 0.7,
              ease: EXPO,
            }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Eyebrow>And one more thing…</Eyebrow>
          </motion.div>

          {ready && (
            <>
              {/* Lead */}
              <motion.p
                initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.95, ease: EXPO, delay: 0.5 }}
                className="mt-10 sm:mt-14 lg:mt-10 short:mt-5 font-display text-sr-ink text-[24px] sm:text-[30px] lg:text-[34px] short:text-[20px] leading-[1.08] tracking-[-0.015em]"
              >
                You start with
              </motion.p>

              {/* Stat — "30" is the punchline number */}
              <motion.p
                initial={{ opacity: 0, scale: 0.78, y: 14, filter: 'blur(10px)' }}
                animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 1.1, ease: EXPO, delay: 1.4 }}
                className="mt-5 sm:mt-7 lg:mt-7 short:mt-3 font-display italic text-sr-terra text-[64px] sm:text-[100px] lg:text-[96px] short:text-[64px] shorter:text-[56px] leading-[0.92] tracking-[-0.03em]"
              >
                30
              </motion.p>

              {/* After */}
              <motion.p
                initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.95, ease: EXPO, delay: 2.3 }}
                className="mt-6 sm:mt-8 short:mt-3 text-[20px] sm:text-[28px] lg:text-[36px] short:text-[20px] text-sr-ink font-medium leading-snug tracking-tight"
              >
                free credits, on the house.
              </motion.p>

              {/* Point 2 — the ongoing earn, on its OWN beat so it reads as a
                  second gift stacking on the 30 (not a footnote to it). */}
              <motion.p
                initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.9, ease: EXPO, delay: 3.1 }}
                className="mt-8 sm:mt-10 short:mt-4 text-[19px] sm:text-[24px] lg:text-[26px] short:text-[17px] text-sr-ink font-medium leading-snug tracking-tight"
              >
                And every 7 you spend, the next one&apos;s free.
              </motion.p>

              {/* Point 3 — the payoff. "Together" deliberately ties it back to
                  BOTH gifts (the 30 + the ongoing earn), so it reads as the
                  sum of the two points above, not an extension of just the
                  line before it. Italic accent stays the display serif. */}
              <motion.p
                initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.9, ease: EXPO, delay: 3.85 }}
                className="mt-5 sm:mt-6 short:mt-3 text-[19px] sm:text-[24px] lg:text-[26px] short:text-[17px] text-sr-ink/80 font-medium leading-snug tracking-tight max-w-[32ch]"
              >
                Together, that&apos;s plenty of room to{' '}
                <span className="font-display italic text-sr-terra">
                  experiment and find a look you love.
                </span>
              </motion.p>
            </>
          )}
        </div>
      </OnboardingShell>
    </div>
  );
}
