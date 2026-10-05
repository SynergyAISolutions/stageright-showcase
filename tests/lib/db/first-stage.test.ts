import { describe, it, expect, vi, beforeEach } from 'vitest';

// Vitest hoists vi.mock above imports. The factory MUST NOT close over an
// external variable (hoisting would see it undefined). Use vi.fn() inline,
// then grab a typed reference via a normal import below.
vi.mock('@/lib/aws/dynamodb', () => ({
  dynamodb: { send: vi.fn() },
  TABLE_NAME: 'stageright',
}));

import { dynamodb } from '@/lib/aws/dynamodb';
import { markFirstStage } from '@/lib/db/first-stage';

const send = dynamodb.send as unknown as ReturnType<typeof vi.fn>;

describe('markFirstStage', () => {
  beforeEach(() => {
    send.mockReset();
  });

  it('returns true when the ConditionalUpdate succeeds', async () => {
    send.mockResolvedValueOnce({});
    const result = await markFirstStage('user-123');
    expect(result).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    const cmd = send.mock.calls[0][0];
    expect(cmd.input.Key).toEqual({ pk: 'USER#user-123', sk: 'PROFILE' });
    expect(cmd.input.ConditionExpression).toContain('attribute_not_exists(firstStageAt)');
    expect(cmd.input.UpdateExpression).toContain('firstStageAt');
  });

  it('returns false when ConditionalCheckFailed (firstStageAt already set)', async () => {
    const err = new Error('ConditionalCheckFailedException');
    err.name = 'ConditionalCheckFailedException';
    send.mockRejectedValueOnce(err);
    expect(await markFirstStage('user-123')).toBe(false);
  });

  it('returns false on any other error and does not throw', async () => {
    send.mockRejectedValueOnce(new Error('network boom'));
    expect(await markFirstStage('user-123')).toBe(false);
  });
});
