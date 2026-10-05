'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function CancelInner() {
  const router = useRouter();
  const params = useSearchParams();
  // Open-redirect guard: only honour relative return_to values.
  const rawReturnTo = params.get('return_to') ?? '/dashboard';
  const returnTo = rawReturnTo.startsWith('/') ? rawReturnTo : '/dashboard';

  useEffect(() => {
    router.replace(returnTo);
  }, [router, returnTo]);

  return (
    <div className="min-h-[100dvh] bg-sr-cream flex items-center justify-center px-6">
      <p className="text-sm text-sr-ink-mute">Returning…</p>
    </div>
  );
}

export default function CheckoutCancelPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-sr-cream" />}>
      <CancelInner />
    </Suspense>
  );
}
