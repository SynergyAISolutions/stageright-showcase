import { NextRequest, NextResponse } from 'next/server';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getSession } from '@/lib/auth/session';
import { getBatchJob, markSubJobError } from '@/lib/db/batch-jobs';
import { getSignedDownloadUrl } from '@/lib/aws/s3';
import { dynamodb, TABLE_NAME } from '@/lib/aws/dynamodb';
import { markFirstStage } from '@/lib/db/first-stage';
import { defaultCoverSlot } from '@/lib/staging/cover-slot';
import { applyPartialRefundsForBatch } from '@/lib/credits/partial-refund';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const batchId = req.nextUrl.searchParams.get('id');
  if (!batchId) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  const batch = await getBatchJob(batchId);
  if (!batch) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (batch.userId !== session.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Stale-batch watchdog: if the batch is older than the window below and any
  // variant is still pending or running, mark them errored so the terminal-
  // state machinery (partial refunds) can fire.
  //
  // CRITICAL: this window MUST exceed the worker Lambda's own max runtime, or
  // it culls variants that are still legitimately rendering. The Lambda timeout
  // is 300s; siblings don't even start until the leader finishes analysis +
  // fan-out (~30-40s in), so a slow GPT Image 2 Full High variant can finish as
  // late as ~340s. The old 3-min (180s) window was SHORTER than the Lambda
  // timeout and was killing valid in-flight variants (observed: 2/9 lost on a
  // run where every variant later proved healthy). 7 min clears 300s + fan-out
  // lead + cold-start margin, so only genuinely-dead variants get culled.
  // Spec: docs/superpowers/specs/2026-05-06-stage-batch-cold-start-design.md.
  const STALE_MS = 7 * 60 * 1000;
  const ageMs = Date.now() - new Date(batch.createdAt).getTime();
  if (ageMs > STALE_MS) {
    const stalePending: { jobId: string }[] = [];
    for (const sub of batch.subJobs) {
      for (const v of sub.variants ?? []) {
        if (v.status === 'pending' || v.status === 'running') {
          stalePending.push({ jobId: v.jobId });
        }
      }
    }
    if (stalePending.length > 0) {
      await Promise.all(
        stalePending.map((v) =>
          markSubJobError({
            batchId: batch.batchId,
            jobId: v.jobId,
            error: `stale-watchdog: batch exceeded ${STALE_MS / (60 * 1000)}min with pending variant`,
          }),
        ),
      );
      // Re-fetch so the rest of the response renders the post-watchdog state
      // (e.g. partial refunds will see the updated counters).
      const refreshed = await getBatchJob(batch.batchId);
      if (refreshed) {
        Object.assign(batch, refreshed);
      }
    }
  }

  const subJobs = await Promise.all(
    batch.subJobs.map(async (s) => {
      const variants = await Promise.all(
        (s.variants ?? []).map(async (v) => ({
          slot: v.slot,
          jobId: v.jobId,
          status: v.status,
          imageUrl: v.stagedS3Key ? await getSignedDownloadUrl(v.stagedS3Key) : undefined,
          s3Key: v.stagedS3Key,
          error: v.error,
          conciergeNotes: v.conciergeNotes ?? [],
        })),
      );

      // Legacy single-image record (no variants[]): synthesise one variant
      // from the deprecated top-level fields. This branch is a safety net —
      // normalizeBatchJob in batch-jobs.ts should already populate variants[].
      if (variants.length === 0 && s.jobId) {
        variants.push({
          slot: 1,
          jobId: s.jobId,
          status: s.status === 'done' ? 'done' : s.status === 'error' ? 'error' : 'pending',
          imageUrl: s.stagedS3Key ? await getSignedDownloadUrl(s.stagedS3Key) : undefined,
          s3Key: s.stagedS3Key,
          error: s.error,
          conciergeNotes: s.conciergeNotes ?? [],
        });
      }

      return {
        style: s.style,
        status: s.status,
        coverSlot: s.coverSlot ?? defaultCoverSlot(variants.map((v) => ({ slot: v.slot, status: v.status }))),
        variants,
        bonusTriggered: s.bonusTriggered ?? false,
        bonusStageCount: s.bonusStageCount,
      };
    }),
  );

  // Terminal once every variant has reported. Use >= (not ===): the counters
  // can briefly overshoot `total` if a variant is counted twice (e.g. the
  // stale-watchdog marks it failed and the real worker then reports it just
  // after the watchdog boundary). A strict === would wedge the batch on "running"
  // forever in that case; >= keeps it terminal once the count is reached. The
  // per-variant idempotency guards (propagateToBatch + mutateSubJob) prevent
  // the overshoot at the source; this is defence in depth.
  const terminal = batch.completed + batch.failed >= batch.total;
  const allFailed = terminal && batch.completed === 0;

  if (terminal && batch.bundle === 'triple') {
    const newlyRefunded = await applyPartialRefundsForBatch(batch);
    if (newlyRefunded > 0) {
      await dynamodb.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { pk: `BATCH#${batch.batchId}`, sk: 'META' },
        UpdateExpression: 'ADD refundedCredits :n SET updatedAt = :now',
        ExpressionAttributeValues: {
          ':n': newlyRefunded,
          ':now': new Date().toISOString(),
        },
      }));
      batch.refundedCredits += newlyRefunded;
    }
  }

  const heroImageUrl = batch.heroS3Key ? await getSignedDownloadUrl(batch.heroS3Key) : undefined;

  // First-stage detection. Only fire when at least one sub-job is done.
  // markFirstStage is idempotent (ConditionalUpdate on attribute_not_exists);
  // only one poll across a user's lifetime ever returns true.
  let isFirstStage = false;
  if (batch.completed > 0) {
    isFirstStage = await markFirstStage(session.user.id);
  }

  return NextResponse.json({
    batchId: batch.batchId,
    bundle: batch.bundle ?? 'single',
    listingId: batch.listingId,
    status: allFailed ? 'error' : terminal ? 'done' : 'running',
    total: batch.total,
    completed: batch.completed,
    failed: batch.failed,
    refundedCredits: batch.refundedCredits,
    heroImageUrl,
    subJobs,
    isFirstStage,
  });
}
