import { refundCreditsIdempotent } from '@/lib/db/users';
import type { BatchJob } from '@/lib/db/batch-jobs';

/**
 * Walk a terminal BatchJob and issue a partial refund for any style where
 * 1 or 2 of 3 variants succeeded. Idempotent on (batchId, style).
 *
 * Refund table (per spec):
 *   3/3 succeed: 0 refund
 *   2/3 succeed: +1 credit
 *   1/3 succeed: +1 credit
 *   0/3 succeed: handled by existing batch-error path, NOT this helper.
 *
 * Returns the count of credits NEWLY refunded by this call (idempotent
 * replays return 0).
 */
export async function applyPartialRefundsForBatch(batch: BatchJob): Promise<number> {
  if (batch.bundle !== 'triple') return 0;

  let totalRefunded = 0;
  for (const sub of batch.subJobs) {
    const variants = sub.variants ?? [];
    if (variants.length === 0) continue;
    const succeeded = variants.filter((v) => v.status === 'done').length;
    const failed = variants.filter((v) => v.status === 'failed_after_retry').length;

    // Only consider styles that have reached terminal state.
    if (succeeded + failed < variants.length) continue;
    // 0/3 succeeded → existing batch error path handles full refund.
    if (succeeded === 0) continue;
    // 3/3 succeeded → no refund.
    if (succeeded === variants.length) continue;

    const result = await refundCreditsIdempotent({
      userId: batch.userId,
      amount: 1,
      action: 'staging_partial_refund',
      idempotencyKey: `${batch.batchId}:${sub.style}`,
    });
    if (result.success && !result.alreadyRefunded) {
      totalRefunded += 1;
    }
  }
  return totalRefunded;
}
