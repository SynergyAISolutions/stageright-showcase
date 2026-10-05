'use client';

import { useCallback, useState } from 'react';

// Tiny helper for choice screens that auto-advance after a tap.
// Holds the picked value visually for `delayMs` so the user sees the
// selection register before the screen transitions out. 150ms is the
// sweet spot — short enough to feel responsive, long enough that the
// teal-fill animation reads.
export function usePickAndAdvance<T>(
  onAdvance: (value: T) => void,
  delayMs = 280,
) {
  const [pending, setPending] = useState<T | null>(null);

  const pick = useCallback(
    (value: T) => {
      if (pending !== null) return; // ignore double-tap during the beat
      setPending(value);
      setTimeout(() => {
        onAdvance(value);
        // Clear the local pending state after the parent's advance has
        // taken effect — prevents a flash of the previous selection if
        // this hook's owner stays mounted across the transition.
        setPending(null);
      }, delayMs);
    },
    [onAdvance, pending, delayMs],
  );

  return { pick, pending };
}
