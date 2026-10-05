'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { BeforeAfterSlider } from '@/components/comparison/before-after-slider';

const springTransition = { type: 'spring' as const, stiffness: 80, damping: 20 };

// Inline style helpers — Fraunces variable axes for the SOFT humanism that
// Tailwind alone can't express.
const FR_DISPLAY = { fontVariationSettings: '"opsz" 144, "SOFT" 30' };
const FR_ITALIC_ACCENT = { fontVariationSettings: '"opsz" 144, "SOFT" 80' };

export function Hero() {
  return (
    <section className="relative flex items-center pt-16 sm:pt-24 pb-12 sm:pb-24 lg:min-h-[100dvh]">
      <div className="relative mx-auto max-w-[1240px] px-5 sm:px-10 w-full">
        {/* Three-cell grid:
            - eyebrow + headline (top-left on desktop, first on mobile)
            - photo (right column spanning full height on desktop, second on mobile)
            - lede + CTA + trust (bottom-left on desktop, last on mobile)
            Mobile DOM order keeps the photo above the lede/CTA so it's visible
            within first scroll. Desktop uses explicit grid placement to keep
            type stacked left and photo full-height right. */}
        <div className="grid grid-cols-1 gap-8 sm:gap-10 lg:grid-cols-[1.05fr_1fr] lg:gap-x-16 lg:gap-y-8 lg:items-center">
          {/* Cell 1 — Eyebrow + Headline */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springTransition, delay: 0.1 }}
            className="lg:col-start-1 lg:row-start-1 max-w-xl"
          >
            <div className="inline-flex items-center gap-3 mb-6 sm:mb-7 pb-3 sm:pb-4 border-b border-sr-hairline">
              <span className="size-1.5 rounded-full bg-[#4F7E5E]" aria-hidden />
              <span className="font-mono text-[12px] sm:text-[12.5px] font-medium uppercase tracking-[0.2em] text-[#4F7E5E]">
                Virtual staging · for real estate
              </span>
            </div>

            <h1
              className="font-display font-normal text-[clamp(36px,7vw,80px)] leading-[0.98] tracking-[-0.035em] text-sr-ink"
              style={FR_DISPLAY}
            >
              Photorealistic
              <br />
              <em
                className="not-italic font-display italic font-light text-sr-terra tracking-[-0.04em]"
                style={FR_ITALIC_ACCENT}
              >
                staging,
              </em>{' '}
              ready
              <br />
              in{' '}
              <em
                className="not-italic font-display italic font-light text-sr-terra tracking-[-0.04em]"
                style={FR_ITALIC_ACCENT}
              >
                just minutes.
              </em>
            </h1>
          </motion.div>

          {/* Cell 2 — Photo with architectural callouts.
              On desktop: column 2, spans both rows for full height.
              On mobile: appears between headline and lede. */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springTransition, delay: 0.3 }}
            className="relative w-full lg:col-start-2 lg:row-start-1 lg:row-span-2"
          >
            <div className="relative rounded-md overflow-hidden border border-white/60 shadow-[0_64px_130px_-50px_rgba(31,53,57,0.38),0_24px_60px_-20px_rgba(31,53,57,0.18)] lg:rotate-[0.8deg]">
              <BeforeAfterSlider
                beforeSrc="/landing/hero-empty.jpg"
                afterSrc="/landing/hero-staged-boho.jpg"
                beforeLabel="Empty"
                afterLabel="Staged"
                autoReveal
                lockAspect="4 / 3"
              />
            </div>

            {/* Hero photo callouts removed — both pieces of info live
                elsewhere on the page (pricing in Pricing section, time in
                "in just minutes" copy throughout). Lets the photo carry
                its own weight without redundant chrome. */}
          </motion.div>

          {/* Cell 3 — Lede + CTA + Trust */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springTransition, delay: 0.45 }}
            className="lg:col-start-1 lg:row-start-2 max-w-xl"
          >
            <p className="text-base sm:text-[17px] leading-[1.55] text-sr-ink-soft max-w-[480px]">
              Upload an empty or furnished room. Pick a style. Get a{' '}
              <strong className="text-sr-ink font-medium">full-resolution staged photo</strong> back
              in just minutes. Twelve curated interior styles, ready to list.
            </p>

            <div className="mt-7 sm:mt-9 flex">
              <Link
                href="/onboarding"
                className="group inline-flex items-center justify-center gap-2.5 bg-sr-ink text-sr-cream-soft px-6 sm:px-7 py-3.5 sm:py-4 rounded text-[15px] font-medium hover:bg-sr-ink-2 hover:-translate-y-px transition-all duration-200 shadow-[0_4px_14px_-6px_rgba(31,53,57,0.30)]"
              >
                Start with 30 free credits
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="transition-transform group-hover:translate-x-1">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              </Link>
            </div>

            <div className="mt-6 sm:mt-7 flex items-center gap-2.5 text-sm font-medium text-sr-ink-soft">
              <span className="size-2 rounded-full bg-sr-sage shadow-[0_0_0_4px_rgba(127,160,138,0.22)]" />
              <span>No credit card · Earn a free credit every 7 you spend</span>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
