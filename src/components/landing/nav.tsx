'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';

const NAV_LINKS = [
  { href: '#how-it-works', label: 'How it works', num: '01' },
  { href: '#styles', label: 'Styles', num: '02' },
  { href: '#pricing', label: 'Pricing', num: '03' },
  { href: '#faq', label: 'FAQ', num: '04' },
] as const;

const LogoMark = () => (
  <Image
    src="/icons/android/logo-mark-light.png"
    alt=""
    width={36}
    height={36}
    priority
    className="size-9 shrink-0 object-contain"
  />
);

export function Nav() {
  const [mobileOpen, setMobileOpen] = useState(false);

  // No scrolled-state conditional. The nav always renders with the
  // translucent cream + backdrop-blur + hairline border. Two reasons:
  // (a) at the top of the page the blueprint grid was showing through
  // a transparent nav as sharp horizontal lines crossing the chrome,
  // (b) the snap from transparent → blurred-cream at scrollY > 24px
  // produced a visible flash that transition-colors couldn't smooth
  // over (backdrop-filter doesn't transition cleanly).
  return (
    <nav
      className="sticky top-0 inset-x-0 z-50 bg-sr-cream/85 backdrop-blur-xl border-b border-sr-hairline"
    >
      <div className="mx-auto max-w-[1240px] px-5 sm:px-10">
        <div className="flex h-16 sm:h-[72px] items-center justify-between gap-6">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2.5 text-sr-ink"
            aria-label="StageRight home"
          >
            <LogoMark />
            <span className="font-display text-[22px] leading-none tracking-[-0.015em] text-sr-ink"
              style={{ fontVariationSettings: '"opsz" 96, "SOFT" 50' }}
            >
              Stage
              <em className="not-italic font-display text-sr-terra italic font-light"
                style={{ fontVariationSettings: '"opsz" 96, "SOFT" 80' }}
              >
                Right
              </em>
            </span>
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="font-mono text-[11.5px] font-medium uppercase tracking-[0.14em] text-sr-ink-soft hover:text-sr-terra transition-colors py-2"
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* Desktop CTAs — single primary, killing the dual-button fight */}
          <div className="hidden md:flex items-center gap-5 isolate">
            <Link
              href="/login"
              className="text-sm text-sr-ink-soft hover:text-sr-ink transition-colors relative
                after:absolute after:left-0 after:-bottom-0.5 after:w-full after:h-px after:bg-sr-ink
                after:scale-x-0 after:origin-right hover:after:scale-x-100 hover:after:origin-left
                after:transition-transform after:duration-300"
            >
              Sign in
            </Link>
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-2 bg-sr-ink text-sr-cream-soft px-[18px] py-[11px] rounded text-sm font-medium hover:bg-sr-ink-2 hover:-translate-y-px transition-all duration-200 shadow-[0_4px_14px_-6px_rgba(31,53,57,0.25)]"
            >
              Get started
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="transition-transform group-hover:translate-x-0.5">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden flex flex-col items-center justify-center gap-1.5 size-10 -mr-2"
            aria-label="Toggle menu"
          >
            <motion.span
              animate={mobileOpen ? { rotate: 45, y: 6 } : { rotate: 0, y: 0 }}
              className="block w-5 h-0.5 bg-sr-ink origin-center"
            />
            <motion.span
              animate={mobileOpen ? { opacity: 0 } : { opacity: 1 }}
              className="block w-5 h-0.5 bg-sr-ink"
            />
            <motion.span
              animate={mobileOpen ? { rotate: -45, y: -6 } : { rotate: 0, y: 0 }}
              className="block w-5 h-0.5 bg-sr-ink origin-center"
            />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="md:hidden overflow-hidden bg-sr-cream border-t border-sr-hairline"
          >
            <div className="px-5 py-6 flex flex-col gap-1">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="font-display text-[22px] py-3 text-sr-ink border-b border-sr-hairline last:border-b-0"
                  style={{ fontVariationSettings: '"opsz" 48, "SOFT" 30' }}
                >
                  {link.label}
                </a>
              ))}
              <div className="mt-6 flex flex-col gap-3">
                <Link
                  href="/login"
                  className="text-base text-sr-ink-soft py-2"
                >
                  Sign in
                </Link>
                <Link
                  href="/onboarding"
                  className="inline-flex items-center justify-center gap-2 bg-sr-ink text-sr-cream-soft px-5 py-3.5 rounded text-base font-medium"
                >
                  Get started free
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
