/**
 * Admin model-comparison runs — persistence helpers.
 *
 * Records a comparison run so the admin can come back to it later. Pure
 * DDB layer; URL/page wiring lives in src/app/admin/compare and
 * src/app/api/admin/compare.
 */
import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { dynamodb, TABLE_NAME } from '@/lib/aws/dynamodb';

export interface CompareRun {
  runId: string;
  userId: string;
  heroS3Key: string;
  referenceS3Keys: string[];
  roomTypes: string[];
  styles: string[];
  notes: string;
  jobIds: string[];
  createdAt: string;
}

export async function createCompareRun(run: CompareRun): Promise<void> {
  // Two writes: primary keyed by runId for direct lookup, secondary keyed by
  // userId via GSI1 for list-newest-first queries. Same payload on both rows.
  const item = {
    ...run,
    pk: `COMPARE_RUN#${run.runId}`,
    sk: 'META',
  };
  const indexItem = {
    ...run,
    pk: `USER#${run.userId}`,
    sk: `COMPARE_RUN#${run.createdAt}#${run.runId}`,
    gsi1pk: `USER#${run.userId}`,
    gsi1sk: `COMPARE_RUN#${run.createdAt}#${run.runId}`,
  };
  await Promise.all([
    dynamodb.send(new PutCommand({ TableName: TABLE_NAME, Item: item })),
    dynamodb.send(new PutCommand({ TableName: TABLE_NAME, Item: indexItem })),
  ]);
}

export async function getCompareRun(runId: string): Promise<CompareRun | null> {
  const res = await dynamodb.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { pk: `COMPARE_RUN#${runId}`, sk: 'META' },
  }));
  if (!res.Item) return null;
  const i = res.Item;
  return {
    runId: i.runId,
    userId: i.userId,
    heroS3Key: i.heroS3Key,
    referenceS3Keys: i.referenceS3Keys || [],
    roomTypes: i.roomTypes || [],
    styles: i.styles || [],
    notes: i.notes || '',
    jobIds: i.jobIds || [],
    createdAt: i.createdAt,
  };
}

export async function listCompareRunsForUser(userId: string, limit = 50): Promise<CompareRun[]> {
  const res = await dynamodb.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':prefix': 'COMPARE_RUN#',
    },
    ScanIndexForward: false, // newest first
    Limit: limit,
  }));
  return (res.Items || []).map((i) => ({
    runId: i.runId,
    userId: i.userId,
    heroS3Key: i.heroS3Key,
    referenceS3Keys: i.referenceS3Keys || [],
    roomTypes: i.roomTypes || [],
    styles: i.styles || [],
    notes: i.notes || '',
    jobIds: i.jobIds || [],
    createdAt: i.createdAt,
  }));
}
