import { NextRequest, NextResponse } from 'next/server';
import { downloadFromS3 } from '@/lib/aws/s3';
import { getSession } from '@/lib/auth/session';
import { isKeyAccessible } from '@/lib/auth/s3-ownership';
import { setListingCover } from '@/lib/db/listings';

export const dynamic = 'force-dynamic';

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Please log in.' }, { status: 401 });
  }

  const s3Key = request.nextUrl.searchParams.get('key');
  const style = request.nextUrl.searchParams.get('style');
  const rooms = request.nextUrl.searchParams.get('rooms');
  const listingId = request.nextUrl.searchParams.get('listingId');
  if (!s3Key) {
    return NextResponse.json({ error: 'Missing key' }, { status: 400 });
  }

  if (!isKeyAccessible(s3Key, session.user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const buffer = await downloadFromS3(s3Key);
    const ext = s3Key.endsWith('.png') ? 'png' : 'jpg';
    const parts = ['stageright'];
    if (rooms) {
      const roomSlug = rooms.split(',').map((r) => slug(r)).filter(Boolean).join('-');
      if (roomSlug) parts.push(roomSlug);
    }
    if (style) {
      const styleSlug = slug(style);
      if (styleSlug) parts.push(styleSlug);
    }
    parts.push('staged');
    const filename = `${parts.join('-')}.${ext}`;

    // Cover-image rule: downloading a staged image makes it the listing's
    // cover. Fire-and-forget so the response isn't held up by the DDB write.
    if (listingId && listingId !== 'unsorted') {
      setListingCover(session.user.id, listingId, s3Key).catch((err) => {
        // Non-fatal — download already succeeded. Log for ops, don't block.
        console.error('[download] setListingCover failed:', err);
      });
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': ext === 'png' ? 'image/png' : 'image/jpeg',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Download failed' }, { status: 500 });
  }
}
