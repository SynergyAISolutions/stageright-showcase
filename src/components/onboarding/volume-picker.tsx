'use client';

import type { ListingsPerMonth, Role } from '@/types';
import { ChoiceRow } from './choice-row';
import { Eyebrow } from './eyebrow';
import { OnboardingShell } from './onboarding-shell';
import { usePickAndAdvance } from './use-pick-and-advance';

// Tight label set — the question is "how many", the rows answer "how many".
// Even, scannable number ranges across all four (the earlier mix of
// vocab + numbers — "A couple" / "Six to ten" — read as two different
// kinds of answer). The bombshell keeps prose phrasing ("a handful a
// month") because that reads naturally inside a sentence; the picker is
// where the rows must line up.
const OPTIONS: { value: ListingsPerMonth; label: string }[] = [
  { value: '0-2', label: '1–2' },
  { value: '3-5', label: '3–5' },
  { value: '6-10', label: '6–10' },
  { value: '11+', label: '11+' },
];

export function VolumePicker({
  selected,
  role,
  onPick,
  onBack,
}: {
  selected: ListingsPerMonth | null;
  role: Role | null;
  onPick: (v: ListingsPerMonth) => void;
  onBack: () => void;
}) {
  const { pick, pending } = usePickAndAdvance<ListingsPerMonth>(onPick);
  const active = pending ?? selected;

  const options = OPTIONS;

  const headline =
    role === 'listing-my-own'
      ? 'And how many properties?'
      : role === 'photographer'
        ? 'And how many shoots a month?'
        : 'And how many listings a month?';

  return (
    <OnboardingShell cta={null}>
      <div className="w-full max-w-xl lg:max-w-2xl flex flex-col items-center text-center">
        <Eyebrow>About your volume</Eyebrow>
        <h1 className="mt-5 sm:mt-7 lg:mt-9 font-display text-sr-ink text-[32px] sm:text-[42px] lg:text-[56px] leading-[1.02] tracking-[-0.02em]">
          {headline}
        </h1>

        <ul role="radiogroup" aria-label="Listings per month" className="mt-10 w-full flex flex-col gap-3">
          {options.map((o) => (
            <li key={o.value}>
              <ChoiceRow
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
