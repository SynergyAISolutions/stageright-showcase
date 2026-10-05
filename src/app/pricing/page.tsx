import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { isWebPaymentAllowedServer } from '@/lib/billing/host-gate-server';
import { AppHeader } from '@/components/layout/app-header';
import { PackTiles } from '@/components/billing/pack-tiles';

export const dynamic = 'force-dynamic';

export default async function PricingPage() {
  const session = await getSession();
  if (!session) redirect('/onboarding');
  if (!isWebPaymentAllowedServer()) redirect('/dashboard');

  return (
    <div className="h-[100dvh] bg-sr-cream flex flex-col overflow-hidden">
      <AppHeader />
      {/* Centred in whatever height remains under the header. h-[100dvh] +
          overflow-hidden on the wrapper guarantees no page-level scrolling;
          the pricing block is sized to fit common viewports without
          stretching. */}
      <main className="flex-1 min-h-0 flex items-center justify-center px-4 sm:px-8 py-6 sm:py-10">
        <div className="w-full max-w-5xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-9 sm:mb-14">
            <span className="inline-flex items-center gap-3 mb-3 sm:mb-4 font-mono text-[11px] sm:text-[12px] font-semibold uppercase tracking-[0.2em] text-sr-terra">
              <span className="size-1.5 rounded-full bg-sr-terra" aria-hidden />
              Credit packs
            </span>
            <h1 className="font-display text-[clamp(26px,4.4vw,48px)] text-sr-ink leading-[1.04] tracking-[-0.025em]">
              Top up your <span className="italic text-sr-terra">credits</span>.
            </h1>
            <p className="mt-3 sm:mt-4 text-[13px] sm:text-[16px] text-sr-ink/70 max-w-md mx-auto leading-[1.5]">
              Pick a pack. Credits never expire.
            </p>
          </div>

          <PackTiles returnTo="/dashboard" />
        </div>
      </main>
    </div>
  );
}
