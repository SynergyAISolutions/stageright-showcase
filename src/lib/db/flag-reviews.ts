// src/lib/db/flag-reviews.ts
import {
  GetCommand, QueryCommand, TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import { dynamodb, TABLE_NAME } from '@/lib/aws/dynamodb';
import type { FlagReview } from '@/types';

interface EligibilityInput {
  sessionId: string;
  userId: string;
  session: { sessionId: string; referenceS3Keys: string[]; createdAt: string };
  userPendingCount: number;
  duplicateExists: boolean;
  secondsSinceResult: number;
}

export type EligibilityReason =
  | 'references-used' | 'pending-exists' | 'too-old' | 'already-flagged' | 'cool-down';

export interface EligibilityResult {
  eligible: boolean;
  reason?: EligibilityReason;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const COOL_DOWN_SECS = 60;

export function checkEligibility(input: EligibilityInput): EligibilityResult {
  if (input.session.referenceS3Keys.length > 0) return { eligible: false, reason: 'references-used' };
  if (input.userPendingCount > 0) return { eligible: false, reason: 'pending-exists' };
  if (input.duplicateExists) return { eligible: false, reason: 'already-flagged' };
  const age = Date.now() - new Date(input.session.createdAt).getTime();
  if (age > THIRTY_DAYS_MS) return { eligible: false, reason: 'too-old' };
  if (input.secondsSinceResult < COOL_DOWN_SECS) return { eligible: false, reason: 'cool-down' };
  return { eligible: true };
}

// Secondary row shape — USER#{userId} / REVIEW#{createdAt}#{id}
interface UserReviewIndexRow {
  pk: string;
  sk: string;
  reviewId: string;
  sessionId: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
  updatedAt: string;
}

export async function createFlagReview(
  data: Omit<FlagReview, 'pk' | 'sk' | 'gsi1pk' | 'gsi1sk' | 'id' | 'createdAt' | 'updatedAt' | 'status' | 'creditRefunded'>,
): Promise<FlagReview> {
  const id = ulid();
  const now = new Date().toISOString();

  const review: FlagReview = {
    pk: `REVIEW#${id}`,
    sk: 'META',
    gsi1pk: 'REVIEWS#pending',
    gsi1sk: now,
    id,
    ...data,
    status: 'pending',
    creditRefunded: false,
    createdAt: now,
    updatedAt: now,
  };

  const indexRow: UserReviewIndexRow = {
    pk: `USER#${data.userId}`,
    sk: `REVIEW#${now}#${id}`,
    reviewId: id,
    sessionId: data.sessionId,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  await dynamodb.send(new TransactWriteCommand({
    TransactItems: [
      { Put: { TableName: TABLE_NAME, Item: review } },
      { Put: { TableName: TABLE_NAME, Item: indexRow } },
    ],
  }));

  return review;
}

export async function getFlagReview(id: string): Promise<FlagReview | null> {
  const r = await dynamodb.send(new GetCommand({
    TableName: TABLE_NAME, Key: { pk: `REVIEW#${id}`, sk: 'META' },
  }));
  return (r.Item as FlagReview) || null;
}

export async function listPendingReviews(): Promise<FlagReview[]> {
  const r = await dynamodb.send(new QueryCommand({
    TableName: TABLE_NAME, IndexName: 'GSI1',
    KeyConditionExpression: 'gsi1pk = :p',
    ExpressionAttributeValues: { ':p': 'REVIEWS#pending' },
    ScanIndexForward: false,
    Limit: 100,
  }));
  return (r.Items || []) as FlagReview[];
}

export async function countUserPending(userId: string): Promise<number> {
  const r = await dynamodb.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
    ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'REVIEW#', ':s': 'pending' },
    FilterExpression: '#s = :s',
    ExpressionAttributeNames: { '#s': 'status' },
    Select: 'COUNT',
  }));
  return r.Count ?? 0;
}

export async function userAlreadyFlaggedSession(userId: string, sessionId: string): Promise<boolean> {
  const r = await dynamodb.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
    ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'REVIEW#', ':sid': sessionId },
    FilterExpression: 'sessionId = :sid',
    Select: 'COUNT',
  }));
  return (r.Count ?? 0) > 0;
}

export async function updateReviewStatus(
  id: string,
  patch: { status: 'accepted' | 'declined'; adminNote?: string; resolvedBy: string; creditRefunded: boolean },
): Promise<FlagReview> {
  const review = await getFlagReview(id);
  if (!review) throw new Error(`Review ${id} not found`);

  const now = new Date().toISOString();

  // Build the main-row update expression dynamically so we do not write explicit NULL for missing adminNote.
  const mainSet: string[] = [
    '#s = :s', 'resolvedBy = :rb', 'resolvedAt = :rt',
    'creditRefunded = :cr', 'updatedAt = :u', 'gsi1pk = :g',
  ];
  const mainValues: Record<string, unknown> = {
    ':s': patch.status,
    ':rb': patch.resolvedBy,
    ':rt': now,
    ':cr': patch.creditRefunded,
    ':u': now,
    ':g': `REVIEWS#${patch.status}`,
  };
  if (patch.adminNote !== undefined) {
    mainSet.push('adminNote = :a');
    mainValues[':a'] = patch.adminNote;
  }

  await dynamodb.send(new TransactWriteCommand({
    TransactItems: [
      {
        Update: {
          TableName: TABLE_NAME,
          Key: { pk: `REVIEW#${id}`, sk: 'META' },
          UpdateExpression: `SET ${mainSet.join(', ')}`,
          ConditionExpression: '#s = :pending',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: { ...mainValues, ':pending': 'pending' },
        },
      },
      {
        Update: {
          TableName: TABLE_NAME,
          Key: { pk: `USER#${review.userId}`, sk: `REVIEW#${review.createdAt}#${id}` },
          UpdateExpression: 'SET #s = :s, updatedAt = :u',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: { ':s': patch.status, ':u': now },
        },
      },
    ],
  }));

  return {
    ...review,
    status: patch.status,
    adminNote: patch.adminNote,
    resolvedBy: patch.resolvedBy,
    resolvedAt: now,
    creditRefunded: patch.creditRefunded,
    gsi1pk: `REVIEWS#${patch.status}`,
    updatedAt: now,
  };
}

export function isConditionalFailure(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { name?: string; CancellationReasons?: Array<{ Code?: string }> };
  if (e.name === 'ConditionalCheckFailedException') return true;
  if (e.name === 'TransactionCanceledException') {
    return !!e.CancellationReasons?.some((r) => r.Code === 'ConditionalCheckFailed');
  }
  return false;
}
