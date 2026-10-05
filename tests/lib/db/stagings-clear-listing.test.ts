import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendMock = vi.fn();
vi.mock('@/lib/aws/dynamodb', () => ({
  dynamodb: { send: (...args: unknown[]) => sendMock(...args) },
  TABLE_NAME: 'stageright',
}));

import { clearListingIdOnStagings } from '@/lib/db/stagings';

beforeEach(() => sendMock.mockReset());

describe('clearListingIdOnStagings', () => {
  it('REMOVEs listingId on every staging matching the given listingId', async () => {
    sendMock.mockResolvedValueOnce({
      Items: [
        { sk: 'STAGING#1', listingId: 'l1' },
        { sk: 'STAGING#2', listingId: 'l2' },
        { sk: 'STAGING#3', listingId: 'l1' },
      ],
    });
    sendMock.mockResolvedValue({});
    await clearListingIdOnStagings('u1', 'l1');
    // 1 query + 2 update calls (only the two matching rows)
    expect(sendMock).toHaveBeenCalledTimes(3);
    const updateCmd = sendMock.mock.calls[1][0];
    expect(updateCmd.input.UpdateExpression).toContain('REMOVE listingId');
    expect(updateCmd.input.Key.sk).toMatch(/STAGING#[13]/);
  });
});
