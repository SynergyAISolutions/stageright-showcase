'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import type { ListingIntent, ListingsPerMonth, PropertyType, Role } from '@/types';
import { Eyebrow } from './eyebrow';
import { OnboardingShell } from './onboarding-shell';

const EXPO = [0.16, 1, 0.3, 1] as const;

export type HeldOnboardingState = {
  role: Role | null;
  listingsPerMonth: ListingsPerMonth | null;
  listingIntent: ListingIntent | null;
  propertyType: PropertyType | null;
};

type Phase = 'form' | 'code';

export function SignupScreen({
  heldState,
  onBack,
}: {
  heldState: HeldOnboardingState;
  onBack: () => void;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('form');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [emailExists, setEmailExists] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [resending, setResending] = useState(false);
  const [resentAt, setResentAt] = useState<number | null>(null);
  const showResentLabel = resentAt !== null;

  // The "Code resent" confirmation label sticks for 3s, then the button
  // returns to "Resend". Without this effect the label would never reset
  // unless the user typed in the code field (which would re-render).
  useEffect(() => {
    if (resentAt === null) return;
    const t = setTimeout(() => setResentAt(null), 3000);
    return () => clearTimeout(t);
  }, [resentAt]);

  async function handleSignup(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEmailExists(false);
    if (password !== confirmPassword) {
      setError('Passwords don’t match.');
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      if (r.status === 409) {
        setEmailExists(true);
        setError('This email already has an account.');
        return;
      }
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setError(data.error ?? 'Could not create your account.');
        return;
      }
      setPhase('code');
    } catch {
      setError('Network error. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirm(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const r = await fetch('/api/auth/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, password }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setError(data.error ?? 'Could not confirm your email.');
        return;
      }
      // Cognito edge case: confirmSignUp succeeded but signIn returned no
      // tokens (MFA / custom challenges). /api/auth/confirm omits redirectTo
      // in that path. Without cookies the progress flush would 401 anyway,
      // so we deliberately skip it and bounce to /login. Held onboarding
      // answers are lost in this rare path — preserving them across an
      // unauthenticated bounce is the sessionStorage-stash work explicitly
      // deferred in the spec.
      const confirmData = await r.json().catch(() => ({}));
      if (!confirmData.redirectTo) {
        router.push('/login');
        return;
      }
      const patch: Partial<HeldOnboardingState> = {};
      if (heldState.role) patch.role = heldState.role;
      if (heldState.listingsPerMonth) patch.listingsPerMonth = heldState.listingsPerMonth;
      if (heldState.listingIntent) patch.listingIntent = heldState.listingIntent;
      if (heldState.propertyType) patch.propertyType = heldState.propertyType;
      if (Object.keys(patch).length > 0) {
        await fetch('/api/onboarding/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        }).catch(() => {});
      }
      // Mark onboarding complete now that cookies are live. The earlier
      // call from the 'generating' step 401s for anonymous users (no
      // session yet); without this retry the dashboard's
      // !onboardingCompletedAt redirect would loop them back to /onboarding.
      await fetch('/api/onboarding/complete', { method: 'POST' }).catch(() => {});
      router.push('/dashboard');
    } catch {
      setError('Network error. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (resending) return;
    setError(null);
    setResending(true);
    try {
      const r = await fetch('/api/auth/resend-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setError(data.error ?? 'Could not resend the code.');
        return;
      }
      setResentAt(Date.now());
    } catch {
      setError('Network error. Try again.');
    } finally {
      setResending(false);
    }
  }

  const ctaLabel =
    phase === 'form'
      ? submitting
        ? 'Saving…'
        : 'Continue'
      : submitting
        ? 'Confirming…'
        : 'Confirm';

  return (
    <OnboardingShell narrow>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setEmailExists(false);
          if (phase === 'code') setPhase('form');
          else onBack();
        }}
        aria-label="Back"
        className="absolute top-4 left-4 sm:top-6 sm:left-6 text-sr-ink/60 hover:text-sr-ink transition-colors z-10"
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
          <path d="M13 5l-6 6 6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <AnimatePresence mode="wait">
        {phase === 'form' ? (
          <motion.form
            key="form"
            id="signup-form"
            onSubmit={handleSignup}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.7, ease: EXPO }}
            className="w-full flex flex-col items-center text-center"
          >
            <Eyebrow>Almost there</Eyebrow>

            <h1 className="mt-3 font-display text-sr-ink text-[32px] sm:text-[40px] leading-[1.05] tracking-[-0.025em]">
              Access your <span className="italic text-sr-terra">account</span>.
            </h1>

            <p className="mt-4 text-[14px] sm:text-[15px] text-sr-ink/70 leading-snug max-w-[36ch]">
              Your gallery and your free credits are ready.
            </p>

            {/* Form card — gives the signup form proper visual containment
                on desktop so it doesn't float in cream. On mobile the card
                still applies but reads as a subtle panel within the
                full-bleed scroll. */}
            <div className="mt-7 w-full bg-sr-surface border border-sr-hairline rounded-2xl shadow-[0_30px_60px_-32px_rgba(31,53,57,0.18)] p-6 sm:p-7 flex flex-col gap-3.5 text-left">
              <label className="block">
                <span className="block text-[11px] font-medium text-sr-ink-mute uppercase tracking-[0.18em] mb-1.5">Name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full text-[15px] text-sr-ink bg-sr-cream-soft border border-sr-hairline rounded-xl px-3.5 py-3 focus:outline-none focus:ring-2 focus:ring-sr-terra/30 focus:border-sr-terra/40"
                />
              </label>

              <label className="block">
                <span className="block text-[11px] font-medium text-sr-ink-mute uppercase tracking-[0.18em] mb-1.5">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full text-[15px] text-sr-ink bg-sr-cream-soft border border-sr-hairline rounded-xl px-3.5 py-3 focus:outline-none focus:ring-2 focus:ring-sr-terra/30 focus:border-sr-terra/40"
                />
              </label>

              <label className="block">
                <span className="block text-[11px] font-medium text-sr-ink-mute uppercase tracking-[0.18em] mb-1.5">Create password</span>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="w-full text-[15px] text-sr-ink bg-sr-cream-soft border border-sr-hairline rounded-xl px-3.5 py-3 pr-11 focus:outline-none focus:ring-2 focus:ring-sr-terra/30 focus:border-sr-terra/40"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute inset-y-0 right-0 flex items-center justify-center w-11 text-sr-ink-mute hover:text-sr-ink transition-colors"
                  >
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                        <path d="M3 3l14 14M8.5 4.2A9 9 0 0110 4c4 0 7.5 3 9 6a10.5 10.5 0 01-2.1 2.9M6.1 6.1A10.4 10.4 0 001 10c1.5 3 5 6 9 6 1.5 0 2.9-.4 4.1-1M8.5 8.5a2 2 0 002.8 2.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                        <path d="M1 10c1.5-3 5-6 9-6s7.5 3 9 6c-1.5 3-5 6-9 6s-7.5-3-9-6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                        <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
                      </svg>
                    )}
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-sr-ink-mute">Min 8 characters &middot; upper &middot; lower &middot; number</p>
              </label>

              <label className="block">
                <span className="block text-[11px] font-medium text-sr-ink-mute uppercase tracking-[0.18em] mb-1.5">Confirm password</span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  aria-invalid={confirmPassword.length > 0 && confirmPassword !== password ? true : undefined}
                  className="w-full text-[15px] text-sr-ink bg-sr-cream-soft border border-sr-hairline rounded-xl px-3.5 py-3 focus:outline-none focus:ring-2 focus:ring-sr-terra/30 focus:border-sr-terra/40 aria-[invalid=true]:border-red-300 aria-[invalid=true]:focus:ring-red-200"
                />
                {confirmPassword.length > 0 && confirmPassword !== password && (
                  <p className="mt-1.5 text-[11px] text-red-700">Passwords don&apos;t match yet.</p>
                )}
              </label>

              {error && (
                <div className="text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
                  {error}
                  {emailExists && (
                    <>
                      {' '}
                      <Link href="/login" className="font-medium text-red-800 underline">Log in</Link>
                    </>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="mt-2 w-full inline-flex items-center justify-center gap-2 bg-sr-ink text-sr-cream-soft px-6 py-3.5 rounded-xl text-[15px] font-medium hover:bg-sr-ink-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {ctaLabel}
                {!submitting && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            </div>

            <Link
              href="/login"
              className="mt-6 text-[13px] text-sr-ink/60 hover:text-sr-ink"
            >
              Already have an account? <span className="text-sr-terra font-medium">Log in</span>
            </Link>
          </motion.form>
        ) : (
          <motion.form
            key="code"
            id="signup-form"
            onSubmit={handleConfirm}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.7, ease: EXPO }}
            className="w-full flex flex-col items-center text-center"
          >
            <Eyebrow>Check your email</Eyebrow>

            <h1 className="mt-3 font-display text-sr-ink text-[32px] sm:text-[40px] leading-[1.05] tracking-[-0.025em]">
              We sent a <span className="italic text-sr-terra">code</span>.
            </h1>

            <p className="mt-4 text-[14px] sm:text-[15px] text-sr-ink/70 leading-snug max-w-[36ch]">
              Six digits, headed to <span className="text-sr-ink font-medium">{email}</span>.
            </p>

            <div className="mt-7 w-full bg-sr-surface border border-sr-hairline rounded-2xl shadow-[0_30px_60px_-32px_rgba(31,53,57,0.18)] p-6 sm:p-7 flex flex-col items-center gap-5">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                required
                maxLength={6}
                placeholder="123456"
                className="w-full max-w-[20ch] text-center text-2xl tracking-[0.5em] text-sr-ink bg-sr-cream-soft border border-sr-hairline rounded-xl px-3.5 py-3 focus:outline-none focus:ring-2 focus:ring-sr-terra/30 focus:border-sr-terra/40"
              />

              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="text-[13px] text-sr-ink/60 hover:text-sr-ink disabled:opacity-50"
              >
                {showResentLabel ? 'Code resent' : resending ? 'Sending…' : 'Didn’t get it? Resend'}
              </button>

              {error && (
                <div className="w-full text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5 text-left">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 bg-sr-ink text-sr-cream-soft px-6 py-3.5 rounded-xl text-[15px] font-medium hover:bg-sr-ink-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {ctaLabel}
                {!submitting && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </OnboardingShell>
  );
}
