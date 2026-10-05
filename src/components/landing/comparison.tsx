'use client';

import { useEffect, useRef } from 'react';

// Comparison section, Option C layout (locked 2026-05-03):
//
// 1. A horizontal row of three small dark "data" cards above
//    (Physical / Human-edit / General AI) — name + price + turnaround
//    + tagline only. No bullets. They read as reference data points,
//    not as co-equal options.
//
// 2. Below them, a single big cream StageRight hero card with full
//    presentation: title, price, turnaround, bullets in a 2-col grid,
//    tagline. This is the answer; the strip above is "for context."
//
// Reframes the comparison so StageRight isn't visually 1-of-4 peers.
// Solves the "identical card grid" anti-pattern + the text density
// the previous 4-equal-card layout suffered from.

interface CompetitorCard {
  label: string;
  price: string;
  priceUnit: string;
  speed: string;
  tagline: string;
}

// All figures AUD. Re-verified 2026-10-04 against live price pages; USD
// converted at the RBA rate of 0.6933 USD per AUD (2 Oct 2026), so US$1 ≈ A$1.44.
// Physical: Stage 2 Sell guide, 3-bed house $3,500–$6,000 on a 4–6 week hire.
// Human-edit: Styldod US$16 bulk (≈A$23) to BoxBrownie US$24 (≈A$35), 24–48 hrs.
// AI tools: Virtual Staging AI Basic US$16/mo billed yearly (≈A$23); trials only,
// no lasting free plan. Re-check these before quoting them anywhere else.
const COMPETITORS: CompetitorCard[] = [
  {
    label: 'Physical staging',
    price: '$3,500–$6,000',
    priceUnit: '/ 3-bed home',
    speed: 'weeks',
    tagline: 'Real furniture, real time, real cost.',
  },
  {
    label: 'Human-edit virtual',
    price: '$23–$35',
    priceUnit: '/ image',
    speed: '24–48 hours',
    tagline: 'Handcrafted, but slow and per-piece.',
  },
  {
    label: 'General AI tools',
    price: 'From $23',
    priceUnit: '/ month',
    speed: 'trial & error',
    tagline: "Cheap. But the room it gives back isn't yours.",
  },
];

// Order matters: the long "filed with its listing…" bullet sits LAST
// so it can span both columns on sm+ via col-span-2 below. That avoids
// the awkward orphan row when 5 items wrap into a 2-col grid.
const STAGERIGHT_FEATURES = [
  'Preserves your room',
  'Twelve curated interior styles',
  'Photorealistic, full resolution',
  'No prompts to write, no setup',
  'Every staging filed with its listing. No tab-switching, no copy-paste.',
];

const FR_DISPLAY = { fontVariationSettings: '"opsz" 144, "SOFT" 30' };
const FR_ITALIC = { fontVariationSettings: '"opsz" 144, "SOFT" 80' };
const FR_TIER = { fontVariationSettings: '"opsz" 96, "SOFT" 30' };
const FR_PRICE = { fontVariationSettings: '"opsz" 144, "SOFT" 40' };
const FR_TAGLINE = { fontVariationSettings: '"opsz" 36, "SOFT" 80' };

const CHECK_SAGE_DEEP =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 14' fill='none'%3E%3Cpath d='M3 7l3 3 5-7' stroke='%235A7E68' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E";

export function Comparison() {
  // Intersection-driven cascade — competitor strip cascades L→R, then
  // the hero card slides in. Keeps the pre-existing reveal motion the
  // section had under the old 4-card layout.
  const sectionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = sectionRef.current;
    if (!root) return;
    const els = Array.from(
      root.querySelectorAll<HTMLElement>('[data-compare-reveal]'),
    );
    if (!els.length) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !('IntersectionObserver' in window)) {
      els.forEach((c) => c.classList.add('in-view'));
      return;
    }
    let fired = false;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !fired) {
            fired = true;
            els.forEach((el, i) => {
              window.setTimeout(() => el.classList.add('in-view'), i * 110);
            });
            io.disconnect();
          }
        });
      },
      { threshold: 0.18, rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(els[0]);
    return () => io.disconnect();
  }, []);

  return (
    <section
      id="compare"
      className="relative z-10 bg-sr-ink text-sr-cream overflow-hidden py-20 sm:py-28 lg:py-32"
    >
      {/* Sage atmosphere blob to give the dark section a light-source feel */}
      <div
        className="pointer-events-none absolute -top-[20%] -right-[10%] w-[60vw] h-[60vw] max-w-[720px] max-h-[720px] rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(127, 160, 138, 0.16) 0%, transparent 60%)',
        }}
      />

      <div ref={sectionRef} className="relative mx-auto max-w-[1240px] px-5 sm:px-10">
        {/* Section head */}
        <div className="max-w-[760px] mx-auto text-center mb-12 sm:mb-16">
          <span className="inline-flex items-center gap-3 mb-5 font-mono text-[12.5px] font-medium uppercase tracking-[0.2em] text-[#9CC1A8]">
            <span className="size-1.5 rounded-full bg-[#9CC1A8]" aria-hidden />
            Why StageRight
          </span>
          <h2
            className="font-display font-normal text-[clamp(32px,5vw,56px)] leading-[1.04] tracking-[-0.03em] text-sr-cream"
            style={FR_DISPLAY}
          >
            Four ways to stage a listing.
            <br />
            Only one is built for the{' '}
            <em
              className="not-italic font-display italic font-light text-sr-terra"
              style={FR_ITALIC}
            >
              job.
            </em>
          </h2>
          <p className="mt-4 text-base sm:text-[17px] text-sr-cream/72 max-w-[560px] mx-auto">
            Side by side, the actual numbers.
          </p>
        </div>

        {/* Competitor strip — three small dark cards in a row.
            Treats them as data points, not co-equal options. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6 max-w-[1080px] mx-auto">
          {COMPETITORS.map((c) => (
            <div
              key={c.label}
              data-compare-reveal
              className="compare-reveal flex flex-col gap-1.5 rounded-[14px] p-5 sm:p-6 bg-white/[0.04] border border-white/[0.13] hover:bg-white/[0.07] transition-colors duration-300"
            >
              <h3
                className="font-display text-[18px] leading-[1.2] tracking-[-0.01em] text-sr-cream"
                style={FR_TIER}
              >
                {c.label}
              </h3>
              <div
                className="font-display text-[clamp(20px,2vw,26px)] leading-[1.1] tracking-[-0.02em] text-sr-cream"
                style={FR_PRICE}
              >
                {c.price}{' '}
                <span className="font-body text-[13px] font-normal opacity-65">
                  {c.priceUnit}
                </span>
              </div>
              <div className="font-mono text-[10.5px] font-medium uppercase tracking-[0.16em] text-sr-cream/70 mb-1.5">
                Turnaround &middot; {c.speed}
              </div>
              <p
                className="font-display italic font-light text-[13.5px] leading-[1.4] text-sr-cream/78 border-t border-white/[0.16] pt-2.5 mt-1"
                style={FR_TAGLINE}
              >
                {c.tagline}
              </p>
            </div>
          ))}
        </div>

        {/* Hero card — StageRight, the answer.
            Full presentation: title, price, turnaround, 2-col bullet grid,
            tagline. Cream-on-dark for visual pop, terra inset top-edge,
            "Built for staging" badge anchoring the corner. */}
        <div
          data-compare-reveal
          className="compare-reveal relative max-w-[1080px] mx-auto rounded-[20px] p-7 sm:p-9 lg:p-11 bg-sr-cream text-sr-ink shadow-[0_30px_60px_-28px_rgba(31,53,57,0.32)]"
          style={{
            boxShadow:
              'inset 0 3px 0 0 #C76F4E, 0 30px 60px -28px rgba(31,53,57,0.32)',
          }}
        >
          <span className="absolute -top-3 left-7 sm:left-9 bg-sr-terra text-sr-cream-soft font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] px-[11px] py-[6px] rounded-full">
            Built for staging
          </span>

          <div className="grid grid-cols-1 lg:grid-cols-[5fr_6fr] gap-8 lg:gap-12 items-start">
            <div>
              <h3
                className="font-display text-[clamp(28px,2.8vw,38px)] leading-[1.18] tracking-[-0.02em] mb-3.5"
                style={FR_TIER}
              >
                StageRight AI
              </h3>
              <div
                className="font-display text-[clamp(28px,3vw,40px)] leading-[1.1] tracking-[-0.02em] flex flex-wrap items-baseline gap-1.5"
                style={FR_PRICE}
              >
                From{' '}
                <em
                  className="not-italic font-display italic font-light text-sr-terra"
                  style={FR_ITALIC}
                >
                  $0.73
                </em>{' '}
                <span className="font-body text-[14px] font-normal text-sr-ink-soft">
                  AUD / credit
                </span>
              </div>
              <div className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] mt-2 text-sr-ink-soft">
                Turnaround &middot; in just minutes
              </div>
              <p
                className="mt-7 pt-5 border-t border-sr-hairline font-display italic font-light text-[15.5px] leading-[1.4] text-sr-ink-soft"
                style={FR_TAGLINE}
              >
                Purpose-built. The right room, just furnished.
              </p>
            </div>

            <ul className="list-none p-0 m-0 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
              {STAGERIGHT_FEATURES.map((feat, i) => {
                const isLast = i === STAGERIGHT_FEATURES.length - 1;
                return (
                  <li
                    key={feat}
                    className={`flex items-start gap-2.5 py-1 text-[14.5px] leading-[1.5] text-sr-ink ${
                      isLast ? 'sm:col-span-2 sm:pt-2.5 sm:mt-1 sm:border-t sm:border-sr-hairline/60' : ''
                    }`}
                  >
                    <span
                      className="block size-3.5 mt-[4px] flex-shrink-0 bg-no-repeat bg-center bg-contain"
                      style={{ backgroundImage: `url("${CHECK_SAGE_DEEP}")` }}
                      aria-hidden
                    />
                    <span>{feat}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>

      <style jsx>{`
        .compare-reveal {
          opacity: 0;
          transform: translateY(28px);
          transition:
            opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1),
            transform 0.7s cubic-bezier(0.16, 1, 0.3, 1),
            background-color 0.3s ease;
        }
        .compare-reveal.in-view {
          opacity: 1;
          transform: translateY(0);
        }
        @media (prefers-reduced-motion: reduce) {
          .compare-reveal {
            opacity: 1;
            transform: none;
          }
        }
      `}</style>
    </section>
  );
}
