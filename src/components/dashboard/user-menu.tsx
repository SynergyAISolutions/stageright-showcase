'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { PLANS, ADMIN_EMAILS } from '@/types';

interface UserMenuProps {
  name: string;
  email: string;
  plan: string;
  hasStripeCustomer: boolean;
  onLogout: () => void | Promise<void>;
}

export function UserMenu({ name, email, plan, hasStripeCustomer, onLogout }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2400);
    return () => clearTimeout(t);
  }, [flash]);

  const planConfig = PLANS[plan as keyof typeof PLANS] || PLANS.free;
  // Only surface a plan badge when it's a real, recurring commitment:
  // an active monthly subscription, or the admin account. Free users
  // and one-time credit-pack buyers have no "plan" in a credit-based
  // model — showing "Free plan" to someone who has paid for packs was
  // misleading. They just see their credit balance instead.
  const isSubscription = planConfig.isMonthly;
  const isAdminPlan = plan === 'admin';
  const showPlanBadge = isSubscription || isAdminPlan;
  const planBadgeLabel = isAdminPlan
    ? 'Admin'
    : `${planConfig.name} · auto-refills`;
  const initials =
    name
      .split(' ')
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-expanded={open}
        aria-haspopup="menu"
        className="size-9 rounded-full bg-sr-ink text-white text-xs font-medium tracking-wide flex items-center justify-center hover:bg-sr-ink-2 transition-colors active:scale-95 ring-2 ring-transparent focus:ring-sr-terra focus:outline-none"
      >
        {initials}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, scale: 0.96, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -6 }}
            transition={{ duration: 0.14 }}
            className="absolute right-0 top-full mt-2 w-64 rounded-xl bg-white border border-sr-hairline shadow-[0_18px_48px_-12px_rgba(31,53,57,0.18)] overflow-hidden origin-top-right z-50"
          >
            {/* Identity header */}
            <div className="px-4 py-3 border-b border-sr-hairline">
              <p className="font-display text-base text-sr-ink truncate leading-tight">{name}</p>
              <p className="text-xs text-sr-ink-mute truncate mt-0.5">{email}</p>
              {showPlanBadge && (
                <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-sr-terra bg-sr-terra/[0.12] border border-sr-terra/25 px-2 py-0.5 rounded-full">
                  <span className="size-1.5 rounded-full bg-sr-terra" />
                  {planBadgeLabel}
                </div>
              )}
            </div>

            {/* Items */}
            <div className="py-1">
              <Link
                href="/pricing"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-sr-ink hover:bg-sr-cream transition-colors"
              >
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="text-sr-ink-mute">
                  <circle cx="7.5" cy="7.5" r="6" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M7.5 4v3.5l2 1.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                Buy credits
              </Link>
              <button
                role="menuitem"
                onClick={async () => {
                  if (!hasStripeCustomer) return;
                  try {
                    const r = await fetch('/api/billing/portal', { method: 'POST' });
                    if (!r.ok) {
                      setFlash('Could not open billing portal.');
                      return;
                    }
                    const data = await r.json();
                    if (data.url) {
                      window.location.href = data.url;
                    } else {
                      setFlash('Billing portal returned no URL.');
                    }
                  } catch {
                    setFlash('Network error opening billing portal.');
                  }
                }}
                disabled={!hasStripeCustomer}
                className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm text-sr-ink hover:bg-sr-cream transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={!hasStripeCustomer ? 'Make a purchase first to access billing.' : undefined}
              >
                <span className="flex items-center gap-2.5">
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="text-sr-ink-mute">
                    <rect x="1.5" y="3" width="12" height="9" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M1.5 6h12" stroke="currentColor" strokeWidth="1.2" />
                  </svg>
                  Billing &amp; invoices
                </span>
                {!hasStripeCustomer && (
                  <span className="text-[10px] font-medium text-sr-ink-mute italic">No purchases yet</span>
                )}
              </button>
            </div>

            {flash && (
              <div className="px-4 pb-2 -mt-1">
                <p className="text-[11px] text-sr-ink-mute italic">{flash}</p>
              </div>
            )}

            {/* Listing copy */}
            <div className="border-t border-sr-hairline py-1">
              <Link
                href="/dashboard/listing-copy"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-sr-ink hover:bg-sr-cream transition-colors"
              >
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="text-sr-ink-mute">
                  <rect x="2" y="1.5" width="11" height="12" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M4.5 5h6M4.5 7.5h6M4.5 10h3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                Listing copy
              </Link>
            </div>

            {ADMIN_EMAILS.includes(email.toLowerCase()) && (
              <div className="border-t border-sr-hairline py-1">
                <p className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-sr-ink-mute">Admin</p>
                <Link
                  href="/admin/compare"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-sr-ink hover:bg-sr-cream transition-colors"
                >
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="text-sr-ink-mute">
                    <rect x="1.5" y="2.5" width="5" height="10" rx="1" stroke="currentColor" strokeWidth="1.2" />
                    <rect x="8.5" y="2.5" width="5" height="10" rx="1" stroke="currentColor" strokeWidth="1.2" />
                  </svg>
                  Compare models
                </Link>
                <Link
                  href="/admin/reviews"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-sr-ink hover:bg-sr-cream transition-colors"
                >
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="text-sr-ink-mute">
                    <path d="M2.5 4.5h10M2.5 7.5h10M2.5 10.5h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                  Review queue
                </Link>
                <Link
                  href="/admin/landing-images"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-sr-ink hover:bg-sr-cream transition-colors"
                >
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="text-sr-ink-mute">
                    <rect x="1.5" y="2.5" width="12" height="10" rx="1" stroke="currentColor" strokeWidth="1.2" />
                    <circle cx="5" cy="6.5" r="1" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M1.5 11l3.5-3 3 2.5 2.5-2 3 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                  </svg>
                  Landing images
                </Link>
                <Link
                  href="/admin/users"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-sr-ink hover:bg-sr-cream transition-colors"
                >
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="text-sr-ink-mute">
                    <circle cx="7.5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M2.5 13c0-2.5 2.2-4.5 5-4.5s5 2 5 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                  Users
                </Link>
              </div>
            )}

            <div className="border-t border-sr-hairline">
              <button
                role="menuitem"
                onClick={async () => {
                  setOpen(false);
                  await onLogout();
                }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-sr-ink hover:bg-sr-cream transition-colors"
              >
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="text-sr-ink-mute">
                  <path d="M6 12H3a1 1 0 01-1-1V4a1 1 0 011-1h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M9 5l2.5 2.5L9 10M11 7.5H6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Log out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
