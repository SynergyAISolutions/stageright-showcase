'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { TileGrid } from '@/components/interior/tile-grid';
import { Tile, NewTile } from '@/components/interior/tile';
import { EmptyEditorial } from '@/components/interior/empty-editorial';
import { DarkPillButton } from '@/components/interior/terra-pill-button';
import { FoldFadeContainer } from '@/components/interior/fold-fade-container';
import { NewListingDialog } from './new-listing-dialog';

export interface ListingTile {
  id: string;
  name: string;
  imageCount: number;
  sourceCount: number;
  lastActivityAt: string;
  coverS3Key?: string;
  coverUrl?: string | null;
  /** Original (empty) photo behind the cover, for the hover before/after. */
  coverOriginalUrl?: string | null;
  createdAt?: string;
}

export function ListingsGrid() {
  const [listings, setListings] = useState<ListingTile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/listings').then((r) => r.json());
        if (!alive) return;
        setListings(res.listings || []);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const handleCreated = (listing: ListingTile) => {
    setListings((prev) => [listing, ...prev]);
  };

  const handleDeleted = (id: string) => {
    setListings((prev) => prev.filter((l) => l.id !== id));
  };

  if (loading) {
    return (
      <TileGrid>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-xl overflow-hidden border border-sr-ink/[0.06] flex flex-col"
          >
            <div className="aspect-[4/3] bg-sr-cream-soft animate-pulse" />
            <div className="px-3 py-2.5 space-y-1.5">
              <div className="h-3 bg-sr-cream-soft rounded animate-pulse w-1/2" />
              <div className="h-2.5 bg-sr-cream-soft rounded animate-pulse w-1/3" />
            </div>
          </div>
        ))}
      </TileGrid>
    );
  }

  // Empty state
  if (listings.length === 0) {
    return (
      <>
        <div className="flex-1 min-h-0 flex flex-col">
          <EmptyEditorial
            eyebrow="Welcome in"
            heading={<>Ready when <em className="text-sr-terra italic">you</em> are.</>}
            sub="Group your stagings by property, name it, then upload."
            cta={
              <DarkPillButton onClick={() => setDialogOpen(true)}>
                Add a listing
              </DarkPillButton>
            }
          />
        </div>
        <NewListingDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onCreated={handleCreated}
        />
      </>
    );
  }

  // Populated
  return (
    <>
      <FoldFadeContainer className="flex-1 min-h-0">
        <TileGrid>
          {listings.map((l, i) => (
            <Tile
              key={l.id}
              coverUrl={l.coverUrl ?? null}
              hoverUrl={l.coverOriginalUrl ?? null}
              name={l.name}
              sub={`${l.sourceCount} ${l.sourceCount === 1 ? 'room' : 'rooms'}`}
              href={`/listings/${l.id}`}
              index={i}
              alt={l.name}
              menu={
                <ListingTileMenu
                  listingId={l.id}
                  listingName={l.name}
                  roomCount={l.sourceCount}
                  onDeleted={() => handleDeleted(l.id)}
                />
              }
            />
          ))}
          <NewTile
            label="New listing"
            onClick={() => setDialogOpen(true)}
            index={listings.length}
          />
        </TileGrid>
      </FoldFadeContainer>
      <NewListingDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={handleCreated}
      />
    </>
  );
}

/**
 * Per-tile overflow menu for listings. Mirrors the GalleryViewer room
 * menu vocabulary one level up: a ⋯ trigger → confirm → DELETE. The
 * trigger is a solid-dark pill (survives any cover image — see the
 * chrome-contrast convention) and stops click propagation so it never
 * triggers the tile's underlying listing-detail navigation. The confirm
 * dialog is portalled to document.body so it escapes the dashboard's
 * transformed <motion.div> ancestor (same fix as NewListingDialog).
 */
function ListingTileMenu({
  listingId,
  listingName,
  roomCount,
  onDeleted,
}: {
  listingId: string;
  listingName: string;
  roomCount: number;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const stop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  async function doDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/listings/${listingId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not delete listing');
      }
      setConfirming(false);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete listing');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div ref={ref} onClick={stop}>
      <button
        type="button"
        onClick={(e) => {
          stop(e);
          setOpen((v) => !v);
        }}
        aria-label="Listing actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className="size-7 rounded-full bg-sr-ink/85 text-white backdrop-blur-sm flex items-center justify-center text-sm leading-none font-bold hover:bg-sr-ink transition-colors shadow-[0_1px_3px_rgba(31,53,57,0.3)]"
      >
        ⋯
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-1.5 w-44 rounded-xl bg-white border border-sr-hairline shadow-[0_18px_48px_-12px_rgba(31,53,57,0.18)] origin-top-right z-20 p-1.5"
          >
            <button
              type="button"
              onClick={(e) => {
                stop(e);
                setOpen(false);
                setConfirming(true);
              }}
              role="menuitem"
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg text-left text-red-700 hover:bg-red-50 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path d="M3 4h8M5.5 4V2.5h3V4M4.5 4l.5 7.5h4l.5-7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Delete listing
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {mounted && confirming
        ? createPortal(
            <AnimatePresence>
              <motion.div
                key="confirm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-[80] flex items-center justify-center p-4"
                onClick={stop}
              >
                <div
                  onClick={(e) => {
                    stop(e);
                    if (!deleting) setConfirming(false);
                  }}
                  className="absolute inset-0 bg-sr-ink/50 backdrop-blur-sm"
                  aria-hidden
                />
                <motion.div
                  role="alertdialog"
                  aria-modal="true"
                  aria-label="Delete listing"
                  initial={{ scale: 0.96, y: 8 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.96, y: 4 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                  className="relative bg-white rounded-2xl shadow-[0_20px_60px_rgba(31,53,57,0.18)] p-5 sm:p-6 max-w-sm w-full"
                >
                  <h3 className="font-display text-lg text-sr-ink tracking-tight">
                    Delete this listing?
                  </h3>
                  <p className="text-sm text-sr-ink-soft mt-1.5 leading-relaxed">
                    <span className="font-medium text-sr-ink">{listingName}</span>
                    {roomCount > 0
                      ? ` and its ${roomCount} ${roomCount === 1 ? 'room' : 'rooms'} will be permanently removed. This cannot be undone.`
                      : ' will be permanently removed. This cannot be undone.'}
                  </p>
                  {error && (
                    <p className="mt-3 text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      {error}
                    </p>
                  )}
                  <div className="flex gap-2 mt-5">
                    <button
                      type="button"
                      onClick={(e) => {
                        stop(e);
                        setConfirming(false);
                      }}
                      disabled={deleting}
                      className="flex-1 text-sm font-medium text-sr-ink bg-sr-cream hover:bg-sr-cream-soft px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        stop(e);
                        doDelete();
                      }}
                      disabled={deleting}
                      className="flex-1 inline-flex items-center justify-center gap-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 active:scale-[0.98] px-4 py-2.5 rounded-xl transition-all disabled:opacity-60"
                    >
                      {deleting ? (
                        <>
                          <span className="size-3.5 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                          Deleting
                        </>
                      ) : (
                        'Delete'
                      )}
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            </AnimatePresence>,
            document.body,
          )
        : null}
    </div>
  );
}
