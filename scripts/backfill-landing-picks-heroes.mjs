/**
 * One-shot backfill for LandingPick.heroByStyle.
 *
 * Picks made before 2026-05-02 only stored {style: stagedS3Key} — no
 * reference to which empty-room source each staged image came from. This
 * script walks every LANDING_PICK record, looks up each picked stagedS3Key
 * in the admin's stagings table, and populates heroByStyle accordingly.
 *
 * Usage:
 *   node scripts/backfill-landing-picks-heroes.mjs
 *   node scripts/backfill-landing-picks-heroes.mjs --admin taraferguson.business@gmail.com
 *   node scripts/backfill-landing-picks-heroes.mjs --dry-run
 *
 * Idempotent: if heroByStyle is already populated for a style, leaves it
 * alone. Safe to re-run.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

const REGION = 'ap-southeast-2';
const TABLE = 'stageright';
const DEFAULT_ADMIN = 'tara@aiwave.com.au';

function parseArgs(argv) {
  const args = argv.slice(2);
  let admin = DEFAULT_ADMIN;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--admin') admin = args[++i];
    else if (args[i] === '--dry-run') dryRun = true;
  }
  return { admin, dryRun };
}

async function resolveUserId(ddb, email) {
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE,
    IndexName: 'GSI1',
    KeyConditionExpression: 'gsi1pk = :pk AND gsi1sk = :sk',
    ExpressionAttributeValues: { ':pk': 'EMAIL', ':sk': email.toLowerCase() },
    Limit: 1,
  }));
  if (!res.Items?.length) throw new Error(`No user with email ${email}`);
  return res.Items[0].id;
}

async function fetchAllAdminStagings(ddb, userId) {
  // Paginate through STAGING# rows for this user.
  const items = [];
  let exclusiveStartKey;
  do {
    const res = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'STAGING#',
      },
      ProjectionExpression: 'heroS3Key, stagedS3Key',
      ExclusiveStartKey: exclusiveStartKey,
    }));
    if (res.Items) items.push(...res.Items);
    exclusiveStartKey = res.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return items;
}

async function fetchAllLandingPicks(ddb) {
  const items = [];
  let exclusiveStartKey;
  do {
    const res = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': 'LANDING_PICK' },
      ExclusiveStartKey: exclusiveStartKey,
    }));
    if (res.Items) items.push(...res.Items);
    exclusiveStartKey = res.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return items;
}

async function main() {
  const { admin, dryRun } = parseArgs(process.argv);
  console.log(`Admin: ${admin}${dryRun ? '  (DRY RUN)' : ''}`);

  const client = new DynamoDBClient({ region: REGION });
  const ddb = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });

  console.log('Resolving admin user…');
  const userId = await resolveUserId(ddb, admin);
  console.log(`  → userId ${userId}`);

  console.log('Fetching admin stagings…');
  const stagings = await fetchAllAdminStagings(ddb, userId);
  console.log(`  → ${stagings.length} stagings`);

  // Build map: stagedS3Key → heroS3Key.
  const stagedToHero = new Map();
  for (const s of stagings) {
    if (s.stagedS3Key && s.heroS3Key) {
      stagedToHero.set(s.stagedS3Key, s.heroS3Key);
    }
  }
  console.log(`  → ${stagedToHero.size} unique stagedS3Key → heroS3Key entries`);

  console.log('Fetching LANDING_PICK records…');
  const picks = await fetchAllLandingPicks(ddb);
  console.log(`  → ${picks.length} LandingPick records`);

  let recordsTouched = 0;
  let stylesPatched = 0;
  for (const pick of picks) {
    const existingHeroes = pick.heroByStyle || {};
    const newHeroes = { ...existingHeroes };
    let changed = false;
    for (const [style, stagedKey] of Object.entries(pick.picks || {})) {
      if (newHeroes[style]) continue; // already set, skip
      const heroKey = stagedToHero.get(stagedKey);
      if (!heroKey) {
        console.log(`  ⚠  ${pick.sk} / ${style}: no source staging found for ${stagedKey}`);
        continue;
      }
      newHeroes[style] = heroKey;
      changed = true;
      stylesPatched++;
    }
    if (!changed) continue;
    recordsTouched++;
    console.log(`  ✓ ${pick.sk}: patching ${Object.keys(newHeroes).length - Object.keys(existingHeroes).length} style(s)`);
    if (dryRun) continue;
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: { pk: pick.pk, sk: pick.sk },
      UpdateExpression: 'SET heroByStyle = :h, updatedAt = :now',
      ExpressionAttributeValues: {
        ':h': newHeroes,
        ':now': new Date().toISOString(),
      },
    }));
  }

  console.log(`\nDone. ${recordsTouched} record(s) ${dryRun ? 'would be' : ''} updated, ${stylesPatched} style entries ${dryRun ? 'would be' : ''} patched.`);
  if (recordsTouched > 0 && !dryRun) {
    console.log('\nNext: hit the public landing — slider will activate within the ISR window. Or trigger /api/admin/landing-picks to revalidate (any save action does this).');
  }
}

main().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
