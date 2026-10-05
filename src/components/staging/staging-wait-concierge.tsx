'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { type StagingStyle } from '@/lib/ai/prompts';
import type { Bundle } from '@/types';
import { PROCESS_NARRATION } from '@/components/staging/process-narration-ticker';

export interface ConciergeNote {
  note: string;
  style?: StagingStyle;
}

interface StagingWaitConciergeProps {
  /** Signed or local blob URL for the hero photo. */
  heroImageUrl: string;
  /** Pre-combined concierge notes from the wizard. Each entry optionally
   *  carries its own style so the wait screen can render a per-note style
   *  label. Always non-empty in normal use. */
  conciergeNotes: ConciergeNote[];
  /** Bundle mode — accepted for API compatibility, not used. */
  bundle?: Bundle;
}

const FALLBACK_NOTE: ConciergeNote = { note: 'Staging in progress…' };

export function StagingWaitConcierge({ heroImageUrl, conciergeNotes }: StagingWaitConciergeProps) {
  // bundle prop is accepted for API compatibility but not used.
  const [index, setIndex] = useState(0);
  // Interleave per-style concierge notes with process narration so the
  // user sees ONE rotating stream of content. Drip-fed, single attention source.
  const notes: ConciergeNote[] = useMemo(() => {
    const baseNotes: ConciergeNote[] =
      conciergeNotes.length > 0 ? conciergeNotes : [FALLBACK_NOTE];
    const processNotes: ConciergeNote[] = PROCESS_NARRATION.map((line) => ({ note: line }));
    const woven: ConciergeNote[] = [];
    const max = Math.max(baseNotes.length, processNotes.length);
    for (let i = 0; i < max; i++) {
      if (i < baseNotes.length) woven.push(baseNotes[i]);
      if (i < processNotes.length) woven.push(processNotes[i]);
    }
    return woven;
  }, [conciergeNotes]);

  useEffect(() => {
    if (notes.length <= 1) return;
    const msPerNote = 6000;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % notes.length);
    }, msPerNote);
    return () => clearInterval(id);
  }, [notes.length]);

  // Clamp index if notes array shrinks (shouldn&apos;t happen in normal flow, but defensive).
  const safeIndex = Math.min(index, notes.length - 1);
  const active = notes[safeIndex];

  return (
    <section className="relative w-full h-full overflow-hidden bg-sr-ink sm:rounded-2xl">
      {/* Ghost photo layer */}
      {heroImageUrl && (
        <img
          src={heroImageUrl}
          alt=""
          aria-hidden
          className="absolute inset-0 size-full object-cover"
          style={{
            // brightness(0.62) darkens the ghost photo itself so bright
            // window areas can't wash out the white text sitting over them
            // (the old transparent-centre vignette let those areas stay
            // bright — the "white words get missed" problem).
            filter: 'blur(22px) saturate(0.85) brightness(0.62)',
            transform: 'scale(1.08)',
            animation: 'stage-wait-ken-burns 40s linear forwards',
          }}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      )}

      {/* Legibility bed — a vertical dark wash (stronger toward the bottom
          where the loader + hint sit) plus a gentle centre vignette. Gives
          the white text a consistent dark bed regardless of the photo. */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(180deg, rgba(15,29,46,0.34) 0%, rgba(15,29,46,0.30) 45%, rgba(15,29,46,0.62) 100%)',
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 30%, rgba(15,29,46,0.45) 100%)',
        }}
      />

      {/* Centred text — no box; drop shadow keeps legibility against the image */}
      <div className="absolute inset-0 flex items-center justify-center px-6 sm:px-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={safeIndex}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center text-center gap-2"
            style={{
              textShadow: '0 2px 18px rgba(0,0,0,0.6), 0 1px 3px rgba(0,0,0,0.45)',
            }}
          >
            {/* Style / metadata caps label above the note. Carries the
                pulsing "live" dot that used to live in the (removed)
                top-right pill, so the working cue stays with the content. */}
            <p className="inline-flex items-center gap-2 text-[10px] sm:text-[11px] lg:text-xs tracking-[0.18em] uppercase text-white/80 font-bold mb-6 sm:mb-8">
              <span className="size-1.5 rounded-full bg-sr-terra animate-pulse" />
              {active.style ?? 'Generating'}
            </p>

            {/* Rotating concierge note — Fraunces italic, scales aggressively up on bigger screens */}
            <p className="font-display italic text-[26px] sm:text-[34px] lg:text-[44px] xl:text-[52px] text-white font-normal max-w-[16ch] sm:max-w-[18ch] lg:max-w-[20ch] leading-[1.15] tracking-[-0.02em] text-center">
              {active.note}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Sweeping terra loader — bottom-centred. Bigger + brighter than the
          old 140px hairline (it read as "tiny / is anything happening?").
          Confident indeterminate sweep with a soft terra glow. */}
      <div className="absolute bottom-[58px] left-1/2 -translate-x-1/2 w-[64%] max-w-[240px] h-[3px] bg-white/15 rounded-full overflow-hidden">
        <div
          className="absolute top-0 -left-[40%] h-full w-[40%] rounded-full"
          style={{
            background: 'linear-gradient(90deg, transparent, #E08A63 50%, transparent)',
            boxShadow: '0 0 12px rgba(224,138,99,0.7)',
            animation: 'wait-loader-sweep 2.2s ease-in-out infinite',
          }}
        />
      </div>

      {/* Timing hint */}
      <p className="absolute bottom-7 left-1/2 -translate-x-1/2 text-[11px] text-white/65 tracking-[0.08em] uppercase font-semibold whitespace-nowrap">
        About a minute
      </p>
    </section>
  );
}
