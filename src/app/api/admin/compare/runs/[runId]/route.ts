import { NextResponse } from 'next/server';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { getSession } from '@/lib/auth/session';
import { ADMIN_EMAILS } from '@/types';
import { dynamodb, TABLE_NAME } from '@/lib/aws/dynamodb';
import { getCompareRun } from '@/lib/db/compare-runs';
import { getSignedDownloadUrl } from '@/lib/aws/s3';

export const dynamic = 'force-dynamic';

const VARIANT_LABELS: Record<string, string> = {
  'gemini-full': 'Gemini Nano Banana Pro',
  'openai-full-low': 'GPT Image 2 · Full Low',
  'openai-full-medium': 'GPT Image 2 · Full Medium',
  'openai-full-high': 'GPT Image 2 · Full High',
  'openai-lean-medium': 'GPT Image 2 · Lean Medium',
  'openai-lean-high': 'GPT Image 2 · Lean High',
  'openai-lean-medium-spatial-ref': 'GPT Image 2 · Lean Ref Medium',
  'openai-lean-high-spatial-ref': 'GPT Image 2 · Lean Ref High',
};

function variantKey(provider: string, quality: string | null, analysisMode: string) {
  if (provider === 'gemini') return 'gemini-full';
  return analysisMode === 'lean-direct' ? `openai-lean-${quality}` : `openai-full-${quality}`;
}

export async function GET(
  _request: Request,
  { params }: { params: { runId: string } },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Please log in.' }, { status: 401 });
  }
  if (!ADMIN_EMAILS.includes(session.user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const run = await getCompareRun(params.runId);
    if (!run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }
    if (run.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Hero signed URL — beforeSrc for every slider on the page.
    const heroSignedUrl = await getSignedDownloadUrl(run.heroS3Key, 3600);

    // Pull every job's current state. Resolve in parallel.
    const jobs = await Promise.all(run.jobIds.map(async (jobId) => {
      const r = await dynamodb.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { pk: `JOB#${jobId}`, sk: 'META' },
      }));
      const item = r.Item;
      if (!item) {
        return { jobId, status: 'error' as const, error: 'Job record missing', style: null, provider: null, quality: null, analysisMode: null, promptMode: null, label: null };
      }
      const provider = (item.provider as 'gemini' | 'openai') || 'gemini';
      const quality = (item.quality as 'low' | 'medium' | 'high' | null) ?? null;
      const analysisMode = (item.analysisMode as 'full' | 'lean-direct') || 'full';
      const promptMode = (item.promptMode as 'hero-only' | 'spatial-ref') || 'hero-only';
      const key = variantKey(provider, quality, analysisMode);
      const labelKey = analysisMode === 'lean-direct' && promptMode === 'spatial-ref'
        ? `${key}-spatial-ref`
        : key;
      const label = VARIANT_LABELS[labelKey] || VARIANT_LABELS[key] || key;

      let imageUrl: string | undefined;
      let stagedS3Key: string | undefined;
      let error: string | undefined;
      let status: 'pending' | 'running' | 'done' | 'error' = (item.status as 'pending' | 'running' | 'done' | 'error') || 'pending';

      if (status === 'done' && item.result) {
        try {
          const parsed = JSON.parse(item.result as string);
          stagedS3Key = parsed.s3Key as string | undefined;
          // Re-sign the staged image so it's fresh for the page (Lambda's
          // signedUrl in the result has a 1h TTL — could be stale by now).
          if (stagedS3Key) {
            imageUrl = await getSignedDownloadUrl(stagedS3Key, 3600).catch(() => parsed.signedUrl);
          } else {
            imageUrl = parsed.signedUrl;
          }
        } catch {
          status = 'error';
          error = 'Failed to parse job result';
        }
      }
      if (status === 'error') {
        error = error || (item.error as string) || 'Unknown error';
      }

      return {
        jobId,
        status,
        imageUrl,
        error,
        style: item.style as string | null,
        provider,
        quality,
        analysisMode,
        promptMode,
        label,
      };
    }));

    const promptMode = jobs.some((job) => job.promptMode === 'spatial-ref') ? 'spatial-ref' : 'hero-only';

    return NextResponse.json({
      runId: run.runId,
      createdAt: run.createdAt,
      heroSignedUrl,
      heroS3Key: run.heroS3Key,
      referenceS3Keys: run.referenceS3Keys,
      promptMode,
      roomTypes: run.roomTypes,
      styles: run.styles,
      notes: run.notes,
      jobs,
    });
  } catch (err) {
    console.error('[/api/admin/compare/runs/:id] Error:', err);
    return NextResponse.json({ error: 'Failed to load run' }, { status: 500 });
  }
}
