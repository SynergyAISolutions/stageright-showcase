import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendMock = vi.fn();
vi.mock('@/lib/aws/dynamodb', () => ({
  dynamodb: { send: (...args: unknown[]) => sendMock(...args) },
  TABLE_NAME: 'stageright',
}));

import {
  createListing,
  getUserListings,
  getListingById,
  updateListing,
  deleteListing,
  setListingCoverIfMissing,
  setListingCover,
} from '@/lib/db/listings';

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockResolvedValue({});
});

describe('createListing', () => {
  it('writes a USER#... / LISTING#... row with ulid id', async () => {
    const listing = await createListing({ userId: 'u1', name: '12 Smith St' });
    expect(listing.id).toMatch(/^[0-9A-Z]{26}$/);
    expect(listing.pk).toBe('USER#u1');
    expect(listing.sk).toMatch(/^LISTING#.*#[0-9A-Z]{26}$/);
    expect(listing.name).toBe('12 Smith St');
    expect(listing.coverS3Key).toBeUndefined();
    expect(listing.address).toBeUndefined();
    const cmd = sendMock.mock.calls[0][0];
    expect(cmd.input.Item.pk).toBe('USER#u1');
    expect(cmd.input.Item.userId).toBe('u1');
  });

  it('persists optional address', async () => {
    const listing = await createListing({ userId: 'u1', name: 'A', address: '12 Smith St, Brisbane' });
    expect(listing.address).toBe('12 Smith St, Brisbane');
  });
});

describe('getUserListings', () => {
  it('queries USER#... begins_with LISTING# in reverse order', async () => {
    sendMock.mockResolvedValueOnce({ Items: [{ id: 'l1', name: 'A' }] });
    const result = await getUserListings('u1');
    expect(result).toEqual([{ id: 'l1', name: 'A' }]);
    const cmd = sendMock.mock.calls[0][0];
    expect(cmd.input.KeyConditionExpression).toContain('begins_with(sk, :sk)');
    expect(cmd.input.ExpressionAttributeValues[':sk']).toBe('LISTING#');
    expect(cmd.input.ScanIndexForward).toBe(false);
  });
});

describe('getListingById', () => {
  it('queries USER#... begins_with LISTING# and matches id', async () => {
    sendMock.mockResolvedValueOnce({
      Items: [
        { id: 'l1', userId: 'u1', name: 'A' },
        { id: 'l2', userId: 'u1', name: 'B' },
      ],
    });
    const result = await getListingById('u1', 'l2');
    expect(result?.name).toBe('B');
  });

  it('returns null when not found', async () => {
    sendMock.mockResolvedValueOnce({ Items: [] });
    expect(await getListingById('u1', 'nope')).toBeNull();
  });
});

describe('updateListing', () => {
  it('updates name and address with sk + bumps updatedAt', async () => {
    sendMock.mockResolvedValueOnce({
      Items: [{ id: 'l1', userId: 'u1', sk: 'LISTING#2026-01-01#l1', name: 'Old' }],
    });
    sendMock.mockResolvedValueOnce({});
    await updateListing('u1', 'l1', { name: 'New', address: 'Addr' });
    const updateCmd = sendMock.mock.calls[1][0];
    expect(updateCmd.input.UpdateExpression).toContain('#name = :name');
    expect(updateCmd.input.UpdateExpression).toContain('address = :address');
    expect(updateCmd.input.UpdateExpression).toContain('updatedAt = :updatedAt');
  });
});

describe('deleteListing', () => {
  it('deletes by computed sk', async () => {
    sendMock.mockResolvedValueOnce({
      Items: [{ id: 'l1', userId: 'u1', sk: 'LISTING#2026-01-01#l1' }],
    });
    sendMock.mockResolvedValueOnce({});
    await deleteListing('u1', 'l1');
    const cmd = sendMock.mock.calls[1][0];
    expect(cmd.input.Key.sk).toBe('LISTING#2026-01-01#l1');
  });
});

describe('setListingCoverIfMissing', () => {
  it('uses ConditionExpression to only set when coverS3Key is missing', async () => {
    sendMock.mockResolvedValueOnce({
      Items: [{ id: 'l1', userId: 'u1', sk: 'LISTING#2026-01-01#l1' }],
    });
    sendMock.mockResolvedValueOnce({});
    await setListingCoverIfMissing('u1', 'l1', 'staged/some.jpg');
    const cmd = sendMock.mock.calls[1][0];
    expect(cmd.input.UpdateExpression).toContain('coverS3Key = :cover');
    expect(cmd.input.ConditionExpression).toContain('attribute_not_exists(coverS3Key)');
  });

  it('swallows ConditionalCheckFailedException', async () => {
    sendMock.mockResolvedValueOnce({
      Items: [{ id: 'l1', userId: 'u1', sk: 'LISTING#2026-01-01#l1' }],
    });
    const err = new Error('cond failed');
    (err as unknown as { name: string }).name = 'ConditionalCheckFailedException';
    sendMock.mockRejectedValueOnce(err);
    await expect(setListingCoverIfMissing('u1', 'l1', 'k')).resolves.toBeUndefined();
  });
});

describe('setListingCover', () => {
  it('overwrites the cover even when one already exists', async () => {
    sendMock.mockResolvedValueOnce({
      Items: [{
        pk: 'USER#u1',
        sk: 'LISTING#2026-01-01#abc',
        id: 'abc',
        userId: 'u1',
        name: '12 Acacia',
        coverS3Key: 'old-cover.jpg',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      }],
    });
    sendMock.mockResolvedValueOnce({});

    await setListingCover('u1', 'abc', 'new-cover.jpg');

    const updateCmd = sendMock.mock.calls[1][0];
    expect(updateCmd.input.UpdateExpression).toContain('coverS3Key = :cover');
    // No conditional — overwrite always
    expect(updateCmd.input.ConditionExpression).toBeUndefined();
    expect(updateCmd.input.ExpressionAttributeValues[':cover']).toBe('new-cover.jpg');
  });

  it('is a no-op when the listing does not exist', async () => {
    sendMock.mockResolvedValueOnce({ Items: [] });
    await setListingCover('u1', 'missing', 'new-cover.jpg');
    // Only the query was sent — no UpdateCommand
    expect(sendMock.mock.calls.length).toBe(1);
  });
});
