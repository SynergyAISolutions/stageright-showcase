import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { runAnalysis } from '@/lib/ai/run-analysis';
import { getSession } from '@/lib/auth/session';
import { assertKeysAccessible } from '@/lib/auth/s3-ownership';

export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  heroS3Key: z.string(),
  referenceS3Keys: z.array(z.string()).max(3).default([]),
  roomTypes: z.array(z.string()).optional(),
  style: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Please log in.' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const { heroS3Key, referenceS3Keys, roomTypes, style, notes } = parsed.data;

    const access = assertKeysAccessible([heroS3Key, ...referenceS3Keys], session.user);
    if (!access.ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = await runAnalysis({
      heroS3Key,
      referenceS3Keys,
      roomTypes: roomTypes ?? [],
      style,
      notes: notes ?? '',
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('[/api/analyse] Error:', err);
    const message = err instanceof Error ? err.message : 'Analysis failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
