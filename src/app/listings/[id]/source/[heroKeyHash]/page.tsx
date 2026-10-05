import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getUserStagings } from '@/lib/db/stagings';
import { getListingById } from '@/lib/db/listings';
import { getSignedDownloadUrl } from '@/lib/aws/s3';
import { hashHeroKey } from '@/lib/utils/hero-key-hash';

export const dynamic = 'force-dynamic';

interface Props {
  params: { id: string; heroKeyHash: string };
}

export default async function SourceDetailPage({ params }: Props) {
  const session = await getSession();
  if (!session?.user) return notFound();

  let listingTitle = 'Unsorted';
  if (params.id !== 'unsorted') {
    const listing = await getListingById(session.user.id, params.id);
    if (!listing) return notFound();
    listingTitle = listing.name;
  }

  const stagings = await getUserStagings(session.user.id, 500);
  const filtered = stagings.filter((s) =>
    params.id === 'unsorted' ? !s.listingId : s.listingId === params.id,
  );
  const match = filtered.filter((s) => hashHeroKey(s.heroS3Key) === params.heroKeyHash);
  if (match.length === 0) return notFound();

  const heroS3Key = match[0].heroS3Key;
  const heroUrl = await getSignedDownloadUrl(heroS3Key, 3600).catch(() => null);
  const variants = await Promise.all(
    match
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map(async (s) => ({
        id: s.id,
        sk: s.sk,
        style: s.style,
        createdAt: s.createdAt,
        stagedUrl: await getSignedDownloadUrl(s.stagedS3Key, 3600).catch(() => null),
      })),
  );

  return (
    <div className="min-h-[100dvh] bg-surface-secondary">
      <main className="mx-auto max-w-5xl px-5 sm:px-8 py-8 sm:py-10 pb-32">
        <div className="mb-6">
          <Link
            href={`/listings/${params.id}`}
            className="text-sm text-ink-muted hover:text-brand-navy transition-colors"
          >
            &larr; {listingTitle}
          </Link>
        </div>

        {heroUrl && (
          <div className="relative rounded-2xl overflow-hidden mb-8 bg-surface-secondary ring-1 ring-black/[0.06] aspect-[4/3]">
            <Image src={heroUrl} alt="Source room" fill priority sizes="(max-width: 768px) 100vw, 800px" className="object-contain" />
          </div>
        )}

        <h2 className="font-heading text-xl sm:text-2xl text-brand-navy tracking-tight mb-4">
          Staged styles
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {variants.map((v) => (
            <div
              key={v.sk}
              className="rounded-xl overflow-hidden bg-surface-secondary ring-1 ring-black/[0.06]"
            >
              {v.stagedUrl && (
                <div className="relative w-full aspect-[4/3]">
                  <Image
                    src={v.stagedUrl}
                    alt={v.style}
                    fill
                    sizes="(max-width: 640px) 50vw, 33vw"
                    className="object-cover"
                  />
                </div>
              )}
              <div className="px-3 py-2 text-sm font-medium text-brand-navy">{v.style}</div>
            </div>
          ))}
        </div>

        <div className="fixed bottom-0 left-0 right-0 z-30 p-4 bg-gradient-to-t from-surface-secondary via-surface-secondary/95 to-transparent">
          <div className="max-w-5xl mx-auto flex justify-end">
            <Link
              href={`/stage?listingId=${encodeURIComponent(params.id)}&heroS3Key=${encodeURIComponent(heroS3Key)}`}
              className="rounded-full bg-brand-navy text-white px-6 py-3 font-medium hover:bg-brand-navy/90 transition-colors"
            >
              + Add another style
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
