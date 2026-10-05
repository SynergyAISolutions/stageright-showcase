'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import { OnboardingCta } from './onboarding-cta';
import { OnboardingShell } from './onboarding-shell';

const EXPO = [0.16, 1, 0.3, 1] as const;

interface Props {
  onContinue: () => void;
  onBack?: () => void;
  /** The image the user just staged in onboarding, so the watermark demo is
   *  shown on THEIR result. Falls back to an admin demo image if absent. */
  imageUrl?: string;
}

// Disclosure screen — the watermark IS the demonstration. Headline frames
// the feature, the user's own just-staged photo shows the actual "Virtually
// Staged · AI" pill in context. Single-focus, no eyebrow, no perk card. The
// pill matches the burned-in style from lambda/staging-worker/lib/
// apply-watermark.mjs: navy ink at 86% opacity, fully rounded, Outfit Medium,
// middot at 50% opacity — and is sized relative to image width (cqw) so the
// demonstrated scale equals the real watermark's at every screen size.
export function DisclosurePerksScreen({ onContinue, imageUrl }: Props) {
  return (
    <OnboardingShell
      cta={<OnboardingCta label="Continue" onClick={onContinue} delay={1.4} />}
    >
      <div className="w-full max-w-xl lg:max-w-2xl flex flex-col items-center text-center gap-7 sm:gap-9 lg:gap-10 short:gap-5 shorter:gap-4">
        <motion.h1
          initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.95, ease: EXPO, delay: 0.1 }}
          className="font-display text-sr-ink text-[40px] sm:text-[56px] lg:text-[72px] short:text-[44px] shorter:text-[38px] leading-[0.98] tracking-[-0.025em]"
        >
          Disclosure is
          <br />
          <span className="italic text-sr-terra">built in.</span>
        </motion.h1>

        {/* One confident supporting line (was two near-identical grey
            lines — the sub here plus a tiny caption under the photo. The
            redundancy was what made the message feel weak). */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EXPO, delay: 0.4 }}
          className="text-[16px] sm:text-[19px] lg:text-[21px] short:text-[15px] text-sr-ink/80 leading-relaxed max-w-[34ch]"
        >
          Every image ships marked, so buyers always know it&apos;s <span className="font-semibold text-sr-ink">virtually staged</span>.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: EXPO, delay: 0.65 }}
          className="relative w-full max-w-[520px] short:max-w-[400px] shorter:max-w-[340px] aspect-[4/3] rounded-xl overflow-hidden border border-sr-ink/[0.08] shadow-[0_8px_24px_-4px_rgba(15,29,46,0.18)] [container-type:inline-size]"
        >
          <Image
            src={imageUrl ?? '/style-thumbnails/bedroom/contemporary-australian.jpg'}
            alt="Your virtually staged room, with the Virtually Staged · AI watermark in the bottom-right corner"
            fill
            sizes="(max-width: 640px) 100vw, (max-height: 720px) 340px, (max-height: 820px) 400px, 520px"
            className="object-cover"
          />
          {/* Watermark pill. Width-proportional (cqw, the wrapper is the query
              container) so it tracks the real apply-watermark.mjs scale — but
              CLAMPED to a tight 10–13px range so it stays legible on the small
              mobile image and doesn't balloon on desktop, reading consistently
              on both. Padding is em-relative so the pill scales with the text;
              margin stays width-proportional (real spec = 4% of width). */}
          <div className="absolute bottom-[4cqw] right-[4cqw] bg-[rgba(15,29,46,0.86)] rounded-full px-[0.9em] py-[0.42em] leading-none text-[clamp(10px,2.4cqw,13px)]">
            <span className="text-white font-medium tracking-tight whitespace-nowrap">
              Virtually Staged<span className="opacity-50"> · </span>AI
            </span>
          </div>
        </motion.div>
      </div>
    </OnboardingShell>
  );
}
