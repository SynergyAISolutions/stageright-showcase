'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthShell } from '@/components/auth/auth-shell';

const RESET_EMAIL_KEY = 'sr_reset_email';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Something went wrong. Try again shortly.');
      }

      try {
        sessionStorage.setItem(RESET_EMAIL_KEY, email.trim());
      } catch {
        // Storage can be unavailable (private mode, blocked site data). The
        // reset page falls back to asking for the email.
      }
      router.push('/reset-password');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again shortly.');
      setLoading(false);
    }
  };

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
        Reset your password
      </h1>
      <p className="mt-1 text-sm text-sr-ink-mute text-center">
        Enter your email and we&apos;ll send you a code
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <div>
          <label
            htmlFor="forgot-email"
            className="block text-xs font-medium text-sr-ink-mute uppercase tracking-wider mb-1.5"
          >
            Email
          </label>
          <input
            id="forgot-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full text-sm text-ink bg-sr-cream-soft border border-sr-hairline rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-sr-terra/30 focus:border-sr-terra/40"
          />
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
          {loading ? 'Sending...' : 'Send code'}
        </button>

        <p className="text-center text-xs text-sr-ink-mute">
          <Link href="/reset-password" className="text-sr-terra font-medium hover:underline">
            Already have a code? Enter it
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
