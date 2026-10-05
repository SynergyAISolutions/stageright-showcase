'use client';

import { useEffect, useState, useCallback } from 'react';
import { TileGrid } from '@/components/interior/tile-grid';
import { Tile } from '@/components/interior/tile';
import { EmptyEditorial } from '@/components/interior/empty-editorial';
import { DarkPillButton } from '@/components/interior/terra-pill-button';
import { FoldFadeContainer } from '@/components/interior/fold-fade-container';
import { GalleryViewer, type UploadGroup } from './gallery-viewer';

export function StagingGallery({ listingId }: { listingId?: string } = {}) {
  const [uploads, setUploads] = useState<UploadGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<UploadGroup | null>(null);
  const [deleting, setDeleting] = useState(false);

  const stageHref = listingId ? `/stage?listingId=${encodeURIComponent(listingId)}` : '/stage';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = listingId ? `/api/stagings?listingId=${encodeURIComponent(listingId)}` : '/api/stagings';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setUploads(data.uploads || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [listingId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDeleteUpload = async () => {
    if (!selected) return;
    setDeleting(true);
    try {
      const allVariants = selected.styles.flatMap((s) => s.variants);
      const sessionIds = Array.from(
        new Set(allVariants.map((v) => v.sessionId).filter(Boolean)),
      );
      await fetch('/api/stagings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          heroS3Key: selected.heroS3Key,
          variants: allVariants.map((v) => ({ sk: v.sk, stagedS3Key: v.stagedS3Key })),
          sessionIds,
        }),
      });
      setUploads((prev) => prev.filter((u) => u.heroS3Key !== selected.heroS3Key));
      setSelected(null);
    } finally {
      setDeleting(false);
    }
  };

  const handleSetRoomCover = async (stagedS3Key: string) => {
    if (!listingId || !selected) return;
    const heroS3Key = selected.heroS3Key;
    await fetch(`/api/listings/${encodeURIComponent(listingId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomCover: { heroS3Key, stagedS3Key } }),
    });
    // Reflect locally: the room tile shows the new cover, and reopening this
    // room opens straight to it (the viewer reads coverStagedS3Key).
    const findUrl = (u: UploadGroup) =>
      u.styles.flatMap((s) => s.variants).find((v) => v.stagedS3Key === stagedS3Key)?.stagedUrl;
    setUploads((prev) =>
      prev.map((u) =>
        u.heroS3Key === heroS3Key
          ? { ...u, coverStagedS3Key: stagedS3Key, coverUrl: findUrl(u) ?? u.coverUrl }
          : u,
      ),
    );
    setSelected((prev) => (prev ? { ...prev, coverStagedS3Key: stagedS3Key } : prev));
  };

  const handleSetPropertyCover = async (stagedS3Key: string) => {
    if (!listingId) return;
    await fetch(`/api/listings/${encodeURIComponent(listingId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coverS3Key: stagedS3Key }),
    });
  };

  const handleDeleteVariant = async (variant: { sk: string; stagedS3Key: string }) => {
    if (!selected) return;
    setDeleting(true);
    try {
      await fetch('/api/stagings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sk: variant.sk, stagedS3Key: variant.stagedS3Key }),
      });

      // Remove the variant from local state. If that leaves the upload empty,
      // also drop the upload card and close the viewer (+ also remove the hero
      // image from S3 so orphaned files don't linger).
      const updated: UploadGroup = {
        ...selected,
        styles: selected.styles
          .map((s) => ({ ...s, variants: s.variants.filter((v) => v.sk !== variant.sk) }))
          .filter((s) => s.variants.length > 0),
        totalVariants: selected.totalVariants - 1,
      };

      if (updated.totalVariants <= 0) {
        // No variants left — clean up the hero image too and close viewer.
        await fetch('/api/stagings', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ heroS3Key: selected.heroS3Key, variants: [] }),
        }).catch(() => {});
        setUploads((prev) => prev.filter((u) => u.heroS3Key !== selected.heroS3Key));
        setSelected(null);
      } else {
        // Variants remain — update local state and keep the viewer open.
        setUploads((prev) => prev.map((u) => (u.heroS3Key === selected.heroS3Key ? updated : u)));
        setSelected(updated);
      }
    } finally {
      setDeleting(false);
    }
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

  if (uploads.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <EmptyEditorial
          eyebrow="No rooms yet"
          heading={<>Upload a <em className="text-sr-terra italic">room</em>.</>}
          sub="A photo of any room — empty or furnished — and we&apos;ll stage it."
          cta={
            <DarkPillButton href={stageHref}>
              Add a room photo
            </DarkPillButton>
          }
        />
      </div>
    );
  }

  return (
    <>
      <FoldFadeContainer className="flex-1 min-h-0">
        <TileGrid>
          {uploads.map((u, i) => {
            const roomType = u.roomTypes.length > 0 ? u.roomTypes.join(' · ') : 'Room';
            const versionsLabel = `${u.totalVariants} ${u.totalVariants === 1 ? 'version' : 'versions'}`;
            return (
              <Tile
                key={u.heroS3Key}
                coverUrl={u.coverUrl}
                hoverUrl={u.heroUrl}
                name={roomType}
                sub={versionsLabel}
                onClick={() => setSelected(u)}
                index={i}
                alt={`Staged ${roomType.toLowerCase()}`}
              />
            );
          })}
        </TileGrid>
      </FoldFadeContainer>
      <GalleryViewer
        upload={selected}
        onClose={() => setSelected(null)}
        onDelete={handleDeleteUpload}
        onDeleteVariant={handleDeleteVariant}
        deleting={deleting}
        onSetRoomCover={listingId ? handleSetRoomCover : undefined}
        onSetPropertyCover={listingId ? handleSetPropertyCover : undefined}
      />
    </>
  );
}
