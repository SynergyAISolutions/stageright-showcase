'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { StaggerContainer, FadeUp } from '@/components/ui/motion';
import { cn } from '@/lib/utils/cn';

// Pricing tiers — radically simplified. The actual differentiator
// between tiers is the per-credit price (cards show this, not per-image,
// because Three Takes mode is 2 credits per 3 images so per-image is
// ambiguous depending on take count); everything else (Three Takes
// default mechanics, expiry policy, free-credit bonus) is uniform and
// lives in the Free-trial band below the grid. Earlier copy claims like
// "~N listings" or "10 staged rooms in Three Takes default" were
// piece-of-string numbers (a listing might be 3 rooms, might be 10) and
// have been dropped. Use-case taglines ("a month of listing work") had
// the same problem — dropped.

type Tab = 'packs' | 'subs';

type Plan = {
  name: string;
  price: string;
  perSuffix?: string; // " / mo" for subscriptions, undefined for one-time
  credits: string; // e.g. "20 credits"
  perCredit: string; // e.g. "$1.20 per credit" — the actual differentiator
  cta: string;
  href: string;
  featured: boolean;
  badge?: string;
};

const PACKS: Plan[] = [
  {
    name: 'Starter',
    price: '$24',
    credits: '20 credits',
    perCredit: '$1.20 per credit',
    cta: 'Start with Starter',
    href: '/onboarding',
    featured: false,
  },
  {
    name: 'Plus',
    price: '$49',
    credits: '50 credits',
    perCredit: '$0.98 per credit',
    cta: 'Get Plus',
    href: '/onboarding',
    featured: false,
  },
  {
    name: 'Pro',
    price: '$99',
    credits: '125 credits',
    perCredit: '$0.79 per credit',
    cta: 'Get Pro',
    href: '/onboarding',
    featured: true,
    badge: 'Most popular',
  },
  {
    name: 'Bulk',
    price: '$219',
    credits: '300 credits',
    perCredit: '$0.73 per credit',
    cta: 'Get Bulk',
    href: '/onboarding',
    featured: false,
  },
];

const SUBS: Plan[] = [
  {
    name: 'Monthly 25',
    price: '$24',
    perSuffix: ' / mo',
    credits: '25 credits / month',
    perCredit: '$0.96 per credit',
    cta: 'Subscribe',
    href: '/onboarding',
    featured: false,
  },
  {
    name: 'Monthly 75',
    price: '$69',
    perSuffix: ' / mo',
    credits: '75 credits / month',
    perCredit: '$0.92 per credit',
    cta: 'Subscribe',
    href: '/onboarding',
    featured: true,
    badge: 'Best value',
  },
];

const FR_DISPLAY = { fontVariationSettings: '"opsz" 144, "SOFT" 30' };
const FR_ITALIC = { fontVariationSettings: '"opsz" 144, "SOFT" 80' };
const FR_TIER = { fontVariationSettings: '"opsz" 96, "SOFT" 30' };
const FR_PRICE = { fontVariationSettings: '"opsz" 144, "SOFT" 40' };

export function Pricing() {
  const [tab, setTab] = useState<Tab>('packs');
  const plans = tab === 'packs' ? PACKS : SUBS;

  return (
    <section
      id="pricing"
      className="relative z-10 py-20 sm:py-28 lg:py-32 bg-sr-cream-soft border-t border-b border-sr-hairline"
    >
      <div className="mx-auto max-w-[1240px] px-5 sm:px-10">
        <StaggerContainer>
          <FadeUp>
            <div className="max-w-[760px] mx-auto text-center mb-10 sm:mb-14">
              <span className="inline-flex items-center gap-3 mb-5 font-mono text-[12.5px] font-medium uppercase tracking-[0.2em] text-[#4F7E5E]">
                <span className="size-1.5 rounded-full bg-[#4F7E5E]" aria-hidden />
                Pricing
              </span>
              <h2
                className="font-display font-normal text-[clamp(32px,5vw,56px)] leading-[1.04] tracking-[-0.03em] text-sr-ink"
                style={FR_DISPLAY}
              >
                Buy credits.
                <br />
                Spend them{' '}
                <em
                  className="not-italic font-display italic font-light text-sr-terra"
                  style={FR_ITALIC}
                >
                  when you want.
                </em>
              </h2>
              <p className="mt-5 text-[clamp(16px,1.6vw,19px)] text-sr-ink-soft max-w-[560px] mx-auto leading-[1.45]">
                <span
                  className="font-display italic font-light text-sr-terra text-[1.18em] mr-[0.18em]"
                  style={FR_ITALIC}
                >
                  1 image
                </span>
                for 1 credit, or{' '}
                <span
                  className="font-display italic font-light text-sr-terra text-[1.18em] mr-[0.18em]"
                  style={FR_ITALIC}
                >
                  3 images
                </span>
                for 2 credits.
              </p>
            </div>
          </FadeUp>

          {/* Toggle */}
          <FadeUp>
            <div className="text-center mb-10 sm:mb-14">
              <div className="inline-flex bg-sr-surface border border-sr-hairline-2 rounded-full p-1">
                <button
                  type="button"
                  onClick={() => setTab('packs')}
                  className={cn(
                    'px-6 py-2.5 rounded-full text-[13.5px] font-medium transition-colors duration-200',
                    tab === 'packs' ? 'bg-sr-terra text-sr-cream-soft' : 'text-sr-ink-soft hover:text-sr-ink',
                  )}
                >
                  One-time
                </button>
                <button
                  type="button"
                  onClick={() => setTab('subs')}
                  className={cn(
                    'px-6 py-2.5 rounded-full text-[13.5px] font-medium transition-colors duration-200',
                    tab === 'subs' ? 'bg-sr-terra text-sr-cream-soft' : 'text-sr-ink-soft hover:text-sr-ink',
                  )}
                >
                  Monthly
                </button>
              </div>
            </div>
          </FadeUp>

          {/* Tier grid */}
          <FadeUp>
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 25 }}
              className={cn(
                'grid gap-4 sm:gap-5',
                plans.length <= 2
                  ? 'grid-cols-1 sm:grid-cols-2 max-w-[720px] mx-auto'
                  : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
              )}
            >
              {plans.map((plan) => (
                <div
                  key={plan.name}
                  className={cn(
                    'relative flex flex-col rounded-[20px] p-7 sm:p-8 transition-all duration-300',
                    plan.featured
                      ? 'bg-sr-ink text-sr-cream-soft shadow-[0_30px_60px_-28px_rgba(31,53,57,0.32)]'
                      : 'bg-sr-surface border border-sr-hairline hover:-translate-y-[3px] hover:shadow-[0_30px_60px_-28px_rgba(31,53,57,0.22)] hover:border-sr-hairline-2',
                  )}
                  style={
                    plan.featured
                      ? {
                          boxShadow:
                            'inset 0 3px 0 0 #C76F4E, 0 30px 60px -28px rgba(31,53,57,0.32)',
                        }
                      : undefined
                  }
                >
                  {plan.badge && (
                    <span className="absolute -top-3 right-5 bg-sr-terra text-sr-cream-soft font-mono text-[10px] font-medium uppercase tracking-[0.14em] px-[11px] py-[6px] rounded-full">
                      {plan.badge}
                    </span>
                  )}

                  <div
                    className="font-display text-[22px] leading-none mb-7"
                    style={FR_TIER}
                  >
                    {plan.name}
                  </div>

                  <div
                    className="font-display text-[clamp(34px,3.6vw,44px)] leading-none tracking-[-0.025em] mb-2"
                    style={FR_PRICE}
                  >
                    {plan.price}
                    <span className="font-body text-[14px] font-normal opacity-60 ml-1">
                      AUD{plan.perSuffix ?? ''}
                    </span>
                  </div>

                  <div className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] opacity-78 mb-6">
                    {plan.credits}
                  </div>

                  {/* Per-image price — the actual differentiator. Terra
                      colour to anchor the eye. Sits in its own row above
                      the divider. */}
                  <div
                    className={cn(
                      'flex-1 pt-5 border-t border-current/15 font-mono text-[12.5px] font-medium uppercase tracking-[0.14em]',
                      plan.featured ? 'text-sr-terra' : 'text-sr-terra',
                    )}
                  >
                    {plan.perCredit}
                  </div>

                  <Link
                    href={plan.href}
                    className={cn(
                      'mt-6 block w-full text-center text-[14px] font-medium px-5 py-3.5 rounded-full transition-all duration-200',
                      plan.featured
                        ? 'bg-sr-cream-soft text-sr-ink hover:bg-sr-terra hover:text-sr-cream-soft'
                        : 'bg-sr-ink text-sr-cream-soft hover:bg-sr-ink-2 hover:-translate-y-px',
                    )}
                  >
                    {plan.cta}
                  </Link>
                </div>
              ))}
            </motion.div>

            {/* Free-trial closer — combines the standalone CTA "30 free
                credits" hero with the credits explainer. Lives below the
                tier grid so agents who've just compared paid tiers see the
                no-card alternative as the natural next move. Bigger,
                higher-contrast text than the previous mini-block. */}
            <div className="mt-12 sm:mt-14 max-w-[920px] mx-auto">
              <div
                className="relative overflow-hidden rounded-[20px] border border-sr-hairline-2 bg-sr-surface-2 text-center px-6 sm:px-10 py-12 sm:py-16 shadow-[0_40px_80px_-32px_rgba(31,53,57,0.32),0_18px_36px_-18px_rgba(31,53,57,0.18)]"
                style={{ borderTop: '3px solid #C76F4E' }}
              >
                {/* Soft terra atmosphere blob */}
                <div
                  className="pointer-events-none absolute -top-[40%] -right-[20%] w-[40vw] h-[40vw] max-w-[480px] max-h-[480px] rounded-full"
                  style={{
                    background:
                      'radial-gradient(circle, rgba(199, 111, 78, 0.13) 0%, transparent 65%)',
                  }}
                />

                <div className="relative z-10">
                  <span className="inline-flex items-center gap-3 mb-5 font-mono text-[11.5px] font-medium uppercase tracking-[0.18em] text-sr-ink-soft">
                    <span className="block h-px w-7 bg-sr-terra" aria-hidden />
                    <span>
                      <span className="text-sr-terra font-semibold">Free to start</span>
                    </span>
                  </span>

                  <h3
                    className="font-display font-normal text-[clamp(28px,4.4vw,48px)] leading-[1.05] tracking-[-0.03em] text-sr-ink max-w-[560px] mx-auto"
                    style={FR_DISPLAY}
                  >
                    Your first 30 credits
                    <br />
                    are{' '}
                    <em
                      className="not-italic font-display italic font-light text-sr-terra"
                      style={FR_ITALIC}
                    >
                      on us.
                    </em>
                  </h3>

                  <p className="mt-5 text-[16px] sm:text-[17px] leading-[1.55] text-sr-ink-soft max-w-[440px] mx-auto">
                    No credit card. No lock-in.
                  </p>

                  <div className="mt-9">
                    <Link
                      href="/onboarding"
                      className="group inline-flex items-center justify-center gap-2.5 bg-sr-ink text-sr-cream-soft px-8 py-4 rounded text-[15px] font-medium hover:bg-sr-ink-2 hover:-translate-y-px transition-all duration-200 shadow-[0_4px_14px_-6px_rgba(31,53,57,0.30)]"
                    >
                      Start with 30 free credits
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        className="transition-transform group-hover:translate-x-1"
                      >
                        <path d="M5 12h14M13 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </FadeUp>
        </StaggerContainer>
      </div>
    </section>
  );
}
