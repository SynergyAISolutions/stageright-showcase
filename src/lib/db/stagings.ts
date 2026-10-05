/**
 * User-facing staging gallery. One record per completed staging.
 * Rows persist until the user deletes them via the gallery UI.
 */
import {
  PutCommand,
  QueryCommand,
  DeleteCommand,
  GetCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import { dynamodb, TABLE_NAME } from '@/lib/aws/dynamodb';

export interface Staging {
  pk: string;
  sk: string;
  id: string;
  userId: string;
  sessionId: string;
  style: string;
  roomTypes: string[];
  heroS3Key: string;
  stagedS3Key: string;
  notes?: string;
  createdAt: string;
  stageCounted?: boolean;
  bonusTriggered?: boolean;
  bonusStageCount?: number;
  listingId?: string;
}

export async function createStaging(data: {
  userId: string;
  sessionId: string;
  style: string;
  roomTypes: string[];
  heroS3Key: string;
  stagedS3Key: string;
  notes?: string;
  listingId?: string;
}): Promise<Staging> {
  const now = new Date();
  const nowIso = now.toISOString();
  const id = ulid();

  const item: Staging = {
    pk: `USER#${data.userId}`,
    sk: `STAGING#${nowIso}#${id}`,
    id,
    userId: data.userId,
    sessionId: data.sessionId,
    style: data.style,
    roomTypes: data.roomTypes,
    heroS3Key: data.heroS3Key,
    stagedS3Key: data.stagedS3Key,
    ...(data.listingId ? { listingId: data.listingId } : {}),
    notes: data.notes ?? '',
    createdAt: nowIso,
  };

  await dynamodb.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  return item;
}

export async function getUserStagings(userId: string, limit = 50): Promise<Staging[]> {
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'STAGING#',
      },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );
  return (result.Items as Staging[]) || [];
}

export async function getStagingById(userId: string, sk: string): Promise<Staging | null> {
  const result = await dynamodb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${userId}`, sk },
    }),
  );
  return (result.Item as Staging) || null;
}

export async function updateStagingImage(
  userId: string,
  sk: string,
  stagedS3Key: string,
): Promise<void> {
  await dynamodb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${userId}`, sk },
      UpdateExpression: 'SET stagedS3Key = :key',
      ExpressionAttributeValues: { ':key': stagedS3Key },
    }),
  );
}

export async function deleteStaging(userId: string, sk: string): Promise<void> {
  await dynamodb.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${userId}`, sk },
    }),
  );
}

export async function clearListingIdOnStagings(
  userId: string,
  listingId: string,
): Promise<void> {
  const all = await getUserStagings(userId, 500);
  const targets = all.filter((s) => s.listingId === listingId);
  for (const s of targets) {
    await dynamodb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { pk: `USER#${userId}`, sk: s.sk },
        UpdateExpression: 'REMOVE listingId',
      }),
    );
  }
}
