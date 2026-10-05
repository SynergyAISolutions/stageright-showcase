'use client';

import { type StagingStyle } from '@/lib/ai/prompts';

interface EditorialNameplateProps {
  style: StagingStyle;
  roomTypes: string[];
  /** Optional address line shown as a small caps eyebrow above the title. */
  addressLabel?: string;
  className?: string;
}

/**
 * Editorial reveal/result nameplate. Address eyebrow (optional) + Fraunces
 * &quot;Style · <em>Room</em>&quot; headline with terra italic on the room name.
 */
export function EditorialNameplate({
  style,
  roomTypes,
  addressLabel,
  className,
}: EditorialNameplateProps) {
  const roomLabel = roomTypes.length > 0 ? roomTypes.join(' · ') : 'Room';
  return (
    <div className={`px-5 sm:px-6 pt-4 pb-3 text-center sm:text-left ${className ?? ''}`}>
      {addressLabel && (
        <p className="text-[9px] sm:text-[10px] tracking-[0.10em] uppercase text-sr-ink-mute font-semibold mb-1">
          {addressLabel}
        </p>
      )}
      <h1 className="font-display text-xl sm:text-2xl lg:text-[28px] leading-[1.05] tracking-[-0.02em] text-sr-ink font-normal">
        {style} · <em className="text-sr-terra italic">{roomLabel}</em>
      </h1>
    </div>
  );
}
