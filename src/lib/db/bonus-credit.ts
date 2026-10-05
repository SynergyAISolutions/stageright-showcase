/**
 * Bonus-credit earn logic. Every 7 credits spent grants +1 creditsRemaining.
 * Atomic exactly-once via ConditionExpression on lastBonusStageCount.
 *
 * Phase F: bonus accounting moved to API layer (deductCredits). The Lambda
 * no longer calls these helpers for new-mode batches. The Lambda's inline copy
 * is now dead code — it will be cleaned up on the next Lambda redeploy.
 */
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { dynamodb, TABLE_NAME } from '@/lib/aws/dynamodb';

const BONUS_EVERY = 7;

type Result =
  | { bonusGranted: false }
  | { bonusGranted: true; newStageCount: number; newCreditsRemaining: number };

/**
 * Increment the user's "credits spent" counter by `incrementBy` and grant
 * bonus credits for every 7-boundary crossed. Called by `deductCredits` after
 * each successful deduction (API layer). Also called by the legacy
 * per-stage helpers below (default incrementBy = 1 preserves old behaviour).
 *
 * Atomic exactly-once: the second UpdateItem uses a ConditionExpression on
 * lastBonusStageCount so retries and concurrent calls never double-grant.
 */
export async function grantBonusIfDue(userId: string, incrementBy: number = 1): Promise<Result> {
  // Increment counter atomically. ConditionExpression: plan != 'admin' — skip
  // bonus pipeline entirely for admin without a separate Get. Failure means
  // the user is admin; return bonusGranted: false cleanly.
  let newCount: number;
  try {
    const res = await dynamodb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${userId}`, sk: 'PROFILE' },
      UpdateExpression: 'ADD stagesCompletedTotal :inc SET updatedAt = :now',
      ConditionExpression: '#plan <> :admin',
      ExpressionAttributeNames: { '#plan': 'plan' },
      ExpressionAttributeValues: {
        ':inc': incrementBy,
        ':now': new Date().toISOString(),
        ':admin': 'admin',
      },
      ReturnValues: 'UPDATED_NEW',
    }));
    newCount = (res.Attributes?.stagesCompletedTotal as number) ?? 0;
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException) {
      return { bonusGranted: false };
    }
    throw e;
  }

  // How many 7-boundaries did we cross?
  const oldCount = newCount - incrementBy;
  const oldBucket = Math.floor(oldCount / BONUS_EVERY);
  const newBucket = Math.floor(newCount / BONUS_EVERY);
  const bonusToGrant = Math.max(0, newBucket - oldBucket);
  if (bonusToGrant === 0) return { bonusGranted: false };

  // Grant bonus credits — exactly-once via lastBonusStageCount guard.
  const targetBucket = newBucket * BONUS_EVERY;
  let newCreditsRemaining: number;
  try {
    const res = await dynamodb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${userId}`, sk: 'PROFILE' },
      UpdateExpression:
        'ADD creditsRemaining :amt SET lastBonusStageCount = :target, updatedAt = :now',
      ConditionExpression:
        'attribute_not_exists(lastBonusStageCount) OR lastBonusStageCount < :target',
      ExpressionAttributeValues: {
        ':amt': bonusToGrant,
        ':target': targetBucket,
        ':now': new Date().toISOString(),
      },
      ReturnValues: 'UPDATED_NEW',
    }));
    newCreditsRemaining = (res.Attributes?.creditsRemaining as number) ?? 0;
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException) {
      return { bonusGranted: false };
    }
    throw e;
  }

  return { bonusGranted: true, newStageCount: newCount, newCreditsRemaining };
}

/**
 * Single-stage path. Guards via Staging record's `stageCounted` attribute.
 */
export async function recordSingleStageCompletion(params: {
  userId: string;
  stagingPk: string;
  stagingSk: string;
}): Promise<Result> {
  // Claim the Staging record (idempotent per record).
  try {
    await dynamodb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: params.stagingPk, sk: params.stagingSk },
      UpdateExpression: 'SET stageCounted = :true',
      ConditionExpression: 'attribute_not_exists(stageCounted)',
      ExpressionAttributeValues: { ':true': true },
    }));
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException) {
      return { bonusGranted: false };
    }
    throw e;
  }

  const result = await grantBonusIfDue(params.userId);
  if (!result.bonusGranted) return result;

  // Best-effort: mark the Staging record with bonusTriggered so the client
  // can detect and fire the envelope.
  try {
    await dynamodb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: params.stagingPk, sk: params.stagingSk },
      UpdateExpression: 'SET bonusTriggered = :true, bonusStageCount = :n',
      ExpressionAttributeValues: {
        ':true': true,
        ':n': result.newStageCount,
      },
    }));
  } catch {
    /* credit still granted; ceremony may not fire this time. Acceptable. */
  }

  return result;
}

/**
 * Batch path. Guards via BatchJob.subJobs[subJobIndex].stageCounted.
 */
export async function recordBatchSubJobCompletion(params: {
  userId: string;
  batchId: string;
  subJobIndex: number;
}): Promise<Result> {
  const i = params.subJobIndex;
  // Claim the sub-job (idempotent per sub-job).
  try {
    await dynamodb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `BATCH#${params.batchId}`, sk: 'META' },
      UpdateExpression: `SET subJobs[${i}].stageCounted = :true`,
      ConditionExpression: `attribute_not_exists(subJobs[${i}].stageCounted)`,
      ExpressionAttributeValues: { ':true': true },
    }));
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException) {
      return { bonusGranted: false };
    }
    throw e;
  }

  const result = await grantBonusIfDue(params.userId);
  if (!result.bonusGranted) return result;

  // Best-effort: mark the sub-job with bonusTriggered.
  try {
    await dynamodb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `BATCH#${params.batchId}`, sk: 'META' },
      UpdateExpression: `SET subJobs[${i}].bonusTriggered = :true, subJobs[${i}].bonusStageCount = :n`,
      ExpressionAttributeValues: {
        ':true': true,
        ':n': result.newStageCount,
      },
    }));
  } catch {
    /* credit granted; ceremony may not fire this time. Acceptable. */
  }

  return result;
}
