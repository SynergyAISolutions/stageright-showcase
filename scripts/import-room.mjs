/**
 * One-shot landing-thumbnail importer.
 *
 * Usage:
 *   node scripts/import-room.mjs "Guest Room"
 *   node scripts/import-room.mjs "Kitchen" --admin taraferguson.business@gmail.com
 *
 * What it does:
 *   1. Resolves the admin's user id via the users GSI (gsi1pk=EMAIL, gsi1sk=<email>).
 *   2. Queries DynamoDB for the admin's stagings, filtered to roomTypes contains <room label>.
 *   3. Picks the latest staging per style (12 styles expected).
 *   4. Downloads each staged JPG from s3://stageright-images/...
 *      to public/style-thumbnails/<slug>/<style-slug>.jpg.
 *   5. Compresses each via sharp/mozjpeg (resize to 1200px, quality 78, ~85% size reduction).
 *   6. Prints the AVAILABLE_ROOMS line to paste into style-showcase.tsx.
 *
 * Does NOT commit or push — you review first, then `git add public/... src/... && git commit`.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { mkdir, writeFile, unlink, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';

const REGION = 'ap-southeast-2';
const TABLE = 'stageright';
const BUCKET = 'stageright-images';
const DEFAULT_ADMIN = 'tara@aiwave.com.au';

const STYLES = [
  'Modern', 'Scandinavian', 'Coastal', 'Hamptons', 'Luxury',
  'Farmhouse', 'Mid-Century Modern', 'Industrial', 'Minimalist',
  'Contemporary Australian', 'Japandi', 'Boho',
];

function slugify(s) {
  return s.toLowerCase().replace(/\s+/g, '-');
}

function parseArgs(argv) {
  const args = argv.slice(2);
  let label = null;
  let admin = DEFAULT_ADMIN;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--admin') admin = args[++i];
    else if (!label) label = args[i];
  }
  if (!label) {
    console.error('Usage: node scripts/import-room.mjs "<Room Label>" [--admin <email>]');
    process.exit(1);
  }
  return { label, admin };
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

async function fetchStagings(ddb, userId, label) {
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
    FilterExpression: 'contains(roomTypes, :r)',
    ExpressionAttributeNames: { '#s': 'style' },
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`, ':sk': 'STAGING#', ':r': label,
    },
    ProjectionExpression: '#s, stagedS3Key, heroS3Key, roomTypes, notes, createdAt',
  }));
  // EXACT match — roomTypes must be exactly [label]. Prevents combined-zone
  // stagings (e.g. ["Dining Room", "Living Room"]) from bleeding into a
  // single-room import when the admin generated both sets.
  const filtered = (res.Items || []).filter((it) => {
    const rts = it.roomTypes;
    if (!Array.isArray(rts) || rts.length !== 1) return false;
    return rts[0] === label;
  });
  return filtered;
}

function pickLatestPerStyle(items) {
  const map = {};
  for (const it of items) {
    if (!map[it.style] || it.createdAt > map[it.style].createdAt) map[it.style] = it;
  }
  return map;
}

async function downloadAndCompress(s3, key, destPath) {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const bytes = Buffer.from(await res.Body.transformToByteArray());
  const tmp = destPath + '.tmp';
  await writeFile(tmp, bytes);
  const before = bytes.length;
  const compressed = await sharp(tmp)
    .resize({ width: 1200, withoutEnlargement: true })
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer();
  await unlink(tmp);
  await writeFile(destPath, compressed);
  return { before, after: compressed.length };
}

async function main() {
  const { label, admin } = parseArgs(process.argv);
  const slug = slugify(label);
  console.log(`Importing "${label}" (slug: ${slug}) from admin ${admin}`);

  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
  const s3 = new S3Client({ region: REGION });

  const userId = await resolveUserId(ddb, admin);
  console.log(`  Admin user id: ${userId}`);

  const all = await fetchStagings(ddb, userId, label);
  const latest = pickLatestPerStyle(all);
  const missing = STYLES.filter((s) => !latest[s]);
  if (missing.length) {
    console.error(`\n  Missing styles (${missing.length}): ${missing.join(', ')}`);
    console.error('  Generate the missing ones in the wizard first, then re-run.');
    process.exit(2);
  }

  const destDir = `public/style-thumbnails/${slug}`;
  await mkdir(destDir, { recursive: true });

  console.log(`  Downloading ${STYLES.length} stagings to ${destDir}/ and compressing:`);
  for (const style of STYLES) {
    const { stagedS3Key, createdAt } = latest[style];
    const destPath = join(destDir, `${slugify(style)}.jpg`);
    const { before, after } = await downloadAndCompress(s3, stagedS3Key, destPath);
    console.log(
      `    ${style.padEnd(26)} ${(before / 1024).toFixed(0).padStart(4)} KB -> ${(after / 1024).toFixed(0).padStart(3)} KB  (${createdAt.slice(0, 19)})`,
    );
  }

  // Grab the hero (empty-room) image from any one staging — all 12 share the same hero.
  const anyLatest = latest['Modern'] ?? Object.values(latest)[0];
  const heroKey = anyLatest?.heroS3Key;
  if (heroKey) {
    const destHero = join(destDir, '_original.jpg');
    const { before, after } = await downloadAndCompress(s3, heroKey, destHero);
    console.log(
      `    ${'Original hero'.padEnd(26)} ${(before / 1024).toFixed(0).padStart(4)} KB -> ${(after / 1024).toFixed(0).padStart(3)} KB`,
    );
  } else {
    console.log('    (no heroS3Key on latest staging — skipping _original.jpg)');
  }

  // Write per-style notes map so the landing page can show the actual AI notes.
  const notesMap = {};
  for (const style of STYLES) {
    notesMap[slugify(style)] = latest[style].notes || '';
  }
  await writeFile(join(destDir, 'notes.json'), JSON.stringify(notesMap, null, 2));
  console.log(`    Notes saved to notes.json`);

  console.log(`\n  Done. Next steps:`);
  console.log(`    1. Add to AVAILABLE_ROOMS in src/components/landing/style-showcase.tsx:`);
  console.log(`         { slug: '${slug}', label: '${label}' },`);
  console.log(`    2. git add public/style-thumbnails/${slug}/ src/components/landing/style-showcase.tsx`);
  console.log(`    3. git commit && git push`);
}

main().catch((e) => { console.error(e); process.exit(1); });
