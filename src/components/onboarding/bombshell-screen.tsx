'use client';

import { motion } from 'framer-motion';
import type { ListingIntent, ListingsPerMonth, Role } from '@/types';
import { OnboardingShell } from './onboarding-shell';
import { OnboardingCta } from './onboarding-cta';
import { Eyebrow } from './eyebrow';
import { Brand } from './brand';

// Bombshell — the COST screen (the See act's emotional low). The figure is the
// villain (terra). Its sibling, UpsideScreen, is the very next step and delivers
// the relief (sage) — the contrast is a screen-level colour turn. Both compute
// their copy from the SAME contentFor(variant) so they stay in lock-step.

export const EXPO = [0.16, 1, 0.3, 1] as const;

export type Variant =
  | 'agent-sell'
  | 'agent-lease'
  | 'photographer'
  | 'pm-sell'
  | 'pm-lease'
  | 'owner-sell'
  | 'owner-lease';

export function variantFor(role: Role | null, intent: ListingIntent | null): Variant {
  if (role === 'photographer') return 'photographer';
  if (role === 'property-manager') return intent === 'sell' ? 'pm-sell' : 'pm-lease';
  if (role === 'listing-my-own') return intent === 'sell' ? 'owner-sell' : 'owner-lease';
  return intent === 'lease' ? 'agent-lease' : 'agent-sell';
}

export const VOLUME_PHRASE: Record<ListingsPerMonth, string> = {
  '0-2': 'a couple',
  '3-5': 'a handful',
  '6-10': 'six to ten',
  '11+': 'eleven or more',
};

// Same buckets, but spelled with the unit so "a couple a month" reads clearly
// as "a couple OF LISTINGS a month".
const VOLUME_LISTINGS: Record<ListingsPerMonth, string> = {
  '0-2': 'a couple of listings',
  '3-5': 'a handful of listings',
  '6-10': 'six to ten listings',
  '11+': 'eleven or more listings',
};

export interface DropContent {
  // Part 1 — the figure (the COST screen)
  setup1: React.ReactNode;
  value: string;
  tag?: string;
  tone: 'cost' | 'margin';
  detail1: React.ReactNode;
  /** Optional closing proof/stat for the cost screen, after all its info. */
  proof1?: React.ReactNode;
  // Part 2 — the payoff (the UPSIDE screen)
  setup2: React.ReactNode;
  payoff: string;
  /** The upside lines after the payoff — EACH gets its own staged reveal. */
  lines2: React.ReactNode[];
}

interface Props {
  role: Role | null;
  listingsPerMonth: ListingsPerMonth | null;
  listingIntent: ListingIntent | null;
  onContinue: () => void;
  onBack: () => void;
}

export function BombshellScreen({ role, listingsPerMonth, listingIntent, onContinue }: Props) {
  const variant = variantFor(role, listingIntent);
  return <CostDrop {...contentFor(variant, listingsPerMonth ?? '11+')} onContinue={onContinue} />;
}

export function contentFor(variant: Variant, v: ListingsPerMonth): DropContent {
  const listings = VOLUME_LISTINGS[v];
  switch (variant) {
    case 'photographer':
      return {
        setup1: (
          <>
            <Brand /> delivers a staged image from
          </>
        ),
        value: '73¢',
        tag: 'AUD',
        tone: 'margin',
        detail1: (
          <>
            Virtual staging services charge <Strong>$20 to $30</Strong> for the same thing.
          </>
        ),
        setup2: 'Your prices hold. You pocket',
        payoff: 'the difference.',
        lines2: [
          <span key="0">
            Add it to your premium packages, or sell it on its own and reach a{' '}
            <BigKept>broader market</BigKept>.
          </span>,
        ],
      };

    case 'agent-lease':
      return {
        setup1: 'An empty rental earns nothing while it sits.',
        value: '$700',
        tone: 'cost',
        detail1: (
          <>
            is a typical week&apos;s rent, <Em>lost</Em> for every week it stays vacant.
          </>
        ),
        setup2: 'A staged listing leases',
        payoff: 'sooner.',
        lines2: [
          <span key="0">
            Even one week saved is a week&apos;s rent <BigKept>kept</BigKept>.
          </span>,
          <span key="1">
            At {listings} a month, those weeks <BigKept>add up</BigKept>.
          </span>,
        ],
      };

    case 'pm-lease':
      return {
        setup1: 'An empty unit earns nothing while it sits.',
        value: '$700',
        tone: 'cost',
        detail1: (
          <>
            is a typical week&apos;s rent, <Em>lost</Em> for every week it sits vacant.
          </>
        ),
        setup2: 'Staged units lease',
        payoff: 'sooner.',
        lines2: [
          <span key="0">
            Fewer empty days means more rent your landlords <BigKept>keep</BigKept>.
          </span>,
          <span key="1">
            Across a portfolio, a few days off each turnover is <BigKept>real money</BigKept>.
          </span>,
        ],
      };

    case 'owner-lease':
      return {
        setup1: 'An empty rental earns nothing while it sits.',
        value: '$700',
        tone: 'cost',
        detail1: (
          <>
            is a typical week&apos;s rent, <Em>lost</Em> for every week it sits empty.
          </>
        ),
        setup2: 'Stage it, list it sooner, and that’s',
        payoff: 'rent kept.',
        lines2: [
          <span key="0">
            A stager would charge thousands; <Brand /> is <BigKept>a couple of dollars</BigKept> per stage.
          </span>,
        ],
      };

    case 'owner-sell':
      return {
        setup1: 'A physical stager charges',
        value: '$3,500–$6,000',
        tone: 'cost',
        // Non-breaking space keeps "taken." from wrapping onto a line alone.
        detail1: 'to furnish a three-bedroom house, before a single photo is even\u00A0taken.',
        proof1: <FasterProof />,
        setup2: (
          <>
            <Brand /> does the same for
          </>
        ),
        payoff: 'a fraction.',
        lines2: ['The photos are yours to keep.'],
      };

    case 'pm-sell':
    case 'agent-sell':
    default:
      return {
        setup1: 'Staging the old way cost',
        value: '$3,500–$6,000',
        tone: 'cost',
        detail1: 'for a three-bedroom house with a physical stager, before a single photo is even taken.',
        proof1: <FasterProof />,
        setup2: (
          <>
            <Brand /> stages it for
          </>
        ),
        // Per room, not per house: the cost screen now names a three-bedroom
        // house. Non-breaking space glues "a room." so it never wraps alone.
        payoff: 'a couple of dollars a\u00A0room.',
        lines2: [
          <span key="0" className="font-display text-sr-ink text-[26px] sm:text-[32px] lg:text-[34px] short:text-[20px] leading-[1.05] tracking-[-0.01em]">
            In minutes.
          </span>,
          <span key="1">
            At {listings} a month, that&apos;s <BigKept>thousands saved</BigKept> on the listings you would have staged.
          </span>,
          <span key="2">
            And a <BigKept>sharper listing</BigKept> on those you wouldn&apos;t have.
          </span>,
        ],
      };
  }
}

/* ───── Shared layout tokens (also used by UpsideScreen) ───── */

export const COLUMN = 'w-full max-w-[34ch] sm:max-w-[42ch] lg:max-w-[44ch] mx-auto text-center flex flex-col items-center';
// The setup line — fancy serif, but with real weight so it reads confident, not
// thin. Fraunces is variable, so font-semibold genuinely thickens the stroke.
// leading kept open (1.3) so the two-line setups never feel crammed.
export const SETUP = 'font-display font-semibold text-[23px] sm:text-[28px] lg:text-[30px] short:text-[18px] text-sr-ink leading-[1.3] tracking-[-0.015em] max-w-[26ch]';
// Upside lines. leading must clear the 1.55em BigKept inline accent or the big
// sage words crash into the lines above/below — that was the "squashed" look.
export const LINE2 = 'text-[19px] sm:text-[23px] lg:text-[24px] short:text-[16px] text-sr-ink font-medium tracking-tight max-w-[28ch] leading-[1.72]';
const DETAIL = 'text-[19px] sm:text-[23px] lg:text-[24px] short:text-[16px] text-sr-ink font-medium leading-[1.5] tracking-tight max-w-[26ch]';

/** Length-aware payoff (the upside hero) sizing — also used by UpsideScreen. */
export function payoffSize(payoff: string): string {
  return payoff.length >= 13
    ? 'text-[clamp(30px,8vw,54px)] short:text-[clamp(26px,7vw,46px)]'
    : 'text-[clamp(44px,12vw,80px)] short:text-[clamp(38px,10.5vw,62px)]';
}

/* ───── The COST screen ───── */

function CostDrop({
  setup1,
  value,
  tag,
  tone,
  detail1,
  proof1,
  onContinue,
}: DropContent & { onContinue: () => void }) {
  const figureSize =
    value.length >= 8
      ? 'text-[clamp(34px,9.5vw,64px)] short:text-[clamp(28px,8vw,52px)]'
      : 'text-[clamp(52px,14vw,92px)] short:text-[clamp(44px,12vw,72px)]';

  const isMargin = tone === 'margin';
  // Motion as argument. A cost is gravity: it falls in from above, a touch
  // oversized, and THUDS to a stop (heavy spring, low damping settle). A margin
  // (the photographer's tiny 73¢) is the opposite — it lifts in gently from
  // below and blooms, because it's a good thing.
  const figureInitial = isMargin
    ? { opacity: 0, y: 30, scale: 0.94, filter: 'blur(8px)' }
    : { opacity: 0, y: -46, scale: 1.14, filter: 'blur(12px)' };
  const figureTransition = isMargin
    ? {
        default: { delay: 1.3, duration: 1.1, ease: EXPO },
        scale: { delay: 1.3, type: 'spring' as const, stiffness: 120, damping: 15 },
      }
    : {
        default: { delay: 1.3, duration: 0.55, ease: [0.5, 0, 0.7, 0.95] as const },
        y: { delay: 1.3, type: 'spring' as const, stiffness: 260, damping: 18, mass: 1.15 },
        scale: { delay: 1.3, duration: 0.7, ease: [0.4, 0, 0.2, 1] as const },
      };

  // The CTA waits for everything — including the self-animating FasterProof,
  // whose last beat lands ~6s in.
  const ctaDelay = proof1 ? 6.9 : 3.5;

  return (
    <OnboardingShell cta={<OnboardingCta label="There's a better way" onClick={onContinue} delay={ctaDelay} />}>
      <div className={COLUMN}>
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EXPO }}>
          <Eyebrow>The numbers</Eyebrow>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 16, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ delay: 0.5, duration: 0.85, ease: EXPO }}
          className={`mt-6 sm:mt-8 short:mt-4 ${SETUP}`}
        >
          {setup1}
        </motion.p>

        <motion.div
          initial={figureInitial}
          animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
          transition={figureTransition}
          className="mt-3 sm:mt-4 short:mt-2 flex flex-col items-center leading-none"
        >
          <span className={`font-display text-sr-terra whitespace-nowrap ${figureSize} tracking-[-0.03em] tabular-nums leading-[0.9]`}>
            {value}
          </span>
          {tag && (
            <span className="mt-1.5 text-[11px] sm:text-[12px] font-bold uppercase tracking-[0.3em] text-sr-terra/70">
              {tag}
            </span>
          )}
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 16, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ delay: 2.5, duration: 0.85, ease: EXPO }}
          className={`mt-4 sm:mt-5 short:mt-3 ${DETAIL}`}
        >
          {detail1}
        </motion.p>

        {proof1 && <div className="mt-6 sm:mt-7 short:mt-4 flex flex-col items-center">{proof1}</div>}
      </div>
    </OnboardingShell>
  );
}

/* ───── Inline accents ───── */

// Dark bold emphasis inside a sans line (e.g. the market rate to beat).
function Strong({ children }: { children: React.ReactNode }) {
  return <span className="font-bold text-sr-ink">{children}</span>;
}

// Terra bold emphasis — the COST / LOSS side (e.g. "lost").
function Em({ children }: { children: React.ReactNode }) {
  return <span className="font-bold text-sr-terra">{children}</span>;
}

// Larger display-serif sage accent — a key win phrase that pops out of a line.
function BigKept({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-display text-[#4F7E5E] text-[1.55em] leading-[1.05] tracking-[-0.01em]">
      {children}
    </span>
  );
}

// "73% faster" closing proof for the sell drops. The question lands on its OWN
// beat, then the answer builds: setup → the big stat → the source.
function FasterProof() {
  return (
    <>
      {/* "Why?" tilts in like a raised eyebrow — a question, not a statement. */}
      <motion.span
        initial={{ opacity: 0, scale: 0.82, rotate: -4, filter: 'blur(7px)' }}
        animate={{ opacity: 1, scale: 1, rotate: 0, filter: 'blur(0px)' }}
        transition={{ delay: 3.4, duration: 0.7, ease: EXPO }}
        className="block font-display italic text-sr-ink text-[28px] sm:text-[36px] short:text-[22px] leading-[1.1] tracking-[-0.01em]"
      >
        Why?
      </motion.span>
      <motion.span
        initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ delay: 4.5, duration: 0.85, ease: EXPO }}
        className="block mt-3 sm:mt-4 short:mt-2 text-[20px] sm:text-[24px] lg:text-[26px] short:text-[17px] text-sr-ink font-medium leading-snug"
      >
        Staged listings sell
      </motion.span>
      {/* The speed stat MOVES fast — it whooshes in sideways in half the time
          everything else takes. Lateral velocity is the whole point. */}
      <motion.span
        initial={{ opacity: 0, x: -80, filter: 'blur(8px)' }}
        animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
        transition={{ delay: 5.2, duration: 0.5, ease: [0.2, 0.85, 0.25, 1] as const }}
        className="block mt-0.5 font-display text-sr-terra text-[38px] sm:text-[50px] short:text-[30px] leading-[1.05] tracking-[-0.02em]"
      >
        73% faster.
      </motion.span>
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 5.9, duration: 0.6, ease: EXPO }}
        className="block mt-1.5 text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-sr-ink/45"
      >
        RESA
      </motion.span>
    </>
  );
}
