'use client';

import type { Role } from '@/types';
import type { ReactNode } from 'react';
import { ChoiceRow } from './choice-row';
import { usePickAndAdvance } from './use-pick-and-advance';
import { Eyebrow } from './eyebrow';
import { OnboardingShell } from './onboarding-shell';

// Small line-art glyphs — currentColor strokes so they pick up the
// teal-tinted "selected" treatment from ChoiceRow.
const Icons = {
  solo: (
    <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-5">
      <circle cx="11" cy="8" r="3.5" />
      <path d="M4 19c0-3.5 3-6 7-6s7 2.5 7 6" strokeLinecap="round" />
    </svg>
  ),
  team: (
    <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-5">
      <circle cx="8" cy="9" r="3" />
      <circle cx="16" cy="9" r="2.5" />
      <path d="M2 18c0-3 2.5-5 6-5s6 2 6 5" strokeLinecap="round" />
      <path d="M14 18c0-2.5 1.5-4 4-4s4 1.5 4 4" strokeLinecap="round" />
    </svg>
  ),
  camera: (
    <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-5">
      <rect x="3" y="6.5" width="16" height="11" rx="2" />
      <circle cx="11" cy="12" r="3.2" />
      <path d="M8 6.5l1.2-2h3.6l1.2 2" strokeLinejoin="round" />
    </svg>
  ),
  key: (
    <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-5">
      <circle cx="7" cy="11" r="3.5" />
      <path d="M10.5 11h8M16 11v3M19 11v2" strokeLinecap="round" />
    </svg>
  ),
  home: (
    <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-5">
      <path d="M3 11l8-7 8 7v8a1 1 0 01-1 1h-4v-6h-6v6H4a1 1 0 01-1-1v-8z" strokeLinejoin="round" />
    </svg>
  ),
} as const;

const OPTIONS: { value: Role; label: string; icon: ReactNode }[] = [
  { value: 'solo-agent', label: 'Solo agent', icon: Icons.solo },
  { value: 'agency', label: 'Agency or team', icon: Icons.team },
  { value: 'photographer', label: 'Property photographer', icon: Icons.camera },
  { value: 'property-manager', label: 'Property manager', icon: Icons.key },
  { value: 'listing-my-own', label: 'Listing my own property', icon: Icons.home },
];

export function RolePicker({
  selected,
  onPick,
  onBack,
}: {
  selected: Role | null;
  onPick: (role: Role) => void;
  onBack: () => void;
}) {
  const { pick, pending } = usePickAndAdvance<Role>(onPick);
  const active = pending ?? selected;

  return (
    <OnboardingShell cta={null}>
      <div className="w-full max-w-xl lg:max-w-2xl flex flex-col items-center text-center">
        <Eyebrow>About you</Eyebrow>
        <h1 className="mt-5 sm:mt-7 lg:mt-9 font-display text-sr-ink text-[32px] sm:text-[42px] lg:text-[56px] leading-[1.02] tracking-[-0.02em]">
          What do you do?
        </h1>

        <ul role="radiogroup" aria-label="Your role" className="mt-10 w-full flex flex-col gap-3">
          {OPTIONS.map((o) => (
            <li key={o.value}>
              <ChoiceRow
                icon={o.icon}
                label={o.label}
                selected={active === o.value}
                onPick={() => pick(o.value)}
              />
            </li>
          ))}
        </ul>
      </div>
    </OnboardingShell>
  );
}
