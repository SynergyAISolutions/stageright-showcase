'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, FolderOpen, Plus } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface Listing {
  id: string;
  name: string;
  address?: string;
}

interface Props {
  value: string; // 'unsorted' | listingId
  onChange: (id: string) => void;
  locked?: boolean;
}

export function ListingPill({ value, onChange, locked = false }: Props) {
  const [open, setOpen] = useState(false);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    fetch('/api/listings')
      .then((r) => r.json())
      .then((d) => setListings(d.listings || []))
      .catch(() => setError('Could not load listings'))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    lastFocusRef.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      lastFocusRef.current?.focus();
    };
  }, [open]);

  const selectedName =
    value === 'unsorted'
      ? 'Unsorted'
      : listings.find((l) => l.id === value)?.name || 'Listing';

  const isReal = value !== 'unsorted';

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not create listing');
      }
      const { listing } = await res.json();
      setListings((prev) => [listing, ...prev]);
      onChange(listing.id);
      setNewName('');
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create listing');
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={locked}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors',
          locked && 'cursor-default opacity-70',
          isReal
            ? 'border border-sr-terra/40 bg-sr-terra/[0.06] text-sr-ink'
            : 'bg-white border border-sr-ink/[0.10] text-sr-ink hover:border-sr-ink/[0.18]',
        )}
      >
        <FolderOpen className="w-4 h-4 text-sr-ink-mute" aria-hidden />
        <span>{selectedName}</span>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 bg-sr-ink/50 backdrop-blur-sm z-50"
              aria-hidden
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Choose a listing"
              initial={{ opacity: 0, y: '100%' }}
              animate={{ opacity: 1, y: '0%' }}
              exit={{ opacity: 0, y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className={cn(
                'fixed z-50 left-1/2 -translate-x-1/2',
                'bottom-0 w-full sm:w-[440px] sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2',
                'bg-white rounded-t-3xl sm:rounded-2xl shadow-[0_18px_48px_-12px_rgba(31,53,57,0.18)] border border-sr-hairline p-5 sm:p-6',
                'max-h-[85vh] sm:max-h-[80vh] flex flex-col',
              )}
              style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
            >
              <div
                className="sm:hidden mx-auto w-10 h-1 rounded-full bg-sr-hairline mb-4"
                aria-hidden
              />
              <div className="flex justify-between items-start gap-3 mb-4">
                <h2 className="font-display text-lg sm:text-xl text-sr-ink tracking-tight">
                  Choose a listing
                </h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="text-sr-ink-mute hover:text-sr-ink text-xl leading-none px-1"
                >
                  &times;
                </button>
              </div>

              <div className="flex-1 overflow-y-auto -mx-1 px-1">
                <button
                  type="button"
                  onClick={() => {
                    onChange('unsorted');
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full text-left p-3 rounded-xl flex items-center justify-between transition-colors',
                    value === 'unsorted'
                      ? 'bg-sr-terra/[0.10] text-sr-terra'
                      : 'text-sr-ink hover:bg-sr-cream',
                  )}
                >
                  <span>Unsorted</span>
                  {value === 'unsorted' && (
                    <Check className="w-4 h-4 text-sr-terra" aria-hidden />
                  )}
                </button>

                {loading && (
                  <div className="text-sr-ink-mute text-sm py-3 px-3">Loading&hellip;</div>
                )}

                {!loading &&
                  listings.map((l) => (
                    <button
                      type="button"
                      key={l.id}
                      onClick={() => {
                        onChange(l.id);
                        setOpen(false);
                      }}
                      className={cn(
                        'w-full text-left p-3 rounded-xl flex items-center justify-between gap-3 transition-colors',
                        value === l.id
                          ? 'bg-sr-terra/[0.10] text-sr-terra'
                          : 'text-sr-ink hover:bg-sr-cream',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{l.name}</span>
                        {l.address && (
                          <span className="block text-xs text-sr-ink-mute truncate">
                            {l.address}
                          </span>
                        )}
                      </span>
                      {value === l.id && (
                        <Check className="w-4 h-4 text-sr-terra flex-none" aria-hidden />
                      )}
                    </button>
                  ))}
              </div>

              <div className="mt-4 pt-4 border-t border-sr-hairline">
                <label
                  htmlFor="new-listing-name"
                  className="block text-[11px] font-bold tracking-widest uppercase text-sr-ink mb-2"
                >
                  New listing
                </label>
                <div className="flex gap-2">
                  <input
                    id="new-listing-name"
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newName.trim() && !creating) {
                        e.preventDefault();
                        handleCreate();
                      }
                    }}
                    placeholder="e.g. 12 Smith Street"
                    className="flex-1 rounded-xl border border-sr-hairline px-3 py-2 text-sm text-sr-ink placeholder:text-sr-ink-mute focus:outline-none focus:border-sr-terra focus:ring-2 focus:ring-sr-terra/20 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={!newName.trim() || creating}
                    className="rounded-xl bg-sr-ink text-white px-3 py-2 text-sm font-medium disabled:opacity-50 hover:bg-sr-ink-2 transition-colors inline-flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" aria-hidden />
                    {creating ? 'Creating…' : 'Create'}
                  </button>
                </div>
                {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
