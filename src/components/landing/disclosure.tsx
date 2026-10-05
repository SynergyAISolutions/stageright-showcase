'use client';

import Image from 'next/image';
import { StaggerContainer, FadeUp } from '@/components/ui/motion';

// Compliance feature spotlight. Virtual staging must be disclosed under
// REIA / NAR / REBBA guidance. Every StageRight output ships with
// "Virtually Staged · AI" labelled in via the Lambda applyWatermark
// step (admin / /admin/compare accounts skip it so landing thumbnails
// stay clean).
//
// Design intent — the in-image label itself is intentionally restrained
// (it's a compliance mark, not marketing). An EXTERNAL drafting-style
// callout living below the photo is what draws the eye TO it.

const FR_DISPLAY = { fontVariationSettings: '"opsz" 144, "SOFT" 30' };
const FR_ITALIC = { fontVariationSettings: '"opsz" 144, "SOFT" 80' };

const REGS = [
  { code: 'REIA', region: 'AU' },
  { code: 'NAR', region: 'US' },
  { code: 'REBBA', region: 'CA' },
] as const;

export function Disclosure() {
  return (
    <section className="relative z-10 py-20 sm:py-28 lg:py-32">
      <div className="relative mx-auto max-w-[1240px] px-5 sm:px-10">
        <StaggerContainer>
          <FadeUp>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-center">
              {/* Copy column */}
              <div className="lg:col-span-5">
                <span className="inline-flex items-center gap-3 mb-5 font-mono text-[12.5px] font-medium uppercase tracking-[0.2em] text-[#4F7E5E]">
                  <span className="size-1.5 rounded-full bg-[#4F7E5E]" aria-hidden />
                  Compliance &middot; built in
                </span>

                <h2
                  className="font-display font-normal text-[clamp(32px,4.6vw,52px)] leading-[1.04] tracking-[-0.03em] text-sr-ink"
                  style={FR_DISPLAY}
                >
                  Disclosure required.
                  <br />
                  <em
                    className="not-italic font-display italic font-light text-sr-terra"
                    style={FR_ITALIC}
                  >
                    We&apos;ve handled it.
                  </em>
                </h2>

                <p className="mt-5 text-[15.5px] sm:text-[16.5px] leading-[1.6] text-sr-ink-soft max-w-[460px]">
                  Every staged image ships pre-labelled. REIA, NAR and REBBA disclosure handled
                  by default. No extra step in your listing workflow.
                </p>

                {/* Regulator chips — visual anchor of the regulators named above */}
                <div className="mt-7 flex flex-wrap items-center gap-2.5">
                  <span className="font-mono text-[10.5px] font-medium uppercase tracking-[0.16em] text-sr-ink-mute mr-1">
                    Standard practice
                  </span>
                  {REGS.map((r) => (
                    <span
                      key={r.code}
                      className="inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-full border border-sr-hairline-2 bg-sr-cream-soft font-mono text-[11px] font-medium uppercase tracking-[0.14em]"
                    >
                      <span className="text-sr-ink">{r.code}</span>
                      <span className="text-sr-ink-mute">{r.region}</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Visual column — main photo + detail crop pattern.
                  The main photo shows the watermark at its real (small,
                  discreet) scale. The DETAIL CROP below zooms into the
                  bottom-right corner, showing what the burned-in label
                  actually looks like at readable size. Direct presentation
                  is the feature moment — no annotation needed. */}
              <div className="lg:col-span-7">
                {/* Main photo with the in-file watermark, restrained.
                    aspect-[3/2] matches the source image (1531×1027 ≈ 3:2)
                    so it renders without cropping. Next/Image handles the
                    delivery optimisation; sizes hint reflects the visual
                    column's max width on lg+ (~720px) and full-bleed under. */}
                <div className="relative rounded-md overflow-hidden border border-sr-hairline shadow-[0_30px_60px_-28px_rgba(31,53,57,0.32),0_10px_24px_-10px_rgba(31,53,57,0.12)] aspect-[3/2] bg-sr-surface">
                  <Image
                    src="/landing/disclosure-bedroom-industrial.jpg"
                    alt="Industrial-styled bedroom staged by StageRight, with the virtual-staging label burned into the file"
                    fill
                    sizes="(min-width: 1024px) 720px, 100vw"
                    priority={false}
                    className="object-cover"
                  />
                  <div className="absolute bottom-4 right-4 z-10 px-3 py-1.5 rounded bg-sr-ink">
                    <span className="font-mono text-[10px] sm:text-[10.5px] font-medium uppercase tracking-[0.16em] text-sr-cream-soft whitespace-nowrap">
                      Virtually Staged &middot; AI
                    </span>
                  </div>
                </div>

                {/* Detail strip — the feature moment.
                    Responsive bands:
                    < md  (mobile, small tablet) : stack vertically; detail
                          crop centred and capped at 480px so it doesn't go
                          edge-to-edge on mid-size phones.
                    md+   (tablet, desktop)      : side-by-side. Detail crop
                          fixed-width (300px md / 320px lg), spec text fills
                          remaining space with a 46ch line-length cap. */}
                <div className="mt-6 sm:mt-7 lg:mt-8 flex flex-col md:flex-row md:items-center gap-5 md:gap-6 lg:gap-8">
                  {/* Detail crop — a GENUINE crop from a real non-admin
                      user download where Lambda burned the watermark into
                      the file. No CSS overlay; what you see is what's in
                      the file. Source aspect 304:116 ≈ 2.62:1, preserved
                      exactly so the watermark isn't cropped. */}
                  <div className="relative w-full max-w-[480px] mx-auto md:mx-0 md:w-[320px] lg:w-[340px] md:max-w-none flex-shrink-0 aspect-[304/116] rounded-md overflow-hidden border border-sr-hairline shadow-[0_16px_32px_-16px_rgba(31,53,57,0.18)]">
                    <Image
                      src="/landing/disclosure-inset.jpg"
                      alt="Detail showing the burned-in 'Virtually Staged · AI' label on a staged photo file"
                      fill
                      sizes="(min-width: 1024px) 340px, (min-width: 768px) 320px, (min-width: 640px) 480px, 100vw"
                      className="object-cover"
                    />
                  </div>

                  {/* Spec beside the detail crop. 46ch cap keeps line length
                      comfortable on wide tablets where the spec column would
                      otherwise stretch too far. */}
                  <div className="flex-1 min-w-0 md:max-w-[46ch]">
                    <span className="font-mono text-[10.5px] font-medium uppercase tracking-[0.18em] text-sr-terra block mb-2">
                      Detail &middot; the in-file label
                    </span>
                    <p className="text-[15px] sm:text-[15.5px] leading-[1.55] text-sr-ink-soft">
                      Every staged image you download carries this mark.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </FadeUp>
        </StaggerContainer>
      </div>
    </section>
  );
}
