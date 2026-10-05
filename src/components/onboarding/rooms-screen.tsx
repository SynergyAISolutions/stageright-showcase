'use client';

import { ROOM_TYPES, type RoomType } from '@/components/staging/room-type-selector';
import { ChoiceTile } from './choice-tile';
import { Eyebrow } from './eyebrow';
import { OnboardingShell } from './onboarding-shell';
import { usePickAndAdvance } from './use-pick-and-advance';

// Compact icon set for the onboarding tiles. Each is a one-line currentColor
// stroke so it picks up the teal-on-select treatment from ChoiceTile.
const ICONS: Record<RoomType, JSX.Element> = {
  'Living Room': (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" className="size-5">
      <rect x="3" y="8" width="14" height="8" rx="2" />
      <path d="M5 8V6a2 2 0 012-2h6a2 2 0 012 2v2" />
    </svg>
  ),
  'Dining Room': (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" className="size-5">
      <circle cx="10" cy="10" r="5" />
      <path d="M10 5v10M5 10h10" />
    </svg>
  ),
  Bedroom: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" className="size-5">
      <rect x="2" y="9" width="16" height="6" rx="1" />
      <path d="M4 9V7a1 1 0 011-1h4a1 1 0 011 1v2" />
    </svg>
  ),
  'Master Suite': (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" className="size-5">
      <rect x="2" y="9" width="16" height="6" rx="1" />
      <path d="M4 9V7a1 1 0 011-1h10a1 1 0 011 1v2M10 6v3" />
    </svg>
  ),
  Kitchen: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" className="size-5">
      <rect x="3" y="4" width="14" height="12" rx="1" />
      <path d="M3 8h14M7 12h2M7 16v-4" />
    </svg>
  ),
  Bathroom: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" className="size-5">
      <path d="M3 10h14v3a3 3 0 01-3 3H6a3 3 0 01-3-3v-3z" />
      <path d="M5 10V6a2 2 0 012-2h1" />
    </svg>
  ),
  'Home Office': (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" className="size-5">
      <rect x="4" y="4" width="12" height="8" rx="1" />
      <path d="M7 16h6M10 12v4" />
    </svg>
  ),
  'Kids Room': (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" className="size-5">
      <path d="M6 14l4-8 4 8" />
      <circle cx="10" cy="6" r="2" />
    </svg>
  ),
  Studio: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" className="size-5">
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <path d="M3 10h14M10 3v14" />
    </svg>
  ),
  'Guest Room': (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" className="size-5">
      <rect x="3" y="9" width="14" height="6" rx="1" />
      <path d="M5 9V7a1 1 0 011-1h3a1 1 0 011 1v2" />
    </svg>
  ),
  Outdoor: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" className="size-5">
      <path d="M10 3v14M3 10h14" />
      <circle cx="10" cy="10" r="7" />
    </svg>
  ),
};

interface RoomsScreenProps {
  activeRoomType: RoomType | null;
  onPick: (type: RoomType) => void;
  onBack: () => void;
}

export function RoomsScreen({ activeRoomType, onPick, onBack }: RoomsScreenProps) {
  const { pick, pending } = usePickAndAdvance<RoomType>(onPick);
  const active = pending ?? activeRoomType;

  return (
    <OnboardingShell cta={null}>
      <div className="w-full max-w-2xl lg:max-w-3xl flex flex-col items-center text-center">
        <Eyebrow>About the room</Eyebrow>
        <h1 className="mt-5 sm:mt-7 lg:mt-9 font-display text-sr-ink text-[32px] sm:text-[42px] lg:text-[56px] leading-[1.02] tracking-[-0.02em]">
          What kind of room?
        </h1>

        <div
          role="radiogroup"
          aria-label="Room type"
          className="mt-10 w-full grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-3"
        >
          {ROOM_TYPES.map((type) => (
            <div key={type}>
              <ChoiceTile
                icon={ICONS[type]}
                label={type}
                selected={active === type}
                onPick={() => pick(type)}
              />
            </div>
          ))}
        </div>
      </div>
    </OnboardingShell>
  );
}
