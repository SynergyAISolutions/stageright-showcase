'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';

interface AuthShellProps {
  /** Card content. */
  children: ReactNode;
  /** Optional line rendered under the card. */
  footer?: ReactNode;
}

/**
 * Page background, fade-in wrapper, StageRight lockup and white card,
 * lifted verbatim from the login page so the auth screens render identically.
 */
export function AuthShell({ children, footer }: AuthShellProps) {
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
          {children}
        </div>

        {footer}
      </motion.div>
    </div>
  );
}
