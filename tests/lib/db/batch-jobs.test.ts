import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendMock = vi.fn();
vi.mock('@/lib/aws/dynamodb', () => ({
  dynamodb: { send: (...args: unknown[]) => sendMock(...args) },
  TABLE_NAME: 'stageright',
}));

import {
  createBatchJob,
  getBatchJob,
  markSubJobDone,
  markSubJobError,
  setRoomAnalysisForStyle,
  type BatchJobInput,
} from '@/lib/db/batch-jobs';

const input: BatchJobInput = {
  userId: 'u-1',
  bundle: 'single',
  heroS3Key: 'users/u-1/hero.jpg',
  referenceS3Keys: [],
  roomTypes: ['Living Room'],
  notes: '',
  styles: ['Modern', 'Coastal', 'Hamptons'],
};

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockResolvedValue({});
});

describe('createBatchJob', () => {
  it('writes a record with one pending sub-job per style', async () => {
    const job = await createBatchJob(input);
    expect(job.batchId).toMatch(/^[0-9A-Z]{26}$/);
    expect(job.subJobs).toHaveLength(3);
    expect(job.subJobs.every((s) => s.status === 'pending')).toBe(true);
    expect(job.subJobs.map((s) => s.style)).toEqual(['Modern', 'Coastal', 'Hamptons']);
    expect(job.total).toBe(3);
    expect(job.completed).toBe(0);
    expect(job.failed).toBe(0);
    expect(job.refundedCredits).toBe(0);
    const cmd = sendMock.mock.calls[0][0];
    expect(cmd.input.Item.pk).toBe(`BATCH#${job.batchId}`);
    expect(cmd.input.Item.sk).toBe('META');
  });

  it('initialises roomAnalysisByStyle and conciergeNotesByStyle as empty maps', async () => {
    await createBatchJob(input);
    const cmd = sendMock.mock.calls[0][0];
    expect(cmd.input.Item.roomAnalysisByStyle).toEqual({});
    expect(cmd.input.Item.conciergeNotesByStyle).toEqual({});
  });
});

describe('getBatchJob', () => {
  it('returns null when no item', async () => {
    sendMock.mockResolvedValueOnce({ Item: undefined });
    expect(await getBatchJob('does-not-exist')).toBeNull();
  });

  it('returns the stored record otherwise', async () => {
    const record = { batchId: 'b1', bundle: 'single', total: 2, completed: 1, failed: 0, subJobs: [] };
    sendMock.mockResolvedValueOnce({ Item: record });
    expect(await getBatchJob('b1')).toEqual(record);
  });
});

describe('markSubJobDone', () => {
  it('reads current state, updates variant by jobId, re-derives parent status, ADDs completed with condition', async () => {
    sendMock.mockResolvedValueOnce({
      Item: {
        batchId: 'b1', completed: 0, failed: 0,
        subJobs: [{ style: 'Modern', status: 'pending', variants: [
          { slot: 1, jobId: 'j1', status: 'pending' },
          { slot: 2, jobId: 'j2', status: 'pending' },
          { slot: 3, jobId: 'j3', status: 'pending' },
        ]}],
      },
    });
    sendMock.mockResolvedValueOnce({});
    await markSubJobDone({ batchId: 'b1', jobId: 'j1', stagedS3Key: 's3k', sessionId: 'sess' });
    expect(sendMock).toHaveBeenCalledTimes(2);
    const update = sendMock.mock.calls[1][0];
    expect(update.input.UpdateExpression).toContain('ADD completed :one');
    expect(update.input.UpdateExpression).toContain('SET subJobs = :sj');
    expect(update.input.ConditionExpression).toContain('completed = :oldC');
    const sj = update.input.ExpressionAttributeValues[':sj'];
    // Variant 0 was patched to 'done'; siblings unchanged; parent status stays 'pending' (not all terminal yet).
    expect(sj[0].variants[0].status).toBe('done');
    expect(sj[0].variants[0].stagedS3Key).toBe('s3k');
    expect(sj[0].variants[1].status).toBe('pending');
    expect(sj[0].variants[2].status).toBe('pending');
    expect(sj[0].status).toBe('pending');
  });

  it('rolls parent status up to done when all variants terminal', async () => {
    sendMock.mockResolvedValueOnce({
      Item: {
        batchId: 'b1', completed: 2, failed: 0,
        subJobs: [{ style: 'Modern', status: 'running', variants: [
          { slot: 1, jobId: 'j1', status: 'done', stagedS3Key: 's1' },
          { slot: 2, jobId: 'j2', status: 'done', stagedS3Key: 's2' },
          { slot: 3, jobId: 'j3', status: 'pending' },
        ]}],
      },
    });
    sendMock.mockResolvedValueOnce({});
    await markSubJobDone({ batchId: 'b1', jobId: 'j3', stagedS3Key: 's3', sessionId: 'sess' });
    const sj = sendMock.mock.calls[1][0].input.ExpressionAttributeValues[':sj'];
    expect(sj[0].status).toBe('done');
    expect(sj[0].variants.every((v: { status: string }) => v.status === 'done')).toBe(true);
  });

  it('retries on ConditionalCheckFailedException up to 5 times', async () => {
    const conditionFail = Object.assign(new Error('cond'), { name: 'ConditionalCheckFailedException' });
    const makeItem = () => ({ Item: { batchId: 'b1', completed: 0, failed: 0, subJobs: [{ style: 'Modern', status: 'pending', variants: [{ slot: 1, jobId: 'j1', status: 'pending' }] }] } });
    sendMock.mockResolvedValueOnce(makeItem());
    sendMock.mockRejectedValueOnce(conditionFail);
    sendMock.mockResolvedValueOnce({ Item: { batchId: 'b1', completed: 1, failed: 0, subJobs: [{ style: 'Modern', status: 'pending', variants: [{ slot: 1, jobId: 'j1', status: 'pending' }] }] } });
    sendMock.mockResolvedValueOnce({});
    await markSubJobDone({ batchId: 'b1', jobId: 'j1', stagedS3Key: 's3k', sessionId: 'sess' });
    expect(sendMock).toHaveBeenCalledTimes(4);
  });

  it('throws after exhausting retries on repeated ConditionalCheckFailedException', async () => {
    const conditionFail = Object.assign(new Error('cond'), { name: 'ConditionalCheckFailedException' });
    // 10 attempts × 2 calls each (Get + Update-fail)
    for (let i = 0; i < 10; i++) {
      sendMock.mockResolvedValueOnce({ Item: { batchId: 'b1', completed: 0, failed: 0, subJobs: [{ style: 'Modern', status: 'pending', variants: [{ slot: 1, jobId: 'j1', status: 'pending' }] }] } });
      sendMock.mockRejectedValueOnce(conditionFail);
    }
    await expect(
      markSubJobDone({ batchId: 'b1', jobId: 'j1', stagedS3Key: 's3k', sessionId: 'sess' }),
    ).rejects.toThrow(/exceeded retries/);
    expect(sendMock).toHaveBeenCalledTimes(20);
  });
});

describe('markSubJobError', () => {
  it('marks variant failed_after_retry, ADDs failed without refundedCredits', async () => {
    sendMock.mockResolvedValueOnce({
      Item: {
        batchId: 'b1', completed: 0, failed: 0,
        subJobs: [{ style: 'Modern', status: 'pending', variants: [
          { slot: 1, jobId: 'j1', status: 'pending' },
          { slot: 2, jobId: 'j2', status: 'pending' },
        ]}],
      },
    });
    sendMock.mockResolvedValueOnce({});
    await markSubJobError({ batchId: 'b1', jobId: 'j2', error: 'boom' });
    const update = sendMock.mock.calls[1][0];
    expect(update.input.UpdateExpression).toContain('ADD failed :one');
    // No refundedCredits — partial refunds handled at terminal state.
    expect(update.input.UpdateExpression).not.toContain('refundedCredits');
    const sj = update.input.ExpressionAttributeValues[':sj'];
    expect(sj[0].variants[1].status).toBe('failed_after_retry');
    expect(sj[0].variants[1].error).toBe('boom');
    expect(sj[0].variants[1].retried).toBe(true);
  });

  it('throws when jobId not found in any variant', async () => {
    sendMock.mockResolvedValueOnce({
      Item: {
        batchId: 'b1', completed: 0, failed: 0,
        subJobs: [{ style: 'Modern', status: 'pending', variants: [
          { slot: 1, jobId: 'j1', status: 'pending' },
        ]}],
      },
    });
    await expect(markSubJobError({ batchId: 'b1', jobId: 'nope', error: 'boom' })).rejects.toThrow(/not found/);
  });
});

describe('setRoomAnalysisForStyle', () => {
  it('writes path-targeted update for a single style without clobbering siblings', async () => {
    sendMock.mockResolvedValueOnce({});
    await setRoomAnalysisForStyle({
      batchId: 'b1',
      style: 'Modern',
      analysis: 'analysis text for modern',
      conciergeNotes: ['note one', 'note two'],
    });
    expect(sendMock).toHaveBeenCalledOnce();
    const cmd = sendMock.mock.calls[0][0];
    expect(cmd.input.Key).toEqual({ pk: 'BATCH#b1', sk: 'META' });
    expect(cmd.input.UpdateExpression).toContain('roomAnalysisByStyle.#style = :a');
    expect(cmd.input.UpdateExpression).toContain('conciergeNotesByStyle.#style = :n');
    expect(cmd.input.ExpressionAttributeNames).toEqual({ '#style': 'Modern' });
    expect(cmd.input.ExpressionAttributeValues[':a']).toBe('analysis text for modern');
    expect(cmd.input.ExpressionAttributeValues[':n']).toEqual(['note one', 'note two']);
  });
});

describe('TRIPLE_VARIANTS / Lambda fanOutSiblings drift guard', () => {
  it('slots 2 and 3 in TRIPLE_VARIANTS must match the hardcoded config in lambda/staging-worker/index.mjs', async () => {
    const { TRIPLE_VARIANTS } = await import('@/types');
    const slot2 = TRIPLE_VARIANTS.find((v) => v.slot === 2);
    const slot3 = TRIPLE_VARIANTS.find((v) => v.slot === 3);
    // If this test fails, you ALSO need to update the slotConfig table in
    // lambda/staging-worker/index.mjs (search for "slotConfig").
    expect(slot2).toMatchObject({ provider: 'openai', model: 'gpt-image-2', quality: 'medium' });
    expect(slot3).toMatchObject({ provider: 'openai', model: 'gpt-image-2', quality: 'high' });
  });
});
