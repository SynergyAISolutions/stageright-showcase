'use client';

import { motion } from 'framer-motion';
import { OnboardingCta } from './onboarding-cta';
import { OnboardingShell } from './onboarding-shell';

const EXPO = [0.16, 1, 0.3, 1] as const;

export function WelcomeScreen({
  userName,
  onContinue,
}: {
  userName: string;
  onContinue: () => void;
}) {
  return (
    <section className="relative w-full h-full overflow-hidden">
      {/* Ambient blurred staged-room image — barely visible behind a cream
          wash. Says "premium product" the moment the page loads. The
          atmospheric green/teal blob layer was removed per Tara: every
          onboarding screen sits on plain cream, sage now lives only in
          deliberate accent moments (eyebrow dots, etc.). */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <img
          src="/style-thumbnails/living-room/hamptons.jpg"
          alt=""
          className="size-full object-cover opacity-[0.18]"
          style={{ filter: 'blur(28px) saturate(0.9)', transform: 'scale(1.1)' }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(247,243,233,0.55) 0%, rgba(247,243,233,0.85) 50%, rgba(247,243,233,0.95) 100%)',
          }}
        />
      </div>

      <OnboardingShell
        cta={<OnboardingCta label="Begin" onClick={onContinue} delay={0.9} />}
      >
        <div className="flex flex-col items-center text-center max-w-[34ch] sm:max-w-[44ch] lg:max-w-[60ch]">
          <motion.h1
            initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.95, ease: EXPO, delay: 0.2 }}
            className="font-display text-sr-ink text-[44px] sm:text-[60px] lg:text-[88px] leading-[0.98] tracking-[-0.025em]"
          >
            {userName ? (
              <>
                Hi, <span className="italic text-sr-terra">{userName}</span>.
                <br />
                Let&apos;s take it for a <span className="italic text-sr-terra">spin</span>.
              </>
            ) : (
              <>
                Let&apos;s take it for a{' '}
                <span className="italic text-sr-terra">spin</span>.
              </>
            )}
          </motion.h1>
        </div>
      </OnboardingShell>
    </section>
  );
}
