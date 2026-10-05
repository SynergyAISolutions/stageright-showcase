import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the DDB client used by the migration. Match the pattern in
// tests/lib/db/listings.test.ts.
const sendMock = vi.fn();
vi.mock('@/lib/aws/dynamodb', () => ({
  dynamodb: { send: (...args: unknown[]) => sendMock(...args) },
  TABLE_NAME: 'stageright-test',
}));

// Mock the helpers we depend on so tests focus on the migration's flow.
const getUserByIdMock = vi.fn();
const markLegacyMigrationCompleteMock = vi.fn();
vi.mock('@/lib/db/users', () => ({
  getUserById: (...args: unknown[]) => getUserByIdMock(...args),
  markLegacyMigrationComplete: (...args: unknown[]) => markLegacyMigrationCompleteMock(...args),
}));

const getUserListingsMock = vi.fn();
const createListingMock = vi.fn();
vi.mock('@/lib/db/listings', () => ({
  getUserListings: (...args: unknown[]) => getUserListingsMock(...args),
  createListing: (...args: unknown[]) => createListingMock(...args),
}));

import { migrateUnsortedToLegacy } from '@/lib/db/migrations/legacy-uploads';

describe('migrateUnsortedToLegacy', () => {
  beforeEach(() => {
    sendMock.mockReset();
    getUserByIdMock.mockReset();
    markLegacyMigrationCompleteMock.mockReset();
    getUserListingsMock.mockReset();
    createListingMock.mockReset();
  });

  it('is a no-op if migration already completed', async () => {
    getUserByIdMock.mockResolvedValueOnce({
      id: 'u1',
      legacyMigrationCompletedAt: '2026-05-01T00:00:00Z',
    });

    await migrateUnsortedToLegacy('u1');

    // Should NOT have queried for stagings, listings, or marked complete
    expect(sendMock).not.toHaveBeenCalled();
    expect(getUserListingsMock).not.toHaveBeenCalled();
    expect(createListingMock).not.toHaveBeenCalled();
    expect(markLegacyMigrationCompleteMock).not.toHaveBeenCalled();
  });

  it('is a no-op if user does not exist', async () => {
    getUserByIdMock.mockResolvedValueOnce(null);
    await migrateUnsortedToLegacy('missing-user');
    expect(sendMock).not.toHaveBeenCalled();
    expect(markLegacyMigrationCompleteMock).not.toHaveBeenCalled();
  });

  it('runs migration and marks complete when user has orphan stagings', async () => {
    getUserByIdMock.mockResolvedValueOnce({ id: 'u1' }); // no flag set
    getUserListingsMock.mockResolvedValueOnce([]); // no existing legacy listing
    createListingMock.mockResolvedValueOnce({
      id: 'legacy-id',
      pk: 'USER#u1',
      sk: 'LISTING#2026-05-04#legacy-id',
      name: 'Legacy uploads',
    });
    // Mock the orphan stagings query result
    sendMock.mockResolvedValueOnce({
      Items: [
        { pk: 'USER#u1', sk: 'STAGING#a' },
        { pk: 'USER#u1', sk: 'STAGING#b' },
      ],
    });
    // Mock the two UpdateCommand responses
    sendMock.mockResolvedValueOnce({});
    sendMock.mockResolvedValueOnce({});

    await migrateUnsortedToLegacy('u1');

    expect(createListingMock).toHaveBeenCalledTimes(1);
    expect(createListingMock).toHaveBeenCalledWith({ userId: 'u1', name: 'Legacy uploads' });
    expect(sendMock).toHaveBeenCalledTimes(3); // 1 query + 2 updates
    expect(markLegacyMigrationCompleteMock).toHaveBeenCalledWith('u1');
  });

  it('reuses existing "Legacy uploads" listing if it already exists', async () => {
    getUserByIdMock.mockResolvedValueOnce({ id: 'u1' });
    getUserListingsMock.mockResolvedValueOnce([
      { id: 'existing-legacy', name: 'Legacy uploads', pk: 'USER#u1', sk: 'LISTING#2026-04-01#x' },
    ]);
    sendMock.mockResolvedValueOnce({
      Items: [{ pk: 'USER#u1', sk: 'STAGING#a' }],
    });
    sendMock.mockResolvedValueOnce({});

    await migrateUnsortedToLegacy('u1');

    expect(createListingMock).not.toHaveBeenCalled();
    expect(markLegacyMigrationCompleteMock).toHaveBeenCalledWith('u1');
  });

  it('marks complete even when no orphan stagings exist (so future calls no-op cheaply)', async () => {
    getUserByIdMock.mockResolvedValueOnce({ id: 'u1' });
    getUserListingsMock.mockResolvedValueOnce([]);
    sendMock.mockResolvedValueOnce({ Items: [] }); // no orphans

    await migrateUnsortedToLegacy('u1');

    // No listing created, no UpdateCommands fired
    expect(createListingMock).not.toHaveBeenCalled();
    expect(sendMock).toHaveBeenCalledTimes(1); // only the orphans query
    // But still mark complete
    expect(markLegacyMigrationCompleteMock).toHaveBeenCalledWith('u1');
  });
});
