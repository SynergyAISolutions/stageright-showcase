import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/aws/dynamodb', () => ({
  dynamodb: { send: vi.fn(async () => ({})) },
  TABLE_NAME: 'stageright',
}));

vi.mock('@/types', async () => {
  const actual = await vi.importActual<typeof import('@/types')>('@/types');
  return {
    ...actual,
    ADMIN_EMAILS: ['admin@example.com'],
  };
});

import { updateOnboardingFields, markOnboardingComplete, createUser } from '@/lib/db/users';
import { dynamodb } from '@/lib/aws/dynamodb';
import { UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

beforeEach(() => { vi.clearAllMocks(); });

describe('updateOnboardingFields', () => {
  it('saves role', async () => {
    await updateOnboardingFields('u1', { role: 'solo-agent' });
    expect(dynamodb.send).toHaveBeenCalledOnce();
    const call = vi.mocked(dynamodb.send).mock.calls[0][0];
    expect(call).toBeInstanceOf(UpdateCommand);
    const input = (call as UpdateCommand).input;
    expect(input.Key).toEqual({ pk: 'USER#u1', sk: 'PROFILE' });
    expect(input.UpdateExpression).toMatch(/#role = :role/);
    expect(input.ExpressionAttributeValues?.[':role']).toBe('solo-agent');
  });

  it('saves listingsPerMonth', async () => {
    await updateOnboardingFields('u1', { listingsPerMonth: '3-5' });
    const input = (vi.mocked(dynamodb.send).mock.calls[0][0] as UpdateCommand).input;
    expect(input.ExpressionAttributeValues?.[':listingsPerMonth']).toBe('3-5');
  });

  it('saves both at once', async () => {
    await updateOnboardingFields('u1', { role: 'agency', listingsPerMonth: '11+' });
    const input = (vi.mocked(dynamodb.send).mock.calls[0][0] as UpdateCommand).input;
    expect(input.ExpressionAttributeValues?.[':role']).toBe('agency');
    expect(input.ExpressionAttributeValues?.[':listingsPerMonth']).toBe('11+');
  });

  it('noop when nothing provided', async () => {
    await updateOnboardingFields('u1', {});
    expect(dynamodb.send).not.toHaveBeenCalled();
  });
});

describe('markOnboardingComplete', () => {
  it('sets onboardingCompletedAt to an ISO timestamp', async () => {
    await markOnboardingComplete('u1');
    const input = (vi.mocked(dynamodb.send).mock.calls[0][0] as UpdateCommand).input;
    expect(input.Key).toEqual({ pk: 'USER#u1', sk: 'PROFILE' });
    expect(input.UpdateExpression).toMatch(/onboardingCompletedAt = :now/);
    const val = input.ExpressionAttributeValues?.[':now'];
    expect(typeof val).toBe('string');
    expect(() => new Date(val as string).toISOString()).not.toThrow();
  });
});

describe('createUser', () => {
  it('sets onboardingCompletedAt for admin users', async () => {
    await createUser({ email: 'admin@example.com', name: 'Admin', cognitoSub: 'sub-a' });
    const put = vi.mocked(dynamodb.send).mock.calls.find(
      ([cmd]) => cmd instanceof PutCommand,
    )?.[0] as PutCommand | undefined;
    expect(put?.input.Item?.onboardingCompletedAt).toBeTypeOf('string');
  });

  it('leaves onboardingCompletedAt null for non-admin users', async () => {
    await createUser({ email: 'user@example.com', name: 'User', cognitoSub: 'sub-u' });
    const put = vi.mocked(dynamodb.send).mock.calls.find(
      ([cmd]) => cmd instanceof PutCommand,
    )?.[0] as PutCommand | undefined;
    expect(put?.input.Item?.onboardingCompletedAt).toBeNull();
  });
});
