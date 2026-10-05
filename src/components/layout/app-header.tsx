'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useIsWebPaymentAllowed } from '@/lib/billing/host-gate-client';
import { CreditBalance } from '@/components/staging/credit-balance';
import { UserMenu } from '@/components/dashboard/user-menu';

/**
 * Shared logged-in header. Logo (= "home" link to dashboard), credit
 * balance, user menu. No tabbed nav — listings IS the dashboard, and
 * staging always happens inside a listing context, so there's no need
 * for top-level Listings or Stage tabs.
 *
 * Used on dashboard, listing detail, reveal page. NOT used on the
 * staging wait state (immersive design) or onboarding (its own chrome).
 */
export function AppHeader() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const allowed = useIsWebPaymentAllowed();

  return (
    <header className="bg-sr-cream border-b border-sr-hairline sticky top-0 z-40">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 h-14 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Image
            src="/icons/android/logo-mark-light.png"
            alt="StageRight"
            width={40}
            height={40}
            priority
            className="size-9 object-contain"
          />
          <span className="font-display text-lg text-sr-ink tracking-tight hidden sm:inline">
            StageRight
          </span>
        </Link>

        {user && (
          <div className="flex items-center gap-3 sm:gap-5">
            {allowed ? (
              <Link href="/pricing" aria-label="Buy credits" className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sr-terra/40">
                <CreditBalance credits={user.creditsRemaining ?? 0} plan={user.plan ?? 'free'} />
              </Link>
            ) : (
              <CreditBalance credits={user.creditsRemaining ?? 0} plan={user.plan ?? 'free'} />
            )}
            <UserMenu
              name={user.name || 'Account'}
              email={user.email || ''}
              plan={user.plan || 'free'}
              hasStripeCustomer={user.hasStripeCustomer ?? false}
              onLogout={async () => {
                await logout();
                router.push('/');
              }}
            />
          </div>
        )}
      </div>
    </header>
  );
}
