import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { dynamodb, TABLE_NAME } from '@/lib/aws/dynamodb';

/**
 * Atomically marks a user's first successful stage. Returns true if this
 * call was the one that transitioned firstStageAt from unset → set; false
 * if the field was already set (another poll or tab won the race) or if
 * the write failed for any other reason.
 *
 * Idempotent by design — safe to call on every /api/jobs 'done' poll.
 * The ConditionExpression guarantees only one call per user ever wins.
 */
export async function markFirstStage(userId: string): Promise<boolean> {
  try {
    await dynamodb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${userId}`, sk: 'PROFILE' },
      UpdateExpression: 'SET firstStageAt = :now, updatedAt = :now',
      ConditionExpression: 'attribute_not_exists(firstStageAt)',
      ExpressionAttributeValues: {
        ':now': new Date().toISOString(),
      },
    }));
    return true;
  } catch {
    // Either ConditionalCheckFailedException (field already set) or a
    // transient error. The welcome toast is a nice-to-have, not critical —
    // swallow both and return false. Real errors are surfaced elsewhere.
    return false;
  }
}
