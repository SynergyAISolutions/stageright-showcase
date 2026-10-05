'use client';

import { useState, useCallback, useEffect, useRef, Suspense } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type RoomPhoto } from '@/components/wizard/types';
import { WizardShell } from '@/components/wizard/wizard-shell';
import { WizardProgressHairline } from '@/components/wizard/wizard-progress-hairline';
import { WizardBackButton, WizardContinueButton } from '@/components/wizard/wizard-buttons';
import { HeroUpload } from '@/components/wizard/hero-upload';
import { ReferenceUpload } from '@/components/wizard/reference-upload';
import { NotesStep } from '@/components/wizard/notes-step';
import { StagingWaitConcierge, type ConciergeNote } from '@/components/staging/staging-wait-concierge';
import { NewListingDialog } from '@/components/dashboard/new-listing-dialog';
import { type ListingTile } from '@/components/dashboard/listings-grid';
import { CreditBalance } from '@/components/staging/credit-balance';
import { RoomTypeSelector, ROOM_TYPES, type RoomType } from '@/components/staging/room-type-selector';
import { ListingPill } from '@/components/staging/listing-pill';
import { useAuth } from '@/hooks/use-auth';
import { STAGING_STYLES, buildBatchWaitNotes, type StagingStyle } from '@/lib/ai/prompts';
import { StyleRow, type ThumbnailRoom } from '@/components/staging/style-row';
import { TakeCountStep } from '@/components/staging/take-count-step';
import type { Bundle } from '@/types';
import { creditsPerStyle, maxStylesForBundle } from '@/types';
import { cn } from '@/lib/utils/cn';
import { PackTiles } from '@/components/billing/pack-tiles';

type WizardStep = 'upload' | 'reference' | 'rooms' | 'take-count' | 'style' | 'notes' | 'generating';

const STEP_ORDER: WizardStep[] = ['upload', 'reference', 'rooms', 'take-count', 'style', 'notes'];


async function uploadToS3(photo: RoomPhoto): Promise<string> {
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: photo.base64, imageMimeType: photo.mimeType }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Upload failed');
  }
  const { s3Key } = await res.json();
  return s3Key;
}

function StagePageInner() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Deep-link params (read once on mount). When ?listingId is present, the
  // listing pill pre-selects and locks. When BOTH ?listingId AND ?heroS3Key are
  // present, we also skip the upload step and adopt the existing hero.
  const initialListingIdParam = searchParams.get('listingId');
  const initialHeroS3KeyParam = searchParams.get('heroS3Key');

  // Wizard state
  const [step, setStep] = useState<WizardStep>('upload');
  const [heroPhoto, setHeroPhoto] = useState<RoomPhoto | null>(null);
  const [heroS3Key, setHeroS3Key] = useState<string | null>(null);
  const [heroSignedUrl, setHeroSignedUrl] = useState<string | null>(null);
  const [referencePhotos, setReferencePhotos] = useState<RoomPhoto[]>([]);
  const [refS3Keys, setRefS3Keys] = useState<string[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [styles, setStyles] = useState<StagingStyle[]>([]);
  const [bundle, setBundle] = useState<Bundle>('triple');
  const [notes, setNotes] = useState('');
  const [listingId, setListingId] = useState<string>(initialListingIdParam || 'unsorted');
  const listingLocked = !!initialListingIdParam;

  // Generation
  const [error, setError] = useState<string | null>(null);
  const [conciergeNotes, setConciergeNotes] = useState<ConciergeNote[]>([]);

  // Track if we pre-loaded from gallery "Try another style" so we can skip upload
  const [preloadedFromGallery, setPreloadedFromGallery] = useState(false);
  const [isUploadingHero, setIsUploadingHero] = useState(false);

  // "Save without a listing?" nag dialog state. Triggered at submit time when
  // listingId === 'unsorted' so users don't silently file work into Unsorted.
  // Held in a ref so the user's confirmation re-runs the actual submit path.
  const [pickListingOpen, setPickListingOpen] = useState(false);


  // Track which steps the user has reached — used to render progress segments.
  const [reachedSteps, setReachedSteps] = useState<Set<WizardStep>>(new Set(['upload']));

  const advanceTo = useCallback((next: WizardStep) => {
    setReachedSteps((prev) => new Set(prev).add(next));
    setStep(next);
  }, []);

  // Redirect to onboarding if not yet completed
  useEffect(() => {
    if (!authLoading && user && !user.onboardingCompletedAt) {
      router.replace('/onboarding');
    }
  }, [authLoading, user, router]);

  // Pre-load from query params.
  // - ?hero=&rooms=        → gallery "Try another style" flow (jumps to style)
  // - ?heroS3Key=&listingId= → listing deep-link (skips upload, jumps to reference)
  const preloadApplied = useRef(false);
  useEffect(() => {
    if (preloadApplied.current) return;
    const heroParam = searchParams.get('hero');
    const heroS3KeyParam = searchParams.get('heroS3Key');
    const listingIdParam = searchParams.get('listingId');
    const roomsParam = searchParams.get('rooms');

    // Listing deep-link: hero key + listingId. Skip upload, land on the
    // reference step so the user can add angles or skip into rooms/style.
    if (heroS3KeyParam && listingIdParam) {
      preloadApplied.current = true;
      setPreloadedFromGallery(true);
      setHeroS3Key(heroS3KeyParam);
      fetch(`/api/upload/signed?key=${encodeURIComponent(heroS3KeyParam)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => data?.url && setHeroSignedUrl(data.url))
        .catch(() => {});
      setReachedSteps(new Set(['upload', 'reference']));
      setStep('reference');
      return;
    }

    if (!heroParam) return;
    preloadApplied.current = true;
    setPreloadedFromGallery(true);
    setHeroS3Key(heroParam);
    if (roomsParam) {
      const parsed = roomsParam
        .split(',')
        .map((s) => s.trim())
        .filter((s): s is RoomType => ROOM_TYPES.includes(s as RoomType));
      setRoomTypes(parsed);
    }
    // Carry the listingId through if "Try another style" came from a
    // listing-scoped staging — otherwise the user gets the nag modal
    // even though they're clearly inside a listing.
    if (listingIdParam) {
      setListingId(listingIdParam);
    }
    // Fetch signed URL for hero
    fetch(`/api/upload/signed?key=${encodeURIComponent(heroParam)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data?.url && setHeroSignedUrl(data.url))
      .catch(() => {});
    // Jump to take-count step. Hero + rooms are pre-filled; the user still
    // gets to decide bundle (Three Takes vs Single Take) before picking
    // styles — that decision can't be inherited from a prior session.
    setReachedSteps(new Set(['upload', 'reference', 'rooms', 'take-count']));
    setStep('take-count');
  }, [searchParams]);

  // Hero upload → S3 → auto-advance
  const handleHeroChange = useCallback(async (photo: RoomPhoto | null) => {
    setHeroPhoto(photo);
    setHeroS3Key(null);
    setError(null);
    if (!photo) return;
    setIsUploadingHero(true);
    try {
      const key = await uploadToS3(photo);
      setHeroS3Key(key);
      setHeroSignedUrl(photo.preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploadingHero(false);
    }
  }, []);

  const handleReferencesChange = useCallback(async (photos: RoomPhoto[]) => {
    setReferencePhotos(photos);
    const keys: string[] = [];
    for (const photo of photos) {
      try { keys.push(await uploadToS3(photo)); } catch { /* non-fatal */ }
    }
    setRefS3Keys(keys);
  }, []);

  // Room-type tap — just toggle; user confirms with Continue button.
  const handleRoomTypeToggle = useCallback((type: RoomType) => {
    setRoomTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  }, []);

  // Client-side credit check. Admin has effectively infinite credits; everyone
  // else must have >= styles.length before we let them submit. The server still
  // enforces this (402 on /api/stage/batch), but surfacing the gate in the UI
  // before the click avoids the confusing 'loader → bounce back' flow.
  const isAdmin = user?.plan === 'admin';
  const userCredits = user?.creditsRemaining ?? 0;
  const creditsPerStyleValue = creditsPerStyle(bundle);
  const creditsNeeded = (styles.length || 1) * creditsPerStyleValue;
  const styleCap = maxStylesForBundle(bundle);
  const hasEnoughCredits = isAdmin || userCredits >= creditsNeeded;

  // Stage entry point. Every submit (Single Take or Three Takes, any number of
  // styles) goes to POST /api/stage/batch, stores a checkpoint, then redirects
  // to the batch reveal page. `pickedListingId` comes from the listing picker:
  // its onPick holds this render's runStaging, whose `listingId` is still the
  // old value, so the picked id must be passed in rather than read from state.
  const runStaging = useCallback(async (pickedListingId?: string) => {
    if (styles.length === 0) return;
    const targetListingId = pickedListingId ?? listingId;
    if (!hasEnoughCredits) {
      setError(`You need ${creditsNeeded} credit${creditsNeeded === 1 ? '' : 's'} for this — you have ${userCredits}.`);
      return;
    }
    // All staging routes through /api/stage/batch (single or multi-style)
    setError(null);
    advanceTo('generating');

    // Pre-fill wait notes using the interleaved batch helper so the concierge
    // wait mounts with real content before /api/stage/batch returns.
    setConciergeNotes(buildBatchWaitNotes({ styles, roomTypes }));

    try {
      const res = await fetch('/api/stage/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          heroS3Key,
          referenceS3Keys: refS3Keys,
          roomTypes,
          styles,
          notes: (notes || '').trim() || undefined,
          bundle,
          listingId: targetListingId === 'unsorted' ? undefined : targetListingId,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Batch failed to start.');
        advanceTo('notes');
        return;
      }
      const { batchId } = (await res.json()) as { batchId: string };
      try {
        localStorage.setItem(
          'stageright:pending-batch',
          JSON.stringify({
            batchId,
            originalImageUrl: heroSignedUrl,
            roomTypeLabel: roomTypes[0] ?? 'room',
            heroS3Key,
            roomTypes,
            styles,
            startedAt: Date.now(),
          }),
        );
      } catch { /* noop */ }
      // ?fresh=1 marks this as the first-time reveal ceremony. Re-entries
      // (bookmark, browser-history, shared link) hit the same URL without
      // the param and get redirected to /listings/[id] where the
      // GalleryViewer modal is the canonical "view a staged room" surface.
      router.push(`/stage/batch/${batchId}?fresh=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error.');
      advanceTo('notes');
    }
  }, [styles, heroS3Key, refS3Keys, roomTypes, notes, heroSignedUrl, advanceTo, router, bundle, hasEnoughCredits, creditsNeeded, userCredits, listingId]);

  // Submit-time wrapper. If the user hasn't picked a listing, open the
  // listing picker. The picker has no "Save without a listing" escape —
  // every staging goes into a real listing now (per the IA simplification:
  // listing-less staging produced more friction than value).
  const handleSubmitClick = useCallback(() => {
    if (listingId === 'unsorted') {
      setPickListingOpen(true);
      return;
    }
    runStaging();
  }, [listingId, runStaging]);

  // Back button logic
  const goBack = useCallback(() => {
    if (step === 'reference') setStep('upload');
    else if (step === 'rooms') setStep('reference');
    else if (step === 'take-count') setStep('rooms');
    else if (step === 'style') setStep('take-count');
    else if (step === 'notes') setStep('style');
  }, [step]);

  // Auth gating
  if (authLoading) {
    return (
      <div className="h-[100dvh] bg-sr-cream flex items-center justify-center">
        <div className="size-8 border-2 border-sr-terra border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) {
    router.push('/login');
    return null;
  }

  const visibleStepIndex = STEP_ORDER.indexOf(step);
  const progressActive = visibleStepIndex >= 0;

  return (
    <div
      className="h-[100dvh] bg-sr-cream flex flex-col overflow-hidden"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* Header */}
      <header className="flex-shrink-0 bg-sr-cream border-b border-sr-hairline z-40">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 h-14 flex items-center justify-between gap-3">
          <Link href="/dashboard" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/android/logo-mark-light.png" alt="StageRight" className="size-9 object-contain" />
            <span className="font-display text-lg text-sr-ink tracking-tight hidden sm:inline">StageRight</span>
          </Link>
          <div className="flex items-center gap-3 sm:gap-4">
            {user && (
              <CreditBalance
                credits={user.creditsRemaining ?? 0}
                plan={user.plan ?? 'free'}
              />
            )}
            <Link
              href="/dashboard"
              aria-label="Exit to dashboard"
              className="size-8 rounded-full bg-sr-ink/[0.06] hover:bg-sr-ink/[0.12] text-sr-ink flex items-center justify-center transition-colors text-base leading-none"
            >
              ×
            </Link>
          </div>
        </div>
        {progressActive && (
          <WizardProgressHairline currentIndex={visibleStepIndex} total={STEP_ORDER.length} />
        )}
      </header>

      <main className="flex-1 min-h-0 flex overflow-hidden sm:items-center sm:justify-center sm:p-4 lg:p-6">
        <AnimatePresence mode="wait">
          {/* ───── UPLOAD ───── */}
          {step === 'upload' && (
            <WizardShell
              key="upload"
              eyebrow="Step 1 of 6 · Upload"
              question={<>Upload your <em className="text-sr-terra italic">room</em>.</>}
              subtitle="JPG or PNG, up to 20MB."
              footerRight={
                <WizardContinueButton
                  onClick={() => advanceTo('reference')}
                  disabled={!heroS3Key || isUploadingHero}
                  label={isUploadingHero ? 'Uploading…' : 'Continue'}
                />
              }
            >
              <div className="flex-1 min-h-0 flex flex-col justify-center gap-4 max-w-[480px] mx-auto w-full py-2">
                <div>
                  <label className="block text-[11px] font-bold tracking-widest uppercase text-sr-ink mb-2">
                    Listing
                  </label>
                  <ListingPill value={listingId} onChange={setListingId} locked={listingLocked} />
                </div>
                <HeroUpload heroPhoto={heroPhoto} onChange={handleHeroChange} />
                {error && <p className="text-sm text-red-600 text-center">{error}</p>}
              </div>
            </WizardShell>
          )}

          {/* ───── REFERENCE ───── */}
          {step === 'reference' && (
            <WizardShell
              key="reference"
              eyebrow="Step 2 of 6 · Reference · Optional"
              question={<>Want more <em className="text-sr-terra italic">angles</em>?</>}
              subtitle="Optional — helpful in specific situations."
              footerLeft={<WizardBackButton onClick={goBack} />}
              footerRight={
                <WizardContinueButton
                  onClick={() => advanceTo('rooms')}
                  label={referencePhotos.length === 0 ? 'Skip' : `Continue with ${referencePhotos.length}`}
                />
              }
            >
              <ReferenceUpload photos={referencePhotos} onChange={handleReferencesChange} />
            </WizardShell>
          )}

          {/* ───── ROOMS ───── */}
          {step === 'rooms' && (
            <WizardShell
              key="rooms"
              eyebrow="Step 3 of 6 · Room type"
              question={<>What kind of <em className="text-sr-terra italic">room</em>?</>}
              subtitle="Tap one. Tap more if open-plan."
              footerLeft={<WizardBackButton onClick={goBack} />}
              footerRight={
                <WizardContinueButton
                  onClick={() => advanceTo('take-count')}
                  disabled={roomTypes.length === 0}
                  label={roomTypes.length >= 2 ? `Continue with ${roomTypes.length} selected` : 'Continue'}
                />
              }
            >
              <RoomTypeSelector selected={roomTypes} onToggle={handleRoomTypeToggle} />
            </WizardShell>
          )}

          {/* ───── TAKE COUNT ───── */}
          {step === 'take-count' && (
            <WizardShell
              key="take-count"
              eyebrow="Step 4 of 6 · Takes"
              question={<>How many <em className="text-sr-terra italic">takes</em> per style?</>}
              subtitle="AI is creative — and inconsistent. Three takes is how you almost always get one you love."
              footerLeft={<WizardBackButton onClick={goBack} />}
              footerRight={
                <WizardContinueButton
                  onClick={() => advanceTo('style')}
                  label="Continue"
                />
              }
            >
              <TakeCountStep value={bundle} onChange={setBundle} />
            </WizardShell>
          )}

          {/* ───── STYLE ───── */}
          {step === 'style' && (
            <WizardShell
              key="style"
              eyebrow="Step 5 of 6 · Style"
              question={<>Pick your <em className="text-sr-terra italic">styles</em>.</>}
              subtitle={
                bundle === 'triple'
                  ? `Choose 1 to ${styleCap} styles. Each one generates 3 versions (2 credits per style).`
                  : `Choose 1 to ${styleCap} styles. Each one generates its own staged image (1 credit per style).`
              }
              footerLeft={!preloadedFromGallery ? <WizardBackButton onClick={goBack} /> : undefined}
              footerRight={
                <WizardContinueButton
                  onClick={() => advanceTo('notes')}
                  label={
                    styles.length === 0
                      ? 'Continue'
                      : `Continue · ${styles.length} ${styles.length === 1 ? 'style' : 'styles'}`
                  }
                  disabled={styles.length === 0 || styles.length > styleCap}
                />
              }
            >
              {/* Bundle-switch trim warning */}
              {styles.length > styleCap && (
                <div className="mb-3 rounded-xl border-2 border-amber-500 bg-amber-50 p-4 text-amber-900">
                  <p className="font-semibold">
                    Triple Takes max {styleCap} styles.
                  </p>
                  <p className="text-sm">
                    Pick the {styleCap} you want most before continuing.
                  </p>
                </div>
              )}

              {/* Counter bar */}
              <div
                className={cn(
                  'flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs mb-3',
                  styles.length >= styleCap
                    ? 'bg-amber-50 text-amber-900'
                    : 'bg-surface-secondary text-ink-secondary',
                )}
              >
                <span
                  className={cn(
                    'size-1.5 rounded-full',
                    styles.length >= styleCap ? 'bg-amber-500' : 'bg-brand-teal',
                  )}
                />
                <span>
                  <strong className="font-semibold">{styles.length} of {styleCap}</strong>
                  {styles.length >= styleCap ? ' selected · remove one to add another' : ' selected'}
                </span>
                <span className="ml-auto text-ink-muted">
                  {styles.length * creditsPerStyleValue} credit{styles.length * creditsPerStyleValue === 1 ? '' : 's'}
                </span>
              </div>

              <ul className="space-y-2">
                {STAGING_STYLES.map((s) => {
                  const selected = styles.includes(s);
                  const capped = !selected && styles.length >= styleCap;
                  return (
                    <li key={s} className={capped ? 'opacity-40 pointer-events-none' : ''}>
                      <StyleRow
                        style={s}
                        selected={selected}
                        onPick={() => {
                          setStyles((prev) =>
                            prev.includes(s)
                              ? prev.filter((x) => x !== s)
                              : prev.length < styleCap
                                ? [...prev, s]
                                : prev,
                          );
                        }}
                        roomCategory={roomCategoryFor(roomTypes)}
                      />
                    </li>
                  );
                })}
              </ul>
            </WizardShell>
          )}

          {/* ───── NOTES ───── */}
          {step === 'notes' && (
            <WizardShell
              key="notes"
              eyebrow="Step 6 of 6 · Notes · Optional"
              question={<>Anything <em className="text-sr-terra italic">else</em>?</>}
              subtitle="Helps when the photo doesn't say everything."
              footerLeft={<WizardBackButton onClick={goBack} />}
              footerRight={
                <button
                  type="button"
                  onClick={handleSubmitClick}
                  disabled={roomTypes.length === 0 || !hasEnoughCredits}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-sr-terra text-white text-xs sm:text-sm font-semibold tracking-[0.02em] rounded-full hover:bg-sr-terra/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_14px_-4px_rgba(199,111,78,0.4)]"
                >
                  {hasEnoughCredits ? (
                    <>
                      {styles.length <= 1 ? 'Stage this room' : `Stage ${styles.length} rooms`}
                      <span className="text-white/70 font-medium">
                        · {creditsNeeded} credit{creditsNeeded === 1 ? '' : 's'}
                      </span>
                    </>
                  ) : (
                    'Out of credits'
                  )}
                </button>
              }
            >
              <div className="space-y-4">
                <NotesStep
                  notes={notes}
                  onNotesChange={setNotes}
                  roomTypes={roomTypes}
                  style={
                    styles.length === 1
                      ? styles[0]
                      : styles.length > 1
                        ? `${styles.length} styles`
                        : 'Modern'
                  }
                  referenceCount={referencePhotos.length}
                  onJumpTo={(t) => setStep(t)}
                />

                {/* Out-of-credits state — prominent card with the four pack
                    tiles for one-click top-up. Stripe Checkout fires from the
                    tile click; user comes back here via /checkout/success. */}
                {!hasEnoughCredits && (
                  <div className="rounded-xl border-[1.5px] border-sr-terra/40 bg-sr-terra/[0.06] p-5 flex items-start gap-4">
                    <span
                      className="flex-shrink-0 size-10 rounded-full bg-sr-terra text-white flex items-center justify-center"
                      aria-hidden="true"
                    >
                      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                        <path
                          d="M10 2v4M10 14v4M4.2 4.2l2.8 2.8M13 13l2.8 2.8M2 10h4M14 10h4M4.2 15.8l2.8-2.8M13 7l2.8-2.8"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                      </svg>
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-display text-xl text-sr-ink leading-tight">
                        {userCredits === 0 ? "You're out of credits" : `You need ${creditsNeeded} credits — you have ${userCredits}`}
                      </p>
                      <div className="mt-3">
                        <PackTiles returnTo="/stage" />
                      </div>
                      {userCredits > 0 && (styles.length * creditsPerStyleValue) > userCredits && (
                        <button
                          type="button"
                          onClick={() => advanceTo('style')}
                          className="mt-3 text-sm font-semibold text-sr-terra underline underline-offset-4 hover:text-sr-terra/80 transition-colors"
                        >
                          ← Pick fewer styles to stage now
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Informational credit-hint when they DO have enough. Shows
                    both cost + post-stage balance so the trade-off is clear. */}
                {hasEnoughCredits && !isAdmin && (
                  <p className="text-sm text-sr-ink text-center font-medium">
                    Uses {creditsNeeded} credit{creditsNeeded === 1 ? '' : 's'} · {userCredits - creditsNeeded} remaining after
                  </p>
                )}

                {error && (
                  <p className="text-sm text-red-600 text-center" role="alert">
                    {error}
                  </p>
                )}
              </div>
            </WizardShell>
          )}

          {/* ───── GENERATING ───── */}
          {step === 'generating' && (
            <StagingWaitConcierge
              key="generating"
              heroImageUrl={heroSignedUrl ?? heroPhoto?.preview ?? ''}
              conciergeNotes={conciergeNotes}
            />
          )}

        </AnimatePresence>
      </main>

      <PickListingDialog
        open={pickListingOpen}
        onCancel={() => setPickListingOpen(false)}
        onPick={(id) => {
          setListingId(id);
          setPickListingOpen(false);
          // Pick is final — proceed straight into staging with the new
          // listingId. Pass it explicitly: this runStaging closed over the
          // pre-pick listingId, so deferring the call doesn't help.
          runStaging(id);
        }}
      />
    </div>
  );
}

// Submit-time confirmation when the user hasn't picked a listing. Mirrors the
// Listing picker dialog. Fires when the user tries to submit a stage
// without having picked a listing. No "Save without a listing" escape
// hatch — every staging goes into a real listing. Inline path to
// create a new listing if none exist (or none match).
function PickListingDialog({
  open,
  onCancel,
  onPick,
}: {
  open: boolean;
  onCancel: () => void;
  onPick: (listingId: string) => void;
}) {
  const lastFocusRef = useRef<HTMLElement | null>(null);
  const [listings, setListings] = useState<ListingTile[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!open) return;
    lastFocusRef.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    setLoading(true);
    fetch('/api/listings')
      .then((r) => (r.ok ? r.json() : { listings: [] }))
      .then((data) => setListings(data.listings ?? []))
      .catch(() => setListings([]))
      .finally(() => setLoading(false));
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      lastFocusRef.current?.focus();
    };
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="fixed inset-0 bg-brand-navy/50 backdrop-blur-sm z-50"
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Pick a listing"
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: '0%' }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className={cn(
              'fixed z-50 left-1/2 -translate-x-1/2',
              'bottom-0 w-full sm:w-[480px] sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2',
              'bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl p-5 sm:p-6 max-h-[85vh] flex flex-col',
            )}
            style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
          >
            <div
              className="sm:hidden mx-auto w-10 h-1 rounded-full bg-surface-border mb-4"
              aria-hidden
            />
            <div className="flex justify-between items-start gap-3 mb-3">
              <h2 className="font-heading text-lg sm:text-xl text-brand-navy tracking-tight">
                Pick a listing
              </h2>
              <button
                type="button"
                onClick={onCancel}
                aria-label="Close"
                className="text-ink-muted hover:text-brand-navy text-xl leading-none px-1"
              >
                ×
              </button>
            </div>
            <p className="text-sm text-ink-secondary leading-relaxed">
              Where should this staging land?
            </p>

            <div className="mt-4 flex-1 overflow-y-auto -mx-1 px-1">
              {loading ? (
                <p className="text-sm text-ink-muted py-6 text-center">Loading your listings…</p>
              ) : listings.length === 0 ? (
                <p className="text-sm text-ink-muted py-6 text-center">
                  You don&apos;t have any listings yet. Create one below to continue.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {listings.map((l) => (
                    <li key={l.id}>
                      <button
                        type="button"
                        onClick={() => onPick(l.id)}
                        className="w-full text-left rounded-xl border border-sr-hairline bg-white px-3.5 py-3 hover:border-sr-terra/40 hover:bg-sr-terra/[0.04] transition-colors"
                      >
                        <p className="font-medium text-sr-ink text-sm leading-snug">{l.name}</p>
                        {l.imageCount > 0 && (
                          <p className="mt-0.5 text-xs text-sr-ink-mute">
                            {l.imageCount} staged image{l.imageCount === 1 ? '' : 's'}
                          </p>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-5 pt-4 border-t border-surface-border">
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="w-full rounded-xl bg-brand-navy text-white px-5 py-3 text-sm font-semibold hover:bg-brand-navy-light transition-colors"
              >
                Create new listing
              </button>
            </div>
          </motion.div>
          <NewListingDialog
            open={showCreate}
            onClose={() => setShowCreate(false)}
            onCreated={(newListing) => {
              setShowCreate(false);
              onPick(newListing.id);
            }}
          />
        </>
      )}
    </AnimatePresence>
  );
}

// Pick the best thumbnail room category based on the user's room-type selection.
// Living-family rooms get the living-room thumbnail set; everything else falls
// back to bedroom as a general style indicator.
function roomCategoryFor(roomTypes: RoomType[]): ThumbnailRoom {
  const livingTypes: RoomType[] = ['Living Room', 'Dining Room', 'Studio'];
  return roomTypes.some((r) => livingTypes.includes(r)) ? 'living' : 'bedroom';
}

export default function StagePage() {
  return (
    <Suspense fallback={
      <div className="min-h-[100dvh] bg-surface-secondary flex items-center justify-center">
        <div className="size-8 border-2 border-brand-teal border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <StagePageInner />
    </Suspense>
  );
}
