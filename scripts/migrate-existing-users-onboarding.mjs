/**
 * One-shot migration: set onboardingCompletedAt sentinel for all users
 * created before the onboarding feature ships. Without this, existing
 * users would land in onboarding on their next visit.
 *
 * Usage:
 *   node scripts/migrate-existing-users-onboarding.mjs
 *
 * Safe to re-run — UpdateCommand with attribute_not_exists guard only
 * sets the field on users that don't have it yet.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const REGION = 'ap-southeast-2';
const TABLE = 'stageright';
const SENTINEL = '2026-04-19T00:00:00.000Z';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

async function main() {
  let cursor;
  let scanned = 0;
  let updated = 0;
  do {
    const res = await ddb.send(new ScanCommand({
      TableName: TABLE,
      FilterExpression: 'sk = :sk',
      ExpressionAttributeValues: { ':sk': 'PROFILE' },
      ExclusiveStartKey: cursor,
    }));
    for (const item of res.Items ?? []) {
      scanned += 1;
      if (item.onboardingCompletedAt) continue;
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { pk: item.pk, sk: item.sk },
        UpdateExpression: 'SET onboardingCompletedAt = :s, updatedAt = :now',
        ConditionExpression: 'attribute_not_exists(onboardingCompletedAt)',
        ExpressionAttributeValues: { ':s': SENTINEL, ':now': new Date().toISOString() },
      })).catch((e) => {
        if (e.name !== 'ConditionalCheckFailedException') throw e;
      });
      updated += 1;
    }
    cursor = res.LastEvaluatedKey;
  } while (cursor);
  console.log(`Scanned: ${scanned}, updated: ${updated}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
