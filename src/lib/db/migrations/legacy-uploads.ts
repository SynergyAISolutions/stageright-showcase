import { QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { dynamodb, TABLE_NAME } from '@/lib/aws/dynamodb';
import { createListing, getUserListings } from '@/lib/db/listings';
import { getUserById, markLegacyMigrationComplete } from '@/lib/db/users';

const LEGACY_LISTING_NAME = 'Legacy uploads';

interface OrphanStaging {
  pk: string;
  sk: string;
}

/**
 * One-time per-user migration: gather stagings without a listingId into a
 * "Legacy uploads" listing. Idempotent — runs once per user, marks the User
 * record on success, no-ops thereafter.
 *
 * Triggered lazily from /api/listings GET so it self-heals without admin
 * intervention. Failures are non-fatal at the caller (logged, user can retry
 * on the next request).
 *
 * Always marks complete after a successful pass (even when there are zero
 * orphan stagings) so subsequent calls bail fast instead of re-querying.
 */
export async function migrateUnsortedToLegacy(userId: string): Promise<void> {
  const user = await getUserById(userId);
  if (!user) return;
  if (user.legacyMigrationCompletedAt) return;

  // 1. Find or create the legacy listing
  const listings = await getUserListings(userId, 1000);
  let legacyListing = listings.find((l) => l.name === LEGACY_LISTING_NAME);

  // 2. Find all stagings for this user without a listingId
  const orphans = await getOrphanStagings(userId);

  // 3. If there are orphans and no legacy listing, create one now
  if (orphans.length > 0 && !legacyListing) {
    legacyListing = await createListing({ userId, name: LEGACY_LISTING_NAME });
  }

  // 4. Update each orphan to reference the legacy listing
  if (legacyListing) {
    for (const orphan of orphans) {
      await dynamodb.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { pk: orphan.pk, sk: orphan.sk },
          UpdateExpression: 'SET listingId = :lid',
          ExpressionAttributeValues: {
            ':lid': legacyListing.id,
          },
        }),
      );
    }
  }

  // 5. Mark migration complete on the user record (always — even if no orphans
  //    were found, so future calls can bail early)
  await markLegacyMigrationComplete(userId);
}

async function getOrphanStagings(userId: string): Promise<OrphanStaging[]> {
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
      FilterExpression: 'attribute_not_exists(listingId) OR listingId = :empty',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'STAGING#',
        ':empty': '',
      },
    }),
  );
  return (result.Items as OrphanStaging[]) || [];
}
