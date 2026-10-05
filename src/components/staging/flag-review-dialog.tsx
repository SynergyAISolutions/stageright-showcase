'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils/cn';

interface FlagReviewDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmitted: () => void;
  sessionId: string;
}

export function FlagReviewDialog({
  open, onClose, onSubmitted, sessionId,
}: FlagReviewDialogProps) {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    lastFocusRef.current = document.activeElement as HTMLElement | null;
    textareaRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      lastFocusRef.current?.focus();
    };
  }, [open, onClose]);

  const submit = useCallback(async () => {
    setSubmitting(true); setError(null);
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, userNote: note }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not submit review');
      }
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit');
    } finally {
      setSubmitting(false);
    }
  }, [sessionId, note, onSubmitted]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-brand-navy/50 backdrop-blur-sm z-50"
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Flag this staging for review"
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: '0%' }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className={cn(
              'fixed z-50 left-1/2 -translate-x-1/2',
              'bottom-0 w-full sm:w-[440px] sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2',
              'bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl p-5 sm:p-6',
            )}
            style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
          >
            <div className="sm:hidden mx-auto w-10 h-1 rounded-full bg-surface-border mb-4" aria-hidden />
            <div className="flex justify-between items-start gap-3 mb-2">
              <h2 className="font-heading text-lg sm:text-xl text-brand-navy">Flag this staging for review</h2>
              <button type="button" onClick={onClose} aria-label="Close" className="text-ink-muted hover:text-brand-navy text-xl leading-none px-1">×</button>
            </div>
            <p className="text-sm text-ink-secondary leading-relaxed mb-4">
              Our team will review the original and staged photos. If we agree the structure was changed, <b className="text-brand-navy">your credit will be refunded</b> and we will let you know by email within 24 hours.
            </p>
            <label htmlFor="flag-note" className="block text-[11px] font-bold tracking-widest uppercase text-brand-navy mb-2">
              What changed? (optional)
            </label>
            <textarea
              id="flag-note"
              ref={textareaRef}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              maxLength={500}
              placeholder="e.g. the window has moved / the kitchen splashback is different / a new doorway appeared"
              className="w-full text-sm text-ink bg-surface-secondary rounded-xl px-3 py-2.5 resize-none border border-transparent focus:border-brand-teal focus:bg-white focus:outline-none transition-colors"
            />
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={onClose} disabled={submitting} className="text-sm font-medium text-ink-muted hover:text-brand-navy px-4 py-2 rounded-xl border border-surface-border bg-white">
                Cancel
              </button>
              <button type="button" onClick={submit} disabled={submitting} className="text-sm font-medium text-white bg-brand-navy hover:bg-brand-navy-light px-5 py-2 rounded-xl disabled:opacity-50">
                {submitting ? 'Submitting…' : 'Submit for review'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
