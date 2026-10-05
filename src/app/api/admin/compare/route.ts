import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ulid } from 'ulid';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { STAGING_STYLES } from '@/lib/ai/prompts';
import { getSession } from '@/lib/auth/session';
import { ADMIN_EMAILS } from '@/types';
import { dynamodb, TABLE_NAME } from '@/lib/aws/dynamodb';
import { invokeStagingWorker } from '@/lib/aws/lambda';
import { runAnalysis } from '@/lib/ai/run-analysis';
import { assertKeysAccessible } from '@/lib/auth/s3-ownership';
import { createCompareRun } from '@/lib/db/compare-runs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const requestSchema = z.object({
  heroS3Key: z.string().min(1),
  referenceS3Keys: z.array(z.string()).optional().default([]),
  roomTypes: z.array(z.string()).min(1),
  styles: z.array(z.enum(STAGING_STYLES as unknown as [string, ...string[]])).min(1).max(12),
  notes: z.string().max(1000).optional().default(''),
});

// The variants we run for every style. Order is significant — it controls
// the column order in the results grid.
const VARIANTS = [
  { id: 'gemini-full', provider: 'gemini' as const, quality: null, analysisMode: 'full' as const, model: 'nano-banana-pro', label: 'Gemini Nano Banana Pro' },
  { id: 'openai-full-low', provider: 'openai' as const, quality: 'low' as const, analysisMode: 'full' as const, model: 'gpt-image-2', label: 'GPT Image 2 · Full Low' },
  { id: 'openai-full-medium', provider: 'openai' as const, quality: 'medium' as const, analysisMode: 'full' as const, model: 'gpt-image-2', label: 'GPT Image 2 · Full Medium' },
  { id: 'openai-full-high', provider: 'openai' as const, quality: 'high' as const, analysisMode: 'full' as const, model: 'gpt-image-2', label: 'GPT Image 2 · Full High' },
  { id: 'openai-lean-medium', provider: 'openai' as const, quality: 'medium' as const, analysisMode: 'lean-direct' as const, model: 'gpt-image-2', label: 'GPT Image 2 · Lean Medium' },
  { id: 'openai-lean-high', provider: 'openai' as const, quality: 'high' as const, analysisMode: 'lean-direct' as const, model: 'gpt-image-2', label: 'GPT Image 2 · Lean High' },
];

function labelForVariant(
  variant: typeof VARIANTS[number],
  promptMode: 'hero-only' | 'spatial-ref',
) {
  if (variant.analysisMode !== 'lean-direct' || promptMode !== 'spatial-ref') {
    return variant.label;
  }
  return `GPT Image 2 · Lean Ref ${variant.quality === 'high' ? 'High' : 'Medium'}`;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Please log in.' }, { status: 401 });
    }
    const isAdmin = ADMIN_EMAILS.includes(session.user.email);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { heroS3Key, referenceS3Keys, roomTypes, styles, notes } = parsed.data;
    const promptMode = referenceS3Keys.length > 0 ? 'spatial-ref' : 'hero-only';

    const access = assertKeysAccessible([heroS3Key, ...referenceS3Keys], session.user);
    if (!access.ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const runId = ulid();
    const startedAt = new Date().toISOString();

    // Run analysis ONCE per style (shared across all 4 variants for that
    // style). This is the whole point of a comparison — same brief, same
    // analysis, different image generators. Running analyses in parallel.
    const analysisResults = await Promise.allSettled(
      styles.map((style) =>
        runAnalysis({
          heroS3Key,
          referenceS3Keys,
          roomTypes,
          style,
          notes,
          useOpus47: true,
        }),
      ),
    );

    const jobs: Array<{
      style: string;
      provider: 'gemini' | 'openai';
      quality: 'low' | 'medium' | 'high' | null;
      analysisMode: 'full' | 'lean-direct';
      promptMode: 'hero-only' | 'spatial-ref';
      label: string;
      jobId: string;
    }> = [];

    // Fan out: for each style, create 4 jobs (one per variant) and invoke
    // the Lambda async. Lambda invocations issued in parallel.
    const dispatches: Array<Promise<unknown>> = [];

    for (let i = 0; i < styles.length; i++) {
      const style = styles[i];
      const analysisRes = analysisResults[i];
      const roomAnalysis =
        analysisRes.status === 'fulfilled' ? analysisRes.value.analysis : '';

      for (const variant of VARIANTS) {
        const jobId = ulid();
        const label = labelForVariant(variant, promptMode);
        jobs.push({
          style,
          provider: variant.provider,
          quality: variant.quality,
          analysisMode: variant.analysisMode,
          promptMode,
          label,
          jobId,
        });

        dispatches.push(
          (async () => {
            await dynamodb.send(new PutCommand({
              TableName: TABLE_NAME,
              Item: {
                pk: `JOB#${jobId}`,
                sk: 'META',
                jobId,
                userId: session.user.id,
                status: 'pending',
                action: 'stage',
                style,
                model: variant.model,
                provider: variant.provider,
                quality: variant.quality,
                analysisMode: variant.analysisMode,
                promptMode,
                comparisonVariantId: variant.id,
                label,
                comparisonId: runId,
                createdAt: startedAt,
                updatedAt: startedAt,
              },
            }));

            await invokeStagingWorker({
              jobId,
              action: 'stage',
              params: {
                userId: session.user.id,
                heroS3Key,
                referenceS3Keys,
                style,
                model: variant.model,
                provider: variant.provider,
                quality: variant.quality,
                analysisMode: variant.analysisMode,
                promptMode,
                comparisonVariantId: variant.id,
                useOpus47: true,
                roomAnalysis: variant.analysisMode === 'lean-direct' ? '' : roomAnalysis,
                roomTypes,
                notes,
                comparisonId: runId,
              },
            });
          })(),
        );
      }
    }

    await Promise.all(dispatches);

    // Persist the run so admin can come back to it later. Done after Lambda
    // dispatches succeed so we don't record a run that never started.
    await createCompareRun({
      runId,
      userId: session.user.id,
      heroS3Key,
      referenceS3Keys,
      roomTypes,
      styles,
      notes,
      jobIds: jobs.map((j) => j.jobId),
      createdAt: startedAt,
    });

    return NextResponse.json({
      runId,
      jobs,
      analysisFailures: analysisResults
        .map((r, i) => (r.status === 'rejected' ? styles[i] : null))
        .filter((s): s is string => Boolean(s)),
    });
  } catch (err) {
    console.error('[/api/admin/compare] Error:', err);
    const message = err instanceof Error ? err.message : 'Comparison run failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
