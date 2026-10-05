'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils/cn';

interface BeforeAfterSliderProps {
  beforeSrc: string;
  /** When afterContent is provided, afterSrc is ignored. */
  afterSrc?: string;
  /**
   * Custom React node rendered as the AFTER layer instead of a staged image.
   * Used by the reveal page&apos;s in-place loading state — when a variant
   * hasn&apos;t landed yet, callers pass loading-orb + caption JSX so the slider
   * stays drag-able while the after side displays a placeholder.
   */
  afterContent?: React.ReactNode;
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
  /** When true, runs the 2s lid-lift reveal animation on mount.
   *  Replaces the legacy autoPlay prop. Any user pointer interaction
   *  cancels the animation and hands control over. */
  autoReveal?: boolean;
  /** When true, sizes the slider to fit its direct parent's box (using
   * container-query units) while preserving the image's natural aspect.
   * The parent MUST have `containerType: 'size'` so 100cqw / 100cqh
   * resolve to the wrapper's real dimensions — not the viewport. This
   * avoids the address-bar / dialog-chrome miscounts that break pure
   * vh-based budgets on mobile. */
  fitParent?: boolean;
  /** Fires exactly once when the sweep hits 100% (t ≈ 1400ms).
   *  Used by the wizard to trigger the mobile haptic tap. */
  onRevealPeak?: () => void;
  /** Controlled position (0-100). When provided, the slider treats the parent
   *  as the source of truth for drag position. When omitted, the slider keeps
   *  its own internal state — today's behaviour. Used by VariantCarousel to
   *  persist drag position across variant swaps. */
  position?: number;
  /** Fires whenever the user moves the handle. Required if `position` is supplied. */
  onPositionChange?: (next: number) => void;
  /** Pin the slider to a fixed CSS aspect-ratio (e.g. '4 / 3' or '16 / 9').
   *  When set, naturalSize detection is ignored — prevents the layout-shift
   *  bump that happens when switching between styles whose images have
   *  slightly different aspect ratios (e.g. on the public showcase, where
   *  consecutive picks would otherwise resize the slider container as each
   *  image loads). Default: dynamic aspect from naturalSize, falling back
   *  to 4 / 3 before load. */
  lockAspect?: string;
}

export function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  afterContent,
  beforeLabel = 'Before',
  afterLabel = 'Staged',
  className,
  autoReveal = false,
  fitParent = false,
  onRevealPeak,
  position: controlledPosition,
  onPositionChange,
  lockAspect,
}: BeforeAfterSliderProps) {
  const [internalPosition, setInternalPosition] = useState(autoReveal ? 0 : 50);
  const isControlled = controlledPosition !== undefined;
  const position = isControlled ? controlledPosition : internalPosition;
  const setPosition = useCallback(
    (next: number) => {
      if (isControlled) {
        onPositionChange?.(next);
      } else {
        setInternalPosition(next);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isControlled, onPositionChange],
  );
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  // capture the staged image's natural aspect ratio on load so the container
  // takes the true dimensions of the photo instead of forcing 4:3
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const hasInteractedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // Keep latest onRevealPeak in a ref so the reveal animation effect doesn't
  // tear down / restart when callers pass an inline arrow (parent re-renders
  // would otherwise reset the animation mid-sweep and double-fire the peak).
  const onRevealPeakRef = useRef(onRevealPeak);
  useEffect(() => {
    onRevealPeakRef.current = onRevealPeak;
  });

  const updatePosition = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.min(100, Math.max(0, (x / rect.width) * 100));
    setPosition(pct);
  }, [setPosition]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      hasInteractedRef.current = true;
      setIsDragging(true);
      updatePosition(e.clientX);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [updatePosition],
  );

  useEffect(() => {
    if (!autoReveal) return;
    let rafId = 0;
    let startTime: number | null = null;
    let cancelled = false;
    let peakFired = false;

    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

    const tick = (now: number) => {
      if (cancelled || hasInteractedRef.current) return;
      if (startTime === null) startTime = now;
      const t = now - startTime;

      if (t < 200) {
        setPosition(0);
      } else if (t < 1400) {
        // 0 → 100 over 1200ms with ease-out
        const p = easeOut((t - 200) / 1200);
        setPosition(p * 100);
      } else if (t < 1700) {
        if (!peakFired) {
          peakFired = true;
          onRevealPeakRef.current?.();
        }
        setPosition(100);
      } else if (t < 2000) {
        const p = easeOut((t - 1700) / 300);
        setPosition(100 - p * 50);
      } else {
        setPosition(50);
        return;
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  // setPosition is stable when uncontrolled (setInternalPosition identity is
  // stable). When controlled, the callback is re-created only when
  // isControlled/onPositionChange change — both are structural, not
  // per-render. Including setPosition here ensures the animation always
  // fires through the correct channel.
  }, [autoReveal, setPosition]);

  // When a caller locks the aspect (e.g. the onboarding reveal pinning the
  // bedroom to landscape 4/3 to match the empty-room screen), the fitParent
  // width math must derive from that locked ratio — NOT the image's natural
  // (portrait) ratio — or the box would size to the portrait source and the
  // room would visibly change shape between the empty and staged screens.
  const lockRatio = (() => {
    if (!lockAspect) return null;
    const [w, h] = lockAspect.split('/').map((n) => Number(n.trim()));
    return w > 0 && h > 0 ? w / h : null;
  })();
  const fitRatio = lockRatio ?? (naturalSize ? naturalSize.w / naturalSize.h : 4 / 3);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      updatePosition(e.clientX);
    },
    [isDragging, updatePosition],
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={cn(
        // touch-pan-y (not touch-none) so vertical page-scroll gestures still
        // pass through when the slider fills most of the viewport — e.g. a
        // 9:16 on a narrow phone. Horizontal pointer drag is still captured
        // by our own handlers for the comparison divider.
        'relative rounded-2xl overflow-hidden select-none touch-pan-y cursor-ew-resize border border-surface-border shadow-soft',
        className,
      )}
      style={{
        // lockAspect wins over naturalSize: gives callers (showcase) a
        // stable container regardless of how individual images vary, so
        // switching between styles doesn't bump the layout while images
        // load and naturalSize hops around.
        aspectRatio: lockAspect
          ? lockAspect
          : naturalSize
            ? `${naturalSize.w} / ${naturalSize.h}`
            : '4 / 3',
        ...(fitParent
          ? {
              // 100% references the slider's containing block width (so
              // wrappers with max-w-[640px] etc. are honoured). 100cqh
              // resolves against the nearest `container-type: size`
              // ancestor — the caller's job to provide one, typically the
              // flex area the slider should fit. Width = min(parent width,
              // parent height × aspect) keeps the slider inside both
              // budgets at the image's true aspect; maxHeight: 100cqh
              // clamps the derived height. Unlike 100vh this matches the
              // REAL available space, so mobile browser chrome can't
              // throw the math off.
              width: `min(100%, calc(100cqh * ${fitRatio}))`,
              maxHeight: '100cqh',
            }
          : {}),
      }}
    >
      {/* After layer (full, sits behind). Renders afterContent when provided,
          otherwise a Next/Image for the staged photo. Next/Image auto-resizes
          the original S3 photo to a viewport-appropriate WebP — order-of-
          magnitude smaller transfer than the raw 2-4 MB original. */}
      {(afterContent || afterSrc) && (
        afterContent ? (
          <div className="absolute inset-0">{afterContent}</div>
        ) : (
          <Image
            src={afterSrc!}
            alt={afterLabel}
            fill
            priority
            sizes="(max-width: 768px) 100vw, 800px"
            className="object-cover"
            draggable={false}
            onLoad={(e) => {
              const img = e.currentTarget as HTMLImageElement;
              if (img.naturalWidth && img.naturalHeight) {
                setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
              }
            }}
          />
        )
      )}

      {/* Before image (full size, clipped with clip-path) */}
      <Image
        src={beforeSrc}
        alt={beforeLabel}
        fill
        priority
        sizes="(max-width: 768px) 100vw, 800px"
        className="object-cover"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        draggable={false}
      />

      {/* Divider line */}
      <div
        className="absolute inset-y-0 w-0.5 bg-white shadow-lg"
        style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
      />

      {/* Drag handle */}
      <div
        onPointerEnter={() => setIsHovered(true)}
        onPointerLeave={() => setIsHovered(false)}
        className="absolute top-1/2 size-10 rounded-full bg-white shadow-elevated flex items-center justify-center"
        style={{
          left: `${position}%`,
          transform: `translateX(-50%) translateY(-50%) scale(${
            isDragging ? 1.1 : isHovered ? 1.05 : 1
          })`,
          transition: 'transform 150ms ease-out, box-shadow 150ms ease-out',
          boxShadow: position >= 95
            ? '0 0 24px 6px rgba(255, 255, 255, 0.5), 0 8px 24px rgba(15, 29, 46, 0.25)'
            : '0 8px 24px rgba(15, 29, 46, 0.25)',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M4 8h8M4 8l2-2M4 8l2 2M12 8l-2-2M12 8l-2 2"
            stroke="#0f1d2e"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Labels */}
      <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm text-xs font-medium text-ink-secondary px-3 py-1.5 rounded-lg pointer-events-none">
        {beforeLabel}
      </div>
      <div className="absolute bottom-4 right-4 bg-brand-navy/90 backdrop-blur-sm text-xs font-medium text-white px-3 py-1.5 rounded-lg pointer-events-none">
        {afterLabel}
      </div>
    </div>
  );
}
