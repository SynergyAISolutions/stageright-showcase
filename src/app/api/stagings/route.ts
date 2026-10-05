import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getUserStagings, deleteStaging, getStagingById } from '@/lib/db/stagings';
import { getListingById } from '@/lib/db/listings';
import { getSignedDownloadUrl, deleteFromS3 } from '@/lib/aws/s3';

export const dynamic = 'force-dynamic';

interface Variant {
  id: string;
  sk: string;
  sessionId: string;
  style: string;
  stagedUrl: string;
  stagedS3Key: string;
  editInstruction: string | null;
  createdAt: string;
}

interface StyleGroup {
  style: string;
  variants: Variant[];
  latestAt: string;
}

interface UploadGroup {
  heroS3Key: string;
  heroUrl: string | null;
  coverUrl: string;
  /** stagedS3Key of the manually-chosen room cover, if one is set. The viewer
   * opens to this variant instead of the newest one. */
  coverStagedS3Key?: string;
  roomTypes: string[];
  styles: StyleGroup[];
  totalVariants: number;
  createdAt: string;
  /** Listing context of the most-recent staging in this group. Threaded
   * through to the gallery viewer's "Try another style" link so users
   * staying inside a listing don't get the Unsorted nag. */
  listingId?: string;
}

export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Please log in.' }, { status: 401 });
    }

    const rows = await getUserStagings(session.user.id, 500);

    // Optional ?listingId= filter. 'unsorted' selects rows without a listingId
    // (the special Unsorted listing is virtual — not a real DDB row); a real id
    // selects rows assigned to that listing; omitted returns everything.
    const listingFilter = new URL(req.url).searchParams.get('listingId');
    const filtered =
      listingFilter == null
        ? rows
        : listingFilter === 'unsorted'
          ? rows.filter((r) => !r.listingId)
          : rows.filter((r) => r.listingId === listingFilter);

    // Manually-chosen room covers live on the listing record (heroS3Key ->
    // stagedS3Key). Only meaningful when viewing a real listing.
    let roomCoverByHero: Record<string, string> = {};
    if (listingFilter && listingFilter !== 'unsorted') {
      const listing = await getListingById(session.user.id, listingFilter).catch(() => null);
      roomCoverByHero = listing?.roomCoverByHero ?? {};
    }

    // Sign URLs
    const withUrls = await Promise.all(
      filtered.map(async (r) => {
        const [stagedUrl, heroUrl] = await Promise.all([
          getSignedDownloadUrl(r.stagedS3Key, 3600).catch(() => null),
          getSignedDownloadUrl(r.heroS3Key, 3600).catch(() => null),
        ]);
        return { r, stagedUrl, heroUrl };
      }),
    );

    // Group by heroS3Key — one card per uploaded photo
    const byUpload = new Map<string, UploadGroup>();
    for (const { r, stagedUrl, heroUrl } of withUrls) {
      if (!stagedUrl) continue; // staged image missing (manually deleted or legacy)

      const variant: Variant = {
        id: r.id,
        sk: r.sk,
        sessionId: r.sessionId,
        style: r.style,
        stagedUrl,
        stagedS3Key: r.stagedS3Key,
        editInstruction: (r as { editInstruction?: string | null }).editInstruction ?? null,
        createdAt: r.createdAt,
      };

      let group = byUpload.get(r.heroS3Key);
      if (!group) {
        group = {
          heroS3Key: r.heroS3Key,
          heroUrl,
          coverUrl: stagedUrl,
          roomTypes: r.roomTypes,
          styles: [],
          totalVariants: 0,
          createdAt: r.createdAt,
          ...(r.listingId ? { listingId: r.listingId } : {}),
        };
        byUpload.set(r.heroS3Key, group);
      }

      // Keep cover = most recent variant across all styles. listingId tracks
      // the most recent variant's listing so the "Try another style" link
      // sends the user back into that same listing context.
      if (r.createdAt > group.createdAt) {
        group.coverUrl = stagedUrl;
        group.createdAt = r.createdAt;
        group.listingId = r.listingId ?? undefined;
      }

      // Merge roomTypes if a later session added more
      for (const rt of r.roomTypes) {
        if (!group.roomTypes.includes(rt)) group.roomTypes.push(rt);
      }

      // Nest under its style
      let styleGroup = group.styles.find((s) => s.style === variant.style);
      if (!styleGroup) {
        styleGroup = { style: variant.style, variants: [], latestAt: variant.createdAt };
        group.styles.push(styleGroup);
      }
      styleGroup.variants.push(variant);
      if (variant.createdAt > styleGroup.latestAt) styleGroup.latestAt = variant.createdAt;
      group.totalVariants += 1;
    }

    // Sort — uploads newest first, styles within each newest first, variants within each newest first
    const uploads = [...byUpload.values()]
      .map((u) => ({
        ...u,
        styles: u.styles
          .map((s) => ({
            ...s,
            variants: s.variants.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
          }))
          .sort((a, b) => (a.latestAt < b.latestAt ? 1 : -1)),
      }))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      // Apply manual room covers: when set and the variant still exists, it wins
      // over the most-recent default for both the tile thumbnail (coverUrl) and
      // the viewer's default-open variant (coverStagedS3Key).
      .map((u) => {
        const want = roomCoverByHero[u.heroS3Key];
        if (!want) return u;
        for (const s of u.styles) {
          const v = s.variants.find((vv) => vv.stagedS3Key === want);
          if (v) return { ...u, coverUrl: v.stagedUrl, coverStagedS3Key: v.stagedS3Key };
        }
        return u;
      });

    return NextResponse.json({ uploads });
  } catch (err) {
    console.error('[/api/stagings] GET error:', err);
    return NextResponse.json({ error: 'Failed to load stagings' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Please log in.' }, { status: 401 });
    }

    const body = await request.json();
    const { sk, variants } = body;

    // Each staged image has a paired multi-turn replay file at
    // replay/{ulid}.json. Derive from stagedS3Key on delete.
    const ulidFromStagedKey = (key: string): string | null => {
      const m = key.match(/\/staged\/([A-Z0-9]{26})\//i);
      return m ? m[1] : null;
    };

    // Bulk delete: whole upload group — every variant + hero + replay files.
    // S3 keys are resolved from the DDB row (scoped to caller via getStagingById)
    // rather than trusted from the request body — otherwise a malicious caller
    // could pass another user's S3 keys and have us delete them.
    if (Array.isArray(variants)) {
      let resolvedHeroS3Key: string | null = null;
      await Promise.all(
        variants.map(async (v: { sk: string }) => {
          if (!v?.sk) return;
          const row = await getStagingById(session.user.id, v.sk).catch(() => null);
          if (!row) return; // not the caller's row — silently skip
          if (!resolvedHeroS3Key) resolvedHeroS3Key = row.heroS3Key;
          await deleteStaging(session.user.id, v.sk).catch(() => {});
          if (row.stagedS3Key) {
            await deleteFromS3(row.stagedS3Key).catch(() => {});
            const u = ulidFromStagedKey(row.stagedS3Key);
            if (u) await deleteFromS3(`replay/${u}.json`).catch(() => {});
          }
        }),
      );
      if (resolvedHeroS3Key) {
        await deleteFromS3(resolvedHeroS3Key).catch(() => {});
      }
      return NextResponse.json({ success: true });
    }

    // Single variant delete
    if (!sk) {
      return NextResponse.json({ error: 'Missing sk' }, { status: 400 });
    }
    const row = await getStagingById(session.user.id, sk);
    if (!row) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    await deleteStaging(session.user.id, sk);
    if (row.stagedS3Key) {
      await deleteFromS3(row.stagedS3Key).catch(() => {});
      const u = ulidFromStagedKey(row.stagedS3Key);
      if (u) await deleteFromS3(`replay/${u}.json`).catch(() => {});
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[/api/stagings] DELETE error:', err);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}
