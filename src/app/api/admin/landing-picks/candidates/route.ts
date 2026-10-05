import { NextResponse } from 'next/server';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { dynamodb, TABLE_NAME } from '@/lib/aws/dynamodb';
import { getSession } from '@/lib/auth/session';
import { ADMIN_EMAILS } from '@/types';
import { getPublicImageUrl } from '@/lib/aws/image-urls';
import type { ThumbnailRoom } from '@/components/staging/style-row';

export const dynamic = 'force-dynamic';

// ROOM_SLUGS inlined here because the source file `style-row.tsx` is a
// 'use client' module. Next.js 14 cannot import value exports from a
// client module into server contexts (route handlers, server components)
// at runtime — the build compiles, but the Lambda fails with `Cannot
// read Symbol exports`. Keep this list in sync with `ROOM_SLUGS` in
// src/components/staging/style-row.tsx.
const ROOM_SLUGS: readonly ThumbnailRoom[] = [
  'living', 'bedroom', 'dining-room', 'master-suite', 'kitchen', 'bathroom',
  'home-office', 'kids-room', 'studio', 'guest-room', 'outdoor', 'living-room',
  'bedroom-bathroom',
] as const;

// Maps URL slugs to the DDB roomTypes labels that must ALL be present in a
// staging's roomTypes array for it to qualify as a candidate. Single-label
// rooms have a one-element array; combo rooms (e.g. bedroom + bathroom)
// have multiple. The candidates query joins the labels with AND so a
// staging tagged with [Bedroom, Bathroom] matches the combo slug.
const ROOM_FILTERS: Record<ThumbnailRoom, string[]> = {
  // Combo rooms: stagings are tagged with multi-element roomTypes arrays
  // (e.g. ['Living Room', 'Dining Room']). All listed labels must be
  // present in the staging's roomTypes for it to qualify as a candidate.
  'living': ['Living Room', 'Dining Room'],
  'bedroom-bathroom': ['Bedroom', 'Bathroom'],
  // Single-label rooms: one element, simple contains() check.
  'living-room': ['Living Room'],
  'dining-room': ['Dining Room'],
  'bedroom': ['Bedroom'],
  'master-suite': ['Master Suite'],
  'kitchen': ['Kitchen'],
  'bathroom': ['Bathroom'],
  'home-office': ['Home Office'],
  'kids-room': ['Kids Room'],
  'studio': ['Studio'],
  'guest-room': ['Guest Room'],
  'outdoor': ['Outdoor'],
};

interface Candidate {
  heroS3Key: string;
  style: string;
  stagedS3Key: string;
  createdAt: string;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session || !ADMIN_EMAILS.includes(session.user.email)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const room = url.searchParams.get('room') as ThumbnailRoom | null;
  if (!room || !(ROOM_SLUGS as readonly string[]).includes(room)) {
    return NextResponse.json({ error: 'invalid room slug' }, { status: 400 });
  }

  const labels = ROOM_FILTERS[room];

  // Join all required labels with AND so combo rooms (e.g. Bedroom +
  // Bathroom) only match stagings tagged with BOTH labels.
  const filterExpr = labels.map((_, i) => `contains(roomTypes, :r${i})`).join(' AND ');
  const labelValues = Object.fromEntries(labels.map((l, i) => [`:r${i}`, l]));

  try {
    const res = await dynamodb.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
      FilterExpression: filterExpr,
      ExpressionAttributeNames: { '#s': 'style' },
      ExpressionAttributeValues: {
        ':pk': `USER#${session.user.id}`,
        ':sk': 'STAGING#',
        ...labelValues,
      },
      ProjectionExpression: 'heroS3Key, stagedS3Key, #s, createdAt, roomTypes',
    }));

    const items = (res.Items ?? []) as Candidate[];

    // Latest-first by createdAt.
    items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    // Unique heroes, preserving latest-first order (first occurrence = latest).
    const heroMap = new Map<string, string>();
    for (const it of items) {
      if (!heroMap.has(it.heroS3Key)) heroMap.set(it.heroS3Key, it.createdAt);
    }
    const heroes = [...heroMap.entries()].map(([s3Key, createdAt]) => ({ s3Key, createdAt }));

    // Resolve every S3 key to a signed URL up front so the client can render
    // <img src> directly against S3/CloudFront in one round trip per image.
    // Without this, every thumbnail goes through /api/admin/preview which
    // chains a Lambda invocation + a 307 redirect — at 36-48 thumbnails per
    // room load it adds up to multi-minute load times.
    const allKeys = new Set<string>();
    for (const it of items) {
      allKeys.add(it.heroS3Key);
      allKeys.add(it.stagedS3Key);
    }
    const urls: Record<string, string> = {};
    await Promise.all(
      [...allKeys].map(async (k) => {
        const u = await getPublicImageUrl(k);
        if (u) urls[k] = u;
      }),
    );

    return NextResponse.json({ heroes, stagings: items, urls });
  } catch (err) {
    const e = err as Error;
    console.error('[landing-picks/candidates] query failed', e);
    return NextResponse.json(
      {
        error: 'query failed',
        message: e?.message ?? String(err),
        name: e?.name,
        stack: e?.stack?.split('\n').slice(0, 5),
      },
      { status: 500 },
    );
  }
}
