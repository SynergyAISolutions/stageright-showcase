/**
 * Staging job data access — matches content-producer/src/lib/db/ pattern.
 */
import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import { dynamodb, TABLE_NAME } from '@/lib/aws/dynamodb';
import type { StagingJob, StagingStatus } from '@/types';

export async function createStagingJob(
  userId: string,
  data: {
    style: string;
    model: 'nano-banana-2' | 'nano-banana-pro';
    originalS3Key: string;
    estimatedCost: number;
  },
): Promise<StagingJob> {
  const now = new Date().toISOString();
  const id = ulid();

  const job: StagingJob = {
    pk: `USER#${userId}`,
    sk: `JOB#${id}`,
    gsi1pk: `USER#${userId}`,
    gsi1sk: `JOB#STATUS#uploading#${now}`,
    id,
    userId,
    status: 'uploading',
    style: data.style,
    model: data.model,
    originalS3Key: data.originalS3Key,
    creditsUsed: 0,
    attempt: 1,
    maxAttempts: 3,
    estimatedCost: data.estimatedCost,
    createdAt: now,
    updatedAt: now,
  };

  await dynamodb.send(
    new PutCommand({ TableName: TABLE_NAME, Item: job }),
  );
  return job;
}

export async function getStagingJobById(
  userId: string,
  jobId: string,
): Promise<StagingJob | null> {
  const result = await dynamodb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${userId}`, sk: `JOB#${jobId}` },
    }),
  );
  return (result.Item as StagingJob) || null;
}

export async function getStagingJobsByUser(
  userId: string,
): Promise<StagingJob[]> {
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'JOB#',
      },
      ScanIndexForward: false,
    }),
  );
  return (result.Items as StagingJob[]) || [];
}

export async function updateStagingJob(
  userId: string,
  jobId: string,
  updates: Partial<Pick<
    StagingJob,
    'status' | 'stagedS3Key' | 'validationScore' | 'validationPassed' | 'attempt' | 'chatHistory' | 'error'
  >>,
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

  // Recalculate GSI1 sort key if status changed
  if (updates.status) {
    names['#gsi1sk'] = 'gsi1sk';
    values[':gsi1sk'] = `JOB#STATUS#${updates.status}#${now}`;
    setParts.push('#gsi1sk = :gsi1sk');
  }

  await dynamodb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${userId}`, sk: `JOB#${jobId}` },
      UpdateExpression: `SET ${setParts.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
}

export async function deleteStagingJob(
  userId: string,
  jobId: string,
): Promise<void> {
  await dynamodb.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${userId}`, sk: `JOB#${jobId}` },
    }),
  );
}
