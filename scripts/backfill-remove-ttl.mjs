/**
 * One-shot backfill: remove `expiresAt` from every DynamoDB row that has it.
 *
 * Why:
 *   We removed the 7-day auto-delete. Code no longer writes `expiresAt` on new
 *   STAGING or BATCH items, but rows created before the change still have it
 *   set — DynamoDB TTL will still delete them when their clock runs out.
 *   This script strips `expiresAt` from every existing row so nothing gets
 *   auto-deleted.
 *
 * Usage:
 *   node scripts/backfill-remove-ttl.mjs           # dry run (reports counts, no writes)
 *   node scripts/backfill-remove-ttl.mjs --apply   # actually remove the attribute
 *
 * Safe to re-run: already-stripped rows are filtered out and skipped.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const REGION = 'ap-southeast-2';
const TABLE = 'stageright';

const apply = process.argv.includes('--apply');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

async function main() {
  console.log(`[backfill] Table: ${TABLE} (${REGION})`);
  console.log(`[backfill] Mode: ${apply ? 'APPLY (will modify rows)' : 'DRY RUN (no writes)'}`);
  console.log('');

  let scanned = 0;
  let toStrip = 0;
  let stripped = 0;
  let errors = 0;
  let exclusiveStartKey;

  do {
    const res = await ddb.send(new ScanCommand({
      TableName: TABLE,
      FilterExpression: 'attribute_exists(expiresAt)',
      ProjectionExpression: 'pk, sk, expiresAt',
      ExclusiveStartKey: exclusiveStartKey,
    }));

    const items = res.Items || [];
    scanned += res.ScannedCount || 0;
    toStrip += items.length;

    if (items.length > 0) {
      process.stdout.write(`[backfill] Page: ${items.length} rows with expiresAt`);
      if (apply) {
        for (const item of items) {
          try {
            await ddb.send(new UpdateCommand({
              TableName: TABLE,
              Key: { pk: item.pk, sk: item.sk },
              UpdateExpression: 'REMOVE expiresAt',
            }));
            stripped++;
          } catch (err) {
            errors++;
            console.error(`\n[backfill] Failed on pk=${item.pk} sk=${item.sk}: ${err.message}`);
          }
        }
        process.stdout.write(` → stripped ${items.length}\n`);
      } else {
        process.stdout.write(` (would strip)\n`);
      }
    }

    exclusiveStartKey = res.LastEvaluatedKey;
  } while (exclusiveStartKey);

  console.log('');
  console.log(`[backfill] Scanned rows total: ${scanned}`);
  console.log(`[backfill] Rows with expiresAt: ${toStrip}`);
  if (apply) {
    console.log(`[backfill] Rows stripped: ${stripped}`);
    console.log(`[backfill] Errors: ${errors}`);
  } else {
    console.log(`[backfill] Re-run with --apply to remove expiresAt from these rows.`);
  }
}

main().catch((err) => {
  console.error('[backfill] Fatal:', err);
  process.exit(1);
});
