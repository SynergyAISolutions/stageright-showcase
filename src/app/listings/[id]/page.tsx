import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getListingById } from '@/lib/db/listings';
import { StagingGallery } from '@/components/dashboard/staging-gallery';
import { AppHeader } from '@/components/layout/app-header';
import { ListingTitleBar } from '@/components/dashboard/listing-title-bar';

export const dynamic = 'force-dynamic';

interface Props {
  params: { id: string };
}

export default async function ListingDetailPage({ params }: Props) {
  const session = await getSession();
  if (!session?.user) {
    return notFound();
  }

  // The 'unsorted' route remains accessible for legacy data viewing, but uses
  // a synthetic listing object since there's no real DDB record. Plan 1 removes
  // the dashboard surface for unsorted but the route itself stays for data
  // recovery until Plan-1 Task 22 disables it post-migration.
  if (params.id === 'unsorted') {
    return notFound();
  }

  const listing = await getListingById(session.user.id, params.id);
  if (!listing) return notFound();

  return (
    <div className="h-[100dvh] bg-sr-cream flex flex-col overflow-hidden">
      <AppHeader />
      <main className="flex-1 min-h-0 mx-auto max-w-6xl w-full px-5 sm:px-8 py-4 sm:py-6 flex flex-col">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-semibold tracking-[0.08em] uppercase text-sr-ink-mute hover:text-sr-terra transition-colors mb-3 sm:mb-4 self-start flex-shrink-0"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
            <path d="M7 2L3 5l4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Gallery
        </Link>
        <ListingTitleBar
          listingId={params.id}
          initialName={listing.name}
          initialAddress={listing.address}
          className="mb-4 sm:mb-5 flex-shrink-0"
        />
        <div className="flex-1 min-h-0 flex flex-col">
          <StagingGallery listingId={params.id} />
        </div>
      </main>
    </div>
  );
}
