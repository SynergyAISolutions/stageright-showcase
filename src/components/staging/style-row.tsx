'use client';

import Image from 'next/image';
import { STYLE_PALETTES, STYLE_TAGLINES, styleToFilename, type StagingStyle } from '@/lib/ai/prompts';
import { cn } from '@/lib/utils/cn';

// Slugs for every folder that may exist under public/style-thumbnails/.
// Add new slugs here when a new room is queued; a room only appears on the
// landing page once it is added to AVAILABLE_ROOMS in style-showcase.tsx.
export const ROOM_SLUGS = [
  'living',
  'bedroom',
  'dining-room',
  'master-suite',
  'kitchen',
  'bathroom',
  'home-office',
  'kids-room',
  'studio',
  'guest-room',
  'outdoor',
  'living-room', // pure living-room (no dining zone) — distinct from combined 'living' folder
  'bedroom-bathroom', // combo: a bedroom that opens onto / shares with a bathroom
] as const;

export type ThumbnailRoom = (typeof ROOM_SLUGS)[number];

type Size = 'compact' | 'showcase';

const SIZE_STYLES: Record<Size, { thumb: string; name: string; row: string }> = {
  compact: {
    thumb: 'size-14 sm:size-16',
    name: 'text-base sm:text-lg',
    row: 'p-2 gap-3',
  },
  showcase: {
    thumb: 'size-20 sm:size-24',
    name: 'text-lg sm:text-xl',
    row: 'p-3 gap-4',
  },
};

export function StyleRow({
  style,
  selected,
  onPick,
  roomCategory = 'living',
  size = 'compact',
  thumbnailSrc,
}: {
  style: StagingStyle;
  selected: boolean;
  onPick: () => void;
  roomCategory?: ThumbnailRoom;
  size?: Size;
  /** Optional override for the row's thumbnail src. Used by the public
   *  landing showcase to display admin-picked images instead of the
   *  legacy /style-thumbnails/{room}/{style}.jpg path. */
  thumbnailSrc?: string;
}) {
  const s = SIZE_STYLES[size];
  const palette = STYLE_PALETTES[style];
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      className={cn(
        'group w-full flex items-center rounded-xl border transition-all duration-150 active:scale-[0.995] text-left',
        s.row,
        selected
          ? 'border-brand-teal bg-brand-teal/5 shadow-soft'
          : 'border-surface-border bg-white hover:border-ink-muted',
      )}
    >
      <span className={cn('flex-shrink-0 rounded-lg overflow-hidden bg-surface-secondary relative', s.thumb)}>
        <Image
          src={thumbnailSrc ?? `/style-thumbnails/${roomCategory}/${styleToFilename(style)}.jpg`}
          alt=""
          fill
          sizes="(max-width: 640px) 64px, 96px"
          style={{ objectPosition: roomCategory === 'bedroom' ? 'center 55%' : 'center center' }}
          className="object-cover"
        />
      </span>
      <span className="flex-1 min-w-0">
        <span className={cn('block font-heading text-brand-navy leading-tight tracking-tight', s.name)}>
          {style}
        </span>
        <span className="block text-xs text-ink-muted mt-0.5 truncate">
          {STYLE_TAGLINES[style]}
        </span>
      </span>
      <span className="flex-shrink-0 flex items-center gap-2">
        <span className="hidden sm:flex gap-1" aria-hidden>
          {palette.map((c, i) => (
            <span
              key={i}
              className="block size-2.5 rounded-full ring-1 ring-black/5"
              style={{ backgroundColor: c }}
            />
          ))}
        </span>
        {selected && (
          <span className="size-6 rounded-full bg-brand-teal text-white grid place-items-center shadow-soft" aria-hidden>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M2.5 6l2.5 2.5L9.5 4"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        )}
      </span>
    </button>
  );
}
