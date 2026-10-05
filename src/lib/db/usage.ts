/**
 * Usage/cost tracking — matches content-producer/src/lib/db/usage.ts pattern.
 */
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import { dynamodb, TABLE_NAME } from '@/lib/aws/dynamodb';
import type { UsageRecord } from '@/types';

export async function trackCost(
  userId: string,
  data: {
    service: UsageRecord['service'];
    action: UsageRecord['action'];
    model?: string;
    cost: number;
    creditsCharged?: number;
    jobId?: string;
  },
): Promise<void> {
  const now = new Date();
  const id = ulid();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const dateStr = now.toISOString().slice(0, 10);

  const record: UsageRecord = {
    pk: `USER#${userId}`,
    sk: `USAGE#${yearMonth}#${id}`,
    gsi1pk: `USER#${userId}`,
    gsi1sk: `USAGE#DATE#${dateStr}#${id}`,
    id,
    userId,
    service: data.service,
    action: data.action,
    model: data.model,
    cost: data.cost,
    creditsCharged: data.creditsCharged || 0,
    jobId: data.jobId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  await dynamodb.send(
    new PutCommand({ TableName: TABLE_NAME, Item: record }),
  );
}

export async function getUsageByMonth(
  userId: string,
  yearMonth: string,
): Promise<UsageRecord[]> {
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': `USAGE#${yearMonth}`,
      },
    }),
  );
  return (result.Items as UsageRecord[]) || [];
}

export async function getMonthlyTotal(
  userId: string,
  yearMonth: string,
): Promise<number> {
  const records = await getUsageByMonth(userId, yearMonth);
  return records.reduce((sum, r) => sum + r.cost, 0);
}
