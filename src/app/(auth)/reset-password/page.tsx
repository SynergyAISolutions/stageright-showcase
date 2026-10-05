'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/auth-shell';

const RESET_EMAIL_KEY = 'sr_reset_email';
const RESEND_COOLDOWN_SECONDS = 30;
const GENERIC_ERROR = 'Something went wrong. Try again shortly.';

function clearStoredEmail() {
  try {
    sessionStorage.removeItem(RESET_EMAIL_KEY);
  } catch {
    // Storage unavailable; nothing to clear.
  }
}

export default function ResetPasswordPage() {
  const [storedEmail, setStoredEmail] = useState<string | null>(null);
  const [storageChecked, setStorageChecked] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Read the email the forgot-password page stored. Done after mount so the
  // server render and the first client render match.
  useEffect(() => {
    try {
      const value = sessionStorage.getItem(RESET_EMAIL_KEY);
      if (value) setStoredEmail(value);
    } catch {
      // Storage unavailable; the email field is shown instead.
    }
    setStorageChecked(true);
  }, []);

  // One-second countdown for the resend cooldown. The cleanup clears the
  // pending tick on every change and on unmount.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const resolvedEmail = (storedEmail ?? email).trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resolvedEmail, code, password }),
      });
      const data: { error?: string; redirectTo?: string } = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || GENERIC_ERROR);
      }

      clearStoredEmail();

      if (data.redirectTo && data.redirectTo.startsWith('/') && !data.redirectTo.startsWith('//')) {
        window.location.href = data.redirectTo;
        return;
      }

      setDone(true);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : GENERIC_ERROR);
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    if (!resolvedEmail) {
      setError('Enter your email first.');
      return;
    }

    setResending(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resolvedEmail }),
      });

      if (!res.ok) {
        const data: { error?: string } = await res.json().catch(() => ({}));
        throw new Error(data.error || GENERIC_ERROR);
      }

      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(err instanceof Error ? err.message : GENERIC_ERROR);
    } finally {
      setResending(false);
    }
  };

  if (done) {
    return (
      <AuthShell>
        <div className="text-center py-4">
          <div className="mx-auto size-12 rounded-full bg-sr-sage/15 flex items-center justify-center mb-4 text-sr-sage-deep">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M4 10l4 4 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="font-display text-xl text-sr-ink">Password updated</h1>
          <p className="mt-2 text-sm text-sr-ink-mute">Log in with your new password.</p>
          <Link
            href="/login"
            className="mt-6 inline-block w-full bg-sr-ink text-white font-medium text-sm py-3 rounded-xl hover:bg-sr-ink-2 active:scale-[0.98] transition-all duration-150 text-center"
          >
            Log in
          </Link>
        </div>
      </AuthShell>
    );
  }

  const showEmailField = storageChecked && !storedEmail;

  return (
    <AuthShell
      footer={
        <p className="mt-6 text-center text-sm text-sr-ink-mute">
          Remembered it?{' '}
          <Link href="/login" className="text-sr-terra font-medium hover:underline">
            Log in
          </Link>
        </p>
      }
    >
      <h1 className="font-display text-xl text-sr-ink tracking-tight text-center">
        Check your email
      </h1>
      <p className="mt-1 text-sm text-sr-ink-mute text-center">
        {storedEmail
          ? `If an account exists for ${storedEmail}, a 6-digit code is on its way.`
          : 'Enter the 6-digit code we emailed you.'}
      </p>
      <p className="mt-2 text-xs text-sr-ink-mute text-center">
        It comes from no-reply@verificationemail.com. Check spam if you can&apos;t see it.
      </p>
      {storedEmail && (
        <p className="mt-2 text-center text-xs">
          <Link href="/forgot-password" className="text-sr-terra font-medium hover:underline">
            Use a different email
          </Link>
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        {/* Lets password managers save the new password against the right
            account when the email field is not shown. */}
        {storedEmail && (
          <input
            type="text"
            name="username"
            autoComplete="username"
            value={storedEmail}
            readOnly
            tabIndex={-1}
            aria-hidden="true"
            className="hidden"
          />
        )}
        {showEmailField && (
          <div>
            <label
              htmlFor="reset-email"
              className="block text-xs font-medium text-sr-ink-mute uppercase tracking-wider mb-1.5"
            >
              Email
            </label>
            <input
              id="reset-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full text-sm text-ink bg-sr-cream-soft border border-sr-hairline rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-sr-terra/30 focus:border-sr-terra/40"
            />
          </div>
        )}

        <div>
          <label
            htmlFor="reset-code"
            className="block text-xs font-medium text-sr-ink-mute uppercase tracking-wider mb-1.5"
          >
            Code
          </label>
          <input
            id="reset-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="123456"
            required
            className="w-full text-sm text-ink bg-sr-cream-soft border border-sr-hairline rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-sr-terra/30 focus:border-sr-terra/40 text-center text-lg tracking-widest"
          />
        </div>

        <div>
          <label
            htmlFor="reset-new-password"
            className="block text-xs font-medium text-sr-ink-mute uppercase tracking-wider mb-1.5"
          >
            New password
          </label>
          <div className="relative">
            <input
              id="reset-new-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full text-sm text-ink bg-sr-cream-soft border border-sr-hairline rounded-xl px-3.5 py-2.5 pr-11 focus:outline-none focus:ring-2 focus:ring-sr-terra/30 focus:border-sr-terra/40"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute inset-y-0 right-0 flex items-center justify-center w-11 text-sr-ink-mute hover:text-ink transition-colors"
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
          <p className="mt-1 text-xs text-sr-ink-mute">
            Min 8 characters, uppercase, lowercase, number
          </p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-sr-ink text-white font-medium text-sm py-3 rounded-xl hover:bg-sr-ink-2 active:scale-[0.98] transition-all duration-150 disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Set new password'}
        </button>

        <div className="text-center">
          <button
            type="button"
            onClick={handleResend}
            disabled={resending || cooldown > 0}
            className="text-xs font-medium text-sr-terra hover:underline disabled:text-sr-ink-mute disabled:no-underline disabled:cursor-default"
          >
            {cooldown > 0
              ? `New code sent. You can send another in ${cooldown}s`
              : 'Send a new code'}
          </button>
          {/* Announced once per send. The visible countdown is deliberately not
              a live region, or screen readers would read it every second. */}
          <span role="status" className="sr-only">
            {cooldown > 0 ? 'New code sent.' : ''}
          </span>
        </div>
      </form>
    </AuthShell>
  );
}
