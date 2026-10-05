'use client';

import type { ListingIntent, PropertyType, Role } from '@/types';
import { ChoiceRow } from './choice-row';
import { usePickAndAdvance } from './use-pick-and-advance';
import { Eyebrow } from './eyebrow';
import { OnboardingShell } from './onboarding-shell';

// Combined intent + type pivot. One screen, three paths:
//   - sell        → residential sale flow (Volume → Bombshell[sale] → Bridge → HowItWorks → Upload[any])
//   - lease       → residential lease flow (Volume → Bombshell[lease] → Bridge → HowItWorks → Upload[unfurnished])
//   - commercial  → CommercialNoticeScreen (skips Volume + the See act)
//
// Folding intent and type into one question keeps the flow tight (one screen,
// not two). The three options are mutually exclusive in product reality —
// nobody is both selling commercial and renting residential — so a single
// pick covers both axes for now.
export type ListingTypeChoice =
  | { intent: 'sell'; type: 'residential' }
  | { intent: 'lease'; type: 'residential' }
  | { intent: 'lease'; type: 'commercial' }; // commercial is presented as a single option; intent is implicit

interface Props {
  selected: { intent: ListingIntent | null; type: PropertyType | null };
  role?: Role | null;
  onPick: (choice: ListingTypeChoice) => void;
  onBack: () => void;
}

type RowKey = 'sell-home' | 'lease-home' | 'commercial';

export function ListingTypeScreen({ selected, role, onPick, onBack }: Props) {
  const current: RowKey | null =
    selected.type === 'commercial'
      ? 'commercial'
      : selected.intent === 'sell'
        ? 'sell-home'
        : selected.intent === 'lease'
          ? 'lease-home'
          : null;

  const { pick, pending } = usePickAndAdvance<RowKey>((key) => {
    if (key === 'sell-home') onPick({ intent: 'sell', type: 'residential' });
    else if (key === 'lease-home') onPick({ intent: 'lease', type: 'residential' });
    else onPick({ intent: 'lease', type: 'commercial' });
  });

  const active = pending ?? current;

  // Photographers don't "list" — they shoot. Reframe the wording without
  // changing the underlying choice values or intent routing.
  const isPhotographer = role === 'photographer';
  const headline = isPhotographer ? 'What do you mostly shoot?' : 'What are you listing?';
  const sellLabel = isPhotographer ? 'Homes for sale' : 'Homes to sell';
  const leaseLabel = isPhotographer ? 'Rentals' : 'Homes to rent out';
  const commercialLabel = isPhotographer ? 'Commercial' : 'Commercial property';

  return (
    <OnboardingShell cta={null}>
      <div className="w-full max-w-xl lg:max-w-2xl flex flex-col items-center text-center">
        <Eyebrow>About your listings</Eyebrow>
        <h1 className="mt-5 sm:mt-7 lg:mt-9 font-display text-sr-ink text-[32px] sm:text-[42px] lg:text-[56px] leading-[1.02] tracking-[-0.02em]">
          {headline}
        </h1>

        <ul role="radiogroup" aria-label={headline} className="mt-10 w-full flex flex-col gap-3">
          <li>
            <ChoiceRow
              icon={
                // House + a "for sale" pennant — visually distinct from
                // the rent icon below.
                <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-5">
                  <path d="M3 11l8-7 8 7v8a1 1 0 01-1 1h-4v-5h-6v5H4a1 1 0 01-1-1v-8z" strokeLinejoin="round" />
                  <path d="M14 4l4 1.5L14 7v-3z" fill="currentColor" strokeLinejoin="round" />
                </svg>
              }
              label={sellLabel}
              selected={active === 'sell-home'}
              onPick={() => pick('sell-home')}
            />
          </li>
          <li>
            <ChoiceRow
              icon={
                // House + key — clearly the rental glyph.
                <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-5">
                  <path d="M3 10l8-7 8 7v9a1 1 0 01-1 1h-5v-5h-4v5H4a1 1 0 01-1-1v-9z" strokeLinejoin="round" />
                  <circle cx="14.5" cy="11.5" r="1.5" />
                  <path d="M16 11.5h2.5M17.5 11.5v1.5" strokeLinecap="round" />
                </svg>
              }
              label={leaseLabel}
              selected={active === 'lease-home'}
              onPick={() => pick('lease-home')}
            />
          </li>
          <li>
            <ChoiceRow
              icon={
                <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-5">
                  <rect x="3.5" y="4" width="15" height="16" rx="1" />
                  <path d="M7 8h2M7 12h2M7 16h2M13 8h2M13 12h2M13 16h2" strokeLinecap="round" />
                </svg>
              }
              label={commercialLabel}
              selected={active === 'commercial'}
              onPick={() => pick('commercial')}
            />
          </li>
        </ul>
      </div>
    </OnboardingShell>
  );
}
