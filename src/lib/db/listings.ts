/**
 * Listings group a user's stagings by property. Listings are optional —
 * the dashboard treats stagings without a listingId as the special
 * "Unsorted" listing (id === 'unsorted'), which is not a real DDB row.
 */
import {
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import { dynamodb, TABLE_NAME } from '@/lib/aws/dynamodb';

export interface Listing {
  pk: string;
  sk: string;
  id: string;
  userId: string;
  name: string;
  address?: string;
  /** Property cover — the staged image shown on the dashboard listing tile. */
  coverS3Key?: string;
  /**
   * Per-room cover map: heroS3Key -> chosen stagedS3Key. Drives the room tile
   * thumbnail in the listing gallery AND the variant the GalleryViewer opens
   * to (so a chosen room cover saves scrolling). Manually picked; absent rooms
   * fall back to the most-recent variant.
   */
  roomCoverByHero?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export async function createListing(data: {
  userId: string;
  name: string;
  address?: string;
}): Promise<Listing> {
  const nowIso = new Date().toISOString();
  const id = ulid();
  const item: Listing = {
    pk: `USER#${data.userId}`,
    sk: `LISTING#${nowIso}#${id}`,
    id,
    userId: data.userId,
    name: data.name,
    ...(data.address ? { address: data.address } : {}),
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  await dynamodb.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  return item;
}

export async function getUserListings(userId: string, limit = 200): Promise<Listing[]> {
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'LISTING#',
      },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );
  return (result.Items as Listing[]) || [];
}

export async function getListingById(userId: string, id: string): Promise<Listing | null> {
  const all = await getUserListings(userId, 1000);
  return all.find((l) => l.id === id) || null;
}

export async function updateListing(
  userId: string,
  id: string,
  patch: { name?: string; address?: string },
): Promise<void> {
  const listing = await getListingById(userId, id);
  if (!listing) return;
  const sets: string[] = ['updatedAt = :updatedAt'];
  const values: Record<string, unknown> = { ':updatedAt': new Date().toISOString() };
  const names: Record<string, string> = {};
  if (patch.name !== undefined) {
    sets.push('#name = :name');
    values[':name'] = patch.name;
    names['#name'] = 'name';
  }
  if (patch.address !== undefined) {
    sets.push('address = :address');
    values[':address'] = patch.address;
  }
  await dynamodb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${userId}`, sk: listing.sk },
      UpdateExpression: 'SET ' + sets.join(', '),
      ExpressionAttributeValues: values,
      ...(Object.keys(names).length ? { ExpressionAttributeNames: names } : {}),
    }),
  );
}

/**
 * Set the cover for one room (heroS3Key) within a listing. Read-merge-write of
 * the roomCoverByHero map — low frequency (manual pick), so the whole-map write
 * is simpler than a path-targeted update that must first init the map.
 */
export async function setRoomCover(
  userId: string,
  id: string,
  heroS3Key: string,
  stagedS3Key: string,
): Promise<void> {
  const listing = await getListingById(userId, id);
  if (!listing) return;
  const map = { ...(listing.roomCoverByHero ?? {}), [heroS3Key]: stagedS3Key };
  await dynamodb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${userId}`, sk: listing.sk },
      UpdateExpression: 'SET roomCoverByHero = :m, updatedAt = :now',
      ExpressionAttributeValues: { ':m': map, ':now': new Date().toISOString() },
    }),
  );
}

export async function deleteListing(userId: string, id: string): Promise<void> {
  const listing = await getListingById(userId, id);
  if (!listing) return;
  await dynamodb.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${userId}`, sk: listing.sk },
    }),
  );
}

export async function setListingCoverIfMissing(
  userId: string,
  id: string,
  stagedS3Key: string,
): Promise<void> {
  const listing = await getListingById(userId, id);
  if (!listing) return;
  try {
    await dynamodb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { pk: `USER#${userId}`, sk: listing.sk },
        UpdateExpression: 'SET coverS3Key = :cover, updatedAt = :now',
        ConditionExpression: 'attribute_not_exists(coverS3Key)',
        ExpressionAttributeValues: {
          ':cover': stagedS3Key,
          ':now': new Date().toISOString(),
        },
      }),
    );
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    if (name === 'ConditionalCheckFailedException') return;
    throw err;
  }
}

/**
 * Overwrite the listing cover unconditionally. Called when a user downloads
 * a staged image — that staging becomes the listing's cover going forward.
 * No-op if the listing doesn't exist (defensive — caller may pass a stale id).
 */
export async function setListingCover(
  userId: string,
  id: string,
  stagedS3Key: string,
): Promise<void> {
  const listing = await getListingById(userId, id);
  if (!listing) return;
  await dynamodb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${userId}`, sk: listing.sk },
      UpdateExpression: 'SET coverS3Key = :cover, updatedAt = :now',
      ExpressionAttributeValues: {
        ':cover': stagedS3Key,
        ':now': new Date().toISOString(),
      },
    }),
  );
}
