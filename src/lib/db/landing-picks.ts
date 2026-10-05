import { QueryCommand, GetCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { dynamodb, TABLE_NAME } from '@/lib/aws/dynamodb';
import type { StagingStyle } from '@/lib/ai/prompts';
import type { ThumbnailRoom } from '@/components/staging/style-row';

export interface LandingPick {
  pk: 'LANDING_PICK';
  sk: `ROOM#${string}`;
  enabled: boolean;
  // Per-style picks: the staged image to show for that style.
  picks: Partial<Record<StagingStyle, string>>;
  // Per-style empty-room source (the heroS3Key from the staging that produced
  // each picked image). Lets the public landing render a meaningful before/
  // after slider per style. Optional on legacy records.
  heroByStyle?: Partial<Record<StagingStyle, string>>;
  updatedAt: string;
}

const ROOM_SK_PREFIX = 'ROOM#';

/**
 * Parse a LandingPick sort key into room slug + setIndex.
 *   ROOM#bedroom#0 → { slug: 'bedroom', setIndex: 0 }
 *   ROOM#bedroom   → { slug: 'bedroom', setIndex: 0 }  (legacy)
 *   ROOM#living-room#2 → { slug: 'living-room', setIndex: 2 }
 *   anything else  → null
 */
export function parseSk(sk: string): { slug: ThumbnailRoom; setIndex: number } | null {
  if (!sk.startsWith(ROOM_SK_PREFIX)) return null;
  const tail = sk.slice(ROOM_SK_PREFIX.length);
  // Find the last '#' to split slug from setIndex (slug may contain '-').
  const hashIdx = tail.lastIndexOf('#');
  if (hashIdx === -1) {
    // Legacy: ROOM#bedroom → setIndex 0
    return { slug: tail as ThumbnailRoom, setIndex: 0 };
  }
  const slug = tail.slice(0, hashIdx) as ThumbnailRoom;
  const idx = Number(tail.slice(hashIdx + 1));
  if (!Number.isInteger(idx) || idx < 0) return null;
  return { slug, setIndex: idx };
}

export interface UpsertLandingPickInput {
  enabled?: boolean;
  picks?: Partial<Record<StagingStyle, string>>;
  heroByStyle?: Partial<Record<StagingStyle, string>>;
}

export async function upsertLandingPick(
  roomSlug: ThumbnailRoom,
  setIndex: number,
  input: UpsertLandingPickInput,
): Promise<void> {
  const sk = `${ROOM_SK_PREFIX}${roomSlug}#${setIndex}`;

  const existing = await dynamodb.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { pk: 'LANDING_PICK', sk },
  }));
  const prev = (existing.Item ?? null) as LandingPick | null;

  const nextPicks = input.picks ?? prev?.picks ?? {};
  const nextHeroes = input.heroByStyle ?? prev?.heroByStyle ?? {};
  const nextEnabled = input.enabled ?? prev?.enabled ?? false;
  const updatedAt = new Date().toISOString();

  await dynamodb.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { pk: 'LANDING_PICK', sk },
    UpdateExpression:
      'SET enabled = :enabled, picks = :picks, heroByStyle = :heroes, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':enabled': nextEnabled,
      ':picks': nextPicks,
      ':heroes': nextHeroes,
      ':updatedAt': updatedAt,
    },
  }));
}

/**
 * Returns the lowest unused setIndex in [0, 10) for the given room. Used by
 * the admin picker when the user clicks "+ Add new". Indices stay stable
 * when a set is deleted — the next add fills the lowest gap.
 */
export async function getNextSetIndex(roomSlug: ThumbnailRoom): Promise<number> {
  const res = await dynamodb.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
    ExpressionAttributeValues: {
      ':pk': 'LANDING_PICK',
      ':sk': `${ROOM_SK_PREFIX}${roomSlug}`,
    },
    ProjectionExpression: 'sk',
  }));
  const used = new Set<number>();
  for (const item of res.Items ?? []) {
    const parsed = parseSk(item.sk as string);
    if (parsed && parsed.slug === roomSlug) used.add(parsed.setIndex);
  }
  for (let i = 0; i < 10; i++) {
    if (!used.has(i)) return i;
  }
  throw new Error(`Cannot add another set for ${roomSlug}: 10 already exist`);
}

export async function getLandingPicks(): Promise<Partial<Record<ThumbnailRoom, LandingPick[]>>> {
  const res = await dynamodb.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': 'LANDING_PICK' },
  }));
  const items = (res.Items ?? []) as LandingPick[];
  const out: Partial<Record<ThumbnailRoom, LandingPick[]>> = {};
  for (const item of items) {
    const parsed = parseSk(item.sk);
    if (!parsed) continue;
    const list = out[parsed.slug] ?? [];
    list.push(item);
    out[parsed.slug] = list;
  }
  // Sort each room's sets by setIndex ascending.
  for (const slug of Object.keys(out) as ThumbnailRoom[]) {
    out[slug]!.sort((a, b) => {
      const ai = parseSk(a.sk)?.setIndex ?? 0;
      const bi = parseSk(b.sk)?.setIndex ?? 0;
      return ai - bi;
    });
  }
  return out;
}

export async function deleteLandingPick(
  roomSlug: ThumbnailRoom,
  setIndex: number,
): Promise<void> {
  await dynamodb.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: { pk: 'LANDING_PICK', sk: `${ROOM_SK_PREFIX}${roomSlug}#${setIndex}` },
  }));
}
