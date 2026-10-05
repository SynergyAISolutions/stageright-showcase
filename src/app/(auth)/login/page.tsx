'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ADMIN_EMAILS } from '@/types';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Login failed');
      }

      // Admin accounts are routed straight back into the onboarding flow on
      // every login so the team can dogfood / re-test the funnel. Regular
      // users go to their dashboard as normal.
      if (ADMIN_EMAILS.includes(email.trim().toLowerCase())) {
        router.push('/onboarding');
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-sr-cream-soft flex items-center justify-center px-5">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 25 }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 justify-center mb-10 text-sr-ink">
          <Image
            src="/icons/android/logo-mark-light.png"
            alt=""
            width={40}
            height={40}
            priority
            className="size-10 shrink-0 object-contain"
          />
          <span
            className="font-display text-[22px] leading-none tracking-[-0.015em]"
            style={{ fontVariationSettings: '"opsz" 96, "SOFT" 50' }}
          >
            Stage
            <em
              className="not-italic font-display text-sr-terra italic font-light"
              style={{ fontVariationSettings: '"opsz" 96, "SOFT" 80' }}
            >
              Right
            </em>
          </span>
        </Link>

        <div className="bg-white rounded-2xl border border-sr-hairline shadow-soft p-7">
          <h1 className="font-display text-xl text-sr-ink tracking-tight text-center">
            Welcome back
          </h1>
          <p className="mt-1 text-sm text-sr-ink-mute text-center">
            Log in to stage your rooms
          </p>

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            <div>
              <label className="block text-xs font-medium text-sr-ink-mute uppercase tracking-wider mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full text-sm text-ink bg-sr-cream-soft border border-sr-hairline rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-sr-terra/30 focus:border-sr-terra/40"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-sr-ink-mute uppercase tracking-wider">
                  Password
                </label>
                <Link href="/forgot-password" className="text-xs font-medium text-sr-terra hover:underline">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
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
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-sr-ink text-white font-medium text-sm py-3 rounded-xl hover:bg-sr-ink-2 active:scale-[0.98] transition-all duration-150 disabled:opacity-50"
            >
              {loading ? 'Logging in...' : 'Log in'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-sr-ink-mute">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-sr-terra font-medium hover:underline">
            Sign up
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
