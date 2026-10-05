'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils/cn';
import { type ListingTile } from './listings-grid';

export function NewListingDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (listing: ListingTile) => void;
}) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const lastFocusRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // SSR guard. createPortal needs document, which is undefined during the
  // server render. Without this we'd hydrate a node that doesn't exist on
  // the server.
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) {
      setName('');
      setAddress('');
      setError(null);
      return;
    }
    lastFocusRef.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Focus the name input shortly after the dialog mounts
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      lastFocusRef.current?.focus();
    };
  }, [open, onClose]);

  const submit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          ...(address.trim() ? { address: address.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not create listing');
      }
      const { listing } = await res.json();
      onCreated({
        ...listing,
        imageCount: 0,
        sourceCount: 0,
        lastActivityAt: listing.createdAt,
        coverUrl: null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create listing');
    } finally {
      setCreating(false);
    }
  };

  if (!mounted) return null;

  // Portal to document.body so the fixed-positioned dialog escapes any
  // transformed ancestor (the dashboard wraps the listings grid in a
  // <motion.div>, which has a CSS transform — and `position: fixed`
  // becomes relative to the nearest transformed ancestor instead of the
  // viewport, which was offsetting the dialog right-of-centre on
  // desktop and clipping it off-screen on mobile).
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-sr-ink/50 backdrop-blur-sm z-50"
            aria-hidden
          />
          {/* Centering wrapper — owns the fixed positioning and the
              translate-to-centre. We have to keep these OFF the motion.div
              because framer-motion's animated `y` writes an inline
              `transform: translateY(...)` that clobbers Tailwind's
              `-translate-x-1/2` / `-translate-y-1/2`. The result was the
              left edge of the dialog landing at 50% of the viewport (so
              right-of-centre on desktop, half off-screen-right on mobile)
              once the entrance animation set y to 0%. */}
          <div
            className={cn(
              'fixed z-50 left-1/2 -translate-x-1/2',
              'bottom-0 w-full sm:w-[440px] sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2',
              'pointer-events-none',
            )}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="New listing"
              initial={{ opacity: 0, y: '100%' }}
              animate={{ opacity: 1, y: '0%' }}
              exit={{ opacity: 0, y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl p-5 sm:p-6 pointer-events-auto"
              style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
            >
            <div
              className="sm:hidden mx-auto w-10 h-1 rounded-full bg-sr-hairline mb-4"
              aria-hidden
            />
            <div className="flex justify-between items-start gap-3 mb-5">
              <div>
                <h2 className="font-display text-lg sm:text-xl text-sr-ink tracking-tight">
                  New listing
                </h2>
                <p className="text-sm text-sr-ink-soft mt-1">
                  Group uploads by property
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="text-sr-ink-mute hover:text-sr-ink text-xl leading-none px-1"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="dashboard-new-listing-name"
                  className="block text-[11px] font-bold tracking-widest uppercase text-sr-ink mb-2"
                >
                  Listing name
                </label>
                <input
                  ref={inputRef}
                  id="dashboard-new-listing-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && name.trim() && !creating) {
                      e.preventDefault();
                      submit();
                    }
                  }}
                  placeholder="e.g. 12 Smith Street"
                  className="w-full rounded-xl border border-sr-hairline px-3 py-2.5 text-sm text-sr-ink placeholder:text-sr-ink-mute focus:outline-none focus:border-sr-terra transition-colors"
                />
              </div>

              <div>
                <label
                  htmlFor="dashboard-new-listing-address"
                  className="block text-[11px] font-bold tracking-widest uppercase text-sr-ink mb-2"
                >
                  Address <span className="text-sr-ink-mute font-normal normal-case tracking-normal">(optional)</span>
                </label>
                <input
                  id="dashboard-new-listing-address"
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && name.trim() && !creating) {
                      e.preventDefault();
                      submit();
                    }
                  }}
                  placeholder="Suburb, city"
                  className="w-full rounded-xl border border-sr-hairline px-3 py-2.5 text-sm text-sr-ink placeholder:text-sr-ink-mute focus:outline-none focus:border-sr-terra transition-colors"
                />
              </div>
            </div>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            {/* Single primary action. Dismiss is handled by the × (top
                right), the backdrop click, and Esc — a separate "Cancel"
                button was a third redundant dismiss. One dismiss vocabulary
                (×) across every modal in the app. */}
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={submit}
                disabled={!name.trim() || creating}
                className="rounded-xl bg-sr-ink text-white px-5 py-2.5 text-sm font-medium disabled:opacity-50 hover:bg-sr-ink-2 transition-colors"
              >
                {creating ? 'Creating…' : 'Create listing'}
              </button>
            </div>
          </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
