/**
 * Staging session storage — persists conversation history for multi-turn editing.
 */
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import { dynamodb, TABLE_NAME } from '@/lib/aws/dynamodb';

export interface ConversationTurn {
  role: 'user' | 'model';
  text?: string;
  imageS3Key?: string;
}

export interface StagingSession {
  pk: string;
  sk: string;
  sessionId: string;
  heroS3Key: string;
  referenceS3Keys: string[];
  style: string;
  model: string;
  roomTypes: string[];
  roomAnalysis: string;
  turns: ConversationTurn[];
  createdAt: string;
  updatedAt: string;
}

export async function createStagingSession(data: {
  heroS3Key: string;
  referenceS3Keys: string[];
  style: string;
  model: string;
  roomTypes: string[];
  roomAnalysis: string;
  initialPrompt: string;
  stagedImageS3Key: string;
  modelResponseText: string;
}): Promise<StagingSession> {
  const now = new Date().toISOString();
  const sessionId = ulid();

  const session: StagingSession = {
    pk: `SESSION#${sessionId}`,
    sk: 'META',
    sessionId,
    heroS3Key: data.heroS3Key,
    referenceS3Keys: data.referenceS3Keys,
    style: data.style,
    model: data.model,
    roomTypes: data.roomTypes,
    roomAnalysis: data.roomAnalysis,
    turns: [
      {
        role: 'user',
        text: data.initialPrompt,
        imageS3Key: data.heroS3Key,
      },
      {
        role: 'model',
        text: data.modelResponseText,
        imageS3Key: data.stagedImageS3Key,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };

  await dynamodb.send(
    new PutCommand({ TableName: TABLE_NAME, Item: session }),
  );
  return session;
}

export async function getStagingSession(
  sessionId: string,
): Promise<StagingSession | null> {
  const result = await dynamodb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: `SESSION#${sessionId}`, sk: 'META' },
    }),
  );
  return (result.Item as StagingSession) || null;
}

export async function addTurnToSession(
  sessionId: string,
  userText: string,
  modelResponseText: string,
  stagedImageS3Key: string,
): Promise<void> {
  const now = new Date().toISOString();

  const session = await getStagingSession(sessionId);
  if (!session) throw new Error('Session not found');

  const newTurns = [
    ...session.turns,
    { role: 'user' as const, text: userText },
    { role: 'model' as const, text: modelResponseText, imageS3Key: stagedImageS3Key },
  ];

  await dynamodb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `SESSION#${sessionId}`, sk: 'META' },
      UpdateExpression: 'SET turns = :turns, updatedAt = :now',
      ExpressionAttributeValues: {
        ':turns': newTurns,
        ':now': now,
      },
    }),
  );
}
