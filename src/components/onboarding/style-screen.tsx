'use client';

import { useState, useRef, useEffect } from 'react';
import { STAGING_STYLES, type StagingStyle } from '@/lib/ai/prompts';
import { StyleRow, type ThumbnailRoom } from '@/components/staging/style-row';
import { OnboardingShell } from './onboarding-shell';
import { Eyebrow } from './eyebrow';

interface StyleScreenProps {
  activeStyle: StagingStyle;
  onPickStyle: (s: StagingStyle) => void;
  roomCategory: ThumbnailRoom;
  isStaging: boolean;
  stageError: string | null;
  onStage: (style: StagingStyle) => void;
  onBack?: () => void;
}

export function StyleScreen({
  onPickStyle,
  roomCategory,
  isStaging,
  stageError,
  onStage,
}: StyleScreenProps) {
  const [picked, setPicked] = useState<StagingStyle | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll-affordance hint: once on mount, gently nudge the list down ~44px
  // and settle it back, so the rows visibly move and reveal there's more
  // below the fade. Skipped if the list isn't scrollable or the user prefers
  // reduced motion. CRITICAL: the instant the user touches the list we
  // SYNCHRONOUSLY kill the animation (cancelAnimationFrame in the handler),
  // so the list never moves between a tap's pointerdown and pointerup — if it
  // did, the browser would fire no click and picking a style would silently
  // do nothing.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (el.scrollHeight <= el.clientHeight + 8) return; // nothing to scroll

    let raf = 0;
    let startTs: number | null = null;
    let active = true;
    const PEAK = 44;
    const DUR = 900;

    const stop = () => {
      if (!active) return;
      active = false;
      cancelAnimationFrame(raf); // freeze immediately — no movement during a tap
    };
    el.addEventListener('pointerdown', stop, { passive: true });
    el.addEventListener('wheel', stop, { passive: true });
    el.addEventListener('touchstart', stop, { passive: true });

    const tick = (now: number) => {
      if (!active || !scrollRef.current) return;
      if (startTs === null) startTs = now;
      const t = (now - startTs) / DUR;
      if (t >= 1) {
        scrollRef.current.scrollTop = 0;
        active = false;
        return;
      }
      scrollRef.current.scrollTop = PEAK * Math.sin(t * Math.PI); // 0 → PEAK → 0
      raf = requestAnimationFrame(tick);
    };

    const delay = setTimeout(() => {
      if (active) raf = requestAnimationFrame(tick);
    }, 520);

    return () => {
      active = false;
      clearTimeout(delay);
      cancelAnimationFrame(raf);
      el.removeEventListener('pointerdown', stop);
      el.removeEventListener('wheel', stop);
      el.removeEventListener('touchstart', stop);
    };
  }, []);

  const handlePick = (s: StagingStyle) => {
    if (isStaging || picked) return;
    setPicked(s);
    onPickStyle(s);
    setTimeout(() => onStage(s), 250);
  };

  return (
    <OnboardingShell cta={null}>
      <div className="w-full max-w-2xl lg:max-w-3xl flex flex-col items-center text-center">
        <Eyebrow>Pick a style</Eyebrow>
        <h1 className="mt-5 sm:mt-7 lg:mt-9 font-display text-sr-ink text-[32px] sm:text-[42px] lg:text-[56px] leading-[1.02] tracking-[-0.02em]">
          Twelve to <span className="italic text-sr-terra">choose from.</span>
        </h1>
        {stageError && (
          <p className="mt-4 text-[14px] text-red-600 font-medium" role="alert">
            {stageError}
          </p>
        )}
        <div
          ref={scrollRef}
          className="mt-10 w-full overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          style={{
            maxHeight: 'min(58vh, 540px)',
            maskImage: 'linear-gradient(to bottom, black 0%, black 88%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 88%, transparent 100%)',
          }}
        >
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pb-12">
            {STAGING_STYLES.map((s) => (
              <li key={s}>
                <StyleRow
                  style={s}
                  selected={picked === s}
                  onPick={() => handlePick(s)}
                  roomCategory={roomCategory}
                  size="compact"
                />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </OnboardingShell>
  );
}
