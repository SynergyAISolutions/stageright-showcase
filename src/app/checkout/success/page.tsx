'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';

// Short polling window — refresh auth a few times to give the webhook a moment
// to land, then bounce regardless. The webhook is the source of truth and runs
// asynchronously; if it hasn't fired by the time we bounce, the dashboard's
// own auth fetch will pick up the new balance soon after.
const TOTAL_MS = 4000;
const POLL_MS = 1500;

function SuccessInner() {
  const router = useRouter();
  const params = useSearchParams();
  // Validate return_to as a relative path before using it for navigation —
  // an attacker-supplied absolute URL would let /checkout/success?return_to=https://evil
  // become an open redirect via router.push.
  const rawReturnTo = params.get('return_to') ?? '/dashboard';
  const returnTo = rawReturnTo.startsWith('/') ? rawReturnTo : '/dashboard';
  const { refresh } = useAuth();
  const [bouncing, setBouncing] = useState(false);

  // Refresh auth state a couple of times during the confirming beat so any
  // currently-cached balance gets bumped before we land on the dashboard.
  useEffect(() => {
    const interval = setInterval(() => { void refresh(); }, POLL_MS);
    const finish = setTimeout(() => {
      clearInterval(interval);
      setBouncing(true);
      router.push(returnTo);
    }, TOTAL_MS);
    return () => { clearInterval(interval); clearTimeout(finish); };
  }, [refresh, router, returnTo]);

  return (
    <div className="min-h-[100dvh] bg-sr-cream flex items-center justify-center px-6">
      <div className="max-w-sm w-full text-center">
        <div className="mx-auto size-10 border-2 border-sr-terra border-t-transparent rounded-full animate-spin" />
        <h1 className="mt-6 font-display text-2xl text-sr-ink">
          {bouncing ? 'Credits added.' : 'Confirming your purchase…'}
        </h1>
        <p className="mt-2 text-sm text-sr-ink-mute">
          {bouncing ? 'Sending you back…' : 'Just a couple of seconds.'}
        </p>
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-sr-cream" />}>
      <SuccessInner />
    </Suspense>
  );
}
