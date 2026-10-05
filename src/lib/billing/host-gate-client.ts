'use client';

/**
 * Client-side host detection. Reads the same `sr_host` cookie via document.cookie.
 *
 * The hook returns true on initial render (SSR-safe default) and updates after
 * mount once the cookie can be read. Components that key visible UI off this
 * value will briefly flash the "web" state before flipping to "twa" inside the
 * future wrapper — acceptable since the wrapper user lands on a fully-loaded
 * page within ms of cookie read, and there's nothing for them to interact with
 * during that flash.
 */
import { useEffect, useState } from 'react';

export function useIsWebPaymentAllowed(): boolean {
  const [allowed, setAllowed] = useState(true);
  useEffect(() => {
    const isTwa = typeof document !== 'undefined' &&
      document.cookie.split('; ').some((c) => c === 'sr_host=twa');
    if (isTwa) setAllowed(false);
  }, []);
  return allowed;
}
