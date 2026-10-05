'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { EditorialPageTitle } from '@/components/interior/editorial-page-title';
import { TerraPillButton } from '@/components/interior/terra-pill-button';
import { EditListingDialog } from './edit-listing-dialog';

// Client title row for the listing detail page. Owns the editable name +
// address so a rename reflects instantly (optimistic local state), plus a
// router.refresh() so server-rendered consumers (cover, gallery) re-read the
// updated record. Keeps the existing "Add room" pill alongside an edit
// affordance.
export function ListingTitleBar({
  listingId,
  initialName,
  initialAddress,
  className,
}: {
  listingId: string;
  initialName: string;
  initialAddress?: string;
  className?: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [address, setAddress] = useState(initialAddress ?? '');
  const [editing, setEditing] = useState(false);

  return (
    <>
      <EditorialPageTitle
        text={name}
        sub={address || undefined}
        className={className}
        rightSlot={
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Edit listing name and address"
              className="inline-flex items-center justify-center size-8 rounded-full text-sr-ink-mute hover:text-sr-terra hover:bg-sr-ink/[0.05] transition-colors"
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="M11.5 2.5l2 2L6 12l-2.5.5L4 10l7.5-7.5z"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <TerraPillButton
              size="sm"
              href={`/stage?listingId=${encodeURIComponent(listingId)}`}
              iconLeft={
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden>
                  <path d="M4.5 1v7M1 4.5h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              }
            >
              Add room
            </TerraPillButton>
          </div>
        }
      />
      <EditListingDialog
        open={editing}
        onClose={() => setEditing(false)}
        listingId={listingId}
        initialName={name}
        initialAddress={address}
        onSaved={({ name: nextName, address: nextAddress }) => {
          setName(nextName);
          setAddress(nextAddress);
          router.refresh();
        }}
      />
    </>
  );
}
