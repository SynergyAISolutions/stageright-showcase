'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { FlagReview } from '@/types';

interface ReviewLightboxProps {
  review: FlagReview | null;
  onClose: () => void;
}

export function ReviewLightbox({ review, onClose }: ReviewLightboxProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!review) return;
    lastFocusRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      lastFocusRef.current?.focus();
    };
  }, [review, onClose]);

  return (
    <AnimatePresence>
      {review && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-brand-navy/80 z-50"
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Full-size comparison"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="fixed inset-0 sm:inset-10 z-50 bg-white sm:rounded-xl overflow-hidden flex flex-col"
          >
            <header className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
              <div>
                <h2 className="font-heading text-lg text-brand-navy">
                  {review.userEmail} · {review.style}
                </h2>
                <p className="text-xs text-ink-muted">Tap or press Escape to close</p>
              </div>
              <button
                type="button"
                ref={closeRef}
                onClick={onClose}
                aria-label="Close"
                className="text-ink-muted hover:text-brand-navy text-2xl px-2"
              >
                ×
              </button>
            </header>
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2 p-2 overflow-auto">
              <LightboxImg label="Original" s3Key={review.originalS3Key} />
              <LightboxImg label="Staged" s3Key={review.stagedS3Key} />
            </div>
            {review.userNote && (
              <footer className="border-t border-surface-border px-4 py-3 bg-surface-secondary">
                <p className="text-xs font-bold tracking-widest uppercase text-ink-muted mb-1">
                  User note
                </p>
                <p className="text-sm text-ink italic">{review.userNote}</p>
              </footer>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function LightboxImg({ label, s3Key }: { label: string; s3Key: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!s3Key) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/upload/signed?key=${encodeURIComponent(s3Key)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setUrl(data?.url || null);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [s3Key]);

  return (
    <div className="relative bg-surface-secondary rounded-lg overflow-hidden">
      <span className="absolute top-2 left-2 text-[10px] font-bold tracking-widest uppercase bg-black/60 text-white px-2 py-1 rounded z-10">
        {label}
      </span>
      {url ? (
        <img src={url} alt={label} className="w-full h-full object-contain" />
      ) : null}
    </div>
  );
}
