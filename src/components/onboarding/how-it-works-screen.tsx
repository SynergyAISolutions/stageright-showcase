'use client';

import { motion } from 'framer-motion';
import { OnboardingShell } from './onboarding-shell';
import { OnboardingCta } from './onboarding-cta';

const EXPO = [0.16, 1, 0.3, 1] as const;

// HowItWorks — the map. Four single-line rows replace four description-stuffed
// cards. Each line: number, who, label. Reads as a sentence stretched across
// the screen instead of a feature matrix.
const STEPS = [
  { num: '01', who: 'You', label: 'Upload' },
  { num: '02', who: 'We', label: 'Read the room' },
  { num: '03', who: 'We', label: 'Stage it' },
  { num: '04', who: 'You', label: 'Download. Done.' },
];

export function HowItWorksScreen({
  onContinue,
  onBack,
}: {
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <OnboardingShell cta={<OnboardingCta label="Let's stage" onClick={onContinue} delay={1.35} />}>
      <div className="flex flex-col items-center max-w-xl lg:max-w-2xl w-full">
        <motion.h1
          initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.9, ease: EXPO, delay: 0.15 }}
          className="font-display text-sr-ink text-[32px] sm:text-[42px] lg:text-[56px] leading-[1.02] tracking-[-0.02em] text-center"
        >
          You do two things.
          <br />
          <span className="italic text-sr-terra">We do the other two.</span>
        </motion.h1>

        {/* Rows wrapped in an inline-sized container so the unit
            visually centres under the headline instead of left-aligning
            inside a wider parent. */}
        <ul className="mt-10 flex flex-col w-fit">
          {STEPS.map((s, i) => (
            <motion.li
              key={s.num}
              initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 0.55, ease: EXPO, delay: 0.55 + i * 0.14 }}
              className={
                i > 0
                  ? 'pt-4 mt-4 border-t border-sr-ink/10 flex items-baseline gap-4'
                  : 'flex items-baseline gap-4'
              }
            >
              <span
                className={`font-display text-2xl tabular-nums leading-none flex-shrink-0 ${
                  s.who === 'You' ? 'text-[#4F7E5E]' : 'text-sr-terra'
                }`}
              >
                {s.num}
              </span>
              <span className="text-[12px] font-bold uppercase tracking-wider text-sr-ink-mute leading-none w-8 flex-shrink-0">
                {s.who}
              </span>
              <span className="font-display text-xl sm:text-2xl text-sr-ink tracking-tight leading-tight">
                {s.label}
              </span>
            </motion.li>
          ))}
        </ul>
      </div>
    </OnboardingShell>
  );
}
