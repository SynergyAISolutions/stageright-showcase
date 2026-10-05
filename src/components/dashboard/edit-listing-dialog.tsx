'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils/cn';

// Edit dialog for an existing listing's name + address ("labels"). Mirrors
// NewListingDialog's chrome exactly (portal to body, bottom-sheet on mobile /
// centred card on desktop, focus + scroll-lock + Esc), but pre-fills the
// fields and PATCHes /api/listings/[id] instead of creating. The in-app modal
// pattern is mandatory here — never a browser-native prompt.
export function EditListingDialog({
  open,
  onClose,
  listingId,
  initialName,
  initialAddress,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  listingId: string;
  initialName: string;
  initialAddress?: string;
  onSaved: (next: { name: string; address: string }) => void;
}) {
  const [name, setName] = useState(initialName);
  const [address, setAddress] = useState(initialAddress ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const lastFocusRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // SSR guard for createPortal (document is undefined on the server).
  useEffect(() => { setMounted(true); }, []);

  // Re-seed the fields from the current listing each time the dialog opens, so
  // a cancelled edit never leaves stale text behind on the next open.
  useEffect(() => {
    if (!open) {
      setError(null);
      return;
    }
    setName(initialName);
    setAddress(initialAddress ?? '');
    lastFocusRef.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 80);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      lastFocusRef.current?.focus();
    };
  }, [open, onClose, initialName, initialAddress]);

  const submit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const trimmedAddress = address.trim();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/listings/${listingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName, address: trimmedAddress }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not save changes');
      }
      onSaved({ name: trimmedName, address: trimmedAddress });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes');
    } finally {
      setSaving(false);
    }
  };

  if (!mounted) return null;

  const dirty =
    name.trim() !== initialName.trim() ||
    address.trim() !== (initialAddress ?? '').trim();

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
              aria-label="Edit listing"
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
                    Edit listing
                  </h2>
                  <p className="text-sm text-sr-ink-soft mt-1">
                    Rename the property or update its address
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
                    htmlFor="edit-listing-name"
                    className="block text-[11px] font-bold tracking-widest uppercase text-sr-ink mb-2"
                  >
                    Listing name
                  </label>
                  <input
                    ref={inputRef}
                    id="edit-listing-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && name.trim() && !saving) {
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
                    htmlFor="edit-listing-address"
                    className="block text-[11px] font-bold tracking-widest uppercase text-sr-ink mb-2"
                  >
                    Address <span className="text-sr-ink-mute font-normal normal-case tracking-normal">(optional)</span>
                  </label>
                  <input
                    id="edit-listing-address"
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && name.trim() && !saving) {
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

              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={submit}
                  disabled={!name.trim() || !dirty || saving}
                  className="rounded-xl bg-sr-ink text-white px-5 py-2.5 text-sm font-medium disabled:opacity-50 hover:bg-sr-ink-2 transition-colors"
                >
                  {saving ? 'Saving…' : 'Save changes'}
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
