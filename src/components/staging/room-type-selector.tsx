'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils/cn';

export const ROOM_TYPES = [
  'Living Room',
  'Dining Room',
  'Bedroom',
  'Master Suite',
  'Kitchen',
  'Bathroom',
  'Home Office',
  'Kids Room',
  'Studio',
  'Guest Room',
  'Outdoor',
] as const;

export type RoomType = (typeof ROOM_TYPES)[number];

const ROOM_ICONS: Record<RoomType, JSX.Element> = {
  'Living Room': (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" className="size-5">
      <rect x="3" y="8" width="14" height="8" rx="2" />
      <path d="M5 8V6a2 2 0 012-2h6a2 2 0 012 2v2" />
    </svg>
  ),
  'Dining Room': (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" className="size-5">
      <circle cx="10" cy="10" r="5" />
      <path d="M10 5v10M5 10h10" />
    </svg>
  ),
  'Bedroom': (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" className="size-5">
      <rect x="2" y="9" width="16" height="6" rx="1" />
      <path d="M4 9V7a1 1 0 011-1h4a1 1 0 011 1v2M4 15v1M16 15v1" />
    </svg>
  ),
  'Master Suite': (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" className="size-5">
      <rect x="2" y="9" width="16" height="6" rx="1" />
      <path d="M4 9V7a1 1 0 011-1h10a1 1 0 011 1v2M10 6v3M4 15v1M16 15v1" />
    </svg>
  ),
  'Kitchen': (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" className="size-5">
      <rect x="3" y="4" width="14" height="12" rx="1" />
      <path d="M3 8h14M7 12h2M7 16v-4" />
    </svg>
  ),
  'Bathroom': (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" className="size-5">
      <path d="M3 10h14v3a3 3 0 01-3 3H6a3 3 0 01-3-3v-3z" />
      <path d="M5 10V6a2 2 0 012-2h1M17 14v2M3 14v2" />
    </svg>
  ),
  'Home Office': (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" className="size-5">
      <rect x="4" y="4" width="12" height="8" rx="1" />
      <path d="M7 16h6M10 12v4" />
    </svg>
  ),
  'Kids Room': (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" className="size-5">
      <path d="M6 14l4-8 4 8" />
      <circle cx="10" cy="6" r="2" />
    </svg>
  ),
  'Studio': (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" className="size-5">
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <path d="M3 10h14M10 3v14" />
    </svg>
  ),
  'Guest Room': (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" className="size-5">
      <rect x="3" y="9" width="14" height="6" rx="1" />
      <path d="M5 9V7a1 1 0 011-1h3a1 1 0 011 1v2M5 15v1M15 15v1" />
    </svg>
  ),
  'Outdoor': (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" className="size-5">
      <path d="M10 3v14M3 10h14" />
      <circle cx="10" cy="10" r="7" />
    </svg>
  ),
};

interface RoomTypeSelectorProps {
  selected: RoomType[];
  onToggle: (type: RoomType) => void;
  className?: string;
}

export function RoomTypeSelector({ selected, onToggle, className }: RoomTypeSelectorProps) {
  return (
    <ul className={cn('space-y-2', className)}>
      {ROOM_TYPES.map((type) => {
        const isActive = selected.includes(type);
        return (
          <li key={type}>
            <button
              type="button"
              onClick={() => onToggle(type)}
              aria-pressed={isActive}
              className={cn(
                'group w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all duration-150 active:scale-[0.99] text-left',
                isActive
                  ? 'bg-sr-terra/[0.10] border-sr-terra/40 text-sr-ink shadow-[0_4px_16px_-8px_rgba(199,111,78,0.35)]'
                  : 'bg-white border border-sr-ink/[0.10] text-sr-ink hover:border-sr-terra/40 hover:bg-sr-terra/[0.04]',
              )}
            >
              <span
                className={cn(
                  'flex-shrink-0 size-10 rounded-lg grid place-items-center transition-colors',
                  isActive ? 'bg-sr-terra/10 text-sr-terra' : 'bg-sr-cream text-sr-ink-mute',
                )}
              >
                {ROOM_ICONS[type]}
              </span>
              <span className="flex-1 font-medium text-sr-ink">{type}</span>
              {isActive && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="flex-shrink-0 size-6 rounded-full bg-sr-terra text-white grid place-items-center shadow-soft"
                  aria-hidden
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 6l2.5 2.5L9.5 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </motion.span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
