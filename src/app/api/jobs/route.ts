import { NextRequest, NextResponse } from 'next/server';
import { dynamodb, TABLE_NAME } from '@/lib/aws/dynamodb';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { getSession } from '@/lib/auth/session';
import { ADMIN_EMAILS } from '@/types';
import { markFirstStage } from '@/lib/db/first-stage';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Please log in.' }, { status: 401 });
  }

  const jobId = request.nextUrl.searchParams.get('id');
  if (!jobId) {
    return NextResponse.json({ error: 'Missing job ID' }, { status: 400 });
  }

  try {
    const result = await dynamodb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: `JOB#${jobId}`, sk: 'META' },
    }));

    if (!result.Item) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const job = result.Item;
    const isAdmin = ADMIN_EMAILS.includes(session.user.email);
    if (job.userId !== session.user.id && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (job.status === 'done' && job.result) {
      const parsed = JSON.parse(job.result);
      const isFirstStage = await markFirstStage(session.user.id);
      return NextResponse.json({
        status: 'done',
        imageUrl: parsed.signedUrl,
        s3Key: parsed.s3Key,
        text: parsed.text,
        review: parsed.review,
        sessionId: parsed.sessionId,
        provider: parsed.provider ?? job.provider,
        modelId: parsed.modelId ?? job.model,
        quality: parsed.quality ?? job.quality,
        analysisMode: parsed.analysisMode ?? job.analysisMode,
        promptMode: parsed.promptMode ?? job.promptMode,
        comparisonVariantId: parsed.comparisonVariantId ?? job.comparisonVariantId,
        usage: parsed.usage,
        isFirstStage,
        // Bonus-credit flags surfaced by the Lambda after the Staging write.
        bonusTriggered: parsed.bonusTriggered ?? false,
        bonusStageCount: parsed.bonusStageCount,
      });
    }

    if (job.status === 'error') {
      return NextResponse.json({
        status: 'error',
        error: job.error || 'Unknown error',
        provider: job.provider,
        modelId: job.model,
        quality: job.quality,
        analysisMode: job.analysisMode,
        promptMode: job.promptMode,
        comparisonVariantId: job.comparisonVariantId,
      });
    }

    return NextResponse.json({
      status: job.status, // 'pending' or 'running'
      provider: job.provider,
      modelId: job.model,
      quality: job.quality,
      analysisMode: job.analysisMode,
      promptMode: job.promptMode,
      comparisonVariantId: job.comparisonVariantId,
    });
  } catch (err) {
    console.error('[/api/jobs] Error:', err);
    return NextResponse.json({ error: 'Failed to check job' }, { status: 500 });
  }
}
