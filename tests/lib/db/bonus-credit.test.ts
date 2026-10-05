import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';

// aws-sdk-client-mock intercepts at the class level — every
// DynamoDBDocumentClient instance (including the one created inside
// src/lib/aws/dynamodb.ts) will be mocked.
const ddbMock = mockClient(DynamoDBDocumentClient);

import {
  recordSingleStageCompletion,
  recordBatchSubJobCompletion,
} from '@/lib/db/bonus-credit';

beforeEach(() => {
  ddbMock.reset();
});

describe('recordSingleStageCompletion', () => {
  it('short-circuits if stageCounted already set (idempotent on retry)', async () => {
    ddbMock.on(UpdateCommand).rejectsOnce(
      new ConditionalCheckFailedException({ message: 'already counted', $metadata: {} })
    );
    const result = await recordSingleStageCompletion({
      userId: 'u1',
      stagingPk: 'USER#u1',
      stagingSk: 'STAGING#2026-01-01T00:00:00Z#abc',
    });
    expect(result).toEqual({ bonusGranted: false });
  });

  it('increments counter, no bonus when newCount % 7 !== 0', async () => {
    // 1st call (guard): succeeds
    // 2nd call (increment user): succeeds, returns new count = 3
    ddbMock
      .on(UpdateCommand)
      .resolvesOnce({}) // stage-job guard
      .resolvesOnce({ Attributes: { stagesCompletedTotal: 3 } }); // user increment
    const result = await recordSingleStageCompletion({
      userId: 'u1',
      stagingPk: 'USER#u1',
      stagingSk: 'STAGING#2026-01-01T00:00:00Z#abc',
    });
    expect(result).toEqual({ bonusGranted: false });
    expect(ddbMock.calls()).toHaveLength(2);
  });

  it('grants bonus when newCount crosses a 7-boundary', async () => {
    ddbMock
      .on(UpdateCommand)
      .resolvesOnce({}) // stage-job guard
      .resolvesOnce({ Attributes: { stagesCompletedTotal: 7 } }) // user counter increment
      .resolvesOnce({ Attributes: { creditsRemaining: 9 } }) // user credit grant
      .resolvesOnce({}); // stage-job bonus marker (best-effort)
    const result = await recordSingleStageCompletion({
      userId: 'u1',
      stagingPk: 'USER#u1',
      stagingSk: 'STAGING#2026-01-01T00:00:00Z#abc',
    });
    expect(result).toEqual({
      bonusGranted: true,
      newStageCount: 7,
      newCreditsRemaining: 9,
    });
    expect(ddbMock.calls()).toHaveLength(4);
  });

  it('returns bonusGranted: false if double-grant guard trips', async () => {
    ddbMock
      .on(UpdateCommand)
      .resolvesOnce({}) // stage-job guard
      .resolvesOnce({ Attributes: { stagesCompletedTotal: 7 } }) // counter increment
      .rejectsOnce(
        new ConditionalCheckFailedException({ message: 'already granted', $metadata: {} })
      ); // credit grant guard fails
    const result = await recordSingleStageCompletion({
      userId: 'u1',
      stagingPk: 'USER#u1',
      stagingSk: 'STAGING#2026-01-01T00:00:00Z#abc',
    });
    expect(result).toEqual({ bonusGranted: false });
  });

  it('grants bonus at 14 (second boundary)', async () => {
    ddbMock
      .on(UpdateCommand)
      .resolvesOnce({})
      .resolvesOnce({ Attributes: { stagesCompletedTotal: 14 } })
      .resolvesOnce({ Attributes: { creditsRemaining: 5 } })
      .resolvesOnce({});
    const result = await recordSingleStageCompletion({
      userId: 'u1',
      stagingPk: 'USER#u1',
      stagingSk: 'STAGING#2026-01-01T00:00:00Z#abc',
    });
    expect(result).toEqual({
      bonusGranted: true,
      newStageCount: 14,
      newCreditsRemaining: 5,
    });
  });
});

describe('recordBatchSubJobCompletion', () => {
  it('short-circuits if subJobs[i].stageCounted already set', async () => {
    ddbMock.on(UpdateCommand).rejectsOnce(
      new ConditionalCheckFailedException({ message: 'already counted', $metadata: {} })
    );
    const result = await recordBatchSubJobCompletion({
      userId: 'u1',
      batchId: 'batch1',
      subJobIndex: 0,
    });
    expect(result).toEqual({ bonusGranted: false });
  });

  it('grants bonus at boundary, targets subJobs[i] in DDB path', async () => {
    ddbMock
      .on(UpdateCommand)
      .resolvesOnce({}) // guard on subJobs[2]
      .resolvesOnce({ Attributes: { stagesCompletedTotal: 7 } })
      .resolvesOnce({ Attributes: { creditsRemaining: 4 } })
      .resolvesOnce({}); // subJobs[2] bonus marker
    const result = await recordBatchSubJobCompletion({
      userId: 'u1',
      batchId: 'batch1',
      subJobIndex: 2,
    });
    expect(result).toEqual({
      bonusGranted: true,
      newStageCount: 7,
      newCreditsRemaining: 4,
    });
    // Verify the guard UpdateExpression addressed subJobs[2]
    const guardCall = ddbMock.calls()[0].args[0].input as UpdateCommand['input'];
    expect(guardCall.UpdateExpression).toContain('subJobs[2].stageCounted');
    expect(guardCall.ConditionExpression).toContain('attribute_not_exists(subJobs[2].stageCounted)');
  });
});
