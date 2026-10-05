'use client';

import { useState } from 'react';
import { useIsWebPaymentAllowed } from '@/lib/billing/host-gate-client';
import { PACKS, PACK_ORDER, type PackId } from '@/lib/stripe/products';

export function PackTiles({ returnTo, className }: { returnTo: string; className?: string }) {
  const [pendingPack, setPendingPack] = useState<PackId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const allowed = useIsWebPaymentAllowed();

  if (!allowed) return null;

  async function buy(packId: PackId) {
    if (pendingPack) return;
    setError(null);
    setPendingPack(packId);
    try {
      const r = await fetch('/api/checkout/create-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId, returnTo }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setError(data.error ?? 'Could not start checkout. Try again in a moment.');
        return;
      }
      const data = await r.json();
      if (!data.url) {
        setError('Checkout did not return a URL. Try again in a moment.');
        setPendingPack(null);
        return;
      }
      // Don't clear pendingPack on success — the browser is about to navigate
      // away. Clearing would re-enable buttons for ~100ms and let a fast
      // double-click fire a second checkout session before nav lands.
      window.location.href = data.url;
    } catch {
      setError('Network error. Try again.');
      setPendingPack(null);
    }
  }

  return (
    <div className={className}>
      {/* 2x2 on mobile, 4-up on desktop. Compact padding + tighter
          typography on mobile so the entire card stack fits under
          the heading without page-level scrolling. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
        {PACK_ORDER.map((id) => {
          const p = PACKS[id];
          const isPending = pendingPack === id;
          const perCredit = (p.priceAud / p.credits).toFixed(2);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => buy(p.id)}
              disabled={pendingPack !== null}
              className="group relative text-left rounded-xl sm:rounded-2xl border border-sr-hairline bg-sr-surface px-4 py-4 sm:px-6 sm:py-7 transition-all duration-300 hover:-translate-y-1 hover:border-sr-terra/45 hover:shadow-[0_30px_60px_-28px_rgba(31,53,57,0.32)] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sr-terra/40"
            >
              <div className="font-mono text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.18em] text-sr-ink-mute">
                {p.label}
              </div>
              <div className="mt-2 sm:mt-3 font-display text-[26px] sm:text-[44px] text-sr-ink leading-none tracking-[-0.02em]">
                ${p.priceAud}
                <span className="font-body text-[11px] sm:text-[13px] font-normal text-sr-ink-mute ml-1 sm:ml-1.5 align-baseline">
                  AUD
                </span>
              </div>
              <div className="mt-1.5 sm:mt-2 text-[12px] sm:text-[13px] text-sr-ink-soft">{p.credits} credits</div>

              {/* Per-credit price anchor. Smaller breakpoint dials it down. */}
              <div className="mt-3 sm:mt-5 pt-3 sm:pt-4 border-t border-sr-hairline font-mono text-[10px] sm:text-[12px] font-medium uppercase tracking-[0.12em] sm:tracking-[0.14em] text-sr-terra">
                ${perCredit} / credit
              </div>

              {isPending && (
                <div className="mt-2 text-[10px] sm:text-[11px] text-sr-terra animate-pulse">Redirecting…</div>
              )}
            </button>
          );
        })}
      </div>
      {error && (
        <p className="mt-3 text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2">
          {error}
        </p>
      )}
    </div>
  );
}
