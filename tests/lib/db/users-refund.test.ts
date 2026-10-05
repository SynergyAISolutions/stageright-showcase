import { describe, it, expect, vi, beforeEach } from 'vitest';

const updateMock = vi.fn();
vi.mock('@/lib/aws/dynamodb', () => ({
  dynamodb: { send: (...args: unknown[]) => updateMock(...args) },
  TABLE_NAME: 'stageright',
}));

import { refundCredits } from '@/lib/db/users';

describe('refundCredits', () => {
  beforeEach(() => {
    updateMock.mockReset();
    updateMock.mockResolvedValue({});
  });

  it('sends an atomic ADD update for the given amount', async () => {
    await refundCredits('u-1', 3, 'batch-sub-job-error');
    expect(updateMock).toHaveBeenCalledOnce();
    const cmd = updateMock.mock.calls[0][0];
    expect(cmd.input.TableName).toBe('stageright');
    expect(cmd.input.Key).toEqual({ pk: 'USER#u-1', sk: 'PROFILE' });
    expect(cmd.input.UpdateExpression).toContain('ADD creditsRemaining');
    expect(cmd.input.ExpressionAttributeValues).toMatchObject({ ':amt': 3 });
  });

  it('throws on zero or negative amounts', async () => {
    await expect(refundCredits('u-1', 0, 'test')).rejects.toThrow(/amount must be positive/i);
    await expect(refundCredits('u-1', -1, 'test')).rejects.toThrow(/amount must be positive/i);
  });
});
