'use client';

import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import type {
  ListingIntent,
  ListingsPerMonth,
  PropertyType,
  Role,
} from '@/types';
import { WelcomeScreen } from '@/components/onboarding/welcome-screen';
import { RolePicker } from '@/components/onboarding/role-picker';
import { ListingTypeScreen } from '@/components/onboarding/listing-type-screen';
import { CommercialNoticeScreen } from '@/components/onboarding/commercial-notice-screen';
import { VolumePicker } from '@/components/onboarding/volume-picker';
import { BombshellScreen } from '@/components/onboarding/bombshell-screen';
import { UpsideScreen } from '@/components/onboarding/upside-screen';
import { BridgeScreen } from '@/components/onboarding/bridge-screen';
import { HowItWorksScreen } from '@/components/onboarding/how-it-works-screen';
import { DemoRoomScreen } from '@/components/onboarding/demo-room-screen';
import { StyleScreen } from '@/components/onboarding/style-screen';
import { DisclosurePerksScreen } from '@/components/onboarding/disclosure-perks-screen';
import { FactAiScreen } from '@/components/onboarding/fact-ai-screen';
import { FactCreditScreen } from '@/components/onboarding/fact-credit-screen';
import { type RoomType } from '@/components/staging/room-type-selector';
import { type StagingStyle } from '@/lib/ai/prompts';
import { BeforeAfterSlider } from '@/components/comparison/before-after-slider';
import { OnboardingProgressBar } from '@/components/onboarding/onboarding-progress-bar';
import { Eyebrow } from '@/components/onboarding/eyebrow';
import { OnboardingShell } from '@/components/onboarding/onboarding-shell';
import { OnboardingCta } from '@/components/onboarding/onboarding-cta';
import { StagingWaitConcierge, type ConciergeNote } from '@/components/staging/staging-wait-concierge';
import { buildConciergeNotes, styleToFilename } from '@/lib/ai/prompts';
import { SignupScreen } from '@/components/onboarding/signup-screen';

export type OnboardingStep =
  | 'welcome'
  | 'role'
  | 'listing-type'
  | 'commercial'
  | 'volume'
  | 'bombshell'
  | 'upside'
  | 'bridge'
  | 'how-it-works'
  | 'demo-room'
  | 'upload'
  | 'rooms'
  | 'style'
  | 'generating'
  | 'result'
  | 'disclosure-perks'
  | 'fact-ai'
  | 'fact-credit'
  | 'signup';

interface Props {
  userName: string;
  initialRole: Role | null;
  initialListingsPerMonth: ListingsPerMonth | null;
  isAuthenticated: boolean;
}

// The reveal-caption words. Two rhetorical jobs get two treatments: "Drag" is
// the action (heavier, so the finger knows where to go); "quality" is the
// brand's quiet flex (sage-italic Fraunces, a touch larger) and it lands on
// its own beat via `lull` so the invitation to scrutinise reads as confidence,
// not instruction. Everything between stays plain connective tissue.
const REVEAL_WORDS: { t: string; cls?: string; lull?: number; glue?: boolean }[] = [
  { t: 'Drag', cls: 'font-semibold' },
  { t: 'to' },
  { t: 'compare,' },
  { t: 'so' },
  { t: 'you' },
  { t: 'can' },
  { t: 'check' },
  { t: 'the' },
  // `glue` joins this word to the previous one with a non-breaking space, so
  // "the quality." always wraps as a unit — no dangling "the", no orphaned
  // accent stranded alone on its own line.
  { t: 'quality.', cls: 'font-display italic text-[#4F7E5E] text-[1.18em] tracking-[-0.01em]', lull: 0.3, glue: true },
];

export function OnboardingFlow({ userName, initialRole, initialListingsPerMonth, isAuthenticated }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [role, setRole] = useState<Role | null>(initialRole);
  const [listingsPerMonth, setListingsPerMonth] = useState<ListingsPerMonth | null>(initialListingsPerMonth);
  const [listingIntent, setListingIntent] = useState<ListingIntent | null>(null);
  const [propertyType, setPropertyType] = useState<PropertyType | null>(null);
  const [activeStyle, setActiveStyle] = useState<StagingStyle>('Modern');
  const [activeRoomType, setActiveRoomType] = useState<RoomType | null>(null);
  // Tracks which step to return to when the user backs out of the signup
  // step. There are two entry paths into 'signup' (fact-credit Continue and
  // commercial Notify), so a static onBack would strand commercial-path
  // users on a screen they never visited.
  const [signupReturnStep, setSignupReturnStep] = useState<'fact-credit' | 'commercial'>('fact-credit');
  const [stageError, setStageError] = useState<string | null>(null);
  const [isStaging, setIsStaging] = useState(false);
  const [stagedUrl, setStagedUrl] = useState<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);

  // Cached onboarding: instead of running a real Lambda, the user picks a
  // style and we show a pre-rendered staged image of an admin-generated
  // demo bedroom from /public/style-thumbnails/bedroom/. Saves ~75s of
  // wait, costs zero credits, and gives every new user a curated first
  // impression. See feedback_admin_only_images.md for the policy that
  // lets us use these images on a public surface.
  //
  // The 'generating' step is a deliberate fake-loading window — long
  // enough to feel like work is happening and to display the rotating
  // wait-concierge narration, short enough to keep momentum.
  useEffect(() => {
    if (step !== 'generating') return;
    let cancelled = false;
    const markComplete = async () => {
      for (let i = 0; i < 3; i++) {
        try {
          const r = await fetch('/api/onboarding/complete', { method: 'POST' });
          if (r.ok) return;
        } catch {
          // network blip — retry
        }
        await new Promise((res) => setTimeout(res, 500));
      }
      console.warn('[onboarding] complete POST failed after retries');
    };
    const FAKE_LOADING_MS = 20000;
    const t = setTimeout(async () => {
      if (cancelled) return;
      await markComplete();
      if (cancelled) return;
      setStep('result');
    }, FAKE_LOADING_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [step]);

  // Fire-and-forget: a flaky network must not strand the user mid-onboarding.
  // Anonymous users have no DB record yet, so we hold the answers in React
  // state and flush them inside SignupScreen after confirm-code success.
  const saveProgress = (patch: {
    role?: Role;
    listingsPerMonth?: ListingsPerMonth;
    listingIntent?: ListingIntent;
    propertyType?: PropertyType;
  }) => {
    if (!isAuthenticated) return;
    void fetch('/api/onboarding/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).catch(() => {});
  };

  // Cached "first stage". No Lambda call, no S3 upload, no credit
  // deduction. Pre-rendered admin assets at /style-thumbnails/bedroom/
  // back the demo. Sets the active room to Bedroom (the demo set) so
  // the wait-concierge per-style notes render correctly.
  //
  // Accepts the picked style explicitly. Reading `activeStyle` from
  // closure here would be stale: StyleScreen calls setActiveStyle(s)
  // and then onStage() inside a setTimeout, but the setTimeout callback
  // captured the prior `startCachedStaging` closure where activeStyle
  // hadn't updated yet — so we'd always stage with the initial 'Modern'.
  const startCachedStaging = (style: StagingStyle) => {
    if (isStaging) return;
    setStageError(null);
    setIsStaging(true);
    setActiveRoomType('Bedroom');
    setOriginalUrl('/style-thumbnails/bedroom/_original.jpg');
    setStagedUrl(`/style-thumbnails/bedroom/${styleToFilename(style)}.jpg`);
    setStep('generating');
  };

  // Optional back affordance (top-left, below the progress bar). Maps each
  // step to its predecessor on the primary path. 'signup' returns to whichever
  // step led into it; 'welcome' has nowhere to go, so the arrow is hidden.
  const BACK_STEP: Partial<Record<OnboardingStep, OnboardingStep>> = {
    role: 'welcome',
    'listing-type': 'role',
    commercial: 'listing-type',
    volume: 'listing-type',
    bombshell: 'volume',
    upside: 'bombshell',
    bridge: 'upside',
    'how-it-works': 'bridge',
    'demo-room': 'how-it-works',
    style: 'demo-room',
    generating: 'style',
    result: 'style',
    'fact-ai': 'result',
    'disclosure-perks': 'fact-ai',
    'fact-credit': 'disclosure-perks',
  };
  const canGoBack = step === 'signup' || Boolean(BACK_STEP[step]);
  const goBack = () => {
    if (step === 'signup') {
      setStep(signupReturnStep);
      return;
    }
    const prev = BACK_STEP[step];
    if (prev) setStep(prev);
  };

  return (
    <div
      className="relative h-[100dvh] bg-sr-cream-soft flex flex-col overflow-hidden text-sr-ink"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* Canvas atmosphere — earlier sage+timber depth-blob layer was
          fighting the terra accents (green halo behind terra italics
          looked muddy). Now: just a soft grain over plain cream. The
          terra accents are the only color on the page; the cream is
          the canvas they pop against. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-0 opacity-[0.10] mix-blend-multiply"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/></svg>\")",
          backgroundSize: '200px 200px',
        }}
      />

      <OnboardingProgressBar step={step} />

      {/* Optional back arrow — top-left, just below the progress bar. Subtle
          ghost button; hidden on the first screen (nothing to go back to). */}
      {canGoBack && (
        <button
          type="button"
          onClick={goBack}
          aria-label="Go back"
          className={`absolute z-20 left-2.5 sm:left-3 flex items-center justify-center size-9 rounded-full active:scale-95 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sr-terra ${
            step === 'generating'
              ? 'text-white/85 hover:text-white hover:bg-white/[0.14]'
              : 'text-sr-ink/65 bg-sr-ink/[0.04] hover:text-sr-ink hover:bg-sr-ink/[0.09]'
          }`}
          style={{ top: 'calc(env(safe-area-inset-top) + 16px)' }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path
              d="M12.5 5l-5 5 5 5"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}

      <main className="relative z-10 flex-1 min-h-0 flex overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
            className="w-full h-full flex"
          >
            {step === 'welcome' && (
              <WelcomeScreen userName={userName} onContinue={() => setStep('role')} />
            )}

            {step === 'role' && (
              <RolePicker
                selected={role}
                onPick={(r) => {
                  setRole(r);
                  saveProgress({ role: r });
                  setStep('listing-type');
                }}
                onBack={() => setStep('welcome')}
              />
            )}

            {step === 'listing-type' && (
              <ListingTypeScreen
                selected={{ intent: listingIntent, type: propertyType }}
                role={role}
                onPick={(choice) => {
                  setListingIntent(choice.intent);
                  setPropertyType(choice.type);
                  saveProgress({ listingIntent: choice.intent, propertyType: choice.type });
                  if (choice.type === 'commercial') {
                    setStep('commercial');
                  } else {
                    setStep('volume');
                  }
                }}
                onBack={() => setStep('role')}
              />
            )}

            {step === 'commercial' && (
              <CommercialNoticeScreen
                onNotify={() => {
                  // propertyType=commercial is held in state; SignupScreen
                  // flushes it to /api/onboarding/progress after confirm-code.
                  // Authenticated users (admin re-walk, returning incompletes)
                  // already saved it via saveProgress on listing-type.
                  if (isAuthenticated) {
                    router.push('/dashboard');
                  } else {
                    setSignupReturnStep('commercial');
                    setStep('signup');
                  }
                }}
                onTryAnyway={() => setStep('style')}
                onBack={() => setStep('listing-type')}
              />
            )}

            {step === 'volume' && (
              <VolumePicker
                selected={listingsPerMonth}
                role={role}
                onPick={(v) => {
                  setListingsPerMonth(v);
                  saveProgress({ listingsPerMonth: v });
                  setStep('bombshell');
                }}
                onBack={() => setStep('listing-type')}
              />
            )}

            {step === 'bombshell' && (
              <BombshellScreen
                role={role}
                listingsPerMonth={listingsPerMonth}
                listingIntent={listingIntent}
                onContinue={() => setStep('upside')}
                onBack={() => setStep('volume')}
              />
            )}

            {step === 'upside' && (
              <UpsideScreen
                role={role}
                listingsPerMonth={listingsPerMonth}
                listingIntent={listingIntent}
                onContinue={() => setStep('bridge')}
                onBack={() => setStep('bombshell')}
              />
            )}

            {step === 'bridge' && (
              <BridgeScreen
                onContinue={() => setStep('how-it-works')}
                onBack={() => setStep('upside')}
              />
            )}

            {step === 'how-it-works' && (
              <HowItWorksScreen
                onContinue={() => setStep('demo-room')}
                onBack={() => setStep('bridge')}
              />
            )}

            {step === 'demo-room' && (
              <DemoRoomScreen
                onContinue={() => setStep('style')}
                onBack={() => setStep('how-it-works')}
              />
            )}

            {/* Upload + Rooms steps were removed when onboarding switched to
                cached demo assets. Users no longer upload their own photo
                during onboarding — the demo bedroom in /style-thumbnails/
                bedroom/ stands in. The user's first REAL stage happens
                after onboarding via /stage. */}

            {step === 'style' && (
              <StyleScreen
                activeStyle={activeStyle}
                onPickStyle={setActiveStyle}
                roomCategory="bedroom"
                isStaging={isStaging}
                stageError={stageError}
                onBack={() => setStep('demo-room')}
                onStage={startCachedStaging}
              />
            )}

            {step === 'generating' && (
              <StagingWaitConcierge
                heroImageUrl="/style-thumbnails/bedroom/_original.jpg"
                conciergeNotes={buildConciergeNotes({
                  style: activeStyle,
                  roomTypes: ['Bedroom'],
                  analyserNotes: [],
                }).map<ConciergeNote>((note) => ({ note, style: activeStyle }))}
              />
            )}

            {step === 'result' && stagedUrl && originalUrl && (
              <OnboardingShell
                cta={<OnboardingCta label="Continue" onClick={() => setStep('fact-ai')} />}
              >
                <div className="w-full flex flex-col items-center gap-7 sm:gap-9 lg:gap-12 short:gap-4 shorter:gap-3">
                  <div className="text-center">
                    <Eyebrow>Staged · {activeRoomType ?? 'Room'}</Eyebrow>
                    <h2 className="mt-2 short:mt-1 font-display text-sr-ink text-[32px] sm:text-[44px] lg:text-[56px] short:text-[30px] shorter:text-[26px] leading-[0.98] tracking-[-0.02em]">
                      <span className="italic text-sr-terra">{activeStyle}</span>
                    </h2>
                  </div>

                  {/* Breathing room under the image so the statement caption
                      reads as its own beat, not glued to the photo. */}
                  <div className="w-full flex flex-col items-center gap-6 sm:gap-5 short:gap-3 shorter:gap-2">
                    <div
                      className="w-full max-w-[640px] aspect-[4/3] max-h-[58vh] md:max-h-[60vh] lg:max-h-[52vh] short:max-h-[44vh] shorter:max-h-[40vh] flex items-center justify-center"
                      style={{ containerType: 'size' }}
                    >
                      <BeforeAfterSlider
                        key={stagedUrl}
                        beforeSrc={originalUrl}
                        afterSrc={stagedUrl}
                        beforeLabel="Empty"
                        afterLabel={activeStyle}
                        fitParent
                        lockAspect="4 / 3"
                        autoReveal
                        onRevealPeak={() => {
                          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
                            navigator.vibrate(12);
                          }
                        }}
                      />
                    </div>

                    {/* The invitation — the reveal's "wow" beat. Black,
                        statement-sized, and it animates in WORD BY WORD, each
                        word rising out of a soft blur, but only AFTER the
                        slider's auto-reveal has fully settled (~2s). So it
                        lands as a deliberate prompt to examine the before/after
                        rather than as throwaway sub-text. */}
                    <p className="max-w-[26ch] text-center text-[21px] sm:text-[25px] lg:text-[27px] short:text-[18px] shorter:text-[17px] font-medium text-sr-ink leading-[1.32] tracking-[-0.01em]">
                      {REVEAL_WORDS.map((w, i) => (
                          <span key={i}>
                            <motion.span
                              className={`inline-block ${w.cls ?? ''}`}
                            initial={{ opacity: 0, y: 12, filter: 'blur(7px)' }}
                            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                            transition={{
                              delay:
                                2.3 +
                                i * 0.08 +
                                REVEAL_WORDS.slice(0, i + 1).reduce((s, x) => s + (x.lull ?? 0), 0),
                              duration: 0.6,
                              ease: [0.16, 1, 0.3, 1],
                            }}
                          >
                            {w.t}
                          </motion.span>
                            {i < REVEAL_WORDS.length - 1
                              ? REVEAL_WORDS[i + 1].glue
                                ? String.fromCharCode(160)
                                : ' '
                              : ''}
                          </span>
                        ))}
                    </p>
                  </div>
                </div>
              </OnboardingShell>
            )}

            {step === 'disclosure-perks' && (
              <DisclosurePerksScreen
                imageUrl={stagedUrl ?? undefined}
                onContinue={() => setStep('fact-credit')}
                onBack={() => setStep('fact-ai')}
              />
            )}

            {step === 'fact-ai' && (
              <FactAiScreen
                onContinue={() => setStep('disclosure-perks')}
                onBack={() => setStep('result')}
              />
            )}

            {step === 'fact-credit' && (
              <FactCreditScreen
                onContinue={() => {
                  if (isAuthenticated) {
                    router.push('/dashboard');
                  } else {
                    setSignupReturnStep('fact-credit');
                    setStep('signup');
                  }
                }}
                onBack={() => setStep('disclosure-perks')}
              />
            )}

            {step === 'signup' && (
              <SignupScreen
                heldState={{
                  role,
                  listingsPerMonth,
                  listingIntent,
                  propertyType,
                }}
                onBack={() => setStep(signupReturnStep)}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
