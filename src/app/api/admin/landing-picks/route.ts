import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { dynamodb, TABLE_NAME } from '@/lib/aws/dynamodb';
import { getSession } from '@/lib/auth/session';
import { ADMIN_EMAILS } from '@/types';
import { upsertLandingPick, deleteLandingPick } from '@/lib/db/landing-picks';
import type { ThumbnailRoom } from '@/components/staging/style-row';

// ROOM_SLUGS inlined — see candidates/route.ts for why. Keep in sync with
// the source list in src/components/staging/style-row.tsx.
const ROOM_SLUGS: readonly ThumbnailRoom[] = [
  'living', 'bedroom', 'dining-room', 'master-suite', 'kitchen', 'bathroom',
  'home-office', 'kids-room', 'studio', 'guest-room', 'outdoor', 'living-room',
  'bedroom-bathroom',
] as const;

interface Body {
  roomSlug: string;
  setIndex?: number;
  enabled?: boolean;
  picks?: Record<string, string>;
}

/**
 * Server resolves heroByStyle by looking up each pick's source staging.
 * The client doesn't need to send it (and we ignore it if they do) —
 * makes the save bulletproof against stale browser JS and client races.
 */
async function resolveHeroByStyle(
  userId: string,
  picks: Record<string, string>,
): Promise<Record<string, string>> {
  const stagedKeys = new Set(Object.values(picks).filter(Boolean));
  if (stagedKeys.size === 0) return {};

  // One paginated query through the admin's stagings, build a lookup map.
  const stagedToHero = new Map<string, string>();
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await dynamodb.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'STAGING#',
      },
      ProjectionExpression: 'heroS3Key, stagedS3Key',
      ExclusiveStartKey: exclusiveStartKey,
    }));
    for (const it of res.Items ?? []) {
      const staged = it.stagedS3Key as string | undefined;
      const hero = it.heroS3Key as string | undefined;
      if (staged && hero && stagedKeys.has(staged) && !stagedToHero.has(staged)) {
        stagedToHero.set(staged, hero);
      }
    }
    exclusiveStartKey = res.LastEvaluatedKey;
  } while (exclusiveStartKey);

  const out: Record<string, string> = {};
  for (const [style, stagedKey] of Object.entries(picks)) {
    const hero = stagedToHero.get(stagedKey);
    if (hero) out[style] = hero;
  }
  return out;
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || !ADMIN_EMAILS.includes(session.user.email)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  if (!body.roomSlug || !(ROOM_SLUGS as readonly string[]).includes(body.roomSlug)) {
    return NextResponse.json({ error: 'invalid roomSlug' }, { status: 400 });
  }
  const setIndex = body.setIndex ?? 0;
  if (!Number.isInteger(setIndex) || setIndex < 0 || setIndex >= 10) {
    return NextResponse.json({ error: 'setIndex out of range' }, { status: 400 });
  }
  const heroByStyle = body.picks ? await resolveHeroByStyle(session.user.id, body.picks) : undefined;
  await upsertLandingPick(body.roomSlug as ThumbnailRoom, setIndex, {
    enabled: body.enabled,
    picks: body.picks,
    heroByStyle,
  });
  revalidatePath('/');
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session || !ADMIN_EMAILS.includes(session.user.email)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const url = new URL(req.url);
  const roomSlug = url.searchParams.get('roomSlug');
  const setIndexStr = url.searchParams.get('setIndex');
  if (!roomSlug || !(ROOM_SLUGS as readonly string[]).includes(roomSlug)) {
    return NextResponse.json({ error: 'invalid roomSlug' }, { status: 400 });
  }
  if (setIndexStr === null) {
    return NextResponse.json({ error: 'setIndex required' }, { status: 400 });
  }
  const setIndex = Number(setIndexStr);
  if (!Number.isInteger(setIndex) || setIndex < 0 || setIndex >= 10) {
    return NextResponse.json({ error: 'setIndex out of range' }, { status: 400 });
  }
  await deleteLandingPick(roomSlug as ThumbnailRoom, setIndex);
  revalidatePath('/');
  return NextResponse.json({ ok: true });
}
