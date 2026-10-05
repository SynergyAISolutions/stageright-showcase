import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { STAGING_STYLES } from '@/lib/ai/prompts';
import { getSession } from '@/lib/auth/session';
import { deductCredits } from '@/lib/db/users';
import { invokeStagingWorker } from '@/lib/aws/lambda';
import { dynamodb, TABLE_NAME } from '@/lib/aws/dynamodb';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import type { CreditAction } from '@/types';
import { ADMIN_EMAILS } from '@/types';
import { ulid } from 'ulid';
import { assertKeysAccessible } from '@/lib/auth/s3-ownership';
import { getListingById } from '@/lib/db/listings';

export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  imageS3Key: z.string().optional(),
  imageBase64: z.string().optional(),
  imageMimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']).default('image/jpeg'),
  style: z.enum(STAGING_STYLES as unknown as [string, ...string[]]),
  // Client may still send a `model` field for backwards compat, but the
  // server forces Nano Banana Pro for every staging — that's the locked
  // pipeline per project memory. Kept in the schema so legacy clients
  // don't 400, but ignored downstream.
  model: z.enum(['nano-banana-2', 'nano-banana-pro']).default('nano-banana-pro').optional(),
  refinement: z.string().optional(),
  referenceS3Keys: z.array(z.string()).optional(),
  photoIndex: z.number().optional(),
  totalPhotos: z.number().optional(),
  roomAnalysis: z.string().optional(),
  roomTypes: z.array(z.string()).optional(),
  notes: z.string().max(1000).optional(),
  listingId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Please log in.' }, { status: 401 });
    }

    const isAdmin = ADMIN_EMAILS.includes(session.user.email);

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const { style, referenceS3Keys, roomAnalysis, roomTypes, imageS3Key, notes } = parsed.data;
    const rawListingId = parsed.data.listingId;

    const access = assertKeysAccessible([imageS3Key, ...(referenceS3Keys || [])], session.user);
    if (!access.ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let listingId: string | undefined;
    if (rawListingId && rawListingId !== 'unsorted') {
      const owned = await getListingById(session.user.id, rawListingId);
      if (!owned) {
        return NextResponse.json({ error: 'unknown listingId' }, { status: 400 });
      }
      listingId = rawListingId;
    }

    // Everyone is on Nano Banana Pro + Opus 4.7 now — locked pipeline.
    // 1 credit per image regardless of model (no more HD multiplier).
    const forcedModel = 'nano-banana-pro';
    const creditAction: CreditAction = 'staging_standard';
    const creditResult = await deductCredits(session.user.id, creditAction);
    if (!creditResult.success) {
      return NextResponse.json(
        { error: `Not enough credits. Need 1, have ${creditResult.creditsRemaining}.` },
        { status: 402 },
      );
    }

    // Create job in DynamoDB
    const jobId = ulid();
    const now = new Date().toISOString();

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
        model: forcedModel,
        createdAt: now,
        updatedAt: now,
      },
    }));

    // Invoke Lambda async — every request gets NB Pro + Opus 4.7.
    await invokeStagingWorker({
      jobId,
      action: 'stage',
      params: {
        userId: session.user.id,
        heroS3Key: imageS3Key,
        referenceS3Keys: referenceS3Keys || [],
        style,
        model: forcedModel,
        useOpus47: true,
        roomAnalysis: roomAnalysis || '',
        roomTypes: roomTypes || [],
        notes: notes || '',
        applyWatermark: !isAdmin,
        ...(listingId ? { listingId } : {}),
      },
    });

    // Return job ID immediately — client polls for result
    return NextResponse.json({ jobId });
  } catch (err) {
    console.error('[/api/stage] Error:', err);
    const message = err instanceof Error ? err.message : 'Staging failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
