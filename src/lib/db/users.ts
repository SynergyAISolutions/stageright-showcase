/**
 * User data access — matches content-producer/src/lib/db/users.ts pattern.
 */
import {
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { dynamodb, TABLE_NAME } from '@/lib/aws/dynamodb';
import type { User, Plan, CreditAction } from '@/types';
import { ADMIN_EMAILS, PLANS, CREDIT_COSTS } from '@/types';
import { grantBonusIfDue } from '@/lib/db/bonus-credit';

export type RefundAction = 'staging_partial_refund';

export async function createUser(data: {
  email: string;
  name: string;
  cognitoSub: string;
}): Promise<User> {
  const now = new Date().toISOString();
  const id = data.cognitoSub;
  const isAdmin = ADMIN_EMAILS.includes(data.email.toLowerCase());
  const plan: Plan = isAdmin ? 'admin' : 'free';
  const planConfig = PLANS[plan];

  const user: User = {
    pk: `USER#${id}`,
    sk: 'PROFILE',
    gsi1pk: 'EMAIL',
    gsi1sk: data.email.toLowerCase(),
    id,
    email: data.email.toLowerCase(),
    name: data.name,
    plan,
    creditsRemaining: isAdmin ? 999999 : planConfig.credits,
    creditsUsedAllTime: 0,
    role: null,
    listingsPerMonth: null,
    onboardingCompletedAt: isAdmin ? now : null,
    createdAt: now,
    updatedAt: now,
  };

  await dynamodb.send(
    new PutCommand({ TableName: TABLE_NAME, Item: user }),
  );
  return user;
}

export async function getUserById(id: string): Promise<User | null> {
  const result = await dynamodb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${id}`, sk: 'PROFILE' },
    }),
  );
  return (result.Item as User) || null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: 'gsi1pk = :pk AND gsi1sk = :sk',
      ExpressionAttributeValues: {
        ':pk': 'EMAIL',
        ':sk': email.toLowerCase(),
      },
      Limit: 1,
    }),
  );
  return (result.Items?.[0] as User) || null;
}

export async function updateUser(
  id: string,
  updates: Partial<Pick<User, 'name' | 'plan' | 'creditsRemaining' | 'creditsUsedAllTime' | 'creditResetDate' | 'stripeCustomerId' | 'stripeSubscriptionId'>>,
): Promise<void> {
  const now = new Date().toISOString();
  const entries = Object.entries(updates).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;

  const names: Record<string, string> = {};
  const values: Record<string, unknown> = { ':now': now };
  const setParts = ['updatedAt = :now'];

  for (const [key, val] of entries) {
    const token = `#${key}`;
    const valToken = `:${key}`;
    names[token] = key;
    values[valToken] = val;
    setParts.push(`${token} = ${valToken}`);
  }

  await dynamodb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${id}`, sk: 'PROFILE' },
      UpdateExpression: `SET ${setParts.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
}

/**
 * Deduct credits for an action. Returns true if successful, false if insufficient.
 *
 * `units` multiplier lets callers charge for N invocations of the same action
 * in one go (e.g. batch staging charges N × staging_standard upfront). Default
 * of 1 preserves existing single-action call sites unchanged.
 */
export async function deductCredits(
  userId: string,
  action: CreditAction,
  units: number = 1,
): Promise<{ success: boolean; creditsCharged: number; creditsRemaining: number }> {
  const cost = CREDIT_COSTS[action] * units;
  if (cost === 0) {
    const user = await getUserById(userId);
    return { success: true, creditsCharged: 0, creditsRemaining: user?.creditsRemaining ?? 0 };
  }

  const user = await getUserById(userId);
  if (!user) return { success: false, creditsCharged: 0, creditsRemaining: 0 };

  // Admin has unlimited
  if (user.plan === 'admin') {
    return { success: true, creditsCharged: cost, creditsRemaining: 999999 };
  }

  if (user.creditsRemaining < cost) {
    return { success: false, creditsCharged: 0, creditsRemaining: user.creditsRemaining };
  }

  const newRemaining = user.creditsRemaining - cost;
  const newUsed = user.creditsUsedAllTime + cost;

  await updateUser(userId, {
    creditsRemaining: newRemaining,
    creditsUsedAllTime: newUsed,
  });

  // Per-credit-spent bonus accounting (replaces the per-stage-completion path
  // that lived in the Lambda). Best-effort — bonus failure must NOT fail the
  // deduction.
  try {
    await grantBonusIfDue(userId, cost);
  } catch (err) {
    console.warn('[deductCredits] bonus grant failed:', err);
  }

  return { success: true, creditsCharged: cost, creditsRemaining: newRemaining };
}

export async function refundCredits(
  userId: string,
  amount: number,
  reason: string,
): Promise<void> {
  if (amount <= 0) {
    throw new Error('refundCredits: amount must be positive');
  }
  await dynamodb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${userId}`, sk: 'PROFILE' },
      UpdateExpression: 'ADD creditsRemaining :amt SET updatedAt = :now, lastRefundReason = :r',
      ExpressionAttributeValues: {
        ':amt': amount,
        ':now': new Date().toISOString(),
        ':r': reason,
      },
    }),
  );
}

/**
 * Idempotent partial refund. Caller supplies a unique `idempotencyKey`
 * (typically `${batchId}:${style}`). If the same key is replayed, no
 * double-refund — the `NOT contains(refundedKeys, :keyStr)` condition ensures
 * each logical event only credits once.
 *
 * Uses a String List for `refundedKeys` so `list_append` + `NOT contains` is
 * compatible with DDB DocumentClient v3. An ADD on creditsRemaining combined
 * with a SET on the list happens atomically in a single UpdateItem.
 */
export async function refundCreditsIdempotent(params: {
  userId: string;
  amount: number;
  action: RefundAction;
  idempotencyKey: string;
}): Promise<{ success: boolean; alreadyRefunded?: boolean; creditsRemaining?: number }> {
  try {
    const res = await dynamodb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${params.userId}`, sk: 'PROFILE' },
      UpdateExpression:
        'ADD creditsRemaining :amt SET refundedKeys = list_append(if_not_exists(refundedKeys, :empty), :newKey), updatedAt = :now, lastRefundReason = :r',
      ConditionExpression:
        'attribute_not_exists(refundedKeys) OR NOT contains(refundedKeys, :keyStr)',
      ExpressionAttributeValues: {
        ':amt': params.amount,
        ':newKey': [params.idempotencyKey],
        ':keyStr': params.idempotencyKey,
        ':empty': [],
        ':now': new Date().toISOString(),
        ':r': `${params.action}:${params.idempotencyKey}`,
      },
      ReturnValues: 'UPDATED_NEW',
    }));
    return {
      success: true,
      alreadyRefunded: false,
      creditsRemaining: (res.Attributes?.creditsRemaining as number) ?? undefined,
    };
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException) {
      // Already refunded for this key — idempotent no-op.
      return { success: true, alreadyRefunded: true };
    }
    throw e;
  }
}

/**
 * Add credits (legacy non-atomic helper). Read-modify-write — concurrent
 * writes to creditsRemaining (refunds, deductions) can be lost. Used by the
 * admin /api/admin/reviews/[id]/accept route; safe there because two concurrent
 * accepts on the same review are functionally impossible.
 *
 * For Stripe webhooks (high-frequency, parallel-delivery-prone), use
 * `addCreditsForStripeEvent` below — single atomic UpdateItem with dedup.
 */
export async function addCredits(
  userId: string,
  amount: number,
): Promise<void> {
  const user = await getUserById(userId);
  if (!user) throw new Error('User not found');

  await updateUser(userId, {
    creditsRemaining: user.creditsRemaining + amount,
  });
}

/**
 * Atomic credit grant + Stripe-event dedup, in a single DDB UpdateItem.
 *
 * Used by the Stripe webhook handler. Two parallel deliveries of the same
 * `stripeEventId` will collide on the ConditionExpression — only one wins,
 * the other returns alreadyProcessed=true with no credits granted. Any
 * concurrent refund/deduction is also safe because the ADD verb is
 * server-side atomic (vs the read-modify-write in `addCredits` above).
 *
 * Mirrors the `refundCreditsIdempotent` pattern.
 */
export async function addCreditsForStripeEvent(params: {
  userId: string;
  amount: number;
  stripeEventId: string;
}): Promise<{ alreadyProcessed: boolean }> {
  if (params.amount <= 0) {
    throw new Error('addCreditsForStripeEvent: amount must be positive');
  }
  try {
    await dynamodb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${params.userId}`, sk: 'PROFILE' },
      UpdateExpression:
        'ADD creditsRemaining :amt SET stripeEventIds = list_append(if_not_exists(stripeEventIds, :empty), :newEvent), updatedAt = :now',
      ConditionExpression:
        'attribute_not_exists(stripeEventIds) OR NOT contains(stripeEventIds, :eventStr)',
      ExpressionAttributeValues: {
        ':amt': params.amount,
        ':newEvent': [params.stripeEventId],
        ':eventStr': params.stripeEventId,
        ':empty': [],
        ':now': new Date().toISOString(),
      },
    }));
    return { alreadyProcessed: false };
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException) {
      return { alreadyProcessed: true };
    }
    throw e;
  }
}

export async function updateOnboardingFields(
  userId: string,
  updates: {
    role?: import('@/types').Role;
    listingsPerMonth?: import('@/types').ListingsPerMonth;
    listingIntent?: import('@/types').ListingIntent;
    propertyType?: import('@/types').PropertyType;
  },
): Promise<void> {
  const entries = Object.entries(updates).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;

  const now = new Date().toISOString();
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = { ':now': now };
  const setParts = ['updatedAt = :now'];

  for (const [key, val] of entries) {
    names[`#${key}`] = key;
    values[`:${key}`] = val;
    setParts.push(`#${key} = :${key}`);
  }

  await dynamodb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${userId}`, sk: 'PROFILE' },
      UpdateExpression: `SET ${setParts.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
}

export async function markOnboardingComplete(userId: string): Promise<void> {
  const now = new Date().toISOString();
  await dynamodb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${userId}`, sk: 'PROFILE' },
      UpdateExpression: 'SET onboardingCompletedAt = :now, updatedAt = :now',
      ExpressionAttributeValues: { ':now': now },
    }),
  );
}

/**
 * Mark the legacy-uploads migration as complete for a user. Idempotent —
 * the conditional expression ensures only the first call sets the timestamp;
 * subsequent calls fail-silent on ConditionalCheckFailedException.
 */
export async function markLegacyMigrationComplete(userId: string): Promise<void> {
  const user = await getUserById(userId);
  if (!user) return;
  try {
    await dynamodb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { pk: user.pk, sk: user.sk },
        UpdateExpression: 'SET legacyMigrationCompletedAt = :ts',
        ConditionExpression: 'attribute_not_exists(legacyMigrationCompletedAt)',
        ExpressionAttributeValues: {
          ':ts': new Date().toISOString(),
        },
      }),
    );
  } catch (err) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') return;
    throw err;
  }
}

/**
 * Admin-only: list every User record. Used by the admin "give credits" page.
 *
 * DDB scan with FilterExpression — fine at the current user count (dozens).
 * If we ever exceed a few hundred users, switch to the EMAIL GSI with
 * pagination and server-side search.
 */
export async function listAllUsers(): Promise<User[]> {
  const all: User[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  do {
    const res = await dynamodb.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'sk = :sk AND begins_with(pk, :pkPrefix)',
      ExpressionAttributeValues: {
        ':sk': 'PROFILE',
        ':pkPrefix': 'USER#',
      },
      ExclusiveStartKey: lastEvaluatedKey,
    }));
    if (res.Items) all.push(...(res.Items as User[]));
    lastEvaluatedKey = res.LastEvaluatedKey;
  } while (lastEvaluatedKey);
  return all;
}
