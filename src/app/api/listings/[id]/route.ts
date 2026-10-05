import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getListingById, updateListing, deleteListing, setListingCover, setRoomCover } from '@/lib/db/listings';
import { clearListingIdOnStagings, getUserStagings } from '@/lib/db/stagings';

export const dynamic = 'force-dynamic';

const UNSORTED = 'unsorted';

interface Ctx {
  params: { id: string };
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  if (params.id === UNSORTED) {
    return NextResponse.json({ error: 'unsorted is virtual' }, { status: 400 });
  }
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const listing = await getListingById(session.user.id, params.id);
  if (!listing) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ listing });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (params.id === UNSORTED) {
    return NextResponse.json({ error: 'cannot edit unsorted' }, { status: 400 });
  }
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const listing = await getListingById(session.user.id, params.id);
  if (!listing) return NextResponse.json({ error: 'not found' }, { status: 404 });

  let body: {
    name?: string;
    address?: string;
    coverS3Key?: string;
    roomCover?: { heroS3Key?: string; stagedS3Key?: string };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  // Cover changes (property + room) reference staged S3 keys. Verify each key
  // belongs to one of the caller's own stagings before storing it — the server
  // signs a download URL for whatever key is saved, so an unchecked key would
  // be an IDOR leak of another user's image.
  if (body.coverS3Key !== undefined || body.roomCover !== undefined) {
    const stagings = await getUserStagings(session.user.id, 1000);

    if (body.coverS3Key !== undefined) {
      const key = String(body.coverS3Key);
      if (!stagings.some((s) => s.stagedS3Key === key)) {
        return NextResponse.json({ error: 'cover image not found' }, { status: 400 });
      }
      await setListingCover(session.user.id, params.id, key);
    }

    if (body.roomCover !== undefined) {
      const heroS3Key = body.roomCover?.heroS3Key;
      const stagedS3Key = body.roomCover?.stagedS3Key;
      const owns =
        !!heroS3Key &&
        !!stagedS3Key &&
        stagings.some((s) => s.stagedS3Key === stagedS3Key && s.heroS3Key === heroS3Key);
      if (!owns) {
        return NextResponse.json({ error: 'room cover image not found' }, { status: 400 });
      }
      await setRoomCover(session.user.id, params.id, heroS3Key, stagedS3Key);
    }
  }

  const patch: { name?: string; address?: string } = {};
  if (body.name !== undefined) {
    const n = body.name.trim();
    if (!n) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
    patch.name = n;
  }
  if (body.address !== undefined) patch.address = body.address.trim();
  if (Object.keys(patch).length > 0) {
    await updateListing(session.user.id, params.id, patch);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  if (params.id === UNSORTED) {
    return NextResponse.json({ error: 'cannot delete unsorted' }, { status: 400 });
  }
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const listing = await getListingById(session.user.id, params.id);
  if (!listing) return NextResponse.json({ error: 'not found' }, { status: 404 });

  await clearListingIdOnStagings(session.user.id, params.id);
  await deleteListing(session.user.id, params.id);
  return NextResponse.json({ ok: true });
}
