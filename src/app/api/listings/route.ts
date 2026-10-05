import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createListing, getUserListings, type Listing } from '@/lib/db/listings';
import { getUserStagings, type Staging } from '@/lib/db/stagings';
import { getSignedDownloadUrl } from '@/lib/aws/s3';
import { migrateUnsortedToLegacy } from '@/lib/db/migrations/legacy-uploads';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  let body: { name?: string; address?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const name = (body.name || '').trim();
  if (!name) {
    return NextResponse.json({ error: 'name required' }, { status: 400 });
  }
  const address = body.address?.trim() || undefined;
  const listing = await createListing({ userId: session.user.id, name, address });
  return NextResponse.json({ listing }, { status: 201 });
}

export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Fire-and-forget — the migration runs in the background and writes orphan
  // stagings into a "Legacy uploads" listing. We do NOT await it: this handler
  // returns the current listings state immediately, and the migrated stagings
  // surface on the next /api/listings call once the background run completes.
  // Awaiting here was blocking the dashboard for tens of seconds on first load.
  migrateUnsortedToLegacy(session.user.id).catch((err) => {
    console.error('[listings] legacy migration failed:', err);
  });

  const [listings, stagings] = await Promise.all([
    getUserListings(session.user.id),
    getUserStagings(session.user.id, 500),
  ]);

  const annotated = await Promise.all(
    listings.map(async (l: Listing) => {
      const own = stagings.filter(
        (s) => (s as Staging & { listingId?: string }).listingId === l.id,
      );
      const sources = new Set(own.map((s) => s.heroS3Key));
      const lastActivityAt = own.reduce(
        (acc, s) => (s.createdAt > acc ? s.createdAt : acc),
        l.updatedAt,
      );
      const coverUrl = l.coverS3Key
        ? await getSignedDownloadUrl(l.coverS3Key, 3600).catch(() => null)
        : null;

      // Original (empty) photo behind the cover, for the tile's hover
      // before/after. Resolve the staging whose staged image IS the cover, then
      // sign its hero key.
      let coverOriginalUrl: string | null = null;
      if (l.coverS3Key) {
        const coverStaging =
          own.find((s) => s.stagedS3Key === l.coverS3Key) ??
          stagings.find((s) => s.stagedS3Key === l.coverS3Key);
        if (coverStaging?.heroS3Key) {
          coverOriginalUrl = await getSignedDownloadUrl(coverStaging.heroS3Key, 3600).catch(
            () => null,
          );
        }
      }

      return {
        ...l,
        coverUrl,
        coverOriginalUrl,
        imageCount: own.length,
        sourceCount: sources.size,
        lastActivityAt,
      };
    }),
  );

  return NextResponse.json({ listings: annotated });
}
